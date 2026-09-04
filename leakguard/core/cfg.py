from __future__ import annotations

import ast
from dataclasses import dataclass, field
from typing import Protocol

from .ir import Acquire, Alias, CallSite, Escape, Event, Release, Scoped


@dataclass
class BasicBlock:
    id: int
    events: list[Event] = field(default_factory=list)
    line_start: int = 0
    line_end: int = 0
    kind: str = "normal"


@dataclass(frozen=True)
class Edge:
    src: int
    dst: int
    kind: str


@dataclass
class CFG:
    func_name: str
    file: str
    blocks: dict[int, BasicBlock]
    edges: list[Edge]
    entry: int
    exits: list[int]

    def preds(self, b: int) -> list[int]:
        return [edge.src for edge in self.edges if edge.dst == b]

    def succs(self, b: int) -> list[int]:
        return [edge.dst for edge in self.edges if edge.src == b]

    def edge_kind(self, src: int, dst: int) -> str | None:
        return next((edge.kind for edge in self.edges if edge.src == src and edge.dst == dst), None)


class ResourceCatalog(Protocol):
    def match_acquire(self, node: ast.AST) -> str | None: ...

    def is_release(self, resource: str, method: str) -> bool: ...


DEFAULT_RESOURCES = {
    "open": "builtins.file", "io.open": "builtins.file", "codecs.open": "builtins.file",
    "sqlite3.connect": "sqlite3.Connection", "socket.socket": "socket.socket",
    "socket.create_connection": "socket.socket", "subprocess.Popen": "subprocess.Popen",
    "tempfile.NamedTemporaryFile": "tempfile.NamedTemporaryFile",
    "requests.Session": "requests.Session", "urllib.request.urlopen": "urllib.response.addinfourl",
    "zipfile.ZipFile": "zipfile.ZipFile", "tarfile.open": "tarfile.TarFile",
    "multiprocessing.Pool": "multiprocessing.pool.Pool", "shelve.open": "shelve.Shelf",
}


def dotted(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = dotted(node.value)
        return f"{base}.{node.attr}" if base else None
    return None


class DefaultCatalog:
    def __init__(self, aliases: dict[str, str] | None = None):
        self.aliases = aliases or {}

    def resolve(self, name: str | None) -> str | None:
        if not name:
            return None
        head, dot, tail = name.partition(".")
        return self.aliases.get(head, head) + (dot + tail if dot else "")

    def match_acquire(self, node: ast.AST) -> str | None:
        if not isinstance(node, ast.Call):
            return None
        return DEFAULT_RESOURCES.get(self.resolve(dotted(node.func)))

    def is_release(self, resource: str, method: str) -> bool:
        return method in ({"release"} if resource == "threading.Lock" else {"close", "shutdown", "terminate", "kill"})


SAFE_CALLS = {"len", "str", "int", "float", "bool", "isinstance", "print", "append", "add",
              "get", "keys", "values", "items", "range", "enumerate"}


class CFGBuilder(ast.NodeVisitor):
    def __init__(self, func: ast.FunctionDef | ast.AsyncFunctionDef, file: str, catalog: ResourceCatalog,
                 source: str = ""):
        self.func, self.file, self.catalog, self.source = func, file, catalog, source
        self.blocks: dict[int, BasicBlock] = {}
        self.edges: list[Edge] = []
        self._n = 0
        self.exits: list[int] = []
        self.loop_stack: list[tuple[int, int]] = []
        self.handler_stack: list[int | None] = []
        self.finally_stack: list[int] = []
        self.tracked: dict[str, str] = {}
        self.globals: set[str] = set()
        self.entry = self.new_block("entry")
        self.cur: int | None = self.entry
        self.exception_exit = self.new_block("exception_exit")
        self.exits.append(self.exception_exit)

    def new_block(self, kind: str = "normal") -> int:
        bid = self._n
        self._n += 1
        self.blocks[bid] = BasicBlock(bid, kind=kind)
        return bid

    def edge(self, src: int, dst: int, kind: str = "normal") -> None:
        self.edges.append(Edge(src, dst, kind))

    def emit(self, event: Event) -> None:
        assert self.cur is not None
        block = self.blocks[self.cur]
        block.events.append(event)
        line = getattr(event, "line", getattr(event, "start_line", 0))
        block.line_start = block.line_start or line
        block.line_end = max(block.line_end, getattr(event, "end_line", line))

    def build(self) -> CFG:
        self.visit_body(self.func.body)
        if self.cur is not None:
            end = self.new_block("exit")
            self.edge(self.cur, end)
            self.exits.append(end)
        return CFG(self.func.name, self.file, self.blocks, self.edges, self.entry, self.exits)

    def visit_body(self, body: list[ast.stmt]) -> None:
        for stmt in body:
            if self.cur is None:
                break
            block = self.blocks[self.cur]
            block.line_start = block.line_start or stmt.lineno
            block.line_end = max(block.line_end, getattr(stmt, "end_lineno", stmt.lineno))
            self.visit(stmt)

    def _resolve(self, name: str | None) -> str | None:
        resolver = getattr(self.catalog, "resolve", None)
        return resolver(name) if resolver else name

    def _snippet(self, node: ast.AST) -> str:
        return ast.get_source_segment(self.source, node) or "..."

    def _names(self, nodes: list[ast.AST]) -> tuple[str, ...]:
        return tuple(n.id for n in nodes if isinstance(n, ast.Name))

    def _is_release(self, resource: str, method: str) -> bool:
        checker = getattr(self.catalog, "is_release", None)
        if checker:
            return bool(checker(resource, method))
        matcher = getattr(self.catalog, "match_release", None)
        return bool(matcher(resource, method)) if matcher else method in {"close", "release"}

    def record_call(self, node: ast.Call) -> None:
        callee = self._resolve(dotted(node.func)) or "<dynamic>"
        method = callee.rsplit(".", 1)[-1]
        args = self._names(list(node.args))
        # Passing ownership to an unknown callee is an escape. Container methods are explicit escapes.
        if method not in {"close", "shutdown", "release", "terminate", "kill"}:
            kind = "container" if method in {"append", "add", "extend", "insert", "update"} else "call_arg"
            for var in args:
                if var in self.tracked:
                    self.emit(Escape(var, kind, node.lineno, callee))
            for index, arg in enumerate(node.args):
                resource = self.catalog.match_acquire(arg)
                if resource:
                    temp = f"<arg{index}@{node.lineno}>"
                    self.emit(Acquire(temp, resource, node.lineno, arg.col_offset, self._snippet(arg)))
                    self.emit(Escape(temp, kind, node.lineno, callee))
        may_raise = method not in SAFE_CALLS
        self.emit(CallSite(callee, args, node.lineno, may_raise))
        if may_raise and self.cur is not None:
            target = self.handler_stack[-1] if self.handler_stack else self.exception_exit
            nxt = self.new_block()
            self.edge(self.cur, target or self.exception_exit, "exception")
            self.edge(self.cur, nxt, "normal")
            self.cur = nxt

    def visit_expression(self, node: ast.AST | None) -> None:
        """Record calls in evaluation order, including calls nested in conditions."""
        if node is None or self.cur is None:
            return
        for child in ast.iter_child_nodes(node):
            if not isinstance(child, (ast.comprehension, ast.Lambda)):
                self.visit_expression(child)
        if isinstance(node, ast.Call):
            self.record_call(node)

    def visit_Assign(self, node: ast.Assign) -> None:
        if self.cur is None:
            return
        resource = self.catalog.match_acquire(node.value)
        for target in node.targets:
            if resource and isinstance(target, ast.Name):
                self.emit(Acquire(target.id, resource, node.lineno, target.col_offset, self._snippet(node)))
                self.tracked[target.id] = resource
                if target.id in self.globals:
                    self.emit(Escape(target.id, "global", node.lineno, target.id))
            elif resource and isinstance(target, (ast.Attribute, ast.Subscript)):
                temp = f"<store@{node.lineno}>"
                kind = "attribute" if isinstance(target, ast.Attribute) else "container"
                target_name = dotted(target) if isinstance(target, ast.Attribute) else dotted(target.value)
                self.emit(Acquire(temp, resource, node.lineno, target.col_offset, self._snippet(node)))
                self.emit(Escape(temp, kind, node.lineno, target_name))
            elif isinstance(node.value, ast.Name) and node.value.id in self.tracked:
                src = node.value.id
                if isinstance(target, ast.Name):
                    self.emit(Alias(src, target.id, node.lineno))
                    self.tracked[target.id] = self.tracked[src]
                    if target.id in self.globals:
                        self.emit(Escape(src, "global", node.lineno, target.id))
                elif isinstance(target, ast.Attribute):
                    self.emit(Escape(src, "attribute", node.lineno, dotted(target)))
                elif isinstance(target, ast.Subscript):
                    self.emit(Escape(src, "container", node.lineno, dotted(target.value)))
        if isinstance(node.value, ast.Call):
            self.visit_expression(node.value)
        elif not isinstance(node.value, ast.Name):
            self.visit_expression(node.value)

    visit_AnnAssign = lambda self, node: self._visit_annassign(node)

    def _visit_annassign(self, node: ast.AnnAssign) -> None:
        if node.value is not None:
            synthetic = ast.Assign(targets=[node.target], value=node.value)
            ast.copy_location(synthetic, node)
            self.visit_Assign(synthetic)

    def visit_Expr(self, node: ast.Expr) -> None:
        if self.cur is None:
            return
        if isinstance(node.value, ast.Call):
            call = node.value
            if isinstance(call.func, ast.Attribute) and isinstance(call.func.value, ast.Name):
                var, method = call.func.value.id, call.func.attr
                if var in self.tracked and self._is_release(self.tracked[var], method):
                    self.emit(Release(var, node.lineno))
            self.visit_expression(call)
        elif isinstance(node.value, (ast.Yield, ast.YieldFrom)):
            value = node.value.value
            if isinstance(value, ast.Name) and value.id in self.tracked:
                self.emit(Escape(value.id, "yield", node.lineno))

    def visit_Global(self, node: ast.Global) -> None:
        self.globals.update(node.names)

    def visit_Return(self, node: ast.Return) -> None:
        if self.cur is None:
            return
        if isinstance(node.value, ast.Name) and node.value.id in self.tracked:
            self.emit(Escape(node.value.id, "return", node.lineno))
        elif isinstance(node.value, ast.Call):
            resource = self.catalog.match_acquire(node.value)
            if resource:
                temp = f"<return@{node.lineno}>"
                self.emit(Acquire(temp, resource, node.lineno, node.col_offset, self._snippet(node.value)))
                self.emit(Escape(temp, "return", node.lineno))
            self.visit_expression(node.value)
        if self.cur is not None and self.finally_stack:
            self.edge(self.cur, self.finally_stack[-1], "return")
            self.cur = None
        elif self.cur is not None:
            exit_block = self.new_block("exit")
            self.edge(self.cur, exit_block, "return")
            self.exits.append(exit_block)
            self.cur = None

    def visit_If(self, node: ast.If) -> None:
        if self.cur is None: return
        self.visit_expression(node.test)
        if self.cur is None: return
        test = self.cur
        then_b, else_b, after = self.new_block(), self.new_block(), self.new_block()
        self.edge(test, then_b, "true"); self.edge(test, else_b, "false")
        self.cur = then_b; self.visit_body(node.body); then_end = self.cur
        self.cur = else_b; self.visit_body(node.orelse); else_end = self.cur
        if then_end is not None: self.edge(then_end, after)
        if else_end is not None: self.edge(else_end, after)
        self.cur = after if then_end is not None or else_end is not None else None

    def _visit_loop(self, node: ast.While | ast.For | ast.AsyncFor) -> None:
        if self.cur is None: return
        expression = node.test if isinstance(node, ast.While) else node.iter
        self.visit_expression(expression)
        if self.cur is None: return
        header, body, after = self.new_block(), self.new_block(), self.new_block()
        self.edge(self.cur, header); self.edge(header, body, "true"); self.edge(header, after, "false")
        self.loop_stack.append((header, after)); self.cur = body; self.visit_body(node.body)
        if self.cur is not None: self.edge(self.cur, header, "loop_back")
        self.loop_stack.pop(); self.cur = after
        if node.orelse: self.visit_body(node.orelse)

    visit_While = _visit_loop
    visit_For = _visit_loop
    visit_AsyncFor = _visit_loop

    def visit_Break(self, node: ast.Break) -> None:
        if self.cur is not None and self.loop_stack:
            self.edge(self.cur, self.loop_stack[-1][1], "break"); self.cur = None

    def visit_Continue(self, node: ast.Continue) -> None:
        if self.cur is not None and self.loop_stack:
            self.edge(self.cur, self.loop_stack[-1][0], "continue"); self.cur = None

    def visit_Raise(self, node: ast.Raise) -> None:
        if self.cur is not None:
            target = self.finally_stack[-1] if self.finally_stack else (self.handler_stack[-1] if self.handler_stack else self.exception_exit)
            self.edge(self.cur, target or self.exception_exit, "exception"); self.cur = None

    def visit_Try(self, node: ast.Try) -> None:
        if self.cur is None: return
        body_b = self.new_block(); handlers = [self.new_block() for _ in node.handlers]
        final_b = self.new_block() if node.finalbody else None; after = self.new_block()
        self.edge(self.cur, body_b)
        exception_target = handlers[0] if handlers else final_b or self.exception_exit
        self.handler_stack.append(exception_target)
        if final_b is not None: self.finally_stack.append(final_b)
        self.cur = body_b; self.visit_body(node.body)
        if final_b is not None: self.finally_stack.pop()
        self.handler_stack.pop()
        normal_end = self.cur
        if normal_end is not None:
            self.cur = normal_end; self.visit_body(node.orelse)
            if self.cur is not None: self.edge(self.cur, final_b or after)
        for handler, bid in zip(node.handlers, handlers):
            if final_b is not None: self.finally_stack.append(final_b)
            self.cur = bid; self.visit_body(handler.body)
            if final_b is not None: self.finally_stack.pop()
            if self.cur is not None: self.edge(self.cur, final_b or after)
        if final_b is not None:
            self.cur = final_b; self.visit_body(node.finalbody)
            if self.cur is not None: self.edge(self.cur, after)
        self.cur = after

    def _unwrap_context(self, expr: ast.AST) -> ast.AST:
        if isinstance(expr, ast.Call) and dotted(expr.func) in {"contextlib.closing", "closing"} and expr.args:
            return expr.args[0]
        return expr

    def _visit_with(self, node: ast.With | ast.AsyncWith) -> None:
        if self.cur is None: return
        end_line = max((getattr(stmt, "end_lineno", stmt.lineno) for stmt in node.body), default=node.lineno)
        for item in node.items:
            expr = self._unwrap_context(item.context_expr)
            resource = self.catalog.match_acquire(expr)
            if resource and isinstance(item.optional_vars, ast.Name):
                self.tracked[item.optional_vars.id] = resource
                self.emit(Scoped(item.optional_vars.id, resource, node.lineno, end_line))
            if isinstance(item.context_expr, ast.Call): self.visit_expression(item.context_expr)
        self.visit_body(node.body)

    visit_With = _visit_with
    visit_AsyncWith = _visit_with

    def generic_visit(self, node: ast.AST) -> None:
        # Unsupported compound statements remain conservative straight-line blocks.
        if isinstance(node, ast.stmt):
            for child in ast.iter_child_nodes(node):
                if isinstance(child, ast.expr):
                    self.visit_expression(child)


def build_cfg(func: ast.FunctionDef | ast.AsyncFunctionDef, file: str = "<unknown>",
              catalog: ResourceCatalog | None = None, source: str = "",
              aliases: dict[str, str] | None = None) -> CFG:
    """Build a CFG for one function."""

    return CFGBuilder(func, file, catalog or DefaultCatalog(aliases), source).build()

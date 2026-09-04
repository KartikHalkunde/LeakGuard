from leakguard.core.cfg import CFG, BasicBlock, Edge
from leakguard.core.ir import Acquire, Escape, Release


def simple_leak() -> CFG:
    return CFG("f", "fixture.py", {0: BasicBlock(0, [Acquire("conn", "sqlite3.Connection", 2, 4, 'conn = sqlite3.connect("db")')], 2, 2), 1: BasicBlock(1, [], 3, 3, "exit")}, [Edge(0, 1, "return")], 0, [1])


def early_return_leak() -> CFG:
    return CFG("f", "fixture.py", {0: BasicBlock(0, [Acquire("conn", "sqlite3.Connection", 2, 4, "...")], 2, 3), 1: BasicBlock(1, [], 4, 4, "exit"), 2: BasicBlock(2, [Release("conn", 5)], 5, 5), 3: BasicBlock(3, [], 6, 6, "exit")}, [Edge(0, 1, "true"), Edge(0, 2, "false"), Edge(2, 3, "return")], 0, [1, 3])


def escaping_no_leak() -> CFG:
    return CFG("get", "fixture.py", {0: BasicBlock(0, [Acquire("conn", "sqlite3.Connection", 2, 4, "..."), Escape("conn", "return", 3)], 2, 3), 1: BasicBlock(1, [], 3, 3, "exit")}, [Edge(0, 1, "return")], 0, [1])


# LeakGuard limitations

LeakGuard intentionally uses single-module, path-insensitive typestate
analysis. It trades some precision for bounded runtime that is suitable for a
pre-commit hook.

- Resources passed to an unresolved function are reported as `POSSIBLE`; their
  ownership cannot be proven locally.
- Interprocedural summaries cover one module and recognised helper calls only.
  Dynamic dispatch and cross-module ownership transfer are out of scope.
- Resources stored on object attributes, yielded, or put into containers are
  treated as escaped rather than declared leaked.
- Calls that are not in the known-safe set may produce an exception edge. A
  leak reachable only through such an edge is capped at `LIKELY` and never
  blocks under the default threshold.
- Functions over 500 basic blocks yield one `POSSIBLE` analysis note instead
  of risking a slow or non-terminating CI run.
- Fixes cover only a conservative `with` transformation and are offered only
  after the analyzer verifies that the original finding disappears.

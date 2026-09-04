# Decision log

## Phase 1 — bounded CFG analysis

The CFG uses joins rather than path enumeration, keeping runtime bounded at the cost of some precision for mutually exclusive conditions. Resources acquired in a loop and released only after it can therefore become `MAYBE_OPEN`; consumers should report this as `LIKELY`.

## Phase 1 — exception-path confidence

Calls outside a conservative safe-call allowlist receive exception edges. A leak reachable only through an exception edge must be capped at `LIKELY`, never `DEFINITE`, so speculative exceptions do not block CI by default.

## Phase 4 — fixed: `any()` vs `all()` in exception-only capping

`core/confidence.py` capped a resource at `LIKELY` if *any* leaking exit was
exception-kind, instead of only when *every* leaking exit was. This silently
downgraded genuinely unconditional leaks - e.g. two risky calls before a
non-closing return, which leaks on the normal exit regardless of whether
either call happens to raise - from `DEFINITE` to `LIKELY`, contradicting
the exception-path rule above (which only intends to cap leaks that are
*exclusively* reachable via an exception). Fixed to `all()`. Also upgrades
`tests/corpus/leaky/06_decoy_with.py` (the classic trap) from `LIKELY` to
`DEFINITE`, since `conn` leaks on every path where it's actually acquired -
`sqlite3.connect` itself raising doesn't count against it, since on that
path `conn` was never created. Added `tests/corpus/leaky/11_multi_call_unconditional.py`
and a `score()` unit test to lock in the correct behaviour.


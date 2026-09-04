# Decision log

## Phase 1 — bounded CFG analysis

The CFG uses joins rather than path enumeration, keeping runtime bounded at the cost of some precision for mutually exclusive conditions. Resources acquired in a loop and released only after it can therefore become `MAYBE_OPEN`; consumers should report this as `LIKELY`.

## Phase 1 — exception-path confidence

Calls outside a conservative safe-call allowlist receive exception edges. A leak reachable only through an exception edge must be capped at `LIKELY`, never `DEFINITE`, so speculative exceptions do not block CI by default.


# Parser frontend architecture

Phase 1 lowers each Python function independently from the standard-library AST into a stable event IR and a control-flow graph. Basic blocks preserve source locations and ordered events. Branches join explicitly; loops carry back, break, and continue edges; returns terminate reachability; potentially raising calls split blocks and lead to the innermost handler or a dedicated exception exit. Context-managed acquisitions produce `Scoped` events and are safe by construction.

The frontend accepts a resource-catalog protocol instead of importing a concrete loader. This keeps parsing independently testable and lets the catalog remain user-extensible. Imported names are normalized before catalog matching. Dataflow consumers depend only on `ir.py` and `cfg.py`, never on Python AST nodes.


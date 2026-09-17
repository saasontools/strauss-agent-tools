---
"@saasontools/strauss-kb": patch
---

`anchor-update` (MCP `kb_anchor_update`) moves a record's anchors after a
refactor a reader identified: a patch of `replace`, `add` and `remove`
selectors and a required reason, applied inside the store's guarded mutation.
A replaced anchor keeps its hash, hash kind, resolver and baseline metadata, so
the code behind the new pointer still reports drift until `anchor-resolve
--rebaseline` accepts it; nothing here resolves, verifies or moves standing.
The change lands as an `anchor-update` log entry carrying the reason and every
pointer moved — `reason` and `anchors` are new optional fields on the log
entry, so older entries stay readable. `updateAnchors` now also takes a
function computing the anchors from the record's current ones.

---
"@saasontools/strauss-kb": patch
---

`anchor-set` (MCP `kb_anchor_set`) sets a record's anchors after a refactor a
reader identified: the complete new set and a required reason, checked inside
the store's guarded mutation. The set is the caller's and the baselines are the
record's — an anchor keeps its evidence by carrying its `hash` and the rest of
its stamp forward, a hash the record does not hold is refused, and dropping a
stamped anchor needs `dropBaselines`. So the code behind a moved pointer still
reports drift until `anchor-resolve --rebaseline` accepts it; nothing here
resolves, verifies or moves standing.

The change lands as an `anchor-set` log entry carrying the reason and every
pointer that moved, derived from the record before and after. `reason` and
`anchors` are new optional fields on the log entry, and the log's **read**
schema now keeps unknown keys instead of refusing them, so a base written by a
later version stays readable; the write schema stays strict. A reader older
than this release reports `anchor-set` lines as malformed, which is what the
change exists to stop happening again. `updateAnchors` now also takes a
function computing the anchors from the record's current ones.

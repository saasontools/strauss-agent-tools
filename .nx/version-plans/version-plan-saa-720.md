---
"@saasontools/strauss-kb": patch
---

Classify anchor drift as moved, cosmetic, gone or changed, and hand what is
left to a reader as a packet: the record's claim, an old-vs-new span diff, and
its impact set. `kb_reassess`, `kb_doctor --drifted`, a `drifted` count on
`kb_stamp`.

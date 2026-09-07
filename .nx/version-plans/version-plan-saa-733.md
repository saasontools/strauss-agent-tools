---
"@saasontools/strauss-kb": patch
---

A knowledge base written during review dies with the branch, and nothing
carried the records worth keeping into the base that outlives it.
`kb_promote` / `strauss-kb promote` copies chosen records across: they land
`accepted`, the review tags stripped, the pull request recorded as a source,
and both bases logged. `promote --list` names the records usually worth taking.
Separately, `kb_export --format madr` writes a base's decisions out as numbered
MADR files, for a repository that keeps ADRs in-tree; a decision keeps the
number it was first exported under.

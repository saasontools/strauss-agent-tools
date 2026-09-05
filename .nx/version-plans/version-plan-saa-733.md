---
"@saasontools/strauss-kb": patch
---

Promote records from a review base into the base that outlives the pull
request: `kb_promote` copies them accepted, without the review tags, with the
pull request as a source and both bases logged, and `promote --list` names the
candidates. `kb_export --format madr` writes the base's decisions out as
numbered MADR files, stable across re-runs.

---
"@saasontools/strauss-kb": patch
---

Add `kb_stamp` / `strauss-kb stamp`: a base's content digest, counts, and a
digest per record, with no bodies. The plugin's new `PostToolUse` and
`SubagentStop` hooks compare it and say which pinned base to load again after
a `git pull` or a sub-agent's write.

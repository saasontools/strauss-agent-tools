---
"@saasontools/strauss-kb": patch
---

Asking which records sit on a change meant importing the package, so a
reviewer, a CI gate or a desktop client could not ask at all. `kb_match` and
`strauss-kb match` answer it from outside: give them changed files with line
ranges and they return the records anchored to each hunk, current first, with
each record's standing and the anchor that matched. A hunk marked
`side: "old"` numbers the lines the change removed, so records anchored to
deleted code surface too. Symbols are resolved through the package's own
tree-sitter chain unless the caller supplies ranges. The CLI can read a commit
range itself — `match --git <base>..<head>` — or take the same JSON on
`--stdin`.

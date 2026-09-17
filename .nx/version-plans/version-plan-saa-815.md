---
"@saasontools/strauss-kb": patch
---

A base now writes a `.gitignore` block when it is born, excluding
`/.index.sqlite*` — the search index and its SQLite sidecars — for that base
wherever it lives. Written once, at birth, and never again: delete it and it
stays deleted. The block is delimited by `# BEGIN strauss-kb` /
`# END strauss-kb`, and nothing else in the file is read. Best effort, like the
`.gitattributes` step: a file it cannot write never fails the mutation.

`kb-pins.local.json` is not excluded for you. It sits outside every base, and
the only file that could exclude it is committed and shared — the CLI
reference and the specification say where to put the rule instead.

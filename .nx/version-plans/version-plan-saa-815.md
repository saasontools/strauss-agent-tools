---
"@saasontools/strauss-kb": patch
---

A base now writes a `.gitignore` block when it is born, excluding
`/.index.sqlite*` — the search index and its SQLite sidecars — for that base
wherever it lives. The first write of `kb-pins.local.json` writes its own block
into `<workspace>/.strauss/.gitignore`, which a base-level file cannot reach;
the shared `kb-pins.json` stays tracked.

Written once, at birth, and never again: delete either file and it stays
deleted. The block is delimited by `# BEGIN strauss-kb` / `# END strauss-kb`,
and nothing else in the file is read. Best effort, like the `.gitattributes`
step: a file it cannot write never fails the mutation that triggered it.

---
"@saasontools/strauss-kb": patch
---

A base now writes a `.gitignore` block beside `.gitattributes` on its first
write, excluding `/.index.sqlite*` — the search index and its SQLite sidecars —
for that base wherever it lives. A base without the block gains it on the next
write. Writing the local pin layer writes its own block into
`<workspace>/.strauss/.gitignore`, which a base-level file cannot reach; the
shared `kb-pins.json` stays tracked.

The block is delimited by `# BEGIN strauss-kb` / `# END strauss-kb` and written
only when it is not already there, byte for byte. Nothing else in the file is
read. Best effort, like the `.gitattributes` step: a file it cannot write never
fails the mutation that triggered it.

---
"@saasontools/strauss-kb": patch
---

A base now writes `.gitignore` beside `.gitattributes` on its first write,
excluding `/.index.sqlite*` — the search index and its SQLite sidecars — for
that base wherever it lives. A base missing the block gains it on the next
write. Writing the local pin layer writes its own block into
`<workspace>/.strauss/.gitignore`, which a base-level file cannot reach; the
shared `kb-pins.json` stays tracked.

The block is delimited by `# BEGIN strauss-kb` / `# END strauss-kb` and written
only when it is not already there, byte for byte. A rule of your own covering
the same files gets the block written beside it, which git resolves without
complaint; a literal `!` line naming a covered file is left alone and reported.
A declaration file checked in as a symlink is left alone, and `pin --local`
reports a block it could not put in place.

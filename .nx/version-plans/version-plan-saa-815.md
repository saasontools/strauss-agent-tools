---
"@saasontools/strauss-kb": patch
---

A base now writes `.gitignore` beside `.gitattributes` on its first write,
excluding `/.index.sqlite*` — the search index and its SQLite sidecars — for
that base wherever it lives. A base missing the rule gains it on the next
write. Writing the local pin layer writes `/kb-pins.local.json` into
`<workspace>/.strauss/.gitignore`, which a base-level file cannot reach; the
shared `kb-pins.json` stays tracked. An existing rule of your own that already
covers the files, or a `!` negation, is left alone. A pattern
is read as git reads it, and a declaration file checked in as a symlink is
left alone. `pin --local` reports a rule it could not put in place.

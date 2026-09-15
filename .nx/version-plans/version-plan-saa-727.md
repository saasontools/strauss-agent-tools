---
"@saasontools/strauss-kb": patch
---

An anchor could only name a symbol, so a decision about a YAML block or a SQL
migration was pinned to the whole file, and code a change deleted could not be
anchored at all. Two new addresses fix that. `span: { start, end }` names a
line range, hashed as written, for files no resolver can name a symbol in.
`side: "old"` with a `ref` names code as it was at that commit, read from git
history, so a record can point at what a refactor removed; it never drifts,
and a commit this clone lacks reports `ref-unavailable` (unchecked) rather than
gone. `kb_match` keeps old-side and new-side hunks apart, `kb_validate` rejects
an anchor carrying both addresses, and `kb_doctor` counts spans and old-side
anchors.

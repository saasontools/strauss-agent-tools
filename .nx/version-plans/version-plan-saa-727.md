---
"@saasontools/strauss-kb": patch
---

Anchors can name a line range instead of a symbol (`span: { start, end }`), for
files no resolver can name a symbol in, and can name the committed side of a
change (`side: "old"`, read with `git cat-file blob <ref>:<file>`), which is how
deleted code gets anchored at all. `matchToDiff` treats a span as a resolved
range and keeps the two sides apart. New reasons `span-out-of-range` and
`ref-unreadable`, both classed `gone`, and `ref-unavailable` for a rev this
clone lacks, which is unchecked rather than `gone`; `kb_doctor` counts span
anchors in the resolver line and old-side anchors beside it.

---
"@saasontools/strauss-kb": patch
---

Ask which records sit on a change: `kb_match` / `strauss-kb match` takes files
with line ranges — post-change, or `side: "old"` for the half a change removed
— and returns the anchored records per hunk, current first, each with its
standing and the anchor that matched. Symbol ranges resolve through the
package's own tree-sitter chain when the caller has none. The CLI
also reads a range directly — `match --git <base>..<head>` — or the same JSON on
stdin, emitting an old-side hunk wherever the range deleted lines.

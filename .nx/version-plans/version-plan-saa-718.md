---
"@saasontools/strauss-kb": patch
---

Anchor symbols resolve through tree-sitter (TypeScript, TSX, JavaScript, Python, Go, Rust) before the regex heuristic, and each anchor records which resolver stamped it. New reasons: `symbol-ambiguous`, `resolver-unavailable`, and `resolver-changed` drift, which `--rebaseline` accepts.

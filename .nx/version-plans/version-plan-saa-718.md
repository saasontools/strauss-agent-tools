---
"@saasontools/strauss-kb": patch
---

Anchor symbols resolve through tree-sitter (TypeScript, TSX, JavaScript, Python, Go, Rust) before the regex heuristic, and each anchor records which resolver stamped it. New reasons: `symbol-ambiguous`, `resolver-unavailable`, and `resolver-changed` drift, which `--rebaseline` accepts. Grammars are not published with the package — each downloads on first use, verified against the sha256 pinned in `grammars/manifest.json` and cached under `~/.strauss/grammars`; `--offline` or `STRAUSS_KB_GRAMMARS=off` reads the cache only and reports `resolver-unavailable` rather than falling back to regex.

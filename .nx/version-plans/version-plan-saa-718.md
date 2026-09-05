---
"@saasontools/strauss-kb": patch
---

Anchor symbols resolve through tree-sitter — 20 languages, each with its grammar's own upstream definitions query — before the regex heuristic, and each anchor records which resolver stamped it. A symbol its tags query does not define — a constant, a type alias, a class field — falls through to regex and records `resolver: regex`. New reasons: `symbol-ambiguous`, `resolver-unavailable`, and `resolver-changed` drift, which `--rebaseline` accepts. Grammars are not published with the package — each downloads on first use, verified against the sha256 pinned in `grammars/manifest.json` and cached under `~/.strauss/grammars`; `--offline` or `STRAUSS_KB_GRAMMARS=off` reads the cache only and reports `resolver-unavailable` rather than falling back to regex.

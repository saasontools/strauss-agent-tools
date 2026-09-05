---
"@saasontools/strauss-kb": patch
---

Close the gaps the review-companion consumers were working around. A free-text
positional now refuses a leading `--`, and `--help` after any verb prints that
verb's usage instead of recording it. `anchor-resolve` reports at exit 0 like
every other report; `--strict` is the CI gate. Every writing verb and tool
takes `actor` (`--actor kind:name`), overriding `STRAUSS_KB_ACTOR` per call, and
`kb_verify` weighs it the same way. `--json` is accepted on every verb, and
every read that returns a record hands back its full frontmatter through one
projection. `match --include-uncovered` returns every hunk with its enclosing
symbol, so a caller can enumerate the changed symbols nothing covers. New
`telemetry emit` writes a consumer's own event into the same sink, refusing
code content rather than dropping it. A status move now also carries the new
status as the log entry's `target`.

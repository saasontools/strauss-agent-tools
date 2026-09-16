---
"@saasontools/strauss-kb": patch
---

Eight gaps the review-companion consumers were working around. `--help` after a
verb prints that verb's usage instead of being recorded as prose, and the verbs
whose positional is free prose refuse text opening with `--`. `anchor-resolve`
reports at exit 0 like every other report; new `--strict` is the CI gate. Every
writing verb and tool takes `--actor kind:name`, overriding `STRAUSS_KB_ACTOR`
for that call, and `kb_verify` weighs it the same way. `--json` is accepted
wherever the result is already JSON, and every read that returns a record hands
back its full frontmatter through one projection. `match --include-uncovered`
returns a row per changed symbol, so a caller can enumerate what nothing covers.
A status move records the new status as the log entry's `target`.

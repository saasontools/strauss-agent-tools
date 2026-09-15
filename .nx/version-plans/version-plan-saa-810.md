---
"@saasontools/git-guard": patch
"@saasontools/code-diff": patch
"@saasontools/strauss-kb": patch
---

New packages: `@saasontools/git-guard`, the guarded git runner with
`check-attr` and show-at-rev, and `@saasontools/code-diff`, the unified-diff
parser, range reads, changed symbols, file classes and a `.gitattributes`
draft. strauss-kb depends on both; its git reads run through git-guard.

`classify` / `kb_classify` read declarations instead of guessing: a `review:*`
fact, then `.gitattributes` at the base, then a generator banner, then
`source`. The boilerplate line shapes, the rename-similarity rule and the
config, Dockerfile, `.tf` and `LICENSE` path rows are gone; a four-row default
table applies only where the repository declares no class attribute.
`kb_classify` takes `base` (CLI `--base`; `--git` uses the range's base) and
the result may carry `notes`. Both are deprecated and move to
strauss-kb-review. Library: `DEFAULT_THRESHOLDS` and `KbClassifyThresholds` are
removed; `changedSymbolsIn` is new. Every other command answers as before.

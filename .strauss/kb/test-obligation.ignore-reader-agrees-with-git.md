---
type: test-obligation
title: "The reader's answer matches git's, and arrives"
description: >-
  Three review findings share one cause: the reader answered a different
  question from git, or took minutes to answer it. Each now has a case that
  fails on the old code.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-17T18:20:57.281Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: globMatches
    hash: "sha256:7d425393033dca4a6c5836eb66ef47f56d3c8144b72dac6bd98773b7762d98d9"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:04.595Z"
    lines: 28
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-gitignore.git.spec.ts
    hash: "sha256:219acb919353ad06fcc4fd66b4487bc65bdf57fe7b58d2505cace859f77183cf"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:04.598Z"
    lines: 182
strauss_links:
  - target: risk.gitignore-pattern-redos-wedges-every-write
    rel: satisfies
  - target: risk.ignore-reader-trims-leading-whitespace
    rel: satisfies
  - target: risk.check-ignore-helper-reads-a-git-failure-as-not-ignored
    rel: satisfies
strauss_status: open
---

## Obligation

kb-gitignore.spec.ts: a 40-star line is answered in under 100ms; `  *.sqlite*` and `  !.index.sqlite` settle nothing; a trailing-whitespace and CRLF line still settles.

kb-store.spec.ts: `store.write` against a .gitignore holding 18 stars completes in under a second and appends the rule.

kb-gitignore.git.spec.ts: the leading-whitespace line is put to real git and to the reader, and both say the rule is still owed. Its check-ignore helper reads git's exit status — 1 is an answer, anything else is a failure — and passes a `timeout`, so a stuck git fails the suite instead of hanging a worker that vitest cannot interrupt.

## Why it matters

A redundant rule is a harmless error and a missing one is not, so the reader may only fail in the safe direction. The git spec is the only place these rules meet real git; a helper that read every git failure as "not ignored" made each `toBe(false)` pass for the wrong reason.

## How to verify

pnpm vitest run src/kb-gitignore.spec.ts src/kb-gitignore.git.spec.ts src/kb-store.spec.ts

Satisfies [risk.gitignore-pattern-redos-wedges-every-write](risk.gitignore-pattern-redos-wedges-every-write.md).

Satisfies [risk.ignore-reader-trims-leading-whitespace](risk.ignore-reader-trims-leading-whitespace.md).

Satisfies [risk.check-ignore-helper-reads-a-git-failure-as-not-ignored](risk.check-ignore-helper-reads-a-git-failure-as-not-ignored.md).

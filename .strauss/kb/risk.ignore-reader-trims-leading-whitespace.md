---
type: risk
title: "A pattern git treats as dead settles the rule, because the reader trims it"
description: >-
  The base's search index stays trackable while the store reports the rule as
  settled.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T18:11:18.858Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: verdict
    hash: "sha256:eda264e34f00997be293fd11c9f6751a8247744d7d8dba360a48387240cbc706"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:06.509Z"
    lines: 12
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: isSettled
strauss_links:
  - target: decision.kb-ignore-idempotence-by-covered-files
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

isNoise and verdict call line.trim() (kb-gitignore.ts:44, 68). Git keeps leading whitespace as part of the pattern, so `  *.sqlite*` matches nothing there — `printf '  *.sqlite*\n' > .gitignore` then `git check-ignore --no-index .index.sqlite` exits 1 — while missingIgnoreLines(" _.sqlite_\n", BUNDLE_IGNORE_RULES) returns [] and no rule is appended. The same trim reads ` !.index.sqlite` as a negation where git reads a literal, and one "unignore" verdict settles the whole rule.

## Why it matters

The index and its -wal/-shm/-journal sidecars stay trackable, silently: ensureDeclared sees an empty addition and logs nothing. This is the direction kb-gitignore.ts:50-51 rules out — "an unsupported construct fails to match and costs a redundant rule, never a wrong one" — and which decision.kb-ignore-idempotence-by-covered-files repeats in its Rejected section. A redundant line is the safe error; a missing one is not.

## Mitigation

None in the diff. Skip any line whose first character is whitespace, since git gives it no meaning beside these files, and strip only trailing whitespace from the rest.

## Verification

missingIgnoreLines(" _.sqlite_\n", BUNDLE_IGNORE_RULES) returns ["/.index.sqlite*"], and a kb-gitignore.git.spec.ts case pins the parity against check-ignore.

Informs [decision.kb-ignore-idempotence-by-covered-files](decision.kb-ignore-idempotence-by-covered-files.md).

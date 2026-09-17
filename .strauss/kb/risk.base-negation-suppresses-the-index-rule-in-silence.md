---
type: risk
title: >-
  A `!` line in a base's .gitignore suppresses the index rule with nothing
  logged
description: >-
  The pins path now speaks up about a suppressed rule; the base path, which has
  a logger, does not.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-17T18:33:58.130Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: KbStore.ensureDeclared
    hash: "sha256:2bc4a14e63eb792f3420c25eeb4095067f2d8d00176ad0eab93a593b8b36cc4c"
    hash_kind: ast
    resolved_at: "2026-09-17T18:35:06.848Z"
    lines: 68
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: ignoreRuleState
    hash: "sha256:69164de172ce59c24a620fba7434521831fe2a700ec481099ef23232ebf98797"
    hash_kind: ast
    resolved_at: "2026-09-17T18:35:06.852Z"
    lines: 8
    resolver: tree-sitter
strauss_links:
  - target: risk.committed-negation-disables-the-personal-pins-rule
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

ensureDeclared only sees the bytes `append` returns, so `unignored` and `already settled` are the same empty string and neither logs (kb-store.ts:1179-1186 logs only when `addition` is truthy). Reproduced through KbStore.write against a base whose .gitignore holds `!.index.sqlite-wal`: the file is left as-is, `/.index.sqlite*` is never written, and the logger receives no warn and no info. One `!` on any covered name settles the whole rule, so that line also leaves `.index.sqlite` itself trackable.

## Why it matters

Same shape as risk.committed-negation-disables-the-personal-pins-rule, which was fixed for pins alone: a file that arrives with a clone or a pull request decides whether the protection is written, and the user is not told. The blast radius here is smaller — a committed SQLite index derived from records already in the tree, so bloat and merge noise rather than a leak — and unlike the pins layer this path holds a KbLogger it could warn through.

## Mitigation

None in the diff. `ignoreRuleState` already distinguishes the three states; give ensureDeclared a predicate that reports `unignored` and log it under the existing operation name, as the pins path returns it.

## Verification

A kb-store.spec case: write against a base whose .gitignore holds `!.index.sqlite-wal` warns, naming the suppressed pattern.

Informs [risk.committed-negation-disables-the-personal-pins-rule](risk.committed-negation-disables-the-personal-pins-rule.md).

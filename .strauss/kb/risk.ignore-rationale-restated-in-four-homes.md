---
type: risk
title: The "last one wins" rationale for the negation rule now lives in four files
description: One home per fact; four copies will disagree.
tags:
  - review
  - "review:docs"
generated:
  by: "agent:prose"
  at: "2026-09-17T17:58:18.924Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: isSettled
    hash: "sha256:7d64086d80fbff05dcad5e05a0b2b24ceb9a0fcf00c4c0a797c98ef31661ba8a"
    hash_kind: ast
    resolved_at: "2026-09-17T18:00:51.577Z"
    lines: 6
    resolver: tree-sitter
strauss_links:
  - target: decision.kb-ignore-idempotence-by-covered-files
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

decision.kb-ignore-idempotence-by-covered-files carries the rule and its reason. The same reason is restated in apps/strauss-kb-docs/docs/specification.md (the .gitignore section), in the isSettled doc comment in packages/strauss-kb/src/kb-gitignore.ts, and above the negation test in kb-gitignore.spec.ts. The parallel gitattributes copies in kb-gitattributes.ts and kb-store.spec.ts predate the change.

## Why it matters

AGENTS.md puts measurements and rationale in one place, linked. An edit to the rule reaches the record and the spec; the two code copies are the ones that rot unnoticed, and a reader then has two accounts of why a `!` line is left alone.

## Mitigation

Keep the record and the spec section. Cut the reason from the isSettled doc comment to the invariant ("Settled when every covered file is ignored, or when a `!` line un-ignores one") and from the spec comment, leaving the test name to carry it.

## Verification

grep -r "last one wins" over packages/strauss-kb/src returns only the gitattributes copies.

Informs [decision.kb-ignore-idempotence-by-covered-files](decision.kb-ignore-idempotence-by-covered-files.md).

---
type: risk
title: Two survivors still tell a reader that a consumer reads both halves
description: >-
  The rule was reversed in this change; a reader who greps finds the old one
  stated as current.
tags:
  - review
  - "review:docs"
generated:
  by: "agent:prose"
  at: "2026-09-17T21:44:58.573Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/doctor.ts
    symbol: orphaned
    hash: "sha256:9fdfb13f970eb8bb0041af35defaa0ac3c435f5baa0a0305508f43cc3c61e2e1"
    hash_kind: ast
    resolved_at: "2026-09-17T21:48:43.804Z"
    lines: 21
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-references/references.spec.ts
    hash: "sha256:66f717d600267c11a4857f3979c708bf09771972acf92a1de600bd79d74ab723"
    hash_kind: raw
    resolved_at: "2026-09-18T15:31:23.004Z"
    lines: 744
strauss_links:
  - target: decision.strauss-links-is-the-one-representation
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

doctor.ts:364-366 says "Both halves of a reference count, like everywhere else" above orphaned(), which now reads outboundReferences alone. references.spec.ts:405 names its suite describe("doctor reads both halves"). Nothing reads two halves any more: validate.ts is the only body read, and it compares rather than counts.

## Why it matters

A reader adding the next edge consumer follows the comment and parses prose again, which is the defect decision.strauss-links-is-the-one-representation exists to end.

## Mitigation

None taken. doctor.ts: "A record reachable only through a strauss_links pointer is reachable; calling it an island would send a reader to link something already linked." references.spec.ts: describe("doctor's superseded-but-cited").

## Verification

grep -rin "both halves" packages/strauss-kb/src returns only the unrelated git-range and concept-id hits.

Informs [decision.strauss-links-is-the-one-representation](decision.strauss-links-is-the-one-representation.md).

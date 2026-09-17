---
type: risk
title: >-
  The anchor-update rationale is written out in code comments as well as in the
  decision records
description: >-
  A fact with two homes disagrees after the first edit, and the comments are the
  copy nobody rechecks.
tags:
  - review
  - "review:docs"
generated:
  by: "agent:prose"
  at: "2026-09-17T18:06:38.976Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: updateAnchors
    hash: "sha256:a3af337f051a491a29e61ea7534e6cd111db984e1c59631df24862aa7e0276b0"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:11.603Z"
    lines: 30
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/anchor-update/patch.ts
    symbol: applyAnchorPatch
    hash: "sha256:996b5d13e5e55d150774ed7f7b2fd99bf1a46487036ad87dd819e53e134fe238"
    hash_kind: ast
    resolved_at: "2026-09-17T18:45:24.148Z"
    lines: 70
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-record.schema.ts
    symbol: kbAnchorLocatorSchema
    hash: "sha256:9e663a4632124042b2552f6c793c3f0e8fe692e9a67b46db8a47877bf14f9f8a"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:11.610Z"
    lines: 8
    resolver: regex
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

updateAnchors (kb-store.ts), applyAnchorPatch and replacement (patch.ts), kbAnchorLocatorSchema (kb-record.schema.ts), anchorPatchInputSchema (anchor-update/model.ts) and the anchor-update error classes carry 5-16 line doc comments whose rationale is the Rationale/Rejected sections of decision.anchor-update-patch-inside-mutation, decision.anchor-update-selectors-match-original-list, decision.anchor-update-no-cross-boundary-replace and contract.anchor-locator-is-the-address-half-of-an-anchor.

## Why it matters

AGENTS.md caps a code comment at the invariant and four lines, with the why in a KB record. When one of these decisions is revisited, the record moves and the comment stays, and a reader who trusts the comment reads a superseded argument as current.

## Mitigation

None in the diff; the comments and the records were written in the same change and agree today.

## Verification

None. A reviewer reading both surfaces confirmed the overlap; nothing mechanical checks it.

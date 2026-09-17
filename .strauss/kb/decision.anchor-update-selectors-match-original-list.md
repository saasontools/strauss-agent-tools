---
type: decision
title: >-
  Selectors match against the record's anchors, never the list earlier
  operations left
description: >-
  Sequential matching would make the same patch mean two things depending on
  which of replace, remove and add the reader wrote first, and a reader
  describing a refactor has no reason to think about field order.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T17:50:03.052Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/patch.ts
    symbol: applyAnchorPatch
    hash: "sha256:243622d54a08aa6e4f8f8c61f0283fe9c7a0e171138c0defa3d360833c8bec45"
    hash_kind: ast
    resolved_at: "2026-09-17T17:50:44.974Z"
    lines: 64
    resolver: tree-sitter
strauss_status: accepted
---

## Decision

Selectors match against the record's anchors, never the list earlier operations left

## Rationale

Sequential matching would make the same patch mean two things depending on which of replace, remove and add the reader wrote first, and a reader describing a refactor has no reason to think about field order.

## Rejected

Apply replace, then remove, then add against the running list, the way a text patch applies hunks. Rejected: a `remove` of `{file: x}` would stop being ambiguous once a `replace` had moved the second anchor in that file away, so the same JSON would succeed or fail depending on an order nobody stated.

## Impact

Every selector must name exactly one anchor of the record as it stands, and two operations claiming one anchor are a conflict rather than a sequence. Duplicate destinations are checked once, on the finished list, and only where this patch put them.

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

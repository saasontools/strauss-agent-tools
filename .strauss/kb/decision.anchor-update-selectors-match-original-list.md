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
verified:
  - by: "agent:correctness"
    at: "2026-09-17T18:11:21.036Z"
    note: >-
      applyAnchorPatch resolves every selector through selectOne(current, ...)
      and builds the result once at the end; claimed is keyed by index in
      current, so replace-then-remove on one anchor is
      KbAnchorPatchConflictError regardless of field order.
      assertDestinationsAreUnique runs once on the finished list.
  - by: "agent:performance"
    at: "2026-09-17T18:12:45.627Z"
    note: >-
      Read applyAnchorPatch and selectOne: every selector rescans the full
      anchor list, so matching against the record's own anchors costs
      O(selectors x anchors) per call. Bounded by one record's anchors, which do
      not grow with the repository — the widest in this base holds 4. Timed the
      whole command with every anchor replaced: 5.2 ms at 1, 5.7 ms at 10, 12.2
      ms at 100, 27.4 ms at 500, 78.9 ms at 1000, 197.1 ms at 2000. Nothing
      quadratic over records, hunks or files.
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/patch.ts
    symbol: applyAnchorPatch
    hash: "sha256:5a5d3336a3b0cdbfb61f4f7051d013a916332868a6a1fe9a170725d6f3397bb3"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:07.240Z"
    lines: 69
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

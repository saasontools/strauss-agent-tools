---
type: risk
title: >-
  applyAnchorPatch is exported and never parses its patch, so a library caller
  can stamp a hash
description: >-
  A forged hash and resolved_at make a stale record read as freshly resolved
  code nobody hashed.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-17T18:11:15.452Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/patch.ts
    symbol: applyAnchorPatch
    hash: "sha256:5a5d3336a3b0cdbfb61f4f7051d013a916332868a6a1fe9a170725d6f3397bb3"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:12.517Z"
    lines: 69
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/anchor-update/patch.ts
    symbol: replacement
    hash: "sha256:2352ee8e3e543714f4e1f23599cbdf6bd81c50dbbf6037dc834cd8adbb41edc5"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:12.518Z"
    lines: 15
    resolver: tree-sitter
strauss_links:
  - target: contract.anchor-locator-is-the-address-half-of-an-anchor
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

applyAnchorPatch is a public export (src/index.ts re-exports it with anchorPatchInputSchema) and takes AnchorPatchInput as a type, not as a parse. `replacement` spreads `defined(to)` over the anchor and `add` casts `defined(locator) as KbAnchor`, so any key present on the object survives. Ran it against dist/index.js with `to: { hash: "sha256:ff…", resolved_at: "2099-01-01T00:00:00.000Z" }` and an `add` carrying hash/resolver/lines: both landed on the returned anchors. KbStore.updateAnchors then parses with kbAnchorWriteSchema, where hash and resolved_at are legal anchor fields, so nothing downstream refuses them.

## Why it matters

The separation the command exists to enforce — pointers here, baseline acceptance in anchor-resolve --rebaseline — holds only at the CLI and MCP boundary, where anchorPatchInputSchema parses. compose.ts states the opposite convention for this package and re-parses inside composeRecord: "Parsed here rather than trusted from the caller: the CLI validates its own stdin, but a library caller has no such gate." A consumer of @saasontools/strauss-kb that forwards its own untrusted JSON into applyAnchorPatch hands that caller the drift result for the record.

## Mitigation

None in the diff. One line inside applyAnchorPatch — `const patch = anchorPatchInputSchema.parse(input)` — closes it, as composeRecord does.

## Verification

A unit test calling applyAnchorPatch with a hash under `to` and under `add` expects a ZodError, not an anchor.

Informs [contract.anchor-locator-is-the-address-half-of-an-anchor](contract.anchor-locator-is-the-address-half-of-an-anchor.md).

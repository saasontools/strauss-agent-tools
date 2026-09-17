---
type: contract
title: A locator is an anchor's six address fields and nothing a resolver stamps
description: >-
  If a caller could hand a locator a hash, a pointer move would carry a baseline
  the code behind it was never measured against, and the drift check would
  report a match nobody made.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T17:59:36.465Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-record.schema.ts
    symbol: kbAnchorLocatorSchema
    hash: "sha256:9e663a4632124042b2552f6c793c3f0e8fe692e9a67b46db8a47877bf14f9f8a"
    hash_kind: raw
    resolved_at: "2026-09-17T17:59:44.765Z"
    lines: 8
    resolver: regex
  - file: packages/strauss-kb/src/commands/anchor-update/model.ts
    symbol: anchorPatchInputSchema
    hash: "sha256:4b86de14ab6b43cd0afad154c33a47a76f58820f9c9dd317ec752563617c520c"
    hash_kind: raw
    resolved_at: "2026-09-17T17:59:44.768Z"
    lines: 31
    resolver: regex
strauss_status: proposed
---

## Contract

kbAnchorLocatorSchema picks file, symbol, span, side, repo and ref off kbAnchorSchema and stays strict, so hash, hash_kind, lines, resolved_at and resolver are unknown keys under one. anchorPatchInputSchema takes locators for every selector and destination, and the log entry's anchors[] records them.

## Producer

A caller of anchor-update or kb_anchor_update, and the log entry the store writes. The five measured fields stay the resolver's to write.

## Consumer

applyAnchorPatch matches selectors, kb_log readers, and anything reading an anchor-update entry.

## Compatibility

Picked from the anchor schema rather than spelled again, so a locator field added to the anchor becomes a locator here without a second edit. Adding a measured field to the anchor leaves the locator alone, which is the intent.

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

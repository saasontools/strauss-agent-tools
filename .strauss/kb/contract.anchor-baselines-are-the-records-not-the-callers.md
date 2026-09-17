---
type: contract
title: "A caller may move a baseline within a record, never mint one"
description: >-
  If a caller could name the hash an anchor carries, it could declare the code
  it just rewrote as the code someone checked, and the drift report would go
  quiet about the one change worth reading.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T20:11:25.371Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-record.schema.ts
    symbol: kbAnchorLocatorSchema
    hash: "sha256:9e663a4632124042b2552f6c793c3f0e8fe692e9a67b46db8a47877bf14f9f8a"
    hash_kind: raw
    resolved_at: "2026-09-17T20:11:52.105Z"
    lines: 8
    resolver: regex
  - file: packages/strauss-kb/src/commands/anchor-set/apply.ts
    symbol: applyAnchorSet
    hash: "sha256:7f1b0b9841ee7e3f114549a77434b5fb52eb85fbaf0baf4843fffe3ac809aa41"
    hash_kind: ast
    resolved_at: "2026-09-17T20:11:52.112Z"
    lines: 49
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/anchor-set/model.ts
    symbol: anchorSetInputSchema
    hash: "sha256:afd1dcbd33c386999e1e907723a353c1ac8f17a73db6fff29a54a6f39f93bbca"
    hash_kind: raw
    resolved_at: "2026-09-17T20:11:52.113Z"
    lines: 23
    resolver: regex
  - file: packages/strauss-kb/src/commands/anchor-set/errors.ts
    symbol: KbAnchorBaselineError
    hash: "sha256:447a39ba617728a7ff884a7b287040e01b7e64120e7e8f14e49afe910ce22f8f"
    hash_kind: ast
    resolved_at: "2026-09-17T20:11:52.114Z"
    lines: 20
    resolver: tree-sitter
strauss_status: proposed
---

## Contract

anchor-set takes the complete anchor set. Every incoming `hash` must be one the record already holds, with hash_kind, lines, resolved_at and resolver unchanged, and used by at most one anchor; anything else is refused. An anchor with no hash is new. A stamped anchor the set omits is refused unless dropBaselines is passed.

## Producer

A caller of anchor-set or kb_anchor_set, handing back anchors it read. anchor-resolve remains the only writer of a new baseline.

## Consumer

applyAnchorSet, which checks it inside the store's mutation, and the anchor-set log entry derived from the record before and after.

## Compatibility

kbAnchorLocatorSchema is picked from kbAnchorSchema, so a locator field added to the anchor is a locator here too. Adding a measured field means adding it to BASELINE_FIELDS in apply.ts, or it becomes a field a caller can alter freely.

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

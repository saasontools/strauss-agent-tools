---
type: contract
title: "One function decides what anchors a record may hold, given what it holds now"
description: >-
  A record's first write and a later reviewed set disagreeing about where a
  baseline comes from is how a rewritten body gets declared as the body somebody
  checked.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T21:00:53.081Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/anchors/apply.ts
    symbol: applyAnchorSet
    hash: "sha256:bb86c45f14600066cf3643665cb4bebfe2205dff38fcac92c556d25b8db8a88a"
    hash_kind: ast
    resolved_at: "2026-09-17T21:00:58.238Z"
    lines: 56
    resolver: tree-sitter
  - file: packages/strauss-kb/src/anchors/errors.ts
    symbol: KbAnchorBaselineError
    hash: "sha256:447a39ba617728a7ff884a7b287040e01b7e64120e7e8f14e49afe910ce22f8f"
    hash_kind: ast
    resolved_at: "2026-09-17T21:00:58.242Z"
    lines: 20
    resolver: tree-sitter
  - file: packages/strauss-kb/src/compose.ts
    symbol: composeRecord
    hash: "sha256:db0b3af5c38bd99d4a6a1c938ef49d941c36d8af598e3159d0549482ba847971"
    hash_kind: ast
    resolved_at: "2026-09-17T21:00:58.247Z"
    lines: 106
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/anchor-set/model.ts
    symbol: anchorSetInputSchema
    hash: "sha256:afd1dcbd33c386999e1e907723a353c1ac8f17a73db6fff29a54a6f39f93bbca"
    hash_kind: raw
    resolved_at: "2026-09-17T21:00:58.248Z"
    lines: 23
    resolver: regex
  - file: packages/strauss-kb/src/kb-record.schema.ts
    symbol: kbAnchorLocatorSchema
    hash: "sha256:9e663a4632124042b2552f6c793c3f0e8fe692e9a67b46db8a47877bf14f9f8a"
    hash_kind: raw
    resolved_at: "2026-09-17T21:00:58.250Z"
    lines: 8
    resolver: regex
strauss_status: proposed
---

## Contract

applyAnchorSet(conceptId, current, incoming, options) is the only place that answers it. Always: no two anchors at one address, compared through the resolver's own repo normalisation. Without `mint`: every incoming hash must be one `current` already holds, with hash_kind, lines, resolved_at and resolver unchanged, used by at most one anchor; and a stamped anchor the set omits needs `dropBaselines`. An anchor with no hash is new either way.

## Producer

composeRecord at a record's birth, with `mint` and an empty `current` — that write is made about code its author just read. anchor-set inside the store's mutation, without it. anchor-resolve and reassess stamp through updateAnchors and are the measurement itself, not callers of it.

## Consumer

kb_write and kb_anchor_set on both surfaces, and the anchor-set log entry derived from the record before and after.

## Compatibility

kbAnchorLocatorSchema is picked from kbAnchorSchema, so a locator field added to the anchor is a locator here too. Adding a measured field means adding it to BASELINE_FIELDS in anchors/apply.ts, or it becomes a field a caller can alter while carrying a hash.

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

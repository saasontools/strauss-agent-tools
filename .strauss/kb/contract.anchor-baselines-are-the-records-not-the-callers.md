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
    hash: "sha256:a22cf8e03afdcdee5444b39ec5ff987d0b5240a577652c0cebd574ea255ad63c"
    hash_kind: ast
    resolved_at: "2026-09-17T21:27:23.389Z"
    lines: 52
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
    hash: "sha256:65c5d67f87024bbd7aaaeabe5b079fae8b0afae005cbda0525624bfbc93a7278"
    hash_kind: ast
    resolved_at: "2026-09-17T21:27:23.400Z"
    lines: 104
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

applyAnchorSet(conceptId, current, incoming, options) is the only place that answers it. No two anchors at one address, compared through the resolver's own repo normalisation. Every incoming hash must be one `current` already holds, with hash_kind, lines, resolved_at and resolver unchanged, used by at most one anchor. A stamped anchor the set omits needs `dropBaselines`. An anchor with no hash is new.

## Producer

composeRecord at a record's birth and anchor-set inside the store's mutation, under the same rule — birth is not an exception, it just has an empty `current`, so a first write can only ask for addresses. anchor-resolve and reassess stamp through updateAnchors and are the measurement itself, not callers of it.

## Consumer

kb_write and kb_anchor_set on both surfaces, and the anchor-set log entry derived from the record before and after.

## Compatibility

kbAnchorLocatorSchema is picked from kbAnchorSchema, so a locator field added to the anchor is a locator here too. Adding a measured field means adding it to BASELINE_FIELDS in anchors/apply.ts, or it becomes a field a caller can alter while carrying a hash.

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

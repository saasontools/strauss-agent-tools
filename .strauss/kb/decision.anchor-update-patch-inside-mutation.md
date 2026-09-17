---
type: decision
title: anchor-update computes its patch inside the store's guarded mutation
description: >-
  A patch computed from an outside read would resolve its selectors against
  anchors the record no longer holds, and publish the stale array over a
  concurrent edit.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T17:49:50.035Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: updateAnchors
    hash: "sha256:a3af337f051a491a29e61ea7534e6cd111db984e1c59631df24862aa7e0276b0"
    hash_kind: ast
    resolved_at: "2026-09-17T17:50:44.717Z"
    lines: 30
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/anchor-update/command.ts
    symbol: anchorUpdateCommand
    hash: "sha256:d8046f5beceee5a35d0062b554d4fad6be211ef3b51f7a3ae653da13e4ab3c32"
    hash_kind: raw
    resolved_at: "2026-09-17T17:50:44.721Z"
    lines: 53
    resolver: regex
strauss_status: accepted
---

## Decision

anchor-update computes its patch inside the store's guarded mutation

## Rationale

A patch computed from an outside read would resolve its selectors against anchors the record no longer holds, and publish the stale array over a concurrent edit.

## Rejected

Read the anchors, apply the patch, call updateAnchors with the finished array — the shape every other caller uses. Rejected: between the read and the write the record may gain or lose an anchor, and the finished array would erase it silently; the store's digest witness only catches a write that lands inside that window, not one that landed before the read.

## Impact

updateAnchors now takes a function as well as an array, and mutate takes its log entry as a thunk so the entry can describe what the patch actually applied. An array caller — anchor-resolve, reassess — is unchanged and still logs anchor-resolve.

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

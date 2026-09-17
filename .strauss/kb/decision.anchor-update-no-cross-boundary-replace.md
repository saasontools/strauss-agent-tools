---
type: decision
title: "A replacement may not change an anchor's repo, ref or side"
description: >-
  The stored hash travels with the pointer, and a baseline taken over one
  repository's code at one rev says nothing about another's — carrying it across
  would report a match no run ever made.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T17:50:03.216Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/patch.ts
    symbol: replacement
    hash: "sha256:2352ee8e3e543714f4e1f23599cbdf6bd81c50dbbf6037dc834cd8adbb41edc5"
    hash_kind: ast
    resolved_at: "2026-09-17T17:50:45.231Z"
    lines: 15
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/anchor-update/errors.ts
    symbol: KbAnchorBoundaryError
    hash: "sha256:60c0a68ee8239d78fef5afaa2db4689238d35ed685c14932426e50317cd88777"
    hash_kind: ast
    resolved_at: "2026-09-17T17:50:45.235Z"
    lines: 17
    resolver: tree-sitter
strauss_status: accepted
---

## Decision

A replacement may not change an anchor's repo, ref or side

## Rationale

The stored hash travels with the pointer, and a baseline taken over one repository's code at one rev says nothing about another's — carrying it across would report a match no run ever made.

## Rejected

Allow the change and drop the baseline when a boundary field moves. Rejected for the first version: silently clearing a hash is the one thing this command exists not to do, and an explicit remove plus add says the same thing in the caller's own words.

## Impact

Moving an anchor to another repository, rev or side takes two operations in one patch. Both still land in a single guarded write and a single log entry.

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

---
type: requirement
title: >-
  Pointer maintenance, baseline acceptance and verification stay three separate
  acts
description: >-
  One command that moved a pointer and accepted the code would let a refactor's
  behaviour change pass as a rename, which is the drift check's whole purpose.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
  - id: saa-816
    resource: "https://linear.app/saason/issue/SAA-816"
    title: "anchor-resolve stops writing verified[]; a read-only --check for the gate"
generated:
  by: "agent:claude"
  at: "2026-09-17T17:50:25.691Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/command.ts
    symbol: anchorUpdateCommand
    hash: "sha256:d8046f5beceee5a35d0062b554d4fad6be211ef3b51f7a3ae653da13e4ab3c32"
    hash_kind: raw
    resolved_at: "2026-09-17T17:50:45.778Z"
    lines: 53
    resolver: regex
strauss_links:
  - target: test-obligation.anchor-update-keeps-baselines
    rel: verified_by
strauss_status: proposed
---

## Claim

anchor-update writes pointers and an audit entry only. It never resolves, fetches, stamps, rebaselines, verifies or moves standing; accepting the code is anchor-resolve --rebaseline and judging it is verify.

## Evidence

SAA-820 implementation requirement 4, and SAA-816's separation of anchor checking from verification, which this must not reintroduce.

## Implication

A caller that moves a pointer still owes a review pass. The result says so in `baseline: "unchanged"` and its note, so an agent reading only the result knows the next step.

Verified by [test-obligation.anchor-update-keeps-baselines](test-obligation.anchor-update-keeps-baselines.md).

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

[^saa-816]: anchor-resolve stops writing verified[]; a read-only --check for the gate

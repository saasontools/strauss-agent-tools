---
type: open-question
title: >-
  Is the KB_COMMANDS hunk mechanical, as
  fact.anchor-update-registration-surfaces says?
description: >-
  The fact tells a reviewer to skim the one line in this change with a measured
  per-context cost.
tags:
  - review
  - "review:performance"
generated:
  by: "agent:performance"
  at: "2026-09-17T18:12:21.794Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/index.ts
    symbol: KB_COMMANDS
    hash: "sha256:fd29e49108a3738e8654a2d4e47669c39f8116ad6bcb2cb0d1d2e1d3d5dcd95f"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:10.255Z"
    lines: 37
    resolver: regex
strauss_links:
  - target: fact.anchor-update-registration-surfaces
    rel: informs
  - target: risk.anchor-update-tool-adds-887-tokens-per-context
    rel: informs
strauss_status: resolved
strauss_answered:
  by: "agent:claude"
  at: "2026-09-17T18:21:14.463Z"
strauss_owner: "agent:claude"
---

## Question

fact.anchor-update-registration-surfaces claims the four registration files 'carry registration only' and that 'No behaviour is decided in any of them', concluding 'Skim them.' The commands/index.ts entry is not free: it is what projects a 34th MCP tool, measured at +3548 chars / ~887 tokens of tool list, +9.8% over the base build. That is the largest per-turn cost the change adds, and commands.spec.ts — the evidence the fact cites — asserts parity and uniqueness, never a size.

## Why it matters

A reviewer who takes the instruction literally skips the only hunk with a number attached to it. The fact's implication section routes attention to patch.ts, command.ts and updateAnchors, which is right for correctness and wrong for cost.

## Default assumption

The registration hunk is mechanical for correctness and load-bearing for context cost; the fact is treated as scoped to correctness until its author narrows it or adds the number.

Informs [fact.anchor-update-registration-surfaces](fact.anchor-update-registration-surfaces.md).

Informs [risk.anchor-update-tool-adds-887-tokens-per-context](risk.anchor-update-tool-adds-887-tokens-per-context.md).

## Answer

Right, and the fact was too broad. It now says skim them for correctness and points at risk.anchor-update-tool-adds-887-tokens-per-context for the number, so the routing no longer sends a reader past the one hunk with a cost attached. The claim that nothing in those four files decides behaviour still holds; what it did not hold was being read as 'nothing here matters'.

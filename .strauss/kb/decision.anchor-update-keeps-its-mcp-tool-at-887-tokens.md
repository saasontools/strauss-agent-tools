---
type: decision
title: >-
  anchor-update stays an MCP tool, and the 887 tokens are accepted, not
  unnoticed
description: >-
  The measurement is right and the two cheap fixes are not available: SAA-820
  requires the MCP tool, and commands.spec.ts asserts that sync-instructions is
  the only CLI-only verb.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T18:21:57.032Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/model.ts
    symbol: anchorPatchInputSchema
    hash: "sha256:3b84ae1004cf3eba8c29565373279b0a510d65ce24e8d9342fd70538d2236b42"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:09.055Z"
    lines: 31
    resolver: regex
strauss_links:
  - target: risk.anchor-update-tool-adds-887-tokens-per-context
    rel: informs
strauss_status: accepted
---

## Decision

anchor-update stays an MCP tool, and the 887 tokens are accepted, not unnoticed

## Rationale

The measurement is right and the two cheap fixes are not available: SAA-820 requires the MCP tool, and commands.spec.ts asserts that sync-instructions is the only CLI-only verb.

## Rejected

Register it CLI-only with `tool` omitted, as sync-instructions is. Rejected: the issue's deliverable is that an agent on the installed CLI _or_ MCP completes the workflow, so dropping the tool drops half of it.

## Impact

kb_anchor_update is the third-largest tool in the server at 3519 chars (~880 tokens), 3179 of them the input schema: zod inlines kbAnchorLocatorWriteSchema at all four of replace[].from, replace[].to, add[] and remove[]. Measured, z.toJSONSchema with reused: "ref" emits the locator once and the schema falls to 2099 chars — a ~270-token saving that is the MCP SDK's conversion setting, not this command's shape. The risk stays open for whoever owns the server's tool-list budget.

Informs [risk.anchor-update-tool-adds-887-tokens-per-context](risk.anchor-update-tool-adds-887-tokens-per-context.md).

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

---
type: risk
title: >-
  Registering kb_anchor_update grows the MCP tool list by ~887 tokens (+9.8%),
  paid on every context
description: >-
  The tool list is the one cost every turn pays whether or not the tool is
  called, and no record in this change carries a number for it.
tags:
  - review
  - "review:performance"
generated:
  by: "agent:performance"
  at: "2026-09-17T18:12:10.116Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/index.ts
    symbol: KB_COMMANDS
    hash: "sha256:fd29e49108a3738e8654a2d4e47669c39f8116ad6bcb2cb0d1d2e1d3d5dcd95f"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:10.988Z"
    lines: 37
    resolver: regex
  - file: packages/strauss-kb/src/commands/anchor-update/model.ts
    symbol: anchorPatchInputSchema
    hash: "sha256:3b84ae1004cf3eba8c29565373279b0a510d65ce24e8d9342fd70538d2236b42"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:10.990Z"
    lines: 31
    resolver: regex
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

Adding anchorUpdateCommand to KB_COMMANDS registers a 34th MCP tool. Measured against the base build (ef88bc0) and this head, serialising name + description + JSON Schema for every tooled command: 36320 chars (~9080 tokens) at base, 39868 chars (~9967 tokens) at head — +3548 chars, +887 tokens, +9.8% from one tool. It is the third-largest tool in the server after kb_write (~1066) and kb_write_decision (~996). 3208 of those 3548 chars are the input JSON Schema: anchorPatchInputSchema inlines kbAnchorLocatorSchema four times (replace[].from, replace[].to, add[], remove[]) with no $defs reuse, so the six locator fields and the span object are spelled out four times over.

## Why it matters

AGENTS.md sets the ceiling at 800 tokens of descriptions per server. Name + description alone across 34 tools already measures ~2094 tokens, 2.6x over, and this change adds to it. Every agent that connects strauss-kb — including the four reviewers this companion defines — pays the full tool list on every turn, so the cost is per-context, not per-call. It does not show up in any test: commands.spec.ts:59 asserts only a lower bound, description.length > 40, and nothing asserts a ceiling on description length or on the total tool-list payload.

## Mitigation

None in the diff. Cheapest reductions, in order: flatten the patch input so the locator is named once (a $defs-shaped schema, or replace/add/remove carried as one tagged array), or register the verb CLI-only with tool omitted, the way sync-instructions already does. Either way the number belongs in a test.

## Verification

node -e with zod's toJSONSchema over KB_COMMANDS.filter(c => c.tool), summing JSON.stringify({name, description}).length + schema length, run against a build of ef88bc0 and against HEAD. Base 36320 chars / 33 tools; head 39868 chars / 34 tools.

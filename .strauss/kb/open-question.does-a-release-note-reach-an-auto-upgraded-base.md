---
type: open-question
title: >-
  Does risk.unmigrated-base-loses-prose-edges's mitigation reach a plugin user
  whose server upgrades itself?
description: >-
  The risk's whole mitigation is that somebody reads the release note before the
  first sweep.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-18T15:42:15.116Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/sweep.ts
    symbol: holderIndex
  - file: plugins/strauss-kb/.mcp.json
strauss_links:
  - target: risk.unmigrated-base-loses-prose-edges
    rel: informs
strauss_status: resolved
strauss_owner: mcp
strauss_answered:
  by: mcp
  at: "2026-09-18T16:31:39.258Z"
---

## Question

plugins/strauss-kb/.mcp.json launches `@saasontools/strauss-kb@0.x` through npx, so the MCP server moves to this release on its next start with no release note in front of anyone. Nothing in sweep checks for unmirrored citations. The risk rejects gating every read verb, but sweep is the one destructive verb: why not have sweep refuse, or hold every record a body cites, while validate reports a `body_link` warning?

## Why it matters

On the plugin channel the first sweep after the upgrade is the one that deletes, and it is the likeliest to run before anyone reads a note.

## Default assumption

The mitigation does not reach plugin users; the risk stays open until sweep itself guards against an unmigrated base.

Informs [risk.unmigrated-base-loses-prose-edges](risk.unmigrated-base-loses-prose-edges.md).

## Answer

It does not, and the default assumption was right. `plugins/strauss-kb/.mcp.json` launches `@saasontools/strauss-kb@0.x`; the release is 0.2.0 (`major` below 1.0), which `0.x` accepts, so the plugin channel upgrades on its next restart with no note in front of anyone.

Settled by the user, option chosen over pinning the plugin to `0.1.x` or relying on the note: `sweep` now refuses a base with any unmirrored citation or unreadable body, dry run included, with `KbUnmigratedBaseError` naming the records and `mirror-links` as the fix. It refuses rather than holding what a body cites, so prose never becomes an edge inside `sweep`. See decision.prose-is-read-only-to-detect-divergence and test-obligation.sweep-refuses-an-unmigrated-base. The plugin itself moves to 0.3.24.

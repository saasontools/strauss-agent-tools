---
type: risk
title: >-
  The reviewer gate reads mirror-links as a read, so a reviewer may rewrite
  every record's links
description: A new base-wide write verb landed without a line in the gate's write lists.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-18T15:44:37.912Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/mirror-links.ts
    symbol: mirrorLinksCommand
  - file: plugins/strauss-kb-review/hooks/scripts/lib/reviewer.mjs
    symbol: denyReason
strauss_links:
  - target: decision.strauss-links-is-the-one-representation
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

This range adds `mirror-links` (CLI) and `kb_mirror_links` (MCP), which rewrites `strauss_links` on every record through KbStore.updateLinks. The reviewer gate classifies by denylist: WRITE_VERBS and FORBIDDEN_VERBS in plugins/strauss-kb-review/hooks/scripts/lib/reviewer.mjs list `sweep` but not `mirror-links`, and MCP_WRITE ends at `sweep`. Checked with denyReason at HEAD: `strauss-kb mirror-links` and `mcp__strauss-kb__kb_mirror_links` both return null, while `sweep` is denied on both paths. The verb therefore skips the actor check, the load-first check and the validate preflight too.

## Why it matters

A reviewer, or a prompt injected into a record it reads, can reshape records other actors wrote, which the companion reserves to authors and humans; the MCP path lands the edit as actor `mcp` or `unknown`. The damage is bounded to adding `related_to` for citations already in the prose, but the gate's contract is that no reviewer write reshapes the base.

## Mitigation

None in the diff. Add `mirror-links` to WRITE_VERBS and FORBIDDEN_VERBS and `mirror_links` to MCP_WRITE; better, derive the write set from the command registry so the next write verb cannot miss it.

## Verification

node -e with denyReason from lib/reviewer.mjs, reviewer agent:security, loaded=false: Bash `strauss-kb mirror-links` -> null; `mcp__strauss-kb__kb_mirror_links` -> null; `strauss-kb sweep` -> denied.

Informs [decision.strauss-links-is-the-one-representation](decision.strauss-links-is-the-one-representation.md).

---
type: risk
title: anchor-update is a base write the reviewer gate classifies as a read
description: >-
  A reviewer can move another actor's pointers with no actor, no load and a
  failing preflight.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T18:10:31.698Z"
verified: []
strauss_anchors:
  - file: plugins/strauss-kb-review/hooks/scripts/lib/reviewer.mjs
    symbol: WRITE_VERBS
    hash: "sha256:49e47b61a9d51f82a69ab31ade21ea5ff3ac6ab03af20d6aec9e087334a1a2ae"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:12.269Z"
    lines: 18
    resolver: regex
  - file: packages/strauss-kb/src/commands/anchor-update/command.ts
    symbol: anchorUpdateCommand
    hash: "sha256:368d9fff3c057709195f1fb7c35481c51d84a83031771e03146f4cedae66f6df"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:12.273Z"
    lines: 52
    resolver: regex
strauss_status: open
strauss_materiality: blocking
strauss_confidence: high
---

## Risk

WRITE_VERBS in plugins/strauss-kb-review/hooks/scripts/lib/reviewer.mjs lists every verb that changes the base; denyReason returns null for anything outside it ('if (writes.length === 0) return null'). anchor-update is absent, and MCP_WRITE's alternation has no anchor_update. Calling denyReason with command 'strauss-kb anchor-update decision.foo < patch.json', loaded false and a failing preflight returns null; the same call for anchor-resolve returns the actor refusal.

## Why it matters

Three gate rules are skipped for the one new write in this range: the own-actor rule (the CLI then logs by: 'unknown'), load-before-write, and the unvalidated-base preflight. The MCP path is open too, so kb_anchor_update lands as actor 'mcp' where every other write tool is refused outright. The command's whole point is an attributable pointer move, and the gate is what makes attribution hold.

## Mitigation

None in the diff. Add 'anchor-update' to WRITE_VERBS and 'anchor_update' to the MCP_WRITE alternation; decide separately whether a reviewer may move another actor's pointers at all (FORBIDDEN_VERBS, or the status/answer authorship rule).

## Verification

node -e with denyReason({toolName:'Bash', command:'strauss-kb anchor-update decision.foo < patch.json', loaded:false, preflight:()=>'x'}) returns a refusal string, not null.

---
type: risk
title: >-
  anchor-update and kb_anchor_update are base writes the reviewer gate does not
  see
description: >-
  A reviewer can rewrite another actor's record pointers with no actor, no load,
  no validate preflight and no ownership check.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-17T18:10:59.469Z"
verified: []
strauss_anchors:
  - file: plugins/strauss-kb-review/hooks/scripts/lib/reviewer.mjs
    symbol: WRITE_VERBS
    hash: "sha256:49e47b61a9d51f82a69ab31ade21ea5ff3ac6ab03af20d6aec9e087334a1a2ae"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:12.008Z"
    lines: 18
    resolver: regex
  - file: plugins/strauss-kb-review/hooks/scripts/lib/reviewer.mjs
    span:
      start: 47
      end: 48
    hash: "sha256:a3641496d73217cda0111955b25ec9eea6a56ba4a42027870be6f6cee7cf6228"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:12.009Z"
    lines: 2
    resolver: span
  - file: packages/strauss-kb/src/commands/anchor-update/command.ts
    symbol: anchorUpdateCommand
    hash: "sha256:368d9fff3c057709195f1fb7c35481c51d84a83031771e03146f4cedae66f6df"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:12.011Z"
    lines: 52
    resolver: regex
strauss_links:
  - target: requirement.anchor-update-separates-pointer-from-baseline
    rel: informs
strauss_status: open
strauss_materiality: blocking
strauss_confidence: high
---

## Risk

WRITE_VERBS in plugins/strauss-kb-review/hooks/scripts/lib/reviewer.mjs lists fifteen verbs and not anchor-update; MCP_WRITE matches kb_anchor_resolve and not kb_anchor_update. denyReason returns null before any rule runs, because writes.length === 0. Probed against the shipped gate: `strauss-kb anchor-update decision.someone-elses` with no STRAUSS_KB_ACTOR and loaded:false denies nothing, while the same command with `anchor-resolve` denies with "writes carry your own actor"; the MCP tool kb_anchor_update passes where kb_anchor_resolve is refused.

## Why it matters

anchor-update mutates a record's frontmatter under an actor stamp and appends a log entry. Through the gap: the log entry records actor "unknown" (CLI default) or "mcp" (mcp.ts ctx actor), so the audit the reason field exists to serve names nobody; the rule that a reviewer never edits another actor's record is enforced for status and answer but not for the pointers those records rest on; the base-not-loaded and unvalidated-base preflights are skipped. A patch may also `add` an anchor carrying a caller-chosen `repo`, and the next drift run fetches that remote by default (anchor-resolve --offline is opt-out), so a record edit reaches the network from a verb no gate inspected.

## Mitigation

None in the diff: no hunk touches plugins/strauss-kb-review. Add "anchor-update" to WRITE_VERBS and `anchor_update` to the MCP_WRITE alternation, then decide the rule — the ownership test that status and answer get in ruleFor, or FORBIDDEN_VERBS if a reviewer should never move an author's pointers.

## Verification

node -e with denyReason from lib/reviewer.mjs: an anchor-update call with actor null must deny, as anchor-resolve does; the reviewer-gate.spec.mjs case for each.

Informs [requirement.anchor-update-separates-pointer-from-baseline](requirement.anchor-update-separates-pointer-from-baseline.md).

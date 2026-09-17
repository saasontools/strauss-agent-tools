---
type: risk
title: A committed `!kb-pins.local.json` silently keeps personal pins trackable
description: A repository file decides whether a privacy rule is written at all.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-17T18:07:05.193Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: isSettled
  - file: packages/strauss-kb/src/kb-pins/layers.ts
    symbol: ensureLocalPinsIgnored
strauss_links:
  - target: risk.kb-local-pins-ignore-fails-silently
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

isSettled treats a matching `!` line as settled (kb-gitignore.ts:82-87), so a `!kb-pins.local.json` in the workspace's `.strauss/.gitignore` — a committed file, changeable in any pull request — stops ensureLocalPinsIgnored from ever writing the rule. Nothing is logged: that path has no logger by design.

## Why it matters

kb-pins.local.json is the personal layer; its entries are absolute or workspace-relative paths to bases on one contributor's machine. With the rule suppressed, `git add -A` sweeps it in. Small blast radius, but the contributor has no signal that the protection was turned off for them.

## Mitigation

None in the diff. Respecting an explicit negation is decision.kb-ignore-anchored-per-location's intent, so the fix is a signal rather than a behaviour change: carry the suppressed rule in pinBase's existing `warning` field, which also covers risk.kb-local-pins-ignore-fails-silently.

## Verification

Pinning with --local into a workspace whose .strauss/.gitignore holds `!kb-pins.local.json` reports that the rule was left unwritten.

Informs [risk.kb-local-pins-ignore-fails-silently](risk.kb-local-pins-ignore-fails-silently.md).

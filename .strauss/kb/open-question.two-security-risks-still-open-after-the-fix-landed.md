---
type: open-question
title: >-
  Are the two agent:security risks still open on purpose, when their own
  verifications now pass?
description: >-
  merge-policy reads standing; two important risks say 'Mitigation: None in the
  diff' for defects this range closed.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T18:36:58.894Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/patch.ts
    symbol: applyAnchorPatch
    hash: "sha256:996b5d13e5e55d150774ed7f7b2fd99bf1a46487036ad87dd819e53e134fe238"
    hash_kind: ast
    resolved_at: "2026-09-17T18:45:21.495Z"
    lines: 70
    resolver: tree-sitter
  - file: plugins/strauss-kb-review/hooks/scripts/lib/reviewer.mjs
    symbol: WRITE_VERBS
    hash: "sha256:49e47b61a9d51f82a69ab31ade21ea5ff3ac6ab03af20d6aec9e087334a1a2ae"
    hash_kind: raw
    resolved_at: "2026-09-17T18:37:24.743Z"
    lines: 18
    resolver: regex
strauss_links:
  - target: risk.apply-anchor-patch-takes-a-caller-chosen-baseline
    rel: informs
  - target: risk.anchor-update-invisible-to-the-reviewer-gate
    rel: informs
strauss_status: open
strauss_owner: "agent:security"
---

## Question

risk.apply-anchor-patch-takes-a-caller-chosen-baseline asks for 'One line inside applyAnchorPatch — const patch = anchorPatchInputSchema.parse(input)'; patch.ts line 52 is that line, and running applyAnchorPatch from dist with a hash under add or under a replace's to throws 'Unrecognized key: hash'. risk.anchor-update-invisible-to-the-reviewer-gate asks for anchor-update in WRITE_VERBS and anchor_update in MCP_WRITE; reviewer.mjs has both, and denyReason now refuses the unactored CLI call and the MCP tool. The author's e906870 fixed the code and rebaselined both anchors but left strauss_status: open and the 'None in the diff' mitigations in place. Are they held open for something else, or just unsettled?

## Why it matters

A reader of the base sees two open important risks whose bodies describe code that is not there any more; only agent:security or a human can settle them, and only the standing tells a merge whether they are outstanding.

## Default assumption

Both are closed by the diff and the open standing is stale. The three agent:correctness risks in the same batch — replacement-clears-symbol-and-span, repo-identity-not-normalised, not-a-write-verb-in-reviewer-gate — were checked the same way and moved to resolved.

Informs [risk.apply-anchor-patch-takes-a-caller-chosen-baseline](risk.apply-anchor-patch-takes-a-caller-chosen-baseline.md).

Informs [risk.anchor-update-invisible-to-the-reviewer-gate](risk.anchor-update-invisible-to-the-reviewer-gate.md).

---
type: decision
title: >-
  anchor-update joins the reviewer gate's write verbs, and is not forbidden to a
  reviewer
description: >-
  It mutates frontmatter and appends a log entry under an actor stamp; absent
  from WRITE_VERBS the gate returned before any rule ran, so the entry the
  reason field exists to serve named `unknown`.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T18:21:33.205Z"
verified: []
strauss_anchors:
  - file: plugins/strauss-kb-review/hooks/scripts/lib/reviewer.mjs
    symbol: WRITE_VERBS
    hash: "sha256:49e47b61a9d51f82a69ab31ade21ea5ff3ac6ab03af20d6aec9e087334a1a2ae"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:08.788Z"
    lines: 18
    resolver: regex
strauss_links:
  - target: risk.anchor-update-not-a-write-verb-in-reviewer-gate
    rel: informs
  - target: risk.anchor-update-invisible-to-the-reviewer-gate
    rel: informs
strauss_status: accepted
---

## Decision

anchor-update joins the reviewer gate's write verbs, and is not forbidden to a reviewer

## Rationale

It mutates frontmatter and appends a log entry under an actor stamp; absent from WRITE_VERBS the gate returned before any rule ran, so the entry the reason field exists to serve named `unknown`.

## Rejected

Put it in FORBIDDEN_VERBS so only an author moves pointers. Rejected: kb-review already calls narrowing a file-only anchor a mechanical fix a reviewer may make, and anchor-resolve --rebaseline — the same class of write on the same field — is allowed. Forbidding one and allowing the other would be two rules for one act.

## Impact

A reviewer's anchor-update is held to the actor rule, load-before-write and the unvalidated-base preflight, as anchor-resolve is; kb_anchor_update is refused over MCP like every other write tool. No authorship test: moving a pointer is mechanical, unlike status and answer, which settle.

Informs [risk.anchor-update-not-a-write-verb-in-reviewer-gate](risk.anchor-update-not-a-write-verb-in-reviewer-gate.md).

Informs [risk.anchor-update-invisible-to-the-reviewer-gate](risk.anchor-update-invisible-to-the-reviewer-gate.md).

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

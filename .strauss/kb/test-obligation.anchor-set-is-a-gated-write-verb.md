---
type: test-obligation
title: The reviewer gate treats anchor-set as a write on both surfaces
description: >-
  Missing from WRITE_VERBS it was a read: no actor rule, no load-before-write,
  no preflight, and a log entry naming `unknown` — which empties the reason
  field of its point.
tags:
  - review
generated:
  by: "agent:claude"
  at: "2026-09-17T21:03:03.226Z"
verified: []
strauss_anchors:
  - file: plugins/strauss-kb-review/hooks/scripts/lib/reviewer.mjs
    symbol: WRITE_VERBS
    hash: "sha256:d226875f3193b9f9a65aaa54a9048f442fd80f374525990249b0de644e64255b"
    hash_kind: raw
    resolved_at: "2026-09-17T21:03:19.010Z"
    lines: 18
    resolver: regex
  - file: plugins/strauss-kb-review/hooks/scripts/reviewer-gate.spec.mjs
    hash: "sha256:8a4922a1ba8d4c530b175b89dd4c241062a5a35d26983d0b4a1620c074788711"
    hash_kind: raw
    resolved_at: "2026-09-17T21:03:19.014Z"
    lines: 437
strauss_links:
  - target: risk.anchor-set-has-no-authorship-test
    rel: constrains
strauss_status: open
---

## Obligation

denyReason refuses `strauss-kb anchor-set <id>` with no STRAUSS_KB_ACTOR, refuses it with a reviewer actor while the base is unloaded, and refuses the MCP tool kb_anchor_set outright as it does every other write tool. It does not refuse a reviewer setting anchors with its own actor — whether it should is the open half of the risk, and no test covers it.

## Why it matters

The audit trail anchor-set writes is only worth reading if the actor on it is real.

## How to verify

plugins/strauss-kb-review/hooks/scripts/reviewer-gate.spec.mjs — "anchor-set is a write" and the anchor-set case in "a reviewer never decides, settles, or reshapes the base".

Constrains [risk.anchor-set-has-no-authorship-test](risk.anchor-set-has-no-authorship-test.md).

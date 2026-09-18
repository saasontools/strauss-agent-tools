---
type: test-obligation
title: >-
  The reviewer gate treats mirror-links as a write no reviewer makes, on both
  surfaces
description: >-
  A new write verb the gate did not list let a reviewer rewrite every record's
  links with no actor check, load check or validation.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-18T15:52:22.684Z"
verified: []
strauss_anchors:
  - file: plugins/strauss-kb-review/hooks/scripts/lib/reviewer.mjs
    symbol: WRITE_VERBS
strauss_links:
  - target: risk.reviewer-gate-passes-mirror-links
    rel: satisfies
strauss_status: open
---

## Obligation

`plugins/strauss-kb-review/hooks/scripts/lib/reviewer.mjs` lists `mirror-links` in `WRITE_VERBS` and `FORBIDDEN_VERBS`, and `mirror_links` in `MCP_WRITE`. A reviewer's CLI call is denied as not a reviewer's write; any MCP call is denied because it would land as actor `mcp`.

## Why it matters

The migration reshapes the whole base, which is the author's to do once, like `sweep` and `promote`.

## How to verify

`reviewer-gate.spec.mjs` — `mirror-links` under the reviewer's own actor is denied as "not a reviewer's write", and `kb_mirror_links` is denied as an MCP write.

Satisfies [risk.reviewer-gate-passes-mirror-links](risk.reviewer-gate-passes-mirror-links.md).

---
type: open-question
title: >-
  Three surfaces still explain the edge model in terms of body-link, which
  KB_EDGE_KINDS no longer has
description: >-
  test-obligation.the-edge-rule-is-stated-once-per-surface says nothing anywhere
  still states the old rule.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T21:49:04.237Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/trace.ts
    symbol: TRACE_EDGES
  - file: packages/strauss-kb/src/compose.ts
    symbol: composeInputSchema
  - file: apps/strauss-kb-docs/docs/use-cases.md
strauss_links:
  - target: test-obligation.the-edge-rule-is-stated-once-per-surface
    rel: informs
strauss_status: open
strauss_owner: mcp
---

## Question

trace.ts:5-22 introduces TRACE_EDGES as the kb-edges.ts kinds `minus body-link` and spends four lines arguing why body links flood a timeline; trace.ts:41 repeats it on KbTraceOptions.depth. use-cases.md:357 says `Body links and related_to are excluded because they can reach most of a bundle`. compose.ts:59 describes relatedConceptIds as `rendered as body links`, where specification.md:591 now says `stored as related_to links, and rendered as prose`. TRACE_EDGES is now element-for-element equal to KB_EDGE_KINDS, so the comment argues for excluding a kind that does not exist. Was this left for a follow-up, or missed?

## Why it matters

The obligation's own verification grep is what fails: a reader opening trace.ts learns there is a body-link kind and that a walk can choose to exclude it, and compose.ts:59 is the doc on the write input where relatedConceptIds is now stored, not only rendered.

## Default assumption

It was missed. Treated as the obligation being unmet at this head, not as a deliberate scope.

Informs [test-obligation.the-edge-rule-is-stated-once-per-surface](test-obligation.the-edge-rule-is-stated-once-per-surface.md).

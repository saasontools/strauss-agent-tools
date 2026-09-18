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
    hash: "sha256:66ccfd2a229d9481cd0a46690c3b7e43bbde9ab2e4234f104a0bf169259f2627"
    hash_kind: raw
    resolved_at: "2026-09-18T15:28:53.447Z"
    lines: 6
    resolver: regex
  - file: packages/strauss-kb/src/compose.ts
    symbol: composeInputSchema
    hash: "sha256:481626e6349e76d0ed57f8088099d084040e5455712d37ad3ffad05bb52eced8"
    hash_kind: raw
    resolved_at: "2026-09-18T15:28:53.455Z"
    lines: 53
    resolver: regex
  - file: apps/strauss-kb-docs/docs/use-cases.md
    hash: "sha256:562c9a837dfe2f685df85c3b72cbed1214bd2331cf89877bbad7e34c58f4722d"
    hash_kind: raw
    resolved_at: "2026-09-18T15:28:53.455Z"
    lines: 519
strauss_links:
  - target: test-obligation.the-edge-rule-is-stated-once-per-surface
    rel: informs
strauss_status: resolved
strauss_answered:
  by: mcp
  at: "2026-09-18T15:28:14.723Z"
strauss_owner: mcp
---

## Question

trace.ts:5-22 introduces TRACE_EDGES as the kb-edges.ts kinds `minus body-link` and spends four lines arguing why body links flood a timeline; trace.ts:41 repeats it on KbTraceOptions.depth. use-cases.md:357 says `Body links and related_to are excluded because they can reach most of a bundle`. compose.ts:59 describes relatedConceptIds as `rendered as body links`, where specification.md:591 now says `stored as related_to links, and rendered as prose`. TRACE_EDGES is now element-for-element equal to KB_EDGE_KINDS, so the comment argues for excluding a kind that does not exist. Was this left for a follow-up, or missed?

## Why it matters

The obligation's own verification grep is what fails: a reader opening trace.ts learns there is a body-link kind and that a walk can choose to exclude it, and compose.ts:59 is the doc on the write input where relatedConceptIds is now stored, not only rendered.

## Default assumption

It was missed. Treated as the obligation being unmet at this head, not as a deliberate scope.

Informs [test-obligation.the-edge-rule-is-stated-once-per-surface](test-obligation.the-edge-rule-is-stated-once-per-surface.md).

## Answer

Missed, as assumed. Fixed: `trace.ts` no longer describes a `body-link` kind or argues for excluding it — its comment says a trace walks every kb-edges.ts kind narrowed to the causal rels; `KbTraceOptions.depth` no longer blames body links for the bound; `compose.ts` documents `relatedConceptIds` as stored as `related_to` and rendered as prose; `use-cases.md` says `related_to` is excluded, not "body links and `related_to`". `grep -rn "body-link\|body link" packages/strauss-kb/src apps/strauss-kb-docs/docs` now returns nothing.

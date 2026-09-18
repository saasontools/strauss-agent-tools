---
type: open-question
title: >-
  Does every prose renderer bound another record's title, as
  test-obligation.the-reassess-report-means-what-it-says implies?
description: >-
  The risk it satisfies named two renderers and asked for one shared repair; one
  of them was changed.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T21:49:16.337Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/doctor.ts
    symbol: render
  - file: packages/strauss-kb/src/commands/reassess.ts
    symbol: oneLine
strauss_links:
  - target: test-obligation.the-reassess-report-means-what-it-says
    rel: informs
strauss_status: open
strauss_owner: mcp
---

## Question

renderReassess now passes the packet header, `## Still pointing here` and `## Impact` through oneLine(). doctor's group renderer, commands/doctor.ts:246, still interpolates found.title verbatim into `- ${conceptId} — ${title}: ${note}`, and risk.record-title-forges-a-line-in-a-prose-report reproduced the forged bullet there, under `## orphaned (3)` with four bullets. The obligation opens with `Every place the renderer quotes another record's title`, then lists three places, all in reassess. Is doctor out of scope, or unfixed?

## Why it matters

doctor is the command a reviewing agent runs over a whole base, so it quotes more foreign titles than reassess does. The risk's mitigation asked for `one bound-and-strip shared by the prose renderers, not a change to this section`, and half a shared repair leaves the base's only wide reader exposed while a record reads as though it were covered.

## Default assumption

doctor is unfixed and in scope; the risk is treated as open on commands/doctor.ts until a record says otherwise.

Informs [test-obligation.the-reassess-report-means-what-it-says](test-obligation.the-reassess-report-means-what-it-says.md).

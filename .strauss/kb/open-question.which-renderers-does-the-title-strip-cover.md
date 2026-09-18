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
    hash: "sha256:f56495c24f91b472d404b88a623e68890a32420914ae31804d70403b224152de"
    hash_kind: ast
    resolved_at: "2026-09-18T15:28:53.175Z"
    lines: 45
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/model.ts
    symbol: oneLine
    hash: "sha256:0f05680ae784e70293c7690a5722c223abc9c6ac661897679a3652ba199ff13f"
    hash_kind: ast
    resolved_at: "2026-09-18T15:31:23.279Z"
    lines: 9
    resolver: tree-sitter
strauss_links:
  - target: test-obligation.the-reassess-report-means-what-it-says
    rel: informs
strauss_status: resolved
strauss_answered:
  by: mcp
  at: "2026-09-18T15:28:11.182Z"
strauss_owner: mcp
---

## Question

renderReassess now passes the packet header, `## Still pointing here` and `## Impact` through oneLine(). doctor's group renderer, commands/doctor.ts:246, still interpolates found.title verbatim into `- ${conceptId} — ${title}: ${note}`, and risk.record-title-forges-a-line-in-a-prose-report reproduced the forged bullet there, under `## orphaned (3)` with four bullets. The obligation opens with `Every place the renderer quotes another record's title`, then lists three places, all in reassess. Is doctor out of scope, or unfixed?

## Why it matters

doctor is the command a reviewing agent runs over a whole base, so it quotes more foreign titles than reassess does. The risk's mitigation asked for `one bound-and-strip shared by the prose renderers, not a change to this section`, and half a shared repair leaves the base's only wide reader exposed while a record reads as though it were covered.

## Default assumption

doctor is unfixed and in scope; the risk is treated as open on commands/doctor.ts until a record says otherwise.

Informs [test-obligation.the-reassess-report-means-what-it-says](test-obligation.the-reassess-report-means-what-it-says.md).

## Answer

Now two: `reassess` and `doctor`. `oneLine` moved to `commands/model.ts`, shared, and gained a 200-character bound; `doctor`'s group renderer (`commands/doctor.ts`) passes every finding's title through it. `references.spec.ts` asserts `doctor`'s report holds no escape byte and no line beginning with a forged row.

Not covered, and outside this range: `pack` (`commands/pack.ts`, the `### <id> — <title>` header), `promote` (`commands/promote/command.ts`, candidate rows) and `export` (the MADR heading). Same class — a foreign title interpolated into a line-structured report — but none is touched by SAA-821, so they are filed as a follow-up rather than widened into this change.

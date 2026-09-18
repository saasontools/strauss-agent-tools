---
type: open-question
title: >-
  Do the new doc comments fit four lines, as
  test-obligation.the-edge-rule-has-one-home-and-no-survivors says?
description: The obligation's third verification line fails at this head.
tags:
  - review
  - "review:docs"
generated:
  by: "agent:prose"
  at: "2026-09-18T15:35:12.636Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: edgeNeighbours
  - file: packages/strauss-kb/src/commands/reassess.ts
  - file: packages/strauss-kb/src/kb-references/outbound.ts
    symbol: outboundReferences
strauss_links:
  - target: test-obligation.the-edge-rule-has-one-home-and-no-survivors
    rel: informs
strauss_status: resolved
strauss_owner: mcp
strauss_answered:
  by: mcp
  at: "2026-09-18T15:40:16.473Z"
---

## Question

The obligation says no comment in kb-edges.ts, kb-references/outbound.ts or commands/reassess.ts exceeds four lines. kb-edges.ts:84-89 (the typed-link case) is 6, outbound.ts:6-11 is 5 content lines, reassess.ts:102-106 is 5. Outside its list but added here: sweep.ts:174-180 (6), doctor.ts:73-78 (5), stale.ts:69-74 (5), mirror-links.ts:90-95 (5). Was the check run?

## Why it matters

AGENTS.md caps comments at four lines. reassess.ts:102-106 and mirror-links.ts:92-95 argue a point decision.reference-reads-stay-unmemoised and cli-reference.md:804 already hold, so each argument has two homes.

## Default assumption

Not run. The obligation is unmet at this head.

Informs [test-obligation.the-edge-rule-has-one-home-and-no-survivors](test-obligation.the-edge-rule-has-one-home-and-no-survivors.md).

## Answer

It was not run — the obligation claimed a check I had not made. It has been run now, by a script over every comment block that contains a line this range adds, in packages/strauss-kb/src excluding specs.

Trimmed to four lines or fewer: mirror-links.ts `unmirrored`, reassess.ts's impact comment, sweep.ts `holderIndex`, kb-edges.ts's module comment and its typed-link case, outbound.ts `outboundReferences`, stale.ts `liveReferencesTo`, and doctor.ts's `reference` field — which also still said "where the pointer is written", a leftover of the removed origin split. The reassess and mirror-links arguments that already live in decision.reference-reads-stay-unmemoised and cli-reference.md are gone from the comments.

The one block the script still flags, doctor.ts's `drifted` comment, is byte-identical to the base commit; the only lines this range had put in the pre-existing `orphaned` essay are removed.

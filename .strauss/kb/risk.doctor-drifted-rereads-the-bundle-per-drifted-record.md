---
type: risk
title: Only doctor --drifted still re-reads the bundle per record; reassess stopped
description: >-
  The reassess half of the earlier risk is fixed in this range, and its
  mitigation paragraph describes a fix that was not the one taken.
tags:
  - review
  - "review:performance"
generated:
  by: "agent:performance"
  at: "2026-09-17T21:48:23.527Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/doctor.ts
    symbol: doctorCommand
  - file: packages/strauss-kb/src/commands/reassess.ts
    symbol: reassessCommand
strauss_links:
  - target: decision.reference-reads-stay-unmemoised
    rel: informs
strauss_status: open
strauss_supersedes:
  - risk.impact-rereads-the-bundle-the-caller-holds
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

`KbStore.impact(bundlePath, id)` is `impact(id, await this.list(bundlePath))`, and `impact()` runs its own `adjudicate(bundle, bundle)`. `commands/doctor.ts:181` calls it inside the loop over drifted findings — `impact: await store.impact(path, record.conceptId)` — with `records` and a `standings` map in scope ten lines above, so a `doctor --drifted` run reads and adjudicates the whole base once per drifted record, serially. `reassess` no longer does: it calls `impact(id, bundle)` from `kb-links/` over the bundle it already holds, unconditionally once a packet is raised.

## Why it matters

Measured against the built CLI: `store.list` on an on-disk bundle is 5.5 / 14.2 / 47.0 ms at n=100/400/1600 and `adjudicate` adds 0.4 to 13.5 ms over the same range, so twenty drifted records at n=1600 is about 1.2 s of re-reading files already parsed. The `await` is inside the `for`, so the reads are sequential as well as redundant. Not felt at 38 records.

## Mitigation

Not taken, and named as not taken by decision.reference-reads-stay-unmemoised. The repair is the same one already applied to `reassess`: hoist `store.list` (or reuse `records`) above the loop and call `impact(id, records)`. The correction to the superseded record is that `reassess` did not "reduce the incidence by skipping impact when the record has not drifted" — it computes impact whenever a packet is emitted, which is also what closes risk.references-only-packet-reports-no-dependants.

## Verification

Count `readFile` calls in one `doctor --drifted` run on a bundle with k drifted records: one per record in the base, not k per record.

Informs [decision.reference-reads-stay-unmemoised](decision.reference-reads-stay-unmemoised.md).

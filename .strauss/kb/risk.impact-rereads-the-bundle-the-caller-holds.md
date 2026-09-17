---
type: risk
title: store.impact re-reads and re-adjudicates a bundle the caller already has
description: >-
  reassess pays a second full bundle read per run, and doctor --drifted pays one
  per drifted record.
tags:
  - review
  - "review:performance"
generated:
  by: "agent:performance"
  at: "2026-09-17T19:12:00.346Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/reassess.ts
    symbol: reassessCommand
    hash: "sha256:c2ecd7e1f5a759d13d151d3b02ad00c6d25d264615fc9951b839c1d743102097"
    hash_kind: raw
    resolved_at: "2026-09-17T19:20:42.369Z"
    lines: 134
    resolver: regex
strauss_links:
  - target: decision.reassess-references-ride-in-the-packet
    rel: informs
strauss_status: superseded
strauss_materiality: non-blocking
strauss_confidence: high
strauss_superseded_by: risk.doctor-drifted-rereads-the-bundle-per-drifted-record
---

## Risk

`KbStore.impact(bundlePath, id)` is `impact(id, await this.list(bundlePath))`, and `impact()` runs its own `adjudicate(bundle, bundle)`. `reassess` has already called `store.list(path)` and built a standings map by the time it reaches `store.impact(path, id)`, so the drifted path reads and parses every record twice and adjudicates twice. The same call sits inside `doctor --drifted`'s loop over drifted findings, where it is one whole bundle read per drifted record.

## Why it matters

Measured against the built `dist/index.js`: `store.list` on an on-disk bundle is 5.5 ms at n=100, 14.2 ms at n=400 and 47.0 ms at n=1600, and `adjudicate` adds 0.4 to 13.5 ms over the same range. On this base (16 records) that is about 3 ms against a `reassess` run whose `detectDrift` for one record with nine anchors is 60 ms, so it is invisible today. In `doctor --drifted` it is not one cost but one per drifted record: twenty drifted records at n=1600 is about 1.2 s of re-reading the same files.

## Mitigation

None taken; this change reduced the incidence rather than the cost, by skipping `impact` entirely when the record has not drifted. The repair is to call `impact(id, bundle, options)` from `kb-links/` with the bundle already in hand, or to hoist one `store.list` above `doctor --drifted`'s loop.

## Verification

Count `readFile` calls in one `reassess` run on a drifted record: one per record, not two. Time `doctor --drifted` on a bundle with k drifted records and confirm the run does not grow by a bundle read per k.

Informs [decision.reassess-references-ride-in-the-packet](decision.reassess-references-ride-in-the-packet.md).

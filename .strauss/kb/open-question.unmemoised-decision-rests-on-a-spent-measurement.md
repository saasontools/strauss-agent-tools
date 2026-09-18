---
type: open-question
title: >-
  decision.reference-reads-stay-unmemoised rests on a 3-scans measurement the
  same range invalidated
description: >-
  The decision's Decision and Rationale name three body scans and an 18% share;
  at HEAD there is one body scan and neither number describes the code.
tags:
  - review
  - "review:performance"
generated:
  by: "agent:performance"
  at: "2026-09-17T21:49:00.342Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/doctor.ts
    symbol: doctor
  - file: packages/strauss-kb/src/kb-references/outbound.ts
    symbol: outboundReferences
strauss_links:
  - target: decision.reference-reads-stay-unmemoised
    rel: informs
strauss_status: open
strauss_confidence: high
strauss_owner: mcp
---

## Question

decision.reference-reads-stay-unmemoised says `orphaned`, `superseded-but-cited` and `validateBundle` each put the body-citation parser over every record, and rejects memoising on the strength of "two redundant scans are about 18% of a doctor run at 1600 records". Commit fc18672 in this same range moved `orphaned` and `supersededButCited` onto `outboundReferences`, which reads `strauss_links` and never opens the body. One scan remains. Does the decision still stand on the number it cites, and which number is the trade being made against now?

## Why it matters

The decision's whole form is a measured trade, and its Impact points a future reader at two risks for the numbers. Both numbers are now spent: the 18% share described a design that lasted three commits, and agent:correctness's `verified` event at 19:31 asserts the three scans against code that changed at 21:30. A reader crossing the thousands-of-records threshold the record names would go looking for two redundant scans and find one scan and a per-drifted-record bundle read — a different repair. Not a behaviour defect: the direction of the change was to remove the scans, so the record understates its own result.

## Default assumption

The decision's conclusion holds — nothing here is worth a cache — but its measurement is read as history, not as the state of HEAD. The live numbers are in risk.doctor-scans-every-body-once-and-rebuilds-a-map and risk.doctor-drifted-rereads-the-bundle-per-drifted-record, which supersede the two risks the Impact section cites.

Informs [decision.reference-reads-stay-unmemoised](decision.reference-reads-stay-unmemoised.md).

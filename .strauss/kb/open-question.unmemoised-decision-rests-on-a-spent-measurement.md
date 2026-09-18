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
    hash: "sha256:4a819b39db870db270d18eca4ecce6c439c6c1fa05c1356d25cf630be1a19af9"
    hash_kind: ast
    resolved_at: "2026-09-18T15:28:53.812Z"
    lines: 49
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-references/outbound.ts
    symbol: outboundReferences
    hash: "sha256:dc489e146f4ee68b4b8827d5de6b4fa8d897028d3293ca9f758f1d9c60c996b5"
    hash_kind: ast
    resolved_at: "2026-09-18T15:28:53.816Z"
    lines: 13
    resolver: tree-sitter
strauss_links:
  - target: decision.reference-reads-stay-unmemoised
    rel: informs
strauss_status: resolved
strauss_answered:
  by: mcp
  at: "2026-09-18T15:28:19.108Z"
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

## Answer

The default assumption is right: the conclusion holds and the numbers are history. They measured three body scans per `doctor` run; since fc18672 `orphaned` and `superseded-but-cited` read `strauss_links` only, so the one remaining body read is `validateBundle`'s, reached from `doctor` through `brokenSupersession`.

That read changed again after this question was written: it now parses CommonMark (`mdast-util-from-markdown`) instead of matching a pattern, which costs more per body and has no pathological line. Measured against the built CLI on a ten-record base with one hostile record: `validate` is 174 ms with a plain body and 361 ms with a single 125 KB line of 64,000 backtick runs — linear, where the hand-rolled reader took 2,395 ms on the same input.

The live numbers belong to risk.doctor-scans-every-body-once-and-rebuilds-a-map and risk.doctor-drifted-rereads-the-bundle-per-drifted-record, which a reader crossing the threshold should read instead of the two risks the decision's Impact names.

---
type: risk
title: >-
  The reviewer gate CommonMark-parses every record body twice per run, for a
  warning a migrated base never raises
description: >-
  validateBundle now runs bodyCitations over every record, and the gate spawns
  both validate and doctor --strict; at 1600 real-sized records that is about
  0.4 s per process.
tags:
  - review
  - "review:performance"
generated:
  by: "agent:performance"
  at: "2026-09-18T15:43:10.899Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/validate.ts
    symbol: validateBundle
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: bodyCitations
strauss_links:
  - target: decision.body-citations-parse-commonmark
    rel: informs
strauss_status: open
strauss_supersedes:
  - risk.doctor-scans-every-body-once-and-rebuilds-a-map
  - risk.inline-code-stripper-rescans-from-zero
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

`validateBundle` calls `bodyCitations(record)` for every record, and `bodyCitations` runs `fromMarkdown` over the whole body. Nothing checks first whether the body could produce an undeclared citation. The gate's context (`plugins/strauss-kb-review/hooks/scripts/lib/context.mjs`) spawns `validate` and then `doctor --json --strict`, and `doctor` reaches `validateBundle` through `brokenSupersession`, so each gate run parses every body twice, in two processes. The only output is the `body_link` warning, which a base that has run `mirror-links` does not raise.

## Why it matters

Measured in-process on the built dist, over synthetic bundles cloned from this base's own records (about 3 KB bodies): `bodyCitations` over every body takes 114 ms at n=400 and 423 ms at n=1600. `validateBundle` goes from 0.5 to 124 ms at n=400 and from 2.1 to 528 ms at n=1600 (base 986f89e against HEAD). `doctor()` goes from 103 to 529 ms at n=1600, even though the quadratic body-link passes are gone: the parse replaced them as the dominant cost. The CLI `validate` median goes from 358 to 895 ms at n=1600. On this base (about 60 records) it adds about 50 ms per verb. decision.body-citations-parse-commonmark gives the bundle size and no runtime number. risk.doctor-scans-every-body-once-and-rebuilds-a-map gave 367 ms for a whole `doctor` at n=1600, measured on 1.2 KB bodies before the parser landed. That number no longer holds. The pathological case is fixed: a 125 KB line of 64,000 backtick runs costs +253 ms and 128,000 runs cost +488 ms, which is linear, where the hand-rolled reader took 2.4 s.

## Mitigation

None in the diff. The fix is to check cheaply first. Every inline link contains `](`, so parse a body only when some `](` is not directly followed by `<declared-or-self-id>.md` and then `)` or a space. An angle bracket, an entity, an escape or any other URL sends the body to the parser, so the check can only skip a body, never change the result. Measured on the same n=1600 bundle: 84 of 1600 bodies still parse, the pass drops from 384 ms to 20.5 ms, and the warning set is identical. The bundle adds about 190 KB (the chunk grows from 296.6 KB to 486.4 KB). Import time did not change measurably (median 242 vs 248 ms), so startup is not the cost.

## Verification

Time `validateBundle` in-process on a migrated bundle of 1600 records with bodies of about 3 KB. It should be within a few ms of the base commit's 2 ms plus the prefilter, not 500 ms. The `body_link` warnings on an unmigrated bundle should be identical with and without the prefilter.

Informs [decision.body-citations-parse-commonmark](decision.body-citations-parse-commonmark.md).

---
type: risk
title: >-
  doctor now scans every body once, not three times — the measurement that says
  otherwise is spent
description: >-
  Two of the three scans became frontmatter reads in this range; the surviving
  cost is one body scan and a rebuilt byId map.
tags:
  - review
  - "review:performance"
generated:
  by: "agent:performance"
  at: "2026-09-17T21:48:07.336Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/doctor.ts
    symbol: orphaned
  - file: packages/strauss-kb/src/doctor.ts
    symbol: supersededButCited
  - file: packages/strauss-kb/src/kb-references/stale.ts
    symbol: staleReferences
strauss_links:
  - target: decision.strauss-links-is-the-one-representation
    rel: informs
strauss_status: superseded
strauss_supersedes:
  - risk.doctor-rescans-every-body-three-times
strauss_materiality: non-blocking
strauss_confidence: high
strauss_superseded_by: risk.gate-parses-every-body-as-commonmark-twice
---

## Risk

The count in the superseded record is no longer what `doctor` does. At HEAD `orphaned` and `supersededButCited` reach `outboundReferences`, which reads `strauss_links` and never touches the body; only `brokenSupersession` -> `validateBundle` -> `bodyCitations` puts a parser over every record, once. What is left unshared is smaller and different: `staleReferences` rebuilds a `byId` map `doctor` already holds, and `reassess` builds a second one inside `referenceReview`.

## Why it matters

The two passes that were quadratic stopped being so, which is the real result and the opposite of a regression. Measured on synthetic bundles: one pass over the bundle costs 0.33 / 2.77 / 38.94 ms at n=100/400/1600 through the base commit's `edgeNeighbours(record, bundle, "body-link")` — a `bundle.filter` per record — against 0.04 / 0.04 / 0.09 ms through `outboundReferences`. `doctor` has two such passes, so about 78 ms per run at n=1600. End to end against the built CLI, `doctor --json` on a migrated bundle is 230 / 215 / 367 ms wall at n=100/400/1600, node startup included. The residual map rebuilds are microseconds and are not worth a cache.

## Mitigation

Nothing to take here; the scan count repaired itself. The one body scan that remains is the cost worth watching, and it is quadratic in a different variable — risk.inline-code-stripper-rescans-from-zero.

## Verification

`grep -n bodyCitations packages/strauss-kb/src` returns two callers, `validate.ts` and `mirror-links.ts`, neither of them `orphaned` or `supersededButCited`. Time one bundle pass through each reader at n=1600 and confirm the old one is quadratic and the new one flat.

Informs [decision.strauss-links-is-the-one-representation](decision.strauss-links-is-the-one-representation.md).

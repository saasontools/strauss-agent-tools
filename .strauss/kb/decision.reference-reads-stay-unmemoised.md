---
type: decision
title: >-
  Reassess reads the bundle once; doctor's repeated body scans are left
  unmemoised
description: >-
  A memo keyed on a record is a second source of truth about what that record
  cites, and the measured cost does not yet buy one.
generated:
  by: mcp
  at: "2026-09-17T19:20:01.098Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/reassess.ts
    symbol: reassessCommand
    hash: "sha256:c2ecd7e1f5a759d13d151d3b02ad00c6d25d264615fc9951b839c1d743102097"
    hash_kind: raw
    resolved_at: "2026-09-17T19:20:09.211Z"
    lines: 134
    resolver: regex
  - file: packages/strauss-kb/src/doctor.ts
    symbol: doctor
    hash: "sha256:4a819b39db870db270d18eca4ecce6c439c6c1fa05c1356d25cf630be1a19af9"
    hash_kind: ast
    resolved_at: "2026-09-17T19:20:09.220Z"
    lines: 49
    resolver: tree-sitter
strauss_links:
  - target: risk.doctor-rescans-every-body-three-times
    rel: informs
  - target: risk.impact-rereads-the-bundle-the-caller-holds
    rel: informs
strauss_status: accepted
---

## Decision

`reassess` computes its impact set from the bundle it already holds (`impact(id, bundle)`, not `store.impact(path, id)`), so one run reads and adjudicates the base once. `doctor` is left as it is: `orphaned`, `superseded-but-cited` and `validateBundle` each put the body-citation parser over every record, and `doctor --drifted` still calls `store.impact` once per drifted record.

## Rationale

The two are different trades. Threading the bundle through one call removes a whole second read for nothing — there is no state to keep and no behaviour to change. Memoising the reference scan means holding a map whose key is a record and whose value is what that record cites, which is exactly the thing this change spent its effort making single-sourced; a stale entry would be a consumer reading a graph the base does not have. Measured by the performance reviewer: two redundant scans are about 18% of a `doctor` run at 1600 records, and a whole run is 15 ms there. That is not a reason to add a cache to a read-only sweep.

## Rejected

Memoising `outboundReferences` on the record object, and hoisting one `store.list` above `doctor --drifted`'s loop. Both are the right repairs when a real base reaches the thousands; neither is worth the invariant it costs at 16 records. The reviewer's risks stay open as the trigger.

## Impact

A base in the thousands will feel `doctor` before it feels anything else here, and `doctor --drifted` grows by one bundle read per drifted record. Whoever crosses that threshold has the two named repairs and the measurements in risk.doctor-rescans-every-body-three-times and risk.impact-rereads-the-bundle-the-caller-holds.

Informs [risk.doctor-rescans-every-body-three-times](risk.doctor-rescans-every-body-three-times.md).

Informs [risk.impact-rereads-the-bundle-the-caller-holds](risk.impact-rereads-the-bundle-the-caller-holds.md).

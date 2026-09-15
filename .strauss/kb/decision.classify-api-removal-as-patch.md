---
type: decision
title: Removing DEFAULT_THRESHOLDS and KbClassifyThresholds ships in a patch plan
description: >-
  Both configured the rename and boilerplate rules this change deletes; classify
  is deprecated and moves to strauss-kb-review in SAA-813.
tags:
  - review
  - "review:compat"
sources:
  - id: contributing-versioning
    resource: CONTRIBUTING.md#versioning
generated:
  by: mcp
  at: "2026-09-15T15:31:40.400Z"
verified: []
strauss_anchors:
  - file: .nx/version-plans/version-plan-saa-810.md
    hash: "sha256:5d81cd1e102ade015289123608d37e733412443009ab8a1e933867fb29ded301"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:37.787Z"
    lines: 20
  - file: packages/strauss-kb/src/classify/index.ts
    hash: "sha256:3ff52399e8442a65f369e7bd6355d300078e927167ce54f2adc0f8ee0625492e"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:37.788Z"
    lines: 15
  - file: packages/strauss-kb/src/index.ts
    hash: "sha256:30c79966335fcc5d703cad49ccc56097b28dd2b2d24cc65e86c918c326630dd4"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:37.788Z"
    lines: 320
strauss_status: accepted
strauss_materiality: important
strauss_confidence: medium
strauss_owner: reviewer
---

## Decision

Removing DEFAULT_THRESHOLDS and KbClassifyThresholds ships in a patch plan

## Rationale

Both configured the rename and boilerplate rules this change deletes; classify is deprecated and moves to strauss-kb-review in SAA-813.

## Rejected

A major plan (0.2.0), as CONTRIBUTING asks of a breaking change: the line would move twice in one epic for a deprecated verb, and nothing in this repository imports either name.

## Impact

A library consumer importing either name fails to compile on upgrade; the version plan names both. changedSymbolsIn and the ChangedSymbol type are new exports.

[^contributing-versioning]: CONTRIBUTING.md#versioning

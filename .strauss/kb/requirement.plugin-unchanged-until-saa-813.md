---
type: requirement
title: The review plugin's scripts do not change in this step
description: >-
  SAA-813 replaces the hook's copies wholesale; editing them now doubles the
  work and the review.
tags:
  - review
  - "review:compat"
sources:
  - id: saa-810
    resource: "https://linear.app/saason/issue/SAA-810"
generated:
  by: mcp
  at: "2026-09-15T15:30:30.778Z"
verified:
  - by: "agent:correctness"
    at: "2026-09-15T15:46:24.956Z"
    note: git diff c5e9a66..HEAD -- plugins is empty.
strauss_links:
  - target: test-obligation.gate-groups-reproduced
    rel: verified_by
strauss_status: proposed
---

## Claim

No file under plugins/strauss-kb-review changes; the hook keeps its own git runner, contextSymbol, attribute reader and DECLARATION regex.

## Evidence

SAA-810, Done when.

## Implication

The hook still reads classify's new classes through the CLI it spawns.

Verified by [test-obligation.gate-groups-reproduced](test-obligation.gate-groups-reproduced.md).

[^saa-810]: https://linear.app/saason/issue/SAA-810

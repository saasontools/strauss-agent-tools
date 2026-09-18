---
type: test-obligation
title: "The release that drops body-link from KbEdgeKind is 0.2.0, not a patch"
description: >-
  A library consumer on ^0.1.21 would otherwise receive a type break and a sweep
  hazard with no opt-in.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-18T15:46:31.553Z"
verified: []
strauss_anchors:
  - file: .nx/version-plans/version-plan-saa-821.md
strauss_links:
  - target: risk.breaking-edge-change-ships-as-a-patch
    rel: satisfies
strauss_status: open
---

## Obligation

`.nx/version-plans/version-plan-saa-821.md` declares `major` for `@saasontools/strauss-kb`, which Nx turns into 0.2.0 below 1.0. CONTRIBUTING.md reserves `patch` for anything that is not breaking; this range removes a member of an exported union, is committed as `feat(strauss-kb)!`, and makes `mirror-links` a precondition of a safe `sweep`.

## Why it matters

The `^0.1.x` range is the only opt-in a library consumer has. It does not reach the plugin channel, which launches `@0.x` and is open-question.does-a-release-note-reach-an-auto-upgraded-base's concern, not this record's.

## How to verify

`head -3 .nx/version-plans/version-plan-saa-821.md` shows `major`.

Satisfies [risk.breaking-edge-change-ships-as-a-patch](risk.breaking-edge-change-ships-as-a-patch.md).

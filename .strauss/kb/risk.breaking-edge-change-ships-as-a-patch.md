---
type: risk
title: The version plan ships a breaking change as a patch bump
description: >-
  CONTRIBUTING reserves patch on 0.x for changes that are not breaking; this one
  removes an exported enum member and requires a migration.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-18T15:42:14.914Z"
verified: []
strauss_anchors:
  - file: .nx/version-plans/version-plan-saa-821.md
strauss_links:
  - target: risk.unmigrated-base-loses-prose-edges
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

version-plan-saa-821.md says `"@saasontools/strauss-kb": patch`, which takes 0.1.21 to 0.1.22. The range drops `body-link` from the exported `KB_EDGE_KINDS`/`KbEdgeKind`, is committed as `feat(strauss-kb)!`, and makes `mirror-links` mandatory before `sweep` is safe. CONTRIBUTING.md: "Write `patch` for anything that isn't breaking"; `major` gives 0.2.0.

## Why it matters

A library consumer on `^0.1.21` receives the type break and the sweep hazard with no opt-in; a 0.2.0 would stop at their range.

## Mitigation

None in the diff. Change the plan to `major`, which Nx turns into 0.2.0.

## Verification

`head -3 .nx/version-plans/version-plan-saa-821.md` shows `major`.

Informs [risk.unmigrated-base-loses-prose-edges](risk.unmigrated-base-loses-prose-edges.md).

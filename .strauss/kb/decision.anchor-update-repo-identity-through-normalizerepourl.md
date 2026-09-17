---
type: decision
title: >-
  Selector matching and the duplicate check compare repo through
  normalizeRepoUrl
description: >-
  The resolver treats `…/name` and `…/name.git` as one repository, so comparing
  raw would let a patch create the duplicate pair the uniqueness check exists to
  prevent, and refuse a spelling the rest of the package accepts.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T18:21:56.726Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/patch.ts
    symbol: fieldKey
    hash: "sha256:f532c7cce374517ad50d4d3eb2b410682f8a04219dcdb0c2d772a942252e28be"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:06.989Z"
    lines: 16
    resolver: tree-sitter
strauss_links:
  - target: risk.anchor-update-repo-identity-not-normalised
    rel: informs
strauss_status: accepted
---

## Decision

Selector matching and the duplicate check compare repo through normalizeRepoUrl

## Rationale

The resolver treats `…/name` and `…/name.git` as one repository, so comparing raw would let a patch create the duplicate pair the uniqueness check exists to prevent, and refuse a spelling the rest of the package accepts.

## Rejected

Leave the raw comparison and document the exact spelling as the caller's problem. Rejected: the package already has one notion of repository identity and a second one inside the patch is how the two start disagreeing.

## Impact

fieldKey normalises `repo`, so matchesSelector, the repo boundary check and locatorKey share the resolver's identity. A boundary refusal now names the normalised form on both sides.

Informs [risk.anchor-update-repo-identity-not-normalised](risk.anchor-update-repo-identity-not-normalised.md).

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

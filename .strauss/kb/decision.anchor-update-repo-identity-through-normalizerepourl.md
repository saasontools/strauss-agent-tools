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
verified:
  - by: "agent:correctness"
    at: "2026-09-17T18:35:52.259Z"
    note: >-
      fieldKey routes repo through normalizeRepoUrl (patch.ts 206-208). Ran it:
      adding …/name.git beside an anchor at …/name throws
      KbAnchorPatchConflictError, and a remove selector spelled without .git
      matches the .git anchor. The boundary check calls fieldKey on both sides,
      so a repo refusal names the normalised form.
  - by: "agent:security"
    at: "2026-09-17T18:36:52.508Z"
    note: >-
      fieldKey runs repo through normalizeRepoUrl: an add of name.git beside an
      anchor at name is refused as duplicate-destination, a remove spelled
      git@github.com:org/name.git finds the https anchor, and a replace to the
      .git spelling is not a boundary crossing.
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

---
type: decision
title: "A replacement may not change an anchor's repo, ref or side"
description: >-
  The stored hash travels with the pointer, and a baseline taken over one
  repository's code at one rev says nothing about another's — carrying it across
  would report a match no run ever made.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T17:50:03.216Z"
verified:
  - by: "agent:security"
    at: "2026-09-17T18:11:25.240Z"
    note: >-
      Read patch.ts BOUNDARY_FIELDS and replacement(): repo/ref/side are
      compared through fieldKey before the spread and throw
      KbAnchorBoundaryError, and the spread carries no baseline key, so no hash
      crosses a repo, rev or side.
  - by: "agent:correctness"
    at: "2026-09-17T18:11:31.319Z"
    note: >-
      BOUNDARY_FIELDS is repo, ref, side and replacement() throws
      KbAnchorBoundaryError before building next; an absent side compares as
      'new'. Caveat recorded separately: the comparison is on raw repo strings,
      not normalizeRepoUrl.
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/patch.ts
    symbol: replacement
    hash: "sha256:94cbb260877cbc5e366b2c0414de9edd33d2561135a17d428ddbacf99725c555"
    hash_kind: ast
    resolved_at: "2026-09-17T18:45:17.390Z"
    lines: 27
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/anchor-update/errors.ts
    symbol: KbAnchorBoundaryError
    hash: "sha256:6f8a3772aa0513585ba13405029946e317ff48b244a4bd646767aadec8838ca3"
    hash_kind: ast
    resolved_at: "2026-09-17T18:45:17.396Z"
    lines: 20
    resolver: tree-sitter
strauss_status: accepted
---

## Decision

A replacement may not change an anchor's repo, ref or side

## Rationale

The stored hash travels with the pointer, and a baseline taken over one repository's code at one rev says nothing about another's — carrying it across would report a match no run ever made.

## Rejected

Allow the change and drop the baseline when a boundary field moves. Rejected for the first version: silently clearing a hash is the one thing this command exists not to do, and an explicit remove plus add says the same thing in the caller's own words.

## Impact

Moving an anchor to another repository, rev or side takes two operations in one patch. Both still land in a single guarded write and a single log entry.

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

---
type: decision
title: >-
  The companion fixture's base .gitattributes declares *.spec.ts as tests,
  beyond the lock file and docs/
description: >-
  With only the lock file and docs/ declared the table is off, checkout.spec.ts
  classifies `source`, and the hook's anchor.file-only fires on blocking-risk's
  test-obligation — a well-formed scenario turning into a finding.
tags:
  - review
sources:
  - id: saa-810
    resource: "https://linear.app/saason/issue/SAA-810"
generated:
  by: mcp
  at: "2026-09-15T15:31:29.433Z"
verified:
  - by: unknown
    at: "2026-09-15T15:33:08.747Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:34:50.285Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:37:40.749Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:38:12.210Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:45:14.229Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: "agent:correctness"
    at: "2026-09-15T15:46:25.338Z"
    note: >-
      base/.gitattributes declares *.spec.ts; fixture.spec.mjs passes 14/14 with
      blocking-risk groups [].
  - by: unknown
    at: "2026-09-15T15:48:09.032Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:49:19.723Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
strauss_anchors:
  - file: fixtures/companion-repo/base/.gitattributes
    hash: "sha256:212372d8f93f4ff9aa3e81255a8d875bd156c0534b07e562da2ac259d7fef120"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:37.157Z"
    lines: 3
strauss_status: accepted
---

## Decision

The companion fixture's base .gitattributes declares *.spec.ts as tests, beyond the lock file and docs/

## Rationale

With only the lock file and docs/ declared the table is off, checkout.spec.ts classifies `source`, and the hook's anchor.file-only fires on blocking-risk's test-obligation — a well-formed scenario turning into a finding.

## Rejected

Exactly what SAA-810 lists, and blocking-risk's gateGroups gain `anchor`: the scenario's premise, a clean base that still routes human, would be gone.

## Impact

checkout.spec.ts stays `test`, now by attribute. Every other golden that moved is a record or log.jsonl or merge-policy.yaml going `source`. A real repo that declares some classes but not its tests sees the same hook finding.

[^saa-810]: https://linear.app/saason/issue/SAA-810

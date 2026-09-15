---
type: risk
title: >-
  kb_classify's description and input schema disagree with the classify
  reference
description: "An agent reads the tool description and schema, not the docs site."
tags:
  - review
  - "review:docs"
generated:
  by: "agent:prose"
  at: "2026-09-15T15:42:58.884Z"
verified:
  - by: unknown
    at: "2026-09-15T15:48:15.501Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:49:27.397Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:02:43.656Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:04:35.401Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:06:32.765Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:13:16.179Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:22:31.839Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:22:53.723Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:25:39.431Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:35:49.410Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: "agent:author"
    at: "2026-09-15T16:47:34.288Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: "agent:author"
    at: "2026-09-15T16:48:05.457Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: "agent:author"
    at: "2026-09-15T16:49:50.875Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
strauss_anchors:
  - file: packages/strauss-kb/src/commands/classify.ts
    hash: "sha256:be2c00ceee697ef18b37251ffcc985360cab0f0b6e958a95148c125e5fa037b1"
    hash_kind: raw
    resolved_at: "2026-09-15T16:02:28.538Z"
    lines: 154
  - file: apps/strauss-kb-docs/docs/mcp-reference.md
    hash: "sha256:0594aeb26f6f47157855ea04d403941df4e31cd2e70d7b60c72b409d3ba999f5"
    hash_kind: raw
    resolved_at: "2026-09-15T16:02:28.539Z"
    lines: 621
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

The description lists the precedence as a review:* fact, a .gitattributes entry at the base, a generator banner, else source; it omits the default path table that cli-reference#classify applies where no class attribute is declared. The input schema still accepts `similarity`, which nothing reads now and mcp-reference no longer documents.

## Why it matters

In a repository with no class attributes an agent expects a .md or spec file to come back `source` and gets `docs` or `test`; a caller keeps sending a field that does nothing.

## Mitigation

None in the diff.

## Verification

None.

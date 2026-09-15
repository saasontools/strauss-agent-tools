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
strauss_anchors:
  - file: packages/strauss-kb/src/commands/classify.ts
    hash: "sha256:4a0c78d69e2e1984c001186a8ded237a3c71b584335bd52c3297108f659ff223"
    hash_kind: raw
    resolved_at: "2026-09-15T15:45:19.506Z"
    lines: 155
  - file: apps/strauss-kb-docs/docs/mcp-reference.md
    hash: "sha256:20a0062971c563e2c9655727544f0d0a87d9770c0ac6d8cbe17a43699d76cfd0"
    hash_kind: raw
    resolved_at: "2026-09-15T15:45:19.507Z"
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

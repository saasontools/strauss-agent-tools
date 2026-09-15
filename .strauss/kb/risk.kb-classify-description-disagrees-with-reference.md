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

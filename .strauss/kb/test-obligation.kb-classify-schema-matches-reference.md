---
type: test-obligation
title: >-
  kb_classify's description names the default table and its input drops
  similarity
description: "An agent reads the tool description and schema, not the docs site."
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:00:43.844Z"
verified:
  - by: unknown
    at: "2026-09-15T16:01:51.905Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
strauss_anchors:
  - file: packages/strauss-kb/src/commands/classify.spec.ts
    hash: "sha256:962fd30873a04934432daa8a40e31d16c24b473f685dee6b1701ca11a389d1a5"
    hash_kind: raw
    resolved_at: "2026-09-15T16:01:31.662Z"
    lines: 288
strauss_links:
  - target: risk.kb-classify-description-disagrees-with-reference
    rel: satisfies
strauss_status: open
---

## Obligation

classifyCommand.description mentions the default path table; a file carrying `similarity` parses without it.

## Why it matters

The description otherwise omits a precedence step and the schema accepts a field nothing reads.

## How to verify

cd packages/strauss-kb && pnpm vitest run src/commands/classify.spec.ts -t similarity

Satisfies [risk.kb-classify-description-disagrees-with-reference](risk.kb-classify-description-disagrees-with-reference.md).

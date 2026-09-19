---
type: risk
title: >-
  The record-type count is spelled out in ten prose places and goes stale on the
  next type change
description: One missed site tells an agent the wrong number of types.
tags:
  - review
  - "review:docs"
generated:
  by: "agent:prose"
  at: "2026-09-19T06:10:49.061Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/types.ts
    symbol: typesCommand
    hash: "sha256:afb30e2e1ecefa8829d4732bfb2a37bf703730e3535cf00071aa0d0300d9dcbb"
    hash_kind: raw
    resolved_at: "2026-09-19T06:18:30.401Z"
    lines: 10
    resolver: regex
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

"eleven" appears in the kb_types description (commands/types.ts), README.md twice, cli-reference.md twice, mcp-reference.md twice (one as '11 types'), specification.md twice and the record-types.ts doc comment. This change had to edit every one; KB_RECORD_TYPES is the only source.

## Why it matters

The next retire or add has to find all of them again; a miss leaves a tool description or reference that disagrees with kb_types.

## Mitigation

Drop the number: 'each record type', 'one of the record types'. specification.md's table and kb_types stay the home of the list.

## Verification

git grep -n -i -w -e eleven -e '11 types' -- packages/strauss-kb apps/strauss-kb-docs returns nothing.

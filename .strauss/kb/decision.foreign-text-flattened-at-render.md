---
type: decision
title: Every renderer flattens a foreign title through oneLine
description: >-
  A title is another actor's text and YAML decodes escapes into real bytes;
  quoted raw, a newline forges a row and an ESC reaches the reader's terminal.
generated:
  by: mcp
  at: "2026-09-18T19:31:27.389Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/one-line.ts
    symbol: oneLine
  - file: packages/strauss-kb/src/kb-index.ts
    symbol: renderIndexLine
strauss_verify:
  - packages/strauss-kb/src/foreign-title.spec.ts
strauss_status: accepted
---

## Decision

Every renderer flattens a foreign title through oneLine

## Rationale

A title is another actor's text and YAML decodes escapes into real bytes; quoted raw, a newline forges a row and an ESC reaches the reader's terminal.

## Rejected

Rejecting control characters in the frontmatter schema: bases already on disk would stop loading, and a record is still foreign text to every reader. Keeping oneLine in commands/model.ts: catalog.ts and kb-index.ts are core modules and would import from the command layer.

## Impact

oneLine lives in src/one-line.ts. pack, promote, doctor, reassess, catalog, the MADR export heading and INDEX.md route titles through it; INDEX.md also flattens description and tags, uncut. A new renderer that quotes a title must do the same.

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
    hash: "sha256:e1af0ffa9fab8d97df2646dac9fe5c79f03e7496a03dc3c3612f12a6fc64c410"
    hash_kind: ast
    resolved_at: "2026-09-18T19:33:28.114Z"
    lines: 7
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-index.ts
    symbol: renderIndexLine
    hash: "sha256:a3465f3cb911d01b95d4948c34d92efca696566dcefe8e134fc5bfe6db33ff00"
    hash_kind: ast
    resolved_at: "2026-09-18T19:33:28.114Z"
    lines: 10
    resolver: tree-sitter
  - file: packages/strauss-kb/src/catalog.ts
    symbol: renderCatalogLine
    hash: "sha256:3ca0ed2ae8c82911829f7a213b8536a60a532d71df8e9019f6c1543d4335fe3d"
    hash_kind: ast
    resolved_at: "2026-09-18T19:33:28.115Z"
    lines: 12
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/export.ts
    symbol: renderMadr
    hash: "sha256:1b1a46e5cb61a5fb583f3d7d22279e22f109267a66a0fc557fbc4c64f24d43ff"
    hash_kind: ast
    resolved_at: "2026-09-18T19:33:28.118Z"
    lines: 17
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/pack.ts
    symbol: render
    hash: "sha256:0d15b40971fbbe891a7c2c5f40a372ddefddf41d907f85b3168a88884665138c"
    hash_kind: ast
    resolved_at: "2026-09-18T19:33:28.120Z"
    lines: 48
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/promote/command.ts
    symbol: renderPromote
    hash: "sha256:9160225eca08a9e39b21e9b0c689d2b4c559864d9e30d3c5c37d19508694672a"
    hash_kind: ast
    resolved_at: "2026-09-18T19:33:28.122Z"
    lines: 28
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/doctor.ts
    symbol: render
    hash: "sha256:f56495c24f91b472d404b88a623e68890a32420914ae31804d70403b224152de"
    hash_kind: ast
    resolved_at: "2026-09-18T19:33:28.125Z"
    lines: 45
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/reassess.ts
    symbol: renderReassess
    hash: "sha256:836ca86477b52e3f29f08b288020bd62c1490e20f79710c092f169416110e8d3"
    hash_kind: ast
    resolved_at: "2026-09-18T19:33:28.128Z"
    lines: 89
    resolver: tree-sitter
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

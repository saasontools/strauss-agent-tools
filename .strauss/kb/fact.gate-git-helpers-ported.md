---
type: fact
title: >-
  code-diff's range reads, contextSymbol and git-guard's checkAttr are ports of
  the review hook's lib/git.mjs
description: >-
  The hook keeps its own copies until SAA-813, so a reviewer sees the same logic
  twice and needs to know which differences are deliberate.
tags:
  - review
  - "review:extract"
generated:
  by: mcp
  at: "2026-09-15T15:30:09.835Z"
verified:
  - by: unknown
    at: "2026-09-15T15:33:12.135Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:34:54.071Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:37:43.986Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:38:15.190Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
  - by: "agent:security"
    at: "2026-09-15T15:44:55.301Z"
    note: >-
      Compared git-guard check-attr.ts with hooks/scripts/lib/git.mjs:264-292:
      same -z stdin protocol; the port falls back only on reason 'failed' and
      reads nothing for an unsafe source, as claimed. Both fall back to the
      working tree: see risk.classify-unpinned-attributes-lower-classes.
  - by: unknown
    at: "2026-09-15T15:45:17.204Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
  - by: "agent:correctness"
    at: "2026-09-15T15:46:25.841Z"
    note: >-
      Compared with plugins/strauss-kb-review/hooks/scripts/lib/git.mjs: the
      listed differences hold. The ports inherit two gaps, filed as risks.
  - by: unknown
    at: "2026-09-15T15:48:12.019Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:49:22.896Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/repo/changed-files.ts
    symbol: changedFiles
    hash: "sha256:376fcde45cb5f9a501a8ecd0f5f844fb6d96acc47502a3c2bd1887182bcb648b"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:34.675Z"
    lines: 45
    resolver: tree-sitter
  - file: packages/code-diff/src/repo/commits.ts
    symbol: commits
    hash: "sha256:2c00b07d0c33f92149ce4024efab12cda54c8d22e0c59cd79f1d268d7de7481a"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:34.680Z"
    lines: 31
    resolver: tree-sitter
  - file: packages/code-diff/src/repo/uncommitted-paths.ts
    symbol: uncommittedPaths
    hash: "sha256:916e1372bd63b7f0b877be0028e458b3495db4d295ceca05c86a3d9b45279abe"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:34.683Z"
    lines: 36
    resolver: tree-sitter
  - file: packages/code-diff/src/repo/head.ts
    symbol: head
    hash: "sha256:0b44e030c3544ac95cf67338b3f3565ef6dc331cd14f56a9362874cf1db1a319"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:34.684Z"
    lines: 11
    resolver: tree-sitter
  - file: packages/code-diff/src/changed-symbols.ts
    symbol: contextSymbol
    hash: "sha256:27591b58f304f011567516a277f5d466c7e5ce91a24dbc285f78877b9c264bf8"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:34.685Z"
    lines: 14
    resolver: tree-sitter
  - file: packages/git-guard/src/check-attr.ts
    symbol: checkAttr
    hash: "sha256:1f8a7f4be9a9672ff6d37a2016bdec7a8eab47675b242206a462939a9ca8a5e2"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:34.689Z"
    lines: 46
    resolver: tree-sitter
strauss_verify:
  - >-
    cd packages/code-diff && pnpm vitest run src/repo/repo.spec.ts
    src/changed-symbols.spec.ts
  - cd packages/git-guard && pnpm vitest run src/check-attr.spec.ts
strauss_status: accepted
---

## Claim

changedFiles, commits, uncommittedPaths, head and contextSymbol port hooks/scripts/lib/git.mjs; checkAttr ports its check-attr call. Deliberate differences: async over runGit; null when git could not answer instead of an empty list; changedFiles reads -z; contextSymbol names a Go method, not its receiver; checkAttr falls back to the working tree only on git's own failure, and an unsafe source reads nothing.

## Evidence

plugins/strauss-kb-review/hooks/scripts/lib/git.mjs is unchanged in this range; each port has its own spec.

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
  - by: unknown
    at: "2026-09-15T16:02:40.032Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:31.224Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:29.774Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:13:12.570Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:49.727Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:35.895Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:44.969Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:48:00.043Z"
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
    hash: "sha256:25274cc4820fdfadc59fee8966c80b3474a4603ad605f2e1f442e762f0b9ca92"
    hash_kind: ast
    resolved_at: "2026-09-15T16:02:25.809Z"
    lines: 38
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
    hash: "sha256:89d414f31282713e725ae21112c79391f7c1cc4362c05d0cc7b3fd0cde37fe21"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:37.221Z"
    lines: 15
    resolver: tree-sitter
  - file: packages/git-guard/src/check-attr.ts
    symbol: checkAttr
    hash: "sha256:4fe0d8345781772daaaa95bf1248cee1cd5c7f0382d498c45c3536ac85ee0b3b"
    hash_kind: ast
    resolved_at: "2026-09-15T16:49:57.393Z"
    lines: 66
    resolver: tree-sitter
strauss_verify:
  - >-
    cd packages/code-diff && pnpm vitest run src/repo/repo.spec.ts
    src/changed-symbols.spec.ts
  - cd packages/git-guard && pnpm vitest run src/check-attr.spec.ts
strauss_status: superseded
strauss_superseded_by: fact.gate-git-helpers-ported-and-hardened
---

## Claim

changedFiles, commits, uncommittedPaths, head and contextSymbol port hooks/scripts/lib/git.mjs; checkAttr ports its check-attr call. Deliberate differences: async over runGit; null when git could not answer instead of an empty list; changedFiles reads -z; contextSymbol names a Go method, not its receiver; checkAttr falls back to the working tree only on git's own failure, and an unsafe source reads nothing.

## Evidence

plugins/strauss-kb-review/hooks/scripts/lib/git.mjs is unchanged in this range; each port has its own spec.

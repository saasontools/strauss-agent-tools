---
type: fact
title: >-
  code-diff's range reads, contextSymbol and git-guard's checkAttr port the
  review hook's lib/git.mjs, hardened in review
description: >-
  The hook keeps its copies until SAA-813, so a reviewer sees the same logic
  twice and needs the deliberate differences.
tags:
  - review
  - "review:extract"
generated:
  by: mcp
  at: "2026-09-15T16:47:04.188Z"
verified:
  - by: "agent:author"
    at: "2026-09-15T16:47:44.787Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/repo/changed-files.ts
    symbol: changedFiles
    hash: "sha256:376fcde45cb5f9a501a8ecd0f5f844fb6d96acc47502a3c2bd1887182bcb648b"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:28.534Z"
    lines: 45
    resolver: tree-sitter
  - file: packages/code-diff/src/repo/commits.ts
    symbol: commits
    hash: "sha256:2c00b07d0c33f92149ce4024efab12cda54c8d22e0c59cd79f1d268d7de7481a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:28.537Z"
    lines: 31
    resolver: tree-sitter
  - file: packages/code-diff/src/repo/uncommitted-paths.ts
    symbol: uncommittedPaths
    hash: "sha256:25274cc4820fdfadc59fee8966c80b3474a4603ad605f2e1f442e762f0b9ca92"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:28.539Z"
    lines: 38
    resolver: tree-sitter
  - file: packages/code-diff/src/repo/head.ts
    symbol: head
    hash: "sha256:0b44e030c3544ac95cf67338b3f3565ef6dc331cd14f56a9362874cf1db1a319"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:28.540Z"
    lines: 11
    resolver: tree-sitter
  - file: packages/code-diff/src/changed-symbols.ts
    symbol: contextSymbol
    hash: "sha256:89d414f31282713e725ae21112c79391f7c1cc4362c05d0cc7b3fd0cde37fe21"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:28.541Z"
    lines: 15
    resolver: tree-sitter
  - file: packages/git-guard/src/check-attr.ts
    symbol: checkAttr
    hash: "sha256:aba399499154a15bc8b6b37031ee8ee8496c8610b1408b01e0e8f23955ee129a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:28.544Z"
    lines: 66
    resolver: tree-sitter
strauss_verify:
  - >-
    cd packages/code-diff && pnpm vitest run src/repo/repo.spec.ts
    src/changed-symbols.spec.ts
  - cd packages/git-guard && pnpm vitest run src/check-attr.spec.ts
strauss_status: accepted
strauss_supersedes:
  - fact.gate-git-helpers-ported
---

## Claim

changedFiles, commits, uncommittedPaths, head and contextSymbol port hooks/scripts/lib/git.mjs; checkAttr ports its check-attr call. Deliberate differences: async over runGit; null when git could not answer; changedFiles reads -z; uncommittedPaths includes staged files; contextSymbol names a Go method, not its receiver, and reads at most 256 characters with an unambiguous modifier group; checkAttr falls back to the working tree only when git rejects --source, reads nothing for an unresolvable or unsafe rev, never reads core.attributesFile or the system file, and returns unpinned and local without spawning check-attr when the clone's info/attributes sets anything.

## Evidence

plugins/strauss-kb-review/hooks/scripts/lib/git.mjs is unchanged in this range; each port has its own spec.

---
type: risk
title: uncommittedPaths misses a file that is staged but not committed
description: A staged record reads as no coverage.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-15T15:46:23.458Z"
verified:
  - by: unknown
    at: "2026-09-15T15:49:27.655Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:02:43.907Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:35.651Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:32.954Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:13:16.605Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:32.242Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:54.124Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:39.823Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:50.019Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:47:34.893Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:48:06.090Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:49:51.480Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/repo/uncommitted-paths.ts
    symbol: uncommittedPaths
    hash: "sha256:25274cc4820fdfadc59fee8966c80b3474a4603ad605f2e1f442e762f0b9ca92"
    hash_kind: ast
    resolved_at: "2026-09-15T16:02:28.815Z"
    lines: 38
    resolver: tree-sitter
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

`git diff --name-only -- <dir>` compares the working tree with the index, and `ls-files --others` lists only untracked files, so a file changed and `git add`ed but not committed is in neither. In a scratch repo `diff --name-only` listed only the unstaged kb/mod.md; `diff HEAD --name-only` also listed the staged kb/staged.md. The docstring says 'changed in the working tree and not yet committed'.

## Why it matters

A consumer deciding coverage from the port does not see a record the author staged. The hook's lib/git.mjs copy has the same gap, so this is inherited, not introduced.

## Mitigation

None in the diff. Diff against HEAD, or add `diff --cached --name-only`.

## Verification

repo.spec.ts case: stage a modified file under the dir and expect it in uncommittedPaths.

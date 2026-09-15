---
type: risk
title: >-
  git-guard's environment is a denylist: a variable it does not name still
  reaches git
description: >-
  GIT_CONFIG_PARAMETERS or GIT_CONFIG_COUNT in the caller's environment can set
  config such as core.fsmonitor, which a working-tree diff runs.
tags:
  - review
  - "review:security"
generated:
  by: mcp
  at: "2026-09-15T15:32:14.178Z"
verified:
  - by: unknown
    at: "2026-09-15T15:33:13.324Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:34:55.238Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:37:45.196Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:38:16.464Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:security"
    at: "2026-09-15T15:44:54.946Z"
    note: >-
      Read git-guard env.ts gitEnv (eight names stripped, GIT_TERMINAL_PROMPT=0)
      and run.ts runGit (env only from gitEnv(process.env), no env option, argv
      only). --no-ext-diff and --no-textconv are on every diff: repo/diff.ts
      diff, changed-files.ts, uncommitted-paths.ts. git-guard suite passes (39).
  - by: unknown
    at: "2026-09-15T15:45:18.839Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:correctness"
    at: "2026-09-15T15:46:26.798Z"
    note: >-
      git-guard's suite passes (39 tests); diff.ts, changed-files.ts and
      uncommitted-paths.ts pass --no-ext-diff and --no-textconv.
  - by: unknown
    at: "2026-09-15T15:48:14.933Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:49:26.771Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:01:49.365Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:02:43.113Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:34.821Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:32.361Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:13:15.770Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:31.420Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:53.300Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:39.021Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:48.775Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:47:33.654Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/git-guard/src/env.ts
    symbol: gitEnv
    hash: "sha256:10b53e1e46aead87f9d0ce49509e9a652e5a1485abf10a8c254b84b984e2e558"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:39.531Z"
    lines: 7
    resolver: tree-sitter
strauss_links:
  - target: decision.git-env-strips-redirects-only
    rel: related_to
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: medium
---

## Risk

gitEnv strips eight named redirects; any other GIT_* — including a variable a later git adds — passes through to the child.

## Why it matters

readWorkingDiff and uncommittedPaths refresh the index, which is where a configured fsmonitor command runs.

## Mitigation

The environment is the caller's own process environment; bundle and diff data never reach it. Diffs pass --no-ext-diff and --no-textconv, and no shell is ever involved.

## Verification

git-guard run.spec.ts: GIT_DIR in the caller's environment does not redirect a read; gitEnv's table test.

Relates to [decision.git-env-strips-redirects-only](decision.git-env-strips-redirects-only.md).

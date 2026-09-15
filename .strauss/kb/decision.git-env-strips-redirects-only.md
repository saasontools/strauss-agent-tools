---
type: decision
title: "git-guard strips the repository-redirecting GIT_* variables, not all of them"
description: >-
  SAA-810 words it `GIT_* stripped`. Removing every one would drop
  GIT_SSH_COMMAND, GIT_ASKPASS and GIT_CONFIG_GLOBAL, which foreign-anchor
  fetches and the suites' config isolation rely on.
tags:
  - review
  - "review:security"
sources:
  - id: saa-810
    resource: "https://linear.app/saason/issue/SAA-810"
generated:
  by: mcp
  at: "2026-09-15T15:31:35.539Z"
verified:
  - by: unknown
    at: "2026-09-15T15:33:09.062Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:34:50.633Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:37:41.004Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:38:12.530Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:security"
    at: "2026-09-15T15:44:55.117Z"
    note: >-
      env.ts REDIRECTS is the eight named; run.spec gitEnv test keeps
      GIT_SSH_COMMAND and GIT_CONFIG_GLOBAL. Impact says local reads lose four
      more variables; the code strips five beyond the old three
      (OBJECT_DIRECTORY, ALTERNATE_OBJECT_DIRECTORIES, COMMON_DIR, NAMESPACE,
      EXTERNAL_DIFF).
  - by: unknown
    at: "2026-09-15T15:45:14.463Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:correctness"
    at: "2026-09-15T15:46:24.085Z"
    note: >-
      Read gitEnv: deletes the eight named variables and sets
      GIT_TERMINAL_PROMPT=0; drift/git.ts, remote-repo/git.ts and repoOriginUrl
      reach it through runGit.
  - by: unknown
    at: "2026-09-15T15:48:09.344Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:49:19.969Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:01:42.174Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:02:37.176Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:27.849Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:27.376Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:13:10.393Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:25.552Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:47.162Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:33.465Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:42.530Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:47:25.869Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:47:57.147Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:49:42.377Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/git-guard/src/env.ts
    symbol: gitEnv
    hash: "sha256:10b53e1e46aead87f9d0ce49509e9a652e5a1485abf10a8c254b84b984e2e558"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:37.471Z"
    lines: 7
    resolver: tree-sitter
strauss_status: accepted
---

## Decision

git-guard strips the repository-redirecting GIT_* variables, not all of them

## Rationale

SAA-810 words it `GIT_* stripped`. Removing every one would drop GIT_SSH_COMMAND, GIT_ASKPASS and GIT_CONFIG_GLOBAL, which foreign-anchor fetches and the suites' config isolation rely on.

## Rejected

Every GIT_* removed; or the old per-runner lists — GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, plus GIT_EXTERNAL_DIFF in the hook.

## Impact

gitEnv removes GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY, GIT_ALTERNATE_OBJECT_DIRECTORIES, GIT_COMMON_DIR, GIT_NAMESPACE and GIT_EXTERNAL_DIFF and sets GIT_TERMINAL_PROMPT=0 on every run. strauss-kb's local reads now also lose the four variables they used to pass through, and repo-identity's config read loses all eight.

[^saa-810]: https://linear.app/saason/issue/SAA-810

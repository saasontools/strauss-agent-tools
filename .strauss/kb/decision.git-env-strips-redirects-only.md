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
verified: []
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

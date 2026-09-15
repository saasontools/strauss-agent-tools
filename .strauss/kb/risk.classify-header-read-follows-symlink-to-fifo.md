---
type: risk
title: >-
  classifyFiles hangs on a committed symlink to a FIFO: the banner read follows
  it with no timeout
description: >-
  A symlink in a reviewed branch can stall classify, and the process running it,
  indefinitely.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-15T15:44:54.758Z"
verified:
  - by: unknown
    at: "2026-09-15T15:48:13.838Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:49:25.515Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:02:42.048Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:33.768Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:31.511Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:performance"
    at: "2026-09-15T16:12:49.790Z"
    note: >-
      Bounds at 8f85584: header() opens O_RDONLY|O_NOFOLLOW|O_NONBLOCK and reads
      only after fstat says isFile; the symlink-to-FIFO spec returns within 5 s.
      Mitigation and Verification sections still read none.
  - by: unknown
    at: "2026-09-15T16:13:14.464Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:29.955Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:51.962Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:37.747Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:47.300Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:47:32.157Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:48:03.369Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:49:48.711Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/classify/read.ts
    symbol: header
    hash: "sha256:334e55ef45d18e544f84473a404c2947c3b5cf478b555ccb831333cbbc7e820c"
    hash_kind: ast
    resolved_at: "2026-09-15T16:02:27.739Z"
    lines: 26
    resolver: tree-sitter
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: medium
---

## Risk

header() in code-diff classify/read.ts checks the path lexically, then open(join(root, filePath), 'r'), which follows symlinks. A target that is a FIFO (or /dev/tty in a terminal run) blocks in open with no timeout. Reproduced: a repo committing `gen.ts -> <fifo>`, classifyFiles(root, files, { base: 'HEAD~1' }) never returned, and the node process stayed alive after its own process.exit until a writer opened the FIFO.

## Why it matters

classify --git and kb_classify stall and the libuv worker keeps the process from exiting. The same follow lets a symlink out of the root read 64 KB of any file the user can read; the comment's one-bit leak (banner or not) is what escapes.

## Mitigation

None; the code moved unchanged from strauss-kb's classify command. Suggested: lstat and read only regular files, or open with O_NOFOLLOW | O_NONBLOCK and fstat before reading.

## Verification

None in the suite.

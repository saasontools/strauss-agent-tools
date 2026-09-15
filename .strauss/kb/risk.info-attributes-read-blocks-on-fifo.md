---
type: risk
title: >-
  checkAttr hangs when .git/info/attributes is a FIFO: namesAttribute reads it
  with readFile
description: "classify and kb_classify never return, and the MCP server's fs pool stalls."
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-15T16:33:19.808Z"
verified: []
strauss_anchors:
  - file: packages/git-guard/src/check-attr.ts
    symbol: namesAttribute
    hash: "sha256:7710a737d3a18110b14609ccfa8b5bcae7d9b149c768d6de6a2fc02f4c513fd7"
    hash_kind: ast
    resolved_at: "2026-09-15T16:35:49.214Z"
    lines: 16
    resolver: tree-sitter
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

namesAttribute calls readFile on the path `rev-parse --git-path info/attributes` names, with no file-type check and no size bound. A FIFO there blocks the read; the check-attr child is killed at 10 s, but Promise.all waits on the read. Reproduced: mkfifo .git/info/attributes, then checkAttr(root, 'main~~1', ...) and classifyFiles(..., { base: 'main~~1' }) were pending at 15 s, and node was alive 40 s after process.exit. A symlink to /dev/zero reads without end.

## Why it matters

kb_classify runs in the long-lived MCP server: each call pins a libuv pool thread, and four stall every fs call the server makes. The hook's spawnSync timeout falls back to source, so the gate fails closed.

## Mitigation

None in the diff. Read it as header() reads a banner: O_NOFOLLOW | O_NONBLOCK, fstat, regular files only, bounded bytes; anything else unpins.

## Verification

None. A check-attr.spec case with a FIFO at info/attributes expects an answer within the timeout.

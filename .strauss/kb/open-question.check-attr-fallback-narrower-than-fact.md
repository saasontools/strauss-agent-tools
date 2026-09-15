---
type: open-question
title: >-
  Does checkAttr fall back to the working tree on git's own failure, as
  fact.gate-git-helpers-ported says?
description: "The fact predates 5f88f13, and a reader takes its fallback rule as current."
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-15T16:36:17.025Z"
strauss_anchors:
  - file: packages/git-guard/src/check-attr.ts
    symbol: checkAttr
    hash: "sha256:4fe0d8345781772daaaa95bf1248cee1cd5c7f0382d498c45c3536ac85ee0b3b"
    hash_kind: ast
    resolved_at: "2026-09-15T16:49:57.597Z"
    lines: 66
    resolver: tree-sitter
strauss_links:
  - target: fact.gate-git-helpers-ported
    rel: informs
strauss_status: resolved
strauss_answered:
  by: mcp
  at: "2026-09-15T16:46:41.123Z"
strauss_owner: mcp
---

## Question

The fact says checkAttr 'falls back to the working tree only on git's own failure'. Since 5f88f13 it falls back only when stderr matches /unknown option/ (git before 2.40); an unresolvable rev is git's own failure and now reads nothing, unpinned. Should the fact be superseded with that rule?

## Why it matters

The fact is the record of how the port differs from lib/git.mjs; the fallback rule decides whether a branch's attributes apply.

## Default assumption

The fact is stale; the code's narrower rule holds.

Informs [fact.gate-git-helpers-ported](fact.gate-git-helpers-ported.md).

## Answer

Yes. fact.gate-git-helpers-ported-and-hardened supersedes it: checkAttr falls back to the working tree only when git rejects --source, an unresolvable rev reads nothing, the global and system attribute files are never read, and any attribute in .git/info/attributes unpins the read without spawning check-attr.

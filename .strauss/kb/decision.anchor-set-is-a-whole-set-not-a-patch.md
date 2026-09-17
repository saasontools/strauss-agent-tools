---
type: decision
title: >-
  anchor-set takes the whole anchor set, and guards the baseline rather than the
  membership
description: >-
  The caller has just read the record, so it holds every anchor including its
  baseline; carrying one forward under a new symbol is a field edit, not an
  operation that needs naming.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T20:11:25.571Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-set/command.ts
    symbol: anchorSetCommand
    hash: "sha256:b0d693d735b5c2267a057aba4ec5d940ce4ed917af32c2ff8eab3636e34c2283"
    hash_kind: raw
    resolved_at: "2026-09-17T20:11:53.511Z"
    lines: 48
    resolver: regex
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: updateAnchors
    hash: "sha256:a3af337f051a491a29e61ea7534e6cd111db984e1c59631df24862aa7e0276b0"
    hash_kind: ast
    resolved_at: "2026-09-17T20:11:53.526Z"
    lines: 30
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/index.ts
    symbol: KB_COMMANDS
    hash: "sha256:b41d5323c077d011ec6cd0a3adf54d2544b9f48c483ae63fe13cd0398929287e"
    hash_kind: raw
    resolved_at: "2026-09-17T20:11:53.527Z"
    lines: 37
    resolver: regex
  - file: packages/strauss-kb/src/commands/anchor-set/index.ts
    hash: "sha256:ef9eb0b8399c497feb1953047e2ed5fa3ba360809f44e025146d4ea94210412f"
    hash_kind: raw
    resolved_at: "2026-09-17T20:11:53.527Z"
    lines: 17
  - file: packages/strauss-kb/src/index.ts
    hash: "sha256:7c44ea7d6dd5aefb256fc3e9e9501a6053b38aa4e3ec75c4b6bbf2d73eee3f19"
    hash_kind: raw
    resolved_at: "2026-09-17T20:11:53.527Z"
    lines: 338
  - file: packages/strauss-kb/src/errors.ts
    symbol: ErrorTypes
    hash: "sha256:17962311fe64f977340f54b529d419b0582dd90fc809c27f723c731e31024b3f"
    hash_kind: raw
    resolved_at: "2026-09-17T20:11:53.528Z"
    lines: 23
    resolver: regex
strauss_links:
  - target: contract.anchor-baselines-are-the-records-not-the-callers
    rel: depends_on
strauss_status: accepted
---

## Decision

anchor-set takes the whole anchor set, and guards the baseline rather than the membership

## Rationale

The caller has just read the record, so it holds every anchor including its baseline; carrying one forward under a new symbol is a field edit, not an operation that needs naming.

## Rejected

A patch of replace/add/remove selectors, which is how SAA-820 specifies it and what this branch shipped first. Rejected after review: the selector language cost ~250 lines and ~880 tokens of MCP schema per context, five of the nine review findings lived in it, and it did not deliver the guarantee it was built for — remove-plus-add drops a baseline just as silently, and the author of the feature took that shortcut in two of four uses. A whole set makes the safe move the easy one: hand back what you read.

## Impact

Omitting an anchor deletes it, which is what anchor-resolve and reassess already do. The stale-read hazard is bounded where it matters: the set is checked inside the mutation, so a baseline another writer removed cannot be carried back in, and losing a stamped anchor needs dropBaselines. An unstamped anchor still goes silently.

Depends on [contract.anchor-baselines-are-the-records-not-the-callers](contract.anchor-baselines-are-the-records-not-the-callers.md).

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

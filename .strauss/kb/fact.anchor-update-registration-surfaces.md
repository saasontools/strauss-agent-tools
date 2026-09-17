---
type: fact
title: "anchor-update's registration hunks are mechanical, and a test asserts them"
description: A reviewer reading them line by line spends attention the patch logic needs.
tags:
  - review
  - "review:boilerplate"
generated:
  by: "agent:claude"
  at: "2026-09-17T17:59:36.758Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/index.ts
    hash: "sha256:036a7552ab639eeee559c67efeab9d432f9b40d501a647be8894d24f959186ba"
    hash_kind: raw
    resolved_at: "2026-09-17T17:59:46.470Z"
    lines: 88
  - file: packages/strauss-kb/src/commands/anchor-update/index.ts
    hash: "sha256:3d2739209ffbcaed33a75b4a465e3534cbda1d51dd788ee5bdf720239cdb20c8"
    hash_kind: raw
    resolved_at: "2026-09-17T17:59:46.472Z"
    lines: 19
  - file: packages/strauss-kb/src/index.ts
    hash: "sha256:03d0e05773c85569b403e462639a9f688699981737e089d76c7cc776c9aa8da4"
    hash_kind: raw
    resolved_at: "2026-09-17T17:59:46.473Z"
    lines: 338
  - file: packages/strauss-kb/src/errors.ts
    hash: "sha256:6a9a39019ccc23095bd3acecea25d7b2f5cdc97eb217817fdfb5c451983f2930"
    hash_kind: raw
    resolved_at: "2026-09-17T17:59:46.473Z"
    lines: 82
strauss_verify:
  - >-
    pnpm nx run @saasontools/strauss-kb:test — src/commands.spec.ts asserts
    CLI/MCP parity
strauss_status: accepted
---

## Claim

Four of this change's files carry registration only: the command table entry in commands/index.ts, the barrel in commands/anchor-update/index.ts, the re-exports in index.ts, and four members added to the ErrorTypes enum in errors.ts. No behaviour is decided in any of them.

## Evidence

commands.spec.ts asserts that every command with a tool name is registered as an MCP tool, that tool names mirror command names, and that names and tools are unique — so a missed or misspelled registration fails the suite rather than the review. The re-exports and the enum members are checked by tsc.

## Implication

Skim them. The judgment is in commands/anchor-update/patch.ts and command.ts, and in kb-store.ts's updateAnchors.

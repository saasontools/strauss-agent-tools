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
verified:
  - by: "agent:correctness"
    at: "2026-09-17T18:11:30.992Z"
    note: >-
      commands.spec.ts asserts tool registration, the sync-instructions
      exception, uniqueness of names and tools, and tool == kb_<name>; the suite
      passes with anchor-update present (35 tests green). The four anchors
      resolve to match.
strauss_anchors:
  - file: packages/strauss-kb/src/commands/index.ts
    symbol: KB_COMMANDS
    hash: "sha256:fd29e49108a3738e8654a2d4e47669c39f8116ad6bcb2cb0d1d2e1d3d5dcd95f"
    hash_kind: raw
    resolved_at: "2026-09-17T18:01:21.351Z"
    lines: 37
    resolver: regex
  - file: packages/strauss-kb/src/errors.ts
    symbol: ErrorTypes
    hash: "sha256:8aaefa6a951af2ae2309ed3729bc7683d82ef8ac1407cb1a4a3b33eb772c6860"
    hash_kind: raw
    resolved_at: "2026-09-17T18:01:21.355Z"
    lines: 24
    resolver: regex
  - file: packages/strauss-kb/src/index.ts
    hash: "sha256:f84aab1a0dc7ee02608cc7c80c64cad8ab91953b732d4a5e1bb1d25be7b18283"
    hash_kind: raw
    resolved_at: "2026-09-17T18:21:14.799Z"
    lines: 339
  - file: packages/strauss-kb/src/commands/anchor-update/index.ts
    hash: "sha256:3d2739209ffbcaed33a75b4a465e3534cbda1d51dd788ee5bdf720239cdb20c8"
    hash_kind: raw
    resolved_at: "2026-09-17T18:03:45.140Z"
    lines: 19
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

Skim them **for correctness**: the judgment is in commands/anchor-update/patch.ts and command.ts, and in kb-store.ts's updateAnchors. Mechanical is not free — the commands/index.ts entry projects a 34th MCP tool and is the largest per-turn cost in the change; risk.anchor-update-tool-adds-887-tokens-per-context carries the number.

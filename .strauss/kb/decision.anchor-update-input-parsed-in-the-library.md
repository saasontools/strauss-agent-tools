---
type: decision
title: >-
  applyAnchorPatch parses its own input, and a written locator names a symbol or
  a span
description: >-
  Typing the parameter guards the CLI and the MCP tool and nothing else; a
  library caller forwarding its own JSON could hand a locator a hash, which is
  the one thing this command exists to refuse.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T18:21:33.023Z"
verified:
  - by: "agent:correctness"
    at: "2026-09-17T18:35:51.955Z"
    note: >-
      Ran dist/index.cjs: applyAnchorPatch with a hash under add and under a
      replace's to throws ZodError 'Unrecognized key: hash', and a to naming
      both symbol and span throws 'a locator names a symbol or a span, not both'
      at path replace.0.to.span. patch.ts line 52 is the parse;
      kbAnchorLocatorSchema (read side) still accepts both, so a log entry
      parses.
  - by: "agent:security"
    at: "2026-09-17T18:36:42.993Z"
    note: >-
      Ran applyAnchorPatch from dist/index.cjs: a hash, a resolved_at and a
      __proto__ key under to or add are unrecognized_keys, and a to naming
      symbol and span is refused by kbAnchorLocatorWriteSchema rather than
      clearing both.
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/patch.ts
    symbol: applyAnchorPatch
    hash: "sha256:5a5d3336a3b0cdbfb61f4f7051d013a916332868a6a1fe9a170725d6f3397bb3"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:09.283Z"
    lines: 69
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-record.schema.ts
    symbol: kbAnchorLocatorWriteSchema
    hash: "sha256:a9eafe42f1ebcf4ee4e9de98ca8edb78c18f1043df75e04da69f687100c002b3"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:09.289Z"
    lines: 17
    resolver: regex
strauss_links:
  - target: risk.apply-anchor-patch-takes-a-caller-chosen-baseline
    rel: informs
  - target: risk.anchor-update-replacement-clears-symbol-and-span
    rel: informs
strauss_status: accepted
---

## Decision

applyAnchorPatch parses its own input, and a written locator names a symbol or a span

## Rationale

Typing the parameter guards the CLI and the MCP tool and nothing else; a library caller forwarding its own JSON could hand a locator a hash, which is the one thing this command exists to refuse.

## Rejected

Trust the type and rely on the surface schemas, the way most of the command table does. Rejected: compose.ts already settled this for the package — the CLI validates its stdin, a library caller has no such gate — and the store's write schema cannot help, because hash and resolved_at are legal anchor fields.

## Impact

applyAnchorPatch throws ZodError on a forged patch. The symbol-or-span rule moved to kbAnchorLocatorWriteSchema, mirroring kbAnchorWriteSchema against kbAnchorSchema, so a `to` naming both is refused instead of clearing both and keeping the hash. The read-side locator stays tolerant, so a log entry always parses.

Informs [risk.apply-anchor-patch-takes-a-caller-chosen-baseline](risk.apply-anchor-patch-takes-a-caller-chosen-baseline.md).

Informs [risk.anchor-update-replacement-clears-symbol-and-span](risk.anchor-update-replacement-clears-symbol-and-span.md).

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

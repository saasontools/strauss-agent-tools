---
type: decision
title: >-
  code-diff stays parse-free: it takes declarations, and the parse stays with
  the tree-sitter resolver
description: >-
  SAA-810 left the choice to the package cut: code-diff depends on
  anchor-resolver for the symbol step, or the step lives there. The containment
  rule is diff logic; enumerating declarations is parsing.
tags:
  - review
sources:
  - id: saa-810
    resource: "https://linear.app/saason/issue/SAA-810"
  - id: saa-812
    resource: "https://linear.app/saason/issue/SAA-812"
generated:
  by: mcp
  at: "2026-09-15T15:31:11.470Z"
verified:
  - by: unknown
    at: "2026-09-15T15:33:07.887Z"
    note: "anchor-resolve: 5/5 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/changed-symbols.ts
    symbol: changedSymbols
    hash: "sha256:3af8aa7350e92c6f8ee6346d244f4252da93f2f937bc9c887b1aa88e8fd5b772"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:36.149Z"
    lines: 22
    resolver: tree-sitter
  - file: packages/strauss-kb/src/changed-symbols.ts
    symbol: changedSymbolsIn
    hash: "sha256:fb43fa53fa58e94944d187e3f599c748e248b9507dbfae12efa52d6531c5a57c"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:36.157Z"
    lines: 21
    resolver: tree-sitter
  - file: packages/strauss-kb/src/tree-sitter-resolver/resolver.ts
    symbol: TreeSitterResolver.declarations
    hash: "sha256:90b25f702714f1dc0d3952640e1cbbb0485a36fdceecf8fb653314d29c7a302b"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:36.165Z"
    lines: 18
    resolver: tree-sitter
  - file: packages/strauss-kb/src/tree-sitter-resolver/definitions.ts
    symbol: declarationSpan
    hash: "sha256:97d1fa364c4efc28d1e1a91634979c7a85510eef1f50cff646ebfce7a78cb5db"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:36.167Z"
    lines: 19
    resolver: tree-sitter
  - file: packages/strauss-kb/src/tree-sitter-resolver/definitions.ts
    symbol: index
    hash: "sha256:16d6fe8d8009eae2a7f781b01bd1d065b71fc77c390571560135d3f7ff695cca"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:36.169Z"
    lines: 31
    resolver: tree-sitter
strauss_links:
  - target: test-obligation.changed-symbols-on-fixture
    rel: verified_by
strauss_status: accepted
---

## Decision

code-diff stays parse-free: it takes declarations, and the parse stays with the tree-sitter resolver

## Rationale

SAA-810 left the choice to the package cut: code-diff depends on anchor-resolver for the symbol step, or the step lives there. The containment rule is diff logic; enumerating declarations is parsing.

## Rejected

code-diff parsing itself: it would carry web-tree-sitter and the pinned grammars into a diff package, and today the resolver lives in strauss-kb, which depends on code-diff — a cycle.

## Impact

changedSymbols(file, declarations) holds the smallest-containing rule, blank-edge trimming and the funcname fallback. TreeSitterResolver.declarations (classes, functions, methods, interfaces, types, enums, widened over the comments above) and strauss-kb's changedSymbolsIn supply the parse; SAA-812 moves both with the resolver into anchor-resolver.

Verified by [test-obligation.changed-symbols-on-fixture](test-obligation.changed-symbols-on-fixture.md).

[^saa-810]: https://linear.app/saason/issue/SAA-810

[^saa-812]: https://linear.app/saason/issue/SAA-812

---
type: decision
title: >-
  uncovered.symbol, anchor.outside-diff and anchor.file-only move onto the parse
  in SAA-813, not here
description: >-
  SAA-810 asks both for those three hook checks to consume changedSymbols and
  for no behaviour change in the plugin, with the hook keeping its copies until
  step 4. Both cannot hold in one step; the Done-when line wins.
tags:
  - review
sources:
  - id: saa-810
    resource: "https://linear.app/saason/issue/SAA-810"
  - id: saa-813
    resource: "https://linear.app/saason/issue/SAA-813"
generated:
  by: mcp
  at: "2026-09-15T15:31:17.780Z"
verified: []
strauss_anchors:
  - file: packages/code-diff/src/changed-symbols.ts
    symbol: changedSymbols
    hash: "sha256:3af8aa7350e92c6f8ee6346d244f4252da93f2f937bc9c887b1aa88e8fd5b772"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:36.538Z"
    lines: 22
    resolver: tree-sitter
  - file: packages/code-diff/src/digest.ts
    symbol: digest
    hash: "sha256:5b4b01ec24c0af128d84601c30bb3ad68f4c5676b30dc0a9816568fba151dfae"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:36.540Z"
    lines: 3
    resolver: tree-sitter
strauss_links:
  - target: requirement.plugin-unchanged-until-saa-813
    rel: satisfies
strauss_status: accepted
strauss_materiality: important
strauss_confidence: medium
---

## Decision

uncovered.symbol, anchor.outside-diff and anchor.file-only move onto the parse in SAA-813, not here

## Rationale

SAA-810 asks both for those three hook checks to consume changedSymbols and for no behaviour change in the plugin, with the hook keeping its copies until step 4. Both cannot hold in one step; the Done-when line wins.

## Rejected

Rewiring the three checks now: the buildless hook would have to spawn or vendor code it cannot import, and its findings would change before SAA-813 replaces it anyway.

## Impact

The API and its fixture proof land here; the hook keeps contextSymbol, its DECLARATION regex and its own digest until SAA-813. Until then the regex refuses a file-only anchor on a pure re-export barrel — the case the parse-based rule accepts.

Satisfies [requirement.plugin-unchanged-until-saa-813](requirement.plugin-unchanged-until-saa-813.md).

[^saa-810]: https://linear.app/saason/issue/SAA-810

[^saa-813]: https://linear.app/saason/issue/SAA-813

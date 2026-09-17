---
type: risk
title: Replacing a symbol anchor with a span is refused for every ast-hashed anchor
description: >-
  The documented symbol-to-span replacement cannot run on a tree-sitter-hashed
  anchor, and the refusal names hash_kind, a field the caller cannot supply.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T18:34:59.096Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/patch.ts
    symbol: replacement
    hash: "sha256:2352ee8e3e543714f4e1f23599cbdf6bd81c50dbbf6037dc834cd8adbb41edc5"
    hash_kind: ast
    resolved_at: "2026-09-17T18:37:16.858Z"
    lines: 15
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-record.schema.ts
    symbol: kbAnchorWriteSchema
    hash: "sha256:502bba13179ba404b8f9de74466edc9303692d5372b4f676884eb179234029a8"
    hash_kind: raw
    resolved_at: "2026-09-17T18:37:16.866Z"
    lines: 32
    resolver: regex
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

replacement() in patch.ts keeps the whole baseline and clears only the other address field: 'const next = { ...anchor, ...wanted }; if (wanted.span !== undefined) delete next.symbol;'. Nothing clears hash_kind. A symbol anchor resolved by tree-sitter carries hash_kind: 'ast', so replacing it with a span yields { file, span, hash, hash_kind: 'ast', resolver: 'tree-sitter' }. KbStore.updateAnchors then runs kbAnchorWriteSchema.parse, whose refinement 'a span is hashed raw, never ast' rejects it. Ran it end to end: `strauss-kb anchor-update decision.demo` over an anchor { file, symbol, hash_kind: ast, resolver: tree-sitter } with to: { file, span: { start: 10, end: 20 } } exits 1 with `strauss-kb: error: [ { "code": "custom", "path": [ "hash_kind" ], "message": "a span is hashed raw, never ast" } ]` — a raw ZodError, no concept id, no anchor, no verb, on a key kbAnchorLocatorWriteSchema rejects as unrecognized when a caller writes it.

## Why it matters

ast is what tree-sitter stamps on every symbol anchor in a parsed language — every symbol anchor in this repository's own .strauss/kb carries hash_kind: ast — so the common case of the documented operation is the broken one. cli-reference.md says a replacement 'keeps the anchor's hash, hash_kind, lines, resolved_at and resolver' and that the only fields it may not change are repo, ref and side; the specification repeats it. Extraction into an inline block is the second refactor the feature exists for, and it is unreachable by replace. The workaround, remove plus add in one patch, works and lands one log entry, but the docs name remove-plus-add only for a repo/ref/side crossing and for clearing a field, never for this. No test catches it: every stamped fixture in anchor-update.spec.ts is hash_kind 'raw' / resolver 'regex', and the one covering test, 'a span replaces a symbol rather than joining it', seeds an anchor with no baseline at all.

## Mitigation

None in the diff. Either clear hash_kind (and hash) in replacement() when the destination names a span, which forfeits the baseline and so needs the same argument BOUNDARY_FIELDS got; or refuse a symbol-to-span replacement in replacement() with KbAnchorBoundaryError-style wording pointing at remove plus add; or add a span-shaped hash_kind coercion. Whichever, say it in cli-reference.md and add a fixture with hash_kind: 'ast'.

## Verification

applyAnchorPatch('d.x', [{ file: 'a.ts', symbol: 'foo', hash: 'sha256:'+'a'.repeat(64), hash_kind: 'ast', resolver: 'tree-sitter' }], { reason: 'r', replace: [{ from: { file: 'a.ts', symbol: 'foo' }, to: { file: 'a.ts', span: { start: 1, end: 5 } } }] }) returns anchors that kbAnchorWriteSchema.parse accepts, or applyAnchorPatch throws a named anchor-update error instead of the store throwing a ZodError.

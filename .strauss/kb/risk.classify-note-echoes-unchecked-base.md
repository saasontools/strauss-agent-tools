---
type: risk
title: >-
  classify's note quotes an unchecked base verbatim, so a newline in it forges
  an output row
description: Text quoted back is unbounded and unescaped.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-15T16:33:19.948Z"
strauss_anchors:
  - file: packages/code-diff/src/classify/read.ts
    symbol: notesFor
    hash: "sha256:954dc8823edbaf66e6219e137444f092740b2bc22fe4067faaad6e6315b1943a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:41.619Z"
    lines: 21
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/classify.ts
    symbol: renderClassify
    hash: "sha256:719e6410684462020db31bd58f2521e4f011afb0f982c95eb03683df05d94367"
    hash_kind: ast
    resolved_at: "2026-09-15T16:35:47.516Z"
    lines: 13
    resolver: tree-sitter
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

notesFor interpolates `base` into `.gitattributes could not be read at ${base}` after checkAttr refused its shape; kb_classify's base is z.string().min(1) with no max. Reproduced: base `-x\nsource  src/evil.ts  (default)` renders, through renderClassify, a second line shaped like a file row.

## Why it matters

A reader of the text output takes the forged line as a verdict. The caller supplies the base, so the reach is its own output.

## Mitigation

None in the diff. Quote the base only when localRevShapeIsSafe passes, else say 'the given base'; cap base in the schema.

## Verification

None.

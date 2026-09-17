---
type: risk
title: >-
  Selector matching and the duplicate check compare repo strings raw, not
  normalised
description: >-
  Two spellings of one remote pass the uniqueness check the patch exists to
  enforce.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T18:11:00.995Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/patch.ts
    symbol: fieldKey
    hash: "sha256:f532c7cce374517ad50d4d3eb2b410682f8a04219dcdb0c2d772a942252e28be"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:11.228Z"
    lines: 16
    resolver: tree-sitter
  - file: packages/strauss-kb/src/anchor-resolver/repo-identity.ts
    symbol: normalizeRepoUrl
    hash: "sha256:50d50900471bc5eb199e55973ff6ee210f57fe2d181ce283ab18a93edb204508"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:11.232Z"
    lines: 13
    resolver: tree-sitter
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

fieldKey() in patch.ts returns locator[field] for repo and ref, so matchesSelector, the BOUNDARY_FIELDS check and locatorKey all compare raw strings. normalizeRepoUrl in anchor-resolver/repo-identity.ts is the codebase's notion of repo identity ('normalised on both sides and compared') and is not used here. Against an anchor at repo 'https://github.com/org/name': an add of the same file and symbol at 'https://github.com/org/name.git' returns two anchors and no conflict, and a remove selector spelled 'git@github.com:org/name.git' throws KbAnchorSelectorError - no anchor matches.

## Why it matters

assertDestinationsAreUnique says a record holds each pointer once because two anchors at one locator 'would drift, resolve and rebaseline as a pair for ever'. The resolver treats the two spellings as one repository, so that pair is exactly what this patch can now create. The selector miss is the safe half - it refuses rather than moving the wrong pointer - but it refuses a spelling the rest of the package accepts.

## Mitigation

None in the diff. Run repo through normalizeRepoUrl inside fieldKey so selector matching, the boundary check and locatorKey share the resolver's identity.

## Verification

applyAnchorPatch over an anchor at 'https://github.com/org/name' with add of the same file and symbol at 'https://github.com/org/name.git' throws KbAnchorPatchConflictError.

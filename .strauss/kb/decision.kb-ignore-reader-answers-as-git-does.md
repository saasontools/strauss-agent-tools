---
type: decision
title: "The reader answers the question git answers, in linear time"
description: >-
  A rule is settled by what git already excludes, so the reader has to read a
  line the way git reads it: leading whitespace stays part of the pattern, only
  trailing whitespace goes, and a `#` comment is one whose first character it
  is. Matching is one forward scan with a single backtrack point over `*` and
  `?`, linear in the name. Anything else — a bracket expression, a backslash
  escape — is matched literally, so it fails to match and the rule is written
  anyway.
sources:
  - id: SAA-815
    resource: >-
      https://linear.app/saason/issue/SAA-815/create-scoped-git-ignore-rules-when-initializing-a-strauss-kb
    title: Create scoped Git ignore rules when initializing a Strauss KB
generated:
  by: mcp
  at: "2026-09-17T18:20:43.567Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: globMatches
    hash: "sha256:7d425393033dca4a6c5836eb66ef47f56d3c8144b72dac6bd98773b7762d98d9"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:03.366Z"
    lines: 28
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: pattern
    hash: "sha256:9ff158f13bce95c71162237bf05757f23a230087335656643ed6b19f30b99b6f"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:03.371Z"
    lines: 3
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-gitignore.ts
    symbol: ignoreRuleState
    hash: "sha256:69164de172ce59c24a620fba7434521831fe2a700ec481099ef23232ebf98797"
    hash_kind: ast
    resolved_at: "2026-09-17T18:22:03.372Z"
    lines: 8
    resolver: tree-sitter
strauss_verify:
  - >-
    missingIgnoreLines returns the rule for a 40-star line in under 100ms, and
    for `  *.sqlite*`
  - >-
    a git spec pins the reader's answer against check-ignore on the same
    leading-whitespace line
strauss_links:
  - target: decision.kb-ignore-anchored-per-location
    rel: informs
strauss_status: accepted
strauss_supersedes:
  - decision.kb-ignore-idempotence-by-covered-files
---

## Decision

The reader answers the question git answers, in linear time

## Rationale

A rule is settled by what git already excludes, so the reader has to read a line the way git reads it: leading whitespace stays part of the pattern, only trailing whitespace goes, and a `#` comment is one whose first character it is. Matching is one forward scan with a single backtrack point over `*` and `?`, linear in the name. Anything else — a bracket expression, a backslash escape — is matched literally, so it fails to match and the rule is written anyway.

## Rejected

The regex this supersedes, which expanded each `*` to an adjacent `[^/]*` and trimmed each line before matching. Two failures, both found in review. A checked-in line of 14 stars backtracks for 84 seconds inside every mutation, synchronously, on a file that arrives with a clone — the superseded record priced the matcher at "a redundant line and never a wrong exclusion" and never priced that. And trimming read `  *.sqlite*` as coverage where git reads a pattern matching names that start with two spaces, leaving the index and its sidecars tracked with nothing logged. A redundant rule is the safe error; a missing one is not, so the two directions are not interchangeable.

Informs [decision.kb-ignore-anchored-per-location](decision.kb-ignore-anchored-per-location.md).

[^SAA-815]: Create scoped Git ignore rules when initializing a Strauss KB

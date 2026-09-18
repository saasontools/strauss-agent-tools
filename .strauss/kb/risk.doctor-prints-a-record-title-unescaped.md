---
type: risk
title: >-
  doctor prints a foreign record's title unescaped, forging a bullet under a
  counted header
description: >-
  reassess bounds a quoted title now; doctor's group renderer still interpolates
  it raw.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-17T21:52:36.434Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/doctor.ts
    symbol: render
    hash: "sha256:c127d367fef4df53c85798b2655b8aa81abc6ab8d4f18b268f2b122faeacbd9c"
    hash_kind: ast
    resolved_at: "2026-09-17T21:52:48.153Z"
    lines: 45
    resolver: tree-sitter
  - file: packages/strauss-kb/src/doctor.ts
    symbol: finding
    hash: "sha256:7653622f246832c3f38b1074a51d3756d6aa341b99f7242e1bdb1b8a5848c7ca"
    hash_kind: ast
    resolved_at: "2026-09-17T21:52:48.160Z"
    lines: 8
    resolver: tree-sitter
  - file: packages/strauss-kb/src/doctor.ts
    symbol: supersededButCited
    hash: "sha256:3f43b815b716c07413bac0d09718946d4cd19cb20aafad9c0b9ea334806f1ee8"
    hash_kind: ast
    resolved_at: "2026-09-17T21:52:48.161Z"
    lines: 22
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/reassess.ts
    symbol: renderReassess
    hash: "sha256:836ca86477b52e3f29f08b288020bd62c1490e20f79710c092f169416110e8d3"
    hash_kind: ast
    resolved_at: "2026-09-17T21:52:48.169Z"
    lines: 89
    resolver: tree-sitter
strauss_links:
  - target: decision.strauss-links-is-the-one-representation
    rel: informs
strauss_status: open
strauss_supersedes:
  - risk.record-title-forges-a-line-in-a-prose-report
strauss_materiality: important
strauss_confidence: high
---

## Risk

doctor's group renderer interpolates another record's title verbatim (commands/doctor.ts:246), and doctor.ts's finding() copies it off the frontmatter unchanged. title is z.string().min(1): no charset, no length bound, and a YAML double-quoted scalar decodes escape and newline into real bytes. This range rewrites two of the checks that reach that renderer, orphaned and supersededButCited, both now fed by outboundReferences.

The records reaching it are by construction ones other actors wrote.

## Why it matters

A newline in a title ends the tool's bullet and starts an attacker's, inside a section whose header states a count. An agent reading the report cannot tell the forged finding from a real one, and ANSI escapes reach the terminal of whoever ran doctor. JSON output is unaffected.

## Mitigation

Partial, and only on the other surface: reassess now passes every foreign title through oneLine (reassess.ts), which strips Cc and Cf and collapses whitespace, in the header, in 'Still pointing here' and in 'Impact'. doctor got no such call. The repair is that one helper, shared by the prose renderers, plus a length bound neither has.

## Verification

Four-record scratch bundle against the dist built at HEAD; risk.hostile's title is a YAML double-quoted scalar carrying two ESC sequences and an escaped newline. doctor printed the raw escapes and a fabricated bullet twice: five bullets under '## orphaned (4)' and two under '## superseded-but-cited (1)'. reassess on the same bundle printed the title flattened to one line.

Informs [decision.strauss-links-is-the-one-representation](decision.strauss-links-is-the-one-representation.md).

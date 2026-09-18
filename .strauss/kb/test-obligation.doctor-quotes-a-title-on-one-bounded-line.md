---
type: test-obligation
title: doctor's report quotes every foreign title through the shared one-line bound
description: >-
  doctor is the reader a reviewing agent runs over a whole base, and every title
  it quotes was written by some other actor.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-18T15:28:30.599Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/model.ts
    symbol: oneLine
    hash: "sha256:0f05680ae784e70293c7690a5722c223abc9c6ac661897679a3652ba199ff13f"
    hash_kind: ast
    resolved_at: "2026-09-18T15:28:51.428Z"
    lines: 9
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/doctor.ts
    symbol: render
    hash: "sha256:f56495c24f91b472d404b88a623e68890a32420914ae31804d70403b224152de"
    hash_kind: ast
    resolved_at: "2026-09-18T15:28:51.437Z"
    lines: 45
    resolver: tree-sitter
strauss_links:
  - target: risk.doctor-prints-a-record-title-unescaped
    rel: satisfies
strauss_status: open
---

## Obligation

`doctor`'s group renderer passes each finding's title through `oneLine` from `commands/model.ts` — the same helper `reassess` uses — which replaces control and format characters with spaces, collapses whitespace, and cuts at 200 characters. A title can fill its row; it cannot open another one or reach the terminal as an escape sequence.

## Why it matters

A newline in a title ends the tool's bullet and starts one the tool did not write, inside a section whose header states a count. An agent reading the report cannot tell a forged finding from a real one.

## How to verify

`src/kb-references/references.spec.ts` — "a title cannot forge a row in doctor's report either" rewrites a record's title to a YAML scalar carrying ESC and a newline followed by a forged bullet, runs `doctorCommand`, and asserts the rendered report holds no ESC byte and no line beginning with the forged row.

Satisfies [risk.doctor-prints-a-record-title-unescaped](risk.doctor-prints-a-record-title-unescaped.md).

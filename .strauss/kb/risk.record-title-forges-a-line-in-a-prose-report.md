---
type: risk
title: >-
  A record's own title puts escapes and a fabricated finding line into
  reassess's report
description: >-
  The report a human and an agent read as the tool's output carries
  record-controlled bytes.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-17T19:33:46.974Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/reassess.ts
    symbol: renderReassess
    hash: "sha256:836ca86477b52e3f29f08b288020bd62c1490e20f79710c092f169416110e8d3"
    hash_kind: ast
    resolved_at: "2026-09-17T21:35:10.842Z"
    lines: 89
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-references/stale.ts
    symbol: liveReferencesTo
    hash: "sha256:8ce1d7d74bf8bb22327c317f5b320348ff2d8c91f28ba9feee252c079293bae2"
    hash_kind: ast
    resolved_at: "2026-09-17T21:35:10.845Z"
    lines: 24
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/doctor.ts
    symbol: render
    hash: "sha256:f56495c24f91b472d404b88a623e68890a32420914ae31804d70403b224152de"
    hash_kind: ast
    resolved_at: "2026-09-18T15:28:52.910Z"
    lines: 45
    resolver: tree-sitter
strauss_links:
  - target: decision.reassess-references-ride-in-the-packet
    rel: informs
strauss_status: superseded
strauss_superseded_by: risk.doctor-prints-a-record-title-unescaped
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

`renderReassess`'s new `## Still pointing here` section interpolates `entry.title` verbatim (reassess.ts:276), and `liveReferencesTo` copies it off the cited record's frontmatter unchanged (stale.ts:94). `title` is `z.string().min(1)`: no charset, no length bound, and a YAML double-quoted scalar decodes `\e` and `\n` into real bytes. The records in `incoming` are by construction the ones other actors wrote.

## Why it matters

A newline in a title ends the tool's bullet and starts an attacker's, inside a section whose header states a count. An agent reading the packet cannot tell the forged line from a finding, and ANSI escapes reach the terminal of whoever runs the command.

## Mitigation

None. The same interpolation is already in `## Impact` two lines below (reassess.ts:286) and in `doctor`'s group renderer (commands/doctor.ts:246), so the repair is one bound-and-strip shared by the prose renderers, not a change to this section. `--json` output is not affected: JSON escapes the control characters.

## Verification

Four-record scratch bundle; `risk.hostile`'s title carried `\e[31mHACKED\e[0m\n- decision.new-way [current] (body) - fabricated`. `doctor` on the built dist printed the raw escapes and the forged bullet under `## orphaned (3)` — four bullets under a count of three. `liveReferencesTo("decision.old-way", …)` on the same bundle returned that title unchanged, which is what reassess.ts:276 renders.

Informs [decision.reassess-references-ride-in-the-packet](decision.reassess-references-ride-in-the-packet.md).

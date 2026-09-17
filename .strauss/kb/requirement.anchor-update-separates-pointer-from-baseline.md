---
type: requirement
title: >-
  Pointer maintenance, baseline acceptance and verification stay three separate
  acts
description: >-
  One command that moved a pointer and accepted the code would let a refactor's
  behaviour change pass as a rename, which is the drift check's whole purpose.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
  - id: saa-816
    resource: "https://linear.app/saason/issue/SAA-816"
    title: "anchor-resolve stops writing verified[]; a read-only --check for the gate"
generated:
  by: "agent:claude"
  at: "2026-09-17T17:50:25.691Z"
verified:
  - by: "agent:security"
    at: "2026-09-17T18:11:25.426Z"
    note: >-
      Read anchorUpdateCommand end to end: no resolver, no reader, no network,
      no verified[] and no status write; assertBaseNotFrozen runs first and the
      result is baseline: unchanged. Holds at the CLI and MCP boundary; see
      risk.apply-anchor-patch-takes-a-caller-chosen-baseline for the library
      export.
  - by: "agent:correctness"
    at: "2026-09-17T18:11:40.464Z"
    note: >-
      command.ts and patch.ts import no resolver and write no verified[] or
      standing; result carries baseline: 'unchanged' and NOTE. Test 'writes no
      verified[] event' asserts frontmatter.verified is empty after a run.
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/command.ts
    symbol: anchorUpdateCommand
    hash: "sha256:368d9fff3c057709195f1fb7c35481c51d84a83031771e03146f4cedae66f6df"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:10.517Z"
    lines: 52
    resolver: regex
strauss_links:
  - target: test-obligation.anchor-update-keeps-baselines
    rel: verified_by
strauss_status: proposed
---

## Claim

anchor-update writes pointers and an audit entry only. It never resolves, fetches, stamps, rebaselines, verifies or moves standing; accepting the code is anchor-resolve --rebaseline and judging it is verify.

## Evidence

SAA-820 implementation requirement 4, and SAA-816's separation of anchor checking from verification, which this must not reintroduce.

## Implication

A caller that moves a pointer still owes a review pass. The result says so in `baseline: "unchanged"` and its note, so an agent reading only the result knows the next step.

Verified by [test-obligation.anchor-update-keeps-baselines](test-obligation.anchor-update-keeps-baselines.md).

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

[^saa-816]: anchor-resolve stops writing verified[]; a read-only --check for the gate

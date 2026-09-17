---
type: decision
title: >-
  The log reads forward, the address kind is a boundary, and a patch may not
  empty a record
description: >-
  Three of the second round's findings share one shape: a guarantee stated in
  prose that the code did not hold, where the failing case was the common one
  rather than the exotic one.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T18:50:02.443Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/commands/anchor-update/patch.ts
    symbol: replacement
    hash: "sha256:94cbb260877cbc5e366b2c0414de9edd33d2561135a17d428ddbacf99725c555"
    hash_kind: ast
    resolved_at: "2026-09-17T18:50:02.786Z"
    lines: 27
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-log.ts
    symbol: kbLogEntrySchema
    hash: "sha256:d68e066fe4af4a3a854ba101dd1797fd87126322b41089ab5d36d20f7d47b1f8"
    hash_kind: raw
    resolved_at: "2026-09-17T18:50:02.790Z"
    lines: 1
    resolver: regex
  - file: packages/strauss-kb/src/commands/anchor-update/errors.ts
    symbol: locatorText
    hash: "sha256:8b57d0292f939cb02dcb07604b230f1eed2da2f06e9fe16e0ea74002d8a57877"
    hash_kind: ast
    resolved_at: "2026-09-17T18:50:02.792Z"
    lines: 7
    resolver: tree-sitter
strauss_links:
  - target: risk.anchor-update-entries-are-malformed-to-a-released-reader
    rel: informs
  - target: risk.anchor-update-span-replacement-refused-on-ast-baseline
    rel: informs
  - target: risk.anchor-update-can-empty-another-actors-record
    rel: informs
  - target: risk.anchor-update-errors-quote-a-locator-unbounded
    rel: informs
strauss_status: accepted
---

## Decision

The log reads forward, the address kind is a boundary, and a patch may not empty a record

## Rationale

Three of the second round's findings share one shape: a guarantee stated in prose that the code did not hold, where the failing case was the common one rather than the exotic one.

## Rejected

Document each as a limitation instead. Rejected for all three: a reader older than this release already refuses the audit lines, so only changing the schema stops the next field repeating it; the symbol-to-span replacement failed with a raw ZodError on the shape tree-sitter stamps on every symbol anchor, which is the documented operation, not an edge; and an emptied record keeps its standing and its verified[] while nothing is left to drift.

## Impact

kbLogEntrySchema keeps unknown keys and kbLogEntryWriteSchema stays strict. A stamped anchor may not swap symbol for span or back — the same argument BOUNDARY_FIELDS got, since an ast hash is over a token stream and a span is hashed raw; unstamped, the swap is free. A patch whose result is empty is refused. locatorText caps each field at 120 characters, because the message and details both reach a caller's context. What is not fixed: anchor-update still has no authorship test, so a reviewer may move an author's pointers — deliberate, matching anchor-resolve, and the half of risk.anchor-update-can-empty-another-actors-record that stays open.

Informs [risk.anchor-update-entries-are-malformed-to-a-released-reader](risk.anchor-update-entries-are-malformed-to-a-released-reader.md).

Informs [risk.anchor-update-span-replacement-refused-on-ast-baseline](risk.anchor-update-span-replacement-refused-on-ast-baseline.md).

Informs [risk.anchor-update-can-empty-another-actors-record](risk.anchor-update-can-empty-another-actors-record.md).

Informs [risk.anchor-update-errors-quote-a-locator-unbounded](risk.anchor-update-errors-quote-a-locator-unbounded.md).

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

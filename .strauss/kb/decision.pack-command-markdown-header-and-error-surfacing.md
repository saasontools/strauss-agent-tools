---
type: decision
title: >-
  kb_pack renders markdown with the timestamp on one header line; budget refusal
  propagates uncaught with excluded ids in details
description: >-
  Unlike kb_load (JSON), the pack command returns a rendered markdown document
  because its contract is presentational: the only nondeterministic byte is
  ctx.now() on the header's final 'packed:' line, so a consumer diffs two packs
  by dropping everything through that line — byte-identical body means unchanged
  knowledge. The budget refusal is re-thrown untouched:
  KbPackBudgetExceededError's message carries counts and the remedy, and the
  excluded ids travel in BaseError.details. The in-process CLI tests therefore
  pin the thrown typed error (name + details.excluded) and empty stdout rather
  than stderr text, because error-to-text rendering belongs to cli-main.ts and
  the MCP SDK, outside the command registry and outside this subtask's file
  scope.
generated:
  by: mcp
  at: "2026-08-26T05:59:03.823Z"
verified:
  - by: "agent:security-reviewer"
    at: "2026-09-14T17:04:22.237Z"
    note: >-
      Security review 2026-09-14 vs main@b0b88be: holds. commands/pack.ts run()
      returns render(result, path, now()) with no try/catch; render() uses the
      timestamp only on the 'packed:' header line. KbPackBudgetExceededError
      (kb-errors.ts:78-92) carries excluded in details. cli.spec.ts:463-537 pins
      the packed: line, byte-identical body after it, and the thrown error name
      plus details.excluded.
  - by: unknown
    at: "2026-09-15T07:46:42.289Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T07:48:16.097Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/strauss-kb/src/commands/pack.ts
    symbol: render
    hash: "sha256:ab3b30e3b0547403900c30129f9554d3115f23d747b47c4d50469f97e160f085"
    hash_kind: ast
    resolved_at: "2026-09-15T07:43:48.310Z"
    lines: 48
    resolver: tree-sitter
strauss_status: accepted
strauss_materiality: important
strauss_confidence: high
---

## Decision

kb_pack renders markdown with the timestamp on one header line; budget refusal propagates uncaught with excluded ids in details

## Rationale

Unlike kb_load (JSON), the pack command returns a rendered markdown document because its contract is presentational: the only nondeterministic byte is ctx.now() on the header's final 'packed:' line, so a consumer diffs two packs by dropping everything through that line — byte-identical body means unchanged knowledge. The budget refusal is re-thrown untouched: KbPackBudgetExceededError's message carries counts and the remedy, and the excluded ids travel in BaseError.details. The in-process CLI tests therefore pin the thrown typed error (name + details.excluded) and empty stdout rather than stderr text, because error-to-text rendering belongs to cli-main.ts and the MCP SDK, outside the command registry and outside this subtask's file scope.

## Rejected

Catching KbPackBudgetExceededError inside the command to print the excluded ids itself. Rejected: one registry entry must behave identically on both surfaces, and per-command error rendering forks the error contract the surfaces already share. Also rejected: returning KbPackResult as JSON like kb_load, which would push the header/timestamp and byte-diff contract onto every consumer.

## Impact

Anyone editing render() must keep the timestamp confined to the single 'packed:' header line or the determinism tests break. Anyone who wants excluded ids visible in CLI stderr text (not just in the typed error's details) must change cli-main.ts's BaseError rendering, not the pack command.

Relates to [decision.pack-full-walk-named-exclusions-shared-stub-cost](decision.pack-full-walk-named-exclusions-shared-stub-cost.md).

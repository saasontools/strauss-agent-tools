---
type: contract
title: The record-type enum is the write contract every base is read against
description: >-
  Removing a member breaks every base that holds one, so a removal is a breaking
  release with a refusal naming the replacement.
generated:
  by: "agent:author"
  at: "2026-09-18T21:24:17.170Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-record.schema.ts
    symbol: KB_RECORD_TYPES
    hash: "sha256:a7eecaee9b2764667ef5408a695c369dbeabe8dcbfa99adc870805b7768bbc42"
    hash_kind: raw
    resolved_at: "2026-09-18T21:24:51.908Z"
    lines: 13
    resolver: regex
strauss_links:
  - target: decision.retire-test-obligation
    rel: related_to
strauss_status: proposed
---

## Contract

KB_RECORD_TYPES lists the types kb_write accepts and kb_types describes. A retired type stays in RETIRED_RECORD_TYPES so a write of it is refused with what replaces it.

## Producer

packages/strauss-kb: the schema, the record-type table and the write command.

## Consumer

Agents calling kb_write and kb_types, and every committed base; validate reports a type outside the enum as unrecognised.

## Compatibility

Adding a type is compatible. Removing one is breaking: a major version plan, and bases migrated before the release reaches them.

Relates to [decision.retire-test-obligation](decision.retire-test-obligation.md).

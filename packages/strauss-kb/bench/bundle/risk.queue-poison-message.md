---
type: risk
title: A poison message can stall a job stream
tags:
  - queue
  - reliability
generated:
  by: meridian-platform
  at: "2026-03-02"
strauss_status: open
strauss_materiality: important
strauss_owner: meridian-platform
---

## Risk

A message that deterministically crashes its consumer blocks the ordered stream behind it for the tenants sharing that subject.

## Why it matters

Ordered per-subject delivery means head-of-line blocking is real: one bad payload delays every later reminder on that subject.

## Mitigation

The consumer counts redeliveries and moves a message to the dead-letter stream after the retry budget rather than looping.

## Verification

A test publishes a payload the consumer cannot decode and asserts the stream drains.

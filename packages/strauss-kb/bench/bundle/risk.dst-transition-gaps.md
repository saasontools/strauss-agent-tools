---
type: risk
title: Daylight-saving transitions create impossible appointment times
tags:
  - scheduling
  - time
generated:
  by: meridian-scheduling
  at: "2026-05-19"
strauss_status: open
strauss_materiality: important
strauss_owner: meridian-scheduling
---

## Risk

A wall-clock time inside a spring-forward gap has no instant, and one inside a fall-back overlap has two.

## Why it matters

Storing wall-clock time makes these representable, so a recurring series can generate a booking that cannot be resolved to a moment.

## Mitigation

Resolution picks the later instant for an overlap and shifts a gap time forward by the gap length, and the series generator flags what it shifted.

## Verification

Fixtures cover a spring-forward gap and a fall-back overlap in a southern-hemisphere zone as well as a northern one.

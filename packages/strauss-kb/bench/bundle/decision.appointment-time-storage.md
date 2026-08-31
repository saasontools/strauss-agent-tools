---
type: decision
title: Appointment times are stored in UTC
tags:
  - scheduling
  - time
generated:
  by: meridian-scheduling
  at: "2025-11-06"
strauss_status: superseded
strauss_superseded_by: decision.wall-clock-time-storage
strauss_owner: meridian-scheduling
---

## Decision

An appointment is persisted as a UTC instant. The tenant's configured timezone is applied when rendering.

## Rationale

One canonical instant makes ordering, overlap detection, and reminder scheduling comparisons trivial.

## Rejected

Storing the local time with its zone, which was seen as pushing conversion cost into every read.

## Impact

Every read path applies the tenant timezone. Reminder offsets are computed against the stored instant.

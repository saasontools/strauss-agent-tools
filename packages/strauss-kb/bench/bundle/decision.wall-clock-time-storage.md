---
type: decision
title: Appointment times are stored as local wall-clock plus an IANA zone id
tags:
  - scheduling
  - time
generated:
  by: meridian-scheduling
  at: "2026-05-26"
strauss_status: accepted
strauss_supersedes:
  - decision.appointment-time-storage
strauss_confidence: medium
strauss_owner: meridian-scheduling
---

## Decision

An appointment is persisted as a local wall-clock date-time together with the IANA zone id it was booked in. The absolute instant is derived at read time and materialised into an index column for range queries.

## Rationale

A recurring 09:00 appointment has to stay at 09:00 across a daylight-saving transition, and a fixed absolute instant cannot express that. Zone rules also move: a tzdata release can change what 09:00 in a zone means, and only a stored wall-clock time follows it.

## Rejected

Storing both the absolute instant and the zone, which is two sources of truth that drift on a tzdata update. Storing an absolute instant alone, which cannot represent a recurring local time at all.

## Impact

The derived index column is rebuilt when tzdata updates. Overlap detection compares derived instants and needs the zone loaded.

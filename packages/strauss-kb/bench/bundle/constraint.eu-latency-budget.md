---
type: constraint
title: p99 API latency must stay under 300 ms in eu-central-1
tags:
  - performance
  - sla
generated:
  by: meridian-platform
  at: "2026-01-05"
strauss_status: accepted
strauss_confidence: high
strauss_owner: meridian-platform
---

## Claim

The p99 server-side latency of the appointment read and write endpoints must stay below 300 ms measured in eu-central-1.

## Evidence

Clinic front-desk staff book while a patient waits; usability testing put visible hesitation above roughly a third of a second.

## Implication

Anything added to the request path -- an extra hop, a synchronous export, a second datastore read -- has to be measured against this budget before it ships.

---
type: constraint
title: Webhook payloads are capped at 1 MB
tags:
  - webhooks
  - limits
generated:
  by: meridian-notify
  at: "2026-04-14"
strauss_status: accepted
strauss_supersedes:
  - constraint.webhook-payload-cap
strauss_confidence: high
strauss_owner: meridian-notify
---

## Claim

A webhook payload the platform sends is at most 1 MB. Anything larger is truncated and the event carries a fetch URL.

## Evidence

The dispatcher streams bodies rather than buffering whole frames, so the ceiling is set by what receivers tolerate and not by our own memory. The roster-sync event legitimately exceeds half a megabyte for tenants above two hundred practitioners.

## Implication

Roster-sync fits in one delivery. Receivers are told the ceiling in the integration guide so they can size their own limits.

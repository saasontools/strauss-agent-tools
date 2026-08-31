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

A webhook payload the platform sends is at most 1 MB. Anything larger is truncated and the event carries a fetch URL instead.

## Evidence

The dispatcher now streams bodies rather than buffering whole frames, and the roster-sync event legitimately exceeds 256 KB for tenants above two hundred practitioners.

## Implication

Roster-sync stops fanning out across deliveries. Receivers are told the ceiling in the integration guide so they can size their own limits.

---
type: constraint
title: Webhook payloads are capped at 256 KB
tags:
  - webhooks
  - limits
generated:
  by: meridian-notify
  at: "2025-10-09"
strauss_status: superseded
strauss_superseded_by: constraint.large-webhook-payloads
strauss_owner: meridian-notify
---

## Claim

A webhook payload the platform sends is at most 256 KB. Anything larger is truncated and the event carries a fetch URL instead.

## Evidence

The dispatcher's buffer pool is sized for 256 KB frames, and the two largest receivers documented a 512 KB body limit at the time.

## Implication

Batch events fan out into several deliveries rather than one large body.

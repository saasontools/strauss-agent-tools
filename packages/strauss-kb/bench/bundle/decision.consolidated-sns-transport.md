---
type: decision
title: Both SMS and email go through Amazon SNS
tags:
  - notifications
  - vendors
generated:
  by: meridian-notify
  at: "2025-12-03"
strauss_status: superseded
strauss_supersedes:
  - decision.notification-transport
strauss_superseded_by: decision.split-ses-twilio-transport
strauss_owner: meridian-notify
---

## Decision

Both notification channels publish to Amazon SNS topics; SNS delivers SMS directly and email via a subscription.

## Rationale

One vendor, one credential, one bill, and the fan-out already lives in the account.

## Rejected

Keeping two specialist providers, which was double the integration surface for a volume that had not yet grown.

## Impact

The bounce reconciliation job collapses to one source. Per-message templating moves into the publisher.

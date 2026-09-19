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

Both notification channels publish to Amazon SNS topics; SNS delivers SMS directly and email through a subscription.

## Rationale

One vendor, one credential, one bill, and the fan-out already lives in the account.

## Rejected

A specialist provider per channel, which doubles the integration surface for a volume this size. A self-hosted SMTP relay, which puts the deliverability reputation problem on the team.

## Impact

Bounce reconciliation has a single source. Per-message templating lives in the publisher.

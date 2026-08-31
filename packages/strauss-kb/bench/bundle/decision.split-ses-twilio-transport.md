---
type: decision
title: Email goes through Amazon SES and SMS through Twilio
tags:
  - notifications
  - vendors
generated:
  by: meridian-notify
  at: "2026-05-12"
strauss_status: accepted
strauss_supersedes:
  - decision.consolidated-sns-transport
strauss_confidence: high
strauss_owner: meridian-notify
---

## Decision

Transactional email leaves through Amazon SES with a dedicated IP pool. SMS leaves through Twilio using per-country sender ids.

## Rationale

SNS email offered no dedicated IP pool and no per-domain reputation view, and its SMS path could not register the alphanumeric sender ids several markets require. Splitting the channels buys both without going back to two email vendors.

## Rejected

Keeping SNS for email, which cannot supply a dedicated IP pool. Postmark, whose per-message price at the projected volume was several times the SES line.

## Impact

Two vendors again, deliberately. Bounce handling forks: SES publishes to a notification topic, Twilio to a status callback.

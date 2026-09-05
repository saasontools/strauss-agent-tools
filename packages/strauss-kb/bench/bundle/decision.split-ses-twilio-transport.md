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

Email at this volume needs a dedicated IP pool and a per-domain reputation view, and several SMS markets require a registered alphanumeric sender id. No single provider supplies both, so each channel takes the provider that does its half well.

## Rejected

A single cloud messaging service for both channels, which supplies neither a dedicated IP pool nor alphanumeric sender registration. Postmark, whose per-message price at this volume is several times the SES line.

## Impact

Two vendor credentials and two rate-limit models. Bounce handling forks: SES publishes to a notification topic, Twilio to a status callback.

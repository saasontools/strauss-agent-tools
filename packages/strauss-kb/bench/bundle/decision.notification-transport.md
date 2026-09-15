---
type: decision
title: SMS goes through Twilio and email through SendGrid
tags:
  - notifications
  - vendors
generated:
  by: meridian-notify
  at: "2025-09-25"
strauss_status: superseded
strauss_superseded_by: decision.consolidated-sns-transport
strauss_owner: meridian-notify
---

## Decision

Appointment reminders and transactional mail leave the platform through two providers: Twilio for SMS, SendGrid for email.

## Rationale

Both were already in use by the pilot product and had usable deliverability reporting on day one.

## Rejected

A single provider for both channels, which means accepting the weaker of the two deliverability records.

## Impact

Two vendor credentials, two rate-limit models, and two bounce webhooks to reconcile.

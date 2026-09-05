---
type: decision
title: Subscription billing runs on Stripe Billing
tags:
  - billing
  - vendors
generated:
  by: meridian-commerce
  at: "2025-11-20"
strauss_status: accepted
strauss_confidence: high
strauss_owner: meridian-commerce
---

## Decision

Plans, subscriptions, invoices, and dunning are held in Stripe Billing. The platform stores only the customer and subscription identifiers.

## Rationale

Tax handling, dunning, and the invoice PDFs are the majority of the work and are bought rather than built.

## Rejected

Chargebee, which priced above Stripe at the projected volume for capabilities the product does not use. In-house metering and invoicing, which is a team's worth of work plus tax compliance.

## Impact

Subscription state is authoritative in Stripe and mirrored locally through webhooks. An outage there degrades signup, not scheduling.

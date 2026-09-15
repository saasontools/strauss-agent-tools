---
type: open-question
title: "Should tenants be able to send email through their own SMTP relay?"
tags:
  - notifications
  - product
generated:
  by: meridian-notify
  at: "2026-02-12"
strauss_status: open
strauss_materiality: non-blocking
strauss_owner: meridian-notify
---

## Question

Do we let a tenant configure their own SMTP relay for outbound transactional mail, or does everything leave through the platform's own sender?

## Why it matters

Bring-your-own SMTP moves deliverability, bounce handling, and the reputation problem to the tenant, and the bounce reconciliation job would need a per-tenant source.

## Default assumption

Unanswered. Two prospects have asked; neither has signed.

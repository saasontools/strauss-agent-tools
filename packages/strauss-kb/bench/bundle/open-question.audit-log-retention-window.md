---
type: open-question
title: "How long must audit log entries be retained?"
tags:
  - audit
  - compliance
generated:
  by: meridian-identity
  at: "2026-01-29"
strauss_status: resolved
strauss_answered:
  by: decision.audit-log-retention
  at: "2026-03-19"
strauss_materiality: important
strauss_owner: meridian-identity
---

## Question

How long does the platform keep audit log entries before deleting them?

## Why it matters

It sets the storage footprint of the audit table and whether the export feature is a convenience or the only way a customer meets an obligation.

## Default assumption

Answered: 400 days. The reasoning and the alternatives considered are in the decision that settled it.

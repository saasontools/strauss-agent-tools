---
type: open-question
title: How long must audit log entries be retained?
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

It sets the storage footprint of the audit table, and it decides whether the export feature is a convenience or the only way a customer meets an obligation.

## Default assumption

None. The window is a policy question for whoever owns the compliance commitment.

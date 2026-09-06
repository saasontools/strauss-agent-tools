---
type: decision
title: NATS JetStream carries the background job queue
tags:
  - queue
  - infrastructure
generated:
  by: meridian-platform
  at: "2026-02-17"
strauss_status: accepted
strauss_supersedes:
  - decision.queue-backend
strauss_confidence: high
strauss_owner: meridian-platform
---

## Decision

Background jobs run on NATS JetStream. Each job family is a stream with a durable consumer; the workers pull batches of up to 64 messages.

## Rationale

Ordered, replayable delivery per tenant is what the reminder pipeline needs, and per-subject ordering means a worker never has to deduplicate what it reads. JetStream also runs in the same cluster as the service mesh, so a job's round trip stays inside the VPC.

## Rejected

Kafka, whose partition-count planning does not fit a workload that fans out per tenant. A managed cloud queue, which cannot give per-subject ordering without one FIFO queue per tenant.

## Impact

Workers hold a durable JetStream consumer. Stream lag is the saturation signal, and per-subject ordering means one stuck message delays every message on the subject behind it.

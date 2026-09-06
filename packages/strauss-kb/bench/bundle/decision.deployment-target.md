---
type: decision
title: Services run on AWS ECS Fargate
tags:
  - infrastructure
  - deployment
generated:
  by: meridian-platform
  at: "2025-09-15"
strauss_status: accepted
strauss_confidence: high
strauss_owner: meridian-platform
---

## Decision

Every service runs as an ECS Fargate task behind an application load balancer, deployed by a rolling update from CI.

## Rationale

There is no cluster to patch and no node pool to size, which matches a platform team of four.

## Rejected

Kubernetes on EKS, whose operational surface exceeds what this team can carry. Bare EC2 with systemd units, which puts host patching back on the team.

## Impact

Task definitions are the deployment unit. Anything needing a daemon per host is not expressible and must be a sidecar.

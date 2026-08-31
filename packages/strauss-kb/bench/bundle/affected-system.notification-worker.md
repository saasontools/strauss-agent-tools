---
type: affected-system
title: The notification worker
tags:
  - notifications
generated:
  by: meridian-notify
  at: "2026-02-26"
strauss_status: accepted
strauss_owner: meridian-notify
---

## System

A Fargate service that consumes reminder and transactional jobs and hands each to the right channel transport.

## How it is affected

It carries the retry policy, the transport choice, and the per-channel templating, so a change to any of those lands here first.

## Blast radius

Every reminder and every transactional message. A stalled worker is silent, not loud, which is why stream lag is alerted on.

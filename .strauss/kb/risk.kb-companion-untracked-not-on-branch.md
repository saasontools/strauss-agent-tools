---
type: risk
title: >-
  The .strauss/kb companion is untracked in the main checkout and absent from
  the review branch
description: >-
  A companion base that is not committed never reaches the PR, so reviewers on
  GitHub see the diff without the decisions and this review's findings are lost
  on checkout switch.
tags:
  - review
  - process
generated:
  by: "agent:security-reviewer"
  at: "2026-09-14T17:03:25.972Z"
verified: []
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

git status in /Users/assafkamil/projects/strauss-agent-tools shows .strauss/ as untracked on main; the worktree branch claude/recording-decisions-migration-ce2a6e has no .strauss path and is zero commits ahead of origin/main. The four decisions and the reviewer's verifications exist only on one machine.

## Why it matters

The reviewer workflow assumes the base rides with the diff. Here nothing rides: there is no diff, and the base would be dropped by a clean clone or a worktree switch.

## Mitigation

Commit .strauss/kb on the branch that carries the kb_pack change, or state explicitly that the base is a local-only scratch base.

## Verification

git ls-files .strauss/kb on the branch lists the record files.

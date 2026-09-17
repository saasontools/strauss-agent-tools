---
type: decision
title: anchor-update computes its patch inside the store's guarded mutation
description: >-
  A patch computed from an outside read would resolve its selectors against
  anchors the record no longer holds, and publish the stale array over a
  concurrent edit.
tags:
  - review
sources:
  - id: saa-820
    resource: "https://linear.app/saason/issue/SAA-820"
    title: "Strauss KB: expose reviewed anchor updates through CLI and MCP"
generated:
  by: "agent:claude"
  at: "2026-09-17T17:49:50.035Z"
verified:
  - by: "agent:correctness"
    at: "2026-09-17T18:11:20.744Z"
    note: >-
      Read KbStore.updateAnchors and mutate: the function form runs inside
      change(), against frontmatter.strauss_anchors, and the digest witness is
      re-read before publish; the log entry is a thunk evaluated after change.
      anchorUpdateCommand passes the patch as that function.
  - by: "agent:security"
    at: "2026-09-17T18:11:32.411Z"
    note: >-
      Read KbStore.mutate: the patch closure runs on the frontmatter just read,
      and the witness re-read plus digest comparison happens before publish, so
      a concurrent edit is either patched over or refused with
      KbWriteConflictError — no silent overwrite of another actor's anchors.
  - by: "agent:performance"
    at: "2026-09-17T18:12:39.003Z"
    note: >-
      Counted fs/promises calls around anchorUpdateCommand.run on a scratch
      bundle: 6 readFile, 1 writeFile, 1 rename, 1 unlink, 1 appendFile,
      identical at 1, 10, 100, 500, 1000 and 2000 anchors. Computing the patch
      inside mutate adds no read and no spawn, and nothing is read per anchor.
      One nuance the Impact overstates: an array caller is unchanged on the
      success path but not on the failure path — the write-schema parse moved
      from before mutate into the change closure, so a schema-invalid anchor now
      costs 1 readFile before it throws (base build: 0). One read, on a path
      anchor-resolve only reaches when a record is already malformed.
strauss_anchors:
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: updateAnchors
    hash: "sha256:a3af337f051a491a29e61ea7534e6cd111db984e1c59631df24862aa7e0276b0"
    hash_kind: ast
    resolved_at: "2026-09-17T17:50:44.717Z"
    lines: 30
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/anchor-update/command.ts
    symbol: anchorUpdateCommand
    hash: "sha256:368d9fff3c057709195f1fb7c35481c51d84a83031771e03146f4cedae66f6df"
    hash_kind: raw
    resolved_at: "2026-09-17T18:22:08.572Z"
    lines: 52
    resolver: regex
strauss_status: accepted
---

## Decision

anchor-update computes its patch inside the store's guarded mutation

## Rationale

A patch computed from an outside read would resolve its selectors against anchors the record no longer holds, and publish the stale array over a concurrent edit.

## Rejected

Read the anchors, apply the patch, call updateAnchors with the finished array — the shape every other caller uses. Rejected: between the read and the write the record may gain or lose an anchor, and the finished array would erase it silently; the store's digest witness only catches a write that lands inside that window, not one that landed before the read.

## Impact

updateAnchors now takes a function as well as an array, and mutate takes its log entry as a thunk so the entry can describe what the patch actually applied. An array caller — anchor-resolve, reassess — is unchanged and still logs anchor-resolve.

[^saa-820]: Strauss KB: expose reviewed anchor updates through CLI and MCP

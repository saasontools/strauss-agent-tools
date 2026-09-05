---
name: kb-fix
description: Route a companion knowledge base's gate findings to whoever can still fix them — the author in the blocked turn, the author's subagent in the same session, or a fresh kb-fixer later. Use before reading a base you did not write, when kb-review-gate blocks a turn or its --report comes back non-empty, and when a reviewer, walkthrough or CI job needs the base validated first. Writing records is review-companion.
---

# Fixing a base before you read it

Whoever held the why fixes the base. Every tier below can repair what the code
settles; only the first two can say why the code changed, and each hour that
passes takes another one away.

## Who is still there

| Tier                                       | Route                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| The gate blocked this turn                 | The author fixes now, in their own turn — the hook's reason is already in it. Load `review-companion`        |
| The author's subagent, same parent session | The parent sends it the `--report` JSON with its agent-messaging tool. In-process only; no such tool, tier 3 |
| Nobody: a later review, a walkthrough, CI  | Spawn `kb-fixer` with the bundle path, repo root, diff range and the `--report` JSON                         |

What each tier may write is
[review-companion's table](../review-companion/SKILL.md#before-anyone-reads-it).
The late tier's mandate — the one repair, and the open question everything
else becomes — is `agents/kb-fixer.md`, stated there so a spawned fixer holds
it without loading a skill.

## Reading the report

```sh
node "$CLAUDE_PLUGIN_ROOT/hooks/scripts/kb-review-gate.mjs" --report \
  --repo-root . --bundle .strauss/kb --base <merge-base> --head HEAD
```

Per finding: `label` is `mechanical | semantic`, and `fixable` is true for the
one repair the late tier may apply. Route on `fixable`, not on `label` — a
mechanical finding that needs the record edited is nobody's but the author's.
An empty `findings` is a base you may read.

## Before you read a base

> A consumer — reviewer agent, walkthrough, human — validates first or reviews
> a base that lies.

The three checks that sentence governs are in
[review-companion](../review-companion/SKILL.md#before-anyone-reads-it). They
come first: an unvalidated base has no findings worth routing.

## Not this

- Writing the records themselves: `review-companion`, `recording-decisions`.
- Judging whether a record's claim holds: that is `kb-review`.
- Fixing your own base mid-implementation: you are tier 1, so just fix it.

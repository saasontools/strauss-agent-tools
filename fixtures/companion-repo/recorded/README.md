# Recorded agent output

Empty so far. Agent output is a fixture, not a dependency: the reviewer agent
(SAA-730) runs once per scenario through `packages/codex-claude-agent`, and the
base it leaves behind is committed here. Policy, walkthrough, telemetry and
fixer-routing tests then replay that base with no agent call.

```
recorded/<scenario>/<skill-version>/
  .strauss/kb/        the base as the agent left it
  run.json            sidecar
```

`run.json` carries the model id, the skill version, and the run id, so a
recording can be traced to what produced it:

```json
{
  "scenario": "blocking-risk",
  "model": "claude-opus-4-6-20260514",
  "skill": "review-companion@0.4.0",
  "runId": "01JQ8...",
  "recordedAt": "2026-09-01T09:00:00.000Z",
  "harness": "@saasontools/codex-claude-agent@0.3.1"
}
```

Re-record when a skill, a hook, or the pinned model changes. A diff in a
recorded base is a review, not a failure.

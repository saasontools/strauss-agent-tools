# Trigger evals

`evals.json` is a trigger-accuracy suite: ten prompts that must load this skill,
ten near-misses that must not. Re-run it whenever the frontmatter `description`
changes — that description is the only thing deciding whether the skill loads.

Run it with skill-creator's description optimizer:

```bash
SC=~/.claude/plugins/cache/claude-plugins-official/skill-creator/*/skills/skill-creator
jq '[.evals[] | {query: .prompt, should_trigger: .expected_trigger}]' evals.json > /tmp/trigger-eval.json
cd "$SC" && python3 -m scripts.run_eval \
  --eval-set /tmp/trigger-eval.json \
  --skill-path plugins/strauss-kb-review/skills/recording-decisions \
  --runs-per-query 3 --verbose
```

Two things about the harness, learned the hard way:

- It registers the candidate description as a temporary command in the project
  root's `.claude/`, so run it from a project root that does **not** already
  contain `recording-decisions` — otherwise a run that loads the real skill is
  scored as a miss.
- Its shipped detector scores only the turn's **first** tool call. This repo's
  `SessionStart` hooks push the model at code-exploration tools first, so the
  skill call is routinely second or third and every positive reads as 0/3. Scan
  the whole turn instead.

# Trigger evals

Ten prompts that must load this skill, ten near-misses that must not. Re-run
when the frontmatter `description` changes. Run command and harness caveats:
[recording-decisions/evals/README.md](../../recording-decisions/evals/README.md),
with `--skill-path plugins/strauss-kb-review/skills/kb-fix`.

The near-misses are the neighbours on either side of routing: writing a record
is `review-companion`, judging whether one holds is `kb-review`, and rendering
the base for a human is `review-walkthrough`.

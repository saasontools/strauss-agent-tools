# Trigger evals

Ten prompts that must load this skill, ten near-misses that must not — the
sharpest being `review-companion`'s own positives, which write the base this
skill reads. Re-run when the frontmatter `description` changes. Run command and
harness caveats:
[recording-decisions/evals/README.md](../../recording-decisions/evals/README.md),
with `--skill-path plugins/strauss-kb-review/skills/kb-review`.

The agent's own outcomes are not trigger accuracy and cannot run here:
[agents/kb-reviewer.expectations.json](../../../agents/kb-reviewer.expectations.json)
holds them for SAA-746's runner.

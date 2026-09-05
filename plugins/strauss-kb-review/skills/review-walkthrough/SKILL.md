---
name: review-walkthrough
description: Generate a self-contained HTML review guide for a pull request that carries a strauss-kb companion base — blocking risks first, then acceptance-criteria flows, then what to skip, then the questions left for the reviewer, each deep-linked to the hunk. Use when a human is about to review such a PR and asks where to start, what to read first, or for a walkthrough, reading order, or review guide. Writing the base is review-companion.
---

# Review walkthrough

This renders the order the base already knows: what can hurt, what was asked
for, what not to read. Every line comes from `strauss-kb`; the only prose a
model contributes is the optional per-record note in `--reviewer`.

## The one command

```sh
node "$CLAUDE_PLUGIN_ROOT/skills/review-walkthrough/scripts/render.mjs" \
  --range main..HEAD --repo-root . --pr https://github.com/org/repo/pull/42 \
  --out /tmp/walkthrough.html
```

`--bundle` defaults to `<repo-root>/.strauss/kb`. `--pr` must be a
`https://github.com/<owner>/<repo>/pull/<n>` URL. `--reviewer <file|json>`
takes the reviewer agent's output keyed by record id. `--json` prints the step
model instead of the page; its `steps` count is the content deck — twelve of
them for a three-file diff is a base problem, not a rendering one.
`strauss-kb` comes from `$STRAUSS_KB_CLI`, else `PATH`.

## What the reviewer sees first

1. **The stamp** — head SHA, base digest, how many anchors were checked, and
   which went unchecked. It rides outside the cap.
2. **Blocking risks, then important ones** — each with its anchor, mitigation,
   verification, whether a test backs it, and the reviewer's verdict if one was
   passed in. Materiality orders them; nothing else reorders it.
3. **Acceptance criteria** — every `requirement` slugged `ac-*` or citing a
   source it declares, with the `satisfies` backlinks that claim to meet it and
   the symbols they anchor.
4. **Skip these** — files the classifier called generated, boilerplate, a
   rename or a lockfile, plus every `fact` tagged `review:generated`,
   `review:boilerplate`, `review:move` or `review:extract`.
5. **Open questions** — with the assumption that holds until they are answered.
6. **Everything else**, one collapsed step per file. Past twelve content steps
   the rest becomes an "also" list; twelve is what a person walks.

## Staleness

The renderer runs `kb_anchor_resolve` on every record anchored in the diff. If
an anchor drifted, or nobody could check it, it refuses: exit 3, naming the
records. Fix the base (`kb_anchor_resolve --rebaseline`, or supersede the
record) rather than reaching for `--allow-drift`. That resolve is the only
write: it stamps an anchor that has no hash yet, and never rebaselines.

## What the CLI cannot tell it yet

No read verb returns `strauss_verify`, `strauss_sources` or `strauss_owner`,
and this skill never opens a record file. So a step's verify command falls back
to a `Verification` / `How to verify` body section and is often missing, a
requirement earns its acceptance step by its `ac-` slug alone, and open
questions are not filtered by owner. SAA-749 adds `strauss_verify`; the readers
already prefer the field, so it lands here with no change.

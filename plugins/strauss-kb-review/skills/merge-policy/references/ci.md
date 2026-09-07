# Merge policy in CI

What the flags mean is [SKILL.md](../SKILL.md); this is the plumbing around
them.

## The job

Dry-run on `pull_request`, one sticky comment per PR, the JSON as an artifact:

```yaml
merge-policy:
  runs-on: ubuntu-latest
  permissions: { contents: read, pull-requests: write }
  env: { PLUGIN: "${{ github.workspace }}/plugins/strauss-kb-review" }
  steps:
    - { uses: actions/checkout@v5, with: { fetch-depth: 0 } }
    - run: |
        export GH_TOKEN='${{ github.token }}' R=$GITHUB_REPOSITORY PR=${{ github.event.number }} S=${{ github.event.pull_request.head.sha }}
        gh api --paginate "repos/$R/pulls/$PR/reviews" > reviews.json
        gh api --paginate "repos/$R/issues/$PR/labels" > labels.json
        id=$(gh api --paginate "repos/$R/issues/$PR/comments" --jq '.[]|select(.body|startswith("<!-- strauss-kb merge-policy -->"))|.id' | head -1)
        if [ -z "$id" ]; then echo '[]' > reacts.json; else gh api --paginate "repos/$R/issues/comments/$id/reactions" > reacts.json; fi
        node "$PLUGIN/skills/merge-policy/scripts/merge-policy.mjs" --range "origin/$GITHUB_BASE_REF..$S" --pr "$PR" --dry-run --approvals reviews.json --labels labels.json --reactions reacts.json --report-out c.md --json > policy.json
        if [ -z "$id" ]; then gh api "repos/$R/issues/$PR/comments" -F body=@c.md; else gh api -X PATCH "repos/$R/issues/comments/$id" -F body=@c.md; fi
    - uses: actions/upload-artifact@v5
      with: { name: merge-policy, path: policy.json }
```

## The calibration dump

`--calibrate DUMP.json` reads what one command collects:

```sh
gh pr list --state all --limit 50 --json number,labels,comments > prs.json
```

Each entry is
`{ number, labels: [{name}], comments: [{ author, body, reactionGroups }] }`.
The verdict comes from the last marker comment authored by a `--bot-logins`
login (`github-actions[bot]` unnamed); a marker anyone else typed is ignored.
With this dump the label is the disagreement signal — `reactionGroups` counts
reactors without naming them, so a 👎 counts only from a dump that names its
reactor: a REST `reactions` array, or groups carrying `users.nodes`.

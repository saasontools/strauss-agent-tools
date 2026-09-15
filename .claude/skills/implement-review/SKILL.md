---
name: implement-review
description: Implement a task from a Linear issue or a free prompt on a branch, record the companion base as you go, then run every reviewer on the repository's roster in parallel over the range and settle what they wrote. Use for "implement SAA-123 and review it", "do this change and run the reviewers". Not the review itself (kb-review), not the route (merge-policy), not repairing a base you did not write (kb-fix).
---

# Implement, then review

One task, one branch, one review cycle. You are the author; the reviewers
are the agents named under `reviewers` in `.strauss/kb-pins.json`.

## 1. Take the task

| Input                         | From                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A Linear issue id (`SAA-123`) | The Linear MCP: title, description, acceptance criteria, linked documents. The issue is the `source` of every requirement you record |
| A free prompt                 | The prompt is the requirement; record it as `assumption: true` where it invents one                                                  |
| Base branch                   | `main` unless told; the range is `<merge-base>..HEAD`                                                                                |

Work on a branch named for the issue. Commit per subtask, never at the end
only.

## 2. Implement with the base

Load `review-companion` and keep it loaded: it says what to record while you
work, how a subagent declares what it changed, and the gate report to run
before anyone reviews. In this repository the gate script is
`plugins/strauss-kb-review/hooks/scripts/kb-review-gate.mjs`. When the author
gate blocks a Stop, fix the base, never the gate. Review starts once the
report carries no block and the repository's own checks pass.

## 3. Run the reviewers, all at once

Read the roster. For each name, start that agent with the same brief and
nothing else:

> Review `<merge-base>..HEAD` in `<repo root>`. Your roster name is `<name>`.
> End with the kb block.

- Claude Code: one `Agent` call per reviewer, all in the same message, so
  they run concurrently; `subagent_type` is the roster name.
- Codex: ask for one agent per roster name, spawned in parallel, naming each
  (`correctness`, `security`, …), each with the brief above.

Never review as yourself; never pass a reviewer your own records to confirm.

## 4. Settle what came back

Each reviewer ends with a `kb` block: verdicts per record, what it wrote. For
every reviewer-written record, in this order:

| It wrote                       | You do                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A `risk` you can remove        | Fix the code and commit. The risk is the reviewer's record, so do not edit it: add a `test-obligation` that `satisfies` it, or a decision that `informs` it; the reviewer or a human resolves it |
| A `risk` you accept            | Leave it open; say why in a decision that `informs` it. A `blocking` risk left open needs a human                                                                                                |
| An `open-question` you own     | `answer` it through the CLI, as yourself                                                                                                                                                         |
| A `verify` on your record      | Nothing                                                                                                                                                                                          |
| A `disputed` or `lies` verdict | Read the anchor again. Right: fix code or record and say so in the answer. Wrong: answer the question with what the anchor shows; never edit the reviewer's record                               |

Never settle your own risk, never write as a reviewer's actor.

## 5. Loop, then stop

Rerun only the reviewers that had a blocking finding, on the new head, at most
twice. Then rerun the gate report. Finish with, per reviewer: records verified,
disputed, written, and the blocking items still open for a human. Put that
list in the pull request body.

## Not this

- Reviewing a range with no implementation: run the reviewers directly.
- Deciding whether it merges: `merge-policy`.
- A base that fails `validate`: `kb-fix`, then come back.

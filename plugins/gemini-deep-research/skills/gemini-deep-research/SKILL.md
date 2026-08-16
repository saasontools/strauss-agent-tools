---
name: gemini-deep-research
description: Run deep, citation-backed research with Google Gemini Deep Research. Use for questions that need broad web research and synthesis — competitive analyses, literature reviews, market studies, multi-topic investigations — not for quick lookups a single web search answers.
---

# Gemini Deep Research

Orchestrates the `gemini-deep-research` MCP server
(`@saasontools/gemini-deep-research-mcp`). A run takes **5–20 minutes** and
**costs real money** (~$1–3 standard, ~$3–7 max), so plan runs deliberately;
never fan out more runs than the user asked for.

## Choosing depth: `standard` vs `max`

**Default is `standard`** (unless the user's environment overrides it via
`GEMINI_DEEP_RESEARCH_AGENT`). When you don't pass `depth`, you get
`standard` — and that is the right call for almost everything.

Pick **`standard`** (~$1–3/run) for:

- single-topic questions, overviews, and background briefs
- competitive snapshots, market scans, literature surveys
- each topic of a multi-run fan-out study (costs multiply per run)
- anything exploratory, where a follow-up run is likely anyway

Pick **`max`** (~$3–7/run, deeper and slower) only when:

- the user explicitly asks for exhaustive/maximum-depth research
- one report must carry a high-stakes decision (due diligence,
  build-vs-buy, legal/regulatory landscape) and there will be no second run
- a `standard` run already came back too shallow and the user wants more

Never silently escalate to `max` — it triples the cost. If you believe `max`
is warranted, say why and let the user confirm first.

## Single research question

1. Check `deep_research_list` first — an existing completed job on the same
   question is free; a new run is not.
2. `deep_research_start` with a specific, self-contained query. Include scope
   and timeframe in the query; describe the desired report structure in the
   separate `format` parameter (e.g. "an executive summary, then a comparison
   table, then per-vendor sections").
3. Poll `deep_research_status` every 30–60 seconds. Relay the
   `latest_progress` summaries so the user sees movement. Do other useful work
   between polls if you have any.
4. When `report_ready: true`, call `deep_research_fetch`. Work from the
   preview plus the report file at `report_path` — do not pass `inline: true`
   unless the user explicitly wants the full text in context.
5. Cite from the returned sources list when summarizing.

## Multi-topic study (fan-out)

For a study spanning several topics (e.g. "research our top 5 competitors"):

1. Agree the topic list with the user first — each topic is a paid run.
2. Start one `deep_research_start` per topic, collecting every `job_id`.
   Start them all before polling; runs execute concurrently on Google's side.
3. Poll each job with `deep_research_status` in rotation until all are
   terminal. Report progress as jobs finish, not only at the end.
4. `deep_research_fetch` each finished job; read the report files.
5. Synthesize across reports into one deliverable, keeping per-topic citations
   from each job's sources list.
6. If a run ends `incomplete` or `budget_exceeded`, fetch it anyway — partial
   output is still usable — and say it was partial.

## Collaborative planning

When the user wants control over scope, pass `collaborative_planning: true` to
`deep_research_start`. The job pauses in `requires_action` with a proposed
plan: show it to the user, then send their answer with `deep_research_reply`
(which starts the research). Only pass `keep_planning: true` if they want to
iterate on the plan for another turn.

## Rules

- The blocking `deep_research` tool suits only quick checks in clients that
  tolerate long tool calls; prefer start + poll. If it returns a job id after
  its wait ceiling, continue with `deep_research_status` — that is normal, not
  an error.
- `deep_research_cancel` stops a run but does not refund work already done —
  confirm with the user before cancelling.
- If a tool fails with an authentication error, ask the user to set
  `GEMINI_API_KEY` (from <https://aistudio.google.com/apikey>) in their MCP
  client configuration. Never ask them to paste the key into the chat.

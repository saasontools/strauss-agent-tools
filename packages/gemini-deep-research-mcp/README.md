# @saasontools/gemini-deep-research-mcp

MCP server for [Google Gemini Deep Research](https://ai.google.dev/): start
long-running, citation-backed research jobs and collect the reports as local
markdown files.

## Why async job handles

A Deep Research run takes **5–20 minutes (60 max)** on Google's
infrastructure, while many MCP clients — Codex most prominently — cap a tool
call at **~60 seconds**. So the primary surface is a job handle:
`deep_research_start` returns in under a second, `deep_research_status` polls
cheaply, and `deep_research_fetch` returns the finished report. Jobs live on
Google's servers and survive local process death; the server only persists
`job_id → interaction_id` mappings and finished reports as JSON/markdown
files. Even the blocking convenience wrapper (`deep_research`) never errors on
timeout — it degrades to returning the job id.

## Cost

**Each run costs real money**: roughly $1–3 (`standard` depth,
`deep-research-preview-04-2026`) or $3–7 (`max`,
`deep-research-max-preview-04-2026`). Cancelling does not refund work already
performed. The tool descriptions repeat this so calling agents don't fan out
runs casually.

## Tools

| Tool                   | Purpose                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deep_research_start`  | Start a run; returns `{job_id, interaction_id, status}` immediately                                                                                                  |
| `deep_research_status` | Status, elapsed, latest thinking summary, report readiness                                                                                                           |
| `deep_research_reply`  | Answer a collaborative-planning turn (ends planning by default — required to unstick the run)                                                                        |
| `deep_research_fetch`  | Report path + ~4k-char preview, citations, token usage; `inline: true` for full text; `save_to` for a copy; serves partial output for `incomplete`/`budget_exceeded` |
| `deep_research_list`   | Known jobs, newest first (local, no network)                                                                                                                         |
| `deep_research_cancel` | Cancel in flight (billed work is not refunded)                                                                                                                       |
| `deep_research`        | Blocking wrapper; waits up to `wait_seconds` (default 50), then returns the job id                                                                                   |

Reports are also exposed as MCP resources: `research://jobs` and
`research://job/{job_id}`.

## Install

### Claude Code

```bash
claude mcp add gemini-deep-research --env GEMINI_API_KEY=YOUR_KEY -- npx -y @saasontools/gemini-deep-research-mcp
```

### Codex / any MCP client

```json
{
  "mcpServers": {
    "gemini-deep-research": {
      "command": "npx",
      "args": ["-y", "@saasontools/gemini-deep-research-mcp"],
      "env": { "GEMINI_API_KEY": "${GEMINI_API_KEY}" }
    }
  }
}
```

### Claude Desktop

Download the `.mcpb` bundle from the GitHub release and open it with Claude
Desktop; it prompts for the API key and stores it in the OS keychain. MCPB is
Claude-Desktop-only — every other client should use npm.

## Configuration

| Env var                      | Default                       | Purpose                                                                                                                                                       |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`             | —                             | Required at call time (`GOOGLE_API_KEY` accepted as fallback). Get one at <https://aistudio.google.com/apikey>. The server starts and lists tools without it. |
| `GEMINI_DEEP_RESEARCH_HOME`  | `~/.gemini-deep-research-mcp` | Job + report storage                                                                                                                                          |
| `GEMINI_DEEP_RESEARCH_AGENT` | `standard`                    | Default depth (`standard` or `max`)                                                                                                                           |
| `LOG_LEVEL`                  | `info`                        | stderr diagnostics (`error`/`warn`/`info`/`debug`)                                                                                                            |

## Storage layout

```
~/.gemini-deep-research-mcp/   # 0700
├── jobs/<job_id>.json         # 0600 — job_id → interaction_id + metadata
└── reports/<job_id>.md        # 0600 — finished (or partial) reports
```

The API key is never written to disk or logged.

## Development

No Nx knowledge needed:

```bash
cd packages/gemini-deep-research-mcp
pnpm install
pnpm build
pnpm test          # 52 tests, no API key, no network (mock Gemini server)
```

The MCPB bundle inlines everything, and bundling is where working servers
break — test it too:

```bash
pnpm build:bundle
SMOKE_ENTRY=bundle/server/index.js INTEGRATION_ENTRY=bundle/server/index.js pnpm test
```

One guarded live test exists (`RUN_LIVE_E2E=1` plus a real key — costs real
money, excluded from CI). See [ARCHITECTURE.md](ARCHITECTURE.md) for design
notes.

## License

MIT © Assaf Kamil. Part of
[strauss-agent-tools](https://github.com/saasontools/strauss-agent-tools).

# AGENTS.md

Guidance for AI coding agents working on the `strauss-kb-review` plugin
directory. Repo-wide rules live in the root AGENTS.md.

## What this directory is

A multi-client agent plugin served as-is (no build step) to Claude Code,
Codex, and Agent Plugins 1.0 clients:

- `skills/recording-decisions/`, `skills/review-companion/`, `skills/kb-review/`
  — the portable core every client reads; put the real procedure here, never
  only in client-specific files
- `agents/kb-reviewer.md` — Claude Code only, so `kb-review` stays a skill and
  the agent stays the thing it spawns. A client with no subagents (Codex) runs
  the passes inline from that file instead
- `plugin.json` / `.claude-plugin/plugin.json` / `.codex-plugin/plugin.json`
  — one manifest per format; keep name/version/description in sync

## Rules that are load-bearing

- **Skills only, no MCP server.** They drive `strauss-kb`'s tools, so the
  `strauss-kb` plugin has to be installed alongside. No `mcp.json` here.
- **Unlisted on purpose.** This plugin is absent from
  `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`
  while it is experimental — do not add it back until it ships.
- Validate with `claude plugin validate .` (or `pnpm nx run
plugin-strauss-kb-review:validate` from the repo root) after any change.
- `project.json` exists only for the `validate` target; add nothing else.

# AGENTS.md

Guidance for AI coding agents working on the `gemini-infographics` plugin
directory. Repo-wide rules live in the root AGENTS.md.

## What this directory is

A multi-client agent plugin served as-is (no build step) to Claude Code,
Codex, and Agent Plugins 1.0 clients:

- `skills/gemini-infographics/SKILL.md` — the portable core every client reads;
  put the real procedure here, never only in client-specific files
- `skills/gemini-infographics/scripts/generate-infographics.mjs` — the whole
  implementation; `// @ts-check` + JSDoc, typechecked by the `typecheck` target
- `plugin.json` / `.claude-plugin/plugin.json` / `.codex-plugin/plugin.json`
  — one manifest per format; keep name/version/description in sync

There is **no MCP server** for this plugin and no `mcp.json` / `.mcp.json`.
The generator ships as a script because it is one API call per image with no
state to hold; do not add a server unless the plugin grows a lifecycle.

## Rules that are load-bearing

- **The script stays Node standard library only** (`fetch`, `node:fs`,
  `node:util`'s `parseArgs` — nothing else). It runs on user machines with no
  install step, so a dependency would break every client that just copies this
  directory, and plugin directories have no build step to bundle one away.
- **It is `.mjs`, not `.ts`, on purpose.** Types come from `// @ts-check` and
  JSDoc, checked by `tsc --checkJs` via `pnpm nx run
plugin-gemini-infographics:typecheck`. Real TypeScript would need a build,
  which this directory cannot have.
- **The pinned model ids in `ALIASES` are defaults, not guarantees.** When a
  pin ages out, the fallback path (newest live model in the same family) is
  what keeps runs working — keep it working, and keep `--no-fallback` as the
  escape hatch for reproducible runs.
- `${CLAUDE_PLUGIN_ROOT}` is a Claude Code variable; the SKILL.md must also
  tell other clients how to find the script by path.
- Validate with `claude plugin validate .` (or `pnpm nx run
plugin-gemini-infographics:validate` from the repo root) after any change.
- This directory is registered in `.claude-plugin/marketplace.json` and
  `.agents/plugins/marketplace.json` at the repo root with an explicit
  `./plugins/gemini-infographics` source path — keep those entries in sync.
- `project.json` carries `validate` and — because this plugin ships
  executable code — `typecheck`. Add nothing beyond checks that run on the
  files in this directory.

## Testing the script without spending money

`GEMINI_API_BASE` points the script at any base URL, so the whole lifecycle
(model listing, sync, batch, fallback on a dead pin) is drivable against a
local mock server with a fake key.

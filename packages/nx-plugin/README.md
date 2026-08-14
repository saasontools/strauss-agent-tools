# @saasontools/nx-plugin

Nx generators for scaffolding [saasontools](https://github.com/saasontools/strauss-agent-tools)
MCP server packages and multi-client agent plugins. Published so other
workspaces can reuse the same generators.

## Generators

### `mcp-server`

```bash
nx g @saasontools/nx-plugin:mcp-server my-server --description "..." --apiKeyEnv MY_API_KEY
```

Creates `packages/my-server`, a publishable `@saasontools/my-server` npm
package with:

- ESM + `bin` entry over `StdioServerTransport`, one example `ping` tool
- two tsup configs: npm build (deps external) and MCPB bundle (fully inlined,
  with the `createRequire` shim CJS deps need)
- unit tests plus an MCP handshake smoke test against the built binary
  (`SMOKE_ENTRY=bundle/server/index.js` re-targets it at the bundle)
- `server.json` for the official MCP registry and `bundle/manifest.json` for
  MCPB (API keys marked `sensitive`)
- version `1.0.0` (Nx release compresses minor→patch below 1.0 — never start
  at 0.x), `publishConfig.access: public`, no `project.json` (targets are
  inferred from npm scripts)

### `agent-plugin`

```bash
nx g @saasontools/nx-plugin:agent-plugin my-plugin --mcpServer my-server --apiKeyEnv MY_API_KEY
```

Creates `plugins/my-plugin`, one directory that serves Agent Plugins 1.0,
Claude Code, and Codex simultaneously:

- `plugin.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`
- a portable `skills/<name>/SKILL.md` (all three formats read `skills/`)
- identical `mcp.json` / `.mcp.json` wiring the published MCP server via a
  semver range (never a workspace link)
- optional Claude-Code-only `agents/<name>.md` (`--withAgent`)
- a `project.json` with a single `validate` target (`claude plugin validate`)
- idempotent registration in `.claude-plugin/marketplace.json` and
  `.agents/plugins/marketplace.json`

## Development

```bash
cd packages/nx-plugin
pnpm install
pnpm build
pnpm test
```

## License

MIT © Assaf Kamil

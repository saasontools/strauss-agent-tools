# strauss-agent-tools

[![CI](https://github.com/saasontools/strauss-agent-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/saasontools/strauss-agent-tools/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/saasontools/strauss-agent-tools/badge)](https://scorecard.dev/viewer/?uri=github.com/saasontools/strauss-agent-tools)
[![npm scope](https://img.shields.io/badge/npm-%40saasontools-cb3837)](https://www.npmjs.com/org/saasontools)

MCP servers and agent plugins published under the `@saasontools` npm scope.
One repository feeds three ecosystems: npm packages for any MCP client,
plugin directories for Claude Code / Codex / Agent Plugins 1.0 clients, and
MCPB bundles for Claude Desktop.

## Packages

| Package                                                                      | Description                                                                                             | npm                                                                                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@saasontools/nx-plugin`](packages/nx-plugin)                               | Nx generators for scaffolding MCP servers and agent plugins                                             | [![npm](https://img.shields.io/npm/v/%40saasontools%2Fnx-plugin)](https://www.npmjs.com/package/@saasontools/nx-plugin)                               |
| [`@saasontools/gemini-deep-research-mcp`](packages/gemini-deep-research-mcp) | Gemini Deep Research MCP server                                                                         | [![npm](https://img.shields.io/npm/v/%40saasontools%2Fgemini-deep-research-mcp)](https://www.npmjs.com/package/@saasontools/gemini-deep-research-mcp) |
| [`@saasontools/strauss-kb`](packages/strauss-kb)                             | Knowledge base of markdown records with standing, supersession, and trace: library, CLI, and MCP server | [![npm](https://img.shields.io/npm/v/%40saasontools%2Fstrauss-kb)](https://www.npmjs.com/package/@saasontools/strauss-kb)                             |
| [`@saasontools/codex-claude-agent`](packages/codex-claude-agent)             | Runner that delegates a Codex task to Claude Code through the Claude Agent SDK                          | [![npm](https://img.shields.io/npm/v/%40saasontools%2Fcodex-claude-agent)](https://www.npmjs.com/package/@saasontools/codex-claude-agent)             |

## Plugins

| Plugin                                                 | Description                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`gemini-deep-research`](plugins/gemini-deep-research) | Deep research via the Gemini Deep Research MCP server                                              |
| [`gemini-infographics`](plugins/gemini-infographics)   | Generate infographic images with Gemini image models                                               |
| [`strauss-kb`](plugins/strauss-kb)                     | Durable project knowledge with standing, supersession, and trace                                   |
| [`codex-claude-agent`](plugins/codex-claude-agent)     | Delegate work from Codex to Claude Code, in a worktree, with tracked jobs (Codex marketplace only) |
| [`strauss-kb-review`](plugins/strauss-kb-review)       | strauss-kb as a per-PR review companion (experimental; unlisted in both marketplaces)              |

## Install

### Claude Code

```
/plugin marketplace add saasontools/strauss-agent-tools
/plugin install gemini-deep-research@saasontools
```

Or wire an MCP server directly:

```bash
claude mcp add gemini-deep-research -- npx -y @saasontools/gemini-deep-research-mcp
```

### Codex

This repository doubles as a Codex plugin marketplace
(`.agents/plugins/marketplace.json`). Add it in Codex, then install the plugin
by name. Any MCP-capable client can also run the servers straight from npm via
`npx`, as in the Claude Code example above.

### Claude Desktop

Download the `.mcpb` bundle attached to the matching GitHub release and open
it with Claude Desktop. MCPB bundles are Claude-Desktop-only; every other
client should use npm.

## Contributing

Contributor quickstart — no Nx knowledge required:

```bash
cd packages/gemini-deep-research-mcp
pnpm install
pnpm build
pnpm test
```

Every package works standalone with plain npm scripts (`build`, `test`,
`typecheck`, `lint`). Nx sits on top for caching and `affected` runs in CI,
but you never have to touch it.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full setup, how to add a
package with the generators, and the release flow.

## License

[MIT](LICENSE) © Assaf Kamil

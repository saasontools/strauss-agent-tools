# GeminiDeepResearch plugin

Run deep, citation-backed research with Google Gemini Deep Research.

One directory, three plugin formats — nothing collides:

| Client                                                                 | Manifest                     | Skills    | MCP config  |
| ---------------------------------------------------------------------- | ---------------------------- | --------- | ----------- |
| Agent Plugins 1.0 (ChatGPT, Codex CLI, Cursor, Copilot, VS Code, Kiro) | `plugin.json`                | `skills/` | `mcp.json`  |
| Claude Code                                                            | `.claude-plugin/plugin.json` | `skills/` | `.mcp.json` |
| Codex                                                                  | `.codex-plugin/plugin.json`  | `skills/` | `.mcp.json` |

## Install

### Claude Code

```
/plugin marketplace add https://github.com/saasontools/strauss-agent-tools
/plugin install gemini-deep-research@saasontools
```

### Codex

Add the marketplace from this repository (`.agents/plugins/marketplace.json`),
then install `gemini-deep-research`.

## MCP server

The plugin launches `@saasontools/gemini-deep-research-mcp` from npm via `npx`; it does not bundle
the server code.

Set the `GEMINI_API_KEY` environment variable before use.

## License

MIT © Assaf Kamil. Part of [strauss-agent-tools](https://github.com/saasontools/strauss-agent-tools).

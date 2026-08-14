# @saasontools/gemini-deep-research-mcp

MCP server for Google Gemini Deep Research: long-running research jobs with async job handles

## Usage

### Claude Code

```bash
claude mcp add gemini-deep-research-mcp -- npx -y @saasontools/gemini-deep-research-mcp
```

### Codex / any MCP client

Add to your client's MCP configuration:

```json
{
  "mcpServers": {
    "gemini-deep-research-mcp": {
      "command": "npx",
      "args": ["-y", "@saasontools/gemini-deep-research-mcp"],
      "env": { "GEMINI_API_KEY": "${GEMINI_API_KEY}" }
    }
  }
}
```

### Claude Desktop

Download the `.mcpb` bundle from the GitHub release and open it with Claude
Desktop. Claude Desktop is the only client that consumes MCPB bundles; every
other client should use the npm package above.

## Configuration

| Environment variable | Required | Purpose                    |
| -------------------- | -------- | -------------------------- |
| `GEMINI_API_KEY`     | yes      | API key used by the server |

## Development

No Nx knowledge needed:

```bash
cd packages/gemini-deep-research-mcp
pnpm install
pnpm build
pnpm test
```

`pnpm test` runs unit tests plus an MCP handshake smoke test against the built
`dist/index.js`. To smoke-test the fully-inlined MCPB bundle instead:

```bash
pnpm build:bundle
SMOKE_ENTRY=bundle/server/index.js pnpm test
```

## License

MIT © Assaf Kamil. Part of [strauss-agent-tools](https://github.com/saasontools/strauss-agent-tools).

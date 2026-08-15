export interface AgentPluginGeneratorSchema {
  /** Plugin directory name under plugins/. */
  name: string;
  description?: string;
  /**
   * Short name (without scope) of the published MCP server package the plugin
   * wires up, e.g. "gemini-deep-research-mcp". Defaults to "<name>-mcp".
   */
  mcpServer?: string;
  /** Name of an API key env var passed through to the MCP server. */
  apiKeyEnv?: string;
  /** Also generate a Claude-Code-only agents/<name>.md. */
  withAgent?: boolean;
}

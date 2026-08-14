export interface McpServerGeneratorSchema {
  /** Package directory name under packages/; npm name becomes @saasontools/<name>. */
  name: string;
  description?: string;
  /** Name of an API key env var the server needs (e.g. GEMINI_API_KEY). */
  apiKeyEnv?: string;
}

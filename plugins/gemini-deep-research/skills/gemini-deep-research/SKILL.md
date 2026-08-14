---
name: gemini-deep-research
description: Run deep, citation-backed research with Google Gemini Deep Research. Use this skill when the user asks for GeminiDeepResearch functionality.
---

# GeminiDeepResearch

This skill is the portable core of the gemini-deep-research plugin: every supported
client (Claude Code, Codex, and Agent Plugins 1.0 clients) reads it.

## Instructions

1. The plugin's MCP configuration wires up the `gemini-deep-research` MCP server
   (`@saasontools/gemini-deep-research-mcp`). Use its tools for the actual work.
2. Start by calling the server's `ping` tool to confirm connectivity.
3. Replace this placeholder procedure with the real one before shipping.

## Requirements

The MCP server needs the `GEMINI_API_KEY` environment variable to be set.
If a tool call fails with an authentication error, ask the user to set it.

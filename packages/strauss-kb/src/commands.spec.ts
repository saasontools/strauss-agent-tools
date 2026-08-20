import { describe, expect, test } from "vitest";
import { KB_COMMANDS } from "./commands/index.js";
import { createKbMcpServer } from "./mcp.js";

/**
 * The CLI and the MCP server drifted to fourteen commands against six tools
 * within a day of existing separately. These assertions are what makes that
 * impossible rather than merely discouraged.
 */
describe("command table", () => {
  test("every command with a tool name is registered as an MCP tool", () => {
    const server = createKbMcpServer();
    const registered = Object.keys(
      (server as unknown as { _registeredTools: Record<string, unknown> })
        ._registeredTools,
    );

    expect(registered.sort()).toEqual(
      KB_COMMANDS.filter((command) => command.tool)
        .map((command) => command.tool)
        .sort(),
    );
  });

  // The one sanctioned gap in the projection: sync-instructions edits files
  // for hooks and instruction blocks, and the capability it plumbs —
  // "get the pinned context block" — is kb_context. Anything else CLI-only
  // is a drift bug.
  test("sync-instructions is the only CLI-only command", () => {
    expect(
      KB_COMMANDS.filter((command) => !command.tool).map(
        (command) => command.name,
      ),
    ).toEqual(["sync-instructions"]);
  });

  test("names and tools are unique", () => {
    const names = KB_COMMANDS.map((command) => command.name);
    const tools = KB_COMMANDS.map((command) => command.tool);

    expect(new Set(names).size).toBe(names.length);
    expect(new Set(tools).size).toBe(tools.length);
  });

  // A tool name an agent sees should be predictable from the verb it mirrors.
  test("tool names mirror command names", () => {
    for (const command of KB_COMMANDS) {
      if (!command.tool) continue;
      expect(command.tool).toBe(`kb_${command.name.replace(/-/g, "_")}`);
    }
  });

  // The description is the only thing an agent reads before choosing a tool.
  test("every command carries a usable description and usage line", () => {
    for (const command of KB_COMMANDS) {
      expect(command.description.length).toBeGreaterThan(40);
      expect(command.usage.startsWith(command.name)).toBe(true);
    }
  });

  test("every command that touches a base takes a bundlePath", () => {
    // schema and types describe the format itself, not any one base; pins,
    // context, and sync-instructions read the workspace pin manifest, because
    // which bases a session should see is workspace state, not base state.
    const noBundle = [
      "schema",
      "types",
      "pins",
      "context",
      "sync-instructions",
    ];
    for (const command of KB_COMMANDS) {
      const shape = Object.keys(command.input.shape);
      if (noBundle.includes(command.name)) {
        expect(shape).not.toContain("bundlePath");
      } else {
        expect(shape).toContain("bundlePath");
      }
    }
  });
});

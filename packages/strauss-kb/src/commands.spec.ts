import { describe, expect, test } from "vitest";
import { KB_COMMANDS } from "./commands.js";
import { createKbMcpServer } from "./mcp.js";

/**
 * The CLI and the MCP server drifted to fourteen commands against six tools
 * within a day of existing separately. These assertions are what makes that
 * impossible rather than merely discouraged.
 */
describe("command table", () => {
  test("every command is registered as an MCP tool", () => {
    const server = createKbMcpServer();
    const registered = Object.keys(
      (server as unknown as { _registeredTools: Record<string, unknown> })
        ._registeredTools,
    );

    expect(registered.sort()).toEqual(
      KB_COMMANDS.map((command) => command.tool).sort(),
    );
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
    for (const command of KB_COMMANDS) {
      const shape = Object.keys(command.input.shape);
      // schema and types describe the format itself, not any one base.
      if (["schema", "types"].includes(command.name)) {
        expect(shape).toEqual([]);
      } else {
        expect(shape).toContain("bundlePath");
      }
    }
  });
});

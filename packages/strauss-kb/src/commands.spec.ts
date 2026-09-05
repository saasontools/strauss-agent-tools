import { describe, expect, test } from "vitest";
import { KB_COMMANDS } from "./commands/index.js";
import { createKbMcpServer } from "./mcp.js";

/**
 * The CLI and the MCP server drifted to fourteen commands against six tools
 * within a day of existing separately. These assertions are what makes that
 * impossible rather than merely discouraged.
 */
/** None of the drift-reporting verbs read stdin. */
const noStdin = () => Promise.resolve("");

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

  // The two sanctioned gaps in the projection, both plumbing rather than a
  // capability: sync-instructions edits files for hooks and instruction blocks
  // (the capability is kb_context), and telemetry reads the operation stream,
  // which is not a base an agent asks about. Anything else CLI-only is a drift
  // bug.
  test("only the two plumbing verbs are CLI-only", () => {
    expect(
      KB_COMMANDS.filter((command) => !command.tool).map(
        (command) => command.name,
      ),
    ).toEqual(["sync-instructions", "telemetry"]);
  });

  test("names and tools are unique", () => {
    const names = KB_COMMANDS.map((command) => command.name);
    const tools = KB_COMMANDS.flatMap((command) =>
      command.tool ? [command.tool] : [],
    );

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

  // Every surface that reports drift has to be able to say where the code is.
  // `store.load`/`store.query` took a `repoRoot` that no command could pass,
  // so the default working directory was the only value they ever saw — and a
  // bundle read from elsewhere reported its whole base as drifted.
  test("every drift-reporting command exposes repoRoot, in the schema and in argv", () => {
    for (const name of ["load", "query", "doctor", "anchor-resolve"]) {
      const command = KB_COMMANDS.find((entry) => entry.name === name);
      expect(command, name).toBeDefined();
      if (!command) continue;

      expect(Object.keys(command.input.shape), name).toContain("repoRoot");
      expect(command.usage, name).toContain("--repo-root");

      const parsed = command.input.parse(
        command.fromArgv?.(
          [name, "--repo-root", "/somewhere/else"],
          "/bundle",
          noStdin,
        ) ?? {},
      );
      expect(parsed, name).toMatchObject({ repoRoot: "/somewhere/else" });
    }
  });

  // The flag's value sits in argv where free prose does, so a query that did
  // not strip it would search for the path it was told to read.
  test("query does not swallow --repo-root into its search text", () => {
    const query = KB_COMMANDS.find((entry) => entry.name === "query");
    expect(
      query?.fromArgv?.(
        ["query", "cache", "key", "--repo-root", "/repo"],
        "/bundle",
        noStdin,
      ),
    ).toMatchObject({ text: "cache key", repoRoot: "/repo" });
  });

  test("every command that touches a base takes a bundlePath", () => {
    // schema and types describe the format itself, not any one base; pins,
    // context, and sync-instructions read the workspace pin manifest, because
    // which bases a session should see is workspace state, not base state;
    // telemetry reads the operation stream, which lives outside every base.
    const noBundle = [
      "schema",
      "types",
      "pins",
      "context",
      "sync-instructions",
      "telemetry",
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

import { describe, expect, it } from "vitest";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { readJson, writeJson, type Tree } from "@nx/devkit";
import { agentPluginGenerator } from "./generator";

async function generate(tree: Tree, overrides = {}): Promise<void> {
  await agentPluginGenerator(tree, {
    name: "sample",
    description: "Sample plugin.",
    mcpServer: "sample-mcp",
    apiKeyEnv: "SAMPLE_API_KEY",
    ...overrides,
  });
}

describe("agent-plugin generator", () => {
  it("writes all three plugin manifests", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree);

    for (const file of [
      "plugins/sample/plugin.json",
      "plugins/sample/.claude-plugin/plugin.json",
      "plugins/sample/.codex-plugin/plugin.json",
    ]) {
      const manifest = readJson(tree, file);
      expect(manifest.name, file).toBe("sample");
      expect(manifest.version, file).toBe("1.0.0");
    }
  });

  it("writes identical mcp.json and .mcp.json wired to the published package", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree);

    const mcp = tree.read("plugins/sample/mcp.json", "utf-8");
    const dotMcp = tree.read("plugins/sample/.mcp.json", "utf-8");
    expect(mcp).toBe(dotMcp);

    const config = readJson(tree, "plugins/sample/mcp.json");
    expect(config.mcpServers.sample.command).toBe("npx");
    expect(config.mcpServers.sample.args).toEqual([
      "-y",
      "@saasontools/sample-mcp@^1.0.0",
    ]);
    expect(config.mcpServers.sample.env).toEqual({
      SAMPLE_API_KEY: "${SAMPLE_API_KEY}",
    });
  });

  it("writes a SKILL.md with name and description frontmatter", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree);
    const skill = tree.read("plugins/sample/skills/sample/SKILL.md", "utf-8");
    expect(skill).toMatch(/^---\nname: sample\ndescription: /);
  });

  it("only generates agents/ when asked", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree);
    expect(tree.exists("plugins/sample/agents")).toBe(false);

    const withAgent = createTreeWithEmptyWorkspace();
    await generate(withAgent, { withAgent: true });
    expect(withAgent.exists("plugins/sample/agents/sample.md")).toBe(true);
  });

  it("writes a project.json whose only target is validate", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree);
    const project = readJson(tree, "plugins/sample/project.json");
    expect(project.name).toBe("plugin-sample");
    expect(Object.keys(project.targets)).toEqual(["validate"]);
    expect(project.targets.validate.command).toContain(
      "claude plugin validate",
    );
  });

  it("registers the plugin in both marketplace files with a ./plugins/ source", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree);

    for (const file of [
      ".claude-plugin/marketplace.json",
      ".agents/plugins/marketplace.json",
    ]) {
      const marketplace = readJson(tree, file);
      expect(marketplace.plugins, file).toEqual([
        {
          name: "sample",
          source: "./plugins/sample",
          description: "Sample plugin.",
        },
      ]);
    }
  });

  it("appends to an existing marketplace without disturbing other entries", async () => {
    const tree = createTreeWithEmptyWorkspace();
    const existing = {
      name: "saasontools",
      owner: { name: "Assaf Kamil", url: "https://github.com/saasontools" },
      plugins: [
        { name: "other", source: "./plugins/other", description: "Other." },
      ],
    };
    writeJson(tree, ".claude-plugin/marketplace.json", existing);
    await generate(tree);

    const marketplace = readJson(tree, ".claude-plugin/marketplace.json");
    expect(marketplace.plugins.map((p: { name: string }) => p.name)).toEqual([
      "other",
      "sample",
    ]);
  });

  it("fails cleanly when the plugin already exists", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree);
    await expect(generate(tree)).rejects.toThrow(
      /plugins\/sample already exists/,
    );
  });
});

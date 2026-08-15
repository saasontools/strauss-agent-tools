import { describe, expect, it } from "vitest";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";
import { readJson, type Tree } from "@nx/devkit";
import { mcpServerGenerator } from "./generator";

async function generate(tree: Tree, overrides = {}): Promise<void> {
  await mcpServerGenerator(tree, {
    name: "sample-mcp",
    description: "Sample MCP server",
    apiKeyEnv: "SAMPLE_API_KEY",
    ...overrides,
  });
}

describe("mcp-server generator", () => {
  it("generates a publishable package.json at version 1.0.0", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree);

    const pkg = readJson(tree, "packages/sample-mcp/package.json");
    expect(pkg.name).toBe("@saasontools/sample-mcp");
    expect(pkg.version).toBe("1.0.0");
    expect(pkg.publishConfig).toEqual({ access: "public" });
    expect(pkg.type).toBe("module");
    expect(pkg.bin).toEqual({ "sample-mcp": "./dist/index.js" });
    expect(pkg.files).toEqual(["dist", "README.md", "LICENSE"]);
    expect(pkg.engines.node).toBe(">=22");
    expect(pkg.repository.directory).toBe("packages/sample-mcp");
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBeDefined();
  });

  it("generates source, tests, configs, README, and LICENSE", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree);

    for (const file of [
      "src/index.ts",
      "src/server.ts",
      "src/server.spec.ts",
      "test/smoke.spec.ts",
      "tsconfig.json",
      "tsup.config.ts",
      "tsup.bundle.config.ts",
      "vitest.config.ts",
      "README.md",
      "LICENSE",
    ]) {
      expect(tree.exists(`packages/sample-mcp/${file}`), file).toBe(true);
    }
    expect(tree.read("packages/sample-mcp/LICENSE", "utf-8")).toContain(
      "MIT License",
    );
  });

  it("does not create a project.json (targets are inferred from scripts)", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree);
    expect(tree.exists("packages/sample-mcp/project.json")).toBe(false);
  });

  it("bundle tsup config carries the createRequire shim", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree);
    const config = tree.read(
      "packages/sample-mcp/tsup.bundle.config.ts",
      "utf-8",
    );
    expect(config).toContain("createRequire");
    expect(config).toContain("noExternal");
    expect(config).toContain("#!/usr/bin/env node");
  });

  it("writes a registry server.json with the io.github name", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree);
    const server = readJson(tree, "packages/sample-mcp/server.json");
    expect(server.name).toBe("io.github.saasontools/sample-mcp");
    expect(server.version).toBe("1.0.0");
    expect(server.packages[0].identifier).toBe("@saasontools/sample-mcp");
    expect(server.packages[0].environmentVariables[0]).toMatchObject({
      name: "SAMPLE_API_KEY",
      isSecret: true,
    });
  });

  it("marks the API key sensitive in the MCPB manifest", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree);
    const manifest = readJson(tree, "packages/sample-mcp/bundle/manifest.json");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.server.entry_point).toBe("server/index.js");
    expect(manifest.user_config.sample_api_key).toMatchObject({
      sensitive: true,
      required: true,
    });
    expect(manifest.server.mcp_config.env.SAMPLE_API_KEY).toBe(
      "${user_config.sample_api_key}",
    );
  });

  it("omits API key wiring when apiKeyEnv is not given", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree, { name: "plain-mcp", apiKeyEnv: undefined });
    const manifest = readJson(tree, "packages/plain-mcp/bundle/manifest.json");
    expect(manifest.user_config).toBeUndefined();
    const server = readJson(tree, "packages/plain-mcp/server.json");
    expect(server.packages[0].environmentVariables).toBeUndefined();
  });

  it("fails cleanly when the package already exists", async () => {
    const tree = createTreeWithEmptyWorkspace();
    await generate(tree);
    await expect(generate(tree)).rejects.toThrow(
      /packages\/sample-mcp already exists/,
    );
  });
});

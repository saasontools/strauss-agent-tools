import {
  formatFiles,
  generateFiles,
  joinPathFragments,
  names,
  readJson,
  writeJson,
  type Tree,
} from "@nx/devkit";
import * as path from "path";
import {
  COPYRIGHT_HOLDER,
  GITHUB_OWNER,
  INITIAL_VERSION,
  NPM_SCOPE,
  REPO_URL,
} from "../../common";
import type { AgentPluginGeneratorSchema } from "./schema";

interface MarketplaceEntry {
  name: string;
  source: string;
  description: string;
}

interface MarketplaceFile {
  name: string;
  owner: { name: string; url: string };
  plugins: MarketplaceEntry[];
}

/**
 * Adds the plugin to a marketplace file, creating the file if needed. A
 * pre-existing entry with the same name is left untouched so the update is
 * idempotent.
 */
function addToMarketplace(
  tree: Tree,
  filePath: string,
  entry: MarketplaceEntry,
): void {
  const marketplace: MarketplaceFile = tree.exists(filePath)
    ? readJson<MarketplaceFile>(tree, filePath)
    : {
        name: GITHUB_OWNER,
        owner: {
          name: COPYRIGHT_HOLDER,
          url: `https://github.com/${GITHUB_OWNER}`,
        },
        plugins: [],
      };

  if (!marketplace.plugins.some((plugin) => plugin.name === entry.name)) {
    marketplace.plugins.push(entry);
  }
  writeJson(tree, filePath, marketplace);
}

export async function agentPluginGenerator(
  tree: Tree,
  options: AgentPluginGeneratorSchema,
): Promise<void> {
  const name = names(options.name).fileName;
  const pluginRoot = joinPathFragments("plugins", name);

  if (tree.exists(pluginRoot)) {
    throw new Error(
      `plugins/${name} already exists. Pick a different name, or delete the existing plugin first if you really mean to regenerate it.`,
    );
  }

  const description = options.description ?? `${name} agent plugin`;
  const mcpServer = options.mcpServer ?? `${name}-mcp`;
  const mcpPackage = `${NPM_SCOPE}/${mcpServer}`;
  const apiKeyEnv = options.apiKeyEnv;

  generateFiles(tree, path.join(__dirname, "files"), pluginRoot, {
    name,
    title: names(name).className,
    description,
    mcpPackage,
    apiKeyEnv: apiKeyEnv ?? null,
    repoUrl: REPO_URL,
    withAgent: options.withAgent ?? false,
    tmpl: "",
  });

  if (!options.withAgent) {
    tree.delete(joinPathFragments(pluginRoot, "agents"));
  }

  // The same manifest content serves Agent Plugins 1.0 (root plugin.json),
  // Claude Code (.claude-plugin/plugin.json), and Codex
  // (.codex-plugin/plugin.json). The formats do not collide.
  const manifest = {
    name,
    version: INITIAL_VERSION,
    description,
    author: { name: COPYRIGHT_HOLDER },
    homepage: REPO_URL,
    license: "MIT",
  };
  writeJson(tree, joinPathFragments(pluginRoot, "plugin.json"), manifest);
  writeJson(
    tree,
    joinPathFragments(pluginRoot, ".claude-plugin/plugin.json"),
    manifest,
  );
  writeJson(
    tree,
    joinPathFragments(pluginRoot, ".codex-plugin/plugin.json"),
    manifest,
  );

  // Wire the plugin to the *published* MCP server package via a semver range,
  // never a workspace link: plugin directories are copied verbatim onto user
  // machines that know nothing about this monorepo.
  const mcpConfig = {
    mcpServers: {
      [name]: {
        command: "npx",
        args: ["-y", `${mcpPackage}@^${INITIAL_VERSION}`],
        ...(apiKeyEnv ? { env: { [apiKeyEnv]: `\${${apiKeyEnv}}` } } : {}),
      },
    },
  };
  // mcp.json (Agent Plugins 1.0) and .mcp.json (Claude Code, Codex) are
  // byte-identical copies.
  writeJson(tree, joinPathFragments(pluginRoot, "mcp.json"), mcpConfig);
  writeJson(tree, joinPathFragments(pluginRoot, ".mcp.json"), mcpConfig);

  // The one place a project.json is correct: plugin dirs have no package.json
  // for Nx to infer targets from, and `nx affected -t validate` needs a target.
  writeJson(tree, joinPathFragments(pluginRoot, "project.json"), {
    $schema: "../../node_modules/nx/schemas/project-schema.json",
    name: `plugin-${name}`,
    projectType: "library",
    targets: {
      validate: {
        command: "claude plugin validate .",
        options: { cwd: pluginRoot },
      },
    },
  });

  const entry: MarketplaceEntry = {
    name,
    // Explicit ./plugins/<name> path: metadata.pluginRoot does not work as
    // documented and bare names fail validation.
    source: `./plugins/${name}`,
    description,
  };
  addToMarketplace(tree, ".claude-plugin/marketplace.json", entry);
  addToMarketplace(tree, ".agents/plugins/marketplace.json", entry);

  await formatFiles(tree);
}

export default agentPluginGenerator;

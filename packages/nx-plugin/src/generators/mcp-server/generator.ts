import {
  formatFiles,
  generateFiles,
  joinPathFragments,
  names,
  writeJson,
  type Tree,
} from "@nx/devkit";
import * as path from "path";
import {
  COPYRIGHT_HOLDER,
  GITHUB_OWNER,
  INITIAL_VERSION,
  licenseText,
  NPM_SCOPE,
  REPO_URL,
} from "../../common";
import type { McpServerGeneratorSchema } from "./schema";

export async function mcpServerGenerator(
  tree: Tree,
  options: McpServerGeneratorSchema,
): Promise<void> {
  const name = names(options.name).fileName;
  const projectRoot = joinPathFragments("packages", name);

  if (tree.exists(projectRoot)) {
    throw new Error(
      `packages/${name} already exists. Pick a different name, or delete the existing package first if you really mean to regenerate it.`,
    );
  }

  const npmName = `${NPM_SCOPE}/${name}`;
  const description = options.description ?? `${name} MCP server`;
  const apiKeyEnv = options.apiKeyEnv;

  generateFiles(tree, path.join(__dirname, "files"), projectRoot, {
    name,
    npmName,
    description,
    apiKeyEnv: apiKeyEnv ?? null,
    repoUrl: REPO_URL,
    version: INITIAL_VERSION,
    tmpl: "",
  });

  // JSON manifests are assembled here rather than in EJS templates so that
  // conditional fields (the API key wiring) stay readable.
  writeJson(tree, joinPathFragments(projectRoot, "package.json"), {
    name: npmName,
    // Packages start at 1.0.0: Nx release compresses minor->patch below 1.0.
    version: INITIAL_VERSION,
    description,
    license: "MIT",
    author: COPYRIGHT_HOLDER,
    type: "module",
    bin: { [name]: "./dist/index.js" },
    files: ["dist", "README.md", "LICENSE"],
    engines: { node: ">=22" },
    publishConfig: { access: "public" },
    repository: {
      type: "git",
      url: `git+${REPO_URL}.git`,
      directory: `packages/${name}`,
    },
    scripts: {
      build: "tsup",
      "build:bundle": "tsup --config tsup.bundle.config.ts",
      typecheck: "tsc --noEmit",
      test: "vitest run",
      lint: "eslint .",
    },
    dependencies: {
      "@modelcontextprotocol/sdk": "^1.30.0",
      zod: "^3.25.0",
    },
  });

  writeJson(tree, joinPathFragments(projectRoot, "server.json"), {
    $schema:
      "https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json",
    name: `io.github.${GITHUB_OWNER}/${name}`,
    description,
    version: INITIAL_VERSION,
    repository: {
      url: REPO_URL,
      source: "github",
      subfolder: `packages/${name}`,
    },
    packages: [
      {
        registryType: "npm",
        registryBaseUrl: "https://registry.npmjs.org",
        identifier: npmName,
        version: INITIAL_VERSION,
        transport: { type: "stdio" },
        ...(apiKeyEnv
          ? {
              environmentVariables: [
                {
                  name: apiKeyEnv,
                  description: `${apiKeyEnv} used by the server`,
                  isRequired: true,
                  isSecret: true,
                },
              ],
            }
          : {}),
      },
    ],
  });

  const userConfigKey = apiKeyEnv?.toLowerCase();
  writeJson(tree, joinPathFragments(projectRoot, "bundle/manifest.json"), {
    manifest_version: "0.2",
    name,
    display_name: names(name).className,
    version: INITIAL_VERSION,
    description,
    author: { name: COPYRIGHT_HOLDER },
    license: "MIT",
    repository: { type: "git", url: REPO_URL },
    server: {
      type: "node",
      entry_point: "server/index.js",
      mcp_config: {
        command: "node",
        args: ["${__dirname}/server/index.js"],
        ...(apiKeyEnv && userConfigKey
          ? { env: { [apiKeyEnv]: `\${user_config.${userConfigKey}}` } }
          : {}),
      },
    },
    ...(apiKeyEnv && userConfigKey
      ? {
          user_config: {
            [userConfigKey]: {
              type: "string",
              title: apiKeyEnv,
              description: `${apiKeyEnv} used by the server`,
              // sensitive -> Claude Desktop stores the value in the OS keychain.
              sensitive: true,
              required: true,
            },
          },
        }
      : {}),
  });

  tree.write(joinPathFragments(projectRoot, "LICENSE"), licenseText(tree));

  await formatFiles(tree);
}

export default mcpServerGenerator;

#!/usr/bin/env node
/**
 * A plugin and the package it launches release on different tracks: `nx release`
 * versions `packages/*` from version plans, while a plugin's version is three
 * hand-edited `plugin.json` copies. Nothing connects them, so a package can gain
 * a tool, rename a CLI flag, or change what a hook calls while the plugin that
 * documents and launches it still claims the old version — and consumers, who
 * update the plugin from the marketplace and the binary from npm separately,
 * have nothing to compare.
 *
 * This turns that silence into a failed check: touch a package's shipped source,
 * and the plugin in front of it has to say so.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** Every `plugin.json` a plugin ships — all three must agree. */
const MANIFESTS = [
  "plugin.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
];

/**
 * Which package does this plugin launch? Read it from the plugin's own MCP
 * config rather than a hand-kept map, so a new plugin is covered the day it
 * lands: `npx -y @scope/name@range` names the package outright, and a bare
 * command is matched against the `bin` names the packages declare.
 */
function packageFor(pluginDir, packages) {
  const mcpPath = ["mcp.json", ".mcp.json"]
    .map((f) => join(pluginDir, f))
    .find(existsSync);
  if (!mcpPath) return null;

  const servers = readJson(mcpPath).mcpServers ?? {};
  for (const server of Object.values(servers)) {
    for (const arg of server.args ?? []) {
      const named = /^(@[^/]+\/[^@]+)(?:@.+)?$/.exec(arg);
      if (named && packages.some((p) => p.name === named[1])) return named[1];
    }
    const byBin = packages.find((p) =>
      Object.keys(p.bin ?? {}).includes(server.command),
    );
    if (byBin) return byBin.name;
  }
  return null;
}

const base = process.env.NX_BASE || "origin/main";
const changed = git("diff", "--name-only", `${base}...HEAD`)
  .split("\n")
  .filter(Boolean);

const packages = readdirSync("packages", { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => ({
    dir: `packages/${e.name}`,
    ...readJson(`packages/${e.name}/package.json`),
  }));

const problems = [];

for (const entry of readdirSync("plugins", { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = `plugins/${entry.name}`;

  const versions = MANIFESTS.map((f) => join(dir, f))
    .filter(existsSync)
    .map((f) => [f, readJson(f).version]);
  const distinct = new Set(versions.map(([, v]) => v));
  if (distinct.size > 1) {
    problems.push(
      `${entry.name}: plugin manifests disagree — ${versions
        .map(([f, v]) => `${f} is ${v}`)
        .join(", ")}`,
    );
  }

  const pkgName = packageFor(dir, packages);
  if (!pkgName) continue;
  const pkg = packages.find((p) => p.name === pkgName);

  // Only shipped source counts. A README or changelog edit changes nothing a
  // plugin in front of it could be wrong about.
  const shipped = changed.filter(
    (f) => f.startsWith(`${pkg.dir}/src/`) || f === `${pkg.dir}/package.json`,
  );
  if (shipped.length === 0) continue;

  const current = versions[0]?.[1];
  let previous;
  try {
    previous = JSON.parse(git("show", `${base}:${dir}/plugin.json`)).version;
  } catch {
    continue; // new plugin, nothing to compare against
  }

  if (current === previous) {
    problems.push(
      `${entry.name}: ${pkgName} changed (${shipped[0]}${
        shipped.length > 1 ? ` +${shipped.length - 1} more` : ""
      }) but the plugin is still ${current}. Bump it in: ${MANIFESTS.join(", ")}`,
    );
  }
}

if (problems.length > 0) {
  console.error("Plugin/package version drift:\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\nA plugin launches and documents its package. When the package's shipped",
  );
  console.error(
    "source moves, the plugin version has to move with it — consumers update",
  );
  console.error("the two from different places and cannot tell they disagree.");
  process.exit(1);
}

console.log("Plugin and package versions agree.");

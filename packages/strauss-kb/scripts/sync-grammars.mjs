#!/usr/bin/env node
// @ts-check
/**
 * Refreshes `grammars/*.wasm` from the `tree-sitter-wasms` npm tarball.
 *
 * Run by hand, never on install: the WASM is vendored so a cold install pulls
 * no 51 MB grammar bundle and no build toolchain. The grammar ABI is tied to
 * the `web-tree-sitter` major in package.json — bump both together.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "tree-sitter-wasms@0.1.13";
const LANGUAGES = ["typescript", "tsx", "javascript", "python", "go", "rust"];

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "grammars");
const work = mkdtempSync(join(tmpdir(), "strauss-kb-grammars-"));
try {
  execFileSync("npm", ["pack", SOURCE, "--silent"], {
    cwd: work,
    stdio: "inherit",
  });
  const tarball = readdirSync(work).find((name) => name.endsWith(".tgz"));
  if (!tarball) throw new Error(`npm pack ${SOURCE} produced no tarball`);
  execFileSync("tar", ["xzf", tarball], { cwd: work, stdio: "inherit" });
  for (const language of LANGUAGES) {
    const name = `tree-sitter-${language}.wasm`;
    copyFileSync(join(work, "package", "out", name), join(out, name));
    console.log(`updated grammars/${name}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

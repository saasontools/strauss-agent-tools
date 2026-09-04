// @ts-check
/**
 * `pnpm grammars <pin|add|upgrade|check>` — the only way grammars/manifest.json
 * and grammars/tags/ are written.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tryGet } from "./http.mjs";
import { extensionsFor, linguistLanguages } from "./linguist.mjs";
import {
  readManifest,
  readPacks,
  refreshFixture,
  tagsDir,
  writeManifest,
  writePacks,
  writeTags,
} from "./lock.mjs";
import { repoOf } from "./locators.mjs";
import { githubLicense, newestVersion, npmLicense } from "./registry.mjs";
import { resolvePack } from "./resolve.mjs";
import { concatenate, download, proveAll, sha256 } from "./validate.mjs";

const USAGE = `Usage:
  grammars pin <lang>... | --all
  grammars add <lang> [--package P] [--wasm L] [--tags L] [--ext .x,.y]
  grammars upgrade <lang>... | --all
  grammars check [--outdated]

A locator is a path relative to the pack's package, npm:<pkg>[@<ver>]/<path>,
gh:<owner>/<repo>@<ref>/<path>, gh-release:<owner>/<repo>@<tag>/<asset>, or an
https URL.`;

/** @param {string[]} argv */
export async function run(argv) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  switch (command) {
    case "pin":
      return pin(flags, {});
    case "upgrade":
      return pin(flags, { upgrade: true });
    case "add":
      return add(flags);
    case "check":
      return check(flags);
    default:
      log(USAGE);
      throw new Error(`unknown command ${command ?? "(none)"}`);
  }
}

/** `--all`, `--ext .a,.b` and bare language names. */
function parseFlags(argv) {
  /** @type {{ languages: string[], all: boolean, options: Record<string, string> }} */
  const flags = { languages: [], all: false, options: {} };
  for (let at = 0; at < argv.length; at++) {
    const argument = `${argv[at]}`;
    if (!argument.startsWith("--")) {
      flags.languages.push(argument);
      continue;
    }
    const name = argument.slice(2);
    if (name === "all" || name === "outdated") {
      flags.all ||= name === "all";
      flags.options[name] = "true";
      continue;
    }
    flags.options[name] = `${argv[++at] ?? ""}`;
  }
  return flags;
}

/**
 * Resolve, download, prove, write. Languages left out keep the entry they
 * already have, so pinning one language never re-resolves the rest — but
 * every pack's WASM is still fetched, because the proof is that all of them
 * load together.
 */
async function pin(flags, { upgrade = false }) {
  const packs = readPacks();
  const previous = readManifest();
  const selected = select(packs, flags, upgrade);

  const linguist = await linguistLanguages(packs.linguist);
  const { table, clashes, missing } = extensionsFor(
    Object.entries(packs.packs).map(([language, pack]) => ({
      language,
      ...pack,
    })),
    linguist.byName,
  );

  /** @type {Record<string, unknown>} */
  const locked = {};
  /** @type {Map<string, string>} */
  const queries = new Map();
  /** @type {import("./validate.mjs").Provable[]} */
  const provable = [];
  let withTags = 0;

  for (const language of Object.keys(packs.packs).sort()) {
    const extensions = table.get(language) ?? [];
    if (!selected.has(language)) {
      const carried = previous.packs?.[language];
      if (!carried)
        throw new Error(
          `${language}: no locked entry to carry forward; run pnpm grammars pin --all`,
        );
      locked[language] = { ...carried, extensions };
      const vendored = join(tagsDir, `${language}.scm`);
      const query = existsSync(vendored)
        ? readFileSync(vendored, "utf8")
        : undefined;
      if (query) queries.set(language, query);
      if (carried.tags?.length) withTags++;
      provable.push({
        language,
        label: carried.package,
        wasm: await fetchLocked(language, carried.wasm.url),
        ...(query ? { query } : {}),
      });
      continue;
    }

    const pack = packs.packs[language];
    const resolved = await resolvePack(language, pack, {
      previous: previous.packs?.[language],
      upgrade,
    });
    const fetched = await download(resolved);
    const compiled = fetched.tags.length > 0;
    if (compiled) {
      queries.set(language, fetched.query);
      withTags++;
    }
    provable.push({
      language,
      label: resolved.label,
      wasm: fetched.wasm.body,
      ...(compiled ? { query: fetched.query } : {}),
    });
    if (refreshFixture(language, fetched.wasm.body))
      log(`  fixture test/fixtures/grammars/tree-sitter-${language}.wasm`);

    locked[language] = {
      package: resolved.label,
      wasm: {
        url: fetched.wasm.url,
        sha256: fetched.wasm.sha256,
        bytes: fetched.wasm.bytes,
      },
      tags: fetched.tags.map((part) => ({
        url: part.url,
        sha256: part.sha256,
      })),
      license: await licenseOf(resolved),
      extensions,
    };
    const was = previous.packs?.[language]?.package;
    log(
      `${upgrade && was && was !== resolved.label ? `${was} -> ` : ""}${resolved.label}` +
        `  ${language}  wasm ${size(fetched.wasm.bytes)}  tags ${compiled ? `${fetched.tags.length} part(s)` : "none"}`,
    );
  }

  await proveAll(provable, log);
  writeTags(queries, log);
  await writeManifest({
    linguist: { tag: linguist.tag, commit: linguist.commit },
    packs: locked,
  });
  for (const line of missing) log(`no extensions: ${line}`);
  if (clashes.length) log(`dropped ambiguous: ${clashes.join(", ")}`);
  log(
    `${selected.size} pinned, ${Object.keys(locked).length} packs, ${withTags} with a compiling tags query`,
  );
}

/** The languages a run touches; `upgrade` without `--all` needs names. */
function select(packs, flags, upgrade) {
  const known = new Set(Object.keys(packs.packs));
  if (flags.all) return known;
  if (!flags.languages.length)
    throw new Error(`${upgrade ? "upgrade" : "pin"} needs <lang>... or --all`);
  for (const language of flags.languages)
    if (!known.has(language))
      throw new Error(`${language}: no entry in grammars/packs.json`);
  return new Set(flags.languages);
}

/** Writes the packs.json entry, then pins that one language. */
async function add(flags) {
  const language = flags.languages[0];
  if (!language) throw new Error("add needs <lang>");
  const packs = readPacks();
  if (packs.packs[language])
    throw new Error(`${language}: already in grammars/packs.json`);

  const { package: pkg, wasm, tags, ext } = flags.options;
  /** @type {Record<string, unknown>} */
  const entry = { package: pkg ?? `tree-sitter-${language}` };
  if (wasm) entry["wasm"] = wasm;
  if (tags !== undefined) entry["tags"] = tags === "null" ? null : tags;
  if (ext) entry["extensions"] = ext.split(",").map((one) => one.trim());
  packs.packs[language] = entry;
  await writePacks(packs);
  log(`added ${language} to grammars/packs.json`);
  await pin({ languages: [language], all: false, options: {} }, {});
}

/**
 * Every part the lock names, downloaded and proved again. No writes: this runs
 * weekly against the real CDN, and the answer is a report.
 */
async function check(flags) {
  const manifest = readManifest();
  const packs = readPacks();
  /** @type {string[]} */
  const rows = [];
  const failures = [];
  const outdated = [];
  /** @type {import("./validate.mjs").Provable[]} */
  const provable = [];

  for (const [language, entry] of Object.entries(manifest.packs).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    const notes = [];
    const wasm = await tryGet(entry.wasm.url);
    if (!wasm) notes.push(`wasm missing: ${entry.wasm.url}`);
    else if (
      wasm.byteLength !== entry.wasm.bytes ||
      sha256(wasm) !== entry.wasm.sha256
    )
      notes.push(`wasm hash: ${entry.wasm.url}`);

    const parts = [];
    for (const part of entry.tags ?? []) {
      const body = await tryGet(part.url);
      if (!body) notes.push(`tags missing: ${part.url}`);
      else if (sha256(body) !== part.sha256)
        notes.push(`tags hash: ${part.url}`);
      else parts.push({ url: part.url, body });
    }

    if (wasm && parts.length === (entry.tags ?? []).length && !notes.length)
      provable.push({
        language,
        label: entry.package,
        wasm,
        ...(parts.length ? { query: concatenate(parts) } : {}),
      });

    if (flags.options["outdated"]) {
      const [pkg, version] = splitLabel(entry.package);
      const newest = packs.packs[language]?.version
        ? version
        : await newestVersion(pkg);
      if (newest !== version)
        outdated.push(`${language}: ${version} -> ${newest}`);
    }

    if (notes.length) failures.push(`${language}: ${notes.join("; ")}`);
    rows.push(
      `${notes.length ? "FAIL" : "ok  "}  ${language.padEnd(18)}${entry.package.padEnd(46)}${(entry.tags ?? []).length ? `tags ${(entry.tags ?? []).length}` : "no tags"}`,
    );
  }

  for (const row of rows) log(row);
  for (const line of failures) log(`  ${line}`);
  for (const line of outdated) log(`outdated ${line}`);
  log(
    `${rows.length} packs, ${failures.length} failing, ${outdated.length} outdated`,
  );
  if (failures.length || outdated.length) process.exitCode = 1;
  await proveAll(provable, log);
}

/** The wasm a carried-forward pack was locked at, for the load pass. */
async function fetchLocked(language, url) {
  const bytes = await tryGet(url);
  if (!bytes?.byteLength)
    throw new Error(`${language}: locked wasm is gone from ${url}`);
  return bytes;
}

/** npm for a package part, the repository for a GitHub one. */
async function licenseOf(resolved) {
  const repo = repoOf(resolved.pkg);
  if (repo) return githubLicense(repo);
  const first = resolved.tags[0] ?? resolved.wasm;
  if (first.locator.kind === "gh" || first.locator.kind === "release")
    return githubLicense(first.locator.repo);
  return npmLicense(resolved.pkg, resolved.version);
}

function splitLabel(label) {
  const cut = label.lastIndexOf("@");
  return [label.slice(0, cut), label.slice(cut + 1)];
}

function size(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/** @param {string} line */
function log(line) {
  process.stdout.write(`${line}\n`);
}

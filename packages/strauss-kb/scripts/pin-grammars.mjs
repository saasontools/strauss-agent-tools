#!/usr/bin/env node
// @ts-check
/**
 * Pins what the anchor resolver ships: `grammars/manifest.json` (a sha256 and
 * the exact grammar release per WASM), `grammars/tags/*.scm` (that release's
 * own definitions query), `grammars/tags/SOURCES.md`, and
 * `grammars/extensions.json`.
 *
 * Run by hand, never on install: the WASM is downloaded on first use rather
 * than published, so the manifest is all that ships for it. Every run downloads
 * all of them anyway, because the last step compiles each query against its own
 * grammar — the pair is the thing being pinned.
 *
 * Usage: node scripts/pin-grammars.mjs [version] [--grammars|--tags]
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Language, Parser, Query } from "web-tree-sitter";
import { get, getJson, text, tryGet } from "./grammar-http.mjs";
import { resolveGrammarVersions } from "./grammar-versions.mjs";

const PACKAGE = "tree-sitter-wasms";
const CDN = "https://cdn.jsdelivr.net/npm";
const FLAT = "https://data.jsdelivr.com/v1/package/npm";
const RAW = "https://raw.githubusercontent.com";
const GITHUB = "https://api.github.com";
const REGISTRY = "https://registry.npmjs.org";
const LINGUIST =
  "https://raw.githubusercontent.com/github-linguist/linguist/master/lib/linguist/languages.yml";

/**
 * The npm package each WASM is built from, per `tree-sitter-wasms`' own
 * `build.ts`, with the sub-directory that build points the generator at. The
 * version is resolved per run, never written here; `repo` is where a tags query
 * comes from when the npm package ships none.
 *
 * @type {Record<string, { pkg: string, repo: string, sub?: string, extends?: string }>}
 */
const GRAMMARS = {
  bash: { pkg: "tree-sitter-bash", repo: "tree-sitter/tree-sitter-bash" },
  c: { pkg: "tree-sitter-c", repo: "tree-sitter/tree-sitter-c" },
  c_sharp: {
    pkg: "tree-sitter-c-sharp",
    repo: "tree-sitter/tree-sitter-c-sharp",
  },
  cpp: { pkg: "tree-sitter-cpp", repo: "tree-sitter/tree-sitter-cpp" },
  css: { pkg: "tree-sitter-css", repo: "tree-sitter/tree-sitter-css" },
  dart: { pkg: "tree-sitter-dart", repo: "UserNobody14/tree-sitter-dart" },
  elisp: { pkg: "tree-sitter-elisp", repo: "Wilfred/tree-sitter-elisp" },
  elixir: { pkg: "tree-sitter-elixir", repo: "elixir-lang/tree-sitter-elixir" },
  elm: { pkg: "tree-sitter-elm", repo: "elm-tooling/tree-sitter-elm" },
  embedded_template: {
    pkg: "tree-sitter-embedded-template",
    repo: "tree-sitter/tree-sitter-embedded-template",
  },
  go: { pkg: "tree-sitter-go", repo: "tree-sitter/tree-sitter-go" },
  html: { pkg: "tree-sitter-html", repo: "tree-sitter/tree-sitter-html" },
  java: { pkg: "tree-sitter-java", repo: "tree-sitter/tree-sitter-java" },
  javascript: {
    pkg: "tree-sitter-javascript",
    repo: "tree-sitter/tree-sitter-javascript",
  },
  json: { pkg: "tree-sitter-json", repo: "tree-sitter/tree-sitter-json" },
  kotlin: { pkg: "tree-sitter-kotlin", repo: "fwcd/tree-sitter-kotlin" },
  lua: { pkg: "tree-sitter-lua", repo: "Azganoth/tree-sitter-lua" },
  objc: { pkg: "tree-sitter-objc", repo: "amaanq/tree-sitter-objc" },
  ocaml: {
    pkg: "tree-sitter-ocaml",
    repo: "tree-sitter/tree-sitter-ocaml",
    sub: "ocaml",
  },
  php: {
    pkg: "tree-sitter-php",
    repo: "tree-sitter/tree-sitter-php",
    sub: "php",
  },
  python: { pkg: "tree-sitter-python", repo: "tree-sitter/tree-sitter-python" },
  ql: { pkg: "tree-sitter-ql", repo: "tree-sitter/tree-sitter-ql" },
  rescript: {
    pkg: "tree-sitter-rescript",
    repo: "rescript-lang/tree-sitter-rescript",
  },
  ruby: { pkg: "tree-sitter-ruby", repo: "tree-sitter/tree-sitter-ruby" },
  rust: { pkg: "tree-sitter-rust", repo: "tree-sitter/tree-sitter-rust" },
  scala: { pkg: "tree-sitter-scala", repo: "tree-sitter/tree-sitter-scala" },
  solidity: {
    pkg: "tree-sitter-solidity",
    repo: "JoranHonig/tree-sitter-solidity",
  },
  swift: { pkg: "tree-sitter-swift", repo: "alex-pinkus/tree-sitter-swift" },
  systemrdl: {
    pkg: "tree-sitter-systemrdl",
    repo: "SystemRDL/tree-sitter-systemrdl",
  },
  tlaplus: {
    pkg: "@tlaplus/tree-sitter-tlaplus",
    repo: "tlaplus-community/tree-sitter-tlaplus",
  },
  toml: { pkg: "tree-sitter-toml", repo: "ikatyang/tree-sitter-toml" },
  // The TypeScript grammars are the JavaScript one plus a few nodes, and so is
  // their tags file: upstream ships only the delta, so the two concatenate.
  tsx: {
    pkg: "tree-sitter-typescript",
    repo: "tree-sitter/tree-sitter-typescript",
    sub: "tsx",
    extends: "javascript",
  },
  typescript: {
    pkg: "tree-sitter-typescript",
    repo: "tree-sitter/tree-sitter-typescript",
    sub: "typescript",
    extends: "javascript",
  },
  vue: { pkg: "tree-sitter-vue", repo: "tree-sitter-grammars/tree-sitter-vue" },
  yaml: { pkg: "tree-sitter-yaml", repo: "ikatyang/tree-sitter-yaml" },
  zig: {
    pkg: "@tree-sitter-grammars/tree-sitter-zig",
    repo: "tree-sitter-grammars/tree-sitter-zig",
  },
};

/** Manifest language name → Linguist language name, where they differ. */
const LINGUIST_NAMES = {
  bash: "Shell",
  c_sharp: "C#",
  cpp: "C++",
  elisp: "Emacs Lisp",
  embedded_template: "HTML+ERB",
  objc: "Objective-C",
  ql: "CodeQL",
  tlaplus: "TLA",
};

/**
 * Extensions Linguist gives to more than one manifest language. An unlisted
 * collision is dropped and reported rather than guessed at.
 * @type {Record<string, string>}
 */
const EXTENSION_OWNERS = { ".h": "c", ".m": "objc" };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const grammarsDir = join(root, "grammars");
const tagsDir = join(grammarsDir, "tags");
const fixturesDir = join(root, "test", "fixtures", "grammars");
const manifestPath = join(grammarsDir, "manifest.json");

const argv = process.argv.slice(2);
const only = argv.find((argument) => argument.startsWith("--"))?.slice(2);
const version =
  argv.find((argument) => !argument.startsWith("--")) ??
  /** @type {{ version: string }} */ (
    JSON.parse(readFileSync(manifestPath, "utf8"))
  ).version;

/**
 * @typedef {{
 *   language: string, pkg: string, repo: string, sub?: string,
 *   extends?: string, version?: string, commit?: string, rule: string,
 * }} Pin
 */

/**
 * Downloaded WASM, shared by the hash step and the compile check.
 * @type {Map<string, Uint8Array>}
 */
const wasm = new Map();

/** @type {Map<string, string>} */
const licenses = new Map();

const pins = await languagePins();
if (only === "tags") stampManifest();
else await pinGrammars();
if (only !== "grammars") await pinTags();
await compileQueries();

/** Each WASM the release ships, with the grammar release it was built from. */
async function languagePins() {
  const versions = await resolveGrammarVersions(PACKAGE, version);
  /** @type {Pin[]} */
  const found = [];
  for (const language of await wasmLanguages()) {
    const entry = GRAMMARS[language];
    if (!entry)
      throw new Error(
        `${language}: ${PACKAGE}@${version} ships a grammar with no GRAMMARS row`,
      );
    const resolved = versions.get(entry.pkg);
    if (!resolved)
      throw new Error(`${language}: no release resolved for ${entry.pkg}`);
    found.push({ language, ...entry, ...resolved });
  }
  return found;
}

async function wasmLanguages() {
  const flat = /** @type {{ files: { name: string }[] }} */ (
    await getJson(`${FLAT}/${PACKAGE}@${version}/flat`)
  );
  return flat.files
    .filter((file) => /^\/out\/tree-sitter-.+\.wasm$/.test(file.name))
    .map((file) => file.name.slice("/out/tree-sitter-".length, -".wasm".length))
    .sort();
}

/** `tree-sitter-python@0.21.0`, or the package and the commit it was built at. */
function label(pin) {
  return `${pin.pkg}@${pin.version ?? pin.commit}`;
}

/** @param {Pin} pin */
async function wasmBytes(pin) {
  const cached = wasm.get(pin.language);
  if (cached) return cached;
  const bytes = await get(
    `${CDN}/${PACKAGE}@${version}/out/tree-sitter-${pin.language}.wasm`,
  );
  wasm.set(pin.language, bytes);
  return bytes;
}

/** Every `out/*.wasm` the pinned release ships, hashed into the manifest. */
async function pinGrammars() {
  /** @type {Record<string, { grammar: string, sha256: string, bytes: number }>} */
  const grammars = {};
  for (const pin of pins) {
    const bytes = await wasmBytes(pin);
    grammars[pin.language] = {
      grammar: label(pin),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.byteLength,
    };
    // Fixtures exist only for the languages the suite parses; the rest would
    // add megabytes to the repository for nothing.
    const fixture = join(fixturesDir, `tree-sitter-${pin.language}.wasm`);
    if (existsSync(fixture)) writeFileSync(fixture, bytes);
  }
  writeManifest(grammars);
  log(`pinned ${pins.length} grammars from ${PACKAGE}@${version}`);
}

/** Refreshes the grammar releases in a manifest whose hashes stay as they are. */
function stampManifest() {
  const current =
    /** @type {{ grammars: Record<string, { sha256: string, bytes: number }> }} */ (
      JSON.parse(readFileSync(manifestPath, "utf8"))
    );
  writeManifest(
    Object.fromEntries(
      pins.map((pin) => {
        const entry = current.grammars[pin.language];
        if (!entry) throw new Error(`${pin.language}: not in the manifest`);
        return [
          pin.language,
          { grammar: label(pin), sha256: entry.sha256, bytes: entry.bytes },
        ];
      }),
    ),
  );
}

/**
 * The ABI triple in one file: the runtime that loads a grammar, the grammar,
 * and — through `grammar` — the release its tags query is taken from.
 */
function writeManifest(grammars) {
  const webTreeSitter = /** @type {{ version: string }} */ (
    JSON.parse(
      readFileSync(
        join(root, "node_modules", "web-tree-sitter", "package.json"),
        "utf8",
      ),
    )
  ).version;
  write(
    manifestPath,
    `${json({ package: PACKAGE, version, webTreeSitter, grammars })}\n`,
  );
}

/** The upstream tags queries, their provenance, and the extension table. */
async function pinTags() {
  mkdirSync(tagsDir, { recursive: true });
  const byLanguage = new Map(pins.map((pin) => [pin.language, pin]));

  /** @type {Map<string, Awaited<ReturnType<typeof fetchTags>>>} */
  const fetched = new Map();
  /** @type {string[]} */
  const rows = [];
  const written = new Set();
  for (const pin of pins) {
    /** @type {NonNullable<Awaited<ReturnType<typeof fetchTags>>>[]} */
    const parts = [];
    for (const from of [pin.extends, pin.language]) {
      const source = from ? byLanguage.get(from) : undefined;
      if (!from || !source) continue;
      if (!fetched.has(from)) fetched.set(from, await fetchTags(source));
      const tags = fetched.get(from);
      if (!tags) continue;
      parts.push(tags);
      rows.push(row(pin.language, tags));
    }
    if (!parts.length) continue;
    written.add(`${pin.language}.scm`);
    write(
      join(tagsDir, `${pin.language}.scm`),
      parts.map((part) => `; ${part.origin}\n${part.body}`).join("\n"),
    );
  }

  for (const file of await readdir(tagsDir)) {
    if (!file.endsWith(".scm") || written.has(file)) continue;
    rmSync(join(tagsDir, file));
    log(`removed grammars/tags/${file}: no tags query at the pinned release`);
  }

  write(join(tagsDir, "SOURCES.md"), sourcesMarkdown(rows));
  write(
    join(grammarsDir, "extensions.json"),
    `${json(await extensions(pins.map((pin) => pin.language)))}\n`,
  );
}

/**
 * The tags query the pinned release ships — from npm where the package carries
 * one, otherwise from the repository at the matching tag or commit, never from
 * a branch. `null` where that release has no query: those languages abstain.
 * @param {Pin} pin
 */
async function fetchTags(pin) {
  const paths = [pin.sub && `${pin.sub}/queries/tags.scm`, "queries/tags.scm"];
  if (!pin.commit) {
    for (const path of paths.filter(Boolean)) {
      const bytes = await tryGet(`${CDN}/${pin.pkg}@${pin.version}/${path}`);
      if (bytes?.byteLength)
        return {
          pkg: pin.pkg,
          release: `${pin.version}`,
          rule: pin.rule,
          source: "npm",
          path,
          license: await npmLicense(pin),
          origin: `${pin.pkg}@${pin.version} ${path}`,
          body: lf(text(bytes)),
        };
    }
  }
  const commit = pin.commit ?? (await tagCommit(pin));
  if (!commit) return null;
  for (const path of paths.filter(Boolean)) {
    const bytes = await tryGet(`${RAW}/${pin.repo}/${commit}/${path}`);
    if (bytes?.byteLength)
      return {
        pkg: pin.pkg,
        release: pin.version ?? commit,
        rule: pin.rule,
        source: pin.commit ? "github" : `github \`${commit.slice(0, 10)}\``,
        path,
        license: await githubLicense(pin.repo),
        origin: `${pin.repo} ${path} @ ${commit}`,
        body: lf(text(bytes)),
      };
  }
  return null;
}

/** Line endings are the one thing not vendored verbatim; CRLF churns the diff. */
function lf(body) {
  return body.replace(/\r\n/g, "\n");
}

/** The commit a released version is tagged at, `v1.2.3` or `1.2.3`. */
async function tagCommit(pin) {
  for (const tag of [`v${pin.version}`, `${pin.version}`]) {
    const bytes = await tryGet(`${GITHUB}/repos/${pin.repo}/commits/${tag}`);
    if (bytes)
      return /** @type {{ sha: string }} */ (JSON.parse(text(bytes))).sha;
  }
  return undefined;
}

async function npmLicense(pin) {
  const key = `${pin.pkg}@${pin.version}`;
  if (!licenses.has(key)) {
    const document = await getJson(
      `${REGISTRY}/${encodeURIComponent(pin.pkg)}/${pin.version}`,
    );
    licenses.set(key, document.license ?? "see repository");
  }
  return licenses.get(key);
}

async function githubLicense(repo) {
  if (!licenses.has(repo)) {
    const bytes = await tryGet(`${GITHUB}/repos/${repo}/license`);
    const spdx = bytes ? JSON.parse(text(bytes)).license?.spdx_id : undefined;
    licenses.set(repo, spdx ?? "see repository");
  }
  return licenses.get(repo);
}

function row(language, tags) {
  return `| \`${language}.scm\` | ${tags.pkg} | \`${tags.release}\` | ${tags.rule} | ${tags.source} | \`${tags.path}\` | ${tags.license} |`;
}

/** @param {string[]} rows */
function sourcesMarkdown(rows) {
  return [
    "# Tags query sources",
    "",
    "Vendored by `pnpm grammars:pin --tags`; only line endings are",
    "normalised. Each query comes from the exact grammar release its WASM was",
    "built from, so the two cannot drift. Rule says how that release was",
    "identified: `lockfile`, from the one committed at the `tree-sitter-wasms`",
    "release, or `published-before`, the newest release satisfying the declared",
    "range that npm published before it. A file with two rows is a",
    "concatenation: upstream ships TypeScript's tags as a delta over",
    "JavaScript's.",
    "",
    "| File | Package | Release | Rule | Source | Path | License |",
    "| ---- | ------- | ------- | ---- | ------ | ---- | ------- |",
    ...rows,
    "",
  ].join("\n");
}

/** Every pinned query compiles against its own grammar, or the run fails. */
async function compileQueries() {
  await Parser.init();
  const compiled = [];
  const failures = [];
  for (const pin of pins) {
    const path = join(tagsDir, `${pin.language}.scm`);
    if (!existsSync(path)) continue;
    try {
      const grammar = await Language.load(await wasmBytes(pin));
      new Query(grammar, readFileSync(path, "utf8"));
      compiled.push(pin.language);
    } catch (error) {
      failures.push(`${pin.language} (${label(pin)}): ${message(error)}`);
    }
  }
  if (failures.length)
    throw new Error(
      `tags queries that do not compile:\n${failures.join("\n")}`,
    );
  log(`compiled ${compiled.length} tags queries`);
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Extension → manifest language, from Linguist. Only the extensions of
 * languages the manifest carries; a collision needs an `EXTENSION_OWNERS` row.
 * @param {string[]} languages
 */
async function extensions(languages) {
  const byName = linguistExtensions(text(await get(LINGUIST)));
  /** @type {Record<string, string>} */
  const table = {};
  const clashes = new Set();
  for (const language of languages) {
    const name =
      LINGUIST_NAMES[/** @type {keyof typeof LINGUIST_NAMES} */ (language)] ??
      `${language.charAt(0).toUpperCase()}${language.slice(1)}`;
    const found = byName.get(name.toLowerCase());
    if (!found) {
      log(`no Linguist entry for ${name}`);
      continue;
    }
    for (const extension of found) {
      const owner = EXTENSION_OWNERS[extension];
      if (owner) {
        table[extension] = owner;
      } else if (table[extension] && table[extension] !== language) {
        clashes.add(`${extension} (${table[extension]}, ${language})`);
        delete table[extension];
      } else {
        table[extension] = language;
      }
    }
  }
  if (clashes.size) log(`dropped ambiguous: ${[...clashes].sort().join(", ")}`);
  return Object.fromEntries(
    Object.entries(table).sort(([a], [b]) => a.localeCompare(b)),
  );
}

/**
 * languages.yml is one flat mapping of language name to a block carrying an
 * `extensions:` list — small enough that a scanner beats a YAML dependency.
 * @param {string} yaml
 */
function linguistExtensions(yaml) {
  /** @type {Map<string, string[]>} */
  const byName = new Map();
  let name = "";
  let inExtensions = false;
  for (const line of yaml.split("\n")) {
    const top = /^([^\s#][^:]*):\s*$/.exec(line);
    if (top) {
      name = (top[1] ?? "").replace(/^["']|["']$/g, "").toLowerCase();
      inExtensions = false;
      continue;
    }
    if (/^ {2}extensions:\s*$/.test(line)) {
      inExtensions = true;
      continue;
    }
    const item = /^ {2}-\s+(.+?)\s*$/.exec(line);
    if (!item) {
      inExtensions = false;
      continue;
    }
    if (!inExtensions) continue;
    const extension = (item[1] ?? "").replace(/^["']|["']$/g, "").toLowerCase();
    if (extension.startsWith("."))
      byName.set(name, [...(byName.get(name) ?? []), extension]);
  }
  return byName;
}

/** @param {unknown} value */
function json(value) {
  return JSON.stringify(value, null, 2);
}

/** @param {string} path @param {string} body */
function write(path, body) {
  writeFileSync(path, body);
  log(`wrote ${path.slice(root.length + 1)}`);
}

/** @param {string} line */
function log(line) {
  process.stdout.write(`${line}\n`);
}

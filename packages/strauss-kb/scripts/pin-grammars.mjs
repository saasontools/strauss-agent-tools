#!/usr/bin/env node
// @ts-check
/**
 * Pins what the anchor resolver ships: `grammars/manifest.json` (a sha256 per
 * WASM grammar), `grammars/tags/*.scm` (the upstream definition queries),
 * `grammars/tags/SOURCES.md`, and `grammars/extensions.json`.
 *
 * Run by hand, never on install: the WASM is downloaded on first use rather
 * than published, so the manifest is all that ships for it. The grammar ABI is
 * tied to the `web-tree-sitter` minor in package.json; bump both together and
 * run the suite.
 *
 * Usage: node scripts/pin-grammars.mjs [version] [--grammars|--tags]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE = "tree-sitter-wasms";
const CDN = "https://cdn.jsdelivr.net/npm";
const FLAT = "https://data.jsdelivr.com/v1/package/npm";
const LINGUIST =
  "https://raw.githubusercontent.com/github-linguist/linguist/master/lib/linguist/languages.yml";

/**
 * Where each language's tags query comes from. `ref` is a branch: the script
 * resolves it to the commit it downloaded and records that in SOURCES.md, so
 * re-running is how you refresh. A language absent here has no tags query
 * upstream, and the resolver reports `resolver-unavailable` for it.
 *
 * @type {Record<string, { repo: string, path?: string, ref?: string, extends?: string }>}
 */
const TAGS = {
  c: { repo: "tree-sitter/tree-sitter-c" },
  c_sharp: { repo: "tree-sitter/tree-sitter-c-sharp" },
  cpp: { repo: "tree-sitter/tree-sitter-cpp" },
  dart: { repo: "UserNobody14/tree-sitter-dart" },
  elisp: { repo: "Wilfred/tree-sitter-elisp" },
  elixir: { repo: "elixir-lang/tree-sitter-elixir" },
  elm: { repo: "elm-tooling/tree-sitter-elm" },
  go: { repo: "tree-sitter/tree-sitter-go" },
  java: { repo: "tree-sitter/tree-sitter-java" },
  javascript: { repo: "tree-sitter/tree-sitter-javascript" },
  kotlin: { repo: "fwcd/tree-sitter-kotlin" },
  lua: { repo: "tree-sitter-grammars/tree-sitter-lua" },
  ocaml: { repo: "tree-sitter/tree-sitter-ocaml" },
  php: { repo: "tree-sitter/tree-sitter-php" },
  python: { repo: "tree-sitter/tree-sitter-python" },
  ql: { repo: "tree-sitter/tree-sitter-ql" },
  ruby: { repo: "tree-sitter/tree-sitter-ruby" },
  rust: { repo: "tree-sitter/tree-sitter-rust" },
  scala: { repo: "tree-sitter/tree-sitter-scala" },
  solidity: { repo: "JoranHonig/tree-sitter-solidity" },
  swift: { repo: "alex-pinkus/tree-sitter-swift" },
  // The TypeScript grammars are the JavaScript one plus a few nodes, and so is
  // their tags file: upstream ships only the delta, so the two concatenate.
  tsx: { repo: "tree-sitter/tree-sitter-typescript", extends: "javascript" },
  typescript: {
    repo: "tree-sitter/tree-sitter-typescript",
    extends: "javascript",
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

if (only !== "tags") await pinGrammars();
if (only !== "grammars") await pinTags();

/** Every `out/*.wasm` the pinned release ships, hashed into the manifest. */
async function pinGrammars() {
  const languages = await wasmLanguages();
  /** @type {Record<string, { sha256: string, bytes: number }>} */
  const grammars = {};
  for (const language of languages) {
    const name = `tree-sitter-${language}.wasm`;
    const bytes = await get(`${CDN}/${PACKAGE}@${version}/out/${name}`);
    grammars[language] = {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.byteLength,
    };
    // Fixtures exist only for the languages the suite parses; the rest would
    // add megabytes to the repository for nothing.
    const fixture = join(fixturesDir, name);
    if (existsSync(fixture)) writeFileSync(fixture, bytes);
  }
  write(manifestPath, `${json({ package: PACKAGE, version, grammars })}\n`);
  log(`pinned ${languages.length} grammars from ${PACKAGE}@${version}`);
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

/** The upstream tags queries, their provenance, and the extension table. */
async function pinTags() {
  const languages = manifestLanguages();
  mkdirSync(tagsDir, { recursive: true });

  /** @type {Map<string, Awaited<ReturnType<typeof fetchTags>>>} */
  const fetched = new Map();
  /** @type {string[]} */
  const rows = [];
  for (const language of languages.filter((name) => TAGS[name])) {
    const parts = [];
    for (const from of [TAGS[language]?.extends, language]) {
      if (!from) continue;
      if (!fetched.has(from)) fetched.set(from, await fetchTags(from));
      const source = fetched.get(from);
      if (!source) continue;
      parts.push(source);
      rows.push(
        `| \`${language}.scm\` | ${source.repo} | \`${source.path}\` | \`${source.commit}\` | ${source.license} |`,
      );
    }
    write(
      join(tagsDir, `${language}.scm`),
      parts
        .map((part) => `; ${part.repo} ${part.path} @ ${part.commit}\n${part.body}`)
        .join("\n"),
    );
  }
  write(join(tagsDir, "SOURCES.md"), sourcesMarkdown(rows));
  write(
    join(grammarsDir, "extensions.json"),
    `${json(await extensions(languages))}\n`,
  );
}

function manifestLanguages() {
  return Object.keys(
    /** @type {{ grammars: Record<string, unknown> }} */ (
      JSON.parse(readFileSync(manifestPath, "utf8"))
    ).grammars,
  );
}

/** @param {string[]} rows */
function sourcesMarkdown(rows) {
  return [
    "# Tags query sources",
    "",
    "Vendored verbatim from each grammar's upstream repository by `pnpm",
    "grammars:pin --tags`, which is also how they are refreshed. Every file is",
    "MIT or Apache-2.0, as the License column says; a file with two rows is the",
    "concatenation of both, because upstream ships TypeScript's tags as a delta",
    "over JavaScript's.",
    "",
    "| File | Repository | Path | Commit | License |",
    "| ---- | ---------- | ---- | ------ | ------- |",
    ...rows,
    "",
  ].join("\n");
}

/** @param {string} language */
async function fetchTags(language) {
  const entry = TAGS[language];
  if (!entry) throw new Error(`${language}: no tags source`);
  const path = entry.path ?? "queries/tags.scm";
  const repository = /** @type {{ default_branch: string, license: { spdx_id: string } }} */ (
    await getJson(`https://api.github.com/repos/${entry.repo}`)
  );
  const license = repository.license.spdx_id;
  const commit = /** @type {{ sha: string }} */ (
    await getJson(
      `https://api.github.com/repos/${entry.repo}/commits/${entry.ref ?? repository.default_branch}`,
    )
  ).sha;
  const body = text(
    await get(
      `https://raw.githubusercontent.com/${entry.repo}/${commit}/${path}`,
    ),
  );
  return { repo: entry.repo, path, commit, license, body };
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

/** @param {string} url */
async function get(url) {
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** @param {string} url */
async function getJson(url) {
  return JSON.parse(text(await get(url)));
}

function headers() {
  /** @type {Record<string, string>} */
  const headers = { "user-agent": "strauss-kb-pin-grammars" };
  const token = process.env["GITHUB_TOKEN"] ?? process.env["GH_TOKEN"];
  if (token) headers["authorization"] = `Bearer ${token}`;
  return headers;
}

/** @param {Uint8Array} bytes */
function text(bytes) {
  return new TextDecoder().decode(bytes);
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

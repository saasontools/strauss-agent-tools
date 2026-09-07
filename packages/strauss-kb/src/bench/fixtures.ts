import {
  cpSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { stringifyMarkdownWithFrontmatter } from "../markdown.js";
import type { KbRecord } from "../kb-record.schema.js";
import type { DiffFile } from "../match-diff.js";
import type { KbLogEntry } from "../kb-log.js";

/**
 * Inputs for the benches and for the ceilings in `perf.spec.ts`.
 *
 * Seeded, so a number moves only when the code does. Dev-only: nothing under
 * `src/` imports this, and it is not in the published `files` list.
 */

const AT = "2026-09-01T00:00:00.000Z";
const BY = "agent:bench";

/**
 * Sampling every bench shares. Short on purpose: the whole run has to fit in
 * the couple of minutes someone will actually wait, and the numbers here move
 * in multiples when they regress, not in percent.
 */
export const SAMPLING = {
  time: 200,
  iterations: 3,
  warmupTime: 50,
  warmupIterations: 1,
} as const;

/** mulberry32 — 32 bits of state, enough for shape, cheap enough to inline. */
export function rng(seed = 1): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One file path per index, in the shape anchors are written. */
export function benchFile(at: number): string {
  return `src/module-${at}/service-${at}.ts`;
}

export function benchSymbol(at: number): string {
  return `handle${at}`;
}

/**
 * `count` records spread round-robin over `files` paths, half of them anchored
 * on a symbol and half on the whole file — the mix that decides whether a hunk
 * comes back `symbol` or `file`.
 */
export function benchRecords(count: number, files: number): KbRecord[] {
  const random = rng(count * 31 + files);
  return Array.from({ length: count }, (_, at) => {
    const file = benchFile(at % files);
    const symbol = random() < 0.5 ? benchSymbol(at % 8) : undefined;
    return {
      conceptId: `decision.bench-${at}`,
      body: `## Decision\n\nBench record ${at}.\n`,
      frontmatter: {
        type: "decision",
        title: `Decision ${at}`,
        description: "Generated for the benchmark.",
        generated: { by: BY, at: AT },
        verified: [],
        strauss_status: "accepted" as const,
        strauss_anchors: [{ file, ...(symbol ? { symbol } : {}) }],
      },
    };
  });
}

/** `review:generated` facts, the overrides `classify` probes every file against. */
export function benchOverrides(count: number, files: number): KbRecord[] {
  return Array.from({ length: count }, (_, at) => ({
    conceptId: `fact.bench-generated-${at}`,
    body: `## Claim\n\nGenerated output ${at}.\n`,
    frontmatter: {
      type: "fact",
      title: `Generated ${at}`,
      generated: { by: BY, at: AT },
      verified: [],
      tags: ["review:generated"],
      strauss_status: "accepted" as const,
      strauss_anchors: [{ file: benchFile(at % files) }],
    },
  }));
}

/**
 * `hunks` changed ranges spread over `files` files, ten per file where there
 * are enough — a diff's hunks cluster, and one file holding a thousand of them
 * would measure a shape no review produces.
 */
export function benchDiff(
  hunks: number,
  files: number,
  options: { withLines?: boolean } = {},
): DiffFile[] {
  const per = Math.max(1, Math.ceil(hunks / files));
  const out: DiffFile[] = [];
  let left = hunks;
  for (let at = 0; at < files && left > 0; at += 1) {
    const take = Math.min(per, left);
    left -= take;
    out.push({
      filePath: benchFile(at),
      hunks: Array.from({ length: take }, (_, index) => {
        const startLine = 1 + index * 12;
        return {
          startLine,
          endLine: startLine + 4,
          ...(options.withLines
            ? { lines: [`  const value${index} = ${index};`] }
            : {}),
        };
      }),
    });
  }
  return out;
}

/** A brace-scoped source of about `lines` lines: what the regex resolver walks. */
export function braceSource(lines: number): string {
  const out: string[] = ["export const preamble = 0;", ""];
  for (let at = 0; out.length < lines; at += 1) {
    out.push(
      `export function ${benchSymbol(at)}(input: string): string {`,
      `  const prefix = "row-${at}";`,
      "  if (input.length > 0) {",
      "    return `${prefix}:${input}`;",
      "  }",
      "  return prefix;",
      "}",
      "",
    );
  }
  return `${out.slice(0, lines).join("\n")}\n`;
}

/**
 * The same size with no braces at all — the shape that makes `captureBraceBlock`
 * walk to the end of the file, since no depth ever returns to zero. Each name
 * is unique, so the resolver reaches that walk rather than stopping at an
 * ambiguity.
 */
export function plainSource(lines: number): string {
  return `${Array.from(
    { length: lines },
    (_, at) => `${plainSymbol(at)}: value number ${at}`,
  ).join("\n")}\n`;
}

export function plainSymbol(at: number): string {
  return `field_${at}`;
}

/** `count` log lines, chronological, as `record()` writes them. */
export function benchLog(count: number): string {
  const start = Date.parse(AT);
  const operations = ["write", "supersede", "status", "verify"];
  return `${Array.from({ length: count }, (_, at) => {
    const entry: KbLogEntry = {
      at: new Date(start + at * 1000).toISOString(),
      by: BY,
      operation: operations[at % operations.length] as string,
      conceptId: `decision.bench-${at}`,
    };
    return JSON.stringify(entry);
  }).join("\n")}\n`;
}

/** Writes records as the store reads them: one `<conceptId>.md` per record. */
export function writeBase(dir: string, records: readonly KbRecord[]): string {
  mkdirSync(dir, { recursive: true });
  for (const record of records) {
    writeFileSync(
      join(dir, `${record.conceptId}.md`),
      stringifyMarkdownWithFrontmatter(record.body, record.frontmatter),
      "utf8",
    );
  }
  return dir;
}

/**
 * The companion fixture's `base/` tree, copied `factor` times into `out`.
 *
 * Scaling by copy rather than by generation: the point of the fixture is that
 * its files are the ones the resolvers were tuned against, and a synthesized
 * stand-in would measure the generator instead. Empty when the fixture is not
 * on disk — a published checkout has no `fixtures/`.
 */
export function scaleCompanionBase(
  out: string,
  factor: number,
): { root: string; files: string[] } {
  const base = fileURLToPath(
    new URL("../../../../fixtures/companion-repo/base", import.meta.url),
  );
  if (!exists(base)) return { root: out, files: [] };

  const files: string[] = [];
  for (let copy = 0; copy < factor; copy += 1) {
    const target = join(out, `copy-${copy}`);
    cpSync(base, target, { recursive: true });
    for (const file of walk(target)) {
      files.push(relative(out, file).split(sep).join("/"));
    }
  }
  return { root: out, files };
}

function exists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

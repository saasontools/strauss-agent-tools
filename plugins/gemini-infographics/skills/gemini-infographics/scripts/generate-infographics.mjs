#!/usr/bin/env node
// @ts-check
/**
 * Generate infographics with the Gemini image API ("nano banana").
 *
 * Usage:
 *   generate-infographics.mjs SPEC.json --out DIR [--mode auto|sync|batch]
 *                             [--model MODEL] [--no-fallback] [--dry-run]
 *   generate-infographics.mjs --list-models
 *
 * SPEC.json is a list of entries:
 *   [{"name": "viz-x", "prompt": "...", "aspectRatio": "16:9",
 *     "imageSize": "1K", "model": "flash"}]
 *
 * Only `name` and `prompt` are required. Results are written to DIR/<name>.png.
 * Entries sharing a resolved model are batched (half price) when there are >= 3
 * of them and mode is auto; otherwise they run sync. Exit code is non-zero if
 * any image failed after retries.
 *
 * Model selection, highest precedence first:
 *   1. the entry's "model"
 *   2. --model
 *   3. $GEMINI_IMAGE_MODEL
 *   4. DEFAULT_ALIAS below
 *
 * A model may be a concrete id ("gemini-3.1-flash-image") or an alias:
 *   flash | flash-lite | pro    pinned ids, the known-good defaults
 *   latest                      newest image model the key can see
 *   latest-flash | latest-flash-lite | latest-pro
 *                               newest model in that family
 *
 * Pinned ids are resolved live too: if one is gone (404/NOT_FOUND) or the key
 * has no access to it, the script falls back to the newest model in the same
 * family and keeps going. `--no-fallback` (or GEMINI_IMAGE_MODEL_FALLBACK=off)
 * turns that off and lets the failure stand.
 *
 * Node >= 18 standard library only — no dependencies, no build step.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

/**
 * @typedef {object} Entry
 * @property {string} name
 * @property {string} prompt
 * @property {string} [aspectRatio]
 * @property {string} [imageSize]
 * @property {string} [model]
 */

const API_BASE =
  process.env.GEMINI_API_BASE ??
  "https://generativelanguage.googleapis.com/v1beta";
const BATCH_THRESHOLD = 3;
const BATCH_TIMEOUT_MS = 2_400_000;
const SYNC_RETRIES = 3;
const POLL_INTERVAL_MS = 15_000;

const DEFAULT_ALIAS = "flash";

/**
 * Pinned ids are what these aliases mean *today*; the resolver below repairs
 * them against the live model list when an id stops existing.
 * @type {Record<string, string>}
 */
const ALIASES = {
  flash: "gemini-3.1-flash-image",
  "flash-lite": "gemini-3.1-flash-lite-image",
  pro: "gemini-3-pro-image",
};

/** @type {Record<string, string>} */
const LATEST_ALIASES = {
  latest: "any",
  "latest-flash": "flash",
  "latest-flash-lite": "flash-lite",
  "latest-pro": "pro",
};

/** @type {string[]} */
let modelsCache = [];
/** @type {Map<string, string>} */
const latestCache = new Map();
/**
 * Concrete id -> replacement, once a fallback has been resolved for it. Keeps
 * a dead pin from costing one ListModels round trip per image.
 * @type {Map<string, string>}
 */
const remapped = new Map();

/** @param {string} msg @returns {never} */
function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function apiKey() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    die(
      "GEMINI_API_KEY is not set.\n" +
        "Set it with:  export GEMINI_API_KEY='your-key-here'\n" +
        "Get a key at: https://aistudio.google.com/apikey",
    );
  }
  return key;
}

/** An API response that came back with a non-2xx status. */
class HttpError extends Error {
  /** @param {number} status @param {string} detail */
  constructor(status, detail) {
    super(`HTTP ${status} ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

/**
 * @param {Response} res
 * @returns {Promise<any>}
 */
async function readJson(res) {
  if (!res.ok) {
    throw new HttpError(res.status, (await res.text()).slice(0, 200));
  }
  return res.json();
}

/**
 * @param {string} url
 * @param {unknown} body
 * @param {number} [timeoutMs]
 * @returns {Promise<any>}
 */
async function post(url, body, timeoutMs = 300_000) {
  return readJson(
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    }),
  );
}

/**
 * @param {string} url
 * @param {number} [timeoutMs]
 * @returns {Promise<any>}
 */
async function get(url, timeoutMs = 120_000) {
  return readJson(
    await fetch(url, {
      headers: { "x-goog-api-key": apiKey() },
      signal: AbortSignal.timeout(timeoutMs),
    }),
  );
}

// ---------------------------------------------------------------------------
// model resolution

/** @param {string} model */
function familyOf(model) {
  if (model.includes("flash-lite")) return "flash-lite";
  if (model.includes("flash")) return "flash";
  if (model.includes("pro")) return "pro";
  return "any";
}

/** Sort key: version number first, stable before preview/exp. @param {string} name */
function versionKey(name) {
  const m = /gemini-(\d+)(?:\.(\d+))?/.exec(name);
  const major = m ? Number(m[1]) : 0;
  const minor = m && m[2] ? Number(m[2]) : 0;
  const stable = /preview|exp|-\d{2}-\d{4}$/.test(name) ? 0 : 1;
  return [major, minor, stable, -name.length];
}

/** @param {string} a @param {string} b */
function byNewestFirst(a, b) {
  const ka = versionKey(a);
  const kb = versionKey(b);
  for (let i = 0; i < ka.length; i++) {
    const diff = (kb[i] ?? 0) - (ka[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Every image-generating model the key can see, newest first. */
async function imageModels() {
  if (modelsCache.length) return modelsCache;
  /** @type {any[]} */
  const page = [];
  let token = "";
  for (;;) {
    const url = `${API_BASE}/models?pageSize=200${token ? `&pageToken=${token}` : ""}`;
    const data = await get(url);
    page.push(...(data.models ?? []));
    token = data.nextPageToken ?? "";
    if (!token) break;
  }
  /** @type {string[]} */
  const found = [];
  for (const m of page) {
    const name = String(m.name ?? "").split("/").pop() ?? "";
    // An image model is one whose name says so; the generation-method list is
    // "generateContent" for image and text models alike.
    const methods = m.supportedGenerationMethods ?? [];
    if (/-image(-|$)/.test(name) && methods.includes("generateContent")) {
      found.push(name);
    }
  }
  modelsCache = found.sort(byNewestFirst);
  return modelsCache;
}

/** @param {string} family */
async function latestModel(family) {
  const cached = latestCache.get(family);
  if (cached) return cached;
  const candidates = (await imageModels()).filter(
    (m) => family === "any" || familyOf(m) === family,
  );
  const newest = candidates[0];
  if (!newest) {
    die(
      `no image model available for family '${family}'.\n` +
        "Run with --list-models to see what this API key can reach, then " +
        "pin one explicitly with --model.",
    );
  }
  latestCache.set(family, newest);
  return newest;
}

/**
 * Alias or concrete id -> concrete id. Only 'latest*' hits the network.
 * @param {string} raw
 */
async function resolveModel(raw) {
  if (raw in ALIASES) return /** @type {string} */ (ALIASES[raw]);
  const family = LATEST_ALIASES[raw];
  if (family) return latestModel(family);
  return raw;
}

/** @param {unknown} err */
function isMissingModel(err) {
  if (!(err instanceof HttpError)) return false;
  return (
    (err.status === 403 || err.status === 404) &&
    /NOT_FOUND|not found|PERMISSION_DENIED|does not exist/.test(err.detail)
  );
}

/**
 * Newest live model in `model`'s family, or `model` itself if none / off.
 * @param {string} model
 * @param {boolean} fallback
 */
async function fallbackModel(model, fallback) {
  if (!fallback) return model;
  const known = remapped.get(model);
  if (known) return known;
  const replacement = await latestModel(familyOf(model));
  if (replacement !== model) {
    console.error(`  ${model} unavailable — falling back to ${replacement}`);
  }
  remapped.set(model, replacement);
  return replacement;
}

// ---------------------------------------------------------------------------
// generation

/** @param {Entry} entry */
function genRequest(entry) {
  return {
    contents: [{ parts: [{ text: entry.prompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: entry.aspectRatio ?? "16:9",
        imageSize: entry.imageSize ?? "1K",
      },
    },
  };
}

/** @param {any} response @param {string} path */
function saveImage(response, path) {
  for (const cand of response?.candidates ?? []) {
    for (const part of cand?.content?.parts ?? []) {
      if (part.inlineData) {
        writeFileSync(path, Buffer.from(part.inlineData.data, "base64"));
        return true;
      }
    }
  }
  return false;
}

/**
 * @param {string} model
 * @param {Entry[]} entries
 * @param {string} outdir
 * @param {boolean} fallback
 * @returns {Promise<string[]>} names that failed
 */
async function runSync(model, entries, outdir, fallback) {
  /** @type {string[]} */
  const failed = [];
  for (const e of entries) {
    // a fallback resolved for an earlier entry applies to the rest of the
    // group — never re-discover a dead pin per image
    model = remapped.get(model) ?? model;
    const path = join(outdir, `${e.name}.png`);
    let ok = false;
    for (let attempt = 1; attempt <= SYNC_RETRIES; attempt++) {
      /** @type {any} */
      let resp;
      try {
        resp = await post(
          `${API_BASE}/models/${model}:generateContent`,
          genRequest(e),
        );
      } catch (err) {
        if (err instanceof HttpError) {
          console.error(`  ${e.name}: HTTP ${err.status} ${err.detail}`);
          if (isMissingModel(err)) {
            const replacement = await fallbackModel(model, fallback);
            if (replacement !== model) {
              model = replacement;
              continue;
            }
            break;
          }
          if (
            [429, 500, 503].includes(err.status) &&
            attempt < SYNC_RETRIES
          ) {
            await sleep(15_000 * attempt);
            continue;
          }
          break;
        }
        console.error(`  ${e.name}: ${String(err)}`);
        if (attempt === SYNC_RETRIES) break;
        await sleep(5_000);
        continue;
      }
      if (saveImage(resp, path)) {
        console.log(`  ok ${e.name}`);
        ok = true;
        break;
      }
      console.error(`  ${e.name}: empty response, attempt ${attempt}`);
      await sleep(5_000);
    }
    if (!ok) failed.push(e.name);
  }
  return failed;
}

/**
 * @param {string} model
 * @param {Entry[]} entries
 * @param {string} outdir
 * @param {boolean} fallback
 * @returns {Promise<string[]>} names that failed
 */
async function runBatch(model, entries, outdir, fallback) {
  const body = {
    batch: {
      display_name: `infographics-${Date.now()}`,
      input_config: {
        requests: {
          requests: entries.map((e) => ({
            request: genRequest(e),
            metadata: { key: e.name },
          })),
        },
      },
    },
  };

  /** @type {any} */
  let op;
  try {
    op = await post(
      `${API_BASE}/models/${model}:batchGenerateContent`,
      body,
      120_000,
    );
  } catch (err) {
    console.error(
      `  batch submit: ${err instanceof HttpError ? `HTTP ${err.status} ${err.detail}` : String(err)}`,
    );
    if (isMissingModel(err)) {
      const replacement = await fallbackModel(model, fallback);
      if (replacement !== model) {
        return runBatch(replacement, entries, outdir, fallback);
      }
    }
    console.error("  batch submit failed — falling back to sync");
    return runSync(model, entries, outdir, fallback);
  }

  const opname = op.name;
  console.log(`  batch ${opname} (${entries.length} images)`);

  const t0 = Date.now();
  /** @type {any} */
  let st;
  for (;;) {
    await sleep(POLL_INTERVAL_MS);
    // transient network errors must not abandon a paid batch — keep polling
    try {
      st = await get(`${API_BASE}/${opname}`);
    } catch (err) {
      console.error(
        `  ${elapsed(t0)} poll error (${String(err)}); retrying`,
      );
      continue;
    }
    console.log(`  ${elapsed(t0)} ${st?.metadata?.state ?? "?"}`);
    if (st.done) break;
    if (Date.now() - t0 > BATCH_TIMEOUT_MS) {
      console.error("  batch timeout — falling back to sync");
      return runSync(model, entries, outdir, fallback);
    }
  }

  const byName = new Map(entries.map((e) => [e.name, e]));
  /** @type {string[]} */
  const failed = [];
  const inlined = st?.response?.inlinedResponses?.inlinedResponses ?? [];
  for (const item of inlined) {
    const key = item?.metadata?.key ?? "?";
    if (item.error) {
      console.error(`  ERR ${key}: ${JSON.stringify(item.error).slice(0, 150)}`);
      failed.push(key);
      continue;
    }
    if (saveImage(item.response, join(outdir, `${key}.png`))) {
      console.log(`  ok ${key}`);
    } else {
      console.error(`  ${key}: no image in batch response`);
      failed.push(key);
    }
  }

  // per-request failures inside a successful batch retry individually
  const retry = failed
    .map((n) => byName.get(n))
    .filter(/** @returns {e is Entry} */ (e) => e !== undefined);
  if (retry.length) {
    console.log(`  retrying ${retry.length} failed entries sync`);
    return runSync(model, retry, outdir, fallback);
  }
  return [];
}

/** @param {number} t0 */
function elapsed(t0) {
  return `${String(Math.round((Date.now() - t0) / 1000)).padStart(5)}s`;
}

// ---------------------------------------------------------------------------

const USAGE = `Usage:
  generate-infographics.mjs SPEC.json --out DIR [--mode auto|sync|batch]
                            [--model MODEL] [--no-fallback] [--dry-run]
  generate-infographics.mjs --list-models

  --out DIR        output directory for PNGs
  --mode MODE      auto (default) | sync | batch
  --model MODEL    default model for entries with no "model" (alias or id);
                   overrides $GEMINI_IMAGE_MODEL
  --no-fallback    fail instead of falling back to the latest model in the family
  --dry-run        validate the spec and print the model plan; generate nothing
  --list-models    list the image models this API key can reach, newest first
`;

/** @param {string} specPath @returns {Entry[]} */
function loadSpec(specPath) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(specPath, "utf8"));
  } catch (err) {
    return die(`cannot read spec ${specPath}: ${String(err)}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return die("spec must be a non-empty JSON list");
  }
  /** @type {Set<string>} */
  const seen = new Set();
  for (const e of parsed) {
    if (!e || typeof e.name !== "string" || typeof e.prompt !== "string") {
      die(`spec entry missing name/prompt: ${JSON.stringify(e).slice(0, 100)}`);
    }
    if (seen.has(e.name)) {
      die(`duplicate entry name '${e.name}' — outputs would overwrite`);
    }
    seen.add(e.name);
  }
  return parsed;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" },
      mode: { type: "string", default: "auto" },
      model: { type: "string" },
      "no-fallback": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "list-models": { type: "boolean", default: false },
      help: { type: "boolean", default: false, short: "h" },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  if (values["list-models"]) {
    for (const m of await imageModels()) console.log(m);
    return;
  }

  const spec = positionals[0];
  const out = values.out;
  if (!spec || !out) {
    console.error(USAGE);
    die("spec and --out are required (unless --list-models)");
    return;
  }
  const mode = values.mode ?? "auto";
  if (!["auto", "sync", "batch"].includes(mode)) {
    die(`--mode must be auto, sync or batch (got '${mode}')`);
  }

  const fallback =
    !values["no-fallback"] && process.env.GEMINI_IMAGE_MODEL_FALLBACK !== "off";
  const defaultModel =
    values.model || process.env.GEMINI_IMAGE_MODEL || DEFAULT_ALIAS;

  const entries = loadSpec(spec);

  if (values["dry-run"]) {
    console.log(
      `default model: ${defaultModel}   fallback: ${fallback ? "on" : "off"}`,
    );
    for (const e of entries) {
      const raw = e.model || defaultModel;
      const shown = raw in LATEST_ALIASES ? raw : await resolveModel(raw);
      console.log(
        `  ${e.name}: ${raw} -> ${shown}` +
          `  ${e.aspectRatio ?? "16:9"} ${e.imageSize ?? "1K"}`,
      );
    }
    return;
  }

  mkdirSync(out, { recursive: true });
  apiKey();

  /** @type {Map<string, Entry[]>} */
  const byModel = new Map();
  for (const e of entries) {
    const model = await resolveModel(e.model || defaultModel);
    byModel.set(model, [...(byModel.get(model) ?? []), e]);
  }

  /** @type {string[]} */
  let failed = [];
  const t0 = Date.now();
  for (const [model, group] of byModel) {
    const useBatch =
      mode === "batch" || (mode === "auto" && group.length >= BATCH_THRESHOLD);
    console.log(
      `${model}: ${group.length} images (${useBatch ? "batch" : "sync"})`,
    );
    failed = failed.concat(
      useBatch
        ? await runBatch(model, group, out, fallback)
        : await runSync(model, group, out, fallback),
    );
  }

  console.log(
    `done: ${entries.length - failed.length}/${entries.length} in ` +
      `${Math.round((Date.now() - t0) / 1000)}s`,
  );
  if (failed.length) {
    console.error(`FAILED: ${failed.join(", ")}`);
    process.exit(2);
  }
}

await main();

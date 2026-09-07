// @ts-check
/**
 * C5's link check. Cached under `$TMPDIR/strauss-kb/gate-urls.json` so a
 * re-run costs nothing, and skipped whole when the network is unreachable —
 * an offline runner must not turn into a wall of warnings.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const CACHE = join(tmpdir(), "strauss-kb", "gate-urls.json");
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** @type {Record<string, { at: number, state: string }> | null} */
let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync(CACHE, "utf8"));
  } catch {
    cache = {};
  }
  return cache ?? {};
}

function save() {
  try {
    mkdirSync(dirname(CACHE), { recursive: true });
    const temp = `${CACHE}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(cache ?? {}));
    renameSync(temp, CACHE);
  } catch {
    // An unwritable cache costs a repeat request, never a failed gate.
  }
}

/**
 * The four trackers a source may be probed against, anchored at the authority
 * so a path can never carry a host: `https://` only, no literal address, no
 * `localhost`. Everything else is a URL the gate looks at and does not fetch.
 */
const PROBEABLE =
  /^https:\/\/(github\.com|gitlab\.com|linear\.app|[a-z0-9-]+\.atlassian\.net)\//;

/** @param {string} url */
export function isProbeable(url) {
  return PROBEABLE.test(url);
}

/**
 * `"missing"` only for a definite 404. Anything else — a timeout, a login
 * wall, no network — is `"unknown"`, which C5 does not report.
 * @param {string} url @returns {"missing" | "present" | "unknown"}
 */
export function checkUrl(url) {
  if (!isProbeable(url)) return "unknown";
  const store = load();
  const hit = store[url];
  if (hit && Date.now() - hit.at < TTL_MS) {
    return /** @type {"missing" | "present" | "unknown"} */ (hit.state);
  }
  const state = probe(url);
  store[url] = { at: Date.now(), state };
  save();
  return state;
}

/** @param {string} url @returns {"missing" | "present" | "unknown"} */
function probe(url) {
  try {
    const status = execFileSync(
      "curl",
      [
        "-sS",
        "-o",
        process.platform === "win32" ? "NUL" : "/dev/null",
        "-w",
        "%{http_code}",
        "-I",
        "--proto",
        "=https",
        "--max-time",
        "5",
        "--",
        url,
      ],
      { encoding: "utf8", timeout: 6000 },
    ).trim();
    if (status === "404" || status === "410") return "missing";
    return status.startsWith("2") || status.startsWith("3")
      ? "present"
      : "unknown";
  } catch {
    return "unknown";
  }
}

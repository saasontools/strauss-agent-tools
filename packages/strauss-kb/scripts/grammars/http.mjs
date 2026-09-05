// @ts-check
/** HTTP for the grammars tool: bytes, JSON, and a 404-tolerant variant. */

/** @param {string} url */
export async function get(url) {
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Bytes, or `null` when the resource is absent — GitHub answers 422 rather
 * than 404 for a ref that does not exist.
 * @param {string} url
 */
export async function tryGet(url) {
  const response = await fetch(url, { headers: headers() });
  if (response.status === 404 || response.status === 422) return null;
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** @param {string} url */
export async function getJson(url) {
  return JSON.parse(text(await get(url)));
}

/** @param {string} url */
export async function tryGetJson(url) {
  const bytes = await tryGet(url);
  return bytes === null ? null : JSON.parse(text(bytes));
}

function headers() {
  /** @type {Record<string, string>} */
  const headers = { "user-agent": "strauss-kb-grammars" };
  const token = process.env["GITHUB_TOKEN"] ?? process.env["GH_TOKEN"];
  if (token) headers["authorization"] = `Bearer ${token}`;
  return headers;
}

/** @param {Uint8Array} bytes */
export function text(bytes) {
  return new TextDecoder().decode(bytes);
}

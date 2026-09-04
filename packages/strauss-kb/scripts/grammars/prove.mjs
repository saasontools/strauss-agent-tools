// @ts-check
/**
 * Loads one grammar and compiles one query, in a worker of its own.
 *
 * web-tree-sitter shares a single WebAssembly heap per thread, and the 36
 * grammars together overrun it — the ninth load fails with "memory access out
 * of bounds" whatever the grammar is. A worker per pack is the cheap fix.
 */
import { parentPort, workerData } from "node:worker_threads";
import { Language, Parser, Query } from "web-tree-sitter";

const { wasm, query } = workerData;

/** @returns {Promise<{ part: "wasm" | "tags", message: string } | null>} */
async function prove() {
  await Parser.init();
  let grammar;
  try {
    grammar = await Language.load(new Uint8Array(wasm));
  } catch (error) {
    return { part: "wasm", message: message(error) };
  }
  if (!query) return null;
  try {
    new Query(grammar, query);
  } catch (error) {
    return { part: "tags", message: message(error) };
  }
  return null;
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

parentPort?.postMessage(await prove());

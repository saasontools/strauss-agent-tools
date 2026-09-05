import { INDEX_FILE } from "./kb-index.js";
import { LOG_FILE } from "./kb-log.js";
import { SEARCH_INDEX_FILE } from "./search-index.js";

/**
 * The files the store owns rather than a producer. Not records: listings skip
 * them, and `.gitattributes` marks them generated.
 */
export const STORE_OWNED_FILES = [INDEX_FILE, LOG_FILE, SEARCH_INDEX_FILE];

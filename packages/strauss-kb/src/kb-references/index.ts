/**
 * Explicit references between records, read off both halves of a record: its
 * prose citations and its `strauss_links` frontmatter.
 *
 * Importers point here, not at the files behind it.
 */
export { outboundReferences } from "./outbound.js";
export {
  liveReferencesTo,
  staleReferences,
  staleReferencesFrom,
} from "./stale.js";
export { KB_REFERENCE_ORIGINS } from "./model.js";
export type {
  KbLiveReference,
  KbOutboundReference,
  KbReferenceOrigin,
  KbStaleReference,
} from "./model.js";

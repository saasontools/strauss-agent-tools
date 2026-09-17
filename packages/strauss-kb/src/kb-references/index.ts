/**
 * Explicit references between records, read off `strauss_links`.
 *
 * Importers point here, not at the files behind it.
 */
export { outboundReferences } from "./outbound.js";
export {
  liveReferencesTo,
  staleReferences,
  staleReferencesFrom,
} from "./stale.js";
export {
  type KbLiveReference,
  type KbOutboundReference,
  type KbStaleReference,
} from "./model.js";

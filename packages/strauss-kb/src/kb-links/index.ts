/**
 * The inbound half of the typed causal graph: `kb_impact` and `kb_backlinks`.
 *
 * Importers point here, not at the files behind it.
 */
export { backlinks } from "./backlinks.js";
export { impact } from "./impact.js";
export { inboundIndex } from "./inbound.js";
export type {
  KbBacklink,
  KbBacklinksResult,
  KbImpactOptions,
  KbImpactResult,
  KbImpactedRecord,
  KbInboundEdge,
  KbLinkEdge,
} from "./model.js";

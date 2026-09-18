/**
 * `kb_anchor_resolve`: what a record's anchors point at now, and what this run
 * wrote about it. The comparison (`plan`) and the write (`apply`) are separate
 * passes, so an outcome is never claimed before the base holds it.
 */
export { anchorResolveCommand } from "./command.js";
export * from "./model.js";

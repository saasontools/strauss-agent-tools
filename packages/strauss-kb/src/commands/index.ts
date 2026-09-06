/**
 * The command table, assembled from one file per command.
 *
 * Order is the CLI usage listing's order: the write path, the read path,
 * base housekeeping, the format, and the workspace pin verbs.
 */
import { DECISION_TYPE } from "../decision-record.js";
import { anchorResolveCommand } from "./anchor-resolve.js";
import { answerCommand } from "./answer.js";
import { backlinksCommand } from "./backlinks.js";
import { catalogCommand } from "./catalog.js";
import { contextCommand } from "./context.js";
import { doctorCommand } from "./doctor.js";
import { impactCommand } from "./impact.js";
import { listCommand } from "./list.js";
import { loadCommand } from "./load.js";
import { logCommand } from "./log.js";
import { noDecisionCommand } from "./no-decision.js";
import { packCommand } from "./pack.js";
import { pinCommand } from "./pin.js";
import { pinsCommand } from "./pins.js";
import { queryCommand } from "./query.js";
import { readIndexCommand } from "./read-index.js";
import { reassessCommand } from "./reassess.js";
import { schemaCommand } from "./schema.js";
import { stampCommand } from "./stamp.js";
import { statusCommand } from "./status.js";
import { supersedeCommand } from "./supersede.js";
import { syncInstructionsCommand } from "./sync-instructions.js";
import { traceCommand } from "./trace.js";
import { typesCommand } from "./types.js";
import { unpinCommand } from "./unpin.js";
import { validateCommand } from "./validate.js";
import { verifyCommand } from "./verify.js";
import { writeCommand } from "./write.js";
import { writeDecisionCommand } from "./write-decision.js";
import type { KbCommand } from "./model.js";

export const KB_COMMANDS: KbCommand[] = [
  writeCommand,
  writeDecisionCommand,
  noDecisionCommand,
  statusCommand,
  supersedeCommand,
  answerCommand,
  verifyCommand,
  anchorResolveCommand,
  reassessCommand,
  loadCommand,
  catalogCommand,
  packCommand,
  queryCommand,
  traceCommand,
  impactCommand,
  backlinksCommand,
  listCommand,
  readIndexCommand,
  logCommand,
  stampCommand,
  validateCommand,
  doctorCommand,
  schemaCommand,
  pinCommand,
  unpinCommand,
  pinsCommand,
  contextCommand,
  syncInstructionsCommand,
  typesCommand,
];

export const KB_COMMANDS_BY_NAME = new Map(
  KB_COMMANDS.map((command) => [command.name, command]),
);

export { DECISION_TYPE };
export type { KbCommand, KbCommandContext } from "./model.js";

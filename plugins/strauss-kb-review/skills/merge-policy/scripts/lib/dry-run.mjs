// @ts-check
/**
 * The dry run: what the check *would* have done, whether a reader may see it
 * yet, and whether a human disagreed with it.
 *
 * Only a person's act counts on either side: a bot's review never lifts the
 * blind, and a bot's reaction is never a disagreement.
 */
import { asArray, asString } from "../../../../hooks/scripts/lib/util.mjs";

/** The label a maintainer puts on a PR to say the route was wrong. */
export const DISAGREE_LABEL = "policy:would-not-auto";

/** 👎, as the reactions API names it and as a person types it. */
export const DISAGREE_REACTIONS = ["-1", "👎"];

/** A review nobody has posted yet, which is not a review. */
const DRAFT = "PENDING";

/** How GitHub spells an app: the login suffix, and the account type beside it. */
const BOT_LOGIN = /\[bot\]$/;
const BOT_TYPE = "Bot";

/**
 * `dry-run` when the policy says so, or when `--dry-run` asked for one.
 * @param {string} enabled @param {boolean} forced
 * @returns {"dry-run" | "enforce"}
 */
export function modeOf(enabled, forced) {
  return enabled === "dry-run" || forced ? "dry-run" : "enforce";
}

/** Blind is the dry run's default; `--visible` turns it off and `--blind` asks
 * for it anywhere. The caller refuses both at once.
 * @param {string} mode @param {{ blind: boolean, visible: boolean }} how */
export function blindOf(mode, how) {
  if (how.blind) return true;
  if (how.visible) return false;
  return mode === "dry-run";
}

/** The login and account type behind a review or a reaction, from the API's
 * own shape or the gathered one. @param {any} row */
function who(row) {
  const user = /** @type {any} */ (row)?.user;
  return {
    login: asString(user) || asString(user?.login),
    type: asString(user?.type) || asString(/** @type {any} */ (row)?.type),
  };
}

/** The logins whose acts are this step's own machinery, for comparison.
 * @param {string[] | undefined} logins */
function botSet(logins) {
  return new Set(
    asArray(logins)
      .map((login) => asString(login).toLowerCase())
      .filter(Boolean),
  );
}

/** @param {{ login: string, type: string }} actor @param {Set<string>} bots */
function isHuman(actor, bots) {
  return (
    actor.type !== BOT_TYPE &&
    !BOT_LOGIN.test(actor.login) &&
    !bots.has(actor.login.toLowerCase())
  );
}

/**
 * Has a *person* reviewed this exact commit? Any state counts — a comment is a
 * read, and the verdict is only withheld until someone has looked. An app's
 * read is not one, or the reviewer agent would lift its own blind.
 * @param {any[]} approvals @param {string} headSha
 * @param {string[]} [botLogins] a `verifiers` entry of kind `agent:` names no
 *   login, so the caller passes them
 */
export function humanReviewed(approvals, headSha, botLogins = []) {
  const bots = botSet(botLogins);
  return asArray(approvals).some((review) => {
    const state = asString(/** @type {any} */ (review)?.state);
    return (
      /** @type {any} */ (review)?.commit_id === headSha &&
      state !== "" &&
      state !== DRAFT &&
      isHuman(who(review), bots)
    );
  });
}

/**
 * The calibration signal: a label or a 👎 saying a human would not have merged
 * what this route would have. Absence is agreement only in the weak sense that
 * nobody objected, which is what the rate measures.
 * @param {unknown} labels `[{ name }]`, or bare strings
 * @param {unknown} reactions `[{ content, user }]` on the sticky comment
 * @param {string[]} [botLogins] the sticky comment's own author among them
 * @returns {{ disagreement: boolean, signals: string[] }}
 */
export function disagreement(labels, reactions, botLogins = []) {
  const bots = botSet(botLogins);
  /** @type {string[]} */
  const signals = [];
  for (const row of asArray(labels)) {
    const name = asString(row) || asString(/** @type {any} */ (row)?.name);
    if (name === DISAGREE_LABEL) signals.push(`label:${DISAGREE_LABEL}`);
  }
  for (const row of asArray(reactions)) {
    const content = asString(/** @type {any} */ (row)?.content);
    if (!DISAGREE_REACTIONS.includes(content)) continue;
    const actor = who(row);
    if (!isHuman(actor, bots)) continue;
    signals.push(`reaction:${content} by ${actor.login || "someone"}`);
  }
  return { disagreement: signals.length > 0, signals };
}

/**
 * Everything the dry run adds to the model, for either mode. An enforced run
 * is never withheld: its verdict is the exit code, which nothing hides.
 * @param {{ mode: string, blind: boolean, headSha: string, approvals: any[],
 *   labels: unknown, reactions: unknown, botLogins?: string[] }} how
 */
export function signals(how) {
  const bots = how.botLogins ?? [];
  const reviewed = humanReviewed(how.approvals, how.headSha, bots);
  return {
    blind: how.blind,
    humanReviewed: reviewed,
    withheld: how.blind && !reviewed,
    ...disagreement(how.labels, how.reactions, bots),
  };
}

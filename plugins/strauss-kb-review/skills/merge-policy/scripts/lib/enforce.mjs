// @ts-check
/**
 * `--enforce` turns the route into the exit code. Human approval is read from
 * the reviews API dump alone: `kb verify` under a `human:` actor is an audit
 * event any process can append, so it never clears a gate here.
 */

/** @typedef {import("./inputs.mjs").Input} Input */

/**
 * @param {{ route: string }} decision @param {Input} input
 * @returns {{ exit: 0 | 1, why: string, approvedBy: string[] }}
 */
export function enforce(decision, input) {
  const owners = input.policy.data.owners;
  // GitHub logins are case-insensitive, so the policy's spelling of one is not
  // the reviews dump's.
  const logins = new Set(owners.map((login) => login.toLowerCase()));
  const approvedBy = input.approvals
    .filter(
      (review) =>
        review.state === "APPROVED" &&
        review.commit_id === input.headSha &&
        logins.has(review.user.toLowerCase()),
    )
    .map((review) => review.user);

  if (input.policy.data.enabled === "dry-run") {
    return {
      exit: 0,
      why: "policy is dry-run: the route is advice",
      approvedBy,
    };
  }
  if (decision.route === "auto") {
    return { exit: 0, why: "auto", approvedBy };
  }
  if (decision.route === "agent-review-then-auto") {
    if (!input.reviewer.present) {
      return { exit: 1, why: "no --reviewer output was supplied", approvedBy };
    }
    return input.reviewer.sha === input.headSha
      ? { exit: 0, why: "the reviewer ran on the head commit", approvedBy }
      : {
          exit: 1,
          why: `the reviewer ran on ${input.reviewer.sha ?? "an unnamed commit"}, not ${input.headSha}`,
          approvedBy,
        };
  }
  if (approvedBy.length > 0) {
    return {
      exit: 0,
      why: `approved on the head commit by ${approvedBy.join(", ")}`,
      approvedBy,
    };
  }
  return {
    exit: 1,
    why:
      owners.length === 0
        ? "route is human and the policy names no owners"
        : "route is human and no owner has APPROVED the head commit",
    approvedBy,
  };
}

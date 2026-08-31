import type { ModelAnswer, Rubric, ScoredAnswer } from "./model.js";

/**
 * Scores one answer against one rubric. No judge model, by design.
 *
 * An LLM judge would be a fifth condition in a four-condition experiment: its
 * own bias about staleness would sit between the arms and the number. Every
 * check here is a set operation or a case-insensitive regex over a field the
 * prompt asked the model to keep short.
 */
export function scoreAnswer(
  answer: ModelAnswer | null,
  rubric: Rubric,
): ScoredAnswer {
  if (answer === null) {
    return { correct: false, checks: { answered: false } };
  }

  const checks: Record<string, boolean> = {
    actionable: answer.actionable === rubric.expectActionable,
  };

  // A refusal is judged on the refusal and the citation, never on a value it
  // was right not to produce.
  if (rubric.expectActionable) {
    for (const [index, pattern] of (rubric.valueIncludes ?? []).entries()) {
      checks[`valueIncludes[${index}]`] = new RegExp(pattern, "i").test(
        answer.value,
      );
    }
    for (const [index, pattern] of (rubric.valueExcludes ?? []).entries()) {
      checks[`valueExcludes[${index}]`] = !new RegExp(pattern, "i").test(
        answer.value,
      );
    }
    if (rubric.numericValue !== undefined) {
      checks.numericValue = parseCount(answer.value) === rubric.numericValue;
    }
  }

  const cited = new Set(answer.conceptIds);
  if (rubric.citeAll) {
    checks.citeAll = rubric.citeAll.every((id) => cited.has(id));
  }
  if (rubric.citeNone) {
    checks.citeNone = rubric.citeNone.every((id) => !cited.has(id));
  }
  if (rubric.conceptIdsEqual) {
    const expected = new Set(rubric.conceptIdsEqual);
    checks.conceptIdsEqual =
      cited.size === expected.size &&
      [...expected].every((id) => cited.has(id));
  }

  return {
    correct: Object.values(checks).every(Boolean),
    checks,
  };
}

/**
 * Pulls a count out of a short answer.
 *
 * `value` is asked to be a bare number, but models write "5 open questions"
 * and "five". The first integer wins; the small number words are spelled out
 * because a benchmark that marks "five" wrong is measuring formatting.
 */
export function parseCount(value: string): number | null {
  const digits = value.match(/-?\d+/);
  if (digits) return Number.parseInt(digits[0], 10);

  const words: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  const word = value.toLowerCase().match(/[a-z]+/);
  if (word && word[0] in words) return words[word[0]] ?? null;
  return null;
}

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
 * Number words the rubric will accept in place of digits.
 *
 * The prompt and the tool schema both ask for digits, so a spelled-out count
 * is off-spec -- but a benchmark that marks "sixteen" wrong is measuring
 * formatting compliance, not whether the model can count records. The range
 * covers every ground-truth count in the task set (4, 6, 9, 16, 24) with room
 * either side; anything past twenty falls through to the digit path, which is
 * where a model writing "twenty-four" lands anyway via the hyphenated form.
 */
const NUMBER_WORDS: Readonly<Record<string, number>> = {
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
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

const TENS_WORDS: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/**
 * Pulls a count out of a short answer.
 *
 * `value` is asked to be a bare number, but models write "5 open questions",
 * "five", and "twenty-four". Digits win when present; otherwise the leading
 * word, including the hyphenated compound forms.
 */
export function parseCount(value: string): number | null {
  const digits = value.match(/-?\d+/);
  if (digits) return Number.parseInt(digits[0], 10);

  const lowered = value.toLowerCase();
  const compound = lowered.match(/\b([a-z]+)[- ]([a-z]+)\b/);
  if (compound) {
    const tens = TENS_WORDS[compound[1] ?? ""];
    const units = NUMBER_WORDS[compound[2] ?? ""];
    if (tens !== undefined && units !== undefined && units < 10)
      return tens + units;
  }

  const word = lowered.match(/[a-z]+/);
  return word ? (NUMBER_WORDS[word[0]] ?? null) : null;
}

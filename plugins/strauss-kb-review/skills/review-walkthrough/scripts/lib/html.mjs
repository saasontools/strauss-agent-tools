// @ts-check
/**
 * The step model as one self-contained page. Every string that came out of a
 * record is agent-written, so it is escaped before it reaches the document.
 */

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ESCAPES[/** @type {keyof typeof ESCAPES} */ (char)],
  );
}

/**
 * `{{key}}` substitution, one pass, no expressions. Values are inserted
 * verbatim, so callers escape before they get here.
 *
 * @param {string} template
 * @param {Record<string, string>} values
 * @returns {string}
 */
export function fill(template, values) {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (whole, key) => values[key] ?? whole,
  );
}

/**
 * Only http(s) links reach the document; anything else becomes plain text.
 *
 * @param {{ href: string|null, precise?: boolean, note?: string }} link
 * @param {string} label
 * @returns {string}
 */
function linkHtml(link, label) {
  const href = link?.href ?? "";
  if (!/^https?:\/\//i.test(href)) {
    return link?.note
      ? `<span class="nolink">${escapeHtml(link.note)}</span>`
      : "";
  }
  const suffix = link.precise ? "" : " (file only)";
  return `<a class="open" href="${escapeHtml(href)}" rel="noreferrer noopener" target="_blank">${escapeHtml(label)}${suffix}</a>`;
}

/**
 * @param {string} label
 * @param {unknown} value
 * @returns {string}
 */
function row(label, value) {
  if (value === null || value === undefined || value === "") return "";
  return `<div class="row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

/**
 * @param {string|null} command
 * @param {number} id
 * @returns {string}
 */
function verifyHtml(command, id) {
  if (!command) {
    return `<p class="muted">The record names no verify command.</p>`;
  }
  return (
    `<div class="verify"><code id="v${id}">${escapeHtml(command)}</code>` +
    `<button type="button" class="copy" data-copy="v${id}">Copy</button></div>`
  );
}

/**
 * @param {any} step
 * @returns {string}
 */
function detailHtml(step) {
  const d = step.detail ?? {};
  if (step.kind === "stamp") {
    return [
      row("Range", d.range),
      row("Head", d.headSha),
      row("Base digest", d.digest),
      row("Records", d.recordCount),
      row("Anchors checked", d.driftChecked),
      d.drift?.length ? row("Drifted", d.drift.join(", ")) : "",
      d.unchecked?.length ? row("Unchecked", d.unchecked.join(", ")) : "",
    ].join("");
  }
  if (step.kind === "risk") {
    return [
      row("Record", d.conceptId),
      row("Materiality", d.materiality),
      row("Confidence", d.confidence),
      row(
        "Anchor",
        d.anchor
          ? `${d.anchor.file}${d.anchor.symbol ? ` · ${d.anchor.symbol}` : ""}`
          : null,
      ),
      row("Mitigation", d.mitigation),
      row("Verification", d.verification),
      d.verify
        ? `<div class="row"><dt>Run this</dt><dd>${verifyHtml(d.verify, step.n ?? 0)}</dd></div>`
        : "",
      row(
        "Verified by",
        d.verifiedBy?.length
          ? `${d.verifiedBy
              .map((/** @type {any} */ e) => `${e.conceptId} (${e.standing})`)
              .join(", ")} — ${d.verifiedByState}`
          : "nothing — this risk has no test behind it",
      ),
      verdictHtml(d.verdict),
    ].join("");
  }
  if (step.kind === "acceptance") {
    const flows = (d.satisfiedBy ?? [])
      .map(
        (/** @type {any} */ entry) =>
          `<li>${escapeHtml(entry.title)} <span class="muted">${escapeHtml(entry.conceptId)}</span>` +
          `<ul>${entry.anchors
            .map(
              (/** @type {any} */ a) =>
                `<li><code>${escapeHtml(a.file)}${a.symbol ? ` · ${escapeHtml(a.symbol)}` : ""}</code></li>`,
            )
            .join("")}</ul>${linkHtml(entry.link, "open in PR")}</li>`,
      )
      .join("");
    return [
      row("Record", d.conceptId),
      row("Claim", d.claim),
      flows
        ? `<div class="row"><dt>Satisfied by</dt><dd><ul class="flows">${flows}</ul></dd></div>`
        : row("Satisfied by", "nothing claims to satisfy this"),
      verdictHtml(d.verdict),
    ].join("");
  }
  if (step.kind === "skip") {
    const files = (d.files ?? [])
      .map(
        (/** @type {any} */ f) =>
          `<li><code>${escapeHtml(f.filePath)}</code> <span class="badge">${escapeHtml(f.class)}</span> ${escapeHtml(f.reason ?? "")} ${linkHtml(f.link, "open")}</li>`,
      )
      .join("");
    const records = (d.records ?? [])
      .map(
        (/** @type {any} */ r, /** @type {number} */ i) =>
          `<li>${escapeHtml(r.title)} <span class="badge">${escapeHtml(r.tag)}</span>` +
          `<div class="muted">${escapeHtml(r.conceptId)}</div>` +
          verifyHtml(r.verify, (step.n ?? 0) * 100 + i) +
          linkHtml(r.link, "open in PR") +
          `</li>`,
      )
      .join("");
    return [
      files
        ? `<div class="row"><dt>Files</dt><dd><ul>${files}</ul></dd></div>`
        : "",
      records
        ? `<div class="row"><dt>Records</dt><dd><ul class="records">${records}</ul></dd></div>`
        : "",
    ].join("");
  }
  if (step.kind === "question") {
    return [
      row("Record", d.conceptId),
      row("Question", d.question),
      row("Default assumption", d.assumption),
      verdictHtml(d.verdict),
    ].join("");
  }
  return [
    row("File", d.filePath),
    row("Class", d.class),
    row(
      "Records here",
      d.records?.length ? d.records.join(", ") : "none anchored",
    ),
  ].join("");
}

/**
 * @param {any} verdict
 * @returns {string}
 */
function verdictHtml(verdict) {
  if (!verdict) return "";
  const findings = (verdict.findings ?? [])
    .map((/** @type {any} */ f) => `<li>${escapeHtml(JSON.stringify(f))}</li>`)
    .join("");
  return (
    row("Reviewer", verdict.verdict) +
    row("Reviewer note", verdict.note) +
    (findings
      ? `<div class="row"><dt>Findings</dt><dd><ul>${findings}</ul></dd></div>`
      : "")
  );
}

/**
 * @param {any} step
 * @param {any|undefined} next
 * @returns {string}
 */
function stepHtml(step, next) {
  const heading = `<span class="n">${step.n}</span> ${escapeHtml(step.title)}`;
  const body =
    `<p class="why">${escapeHtml(step.why)}</p>` +
    linkHtml(step.link, "open in PR") +
    `<dl class="detail">${detailHtml(step)}</dl>` +
    (next
      ? `<p class="next">Read this next → <a href="#step-${next.n}">${next.n}. ${escapeHtml(next.title)}</a></p>`
      : `<p class="next">That is the whole deck.</p>`);
  const inner = step.collapsed
    ? `<details><summary><h2>${heading}</h2></summary>${body}</details>`
    : `<h2>${heading}</h2>${body}`;
  return `<section class="step ${escapeHtml(step.kind)}" id="step-${step.n}" tabindex="-1">${inner}</section>`;
}

/**
 * @param {any} model
 * @param {string} template
 * @returns {string}
 */
export function renderHtml(model, template) {
  const steps = model.primary
    .map((/** @type {any} */ step, /** @type {number} */ index) =>
      stepHtml(step, model.primary[index + 1]),
    )
    .join("\n");
  const rail = model.primary
    .map(
      (/** @type {any} */ step) =>
        `<li><a href="#step-${step.n}" data-step="${step.n}"><span class="dot ${escapeHtml(step.kind)}"></span>${step.n}. ${escapeHtml(step.title)}</a></li>`,
    )
    .join("");
  const also = model.also.length
    ? `<section class="also"><h2>Also on this diff</h2><ul>${model.also
        .map(
          (/** @type {any} */ entry) =>
            `<li>${escapeHtml(entry.title)} ${linkHtml(entry.link, "open")}</li>`,
        )
        .join("")}</ul></section>`
    : "";
  return fill(template, {
    title: escapeHtml(`Review walkthrough — ${model.range}`),
    summary: escapeHtml(
      `${model.steps} steps · head ${model.headSha.slice(0, 12)} · base ${String(
        model.digest ?? "",
      ).slice(0, 12)} · classifier ${model.classifier}`,
    ),
    rail,
    steps,
    also,
  });
}

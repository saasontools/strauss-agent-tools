---
name: gemini-infographics
description: >
  Generate infographic images with Gemini's image models ("nano banana") from a JSON
  spec — flat-vector diagrams, before/after contrasts, journey strips, annotated
  simulated screenshots — and verify every one before shipping it. Use when the user
  asks to "generate an infographic", "make a diagram image", "nano banana image",
  "visual for this slide/deck/README", or wants generated imagery in a document,
  presentation, or PR review deck.
---

# Gemini Infographics

Turn a described visual into a PNG via the Gemini image API. The plugin ships one
Node script (standard library only); there is no MCP server and nothing to install.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/gemini-infographics/scripts/generate-infographics.mjs" \
  spec.json --out ./viz
```

If `${CLAUDE_PLUGIN_ROOT}` is not set in your client, use the path to this skill's
`scripts/` directory.

**Images cost real money** (roughly 2–13¢ each, table below). Never fan out more
images than the user asked for, and never regenerate a whole set to fix one.

## Step 1 — Decide the image earns its cost

Default to markup. An image is the right medium only when composition carries
meaning that text cannot:

| Content                                                                                                                   | Medium                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Tables, checklists, chips, key/value strips                                                                               | HTML/markdown — always                           |
| Straight flows, sequences, state machines, plain flowcharts                                                               | Mermaid — topology needs no image model          |
| Contrast/metaphor compositions: before-vs-after panels, a gauntlet of gates, a funnel rejecting garbage, a race collision | **Generated infographic**                        |
| A journey/timeline: what landed before, what this adds, what remains                                                      | **Generated infographic** (journey strip)        |
| UI that does not exist yet, or UI states annotated in place                                                               | **Generated infographic** (simulated screenshot) |
| UI that does exist and was already screenshotted                                                                          | the real screenshot — never generate it          |

The question to answer out loud: _does the visual build the mental model faster
than prose would?_ Spatial metaphor and visual contrast qualify. A table of data
does not.

## Step 2 — Write the spec

One JSON list, one entry per image. `name` and `prompt` are required; everything
else has a default.

```json
[
  {
    "name": "viz-four-gates",
    "prompt": "…full standalone prompt with exact quoted strings…",
    "aspectRatio": "16:9",
    "imageSize": "1K",
    "model": "flash"
  }
]
```

- `name` — output filename (`<out>/<name>.png`); must be unique in the spec.
- `aspectRatio` — `16:9`, `4:3`, `3:2`, `1:1`, `9:16`, … **Size to the slot, not
  the page.** Decide the layout first, then ask for the ratio the slot needs;
  full-bleed `16:9` is the exception, not the default.
- `imageSize` — `1K`, `2K`, `4K` (model-dependent; the lite model is 1K-max).
- `model` — alias or concrete id; see Step 4.

### Prompt rules (each prompt is standalone — the model sees nothing else)

- **Open with a shared style block** (flat vector, palette, background) repeated
  verbatim across the set, so the images read as one family.
- **Go rich — text inside the image is allowed and encouraged.** Short labels,
  identifiers, one-line captions render reliably (≈1 typo per ~10 images; Step 5
  catches it). Do not strip a visual to wordless icons out of typo fear.
- **Quote every string that must render**, then say: _"Render every quoted string
  exactly as written, correctly spelled."_
- **State exact element counts**: _"EXACTLY FIVE boxes — count them: 1, 2, 3, 4,
  5 — and no sixth."_ Count drift is the top failure mode.
- **Spell out punctuation the model substitutes**: render `--flag` as _"two ASCII
  hyphens"_ — image models default to an en-dash.
- **Forbid chrome you did not ask for**: _"NO TITLE and NO HEADING of any kind —
  the only text is the quoted labels."_
- **Never describe the composition in words the model could transcribe.** "A
  single horizontal pipeline…" has been rendered verbatim as a slide title.
- **Numbered anchors** keyed to a caption list beside the image work up to ~5
  elements on linear layouts. On circular layouts or >5 elements, use icon-keyed
  legends — numeral badges drift there.

## Step 3 — Generate

```bash
node .../generate-infographics.mjs spec.json --out ./viz [--mode auto|sync|batch]
```

The script batches automatically when ≥3 images share a resolved model (half
price, one queue wait), runs sync otherwise, retries empty responses, and retries
per-request batch failures individually. Useful flags:

- `--dry-run` — validate the spec and print the per-entry model plan. No network,
  no cost. Run this first on any spec you just wrote.
- `--model MODEL` — default model for entries that don't name one.
- `--list-models` — image models this API key can actually reach, newest first.
- `--no-fallback` — fail instead of silently moving to another model.

### The API key

Settings resolve **flag > environment > config file > default**. The key comes
from the first of these that is set:

| Source                                                       | Meaning                                               |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY`                          | the key itself                                        |
| `GEMINI_API_KEY_COMMAND`                                     | a command whose stdout is the key — the OS-vault path |
| `GEMINI_API_KEY_FILE`                                        | a file containing the key                             |
| `apiKeyCommand` / `apiKeyFile` / `apiKey` in the config file | the same three, configured once                       |

`GEMINI_API_KEY_COMMAND` (or `apiKeyCommand`) is how a user keeps the key in
their OS vault instead of their shell profile — `op read
'op://Private/Gemini/credential'`, `security find-generic-password -s
gemini-api-key -w`, `secret-tool lookup service gemini`, `pass show
gemini/api-key`. It runs once per script run, so a Touch ID prompt happens at
most once.

**When the user has to re-export the key in every session**, that is what the
config file is for — an exported variable does not reach a background session,
a scheduled run, or a fresh terminal:

`~/.config/gemini-infographics.json` — `chmod 600` it if it holds a literal
key:

```json
{
  "apiKeyCommand": "op read 'op://Private/Gemini/credential'",
  "model": "flash",
  "mode": "auto"
}
```

`$XDG_CONFIG_HOME` moves it; `$GEMINI_INFOGRAPHICS_CONFIG` points at an exact
file. It is deliberately **per-user, never per-project** — `apiKeyCommand` runs
a command, so honouring a checked-in config would make cloning a repo enough to
run its author's shell. `--dry-run` prints which config file was read.

A Claude Code user can also set the variable for every session at once with an
`env` block in `~/.claude/settings.json`; the config file is the client-agnostic
version of the same idea and is what to reach for first.

If nothing is set the script exits with those instructions — relay them.
**Never ask the user to paste the key into the chat, and never put it in the
spec file or a command line**; a key on the command line lands in their shell
history.
Every diagnostic the script prints is redacted, but a key you typed into the
conversation is already out.

## Step 4 — Model choice and configuration

| Alias        | Pinned id                     | Use for                           | 1K image                | Notes                                                   |
| ------------ | ----------------------------- | --------------------------------- | ----------------------- | ------------------------------------------------------- |
| `flash`      | `gemini-3.1-flash-image`      | default — rich text + composition | 6.7¢ sync / 3.35¢ batch | ~12 s sync                                              |
| `flash-lite` | `gemini-3.1-flash-lite-image` | simple compositions, minimal text | 3.36¢ / 1.68¢ batch     | 1K max; breaks arrow topology — never for flow diagrams |
| `pro`        | `gemini-3-pro-image`          | dense many-element compositions   | 13.4¢                   | rarely needed; ~50 s                                    |

(Prices in ¢, not `$0.xx` — some skill loaders substitute `$0` with an argument.)

A typical set of 4–6 flash images in batch costs **15–25¢** and lands in ~2
minutes.

Resolution order for each entry, highest precedence first:

1. the entry's `"model"`
2. `--model`
3. `$GEMINI_IMAGE_MODEL`
4. `flash`

Any of those may be a concrete id (`gemini-3.1-flash-image`) or an alias:
`flash`, `flash-lite`, `pro` for the pinned defaults, or `latest`,
`latest-flash`, `latest-flash-lite`, `latest-pro` to resolve the newest image
model in that family from the live model list at run time.

**Fallback is on by default.** Pinned ids age out; when one returns 404/NOT_FOUND
or the key has no access, the script switches to the newest live model in the
same family, says so on stderr, and continues — one resolution per group, not per
image. Turn it off with `--no-fallback` or `GEMINI_IMAGE_MODEL_FALLBACK=off` when
a run must use exactly the model asked for (reproducing a prior set, pinning a
cost). Prefer a pinned alias over `latest` for anything the user will compare
against earlier output: model changes shift style.

## Step 5 — Verify every image (mandatory)

Read each PNG back and check it against its spec entry:

1. Every quoted string spelled exactly — identifiers especially.
2. Element and anchor counts match: count the boxes, count the numerals, no
   duplicates.
3. Edge semantics: arrows connect what the spec says. Watch for reject-paths that
   quietly rejoin the main flow.

On failure, regenerate **that one entry** with hardened counting/spelling
language. Max 2 retries, then fall back: Mermaid for topology failures, HTML or
markdown for text failures. Never ship an unverified image — a confident wrong
diagram is worse than none.

## Failure modes

- **Missing `GEMINI_API_KEY`** — script exits with setup instructions; relay them.
- **`INVALID_ARGUMENT`** — usually an `imageSize` the model does not support
  (lite is 1K-max). Fix the spec entry and rerun just that entry.
- **404 / NOT_FOUND on the model** — the pinned id is gone. Fallback handles it;
  `--list-models` shows what is reachable if you want to pin a new default.
- **Empty response (no image part)** — transient; the script retries. If it
  persists, the prompt is likely tripping a filter — simplify it.
- **Batch stuck in queue** — batches usually clear in minutes; the script gives
  up at 40 minutes and falls back to sync.

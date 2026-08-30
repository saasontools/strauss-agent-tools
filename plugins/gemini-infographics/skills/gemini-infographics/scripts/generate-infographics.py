#!/usr/bin/env python3
"""Generate infographics with the Gemini image API ("nano banana").

Usage:
  generate-infographics.py SPEC.json --out DIR [--mode auto|sync|batch]
                           [--model MODEL] [--no-fallback] [--dry-run]
  generate-infographics.py --list-models

SPEC.json is a list of entries:
  [{"name": "viz-x", "prompt": "...", "aspectRatio": "16:9",
    "imageSize": "1K", "model": "flash"}]

Only `name` and `prompt` are required. Results are written to DIR/<name>.png.
Entries sharing a resolved model are batched (half price) when there are >= 3
of them and mode is auto; otherwise they run sync. Exit code is non-zero if
any image failed after retries.

Model selection, highest precedence first:
  1. the entry's "model"
  2. --model
  3. $GEMINI_IMAGE_MODEL
  4. DEFAULT_ALIAS below

A model may be a concrete id ("gemini-3.1-flash-image") or an alias:
  flash | flash-lite | pro    pinned ids, the known-good defaults
  latest                      newest image model the key can see
  latest-flash | latest-flash-lite | latest-pro
                              newest model in that family

Pinned ids are resolved live too: if one is gone (404/NOT_FOUND) or the key
has no access to it, the script falls back to the newest model in the same
family and keeps going. `--no-fallback` (or GEMINI_IMAGE_MODEL_FALLBACK=off)
turns that off and lets the failure stand.
"""

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API_BASE = os.environ.get(
    "GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1beta"
)
BATCH_THRESHOLD = 3
BATCH_TIMEOUT_S = 2400
SYNC_RETRIES = 3

DEFAULT_ALIAS = "flash"

# Pinned ids are what these aliases mean *today*; the resolver below repairs
# them against the live model list when an id stops existing.
ALIASES = {
    "flash": ("gemini-3.1-flash-image", "flash"),
    "flash-lite": ("gemini-3.1-flash-lite-image", "flash-lite"),
    "pro": ("gemini-3-pro-image", "pro"),
}
LATEST_ALIASES = {
    "latest": "any",
    "latest-flash": "flash",
    "latest-flash-lite": "flash-lite",
    "latest-pro": "pro",
}

_models_cache: list = []
_latest_cache: dict = {}
# Concrete id -> replacement, once a fallback has been resolved for it. Keeps
# a dead pin from costing one ListModels round trip per entry.
_remapped: dict = {}


def die(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
    if not key:
        die(
            "GEMINI_API_KEY is not set.\n"
            "Set it with:  export GEMINI_API_KEY='your-key-here'\n"
            "Get a key at: https://aistudio.google.com/apikey"
        )
    return key


def post(url: str, body: dict, timeout: int = 300) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key()},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def get(url: str, timeout: int = 120) -> dict:
    req = urllib.request.Request(url, headers={"x-goog-api-key": api_key()})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


# --------------------------------------------------------------------------
# model resolution


def family_of(model: str) -> str:
    if "flash-lite" in model:
        return "flash-lite"
    if "flash" in model:
        return "flash"
    if "pro" in model:
        return "pro"
    return "any"


def image_models() -> list:
    """Every image-generating model the key can see, newest first."""
    if _models_cache:
        return _models_cache
    page, token = [], None
    while True:
        url = f"{API_BASE}/models?pageSize=200" + (f"&pageToken={token}" if token else "")
        data = get(url)
        page += data.get("models", [])
        token = data.get("nextPageToken")
        if not token:
            break
    for m in page:
        name = m.get("name", "").split("/")[-1]
        methods = m.get("supportedGenerationMethods", [])
        # An image model is one whose name says so; the generation-method list
        # is "generateContent" for image and text models alike.
        if "generateContent" in methods and re.search(r"-image(-|$)", name):
            _models_cache.append(name)
    _models_cache.sort(key=version_key, reverse=True)
    return _models_cache


def version_key(name: str) -> tuple:
    """Sort key: version number first, stable before preview/exp."""
    m = re.search(r"gemini-(\d+)(?:\.(\d+))?", name)
    major, minor = (int(m.group(1)), int(m.group(2) or 0)) if m else (0, 0)
    stable = 0 if re.search(r"preview|exp|-\d{2}-\d{4}$", name) else 1
    return (major, minor, stable, -len(name))


def latest_model(family: str) -> str:
    if family in _latest_cache:
        return _latest_cache[family]
    candidates = [m for m in image_models() if family == "any" or family_of(m) == family]
    if not candidates:
        die(
            f"no image model available for family '{family}'.\n"
            "Run with --list-models to see what this API key can reach, then "
            "pin one explicitly with --model."
        )
    _latest_cache[family] = candidates[0]
    return candidates[0]


def resolve_model(raw: str) -> str:
    """Alias or concrete id -> concrete id. Only 'latest*' hits the network."""
    if raw in ALIASES:
        return ALIASES[raw][0]
    if raw in LATEST_ALIASES:
        return latest_model(LATEST_ALIASES[raw])
    return raw


def is_missing_model(err: urllib.error.HTTPError, detail: str) -> bool:
    return err.code in (403, 404) and (
        "NOT_FOUND" in detail
        or "not found" in detail
        or "PERMISSION_DENIED" in detail
        or "does not exist" in detail
    )


def fallback_model(model: str, fallback: bool) -> str:
    """Newest live model in `model`'s family, or `model` itself if none/off."""
    if not fallback:
        return model
    if model in _remapped:
        return _remapped[model]
    try:
        replacement = latest_model(family_of(model))
    except SystemExit:
        return model
    if replacement != model:
        print(
            f"  {model} unavailable — falling back to {replacement}", file=sys.stderr
        )
    _remapped[model] = replacement
    return replacement


# --------------------------------------------------------------------------
# generation


def gen_request(entry: dict) -> dict:
    cfg = {
        "responseModalities": ["TEXT", "IMAGE"],
        "imageConfig": {
            "aspectRatio": entry.get("aspectRatio", "16:9"),
            "imageSize": entry.get("imageSize", "1K"),
        },
    }
    return {
        "contents": [{"parts": [{"text": entry["prompt"]}]}],
        "generationConfig": cfg,
    }


def save_image(response: dict, path: str) -> bool:
    for cand in response.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            if "inlineData" in part:
                with open(path, "wb") as f:
                    f.write(base64.b64decode(part["inlineData"]["data"]))
                return True
    return False


def run_sync(model: str, entries: list, outdir: str, fallback: bool) -> list:
    failed = []
    for e in entries:
        # a fallback resolved for an earlier entry applies to the rest of the
        # group — never re-discover a dead pin per image
        model = _remapped.get(model, model)
        path = os.path.join(outdir, f"{e['name']}.png")
        ok = False
        for attempt in range(1, SYNC_RETRIES + 1):
            try:
                resp = post(f"{API_BASE}/models/{model}:generateContent", gen_request(e))
            except urllib.error.HTTPError as err:
                detail = err.read().decode()[:200]
                print(f"  {e['name']}: HTTP {err.code} {detail}", file=sys.stderr)
                if is_missing_model(err, detail):
                    replacement = fallback_model(model, fallback)
                    if replacement != model:
                        model = replacement
                        continue
                    break
                if err.code in (429, 500, 503) and attempt < SYNC_RETRIES:
                    time.sleep(15 * attempt)
                    continue
                break
            if save_image(resp, path):
                print(f"  ok {e['name']}")
                ok = True
                break
            print(f"  {e['name']}: empty response, attempt {attempt}", file=sys.stderr)
            time.sleep(5)
        if not ok:
            failed.append(e["name"])
    return failed


def run_batch(model: str, entries: list, outdir: str, fallback: bool) -> list:
    reqs = [
        {"request": gen_request(e), "metadata": {"key": e["name"]}} for e in entries
    ]
    body = {
        "batch": {
            "display_name": f"infographics-{int(time.time())}",
            "input_config": {"requests": {"requests": reqs}},
        }
    }
    try:
        op = post(f"{API_BASE}/models/{model}:batchGenerateContent", body, timeout=120)
    except urllib.error.HTTPError as err:
        detail = err.read().decode()[:200]
        print(f"  batch submit: HTTP {err.code} {detail}", file=sys.stderr)
        if is_missing_model(err, detail):
            replacement = fallback_model(model, fallback)
            if replacement != model:
                return run_batch(replacement, entries, outdir, fallback)
        print("  batch submit failed — falling back to sync", file=sys.stderr)
        return run_sync(model, entries, outdir, fallback)
    opname = op["name"]
    print(f"  batch {opname} ({len(entries)} images)")

    t0 = time.time()
    while True:
        time.sleep(15)
        # transient network errors must not abandon a paid batch — keep polling
        try:
            st = get(f"{API_BASE}/{opname}")
        except (urllib.error.URLError, OSError) as err:
            print(
                f"  {time.time() - t0:5.0f}s poll error ({err}); retrying",
                file=sys.stderr,
            )
            continue
        state = st.get("metadata", {}).get("state", "?")
        print(f"  {time.time() - t0:5.0f}s {state}")
        if st.get("done"):
            break
        if time.time() - t0 > BATCH_TIMEOUT_S:
            print("  batch timeout — falling back to sync", file=sys.stderr)
            return run_sync(model, entries, outdir, fallback)

    by_name = {e["name"]: e for e in entries}
    failed = []
    inlined = (
        st.get("response", {}).get("inlinedResponses", {}).get("inlinedResponses", [])
    )
    for item in inlined:
        key = item.get("metadata", {}).get("key", "?")
        if "error" in item:
            print(f"  ERR {key}: {json.dumps(item['error'])[:150]}", file=sys.stderr)
            failed.append(key)
            continue
        path = os.path.join(outdir, f"{key}.png")
        if save_image(item.get("response", {}), path):
            print(f"  ok {key}")
        else:
            print(f"  {key}: no image in batch response", file=sys.stderr)
            failed.append(key)

    # per-request failures inside a successful batch retry individually
    retry = [by_name[n] for n in failed if n in by_name]
    if retry:
        print(f"  retrying {len(retry)} failed entries sync")
        return run_sync(model, retry, outdir, fallback)
    return []


# --------------------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("spec", nargs="?", help="path to spec JSON")
    ap.add_argument("--out", help="output directory for PNGs")
    ap.add_argument("--mode", choices=["auto", "sync", "batch"], default="auto")
    ap.add_argument(
        "--model",
        help="default model for entries with no 'model' (alias or id); "
        "overrides $GEMINI_IMAGE_MODEL",
    )
    ap.add_argument(
        "--no-fallback",
        action="store_true",
        help="fail instead of falling back to the latest model in the family",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="validate the spec and print the model plan; generate nothing",
    )
    ap.add_argument(
        "--list-models",
        action="store_true",
        help="list the image models this API key can reach, newest first",
    )
    args = ap.parse_args()

    if args.list_models:
        for m in image_models():
            print(m)
        return

    if not args.spec or not args.out:
        ap.error("spec and --out are required (unless --list-models)")

    fallback = not (
        args.no_fallback or os.environ.get("GEMINI_IMAGE_MODEL_FALLBACK") == "off"
    )
    default_model = args.model or os.environ.get("GEMINI_IMAGE_MODEL") or DEFAULT_ALIAS

    with open(args.spec) as f:
        entries = json.load(f)
    if not isinstance(entries, list) or not entries:
        die("spec must be a non-empty JSON list")
    seen = set()
    for e in entries:
        if "name" not in e or "prompt" not in e:
            die(f"spec entry missing name/prompt: {json.dumps(e)[:100]}")
        if e["name"] in seen:
            die(f"duplicate entry name '{e['name']}' — outputs would overwrite")
        seen.add(e["name"])

    if args.dry_run:
        print(f"default model: {default_model}   fallback: {'on' if fallback else 'off'}")
        for e in entries:
            raw = e.get("model") or default_model
            shown = raw if raw in LATEST_ALIASES else resolve_model(raw)
            print(
                f"  {e['name']}: {raw} -> {shown}"
                f"  {e.get('aspectRatio', '16:9')} {e.get('imageSize', '1K')}"
            )
        return

    os.makedirs(args.out, exist_ok=True)
    api_key()

    by_model: dict = {}
    for e in entries:
        by_model.setdefault(resolve_model(e.get("model") or default_model), []).append(e)

    failed: list = []
    t0 = time.time()
    for model, group in by_model.items():
        use_batch = args.mode == "batch" or (
            args.mode == "auto" and len(group) >= BATCH_THRESHOLD
        )
        print(f"{model}: {len(group)} images ({'batch' if use_batch else 'sync'})")
        if use_batch:
            failed += run_batch(model, group, args.out, fallback)
        else:
            failed += run_sync(model, group, args.out, fallback)

    print(
        f"done: {len(entries) - len(failed)}/{len(entries)} in {time.time() - t0:.0f}s"
    )
    if failed:
        print(f"FAILED: {', '.join(failed)}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()

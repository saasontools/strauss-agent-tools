#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${CODEX_CLAUDE_AGENT_NESTED:-}" ]]; then
  exit 0
fi

input="$(cat)"
session_id="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{try{const v=JSON.parse(s);process.stdout.write(typeof v.session_id==="string"?v.session_id:"")}catch{}})')"
if [[ -n "$session_id" && -n "${CLAUDE_ENV_FILE:-}" ]]; then
  printf 'export CODEX_CLAUDE_AGENT_SESSION_ID=%q\n' "$session_id" >> "$CLAUDE_ENV_FILE"
fi

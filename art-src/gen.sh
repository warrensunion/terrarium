#!/usr/bin/env bash
# Generates one image through gpt-image-bridge (codex CLI on Warren's ChatGPT Plus),
# with the fixed art-direction preamble on top, and logs the prompt to art-src/PROMPTS.md.
#   bash art-src/gen.sh <name> <WxH|auto> <transparent|opaque> "<subject prompt>"
set -e
cd "$(dirname "$0")/.."
NAME="$1"; SIZE="$2"; MODE="$3"; SUBJECT="$4"
PRE="$(cat art-src/preamble.txt)"
if [ "$MODE" = transparent ]; then
  TAIL="Output: one subject only, centred with generous empty margin on every side, on a fully transparent background (PNG with alpha). If a transparent background is not possible, use a perfectly flat, uniform pure magenta #FF00FF background with no gradient, no shadow on it and no magenta anywhere in the subject. Largest size available."
else
  TAIL="Output: a full-bleed opaque painting that fills the whole canvas edge to edge. Largest size available."
fi
PROMPT="$PRE

Subject: $SUBJECT

$TAIL"
{ echo; echo "## $NAME  ($SIZE, $MODE) — $(date '+%Y-%m-%d %H:%M')"; echo; echo '```'; echo "$PROMPT"; echo '```'; } >> art-src/PROMPTS.md
ARGS=()
[ "$SIZE" != auto ] && ARGS=(--size "$SIZE")
~/.claude/skills/gpt-image-bridge/bin/gpt-image-2 "$PROMPT" "$(pwd -W 2>/dev/null || pwd)/art-src/gen/$NAME.png" "${ARGS[@]}"

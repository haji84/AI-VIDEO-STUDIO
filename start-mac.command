#!/bin/sh
set -eu

cd "$(/usr/bin/dirname -- "$0")"
umask 077

# Finder may launch Terminal without the Homebrew paths from an interactive shell.
export PATH="${PATH:-/usr/bin:/bin}:/opt/homebrew/bin:/usr/local/bin"
if ! command -v node >/dev/null 2>&1; then
    printf '%s\n' 'Node.js が見つかりません。apps/local-editor/README.md の起動手順を確認してください。' >&2
    exit 1
fi

if [ -z "${AIVS_PYTHON:-}" ] && [ -x "$PWD/.venv/bin/python" ]; then
    export AIVS_PYTHON="$PWD/.venv/bin/python"
fi

local_media_tools="$HOME/Library/Application Support/AI VIDEO STUDIO/ffmpeg/bin"
if [ -z "${AIVS_FFMPEG_DIR:-}" ] && [ -d "$local_media_tools" ]; then
    export AIVS_FFMPEG_DIR="$local_media_tools"
fi

exec node apps/local-editor/server.mjs --workspace "$HOME/AI_VIDEO_STUDIO_DATA" --open-browser "$@"

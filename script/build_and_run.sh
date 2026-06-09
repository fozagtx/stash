#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EXPO_BIN="$ROOT_DIR/node_modules/.bin/expo"
if [ ! -x "$EXPO_BIN" ]; then
  EXPO_BIN="npx expo"
fi

case "${1:-}" in
  --help|-h)
    echo "Usage: ./script/build_and_run.sh [--android|--web|--dev-client|--tunnel|--export-web]"
    ;;
  --android)
    $EXPO_BIN start --dev-client --android
    ;;
  --web)
    $EXPO_BIN start --web
    ;;
  --dev-client|"")
    $EXPO_BIN start --dev-client
    ;;
  --tunnel)
    $EXPO_BIN start --dev-client --tunnel
    ;;
  --export-web)
    $EXPO_BIN export --platform web
    ;;
  *)
    echo "Unknown option: $1" >&2
    exit 64
    ;;
esac

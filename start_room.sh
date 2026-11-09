#!/usr/bin/env bash
# LiveCap room server for macOS / Linux. Same options as start_room.bat:
#   ./start_room.sh            standalone (only this computer can open LiveCap)
#   ./start_room.sh lan        also serve output pages to the room network (needs LIVECAP_PIN)
#   ./start_room.sh rebuild    rebuild after updating the code
#   ./start_room.sh lan 3001   optional port
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-local}"
PORT="${2:-3000}"
if [ "$MODE" = "rebuild" ]; then
  rm -rf .next
  MODE=local
fi

command -v node >/dev/null || { echo "[ERROR] Install Node.js 20 LTS or newer from https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm ci || npm install
[ -f .next/BUILD_ID ] || npm run build

HOST=127.0.0.1
if [ "$MODE" = "lan" ]; then
  if ! grep -Eq '^LIVECAP_PIN=.+' .env.local 2>/dev/null; then
    echo "[ERROR] LAN mode needs a room PIN. Copy .env.example to .env.local and set LIVECAP_PIN."
    exit 1
  fi
  HOST=0.0.0.0
fi

echo "Operator console : http://localhost:$PORT/caption"
echo "LED stage output : http://localhost:$PORT/caption/led"
echo "vMix / OBS input : http://localhost:$PORT/caption/overlay"
exec npx next start -H "$HOST" -p "$PORT"

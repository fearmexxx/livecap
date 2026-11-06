#!/bin/bash
# Double-click to start LiveCap on a Mac. Keep the Terminal window open during the event.
cd "$(dirname "$0")" || exit 1

# Files from a downloaded zip are quarantined by macOS; clear it so the bundled node can run
xattr -dr com.apple.quarantine . 2>/dev/null || true

# Load settings from livecap.env (KEY=VALUE lines, # comments)
if [ -f livecap.env ]; then
  while IFS='=' read -r key value; do
    key="$(echo "$key" | tr -d '[:space:]')"
    value="${value%$'\r'}"
    [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]] && [ -n "$value" ] && export "$key=$value"
  done < livecap.env
fi
PORT="${PORT:-3000}"

echo
echo " ====================================================="
echo "   LIVECAP - Live Vietnamese subtitles"
echo " ====================================================="
echo
HALL="$(cat hall.txt 2>/dev/null | tr -d '[:space:]')"
if [ -z "$HALL" ]; then
  read -r -p "  Which hall is this laptop? Type a number 1-5 and press Enter: " HALL
else
  read -r -p "  This laptop is Hall $HALL. Press Enter to keep, or type another number: " NEWHALL
  [ -n "$NEWHALL" ] && HALL="$NEWHALL"
fi
HALL="${HALL:-1}"
echo "$HALL" > hall.txt

export HOSTNAME=127.0.0.1
if [ "${LIVECAP_LAN:-0}" = "1" ]; then
  if [ -n "${LIVECAP_PIN:-}" ]; then
    export HOSTNAME=0.0.0.0
  else
    echo "  [!] LIVECAP_LAN=1 needs a LIVECAP_PIN in livecap.env. Starting for this laptop only."
  fi
fi
# Is the port already taken? If LiveCap is already running there, just open the console.
# If another program has it, move to the next free port (macOS may otherwise let both start
# and the browser would land on the other program).
if curl -s -m 2 "http://localhost:$PORT/api/caption/translate" 2>/dev/null | grep -q serverKeys; then
  URL="http://localhost:$PORT/caption?session=hall-$HALL"
  echo "  LiveCap is already running. Opening the console for Hall $HALL."
  open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null
  exit 0
fi
WANTED_PORT="$PORT"
while curl -s -m 2 -o /dev/null "http://localhost:$PORT/" 2>/dev/null; do
  PORT=$((PORT + 1))
  [ "$PORT" -gt $((WANTED_PORT + 20)) ] && { echo "  [!] No free port found near $WANTED_PORT."; exit 1; }
done
if [ "$PORT" != "$WANTED_PORT" ]; then
  echo "  [!] Port $WANTED_PORT is used by another program, so LiveCap uses port $PORT."
  echo "      Settings saved under the other port do not carry over: set PORT=$PORT in livecap.env"
  echo "      to keep this port, or close the other program and start again."
fi
export PORT

URL="http://localhost:$PORT/caption?session=hall-$HALL"
echo
echo "  Starting LiveCap for Hall $HALL ..."
echo "    Console : $URL"
echo "    LED     : http://localhost:$PORT/caption/led?session=hall-$HALL"
echo "    vMix/OBS: http://localhost:$PORT/caption/overlay?session=hall-$HALL"
echo
echo "  Keep this window open during the event. Close it to stop LiveCap."
echo

# Open Chrome (Web Speech needs Chrome or Edge) once the server is up
( sleep 3; open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null ) &

exec ./node/bin/node app/server.js

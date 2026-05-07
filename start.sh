#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# © 2026 Harald Weiss
#
# Loganonymizer — startet einen lokalen Webserver via python3 -m http.server.
# Nutzung:   ./start.sh                  # Standard-Port 8765
#            LOGANON_PORT=8000 ./start.sh
#

set -euo pipefail
cd "$(dirname "$0")"

PORT="${LOGANON_PORT:-8765}"
PID_FILE=".server.pid"
LOG_FILE=".server.log"
URL="http://localhost:${PORT}/index.html"

# Bereits gestartet?
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "✓ Loganonymizer läuft bereits (PID $(cat "$PID_FILE")) — $URL"
    exit 0
fi
# stale PID file
[[ -f "$PID_FILE" ]] && rm -f "$PID_FILE"

# Port frei?
if lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "✗ Port $PORT ist belegt." >&2
    echo "  Tipp: anderen Port wählen mit  LOGANON_PORT=8888 ./start.sh" >&2
    exit 1
fi

# Reminder: Port muss in OLLAMA_ORIGINS stehen, sonst blockt Ollama CORS
if [[ -n "${OLLAMA_ORIGINS:-}" ]] && [[ "$OLLAMA_ORIGINS" != *"localhost:${PORT}"* ]] && [[ "$OLLAMA_ORIGINS" != "*" ]]; then
    echo "⚠️  http://localhost:${PORT} ist nicht in OLLAMA_ORIGINS — Ollama-Aufrufe werden vom Browser geblockt."
    echo "    Aktuell: ${OLLAMA_ORIGINS}"
fi

# Im Hintergrund starten
nohup python3 -m http.server "$PORT" > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

# Kurz warten, dann verifizieren
sleep 0.4
if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "✗ Server-Start fehlgeschlagen. Letzte Log-Zeilen:" >&2
    tail -n 10 "$LOG_FILE" >&2 || true
    rm -f "$PID_FILE"
    exit 1
fi

echo "✓ Loganonymizer läuft auf $URL  (PID $(cat "$PID_FILE"))"
echo "  Stoppen mit ./stop.sh"

# Browser öffnen, falls verfügbar (macOS)
if command -v open >/dev/null 2>&1; then
    open "$URL"
fi

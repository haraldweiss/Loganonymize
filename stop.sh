#!/usr/bin/env bash
#
# Loganonymizer — beendet den lokalen Webserver, der mit start.sh
# gestartet wurde. Räumt auch ein veraltetes PID-File auf.
#

set -uo pipefail
cd "$(dirname "$0")"

PID_FILE=".server.pid"

if [[ ! -f "$PID_FILE" ]]; then
    echo "✓ Server läuft nicht (kein PID-File)"
    exit 0
fi

PID=$(cat "$PID_FILE")

if ! kill -0 "$PID" 2>/dev/null; then
    echo "✓ Server-Prozess (PID $PID) existiert nicht mehr — räume PID-File auf"
    rm -f "$PID_FILE"
    exit 0
fi

# Sicherheitsprüfung: nur beenden, wenn es tatsächlich unsere http.server-Instanz ist
CMD=$(ps -p "$PID" -o command= 2>/dev/null || true)
if [[ "$CMD" != *"http.server"* ]]; then
    echo "✗ PID $PID gehört nicht zu python3 -m http.server, sondern: $CMD" >&2
    echo "  PID-File wird nicht angefasst — bitte manuell prüfen." >&2
    exit 1
fi

if kill "$PID" 2>/dev/null; then
    # bis zu 2 s auf sauberes Beenden warten, sonst SIGKILL
    for _ in 1 2 3 4 5 6 7 8; do
        kill -0 "$PID" 2>/dev/null || break
        sleep 0.25
    done
    if kill -0 "$PID" 2>/dev/null; then
        kill -9 "$PID" 2>/dev/null && echo "⚠️  Server (PID $PID) musste hart beendet werden"
    else
        echo "✓ Server (PID $PID) beendet"
    fi
else
    echo "✗ Konnte Signal an PID $PID nicht senden" >&2
    exit 1
fi

rm -f "$PID_FILE"

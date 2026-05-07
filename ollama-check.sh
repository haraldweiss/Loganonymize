#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# © 2026 Harald Weiss
#
# Loganonymizer — Health-Check für den lokalen Ollama-Daemon.
# Erkennt die drei häufigen "Loop"-Szenarien:
#   1) Daemon hängt        → /api/tags antwortet nicht
#   2) Anfrage hängt       → CPU/RAM hoch, /api/ps zeigt aktive Session
#   3) Degeneriertes Modell → nur über den Output erkennbar (siehe README)
#
# Read-only — beendet keine Prozesse, ändert keine Settings.

set -uo pipefail
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
TIMEOUT=3

ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[33m⚠\033[0m %s\n" "$*"; }
bad()  { printf "  \033[31m✗\033[0m %s\n" "$*"; }
hdr()  { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }

# ─── 1) Prozesse ─────────────────────────────────────────────────────
hdr "Ollama-Prozesse"
PIDS=$(pgrep -f "ollama" 2>/dev/null || true)
if [[ -z "$PIDS" ]]; then
    bad "kein Ollama-Prozess läuft"
    echo "  → starte Ollama.app oder 'ollama serve'"
    exit 1
fi
# shellcheck disable=SC2086
ps -p $(echo "$PIDS" | tr '\n' ',') -o pid,etime,%cpu,%mem,rss,command 2>/dev/null | sed 's/^/  /'

# CPU-Spike-Heuristik: irgendein Ollama-Prozess > 80 % CPU?
HOT=$(ps -p $(echo "$PIDS" | tr '\n' ',') -o %cpu= 2>/dev/null | awk '$1 > 80 {print; exit}')
if [[ -n "$HOT" ]]; then
    warn "ein Prozess > 80 % CPU — kann eine laufende Anfrage sein, oder ein Loop"
fi

# ─── 2) API-Reachability ─────────────────────────────────────────────
hdr "/api/tags (Daemon erreichbar?)"
START=$(date +%s)
if TAGS=$(curl -fsS --max-time "$TIMEOUT" "$OLLAMA_URL/api/tags" 2>&1); then
    ELAPSED=$(( $(date +%s) - START ))
    COUNT=$(printf '%s' "$TAGS" | python3 -c 'import sys, json; print(len(json.load(sys.stdin).get("models", [])))' 2>/dev/null || echo "?")
    ok "HTTP 200 in ${ELAPSED}s — $COUNT installierte Modelle"
else
    bad "Keine Antwort in ${TIMEOUT}s — Daemon hängt (Szenario 1)"
    echo "  → 'killall Ollama && open -a Ollama' bzw. 'pkill ollama && ollama serve'"
    exit 2
fi

# ─── 3) Aktive Sessions ──────────────────────────────────────────────
hdr "/api/ps (gerade geladene Modelle / aktive Sessions)"
if PS_RESP=$(curl -fsS --max-time "$TIMEOUT" "$OLLAMA_URL/api/ps" 2>/dev/null); then
    ACTIVE=$(printf '%s' "$PS_RESP" | python3 -c 'import sys, json; m=json.load(sys.stdin).get("models", []); print(len(m))' 2>/dev/null || echo "0")
    if [[ "$ACTIVE" == "0" ]]; then
        ok "keine aktive Session"
    else
        warn "$ACTIVE Modell(e) im Speicher:"
        printf '%s' "$PS_RESP" | python3 -c '
import sys, json
for m in json.load(sys.stdin).get("models", []):
    name = m.get("name", "?")
    size = m.get("size_vram", m.get("size", 0)) // (1024*1024)
    expires = m.get("expires_at", "?")
    print(f"     · {name}  {size} MiB VRAM/RAM  expires_at={expires}")
'
    fi
else
    warn "/api/ps nicht erreichbar"
fi

# ─── 4) Logs ─────────────────────────────────────────────────────────
hdr "Log-Tail (letzte 15 Zeilen)"
LOG=""
for cand in \
    "$HOME/.ollama/logs/server.log" \
    "$HOME/Library/Logs/ollama/server.log" \
    "/usr/local/var/log/ollama/server.log"; do
    [[ -f "$cand" ]] && LOG="$cand" && break
done
if [[ -n "$LOG" ]]; then
    echo "  Datei: $LOG"
    tail -15 "$LOG" | sed 's/^/    /'
    if tail -200 "$LOG" 2>/dev/null | grep -qiE 'panic|fatal|cuda error|out of memory|gpu hung'; then
        warn "Auffällige Einträge in den letzten 200 Zeilen — bitte prüfen"
    fi
else
    warn "kein bekannter Logpfad gefunden"
fi

# ─── 5) End-to-End Smoke-Test mit Timeout ────────────────────────────
hdr "Generate-Smoke-Test (8s Timeout, kleinster Generate-Call)"
MODEL=$(printf '%s' "$TAGS" | python3 -c 'import sys, json; m=json.load(sys.stdin).get("models",[]); print(m[0]["name"] if m else "")' 2>/dev/null || echo "")
if [[ -z "$MODEL" ]]; then
    warn "kein Modell installiert — Test übersprungen"
else
    echo "  Modell: $MODEL · Prompt: 'ping' · num_predict=4"
    START=$(date +%s)
    if RESP=$(curl -fsS --max-time 8 -X POST "$OLLAMA_URL/api/generate" \
            -H 'Content-Type: application/json' \
            -d "{\"model\":\"$MODEL\",\"prompt\":\"ping\",\"stream\":false,\"options\":{\"num_predict\":4}}" 2>&1); then
        ELAPSED=$(( $(date +%s) - START ))
        ok "Antwort in ${ELAPSED}s"
    else
        bad "Timeout / Fehler — Anfrage hängt (Szenario 2)"
        echo "  → vermutlich blockiert eine ältere Anfrage. /api/ps zeigt sie."
        echo "  → Hilft meist: Ollama neu starten oder das Modell entladen:"
        echo "    curl -X POST $OLLAMA_URL/api/generate -d '{\"model\":\"$MODEL\",\"keep_alive\":0}'"
        exit 3
    fi
fi

hdr "Fazit"
ok "Daemon antwortet, Generate funktioniert"

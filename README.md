# Loganonymizer

Lokale Log- und Text-Anonymisierung mit optionaler KI-Anbindung.
Läuft komplett im Browser; keine Server-Kommunikation außer bei explizitem
KI-Provider-Aufruf. Daten bleiben in `localStorage` auf dem eigenen Rechner.

## Features

- **Mustererkennung** für E-Mails, Telefonnummern, IBAN (mit Mod-97-Check),
  Kreditkartennummern (Luhn), Adressen, Personennamen und Organisationen.
- **Blacklist** für eigene, immer zu maskierende Begriffe (Projektnamen,
  interne Bezeichner). Beim ersten Befüllen werden Vorschläge aus dem
  Eingabetext automatisch generiert (Tokens, die nicht durch die
  Standard-Erkennung abgedeckt sind).
- **Verlustfreie De-Anonymisierung** über die gespeicherten Mappings.
- **KI-Analyse** mit Auto-Anonymisierung vor dem Senden und
  Auto-De-Anonymisierung der Antwort. Unterstützte Provider:
  - ChatGPT (OpenAI)
  - Claude (Anthropic)
  - Gemini (Google)
  - Mammouth (OpenAI-kompatibler Multi-Modell-Gateway)
  - Ollama (lokal, Modelle werden via `/api/tags` live ausgelesen)
  - Custom API
- **Verlauf** der KI-Antworten zum Nachschlagen, mit Wiederherstellung
  von Prompt + Eingabe + Antwort per Klick.
- **Prompt aus / in Datei** — Prompts lassen sich als `.txt` speichern
  und laden.

## Schnellstart

```bash
./start.sh                       # Server auf http://localhost:8765
./stop.sh                        # Server beenden
LOGANON_PORT=8888 ./start.sh     # anderer Port
```

`start.sh` öffnet auf macOS automatisch den Browser. Die Skripte tracken
den PID und vermeiden Doppelstarts.

Alternativ direkt:
```bash
python3 -m http.server 8765
```

## Ollama lokal

Damit der Browser von der Loganonymizer-Origin aus auf Ollama zugreifen
darf, sind zwei Dinge nötig:

### 1. CORS: `OLLAMA_ORIGINS` setzen

```bash
launchctl setenv OLLAMA_ORIGINS \
  "http://localhost,http://localhost:8765,http://127.0.0.1,http://127.0.0.1:8765,http://127.0.0.1:11435"
killall Ollama; open -a Ollama
```

### 2. PNA-Proxy (nur bei HTTPS)

Wenn Loganonymizer über **HTTPS** geladen wird (Cloudflare, VPS), blockiert
Chrome den direkten Aufruf von `http://localhost`. Der PNA-Proxy auf Port
`11435` umgeht das:

```bash
cp deploy/mac/ollama-pna-proxy.py ~/bin/
cp deploy/mac/com.user.ollama-pna-proxy.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.user.ollama-pna-proxy.plist
```

Die App wechselt automatisch auf `http://127.0.0.1:11435`, wenn sie über
HTTPS läuft.

Wenn `ollama serve` nicht läuft, zeigt der KI-Provider-Tab eine
Hilfe-Karte mit Start-Befehl, Copy-Button, optional einem
`ollama://`-App-Open-Versuch (macOS) und einem Auto-Retry-Loop, der
sich bei Verbindungserfolg selbst zurückzieht.

### Reboot-Persistenz

Damit **PNA-Proxy** und **OLLAMA_ORIGINS** nach einem Neustart automatisch
verfügbar sind, liegen zwei LaunchAgents bereit:

#### OLLAMA_ORIGINS

```bash
cp deploy/mac/com.user.ollama-origins.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.ollama-origins.plist
```

#### PNA-Proxy

Wird automatisch via LaunchAgent gestartet und bleibt bei Abstürzen durch
`KeepAlive` am Leben. Logs unter `~/Library/Logs/ollama-pna-proxy.log`.

```bash
cp deploy/mac/ollama-pna-proxy.py ~/bin/
cp deploy/mac/com.user.ollama-pna-proxy.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.user.ollama-pna-proxy.plist
```

Nach einem Neustart genügt:
```bash
launchctl list | grep ollama-pna     # Sollte exit code 0 zeigen
```

## Datenschutz

- Alle Mappings, Blacklist, Einstellungen, Provider-Konfigurationen und
  der KI-Verlauf liegen im Browser-`localStorage` (Schlüssel-Präfix
  `loganonymizer_`). Nichts wird an einen Server der App geschickt.
- API-Keys werden im `localStorage` **im Klartext** abgelegt — nur auf
  vertrauenswürdigen Geräten verwenden.
- Bei einem KI-Aufruf gehen die (vorzugsweise anonymisierten) Daten an
  den jeweils gewählten Provider. Auto-Anonymisierung ist standardmäßig
  aktiv, lässt sich aber im Analyse-Tab pro Aufruf abschalten.
- Backups via *Einstellungen → Alle Daten exportieren* enthalten **keine**
  API-Keys; der Provider-Eintrag wird mit leerem `apiKey` exportiert.

## Architektur (Kurzübersicht)

| Datei | Verantwortung |
|---|---|
| `index.html` | UI-Struktur, Bootstrap-Icons, Poppins-Font |
| `css/styles.css` | Dark-Theme, gradient header, alle Komponenten |
| `js/utils.js` | Logging, localStorage-Helpers, Settings, Notifications |
| `js/anonymizer.js` | Erkennungs-Regex und Anonymisierungs-Pipeline |
| `js/ai.js` | API-Calls (OpenAI-kompatibel, Anthropic, Google, Ollama) |
| `js/app.js` | UI-Wiring, Tabs, Provider-Verwaltung, Verlauf, Vorschläge |
Cache-Buster (`?v=NNN`) hängen an allen Asset-Links für deterministische
Browser-Reloads nach Releases.

## Deployment auf Cloudflare Pages

Loganonymizer ist eine reine Static-Site (kein Build-Schritt) und läuft
direkt auf Cloudflare Pages, GitHub Pages, Netlify usw. Empfohlen ist
Cloudflare Pages, weil das mitgelieferte [`_headers`](_headers) automatisch
sinnvolle Security- und Cache-Header setzt.

### Schritte (CF Dashboard)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. GitHub-Account verbinden, Repo `Loganonymize` auswählen
3. Build-Settings:
   - **Framework preset**: *None*
   - **Build command**: leer lassen
   - **Build output directory**: `/` (Repo-Root)
4. **Save and Deploy** — der erste Build ist in unter einer Minute fertig.
5. Eigene Domain (optional): *Custom domains* → URL eintragen, DNS-Eintrag
   wird automatisch vorgeschlagen.

Ab jetzt löst jeder `git push` auf `main` ein automatisches Deployment aus.

### Was im _headers schon drin ist

- **CSP** mit `connect-src` für alle KI-Provider (OpenAI, Anthropic, Google,
  Mammouth, Ollama lokal) und IP-Reputation (VirusTotal, AbuseIPDB)
- **HSTS**, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` ohne Camera/Mic/Geo, `frame-ancestors 'none'`
- Cache-Strategie: Assets unter `/css` und `/js` 5 Minuten (für schnelle
  Deployment-Zyklen), `index.html` immer revalidiert

### Private Network Access (PNA) – Ollama unter HTTPS

Wenn Loganonymizer über HTTPS ausgeliefert wird (Cloudflare, VPS) und ein
Nutzer eine **lokale** Ollama-Instanz ansprechen will, blockiert Chrome den
`http://localhost`-Aufruf wegen **Private Network Access**. Der Browser
fordert explizit den Header `Access-Control-Allow-Private-Network: true`.

Ollama selbst setzt diesen Header nicht. Abhilfe schafft ein lokaler
PNA-Proxy, der auf Port `11435` läuft und die fehlenden Header ergänzt:

```bash
# Installation
cp deploy/mac/ollama-pna-proxy.py ~/bin/
cp deploy/mac/com.user.ollama-pna-proxy.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.user.ollama-pna-proxy.plist

# OLLAMA_ORIGINS um den Proxy-Port erweitern
launchctl setenv OLLAMA_ORIGINS \
  "https://<deine-app-url>,http://localhost,http://localhost:8765,http://127.0.0.1:11435"
killall Ollama; open -a Ollama
```

Sobald der Proxy läuft, verwendet die App automatisch `http://127.0.0.1:11435`
statt `http://localhost:11434`, wenn sie über HTTPS geladen wird.

## Mitwirken

Pull-Requests sind willkommen. Bitte einmal kurz [`CONTRIBUTING.md`](CONTRIBUTING.md)
lesen — wir nutzen das Developer Certificate of Origin (DCO), Commits müssen
also mit `git commit -s` signiert werden.

## Lizenz

Veröffentlicht unter der [GNU AGPL v3.0](LICENSE) — © 2026 Harald Weiss.

Die AGPL stellt sicher, dass auch netzbasierte Bereitstellungen (z. B. eine
gehostete Loganonymizer-Variante als Web-Service) den Quellcode ihrer
Modifikationen weitergeben müssen. Ideen und Konzepte sind durch keine
Lizenz schützbar.

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

Damit der Browser von der Loganonymizer-Origin aus auf
`http://localhost:11434` zugreifen darf, muss Ollama eine passende
`OLLAMA_ORIGINS`-Umgebung haben:

```bash
launchctl setenv OLLAMA_ORIGINS \
  "http://localhost,http://localhost:8765,http://127.0.0.1,http://127.0.0.1:8765"
# Persistierend in ~/.zshrc:
echo 'export OLLAMA_ORIGINS="http://localhost,http://localhost:8765"' >> ~/.zshrc
# Ollama neu starten:
killall Ollama; open -a Ollama
```

Wenn `ollama serve` nicht läuft, zeigt der KI-Provider-Tab eine
Hilfe-Karte mit Start-Befehl, Copy-Button, optional einem
`ollama://`-App-Open-Versuch (macOS) und einem Auto-Retry-Loop, der
sich bei Verbindungserfolg selbst zurückzieht.

### Reboot-Persistenz für `OLLAMA_ORIGINS` (macOS)

`launchctl setenv` lebt nur bis zum nächsten Reboot. Damit die Variable
auch nach Neustart automatisch gesetzt wird, kann ein User-LaunchAgent
beim Login einmal feuern.

**1. Plist anlegen** unter
`~/Library/LaunchAgents/de.<dein-handle>.ollama-origins.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>de.<dein-handle>.ollama-origins</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/launchctl</string>
        <string>setenv</string>
        <string>OLLAMA_ORIGINS</string>
        <string>http://localhost,http://localhost:8765,http://127.0.0.1,https://&lt;deine-pages-url&gt;</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
```

Den `<string>`-Wert in `ProgramArguments` mit deiner Origin-Liste
ersetzen (comma-separated, kein Leerzeichen, `https://` wenn du eine
gehostete Loganonymizer-Variante zur lokalen Ollama sprechen lässt).

**2. Aktivieren**:
```bash
PLIST=~/Library/LaunchAgents/de.<dein-handle>.ollama-origins.plist
plutil -lint "$PLIST"                           # Syntax-Check
launchctl bootstrap gui/$(id -u) "$PLIST"       # registrieren + sofort feuern
```

**3. Verifizieren** (einmal jetzt, oder nach Reboot):
```bash
launchctl getenv OLLAMA_ORIGINS                 # sollte deine Liste zeigen
curl -sI -H "Origin: https://<deine-pages-url>" http://localhost:11434/api/tags | grep access-control
# erwartet: Access-Control-Allow-Origin: https://<deine-pages-url>
```

**4. Origins später ändern** — Plist editieren, dann:
```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/de.<dein-handle>.ollama-origins.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/de.<dein-handle>.ollama-origins.plist
killall Ollama; open -a Ollama
```

**5. Entfernen**:
```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/de.<dein-handle>.ollama-origins.plist
rm ~/Library/LaunchAgents/de.<dein-handle>.ollama-origins.plist
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
| `js/config.js` | Legacy-Config-Helpers (kompatibilitätshalber) |

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
- Cache-Strategie: Assets unter `/css` und `/js` 1 Tag, `index.html` immer
  revalidiert (zusammen mit dem `?v=NNN`-Cache-Buster)

### Ollama-Caveat unter HTTPS

Wenn Loganonymizer auf einer Pages-URL liegt (`https://…pages.dev`) und
ein Nutzer eine **lokale** Ollama-Instanz ansprechen will, muss bei diesem
Nutzer `OLLAMA_ORIGINS` die Pages-URL enthalten. Beispiel:

```bash
launchctl setenv OLLAMA_ORIGINS \
  "https://loganonymize.pages.dev,http://localhost,http://localhost:8765"
killall Ollama; open -a Ollama
```

Die HTTPS→`http://localhost`-Kommunikation ist in Chrome/Edge per
"Private Network Access" für Loopback ausdrücklich erlaubt; Firefox/Safari
sind teils strikter — wenn's dort hakt, ist das die Stelle.

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

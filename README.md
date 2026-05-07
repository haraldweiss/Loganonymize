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

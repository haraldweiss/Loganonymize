# AGENTS.md — cosanta (Loganonymizer)

Shared instructions for all AI coding agents working in this repo. Both `CLAUDE.md` and `AGENTS.md` point here.

---

## 0. Before your first commit in a session

```bash
git config user.email   # must be: harald.weiss@wolfinisoftware.de
git config user.name    # must be: Harald Weiss
git fetch origin
```

If `user.email` is unset, empty, or fake — **stop, fix it, then proceed**. Past incident: 8 commits got pushed with `haraldweiss@example.com` as author AND in `Signed-off-by` body lines.

---

## 1. What this project is

- **Browser-only log/text anonymizer** with optional AI provider integration
- Pure HTML + vanilla JS, no build step, no framework
- Runs in the browser — data stays in `localStorage`, never sent anywhere except explicit AI calls
- Pattern recognition: emails, phones, IBAN (mod-97), credit cards (Luhn), addresses, names, orgs
- Supported AI providers: OpenAI, Anthropic, Gemini, Mammouth, Ollama (local), Custom API
- Deployed via Cloudflare Pages/Workers; `_headers` controls CSP + cache + PNA
- Default branch: `main`, remote: `github.com:haraldweiss/Loganonymize`
- No GitHub ruleset (force-push works)

---

## 2. Agent routing

### opencode (Throughput)
- Dead-code removal (`js/config.js` legacy purge style)
- Provider-routing additions (new AI providers in `js/ai.js`)
- Cache-buster bumps, README touch-ups
- Migration cleanup (e.g. legacy localStorage key migrations)

### Claude Code (Care)
- **CSP changes in `_headers`** — any widening must be reviewed and flagged
- LaunchAgent installer changes in `deploy/mac/` (runs on user's machine, hard to debug remotely)
- Ollama PNA proxy (`ollama-pna-proxy.py`) — security boundary between HTTPS origin and local Ollama
- Crypto/sensitive-data handling in pattern matchers

---

## 3. Hard rules

### 3.1 Privacy invariants
- This is a **privacy-first** tool. Anonymization happens **before** any network call.
- Don't add telemetry, analytics, or "improve the product" beacons.
- Don't log raw user input to console outside of dev-only debug paths.

### 3.2 CSP / `_headers`
- `connect-src` currently includes `https:` to support user-configured BYO provider endpoints. Don't tighten this without a path for custom endpoints; don't widen further without a `⚠ Security:` flag in the commit.
- Adding new `Permissions-Policy` features → review for browser compatibility.
- `Access-Control-Allow-Private-Network: true` is required for the Ollama PNA proxy on `:11435`. Don't remove.

### 3.3 Local migration safety (real bug, real incident)
- **Never** put an entry like `oldKey: 'X' → newKey: 'X'` in the legacy migration table. The migrator does `removeItem(oldKey)` after copying, so `oldKey === newKey` wipes the just-written value on every page load. Fixed 2026-05-27 in `cdeef7b`.
- Always guard: `if (oldKey === newKey) continue;`

### 3.4 Provider switch
- The provider `switch` in `js/app.js` had a `default: throw 'not implemented'` that made custom providers unusable. Default now routes through `callOpenAI` (most custom services are OpenAI-compatible). Don't revert.

### 3.5 Don't commit secrets
- `localhost+1.pem` / `localhost+1-key.pem` are local dev mkcert certs — currently in repo, should be in `.gitignore` (✓ added). Don't commit real production certs, API keys, or tokens.

---

## 4. Verification standards

```
Verified: opened in dev browser, ran sample anonymization round-trip ✓
```
or
```
Verified: _headers change — tested via curl -I, CSP applies on next deploy ✓
```

For `_headers` / CSP / PNA changes, always include a manual test description.

---

## 5. Commit style

- Granular: 3–8 small commits per topic
- Concrete numbers ("removed 317 lines from `js/ai.js`", "cache-buster v111 → v112")
- Bug reproducer in body when fixing
- `⚠ Security:` prefix on CSP/CORS/PNA/header changes
- `Signed-off-by: Harald Weiss <harald.weiss@wolfinisoftware.de>` if you keep DCO sign-offs going

---

## 6. Quick reference

| What | Path / command |
|---|---|
| Dev server | `./start.sh` (mkcert HTTPS on `localhost:8443`) |
| Ollama check | `./ollama-check.sh` |
| Cache buster | `index.html` `?v=NNN` query param on each `<script>` |
| CSP / headers | `_headers` (Cloudflare format) |
| LaunchAgents | `deploy/mac/com.user.ollama-*.plist` |
| PNA proxy | `deploy/mac/ollama-pna-proxy.py` (port 11435) |
| AI call dispatch | `js/ai.js` (6 provider functions only — keep slim) |
| Settings | `js/utils.js` getSettings/saveSettings — source of truth |

---

## 7. Handoff zone (free-form, append-only)

<!-- Example:
### 2026-05-27 — opencode dead-code purge
- Removed config.js entirely (-116 lines)
- ai.js stripped from 322 to 5 lines (only 6 API call functions used)
- Cache-buster bumped to v112
- Did NOT test the Custom provider path manually — should be smoke-tested
-->

// SPDX-License-Identifier: AGPL-3.0-or-later
// © 2026 Harald Weiss

/**
 * Loganonymizer — Application wiring layer
 *
 * Connects HTML data-action attributes (the user-facing contract) to the
 * backend modules (anonymizer.js, utils.js, blacklist.js, analysis.js, …).
 * Single source of truth for everything the UI calls.
 *
 * Inline onclick handlers were replaced with data-action attributes so the
 * CSP can drop 'unsafe-inline' for script-src. The click delegation is
 * registered in initializeApp() below.
 */

'use strict';

// ============================================================
// STATE & CONSTANTS
// ============================================================

const AI_PROVIDER_STORAGE_KEY = STORAGE_PREFIX + 'ai_providers';
const AI_HISTORY_STORAGE_KEY  = STORAGE_PREFIX + 'ai_history';
const AI_HISTORY_MAX_ENTRIES  = 50;

// One-shot migration from the previous "cosanta_*" namespace.
// Runs at module load (before initializeApp), so storage reads inside
// initializeApp see the new keys. Safe to leave in place — once the
// new keys exist, it does nothing.
(function migrateLegacyStorage() {
    const map = [
        ['cosanta_mappings',          STORAGE_PREFIX + 'mappings'],
        ['cosanta_blacklist',         STORAGE_PREFIX + 'blacklist'],
        ['cosanta_statistics',        STORAGE_PREFIX + 'statistics'],
        ['cosanta_ai_providers_v2',   AI_PROVIDER_STORAGE_KEY]
    ];
    let migrated = 0;
    for (const [oldKey, newKey] of map) {
        if (oldKey === newKey) continue;
        const oldVal = localStorage.getItem(oldKey);
        if (oldVal !== null && localStorage.getItem(newKey) === null) {
            localStorage.setItem(newKey, oldVal);
            migrated++;
        }
        if (oldVal !== null) localStorage.removeItem(oldKey);
    }
    if (migrated > 0) console.log(`[Loganonymizer] Migrated ${migrated} legacy storage entries.`);
})();

const PROVIDER_TYPE_DEFAULTS = {
    openai:    { endpoint: 'https://api.openai.com/v1/chat/completions',    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-3.5-turbo'] },
    anthropic: { endpoint: 'https://api.anthropic.com/v1/messages',         models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
    google:    { endpoint: 'https://generativelanguage.googleapis.com/v1',  models: ['gemini-1.5-pro', 'gemini-1.5-flash'] },
    mammouth:  { endpoint: 'https://api.mammouth.ai/v1/chat/completions',   models: ['gpt-4o', 'claude-opus-4-7', 'claude-sonnet-4-6', 'gemini-1.5-pro', 'mistral-large'] },
    ollama:    { endpoint: location.protocol === 'https:' ? 'http://127.0.0.1:11435/api/chat' : 'http://localhost:11434/api/chat', models: ['llama3.2', 'llama3.1', 'mistral', 'qwen2.5'] },
    custom:    { endpoint: '',                                              models: [] }
};

const PROVIDER_DOC_LINKS = {
    openai:    { url: 'https://platform.openai.com/api-keys',           label: 'API-Key bei OpenAI holen' },
    anthropic: { url: 'https://console.anthropic.com/settings/keys',    label: 'API-Key bei Anthropic holen' },
    google:    { url: 'https://aistudio.google.com/apikey',             label: 'API-Key bei Google AI Studio holen' },
    mammouth:  { url: 'https://mammouth.ai/app/account/settings/api',   label: 'API-Key bei Mammouth holen' },
    ollama:    { url: 'https://ollama.com/download',                    label: 'Ollama lokal installieren' },
    custom:    { url: '',                                               label: '' }
};

const lastRun = { count: 0, durationMs: 0, byType: {} };

// ============================================================
// INIT
// ============================================================

function initializeApp() {
    try {
        const settings = getSettings();
        applySettingsToForm(settings);
        window.DEBUG_MODE = !!settings.debugMode;

        wireTabs();
        wireCharCounters();
        wireProviderTypeChange();
        wireProviderSelectChange();
        wireMappingsSearch();
        wireSuggestionsAutoTrigger();
        wireIpPanelAutoTrigger();
        wireFilePanelAutoTrigger();
        loadIpReputationKeys();

        wireActionDelegation();
        renderAll();
        refreshIpPanel();
        refreshFilePanel();
        logMessage('INFO', 'Loganonymizer initialized');
    } catch (error) {
        logMessage('ERROR', 'Init failed: ' + error.message);
        showNotification('Initialisierung fehlgeschlagen: ' + error.message, 'error');
    }
}

function renderAll() {
    renderBlacklist();
    renderProviders();
    renderProviderDropdown();
    renderMappings();
    renderAIHistory();
    refreshStats();
}

// ============================================================
// DOM HELPERS
// ============================================================

function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v !== null && v !== undefined) node.setAttribute(k, v);
    }
    for (const c of children) {
        if (c == null) continue;
        node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
}

function clearChildren(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
}

function emptyMessage(text) {
    return el('p', { class: 'text-muted text-center' }, text);
}

// ============================================================
// TABS
// ============================================================

function wireTabs() {
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab, btn));
    });
}

function switchTab(tabName, clickedBtn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById(tabName);
    if (tab) tab.classList.add('active');
    if (clickedBtn) clickedBtn.classList.add('active');
}

// ============================================================
// CHAR COUNTERS
// ============================================================

function wireCharCounters() {
    bindCount('input-text', 'input-char-count');
    bindCount('output-text', 'output-char-count');
}

function bindCount(textareaId, counterId) {
    const ta = document.getElementById(textareaId);
    const counter = document.getElementById(counterId);
    if (!ta || !counter) return;
    const update = () => { counter.textContent = ta.value.length; };
    ta.addEventListener('input', update);
    update();
}

// ============================================================
// ANONYMIZE / DEANONYMIZE
// ============================================================

function anonymizeText() {
    const input = document.getElementById('input-text');
    const output = document.getElementById('output-text');
    if (!input || !output) return;

    const text = input.value;
    if (!text.trim()) {
        showNotification('Bitte Text eingeben', 'warning');
        return;
    }

    const t0 = performance.now();
    try {
        const result = runAnonymization(text);
        output.value = result.anonymized;

        lastRun.count = Object.keys(result.newMappings).length;
        lastRun.durationMs = Math.round(performance.now() - t0);
        lastRun.byType = countByType(result.newMappings);

        const outCount = document.getElementById('output-char-count');
        if (outCount) outCount.textContent = output.value.length;

        renderMappings();
        refreshStats();

        showNotification(
            lastRun.count > 0
                ? `${lastRun.count} neue Elemente anonymisiert (${result.totalMappings} gesamt)`
                : 'Keine neuen Elemente gefunden',
            lastRun.count > 0 ? 'success' : 'warning'
        );
    } catch (error) {
        logMessage('ERROR', 'Anonymization failed: ' + error.message);
        showNotification('Fehler: ' + error.message, 'error');
    }
}

function deanonymizeText() {
    const input = document.getElementById('deanon-input-text');
    const output = document.getElementById('deanon-output-text');
    if (!input || !output) return;

    const text = input.value;
    if (!text.trim()) {
        showNotification('Bitte Text eingeben', 'warning');
        return;
    }

    try {
        const result = runDeanonymization(text);
        output.value = result.deanonymized;
        refreshStats();
        showNotification(
            result.replacements > 0
                ? `${result.replacements} Platzhalter ersetzt`
                : 'Keine Platzhalter gefunden',
            result.replacements > 0 ? 'success' : 'warning'
        );
    } catch (error) {
        logMessage('ERROR', 'Deanonymization failed: ' + error.message);
        showNotification('Fehler: ' + error.message, 'error');
    }
}

function countByType(mappings) {
    const counts = {};
    for (const placeholder of Object.keys(mappings)) {
        const type = placeholder.split('_')[0].toLowerCase();
        counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
}

// ============================================================
// CLIPBOARD / TEXT UTILITIES
// ============================================================

async function pasteFromClipboard(targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;
    try {
        const text = await navigator.clipboard.readText();
        target.value = text;
        target.dispatchEvent(new Event('input'));
        showNotification('Eingefügt', 'success');
    } catch {
        showNotification('Zugriff auf Zwischenablage verweigert', 'error');
    }
}

async function copyToClipboard(elementId) {
    const node = document.getElementById(elementId);
    if (!node) return;
    const text = (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT')
        ? node.value
        : node.textContent;
    if (!text || !text.trim()) {
        showNotification('Nichts zum Kopieren', 'warning');
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        showNotification('In Zwischenablage kopiert', 'success');
    } catch {
        showNotification('Kopieren fehlgeschlagen', 'error');
    }
}

function clearText(elementId) {
    const node = document.getElementById(elementId);
    if (!node) return;
    if (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') {
        node.value = '';
        node.dispatchEvent(new Event('input'));
    } else {
        node.textContent = '';
    }
}

function swapTexts() {
    const input = document.getElementById('input-text');
    const output = document.getElementById('output-text');
    if (!input || !output) return;
    const tmp = input.value;
    input.value = output.value;
    output.value = tmp;
    input.dispatchEvent(new Event('input'));
    const outCount = document.getElementById('output-char-count');
    if (outCount) outCount.textContent = output.value.length;
}

function downloadText() {
    const text = document.getElementById('output-text')?.value || '';
    if (!text) {
        showNotification('Kein Text zum Herunterladen', 'warning');
        return;
    }
    saveBlobAs(text, `loganonymizer-anonymized-${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain;charset=utf-8');
}

function saveBlobAs(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ============================================================
// AI PROVIDERS
// ============================================================

function loadAIProviders() {
    try {
        const raw = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function persistAIProviders(list) {
    localStorage.setItem(AI_PROVIDER_STORAGE_KEY, JSON.stringify(list));
}

function addAIProvider() {
    const name = document.getElementById('provider-name').value.trim();
    const type = document.getElementById('provider-type').value;
    const apiKey = document.getElementById('provider-api-key').value.trim();
    const endpoint = document.getElementById('provider-endpoint').value.trim();
    const modelsRaw = document.getElementById('provider-models').value.trim();

    // Ollama runs locally without authentication, so the API-key is optional.
    const needsKey = type !== 'ollama';
    if (!name || !type || (needsKey && !apiKey)) {
        showNotification(needsKey
            ? 'Name, Typ und API-Key sind Pflicht'
            : 'Name und Typ sind Pflicht', 'warning');
        return;
    }

    const defaults = PROVIDER_TYPE_DEFAULTS[type] || PROVIDER_TYPE_DEFAULTS.custom;
    const models = modelsRaw
        ? modelsRaw.split(',').map(m => m.trim()).filter(Boolean)
        : [...defaults.models];

    const provider = {
        id: uuid(),
        name,
        type,
        apiKey,
        endpoint: endpoint || defaults.endpoint,
        models,
        createdAt: Date.now()
    };

    const list = loadAIProviders();
    list.push(provider);
    persistAIProviders(list);

    ['provider-name', 'provider-api-key', 'provider-endpoint', 'provider-models']
        .forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });

    renderProviders();
    renderProviderDropdown();
    showNotification(`Provider "${name}" gespeichert`, 'success');
}

function deleteAIProvider(id) {
    if (!confirm('Provider wirklich löschen?')) return;
    persistAIProviders(loadAIProviders().filter(p => p.id !== id));
    renderProviders();
    renderProviderDropdown();
    showNotification('Provider gelöscht', 'success');
}

function wireProviderTypeChange() {
    const sel = document.getElementById('provider-type');
    const endpoint = document.getElementById('provider-endpoint');
    const models = document.getElementById('provider-models');
    if (!sel) return;

    // Track whether the user has manually edited endpoint/models so we
    // don't clobber their input on subsequent type-changes.
    let endpointDirty = false;
    let modelsDirty = false;
    if (endpoint) endpoint.addEventListener('input', () => { endpointDirty = true; });
    if (models)   models.addEventListener('input',   () => { modelsDirty   = true; });

    const update = () => {
        const def = PROVIDER_TYPE_DEFAULTS[sel.value];
        if (def && endpoint && !endpointDirty) endpoint.value = def.endpoint;
        if (def && models && !modelsDirty)     models.value = def.models.join(', ');
        updateProviderDocLink(sel.value);

        const testBtn = document.getElementById('ollama-test-btn');
        if (testBtn) testBtn.style.display = sel.value === 'ollama' ? '' : 'none';

        if (sel.value === 'ollama') {
            // For Ollama, try to discover the actually installed models live.
            // Failure shows the start-help panel with an auto-retry loop.
            if (!modelsDirty) tryAutoPopulateOllamaModels();
        } else {
            // Switched away — drop any retry loop and hide the help panel.
            stopOllamaAutoRetry(true);
        }
    };

    sel.addEventListener('change', update);
    updateProviderDocLink(sel.value);
    update();
}

function updateProviderDocLink(type) {
    const wrap = document.getElementById('provider-doc-link-wrap');
    const link = document.getElementById('provider-doc-link');
    if (!wrap || !link) return;
    const doc = PROVIDER_DOC_LINKS[type];
    if (!doc || !doc.url) {
        wrap.style.display = 'none';
        return;
    }
    wrap.style.display = '';
    link.href = doc.url;
    link.textContent = doc.label + ' ↗';
}

function wireProviderSelectChange() {
    const sel = document.getElementById('ai-provider');
    if (!sel) return;
    sel.addEventListener('change', () => {
        updateModelDropdown(sel.value);
        // If the freshly-selected provider is Ollama, try to refresh its
        // live model list so the dropdown reflects what's actually installed.
        const provider = loadAIProviders().find(p => p.id === sel.value);
        if (provider?.type === 'ollama') refreshOllamaModels(sel.value);
    });
}

function updateModelDropdown(providerId) {
    const modelSel = document.getElementById('ai-model');
    if (!modelSel) return;
    clearChildren(modelSel);
    modelSel.appendChild(el('option', { value: '' }, '-- Modell auswählen --'));
    const provider = loadAIProviders().find(p => p.id === providerId);
    if (!provider) return;
    provider.models.forEach(m => modelSel.appendChild(el('option', { value: m }, m)));
}

function renderProviderDropdown() {
    const sel = document.getElementById('ai-provider');
    if (!sel) return;
    const current = sel.value;
    clearChildren(sel);
    sel.appendChild(el('option', { value: '' }, '-- Provider auswählen --'));
    loadAIProviders().forEach(p => {
        sel.appendChild(el('option', { value: p.id }, `${p.name} (${p.type})`));
    });
    sel.value = current;
    updateModelDropdown(sel.value);
}

function renderProviders() {
    const container = document.getElementById('providers-list');
    if (!container) return;
    clearChildren(container);

    const list = loadAIProviders();
    if (list.length === 0) {
        container.appendChild(emptyMessage('Noch keine Provider konfiguriert'));
        return;
    }

    list.forEach(p => {
        const card = el('div', { class: 'provider-card' });

        const header = el('div', { class: 'provider-header' },
            el('strong', {}, p.name),
            el('span', { class: 'badge bg-secondary' }, p.type)
        );

        const body = el('div', { class: 'provider-body' },
            el('small', {}, el('strong', {}, 'API-Key: '), el('code', {}, maskKey(p.apiKey))),
            el('br'),
            el('small', {}, el('strong', {}, 'Endpoint: '), p.endpoint || '—'),
            el('br'),
            el('small', {}, el('strong', {}, 'Modelle: '), p.models.join(', ') || '—')
        );

        const actionEls = [];
        if (p.type === 'ollama') {
            actionEls.push(el('button', {
                class: 'btn-secondary btn-sm',
                onclick: () => refreshOllamaModels(p.id),
                title: 'Lokale Modelle via /api/tags neu laden'
            }, '🔄 Modelle aktualisieren'));
        }
        actionEls.push(el('button', {
            class: 'btn-danger btn-sm',
            onclick: () => deleteAIProvider(p.id)
        }, '🗑️ Löschen'));

        const actions = el('div', { class: 'provider-actions' }, ...actionEls);

        card.append(header, body, actions);
        container.appendChild(card);
    });
}

function maskKey(key) {
    if (!key || key.length < 8) return '••••';
    return key.slice(0, 4) + '…' + key.slice(-4);
}

// ============================================================
// OLLAMA — live model list via /api/tags
// ============================================================

async function fetchOllamaTags(chatEndpoint) {
    const defaultTags = location.protocol === 'https:' ? 'http://127.0.0.1:11435/api/tags' : 'http://localhost:11434/api/tags';
    const url = chatEndpoint
        ? chatEndpoint.replace(/\/api\/(chat|generate)\b.*$/, '/api/tags')
        : defaultTags;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Tags-Endpoint antwortet ${res.status}`);
    const data = await res.json();
    return (data.models || []).map(m => m.name).filter(Boolean);
}

/**
 * Try to fetch live Ollama tags and write them into the provider-models
 * field. On failure we surface the reason so the user can act on it
 * (most common cause: Ollama not running, or its CORS policy doesn't
 * include this page's origin).
 */
async function tryAutoPopulateOllamaModels() {
    const endpointEl = document.getElementById('provider-endpoint');
    const modelsEl   = document.getElementById('provider-models');
    if (!modelsEl) return;
    try {
        const tags = await fetchOllamaTags(endpointEl?.value);
        stopOllamaAutoRetry(true);
        if (tags.length > 0) {
            modelsEl.value = tags.join(', ');
            showNotification(`${tags.length} lokale Modelle aus Ollama geladen`, 'success');
        } else {
            showNotification('Ollama läuft, hat aber keine Modelle installiert', 'warning');
        }
    } catch (err) {
        logMessage('WARN', 'Ollama tags fetch failed: ' + err.message);
        showNotification(ollamaConnectionHint(err), 'error');
        if (isOllamaNetworkError(err)) showOllamaStartHelp('Erstabfrage fehlgeschlagen');
    }
}

/**
 * Decide whether a fetch failure is a "network" failure (Ollama not
 * running, CORS blocked) vs. an HTTP-level failure (server replied with
 * a non-OK status).
 */
function isOllamaNetworkError(err) {
    return err.name === 'TypeError' || /failed to fetch|networkerror/i.test(err.message);
}

function ollamaConnectionHint(err) {
    if (!isOllamaNetworkError(err)) return 'Ollama-Fehler: ' + err.message;
    const isHttps = location.protocol === 'https:';
    const msg = `Ollama nicht erreichbar. Prüfe: (1) "ollama serve" läuft. (2) CORS — setze die Umgebungsvariable OLLAMA_ORIGINS="${location.origin}" und starte Ollama neu.`;
    if (isHttps) {
        return msg + ` (3) Bei HTTPS blockt Chrome http://localhost (Private Network Access). Der PNA-Proxy auf 127.0.0.1:11435 umgeht das. Stelle sicher, dass ollama-pna-proxy läuft: launchctl list | grep ollama-pna`;
    }
    return msg;
}

/**
 * Detect the user's OS so we can show the right start command.
 * Falls back to a generic Linux/Unix hint.
 */
function detectPlatform() {
    const ua = navigator.userAgent || '';
    if (/Mac|Darwin/i.test(ua)) return 'mac';
    if (/Win/i.test(ua))        return 'windows';
    return 'linux';
}

/**
 * Render a rich help panel inline in the form when Ollama can't be
 * reached. A web page literally cannot start a system process, so we
 * give the user a copy-pasteable command, a best-effort link to open
 * the Ollama desktop app via the `ollama://` URL scheme (works on
 * recent macOS builds; otherwise harmless), and start a background
 * poll that auto-recovers as soon as Ollama becomes reachable.
 */
function showOllamaStartHelp(reason) {
    const status = document.getElementById('ollama-status');
    if (!status) return;
    clearChildren(status);

    const platform = detectPlatform();
    const startCmd = 'ollama serve';

    const platformLabel = platform === 'mac' ? 'macOS'
                        : platform === 'windows' ? 'Windows'
                        : 'Linux/Unix';

    const intro = el('p', { class: 'ollama-status-title' },
        '⚠️ ', el('strong', {}, 'Ollama scheint nicht zu laufen.'),
        ' ', el('span', { class: 'text-muted' }, '(' + reason + ')')
    );

    const explainer = el('p', { class: 'ollama-status-text' },
        `Ein Browser kann keinen lokalen Prozess starten. ${platformLabel}: führe einen der folgenden Schritte aus, dann sucht die App automatisch erneut.`
    );

    const cmdRow = el('div', { class: 'ollama-cmd-row' },
        el('code', { class: 'ollama-cmd' }, startCmd),
        el('button', {
            class: 'btn-secondary btn-sm',
            onclick: async () => {
                try {
                    await navigator.clipboard.writeText(startCmd);
                    showNotification('Befehl kopiert', 'success');
                } catch {
                    showNotification('Kopieren fehlgeschlagen', 'error');
                }
            }
        }, '📋 Kopieren')
    );

    const actionsRow = el('div', { class: 'ollama-actions' });

    if (platform === 'mac') {
        actionsRow.appendChild(el('button', {
            class: 'btn-secondary btn-sm',
            title: 'Versucht, die Ollama-App über das ollama:// URL-Schema zu öffnen (funktioniert nur, wenn Ollama das Schema registriert hat)',
            onclick: () => {
                // Trigger via a transient anchor so Chrome routes it to the
                // protocol handler without navigating away if no app catches it.
                const a = document.createElement('a');
                a.href = 'ollama://';
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                a.remove();
                showNotification('Versuche Ollama-App zu öffnen…', 'info');
            }
        }, '🚀 Ollama-App öffnen'));
    }

    actionsRow.appendChild(el('button', {
        class: 'btn-primary btn-sm',
        onclick: () => testOllamaConnection()
    }, '🔄 Erneut prüfen'));

    actionsRow.appendChild(el('button', {
        class: 'btn-secondary btn-sm',
        onclick: () => stopOllamaAutoRetry(true)
    }, '✕ Schließen'));

    status.append(intro, explainer, cmdRow, actionsRow);
    status.style.display = '';

    // Background poll: as soon as /api/tags becomes reachable, populate
    // the models field, dismiss the panel, and show a success toast.
    startOllamaAutoRetry();
}

let ollamaRetryTimer = null;
let ollamaRetryAttempts = 0;
const OLLAMA_RETRY_INTERVAL_MS = 4000;
const OLLAMA_RETRY_MAX_ATTEMPTS = 30; // ~ 2 minutes

function startOllamaAutoRetry() {
    stopOllamaAutoRetry(false);
    ollamaRetryAttempts = 0;
    ollamaRetryTimer = setInterval(async () => {
        ollamaRetryAttempts++;
        try {
            const endpointEl = document.getElementById('provider-endpoint');
            const tags = await fetchOllamaTags(endpointEl?.value);
            stopOllamaAutoRetry(true);
            const modelsEl = document.getElementById('provider-models');
            if (modelsEl) modelsEl.value = tags.join(', ');
            showNotification(`✅ Ollama läuft jetzt — ${tags.length} Modelle geladen`, 'success');
        } catch {
            if (ollamaRetryAttempts >= OLLAMA_RETRY_MAX_ATTEMPTS) {
                stopOllamaAutoRetry(false);
                showNotification('Auto-Prüfung beendet — manuell mit "Erneut prüfen" probieren', 'warning');
            }
        }
    }, OLLAMA_RETRY_INTERVAL_MS);
}

function stopOllamaAutoRetry(hidePanel) {
    if (ollamaRetryTimer) {
        clearInterval(ollamaRetryTimer);
        ollamaRetryTimer = null;
    }
    if (hidePanel) {
        const status = document.getElementById('ollama-status');
        if (status) {
            status.style.display = 'none';
            clearChildren(status);
        }
    }
}

/**
 * Manual connection test used by the "Verbindung testen" button.
 * Surfaces both success and failure prominently.
 */
async function testOllamaConnection() {
    const endpointEl = document.getElementById('provider-endpoint');
    showNotification('Teste Verbindung zu Ollama …', 'info');
    try {
        const tags = await fetchOllamaTags(endpointEl?.value);
        stopOllamaAutoRetry(true);
        if (tags.length === 0) {
            showNotification('Verbunden, aber keine Modelle installiert (ollama pull <modell>)', 'warning');
        } else {
            const modelsEl = document.getElementById('provider-models');
            if (modelsEl) modelsEl.value = tags.join(', ');
            showNotification(`✅ Verbindung OK — ${tags.length} Modelle: ${tags.slice(0,3).join(', ')}${tags.length>3?' …':''}`, 'success');
        }
    } catch (err) {
        showNotification(ollamaConnectionHint(err), 'error');
        if (isOllamaNetworkError(err)) showOllamaStartHelp('Verbindung fehlgeschlagen');
    }
}

/**
 * Refresh the stored model list for an Ollama provider against the live
 * /api/tags endpoint. Triggered from the 🔄 button on the provider card.
 */
async function refreshOllamaModels(id) {
    const list = loadAIProviders();
    const provider = list.find(p => p.id === id);
    if (!provider || provider.type !== 'ollama') return;
    showNotification('Hole lokale Modelle …', 'info');
    try {
        const tags = await fetchOllamaTags(provider.endpoint);
        if (tags.length === 0) {
            showNotification('Ollama läuft, hat aber keine Modelle installiert', 'warning');
            return;
        }
        provider.models = tags;
        persistAIProviders(list);
        renderProviders();
        // If the AI-Analyse tab is currently using this provider, refresh its dropdown.
        if (document.getElementById('ai-provider')?.value === id) updateModelDropdown(id);
        showNotification(`${tags.length} Modelle aktualisiert`, 'success');
    } catch (err) {
        showNotification(ollamaConnectionHint(err), 'error');
        if (isOllamaNetworkError(err)) showOllamaStartHelp('Refresh fehlgeschlagen');
    }
}

// ============================================================
// AI CALL
// ============================================================

// AbortController for the currently in-flight AI call. Shared with the
// "Abbrechen" button so the user can kill stuck/loop requests without
// having to reload the page.
let currentAIAbort = null;

async function sendToAI() {
    // If a request is already running, treat the click as an abort.
    if (currentAIAbort) {
        currentAIAbort.abort();
        return;
    }

    const providerId = document.getElementById('ai-provider').value;
    const model = document.getElementById('ai-model').value;
    const promptText = document.getElementById('ai-prompt').value.trim();
    const inputText = document.getElementById('ai-input-text').value.trim();
    const responseBox = document.getElementById('ai-response-text');
    const autoAnon = document.getElementById('auto-anonymize').checked;
    const autoDeanon = document.getElementById('auto-deanonymize').checked;

    if (!providerId) { showNotification('Provider wählen', 'warning'); return; }
    if (!model)      { showNotification('Modell wählen', 'warning'); return; }
    if (!promptText && !inputText) { showNotification('Prompt oder Text eingeben', 'warning'); return; }

    const provider = loadAIProviders().find(p => p.id === providerId);
    if (!provider) { showNotification('Provider nicht gefunden', 'error'); return; }

    let textToSend = inputText;
    if (autoAnon && inputText) {
        textToSend = runAnonymization(inputText).anonymized;
    }

    const fullPrompt = promptText
        ? `${promptText}\n\n${textToSend}`
        : textToSend;

    clearChildren(responseBox);
    responseBox.appendChild(el('p', { class: 'text-muted' }, '⏳ Anfrage läuft… (Klick auf „Abbrechen" stoppt sie)'));

    setSendButtonAborting(true);
    currentAIAbort = new AbortController();
    const t0 = performance.now();

    try {
        const maxTokens = Number(getSettings().aiMaxTokens) || 1500;
        const legacyShape = {
            providerId: provider.type,
            model,
            apiKey:   provider.apiKey,
            endpoint: provider.endpoint,
            maxTokens,
            signal:   currentAIAbort.signal
        };

        let response;
        switch (provider.type) {
            case 'openai':    response = await callOpenAI(fullPrompt, legacyShape); break;
            case 'anthropic': response = await callAnthropic(fullPrompt, legacyShape); break;
            case 'google':    response = await callGoogle(fullPrompt, legacyShape); break;
            // Mammouth is OpenAI-compatible — same client, different endpoint.
            case 'mammouth':  response = await callOpenAI(fullPrompt, legacyShape); break;
            case 'ollama':    response = await callOllama(fullPrompt, legacyShape); break;
            // Custom provider & any unknown type: assume OpenAI-compatible.
            // The user configured the endpoint in the provider form, so route
            // through callOpenAI which uses provider.endpoint directly.
            default:          response = await callOpenAI(fullPrompt, legacyShape); break;
        }

        if (autoDeanon) {
            response = runDeanonymization(response).deanonymized;
        }

        const durationMs = Math.round(performance.now() - t0);
        const repetition = detectRepetitionScore(response);

        clearChildren(responseBox);
        if (repetition.score > 0.4) {
            responseBox.appendChild(renderRepetitionWarning(repetition, durationMs));
        }
        responseBox.appendChild(document.createTextNode(response));

        showNotification(
            repetition.score > 0.4
                ? `Antwort erhalten (⚠️ ${Math.round(repetition.score * 100)}% Wiederholungen — Modell könnte geloopt haben)`
                : 'Antwort erhalten',
            repetition.score > 0.4 ? 'warning' : 'success'
        );

        saveAIHistoryEntry({
            timestamp:    Date.now(),
            providerId:   provider.id,
            providerName: provider.name,
            providerType: provider.type,
            model,
            prompt:       promptText,
            inputText,
            inputAnonymized:        autoAnon,
            response,
            responseDeanonymized:   autoDeanon
        });
        renderAIHistory();

    } catch (error) {
        clearChildren(responseBox);
        if (error.name === 'AbortError') {
            logMessage('INFO', 'AI call aborted by user');
            responseBox.appendChild(el('p', { class: 'text-muted' }, '⏹ Abgebrochen.'));
            showNotification('Anfrage abgebrochen', 'info');
        } else {
            logMessage('ERROR', 'AI call failed: ' + error.message);
            responseBox.appendChild(el('p', { class: 'text-danger' }, '❌ Fehler: ' + error.message));
            showNotification('Fehler: ' + error.message, 'error');
        }
    } finally {
        currentAIAbort = null;
        setSendButtonAborting(false);
    }
}

/**
 * Swap the "An KI senden" button between its two states. Finds the
 * button by its onclick attribute so we don't depend on a fragile id.
 */
function setSendButtonAborting(aborting) {
    const btn = Array.from(document.querySelectorAll('#ai-analysis button'))
        .find(b => /sendToAI/.test(b.getAttribute('onclick') || ''));
    if (!btn) return;
    if (aborting) {
        btn.dataset.original = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-stop-circle"></i> Abbrechen';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-danger', 'btn-aborting');
    } else if (btn.dataset.original) {
        btn.innerHTML = btn.dataset.original;
        btn.classList.remove('btn-danger', 'btn-aborting');
        btn.classList.add('btn-primary');
    }
}

/**
 * Cheap heuristic for "did the model loop?". Splits the response into
 * word-tokens, builds 3-grams, and reports the share of n-grams that
 * appear more than once. Above ~40% the output is almost certainly
 * degenerate. Returns null-ish for very short responses.
 */
function detectRepetitionScore(text) {
    const words = (text || '').match(/\b[\wäöüÄÖÜß]+\b/g) || [];
    if (words.length < 30) return { score: 0, top: null };

    const trigrams = new Map();
    for (let i = 0; i <= words.length - 3; i++) {
        const tri = (words[i] + ' ' + words[i + 1] + ' ' + words[i + 2]).toLowerCase();
        trigrams.set(tri, (trigrams.get(tri) || 0) + 1);
    }

    const total = words.length - 2;
    let repeatedCount = 0;
    let topTri = null;
    let topCount = 0;
    for (const [tri, c] of trigrams) {
        if (c > 1) repeatedCount += c;
        if (c > topCount) { topCount = c; topTri = tri; }
    }

    return {
        score: repeatedCount / total,
        top:   topCount > 1 ? { phrase: topTri, count: topCount } : null,
        words: words.length
    };
}

function renderRepetitionWarning(rep, durationMs) {
    const pct = Math.round(rep.score * 100);
    const seconds = (durationMs / 1000).toFixed(1);
    const lines = [
        `⚠️ Wiederholungs-Anteil: ${pct}% (${rep.words} Tokens, ${seconds}s).`
    ];
    if (rep.top) {
        lines.push(`Häufigste Phrase ${rep.top.count}×: "${rep.top.phrase}".`);
    }
    lines.push('Das Modell könnte geloopt haben — eventuell num_predict reduzieren oder anderes Modell probieren.');

    return el('div', { class: 'ai-repetition-warning' },
        ...lines.map(l => el('p', {}, l))
    );
}

// ============================================================
// BLACKLIST
// ============================================================

function saveSettings() {
    const settings = {
        debugMode:           checkbox('debug-mode', false),
        detectPersons:       checkbox('detect-persons', true),
        detectOrganizations: checkbox('detect-organizations', true),
        detectLocations:     checkbox('detect-locations', true),
        detectEmails:        checkbox('detect-emails', true),
        detectPhones:        checkbox('detect-phones', true),
        detectIBAN:          checkbox('detect-iban', true),
        detectCreditCards:   checkbox('detect-creditcards', true),
        detectAddresses:     checkbox('detect-addresses', true),
        detectIPs:           checkbox('detect-ips', false),
        detectFiles:         checkbox('detect-files', false),
        preserveFormatting:  checkbox('preserve-formatting', true),
        caseSensitive:       checkbox('case-sensitive', false),
        aiMaxTokens:         clampNumber('ai-max-tokens', 1500, 64, 8192),
        lastUpdated:         new Date().toISOString()
    };
    localStorage.setItem(STORAGE_PREFIX + 'settings', JSON.stringify(settings));
    saveIpReputationKeys();
    window.DEBUG_MODE = !!settings.debugMode;
    showNotification('Einstellungen gespeichert', 'success');
}

function resetSettings() {
    if (!confirm('Einstellungen auf Standardwerte zurücksetzen?')) return;
    const defaults = getDefaultSettings();
    localStorage.setItem(STORAGE_PREFIX + 'settings', JSON.stringify(defaults));
    applySettingsToForm(defaults);
    window.DEBUG_MODE = !!defaults.debugMode;
    showNotification('Einstellungen zurückgesetzt', 'success');
}

function checkbox(id, fallback) {
    const node = document.getElementById(id);
    return node ? !!node.checked : fallback;
}

function clampNumber(id, fallback, min, max) {
    const node = document.getElementById(id);
    if (!node) return fallback;
    const n = Number(node.value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}

// ============================================================
// EXPORT / IMPORT ALL
// ============================================================

function exportAllData() {
    const bundle = {
        version: '103.0',
        exportedAt: new Date().toISOString(),
        mappings: loadMappings(),
        blacklist: loadBlacklist(),
        settings: getSettings(),
        aiProviders: loadAIProviders().map(p => ({ ...p, apiKey: '' })),
        aiHistory: loadAIHistory(),
        statistics: getStatistics()
    };
    saveBlobAs(
        JSON.stringify(bundle, null, 2),
        `loganonymizer-export-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json'
    );
    showNotification('Daten exportiert (API-Keys ausgenommen)', 'success');
}

function importAllData() {
    pickFile('.json', file => {
        readJsonFile(file).then(data => {
            if (!data || typeof data !== 'object') throw new Error('Ungültige Datei');
            if (!confirm('Bestehende Daten werden überschrieben. Fortfahren?')) return;
            if (data.mappings)    saveMappings(data.mappings);
            if (data.blacklist)   saveBlacklist(data.blacklist);
            if (data.settings)    localStorage.setItem(STORAGE_PREFIX + 'settings', JSON.stringify(data.settings));
            if (data.aiProviders) persistAIProviders(data.aiProviders);
            if (data.aiHistory)   persistAIHistory(data.aiHistory);
            if (data.statistics)  saveStatistics(data.statistics);
            renderAll();
            applySettingsToForm(getSettings());
            showNotification('Daten importiert', 'success');
        }).catch(err => showNotification('Import fehlgeschlagen: ' + err.message, 'error'));
    });
}

function clearAllData() {
    if (!confirm('⚠️ Wirklich ALLE Daten löschen? Dies ist nicht rückgängig zu machen!')) return;
    if (!confirm('Sind Sie ABSOLUT sicher?')) return;
    [
        STORAGE_PREFIX + 'mappings',
        STORAGE_PREFIX + 'blacklist',
        STORAGE_PREFIX + 'settings',
        STORAGE_PREFIX + 'statistics',
        STORAGE_PREFIX + 'config',
        AI_PROVIDER_STORAGE_KEY,
        AI_HISTORY_STORAGE_KEY
    ].forEach(k => localStorage.removeItem(k));
    showNotification('Alle Daten gelöscht – Seite wird neu geladen', 'success');
    setTimeout(() => location.reload(), 800);
}

// ============================================================
// INFO DIALOGS
// ============================================================

function showAbout() {
    alert([
        '🛡️ Loganonymizer v103.0',
        '',
        'Lokale Log- und Text-Anonymisierung mit optionaler KI-Anbindung.',
        'Läuft komplett im Browser; keine Server-Kommunikation außer bei',
        'explizitem KI-Provider-Aufruf.',
        '',
        '© 2026 Harald Weiss'
    ].join('\n'));
}

function showHelp() {
    alert([
        'Hilfe',
        '',
        '• Anonymisieren: Text einfügen → Anonymisieren',
        '• De-Anonymisieren: Platzhalter-Text einfügen → De-Anonymisieren',
        '• KI-Analyse: Provider konfigurieren, dann Text + Prompt senden',
        '• Blacklist: Begriffe, die immer anonymisiert werden',
        '• Zuordnungen: Übersicht aller Mappings'
    ].join('\n'));
}

function showPrivacy() {
    alert([
        'Datenschutz',
        '',
        '✅ Alle Daten lokal im Browser (localStorage)',
        '✅ Keine Telemetrie',
        '⚠️ API-Keys sind unverschlüsselt im localStorage',
        '⚠️ Bei KI-Aufrufen: Daten gehen an externen Provider'
    ].join('\n'));
}

// ============================================================
// STATS
// ============================================================

function refreshStats() {
    const mappings = loadMappings();
    const blacklist = loadBlacklist();

    setText('chars-processed',  document.getElementById('input-text')?.value.length || 0);
    setText('items-anonymized', Object.keys(mappings).length);
    setText('processing-time',  `${lastRun.durationMs}ms`);

    setText('items-found', `${lastRun.count} Elemente gefunden`);

    setText('persons-count',   lastRun.byType.person       || 0);
    setText('orgs-count',      lastRun.byType.organization || 0);
    setText('emails-count',    lastRun.byType.email        || 0);
    setText('phones-count',    lastRun.byType.phone        || 0);
    setText('ibans-count',     lastRun.byType.account      || 0);
    setText('cards-count',     lastRun.byType.creditcard   || 0);
    setText('addresses-count', lastRun.byType.location     || 0);
    setText('blacklist-count', lastRun.byType.custom       || 0);

    const allByType = countByType(mappings);
    setText('total-mappings',   Object.keys(mappings).length);
    setText('persons-mappings', allByType.person || 0);
    setText('emails-mappings',  allByType.email  || 0);
    setText('phones-mappings',  allByType.phone  || 0);
    setText('blacklist-total',  blacklist.length);
}

function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
}

// ============================================================
// ACTION DELEGATION (replaces inline onclick handlers)
// ============================================================

function wireActionDelegation() {
    document.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const param  = btn.dataset.param;
        const fn     = window[action];
        if (typeof fn === 'function') {
            e.preventDefault();
            if (param !== undefined) fn(param);
            else fn();
        }
    });
}

// ============================================================
// HELPERS
// ============================================================

function uuid() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function pickFile(accept, callback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) callback(file);
    });
    input.click();
}

function readJsonFile(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => {
            try { resolve(JSON.parse(e.target.result)); }
            catch { reject(new Error('Ungültiges JSON')); }
        };
        r.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
        r.readAsText(file);
    });
}

// ============================================================
// PROMPT IMPORT / EXPORT
// ============================================================

function loadPromptFromFile() {
    pickFile('.txt,.md,.prompt,text/plain', file => {
        const reader = new FileReader();
        reader.onload = e => {
            const ta = document.getElementById('ai-prompt');
            if (!ta) return;
            ta.value = String(e.target.result || '');
            showNotification(`Prompt aus "${file.name}" geladen`, 'success');
        };
        reader.onerror = () => showNotification('Datei konnte nicht gelesen werden', 'error');
        reader.readAsText(file);
    });
}

function savePromptToFile() {
    const text = document.getElementById('ai-prompt')?.value || '';
    if (!text.trim()) {
        showNotification('Prompt ist leer', 'warning');
        return;
    }
    const filename = `loganonymizer-prompt-${new Date().toISOString().slice(0, 10)}.txt`;
    saveBlobAs(text, filename, 'text/plain;charset=utf-8');
    showNotification('Prompt gespeichert', 'success');
}

console.log('✅ app.js loaded (clean wiring layer)');

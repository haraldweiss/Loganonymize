// SPDX-License-Identifier: AGPL-3.0-or-later
// © 2026 Harald Weiss

'use strict';

const VT_KEY_STORAGE_KEY        = STORAGE_PREFIX + 'vt_api_key';
const ABUSEIPDB_KEY_STORAGE_KEY = STORAGE_PREFIX + 'abuseipdb_api_key';

let ipPanelTimer = null;
const ipResultCache = new Map();   // ip → { vt: …, abuse: … } (in-memory, per session)

function wireIpPanelAutoTrigger() {
    const input = document.getElementById('input-text');
    if (!input) return;
    input.addEventListener('input', () => {
        if (ipPanelTimer) clearTimeout(ipPanelTimer);
        ipPanelTimer = setTimeout(refreshIpPanel, 500);
    });
}

function refreshIpPanel() {
    const panel = document.getElementById('ip-panel');
    const list  = document.getElementById('ip-list');
    if (!panel || !list) return;

    const text = document.getElementById('input-text')?.value || '';
    const ips = text.trim() ? detectIPs(text) : [];

    if (ips.length === 0) {
        panel.style.display = 'none';
        clearChildren(list);
        return;
    }

    panel.style.display = '';
    clearChildren(list);

    ips.forEach(ip => {
        const card = el('div', { class: 'ip-card', dataset: { ip } });

        const head = el('div', { class: 'ip-head' },
            el('span', { class: 'ip-addr' }, ip),
            el('span', { class: 'ip-type' }, ip.includes(':') ? 'IPv6' : 'IPv4')
        );

        const actions = el('div', { class: 'ip-actions' },
            el('button', {
                class: 'btn-secondary btn-sm',
                onclick: () => openWhois(ip),
                title: 'Whois.com im neuen Tab öffnen'
            }, '🌐 Whois'),
            el('button', {
                class: 'btn-secondary btn-sm',
                onclick: () => lookupVirusTotal(ip, card),
                title: 'VirusTotal — API wenn Key gesetzt, sonst Web'
            }, '🛡️ VirusTotal'),
            el('button', {
                class: 'btn-secondary btn-sm',
                onclick: () => lookupAbuseIPDB(ip, card),
                title: 'AbuseIPDB — API wenn Key gesetzt, sonst Web'
            }, '🚨 AbuseIPDB')
        );

        const result = el('div', { class: 'ip-result', dataset: { role: 'ip-result' } });

        // If we already have cached results from this session, restore them.
        const cached = ipResultCache.get(ip);
        if (cached) {
            if (cached.vt)    result.appendChild(renderVtResult(cached.vt));
            if (cached.abuse) result.appendChild(renderAbuseResult(cached.abuse));
        }

        card.append(head, actions, result);
        list.appendChild(card);
    });
}

function openWhois(ip) {
    window.open(`https://www.whois.com/whois/${encodeURIComponent(ip)}`, '_blank', 'noopener');
}

// ---------------- VirusTotal ----------------

async function lookupVirusTotal(ip, card) {
    const key = (localStorage.getItem(VT_KEY_STORAGE_KEY) || '').trim();
    if (!key) {
        window.open(`https://www.virustotal.com/gui/ip-address/${encodeURIComponent(ip)}`, '_blank', 'noopener');
        return;
    }

    const result = card.querySelector('[data-role="ip-result"]');
    appendOrReplace(result, 'vt', el('div', { class: 'ip-loading' }, '⏳ VirusTotal-Abfrage läuft …'));

    try {
        const res = await fetch(`https://www.virustotal.com/api/v3/ip_addresses/${encodeURIComponent(ip)}`, {
            headers: { 'x-apikey': key }
        });
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status} ${txt.slice(0, 120)}`);
        }
        const data = await res.json();
        const summary = summarizeVtResponse(ip, data);
        cacheResult(ip, 'vt', summary);
        appendOrReplace(result, 'vt', renderVtResult(summary));
    } catch (err) {
        logMessage('WARN', `VT lookup failed for ${ip}: ${err.message}`);
        appendOrReplace(result, 'vt', el('div', { class: 'ip-error' },
            '❌ VirusTotal: ' + err.message + ' ',
            el('a', { href: `https://www.virustotal.com/gui/ip-address/${encodeURIComponent(ip)}`, target: '_blank', rel: 'noopener' }, '→ Web öffnen')));
    }
}

function summarizeVtResponse(ip, data) {
    const stats = data?.data?.attributes?.last_analysis_stats || {};
    const owner = data?.data?.attributes?.as_owner || '—';
    const country = data?.data?.attributes?.country || '—';
    const reputation = data?.data?.attributes?.reputation;
    return {
        ip,
        malicious:  stats.malicious  ?? 0,
        suspicious: stats.suspicious ?? 0,
        harmless:   stats.harmless   ?? 0,
        undetected: stats.undetected ?? 0,
        owner, country, reputation
    };
}

function renderVtResult(s) {
    const verdict = s.malicious > 0 ? 'malicious'
                  : s.suspicious > 0 ? 'suspicious'
                  : 'clean';
    return el('div', { class: `ip-report ip-report-${verdict}`, dataset: { source: 'vt' } },
        el('strong', {}, '🛡️ VirusTotal '),
        el('span', { class: 'ip-stat malicious' },  `mal: ${s.malicious}`), ' · ',
        el('span', { class: 'ip-stat suspicious' }, `susp: ${s.suspicious}`), ' · ',
        el('span', { class: 'ip-stat clean' },      `clean: ${s.harmless}`), ' · ',
        el('span', {}, `${s.country} · ${s.owner}`),
        ' ',
        el('a', { href: `https://www.virustotal.com/gui/ip-address/${encodeURIComponent(s.ip)}`, target: '_blank', rel: 'noopener', class: 'ip-link' }, '↗')
    );
}

// ---------------- AbuseIPDB ----------------

async function lookupAbuseIPDB(ip, card) {
    const key = (localStorage.getItem(ABUSEIPDB_KEY_STORAGE_KEY) || '').trim();
    if (!key) {
        window.open(`https://www.abuseipdb.com/check/${encodeURIComponent(ip)}`, '_blank', 'noopener');
        return;
    }

    const result = card.querySelector('[data-role="ip-result"]');
    appendOrReplace(result, 'abuse', el('div', { class: 'ip-loading' }, '⏳ AbuseIPDB-Abfrage läuft …'));

    try {
        const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`;
        const res = await fetch(url, { headers: { 'Key': key, 'Accept': 'application/json' } });
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status} ${txt.slice(0, 120)}`);
        }
        const data = await res.json();
        const summary = summarizeAbuseResponse(ip, data);
        cacheResult(ip, 'abuse', summary);
        appendOrReplace(result, 'abuse', renderAbuseResult(summary));
    } catch (err) {
        logMessage('WARN', `AbuseIPDB lookup failed for ${ip}: ${err.message}`);
        appendOrReplace(result, 'abuse', el('div', { class: 'ip-error' },
            '❌ AbuseIPDB: ' + err.message + ' ',
            el('a', { href: `https://www.abuseipdb.com/check/${encodeURIComponent(ip)}`, target: '_blank', rel: 'noopener' }, '→ Web öffnen')));
    }
}

function summarizeAbuseResponse(ip, data) {
    const d = data?.data || {};
    return {
        ip,
        score:        d.abuseConfidenceScore ?? 0,
        country:      d.countryCode || '—',
        usageType:    d.usageType  || '—',
        totalReports: d.totalReports ?? 0,
        lastReported: d.lastReportedAt || null,
        domain:       d.domain || ''
    };
}

function renderAbuseResult(s) {
    const verdict = s.score >= 75 ? 'malicious'
                  : s.score >= 25 ? 'suspicious'
                  : 'clean';
    const last = s.lastReported ? new Date(s.lastReported).toLocaleDateString('de-DE') : '—';
    return el('div', { class: `ip-report ip-report-${verdict}`, dataset: { source: 'abuse' } },
        el('strong', {}, '🚨 AbuseIPDB '),
        el('span', { class: 'ip-stat ' + verdict }, `Score ${s.score}/100`), ' · ',
        el('span', {}, `${s.totalReports} Reports`), ' · ',
        el('span', {}, `letzter: ${last}`), ' · ',
        el('span', {}, `${s.country} · ${s.usageType}`),
        ' ',
        el('a', { href: `https://www.abuseipdb.com/check/${encodeURIComponent(s.ip)}`, target: '_blank', rel: 'noopener', class: 'ip-link' }, '↗')
    );
}

// ---------------- helpers ----------------

function cacheResult(ip, source, value) {
    const entry = ipResultCache.get(ip) || {};
    entry[source] = value;
    ipResultCache.set(ip, entry);
}

function appendOrReplace(container, source, node) {
    const existing = container.querySelector(`[data-source="${source}"], .ip-loading`);
    if (existing && existing.dataset && existing.dataset.source === source) {
        container.replaceChild(node, existing);
    } else {
        // Loading-spinner muss raus, wenn das Ergebnis da ist.
        const loaders = container.querySelectorAll('.ip-loading');
        loaders.forEach(l => l.remove());
        container.appendChild(node);
    }
}

// ============================================================
// FILE ANALYSIS — Erkennung + VirusTotal-Web-Lookup
//
// Same UX-Idee wie das IP-Panel: erkannte Dateien werden gelistet,
// per Klick lässt sich der Name auf virustotal.com nachschlagen
// (Web-Suche). Ein API-Schlüssel ist nicht nötig — VT-Filename-Lookups
// gibt's auf der freien API ohnehin nicht (nur über Hash). Wenn du
// einen Hash mitgepastet hast, kannst du den unten manuell prüfen.
// ============================================================

let filePanelTimer = null;

function wireFilePanelAutoTrigger() {
    const input = document.getElementById('input-text');
    if (!input) return;
    input.addEventListener('input', () => {
        if (filePanelTimer) clearTimeout(filePanelTimer);
        filePanelTimer = setTimeout(refreshFilePanel, 500);
    });
}

function refreshFilePanel() {
    const panel = document.getElementById('file-panel');
    const list  = document.getElementById('file-list');
    if (!panel || !list) return;

    const text = document.getElementById('input-text')?.value || '';
    const files = text.trim() ? detectFiles(text) : [];

    if (files.length === 0) {
        panel.style.display = 'none';
        clearChildren(list);
        return;
    }

    panel.style.display = '';
    clearChildren(list);

    // Sort by risk (high → low) so the dangerous ones jump out first.
    const RISK_ORDER = { high: 0, medium: 1, low: 2 };
    const enriched = files.map(name => ({ name, risk: classifyFile(name) }));
    enriched.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.name.localeCompare(b.name));

    enriched.forEach(({ name, risk }) => {
        const ext = (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
        const label = riskLabel(risk);

        const card = el('div', { class: `file-card file-risk-${risk}` });
        const head = el('div', { class: 'file-head' },
            el('span', { class: 'file-name' }, name),
            el('span', { class: `file-ext file-ext-${risk}` }, ext || '?'),
            el('span', { class: `file-risk file-risk-badge-${risk}` }, label)
        );

        const actions = el('div', { class: 'file-actions' },
            el('button', {
                class: 'btn-secondary btn-sm',
                onclick: () => openFileVtSearch(name),
                title: 'VirusTotal-Suche im neuen Tab — sucht nach dem Dateinamen'
            }, '🛡️ VirusTotal'),
            el('button', {
                class: 'btn-icon',
                title: 'Dateinamen kopieren',
                onclick: async () => {
                    try {
                        await navigator.clipboard.writeText(name);
                        showNotification('Kopiert', 'success');
                    } catch {
                        showNotification('Kopieren fehlgeschlagen', 'error');
                    }
                }
            }, '📋')
        );

        card.append(head, actions);
        list.appendChild(card);
    });
}

function riskLabel(risk) {
    return risk === 'high'   ? 'hohes Risiko (Code-Execution)'
         : risk === 'medium' ? 'mittleres Risiko (Container/Doc)'
         :                     'geringes Risiko (Daten/Text)';
}

function openFileVtSearch(filename) {
    const url = 'https://www.virustotal.com/gui/search/' + encodeURIComponent(filename);
    window.open(url, '_blank', 'noopener');
}

// ---------------- API-Key persistence ----------------

function loadIpReputationKeys() {
    const vt    = localStorage.getItem(VT_KEY_STORAGE_KEY) || '';
    const abuse = localStorage.getItem(ABUSEIPDB_KEY_STORAGE_KEY) || '';
    const vtField    = document.getElementById('vt-api-key');
    const abuseField = document.getElementById('abuseipdb-api-key');
    if (vtField)    vtField.value    = vt;
    if (abuseField) abuseField.value = abuse;
}

function saveIpReputationKeys() {
    const vt    = (document.getElementById('vt-api-key')?.value    || '').trim();
    const abuse = (document.getElementById('abuseipdb-api-key')?.value || '').trim();
    if (vt)    localStorage.setItem(VT_KEY_STORAGE_KEY, vt);
    else       localStorage.removeItem(VT_KEY_STORAGE_KEY);
    if (abuse) localStorage.setItem(ABUSEIPDB_KEY_STORAGE_KEY, abuse);
    else       localStorage.removeItem(ABUSEIPDB_KEY_STORAGE_KEY);

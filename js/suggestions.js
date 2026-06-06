// SPDX-License-Identifier: AGPL-3.0-or-later
// © 2026 Harald Weiss

'use strict';

let suggestionsAutoTimer = null;
const dismissedSuggestions = new Set();   // session-only "✕ ausblenden"

function analyzeForSuggestions() {
    const input = document.getElementById('input-text');
    if (!input) return;
    const text = input.value;
    if (!text.trim()) {
        showNotification('Bitte zuerst Text einfügen', 'warning');
        renderSuggestions([]);
        return;
    }
    const candidates = suggestBlacklistCandidates(text);
    renderSuggestions(candidates);
    if (candidates.length === 0) {
        showNotification('Keine Vorschläge gefunden — alles bereits abgedeckt.', 'info');
    } else {
        showNotification(`${candidates.length} Vorschläge gefunden`, 'success');
    }
}

/**
 * Automatic trigger: when the input text changes AND the blacklist is
 * still empty, run the analysis after a short debounce. Helps users on
 * their first run without forcing them to click anything.
 */
function wireSuggestionsAutoTrigger() {
    const input = document.getElementById('input-text');
    if (!input) return;
    input.addEventListener('input', () => {
        if (suggestionsAutoTimer) clearTimeout(suggestionsAutoTimer);
        suggestionsAutoTimer = setTimeout(() => {
            // Only nudge first-time users — keep out of the way once a
            // blacklist exists or the user has already analyzed manually.
            if (loadBlacklist().length > 0) return;
            const text = input.value;
            if (!text.trim()) { renderSuggestions([]); return; }
            renderSuggestions(suggestBlacklistCandidates(text));
        }, 1200);
    });
}

/**
 * Build a list of {term, count, reason} suggestions from the raw text.
 * Skips: regex-detected items, items already in the blacklist, very
 * short tokens, pure numbers, and tokens dismissed in this session.
 */
function suggestBlacklistCandidates(text) {
    if (!text || !text.trim()) return [];

    const blacklist = new Set(loadBlacklist());
    const detected = collectDetectedTerms(text);

    const isCovered = term => {
        if (blacklist.has(term)) return true;
        if (dismissedSuggestions.has(term)) return true;
        for (const d of detected) {
            if (d === term) return true;
            // overlap check: don't suggest fragments of already-detected items
            if (d.includes(term) || term.includes(d)) return true;
        }
        return false;
    };

    // Common-word blocklist — short German/English glue we don't want
    // to surface as "interesting" identifiers.
    const stopWords = new Set([
        // English glue
        'this','that','from','into','with','have','will','their','there','these','those','about',
        'and','the','for','was','are','but','not','all','any','can','has','had','use','one','two',
        'when','then','what','where','your','yours',
        // German glue
        'der','die','das','und','ist','ein','eine','einen','einem','einer','eines','von','vom',
        'für','mit','wir','sie','ich','dem','den','des','auf','aus','bei','nicht','auch','wie','als',
        // Generic logging/web vocabulary that is never an identifier
        'log','logs','line','user','users','info','warn','error','debug','trace','time','date',
        'status','name','message','event','source','tenant','admin','auth','session','token',
        'login','logout','signin','signout','request','response','reqid','req-id','req',
        'app','web','api','http','https','url','uri','json','xml','html','file','path',
        'true','false','null','undefined','none','yes','get','post','put','delete','patch',
        'method','handler','route','endpoint','config','default','enabled','disabled',
        'success','succeeded','failed','failure','start','started','stop','stopped','running'
    ]);

    // Tokenize while keeping host-/identifier-like chunks together.
    // Min length 4 — three-letter tokens are too noisy.
    const tokens = text.match(/[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9_.\-]{3,}/g) || [];
    const counts = new Map();
    for (const t of tokens) {
        if (stopWords.has(t.toLowerCase())) continue;
        if (isCovered(t)) continue;
        counts.set(t, (counts.get(t) || 0) + 1);
    }

    const candidates = [];
    for (const [term, count] of counts) {
        const reason = suggestionReason(term, count);
        if (!reason) continue;
        candidates.push({ term, count, reason });
    }

    // Most-frequent first, then by length (longer = more specific) descending.
    candidates.sort((a, b) => b.count - a.count || b.term.length - a.term.length);
    return candidates.slice(0, 25);
}

function collectDetectedTerms(text) {
    const all = new Set();
    const safePush = (arr) => { (arr || []).forEach(x => all.add(x)); };
    try { safePush(detectEmails(text)); } catch {}
    try { safePush(detectPhones(text)); } catch {}
    try { safePush(detectIBANs(text));  } catch {}
    try { safePush(detectCreditCards(text)); } catch {}
    try { safePush(detectPersonNames(text)); } catch {}
    try { safePush(detectAddresses(text));  } catch {}
    try { safePush(detectOrganizations(text)); } catch {}
    return all;
}

/**
 * Decide whether a token deserves to be suggested and, if so, give a
 * human-readable label for *why*. Returning null filters it out.
 */
function suggestionReason(term, count) {
    if (count >= 3) return `${count}× im Text`;
    if (count === 2) return '2× im Text';

    // Single-occurrence: only if it looks intentionally identifier-y.
    if (/^[A-ZÄÖÜ][a-zäöüß]+(?:[A-ZÄÖÜ][a-zäöüß]+)+$/.test(term)) return 'CamelCase-Bezeichner';
    if (/[A-Za-z]/.test(term) && /\d/.test(term) && term.length >= 5)  return 'Buchstaben + Zahlen';
    if (/[A-Za-z]\.[A-Za-z]/.test(term))                               return 'Hostname-Form';
    if (/^[A-ZÄÖÜ]{4,}$/.test(term))                                   return 'Großbuchstaben-Token';
    return null;
}

function renderSuggestions(candidates) {
    const list = document.getElementById('suggestions-list');
    const addAllBtn = document.getElementById('suggestions-add-all');
    if (!list) return;
    clearChildren(list);

    if (candidates.length === 0) {
        list.appendChild(emptyMessage('Noch keine Analyse durchgeführt — links Text einfügen oder „Analysieren" klicken.'));
        if (addAllBtn) addAllBtn.style.display = 'none';
        return;
    }

    if (addAllBtn) addAllBtn.style.display = '';

    candidates.forEach(c => {
        const item = el('div', { class: 'suggestion-item' },
            el('div', { class: 'suggestion-meta' },
                el('span', { class: 'suggestion-term' }, c.term),
                el('span', { class: 'suggestion-reason' }, c.reason)
            ),
            el('div', { class: 'suggestion-actions' },
                el('button', {
                    class: 'btn-primary btn-sm',
                    onclick: () => addSuggestionToBlacklist(c.term),
                    title: 'In die Blacklist übernehmen'
                }, '+ Blacklist'),
                el('button', {
                    class: 'btn-icon',
                    onclick: () => dismissSuggestion(c.term),
                    title: 'Vorschlag ausblenden (nur in dieser Sitzung)'
                }, '✕')
            )
        );
        list.appendChild(item);
    });
}

function addSuggestionToBlacklist(term) {
    if (!term) return;
    const list = loadBlacklist();
    if (!list.includes(term)) {
        list.push(term);
        saveBlacklist(list);
        renderBlacklist();
        refreshStats();
    }
    showNotification(`„${term}" zur Blacklist hinzugefügt`, 'success');
    // Re-analyse so the just-added term and any overlap drop out.
    const input = document.getElementById('input-text');
    if (input?.value.trim()) {
        renderSuggestions(suggestBlacklistCandidates(input.value));
    } else {
        renderSuggestions([]);
    }
}

function addAllSuggestionsToBlacklist() {
    const input = document.getElementById('input-text');
    if (!input?.value.trim()) return;
    const candidates = suggestBlacklistCandidates(input.value);
    if (candidates.length === 0) return;

    const list = loadBlacklist();
    let added = 0;
    for (const c of candidates) {
        if (!list.includes(c.term)) { list.push(c.term); added++; }
    }
    saveBlacklist(list);
    renderBlacklist();
    refreshStats();
    renderSuggestions(suggestBlacklistCandidates(input.value));
    showNotification(`${added} Vorschläge in die Blacklist übernommen`, 'success');
}

function dismissSuggestion(term) {
    dismissedSuggestions.add(term);
    const input = document.getElementById('input-text');
    if (input?.value.trim()) {
        renderSuggestions(suggestBlacklistCandidates(input.value));
    }
}

// ============================================================
// IP ANALYSIS — whois (web), VirusTotal (API/web), AbuseIPDB (API/web)
//
// We work on the *original* input so the user can examine IPs before
// (or independently of) any anonymization run. Web lookups always work,
// API lookups kick in automatically when an API key is configured in
// Einstellungen.
// ============================================================

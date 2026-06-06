// SPDX-License-Identifier: AGPL-3.0-or-later
// © 2026 Harald Weiss

'use strict';

function loadAIHistory() {
    try {
        const raw = localStorage.getItem(AI_HISTORY_STORAGE_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

function persistAIHistory(list) {
    localStorage.setItem(AI_HISTORY_STORAGE_KEY, JSON.stringify(list));
}

function saveAIHistoryEntry(entry) {
    const item = { id: uuid(), ...entry };
    const list = [item, ...loadAIHistory()].slice(0, AI_HISTORY_MAX_ENTRIES);
    persistAIHistory(list);
}

function deleteAIHistoryEntry(id) {
    persistAIHistory(loadAIHistory().filter(e => e.id !== id));
    renderAIHistory();
    showNotification('Eintrag gelöscht', 'success');
}

function clearAIHistory() {
    const list = loadAIHistory();
    if (list.length === 0) {
        showNotification('Verlauf ist bereits leer', 'info');
        return;
    }
    if (!confirm(`Wirklich alle ${list.length} Verlaufseinträge löschen?`)) return;
    persistAIHistory([]);
    renderAIHistory();
    showNotification('Verlauf geleert', 'success');
}

function exportAIHistory() {
    const list = loadAIHistory();
    if (list.length === 0) {
        showNotification('Verlauf ist leer', 'warning');
        return;
    }
    const filename = `loganonymizer-ai-history-${new Date().toISOString().slice(0, 10)}.json`;
    saveBlobAs(JSON.stringify(list, null, 2), filename, 'application/json');
    showNotification(`${list.length} Einträge exportiert`, 'success');
}

function loadFromAIHistory(id) {
    const entry = loadAIHistory().find(e => e.id === id);
    if (!entry) return;

    const setField = (el, val) => { if (el) el.value = val; };
    setField(document.getElementById('ai-prompt'),     entry.prompt || '');
    setField(document.getElementById('ai-input-text'), entry.inputText || '');

    // Try to restore provider + model selections if those still exist.
    const providerSel = document.getElementById('ai-provider');
    if (providerSel && loadAIProviders().some(p => p.id === entry.providerId)) {
        providerSel.value = entry.providerId;
        providerSel.dispatchEvent(new Event('change'));
        // updateModelDropdown ran synchronously above; set the model now.
        setTimeout(() => setField(document.getElementById('ai-model'), entry.model || ''), 50);
    }

    // Re-display the response so the user can copy from it again.
    const responseBox = document.getElementById('ai-response-text');
    if (responseBox) {
        clearChildren(responseBox);
        responseBox.textContent = entry.response || '';
    }

    // Switch to AI-Analyse tab if we're not already there.
    const analyzeBtn = document.querySelector('.tab-button[data-tab="ai-analysis"]');
    if (analyzeBtn) analyzeBtn.click();

    showNotification('Eintrag in Formular geladen', 'success');
}

function renderAIHistory() {
    const container = document.getElementById('ai-history-list');
    if (!container) return;
    clearChildren(container);

    const list = loadAIHistory();
    if (list.length === 0) {
        container.appendChild(emptyMessage('Noch keine Anfragen gespeichert'));
        return;
    }

    list.forEach(entry => {
        const meta = el('div', { class: 'history-meta' },
            el('span', { class: 'history-time' }, formatHistoryDate(entry.timestamp)),
            el('span', { class: 'history-provider' },
                `${entry.providerName || entry.providerType || '?'} · ${entry.model || '?'}`
            )
        );

        const promptPreview = (entry.prompt || '').trim() || '(kein Prompt)';
        const responsePreview = (entry.response || '').trim();

        const previews = el('div', { class: 'history-previews' },
            el('div', { class: 'history-line' },
                el('span', { class: 'history-label' }, 'Prompt: '),
                el('span', { class: 'history-text' }, truncate(promptPreview, 140))
            )
        );
        if (responsePreview) {
            previews.appendChild(
                el('div', { class: 'history-line' },
                    el('span', { class: 'history-label' }, 'Antwort: '),
                    el('span', { class: 'history-text' }, truncate(responsePreview, 200))
                )
            );
        }

        const actions = el('div', { class: 'history-actions' },
            el('button', {
                class: 'btn-secondary btn-sm',
                onclick: () => loadFromAIHistory(entry.id),
                title: 'Eintrag in Formular laden'
            }, '📥 Laden'),
            el('button', {
                class: 'btn-icon',
                onclick: () => deleteAIHistoryEntry(entry.id),
                title: 'Eintrag löschen'
            }, '🗑️')
        );

        container.appendChild(el('div', { class: 'history-item' }, meta, previews, actions));
    });
}

function formatHistoryDate(ts) {
    const d = new Date(ts);
    return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

function truncate(s, n) {

// SPDX-License-Identifier: AGPL-3.0-or-later
// © 2026 Harald Weiss

'use strict';

function addToBlacklist() {
    const input = document.getElementById('blacklist-input');
    if (!input) return;
    const word = input.value.trim();
    if (!word) {
        showNotification('Bitte Begriff eingeben', 'warning');
        return;
    }
    const list = loadBlacklist();
    if (list.includes(word)) {
        showNotification('Bereits in der Blacklist', 'warning');
        return;
    }
    list.push(word);
    saveBlacklist(list);
    input.value = '';
    renderBlacklist();
    refreshStats();
    showNotification(`"${word}" hinzugefügt`, 'success');
}

function removeFromBlacklistByIndex(index) {
    const list = loadBlacklist();
    if (index < 0 || index >= list.length) return;
    if (!confirm(`"${list[index]}" entfernen?`)) return;
    list.splice(index, 1);
    saveBlacklist(list);
    renderBlacklist();
    refreshStats();
    showNotification('Entfernt', 'success');
}

function clearBlacklist() {
    if (!confirm('Komplette Blacklist löschen?')) return;
    saveBlacklist([]);
    renderBlacklist();
    refreshStats();
    showNotification('Blacklist geleert', 'success');
}

function exportBlacklist() {
    saveBlobAs(
        JSON.stringify(loadBlacklist(), null, 2),
        `loganonymizer-blacklist-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json'
    );
    showNotification('Blacklist exportiert', 'success');
}

function importBlacklist() {
    pickFile('.json', file => {
        readJsonFile(file).then(data => {
            if (!Array.isArray(data)) throw new Error('Erwarte JSON-Array');
            const cleaned = data.filter(x => typeof x === 'string' && x.trim());
            const merged = Array.from(new Set([...loadBlacklist(), ...cleaned]));
            saveBlacklist(merged);
            renderBlacklist();
            refreshStats();
            showNotification(`${cleaned.length} Begriffe importiert`, 'success');
        }).catch(err => showNotification('Import fehlgeschlagen: ' + err.message, 'error'));
    });
}

function renderBlacklist() {
    const container = document.getElementById('blacklist-items');
    const totalEl = document.getElementById('blacklist-total');
    if (!container) return;
    const list = loadBlacklist();
    if (totalEl) totalEl.textContent = list.length;

    clearChildren(container);
    if (list.length === 0) {
        container.appendChild(emptyMessage('Keine Einträge vorhanden'));
        return;
    }

    list.forEach((word, idx) => {
        const item = el('div', { class: 'blacklist-item' },
            el('span', { class: 'blacklist-word' }, word),
            el('button', {
                class: 'btn-icon',
                title: 'Entfernen',
                onclick: () => removeFromBlacklistByIndex(idx)
            }, '❌')
        );
        container.appendChild(item);
    });
}

// ============================================================
// MAPPINGS
// ============================================================

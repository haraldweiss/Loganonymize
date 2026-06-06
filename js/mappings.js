// SPDX-License-Identifier: AGPL-3.0-or-later
// © 2026 Harald Weiss

'use strict';

function clearMappings() {
    if (!confirm('Alle Zuordnungen löschen? Bestehende anonymisierte Texte können danach nicht mehr de-anonymisiert werden.')) return;
    saveMappings({});
    renderMappings();
    refreshStats();
    showNotification('Zuordnungen gelöscht', 'success');
}

function exportMappings() {
    saveBlobAs(
        JSON.stringify(loadMappings(), null, 2),
        `loganonymizer-mappings-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json'
    );
    showNotification('Zuordnungen exportiert', 'success');
}

function importMappings() {
    pickFile('.json', file => {
        readJsonFile(file).then(data => {
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Erwarte JSON-Objekt');
            const merged = { ...loadMappings(), ...data };
            saveMappings(merged);
            renderMappings();
            refreshStats();
            showNotification(`${Object.keys(data).length} Zuordnungen importiert`, 'success');
        }).catch(err => showNotification('Import fehlgeschlagen: ' + err.message, 'error'));
    });
}

function wireMappingsSearch() {
    const search = document.getElementById('mappings-search');
    if (search) search.addEventListener('input', () => renderMappings());
}

function renderMappings() {
    const tbody = document.getElementById('mappings-table-body');
    if (!tbody) return;
    const mappings = loadMappings();
    const entries = Object.entries(mappings);
    const search = (document.getElementById('mappings-search')?.value || '').toLowerCase();
    const filtered = search
        ? entries.filter(([k, v]) => k.toLowerCase().includes(search) || String(v).toLowerCase().includes(search))
        : entries;

    clearChildren(tbody);

    if (filtered.length === 0) {
        const tr = el('tr', {},
            el('td', { colspan: '5', class: 'text-center text-muted' }, 'Keine Zuordnungen vorhanden')
        );
        tbody.appendChild(tr);
        return;
    }

    filtered.forEach(([placeholder, original]) => {
        const type = placeholder.split('_')[0];
        const tr = el('tr', {},
            el('td', {}, el('span', { class: 'badge bg-info' }, type)),
            el('td', {}, el('code', {}, placeholder)),
            el('td', {}, String(original)),
            el('td', {}, '—'),
            el('td', {},
                el('button', {
                    class: 'btn-icon',
                    title: 'Löschen',
                    onclick: () => {
                        const m = loadMappings();
                        delete m[placeholder];
                        saveMappings(m);
                        renderMappings();
                        refreshStats();
                        showNotification('Zuordnung gelöscht', 'success');
                    }
                }, '🗑️')
            )
        );
        tbody.appendChild(tr);
    });
}

// ============================================================
// SETTINGS
// ============================================================

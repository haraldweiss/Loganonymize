// SPDX-License-Identifier: AGPL-3.0-or-later
// © 2026 Harald Weiss

/**
 * Loganonymizer - Utilities
 *
 * Storage, settings, statistics, notifications, basic helpers.
 * `logMessage` MUST be defined first (used by everything).
 */

'use strict';

// ============================================================
// LOGGING
// ============================================================

function logMessage(level, message) {
    const entry = `[${new Date().toISOString()}] [${level}] ${message}`;
    switch (level) {
        case 'ERROR': console.error(entry); break;
        case 'WARN':  console.warn(entry);  break;
        case 'DEBUG': if (window.DEBUG_MODE) console.debug(entry); break;
        default:      console.log(entry);
    }
}

const STORAGE_PREFIX = 'loganonymizer_';

// ============================================================
// MAPPINGS
// ============================================================

function loadMappings() {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + 'mappings');
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        logMessage('ERROR', 'loadMappings failed: ' + e.message);
        return {};
    }
}

function saveMappings(mappings) {
    try {
        localStorage.setItem(STORAGE_PREFIX + 'mappings', JSON.stringify(mappings));
        return true;
    } catch (e) {
        logMessage('ERROR', 'saveMappings failed: ' + e.message);
        return false;
    }
}

// ============================================================
// BLACKLIST
// ============================================================

function loadBlacklist() {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + 'blacklist');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        logMessage('ERROR', 'loadBlacklist failed: ' + e.message);
        return [];
    }
}

function saveBlacklist(blacklist) {
    try {
        if (!Array.isArray(blacklist)) throw new Error('Blacklist must be an array');
        const cleaned = blacklist.filter(x => typeof x === 'string' && x.trim() !== '');
        localStorage.setItem(STORAGE_PREFIX + 'blacklist', JSON.stringify(cleaned));
        return true;
    } catch (e) {
        logMessage('ERROR', 'saveBlacklist failed: ' + e.message);
        return false;
    }
}

// ============================================================
// SETTINGS
// ============================================================

function getDefaultSettings() {
    return {
        debugMode: false,
        detectPersons: true,
        detectOrganizations: true,
        detectLocations: true,
        detectEmails: true,
        detectPhones: true,
        detectIBAN: true,
        detectCreditCards: true,
        detectAddresses: true,
        detectIPs: false,           // off by default — IPs are usually
                                    // valuable to *examine* (whois/VT) before
                                    // anonymizing, so the panel handles them
                                    // explicitly. Toggle on if you want them
                                    // anonymized along with everything else.
        detectFiles: false,         // off by default — same reasoning as IPs:
                                    // file references are usually first
                                    // *examined* (VT-Lookup), then optionally
                                    // anonymized.
        preserveFormatting: true,
        caseSensitive: false,
        autoSave: true,
        // Per-call hard cap on AI output length. Mostly a safety net against
        // models that loop or refuse to stop. Same value is mapped to each
        // provider's native field (OpenAI/Anthropic max_tokens, Ollama
        // options.num_predict). Range 64–8192.
        aiMaxTokens: 1500,
        lastUpdated: new Date().toISOString()
    };
}

function getSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + 'settings');
        if (!raw) return getDefaultSettings();
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return getDefaultSettings();
        return { ...getDefaultSettings(), ...parsed };
    } catch (e) {
        logMessage('ERROR', 'getSettings failed: ' + e.message);
        return getDefaultSettings();
    }
}

function applySettingsToForm(settings) {
    const map = {
        'debug-mode':           settings.debugMode,
        'detect-persons':       settings.detectPersons,
        'detect-organizations': settings.detectOrganizations,
        'detect-locations':     settings.detectLocations,
        'detect-emails':        settings.detectEmails,
        'detect-phones':        settings.detectPhones,
        'detect-iban':          settings.detectIBAN,
        'detect-creditcards':   settings.detectCreditCards,
        'detect-addresses':     settings.detectAddresses,
        'detect-ips':           settings.detectIPs,
        'detect-files':         settings.detectFiles,
        'preserve-formatting':  settings.preserveFormatting,
        'case-sensitive':       settings.caseSensitive
    };
    for (const [id, val] of Object.entries(map)) {
        const node = document.getElementById(id);
        if (node && 'checked' in node) node.checked = !!val;
    }
    // Non-checkbox fields
    const maxTokens = document.getElementById('ai-max-tokens');
    if (maxTokens) maxTokens.value = settings.aiMaxTokens ?? 1500;
}

// ============================================================
// STATISTICS
// ============================================================

function getStatistics() {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + 'statistics');
        if (raw) return JSON.parse(raw);
    } catch (e) {
        logMessage('ERROR', 'getStatistics failed: ' + e.message);
    }
    return { anonymizations: 0, deanonymizations: 0, mappings: 0, lastActivity: null };
}

function saveStatistics(stats) {
    try {
        localStorage.setItem(STORAGE_PREFIX + 'statistics', JSON.stringify(stats));
        return true;
    } catch (e) {
        logMessage('ERROR', 'saveStatistics failed: ' + e.message);
        return false;
    }
}

function updateStatistics(action, count = 1) {
    const stats = getStatistics();
    if (action === 'anonymizations' || action === 'deanonymizations' || action === 'mappings') {
        stats[action] = (stats[action] || 0) + count;
    }
    stats.lastActivity = new Date().toISOString();
    saveStatistics(stats);
}

// ============================================================
// NOTIFICATIONS
// ============================================================

function showNotification(message, type = 'info') {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }

    const note = document.createElement('div');
    note.className = `notification notification-${type}`;
    note.textContent = message;
    container.appendChild(note);
    logMessage('DEBUG', `Notification (${type}): ${message}`);

    setTimeout(() => {
        note.classList.add('fade-out');
        setTimeout(() => note.remove(), 300);
    }, 3500);
}

// ============================================================
// VALIDATION
// ============================================================

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUrl(url) {
    try { new URL(url); return true; } catch { return false; }
}

// ============================================================
// TEXT
// ============================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(date) {
    return new Date(date).toLocaleString('de-DE', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
}

console.log('✅ utils.js loaded');

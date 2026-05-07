// SPDX-License-Identifier: AGPL-3.0-or-later
// © 2026 Harald Weiss

/**
 * Loganonymizer — Anonymization Engine
 * Pattern-based detection of PII in logs and free text.
 */

/**
 * Detect person names in text
 * @param {string} text - Text to analyze
 * @returns {Array} Array of detected names
 */
function detectPersonNames(text) {
    const names = [];
    
    // Pattern: Capitalize words (2-4 words, each starting with uppercase)
    // Example: "Max Mustermann", "Dr. Sarah Müller"
    // Names must stay on a single line — \s would let a match span newlines
    // and stitch together unrelated capitalized words.
    const namePattern = /\b([A-ZÄÖÜ][a-zäöüß]+(?:[ \t]+(?:van|von|der|de|del|al|bin|ibn))?[ \t]+[A-ZÄÖÜ][a-zäöüß]+(?:[ \t]+[A-ZÄÖÜ][a-zäöüß]+)?)\b/g;
    
    let match;
    while ((match = namePattern.exec(text)) !== null) {
        const name = match[1].trim();
        
        // Filter out common false positives
        const blacklistedWords = ['Dear Sir', 'Sehr Geehrte', 'Mit Freundlichen'];
        const isBlacklisted = blacklistedWords.some(word => name.includes(word));
        
        if (!isBlacklisted && name.length > 3) {
            names.push(name);
        }
    }
    
    // Also detect salutations with names
    // Example: "Herr Müller", "Frau Schmidt", "Mr. Johnson"
    const salutationPattern = /\b(Herr|Frau|Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)[ \t]+([A-ZÄÖÜ][a-zäöüß]+(?:[ \t]+[A-ZÄÖÜ][a-zäöüß]+)?)/g;
    
    while ((match = salutationPattern.exec(text)) !== null) {
        const fullName = match[0].trim();
        names.push(fullName);
    }
    
    return [...new Set(names)]; // Remove duplicates
}

/**
 * Detect email addresses
 * @param {string} text - Text to analyze
 * @returns {Array} Array of detected emails
 */
function detectEmails(text) {
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    return text.match(emailPattern) || [];
}

/**
 * Detect phone numbers
 * @param {string} text - Text to analyze
 * @returns {Array} Array of detected phone numbers
 */
function detectPhones(text) {
    // Tightened to reduce false positives (years, IBAN fragments, etc.).
    // International:  +49 30 12345678  /  +49-30-12345678  /  +49(30)12345678
    // National (DE):  030 12345678  /  (030) 12345-678
    const intlPattern    = /(?<![\d-])\+\d{1,3}[\s\-./]?\(?\d{1,5}\)?[\s\-./]?\d{3,4}[\s\-./]?\d{2,8}(?![\d])/g;
    const nationalPattern = /(?<![\d-])0\d{2,5}[\s\-./]\d{3,4}[\s\-./]?\d{0,8}(?![\d])/g;

    const matches = [
        ...(text.match(intlPattern) || []),
        ...(text.match(nationalPattern) || [])
    ];

    // Require 7–15 actual digits to qualify as a phone number.
    return [...new Set(matches.filter(m => {
        const digits = m.replace(/\D/g, '').length;
        return digits >= 7 && digits <= 15;
    }))];
}

/**
 * Detect IBAN
 * @param {string} text - Text to analyze
 * @returns {Array} Array of detected IBANs
 */
function detectIBANs(text) {
    const ibanPattern = /\b[A-Z]{2}\d{2}\s?(?:\d{4}\s?){3,7}\d{1,4}\b/g;
    const candidates = text.match(ibanPattern) || [];
    return [...new Set(candidates.filter(isValidIBAN))];
}

/**
 * IBAN Mod-97 checksum check.
 * https://en.wikipedia.org/wiki/International_Bank_Account_Number#Validating_the_IBAN
 */
function isValidIBAN(iban) {
    const compact = iban.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return false;
    const rearranged = compact.slice(4) + compact.slice(0, 4);
    const numeric = rearranged.replace(/[A-Z]/g, c => (c.charCodeAt(0) - 55).toString());
    let remainder = 0;
    for (const ch of numeric) {
        remainder = (remainder * 10 + (ch.charCodeAt(0) - 48)) % 97;
    }
    return remainder === 1;
}

/**
 * Detect credit card numbers
 * @param {string} text - Text to analyze
 * @returns {Array} Array of detected credit card numbers
 */
function detectCreditCards(text) {
    const ccPattern = /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{3,4}\b/g;
    const candidates = text.match(ccPattern) || [];
    return [...new Set(candidates.filter(isValidLuhn))];
}

/**
 * Luhn algorithm check — filters out random 16-digit strings.
 * https://en.wikipedia.org/wiki/Luhn_algorithm
 */
function isValidLuhn(value) {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    let alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let n = digits.charCodeAt(i) - 48;
        if (alt) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
        alt = !alt;
    }
    return sum % 10 === 0;
}

/**
 * Detect addresses
 * @param {string} text - Text to analyze
 * @returns {Array} Array of detected addresses
 */
function detectAddresses(text) {
    const addresses = [];
    
    // German street addresses: "Hauptstraße 123", "Berliner Str. 45a"
    const streetPattern = /\b([A-ZÄÖÜ][a-zäöüß]+(?:straße|str\.|strasse|weg|platz|allee|gasse))\s+\d{1,4}[a-z]?\b/gi;
    const streetMatches = text.match(streetPattern) || [];
    addresses.push(...streetMatches);
    
    // ZIP code + city: "10117 Berlin", "80331 München"
    const zipCityPattern = /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+\b/g;
    const zipCityMatches = text.match(zipCityPattern) || [];
    addresses.push(...zipCityMatches);
    
    return [...new Set(addresses)];
}

/**
 * Detect IPv4 addresses (with strict 0–255 octet validation) and the
 * common IPv6 forms (full + a few compressed variants). Used both by
 * the anonymization pipeline and by the IP-analysis panel.
 *
 * @param {string} text - Text to analyze
 * @returns {Array} Array of detected IP-address strings (deduplicated)
 */
function detectIPs(text) {
    const ipv4 = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;
    // IPv6: full form + the common compressed forms.
    //   Order matters — JS regex picks the FIRST matching alternative,
    //   so longer/more-specific patterns must come first, otherwise
    //   "fe80::1234" would match as "fe80::" only.
    //   1) full 8-group form        2) middle "::" with tail
    //   3) leading "::"             4) trailing "::"
    const ipv6 = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,6}(?::[0-9a-fA-F]{1,4}){1,6}\b|::[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:/g;

    const found = new Set();
    (text.match(ipv4) || []).forEach(ip => found.add(ip));
    (text.match(ipv6) || []).forEach(ip => {
        // Filter common false positives: timestamps like "12:34:56" are
        // not IPv6; require at least one hex char that isn't a digit, OR
        // the literal "::" sequence.
        if (ip.includes('::') || /[a-fA-F]/.test(ip)) found.add(ip);
    });
    return [...found];
}

// File-extension whitelist, grouped by typical risk profile in a SOC
// context. Bewusst KEINE TLDs (com, org, net, io, app, dev, info, …)
// damit "example.com" und Co. nicht als Datei durchrutschen.
const FILE_EXT_RISK = {
    high: [   // Code-Execution-Vehikel
        'exe','dll','bat','cmd','ps1','psm1','vbs','vbe','js','jse','wsf','wsh',
        'msi','msp','scr','hta','jar','sh','bash','zsh','py','rb','pl','lua','ahk',
        'apk','elf','o','so','dylib'
    ],
    medium: [ // Container / Office mit Macro-Risiko
        'zip','7z','rar','tar','gz','tgz','bz2','xz','iso','img','dmg','vhd','vmdk',
        'doc','docm','docx','dot','dotm','xls','xlsm','xlsx','xlt','xltm','xlsb',
        'ppt','pptm','pptx','rtf','pdf','one','onetoc2',
        'lnk','url','msg','eml','mbox','pst','ost'
    ],
    low: [    // Daten / Text / Medien — meist harmlos
        'txt','log','csv','tsv','json','jsonl','ndjson','xml','yaml','yml','toml',
        'html','htm','md','markdown',
        'png','jpg','jpeg','gif','svg','webp','bmp','ico','tiff',
        'mp3','mp4','wav','m4a','mov','avi','mkv','webm','ogg','flac',
        'pcap','pcapng','tmp','bak','old','sqlite','db'
    ]
};

const ALL_FILE_EXTS = [
    ...FILE_EXT_RISK.high,
    ...FILE_EXT_RISK.medium,
    ...FILE_EXT_RISK.low
];

const FILE_EXT_PATTERN = new RegExp(
    // word boundary, name body (allows dots so we capture "archive.tar.gz"),
    // dot, one of our whitelisted extensions, word boundary.
    `\\b[\\w][\\w.\\-]*\\.(?:${ALL_FILE_EXTS.join('|')})\\b`,
    'gi'
);

/**
 * Look up the risk classification ("high"/"medium"/"low") for a file
 * by its trailing extension. Returns 'low' if nothing matches.
 */
function classifyFile(filename) {
    const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (!m) return 'low';
    const ext = m[1];
    if (FILE_EXT_RISK.high.includes(ext))   return 'high';
    if (FILE_EXT_RISK.medium.includes(ext)) return 'medium';
    return 'low';
}

/**
 * Detect file references (name + whitelisted extension). Returns
 * deduplicated, original-case strings — only the matching part of the
 * input, so paths like "/var/log/syslog.log" come back as "syslog.log".
 *
 * @param {string} text
 * @returns {Array<string>}
 */
function detectFiles(text) {
    const matches = text.match(FILE_EXT_PATTERN) || [];
    return [...new Set(matches)];
}

/**
 * Detect organizations
 * @param {string} text - Text to analyze
 * @returns {Array} Array of detected organizations
 */
function detectOrganizations(text) {
    const orgs = [];
    
    // Companies with legal forms: "Contabo GmbH", "Microsoft AG", "Amazon Inc."
    const legalPattern = /\b([A-ZÄÖÜ][A-Za-zäöüß]+(?:\s+[A-ZÄÖÜ][A-Za-zäöüß]+)*)\s+(GmbH|AG|SE|e\.V\.|KG|OHG|Inc\.|Corp\.|Ltd\.|LLC)\b/g;
    
    let match;
    while ((match = legalPattern.exec(text)) !== null) {
        orgs.push(match[0]);
    }
    
    return [...new Set(orgs)];
}

/**
 * Anonymize text based on configured patterns and blacklist
 * @param {string} text - Text to anonymize
 * @returns {Object} Result with anonymized text and mappings
 */
function runAnonymization(text) {
    try {
        logMessage('INFO', 'Starting anonymization...');
        
        if (!text || typeof text !== 'string') {
            throw new Error('Invalid input text');
        }

        // Get current settings and mappings
        const settings = getSettings();
        const existingMappings = loadMappings();
        const blacklist = loadBlacklist();
        
        let result = text;
        let newMappings = {};
        let updatedMappings = {...existingMappings};

        // Use highest existing counter per type so we never collide with
        // a placeholder that was created earlier (and possibly deleted again).
        const types = ['person', 'organization', 'location', 'email', 'phone', 'account', 'creditcard', 'ip', 'file', 'custom'];
        const counters = {};
        for (const t of types) {
            const prefix = t.toUpperCase() + '_';
            counters[t] = Object.keys(existingMappings)
                .filter(k => k.startsWith(prefix))
                .map(k => parseInt(k.slice(prefix.length), 10))
                .filter(n => Number.isFinite(n))
                .reduce((max, n) => Math.max(max, n), 0);
        }

        // Reverse lookup: original value → existing placeholder.
        // Built once instead of O(N) scan per replacement.
        const reverseLookup = new Map();
        for (const [placeholder, value] of Object.entries(existingMappings)) {
            reverseLookup.set(value, placeholder);
        }

        function replaceValue(originalValue, type) {
            if (!originalValue || originalValue.trim() === '') return;

            const existingPlaceholder = reverseLookup.get(originalValue);
            if (existingPlaceholder) {
                logMessage('DEBUG', `Reusing existing mapping: ${originalValue} → ${existingPlaceholder}`);
                result = result.split(originalValue).join(existingPlaceholder);
                return;
            }

            counters[type]++;
            const placeholder = `${type.toUpperCase()}_${counters[type]}`;

            updatedMappings[placeholder] = originalValue;
            newMappings[placeholder] = originalValue;
            reverseLookup.set(originalValue, placeholder);

            logMessage('DEBUG', `Created new mapping: ${originalValue} → ${placeholder}`);
            result = result.split(originalValue).join(placeholder);
        }

        // ========================================
        // STEP 1: Process BLACKLIST (MUST anonymize)
        // ========================================
        if (blacklist && blacklist.length > 0) {
            logMessage('INFO', `Processing ${blacklist.length} blacklist entries...`);
            
            // Sort by length (longest first) to avoid partial replacements
            const sortedBlacklist = [...blacklist].sort((a, b) => b.length - a.length);
            
            sortedBlacklist.forEach(term => {
                if (result.includes(term)) {
                    replaceValue(term, 'custom');
                }
            });
        }

        // ========================================
        // STEP 2: Pattern-based detection
        // ========================================
        
        // Order matters: structured/validated patterns (IBAN, CC, email, IP)
        // run first so they claim long digit sequences before the broader
        // phone heuristic gets a chance to misread them.
        if (settings.detectIPs) {
            logMessage('DEBUG', 'Detecting IPs...');
            const ips = detectIPs(result);
            ips.forEach(ip => replaceValue(ip, 'ip'));
        }

        if (settings.detectFiles) {
            logMessage('DEBUG', 'Detecting files...');
            const files = detectFiles(result);
            files.forEach(f => replaceValue(f, 'file'));
        }

        if (settings.detectIBAN) {
            logMessage('DEBUG', 'Detecting IBANs...');
            const ibans = detectIBANs(result);
            ibans.forEach(iban => replaceValue(iban, 'account'));
        }

        if (settings.detectCreditCards) {
            logMessage('DEBUG', 'Detecting credit cards...');
            const creditCards = detectCreditCards(result);
            creditCards.forEach(cc => replaceValue(cc, 'creditcard'));
        }

        if (settings.detectEmails) {
            logMessage('DEBUG', 'Detecting emails...');
            const emails = detectEmails(result);
            emails.forEach(email => replaceValue(email, 'email'));
        }

        // Addresses BEFORE persons: "10117 Berlin" must be claimed as an
        // address before the person heuristic could grab "Berlin" plus a
        // following capitalized word.
        if (settings.detectAddresses) {
            logMessage('DEBUG', 'Detecting addresses...');
            const addresses = detectAddresses(result);
            addresses.forEach(addr => replaceValue(addr, 'location'));
        }

        // Organizations before persons: "Acme GmbH" should not be misread
        // as just the personal name "Acme".
        if (settings.detectOrganizations) {
            logMessage('DEBUG', 'Detecting organizations...');
            const orgs = detectOrganizations(result);
            orgs.forEach(org => replaceValue(org, 'organization'));
        }

        if (settings.detectPersons) {
            logMessage('DEBUG', 'Detecting person names...');
            const names = detectPersonNames(result);
            names.forEach(name => replaceValue(name, 'person'));
        }

        // Phones LAST: their pattern is intentionally permissive, so we run
        // it only on text that's already had its structured numbers consumed.
        if (settings.detectPhones) {
            logMessage('DEBUG', 'Detecting phone numbers...');
            const phones = detectPhones(result);
            phones.forEach(phone => replaceValue(phone, 'phone'));
        }

        // Save updated mappings
        saveMappings(updatedMappings);
        
        const newMappingCount = Object.keys(newMappings).length;
        logMessage('INFO', `Anonymization completed: ${newMappingCount} new mappings created`);
        
        // Update statistics
        updateStatistics('anonymizations', 1);
        updateStatistics('mappings', newMappingCount);
        
        return {
            success: true,
            anonymized: result,
            newMappings: newMappings,
            totalMappings: Object.keys(updatedMappings).length
        };
        
    } catch (error) {
        logMessage('ERROR', 'Anonymization failed: ' + error.message);
        throw error;
    }
}

/**
 * De-anonymize text using stored mappings
 * @param {string} text - Anonymized text
 * @returns {Object} Result with de-anonymized text
 */
function runDeanonymization(text) {
    try {
        logMessage('INFO', 'Starting de-anonymization...');
        
        if (!text || typeof text !== 'string') {
            throw new Error('Invalid input text');
        }

        const mappings = loadMappings();
        let result = text;
        let replacements = 0;

        // Replace all placeholders with original values
        Object.keys(mappings).forEach(placeholder => {
            const originalValue = mappings[placeholder];
            if (result.includes(placeholder)) {
                result = result.split(placeholder).join(originalValue);
                replacements++;
                logMessage('DEBUG', `Replaced: ${placeholder} → ${originalValue}`);
            }
        });

        logMessage('INFO', `De-anonymization completed: ${replacements} replacements made`);
        
        updateStatistics('deanonymizations', 1);
        
        return {
            success: true,
            deanonymized: result,
            replacements: replacements
        };
        
    } catch (error) {
        logMessage('ERROR', 'De-anonymization failed: ' + error.message);
        throw error;
    }
}

logMessage('INFO', 'anonymizer.js loaded');
console.log('✅ anonymizer.js loaded');

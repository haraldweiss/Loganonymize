/**
 * Loganonymizer — Legacy config helpers (kept for compatibility,
 * not used by the modern settings flow in app.js / utils.js).
 */

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
    // Detection settings
    detectEmails: true,
    detectPhones: true,
    detectNames: true,
    detectLocations: true,
    detectOrganizations: true,
    detectDates: true,
    
    // AI settings
    aiProvider: 'openai',
    openaiApiKey: '',
    openaiModel: 'gpt-4',
    anthropicApiKey: '',
    anthropicModel: 'claude-3-opus-20240229',
    
    // Application settings
    debugMode: false,
    autoSave: true,
    
    // Version
    version: '102.0'
};

/**
 * Get current configuration
 * @returns {Object} Current configuration with defaults
 */
function getConfig() {
    try {
        const saved = localStorage.getItem('loganonymizer_config');
        if (saved) {
            const parsed = JSON.parse(saved);
            return { ...DEFAULT_CONFIG, ...parsed };
        }
        return { ...DEFAULT_CONFIG };
    } catch (error) {
        console.error('Failed to load config:', error);
        return { ...DEFAULT_CONFIG };
    }
}

/**
 * Save configuration
 * @param {Object} config - Configuration object to save
 * @returns {boolean} Success status
 */
function saveConfig(config) {
    try {
        const merged = { ...DEFAULT_CONFIG, ...config };
        localStorage.setItem('loganonymizer_config', JSON.stringify(merged));
        logMessage('INFO', 'Configuration saved');
        return true;
    } catch (error) {
        logMessage('ERROR', 'Failed to save config: ' + error.message);
        return false;
    }
}

/**
 * Reset configuration to defaults
 * @returns {boolean} Success status
 */
function resetConfig() {
    try {
        localStorage.removeItem('loganonymizer_config');
        logMessage('INFO', 'Configuration reset to defaults');
        return true;
    } catch (error) {
        logMessage('ERROR', 'Failed to reset config: ' + error.message);
        return false;
    }
}

/**
 * Get a specific config value
 * @param {string} key - Config key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {*} Config value
 */
function getConfigValue(key, defaultValue = null) {
    const config = getConfig();
    return config[key] !== undefined ? config[key] : defaultValue;
}

/**
 * Set a specific config value
 * @param {string} key - Config key
 * @param {*} value - Value to set
 * @returns {boolean} Success status
 */
function setConfigValue(key, value) {
    try {
        const config = getConfig();
        config[key] = value;
        return saveConfig(config);
    } catch (error) {
        logMessage('ERROR', 'Failed to set config value: ' + error.message);
        return false;
    }
}

// Initialize config on load
logMessage('INFO', 'config.js loaded');
console.log('✅ config.js v102 loaded');

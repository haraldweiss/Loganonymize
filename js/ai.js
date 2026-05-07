// SPDX-License-Identifier: AGPL-3.0-or-later
// © 2026 Harald Weiss

// ==================== AI ANALYSIS FUNCTIONS ====================

/**
 * Add new AI provider
 */
function addAIProvider() {
    const providerId = document.getElementById('newProviderType').value;
    const model = document.getElementById('newProviderModel').value;
    const apiKey = document.getElementById('newProviderApiKey').value.trim();
    
    if (!providerId || !model || !apiKey) {
        showNotification('⚠️ Bitte alle Felder ausfüllen!', 'warning');
        return;
    }
    
    try {
        const provider = {
            id: generateUUID(),
            providerId: providerId,
            model: model,
            apiKey: apiKey,
            isActive: true,
            createdAt: Date.now()
        };
        
        state.aiProviders.push(provider);
        saveToLocalStorage();
        updateAIProvidersDisplay();
        
        // Clear form
        document.getElementById('newProviderType').value = '';
        document.getElementById('newProviderModel').value = '';
        document.getElementById('newProviderApiKey').value = '';
        
        // Close modal if exists
        const modal = bootstrap.Modal.getInstance(document.getElementById('addProviderModal'));
        if (modal) modal.hide();
        
        showNotification('✅ AI-Provider hinzugefügt!', 'success');
        log(`AI provider added: ${providerId} (${model})`, 'info');
        
    } catch (error) {
        log('Failed to add AI provider: ' + error.message, 'error');
        showNotification('❌ Fehler beim Hinzufügen!', 'danger');
    }
}

/**
 * Update provider models dropdown
 */
function updateProviderModels() {
    const providerSelect = document.getElementById('newProviderType');
    const modelSelect = document.getElementById('newProviderModel');
    
    if (!providerSelect || !modelSelect) return;
    
    const selectedProviderId = providerSelect.value;
    const provider = availableAIProviders.find(p => p.id === selectedProviderId);
    
    modelSelect.innerHTML = '<option value="">-- Model wählen --</option>';
    
    if (provider && provider.models) {
        provider.models.forEach(model => {
            modelSelect.innerHTML += `<option value="${model}">${model}</option>`;
        });
    }
}

/**
 * Edit AI provider
 */
function editAIProvider(index) {
    const provider = state.aiProviders[index];
    if (!provider) return;
    
    // Fill form with current values
    document.getElementById('newProviderType').value = provider.providerId;
    updateProviderModels();
    document.getElementById('newProviderModel').value = provider.model;
    document.getElementById('newProviderApiKey').value = provider.apiKey;
    
    // Delete old provider
    state.aiProviders.splice(index, 1);
    saveToLocalStorage();
    updateAIProvidersDisplay();
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('addProviderModal'));
    modal.show();
}

/**
 * Delete AI provider
 */
function deleteAIProvider(index) {
    if (!confirm('Wirklich diesen AI-Provider löschen?')) {
        return;
    }
    
    try {
        const provider = state.aiProviders[index];
        state.aiProviders.splice(index, 1);
        saveToLocalStorage();
        updateAIProvidersDisplay();
        
        showNotification('✅ AI-Provider gelöscht!', 'success');
        log(`AI provider deleted: ${provider.providerId}`, 'info');
        
    } catch (error) {
        log('Failed to delete AI provider: ' + error.message, 'error');
        showNotification('❌ Fehler beim Löschen!', 'danger');
    }
}

/**
 * Analyze log with AI
 */
async function analyzeWithAI() {
    const input = document.getElementById('aiInputText').value.trim();
    const providerIndex = document.getElementById('aiProviderSelect').value;
    
    if (!input) {
        showNotification('⚠️ Bitte geben Sie Log-Daten ein!', 'warning');
        return;
    }
    
    if (providerIndex === '') {
        showNotification('⚠️ Bitte wählen Sie einen AI-Provider!', 'warning');
        return;
    }
    
    const provider = state.aiProviders[parseInt(providerIndex)];
    if (!provider) {
        showNotification('❌ Provider nicht gefunden!', 'danger');
        return;
    }
    
    log(`Starting AI analysis with ${provider.providerId} (${provider.model})`, 'info');
    showLoading('AI analysiert Log-Daten...');
    
    try {
        const analysis = await performAIAnalysis(input, provider);
        
        // Display result
        document.getElementById('aiOutputText').value = analysis;
        
        // Save to history
        const historyItem = {
            timestamp: Date.now(),
            input: input,
            analysis: analysis,
            provider: provider.providerId,
            model: provider.model
        };
        
        state.analysisHistory.unshift(historyItem);
        
        // Limit history size
        if (state.analysisHistory.length > settings.maxHistoryItems) {
            state.analysisHistory = state.analysisHistory.slice(0, settings.maxHistoryItems);
        }
        
        saveToLocalStorage();
        updateHistoryDisplay();
        
        hideLoading();
        showNotification('✅ Analyse abgeschlossen!', 'success');
        log('AI analysis completed successfully', 'info');
        
    } catch (error) {
        hideLoading();
        log('AI analysis failed: ' + error.message, 'error');
        showNotification('❌ Fehler bei der Analyse: ' + error.message, 'danger');
        document.getElementById('aiOutputText').value = 'Fehler: ' + error.message;
    }
}

/**
 * Perform AI analysis (API call)
 */
async function performAIAnalysis(input, provider) {
    const providerInfo = availableAIProviders.find(p => p.id === provider.providerId);
    
    if (!providerInfo) {
        throw new Error('Unknown provider');
    }
    
    const prompt = `Analysiere die folgenden Log-Daten und erstelle einen detaillierten Bericht über:
1. Erkannte Sicherheitsprobleme
2. Auffällige Muster
3. Empfohlene Maßnahmen
4. Zusammenfassung

Log-Daten:
${input}`;
    
    let response;
    
    switch (provider.providerId) {
        case 'openai':
            response = await callOpenAI(prompt, provider);
            break;
        case 'anthropic':
            response = await callAnthropic(prompt, provider);
            break;
        case 'google':
            response = await callGoogle(prompt, provider);
            break;
        default:
            throw new Error('Unsupported provider');
    }
    
    return response;
}

/**
 * Call OpenAI API
 */
async function callOpenAI(prompt, provider) {
    // Used for any OpenAI-compatible API (OpenAI, Mammouth, custom gateways).
    // Falls back to the public OpenAI URL if no endpoint is configured.
    const endpoint = provider.endpoint || 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(endpoint, {
        method: 'POST',
        signal: provider.signal,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify({
            model: provider.model,
            messages: [
                {
                    role: 'system',
                    content: 'Du bist ein Experte für IT-Sicherheit und Log-Analyse.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: provider.maxTokens || 2000
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    let content = choice?.message?.content || '';
    if (choice?.finish_reason === 'length') {
        content += truncationWarning(provider.maxTokens || 2000, data.usage?.completion_tokens);
    }
    return content;
}

/**
 * Call Anthropic API (Claude)
 */
async function callAnthropic(prompt, provider) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: provider.signal,
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: provider.model,
            max_tokens: provider.maxTokens || 2000,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    let content = data.content?.[0]?.text || '';
    if (data.stop_reason === 'max_tokens') {
        content += truncationWarning(provider.maxTokens || 2000, data.usage?.output_tokens);
    }
    return content;
}

/**
 * Call Google Gemini API
 */
async function callGoogle(prompt, provider) {
    const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(provider.model)}:generateContent`;
    const response = await fetch(url, {
        method: 'POST',
        signal: provider.signal,
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': provider.apiKey
        },
        body: JSON.stringify({
            generationConfig: { maxOutputTokens: provider.maxTokens || 2000 },
            contents: [
                {
                    parts: [
                        {
                            text: prompt
                        }
                    ]
                }
            ]
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    const cand = data.candidates?.[0];
    let content = cand?.content?.parts?.[0]?.text || '';
    if (cand?.finishReason === 'MAX_TOKENS') {
        content += truncationWarning(provider.maxTokens || 2000);
    }
    return content;
}

/**
 * Call Ollama API (local).
 *
 * Ollama exposes an OpenAI-style /api/chat endpoint on localhost:11434
 * by default. No auth — refuse to attach a Bearer header even if a key
 * is present, so we don't leak it to a non-Ollama service that happens
 * to listen on the same port.
 */
async function callOllama(prompt, provider) {
    const endpoint = provider.endpoint || 'http://localhost:11434/api/chat';
    const response = await fetch(endpoint, {
        method: 'POST',
        signal: provider.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: provider.model,
            stream: false,
            // num_predict caps token generation; repeat_penalty + repeat_last_n
            // are the standard knobs against degenerate / looping output.
            options: {
                num_predict:    provider.maxTokens || 1500,
                repeat_penalty: 1.15,
                repeat_last_n:  64
            },
            messages: [
                { role: 'user', content: prompt }
            ]
        })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Ollama-Anfrage fehlgeschlagen (${response.status}): ${text || response.statusText}`);
    }

    const data = await response.json();
    let content = parseOllamaResponse(data, provider.model);

    // Ollama signals truncation via done_reason === 'length'.
    // Some older versions don't set it, so fall back to comparing the
    // eval_count against the requested num_predict.
    const limit = provider.maxTokens || 1500;
    const evalCount = data.eval_count || 0;
    const truncated = data.done_reason === 'length' || (evalCount > 0 && evalCount >= limit);
    if (truncated) {
        content += truncationWarning(limit, evalCount);
    }
    return content;
}

/**
 * Append-friendly notice for the response box / history. Surfaces the
 * fact that the model hit max_tokens and didn't actually finish.
 */
function truncationWarning(limit, generated) {
    return [
        '',
        '',
        '──────────────────────────────',
        '⚠️ Antwort wurde am Token-Limit abgeschnitten.',
        `   Limit: ${limit} Tokens` + (generated ? ` (generiert: ${generated})` : ''),
        '   In Einstellungen → "Maximale Output-Tokens pro Aufruf" erhöhen.'
    ].join('\n');
}

/**
 * Pull a usable string out of an Ollama response.
 *
 * Handles all three "looks-like-success-but-isn't-content" cases that
 * commonly trip people up:
 *   1) /api/chat with empty assistant content (e.g. embedding-only model
 *      mistakenly used for chat)
 *   2) /api/chat with tool_calls instead of content
 *   3) /api/generate shape (different field name)
 *
 * On real format mismatch, throw an error that includes which top-level
 * keys ARE present + a short preview, so the user can tell what's wrong
 * without opening DevTools.
 */
function parseOllamaResponse(data, modelName) {
    // /api/chat shape — accept empty string content as valid.
    if (data && typeof data.message === 'object' && data.message !== null) {
        if (typeof data.message.content === 'string') {
            const c = data.message.content;
            if (c.length > 0) return c;
            // Empty content but maybe tool_calls present
            if (Array.isArray(data.message.tool_calls) && data.message.tool_calls.length > 0) {
                return '⚙️ Das Modell hat Tool-Calls statt Text geantwortet (von Loganonymizer nicht ausgeführt):\n\n'
                     + JSON.stringify(data.message.tool_calls, null, 2);
            }
            // Truly empty response — e.g. embedding-only model misused for chat,
            // or num_predict too small. Surface a friendly message rather than
            // crash.
            console.warn('[Ollama] empty content from model', modelName, data);
            return `⚠️ Ollama hat eine leere Antwort geliefert (Modell: ${modelName || '?'}).
Mögliche Ursachen:
  · Embedding-Modell (z. B. nomic-embed-text) statt Chat-Modell ausgewählt
  · num_predict zu niedrig, Modell hat sofort gestoppt
  · Modell hat genuin nichts zu sagen — Prompt anpassen`;
        }
    }

    // /api/generate shape
    if (typeof data?.response === 'string') return data.response;

    // Echtes Format-Problem — zeig dem User, was wir bekommen haben.
    const keys = Object.keys(data || {}).join(', ') || '(leeres Objekt)';
    const preview = (() => {
        try { return JSON.stringify(data).slice(0, 200); } catch { return '(nicht serialisierbar)'; }
    })();
    console.warn('[Ollama] unrecognized response shape', data);
    throw new Error(`Ollama: unbekanntes Antwortformat. Top-Level-Felder: [${keys}]. Vorschau: ${preview}`);
}

/**
 * Copy AI analysis to clipboard
 */
function copyAIAnalysis() {
    copyToClipboard('aiOutputText');
}

/**
 * Clear AI input
 */
function clearAIInput() {
    document.getElementById('aiInputText').value = '';
    showNotification('🗑️ Eingabe gelöscht!', 'success');
}

/**
 * Clear AI output
 */
function clearAIOutput() {
    document.getElementById('aiOutputText').value = '';
    showNotification('🗑️ Ausgabe gelöscht!', 'success');
}

/**
 * Load analysis from history
 */
function loadFromHistory(index) {
    const item = state.analysisHistory[index];
    if (!item) return;
    
    document.getElementById('aiInputText').value = item.input;
    document.getElementById('aiOutputText').value = item.analysis;
    
    // Switch to AI tab
    const aiTab = document.querySelector('[data-bs-target="#ai-analysis"]');
    if (aiTab) {
        const tab = new bootstrap.Tab(aiTab);
        tab.show();
    }
    
    showNotification('📋 Aus Verlauf geladen!', 'success');
}
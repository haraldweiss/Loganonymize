// SPDX-License-Identifier: AGPL-3.0-or-later
// © 2026 Harald Weiss

// ==================== AI PROVIDER API CALLS ====================

/**
 * Call OpenAI API (also used for Mammouth and any OpenAI-compatible gateway).
 */
async function callOpenAI(prompt, provider) {
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
 */
async function callOllama(prompt, provider) {
    const defaultEndpoint = location.protocol === 'https:' ? 'http://127.0.0.1:11435/api/chat' : 'http://localhost:11434/api/chat';
    const endpoint = provider.endpoint || defaultEndpoint;
    const response = await fetch(endpoint, {
        method: 'POST',
        signal: provider.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: provider.model,
            stream: false,
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

    const limit = provider.maxTokens || 1500;
    const evalCount = data.eval_count || 0;
    const truncated = data.done_reason === 'length' || (evalCount > 0 && evalCount >= limit);
    if (truncated) {
        content += truncationWarning(limit, evalCount);
    }
    return content;
}

/**
 * Pull a usable string out of an Ollama response.
 */
function parseOllamaResponse(data, modelName) {
    if (data && typeof data.message === 'object' && data.message !== null) {
        if (typeof data.message.content === 'string') {
            const c = data.message.content;
            if (c.length > 0) return c;
            if (Array.isArray(data.message.tool_calls) && data.message.tool_calls.length > 0) {
                return '⚙️ Das Modell hat Tool-Calls statt Text geantwortet (von Loganonymizer nicht ausgeführt):\n\n'
                     + JSON.stringify(data.message.tool_calls, null, 2);
            }
            console.warn('[Ollama] empty content from model', modelName, data);
            return `⚠️ Ollama hat eine leere Antwort geliefert (Modell: ${modelName || '?'}).
Mögliche Ursachen:
  · Embedding-Modell (z. B. nomic-embed-text) statt Chat-Modell ausgewählt
  · num_predict zu niedrig, Modell hat sofort gestoppt
  · Modell hat genuin nichts zu sagen — Prompt anpassen`;
        }
    }

    if (typeof data?.response === 'string') return data.response;

    const keys = Object.keys(data || {}).join(', ') || '(leeres Objekt)';
    const preview = (() => {
        try { return JSON.stringify(data).slice(0, 200); } catch { return '(nicht serialisierbar)'; }
    })();
    console.warn('[Ollama] unrecognized response shape', data);
    throw new Error(`Ollama: unbekanntes Antwortformat. Top-Level-Felder: [${keys}]. Vorschau: ${preview}`);
}

/**
 * Append-friendly notice for the response box / history.
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

logMessage('INFO', 'ai.js loaded (API layer)');

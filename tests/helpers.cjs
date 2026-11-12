// SPDX-License-Identifier: AGPL-3.0-or-later
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function createApp({ mappings = {}, blacklist = [], settings = {} } = {}) {
    const data = new Map([
        ['loganonymizer_mappings', JSON.stringify(mappings)],
        ['loganonymizer_blacklist', JSON.stringify(blacklist)],
        ['loganonymizer_settings', JSON.stringify(settings)]
    ]);
    const storage = {
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key)
    };
    class Element {
        constructor() {
            this.children = [];
            this.dataset = {};
            this.classList = { add() {}, remove() {} };
            this.value = '';
            this.checked = false;
        }
        get firstChild() { return this.children[0]; }
        appendChild(child) { this.children.push(child); }
        append(child) { this.appendChild(child); }
        removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
        setAttribute() {}
        addEventListener() {}
    }
    const elements = new Map();
    const context = vm.createContext({
        localStorage: storage,
        console: { log() {}, error() {}, warn() {}, debug() {} },
        window: {}, location: { protocol: 'http:' }, crypto: webcrypto,
        performance, AbortController, Node: Element,
        setTimeout() {},
        document: {
            body: new Element(),
            getElementById: id => elements.get(id) ?? null,
            querySelectorAll: () => [],
            querySelector: () => null,
            createElement: () => new Element(),
            createTextNode: text => ({ textContent: text })
        }
    });
    for (const file of ['utils', 'anonymizer', 'ai', 'app', 'history']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file + '.js'), 'utf8'), context);
    }
    return { context, storage, data, elements, Element };
}

function createAIApp({ prompt = '', input = '', autoAnon = true, approve = true, ...options } = {}) {
    const app = createApp(options);
    const { context, storage, elements, Element } = app;
    storage.setItem('loganonymizer_ai_providers', JSON.stringify([
        { id: 'test', name: 'Test provider', type: 'custom', model: 'test-model',
          endpoint: 'https://provider.example.test/chat', apiKey: 'synthetic-key' }
    ]));
    for (const [id, value] of Object.entries({
        'ai-provider': 'test', 'ai-model': 'test-model', 'ai-prompt': prompt, 'ai-input-text': input
    })) {
        const element = new Element();
        element.value = value;
        elements.set(id, element);
    }
    for (const [id, checked] of [['auto-anonymize', autoAnon], ['auto-deanonymize', false]]) {
        const element = new Element();
        element.checked = checked;
        elements.set(id, element);
    }
    elements.set('ai-response-text', new Element());
    const requests = [];
    const previews = [];
    // User approval and the remote provider are the two external boundaries.
    context.confirmAIRequest = async (provider, model, payload) => {
        previews.push(payload);
        return approve;
    };
    context.fetch = async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) });
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'Synthetic response' } }] }) };
    };
    return { ...app, requests, previews };
}

module.exports = { createApp, createAIApp };

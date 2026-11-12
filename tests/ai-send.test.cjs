// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAIApp } = require('./helpers.cjs');

test('redacts both prompt and input before preview and provider dispatch', async () => {
    const { context, requests, previews } = createAIApp({
        prompt: 'Investigate first@example.test', input: 'Log: second@example.test'
    });
    await context.sendToAI();
    assert.equal(requests.length, 1);
    const sent = requests[0].body.messages[1].content;
    assert.ok(!sent.includes('first@example.test'));
    assert.ok(!sent.includes('second@example.test'));
    assert.equal(previews[0], sent);
    assert.equal(context.runDeanonymization(sent).deanonymized,
        'Investigate first@example.test\n\nLog: second@example.test');
});

test('redacts sensitive content when only the prompt is supplied', async () => {
    const { context, requests } = createAIApp({ prompt: 'Investigate first@example.test' });
    await context.sendToAI();
    assert.equal(requests.length, 1);
    assert.ok(!requests[0].body.messages[1].content.includes('first@example.test'));
});

test('canceling the preview prevents network calls and history writes', async () => {
    const { context, requests, storage } = createAIApp({ input: 'first@example.test', approve: false });
    await context.sendToAI();
    assert.equal(requests.length, 0);
    assert.equal(storage.getItem('loganonymizer_ai_history'), null);
});

test('explicitly disabled anonymization still previews the exact original payload', async () => {
    const { context, requests, previews } = createAIApp({ prompt: 'Investigate', input: 'first@example.test', autoAnon: false });
    await context.sendToAI();
    assert.equal(previews[0], 'Investigate\n\nfirst@example.test');
    assert.equal(requests[0].body.messages[1].content, previews[0]);
});

test('storage failure prevents sending and is presented in the response box', async () => {
    const { context, requests, storage, elements } = createAIApp({ input: 'first@example.test' });
    storage.setItem = () => { throw new Error('Storage full'); };
    await context.sendToAI();
    assert.equal(requests.length, 0);
    assert.ok(elements.get('ai-response-text').children.length > 0);
});

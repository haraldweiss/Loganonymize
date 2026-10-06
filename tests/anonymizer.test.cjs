// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./helpers.cjs');

test('restores legacy placeholders with shared numeric prefixes exactly', () => {
    const { context } = createApp({ mappings: { EMAIL_1: 'first@example.test', EMAIL_10: 'tenth@example.test' } });
    assert.equal(context.runDeanonymization('EMAIL_10 EMAIL_1 EMAIL_100').deanonymized,
        'tenth@example.test first@example.test EMAIL_100');
});

test('does not expand placeholder substrings inside other identifiers', () => {
    const { context } = createApp({ mappings: { EMAIL_1: 'first@example.test' } });
    assert.equal(context.runDeanonymization('XEMAIL_1 EMAIL_1_suffix (EMAIL_1)').deanonymized,
        'XEMAIL_1 EMAIL_1_suffix (first@example.test)');
});

test('restores once without interpreting placeholder-like text in original values', () => {
    const { context } = createApp({ mappings: { CUSTOM_1: 'literal EMAIL_1', EMAIL_1: 'first@example.test' } });
    assert.equal(context.runDeanonymization('CUSTOM_1').deanonymized, 'literal EMAIL_1');
});

test('new placeholders do not collide with literal tokens in the input', () => {
    const { context } = createApp();
    const input = 'literal EMAIL_1 and [[EMAIL_1]]; contact first@example.test';
    const result = context.runAnonymization(input);
    assert.equal(context.runDeanonymization(result.anonymized).deanonymized, input);
    assert.ok(!result.anonymized.includes('first@example.test'));
});

test('new tokens round-trip with legacy mappings and repeated emails', () => {
    const { context } = createApp({ mappings: { EMAIL_1: 'old@example.test' } });
    const input = 'old@example.test, new@example.test, new@example.test';
    const result = context.runAnonymization(input);
    assert.equal(context.runDeanonymization(result.anonymized).deanonymized, input);
    assert.equal(Object.keys(result.newMappings).length, 1);
});

test('redacts overlapping email strings without corrupting the longer address', () => {
    const { context } = createApp();
    const input = 'a@example.test ba@example.test';
    const result = context.runAnonymization(input);
    assert.ok(!result.anonymized.includes('example.test'));
    assert.equal(context.runDeanonymization(result.anonymized).deanonymized, input);
    assert.equal(Object.keys(result.newMappings).length, 2);
});

for (const sample of ['GB82 WEST 1234 5698 7654 32', 'GB82WEST12345698765432',
    'gb82 west 1234 5698 7654 32', 'DE89 3704 0044 0532 0130 00', 'NL91 ABNA 0417 1643 00']) {
    test('detects and round-trips IBAN ' + sample, () => {
        const { context } = createApp();
        const input = 'IBAN: ' + sample + ' next payment';
        assert.deepEqual(Array.from(context.detectIBANs(input)), [sample]);
        const result = context.runAnonymization(input);
        assert.ok(!result.anonymized.includes(sample));
        assert.equal(context.runDeanonymization(result.anonymized).deanonymized, input);
    });
}

test('rejects invalid IBAN checksums and does not stitch across log lines', () => {
    const { context } = createApp();
    assert.deepEqual(Array.from(context.detectIBANs('GB83 WEST 1234 5698 7654 32')), []);
    assert.deepEqual(Array.from(context.detectIBANs('GB82 WEST 1234\n5698 7654 32')), []);
});

test('detects adjacent IBANs independently', () => {
    const { context } = createApp();
    assert.deepEqual(Array.from(context.detectIBANs('GB82 WEST 1234 5698 7654 32 DE89 3704 0044 0532 0130 00')),
        ['GB82 WEST 1234 5698 7654 32', 'DE89 3704 0044 0532 0130 00']);
});

test('fails rather than returning unrestorable output when mapping storage fails', () => {
    const { context, storage } = createApp();
    storage.setItem = () => { throw new Error('Storage full'); };
    assert.throws(() => context.runAnonymization('first@example.test'), /speicher|storage/i);
});

test('does not stop redacting an IBAN at a checksum-valid shorter prefix', () => {
    const { context } = createApp({ settings: { detectPhones: false } });
    const iban = 'GB50 WEST 0000 0000 0000 38';
    assert.deepEqual(Array.from(context.detectIBANs(iban)), [iban]);
    const result = context.runAnonymization(iban);
    assert.ok(!result.anonymized.includes('0000'));
    assert.equal(context.runDeanonymization(result.anonymized).deanonymized, iban);
});

test('legacy blacklist mappings remain reversible within larger identifiers', () => {
    const { context } = createApp({ mappings: { CUSTOM_1: 'secret' }, blacklist: ['secret'] });
    const result = context.runAnonymization('secret_suffix');
    assert.equal(context.runDeanonymization(result.anonymized).deanonymized, 'secret_suffix');
});

test('adjacent legacy blacklist replacements remain reversible', () => {
    const { context } = createApp({ mappings: { CUSTOM_1: 'secret' }, blacklist: ['secret'] });
    const result = context.runAnonymization('secretsecret');
    assert.equal(context.runDeanonymization(result.anonymized).deanonymized, 'secretsecret');
});

// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptDirectory = path.join(__dirname, '..', 'js');

for (const file of fs.readdirSync(scriptDirectory).filter(name => name.endsWith('.js'))) {
    test('browser script parses: ' + file, () => {
        const source = fs.readFileSync(path.join(scriptDirectory, file), 'utf8');
        assert.doesNotThrow(() => new vm.Script(source, { filename: file }));
    });
}

test('history previews preserve short text and truncate long text with an ellipsis', () => {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(scriptDirectory, 'history.js'), 'utf8'), context);

    assert.equal(context.truncate('', 5), '');
    assert.equal(context.truncate('short', 5), 'short');
    assert.equal(context.truncate('long preview', 5), 'long…');
    assert.equal(context.truncate('long preview', 1), '…');
});

test('reputation keys are trimmed on save and removed when cleared', () => {
    const stored = new Map();
    const fields = {
        'vt-api-key': { value: '  vt-test  ' },
        'abuseipdb-api-key': { value: '  abuse-test  ' },
    };
    const context = vm.createContext({
        STORAGE_PREFIX: 'test_',
        document: { getElementById: id => fields[id] },
        localStorage: {
            setItem: (key, value) => stored.set(key, value),
            removeItem: key => stored.delete(key),
        },
    });
    vm.runInContext(fs.readFileSync(path.join(scriptDirectory, 'analysis.js'), 'utf8'), context);

    context.saveIpReputationKeys();
    assert.equal(stored.get('test_vt_api_key'), 'vt-test');
    assert.equal(stored.get('test_abuseipdb_api_key'), 'abuse-test');

    fields['vt-api-key'].value = '  ';
    fields['abuseipdb-api-key'].value = '';
    context.saveIpReputationKeys();
    assert.equal(stored.has('test_vt_api_key'), false);
    assert.equal(stored.has('test_abuseipdb_api_key'), false);
});

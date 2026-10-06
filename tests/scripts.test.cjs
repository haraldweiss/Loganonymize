// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const file of fs.readdirSync(path.join(__dirname, '..', 'js')).filter(name => name.endsWith('.js'))) {
    test('browser script parses: ' + file, () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
        assert.doesNotThrow(() => new vm.Script(source, { filename: file }));
    });
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// © 2026 Harald Weiss

'use strict';

console.log('🚀 Loganonymizer v104.0');

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

/*
 * Holy Private Bookmarks — Encrypted Local Bookmark Manager
 * Copyright (C) 2026 OSV IT-Studio
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Source code: https://github.com/OSV-IT-Studio/holy-private-bookmarks
 */
 const DuressPassword = (function () {

    const STORAGE_KEY = 'holyDuressAuth';
    const ITERATIONS = 50000;
    const SALT_SIZE = 16;
    const MIN_LENGTH = 6;

    function constantTimeEqual(a, b) {
        if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
        if (a.length !== b.length) return false;
        let result = 0;
        for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
        return result === 0;
    }

    async function deriveHash(password, salt, iterations) {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        try {
            const keyMaterial = await crypto.subtle.importKey(
                'raw', passwordBuffer, { name: 'PBKDF2' }, false, ['deriveBits']
            );
            const bits = await crypto.subtle.deriveBits(
                { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
                keyMaterial,
                256
            );
            return new Uint8Array(bits);
        } finally {
            if (window.HolySecureUtils) window.HolySecureUtils.secureWipeArray(passwordBuffer);
        }
    }

    async function isEnabled() {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        return !!stored[STORAGE_KEY];
    }

    async function setup(password) {
        if (!password || typeof password !== 'string' || password.length < MIN_LENGTH) {
            return false;
        }
        const salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE));
        const hash = await deriveHash(password, salt, ITERATIONS);
        await chrome.storage.local.set({
            [STORAGE_KEY]: {
                salt: Array.from(salt),
                hash: Array.from(hash),
                iterations: ITERATIONS
            }
        });
        return true;
    }

    async function disable() {
        await chrome.storage.local.remove(STORAGE_KEY);
    }

    async function check(password) {
        if (!password) return false;
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        const record = stored[STORAGE_KEY];
        if (!record || !record.salt || !record.hash) return false;
        const salt = new Uint8Array(record.salt);
        const storedHash = new Uint8Array(record.hash);
        const iterations = record.iterations || ITERATIONS;
        const computedHash = await deriveHash(password, salt, iterations);
        const isMatch = constantTimeEqual(computedHash, storedHash);
        if (window.HolySecureUtils) window.HolySecureUtils.secureWipeArray(computedHash);
        return isMatch;
    }

    async function wipeAll() {
        try {
            if (window.SecureCrypto) window.SecureCrypto.clear();
        } catch (e) {}
        try {
            await chrome.storage.session.clear();
        } catch (e) {}
        try {
            await chrome.storage.local.clear();
        } catch (e) {}
    }

    return {
        isEnabled,
        setup,
        disable,
        check,
        wipeAll,
        CONSTANTS: { MIN_LENGTH }
    };

})();

if (typeof window !== 'undefined') window.DuressPassword = DuressPassword;
if (typeof module !== 'undefined') module.exports = DuressPassword;

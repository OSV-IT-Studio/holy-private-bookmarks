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

// MODULE: popup-auth.js
// Handles: master password setup, unlock, auto-migration v1→v2, password change

const PopupAuth = (function () {

    // Injected dependencies (set via init)
    let _deps = {};

    function _get(name) {
        const v = _deps[name];
        if (!v) throw new Error(`PopupAuth: dependency "${name}" not set`);
        return v;
    }

    // Helpers

    // Reads password from input element directly into Uint8Array,
    // then immediately clears the field. This avoids keeping the
    // password as a JS string in the heap where it cannot be wiped.
    function readPasswordBuffer(elementId) {
        const el = document.getElementById(elementId);
        if (!el) return null;
        const buffer = new TextEncoder().encode(el.value);
        el.value = '';
        return buffer; 
    }

    // Unlock

    async function unlock() {
        const { STORAGE_KEY, SecureCrypto, secureWipeArray, showNotification,
                getMessage, showLoadingIndicator, hideLoadingIndicator,
                showSection, pendingBookmarkRef, openAddBookmarkModal } = _get('all');

        // Read password into Uint8Array immediately, clearing the field at once.
        const passwordBuf = readPasswordBuffer('password');

        if (!passwordBuf || passwordBuf.length === 0) {
            showNotification(getMessage('wrongPassword') || 'Please enter password', true);
            return;
        }

        // Derive a plain string only where the SecureCrypto API requires it.
        const password = new TextDecoder().decode(passwordBuf);
		const loginContainer = document.querySelector('.login-container') || document.body;
		const unlockText = getMessage('unlocking') || 'Unlocking...';
		
        try {
			showGlobalLoadingIndicator(loginContainer, unlockText);
            const stored = await chrome.storage.local.get(STORAGE_KEY);
            const storedData = stored[STORAGE_KEY];

            if (!storedData) {
                showNotification('No data found. Please set up the extension first.', true);
                return;
            }

            if (storedData.version !== 2) {
                if (storedData.salt && storedData.encrypted && !storedData.version) {
                    hideGlobalLoadingIndicator();
                    await performAutoMigration(password, storedData);
                    return;
                }
                showNotification('Incompatible data format. Please reinstall.', true);
                return;
            }

            const isValid = await SecureCrypto.verifyPassword(password, storedData);
            if (!isValid) {
                showNotification(getMessage('wrongPassword') || 'Wrong password', true);
                return;
            }

            const initSuccess = await SecureCrypto.initAfterVerification(password, storedData);
            if (!initSuccess) throw new Error('Failed to initialize crypto');

            const decrypted = await SecureCrypto.decrypt(storedData.encrypted);
            _get('all').setData(JSON.parse(decrypted));

            document.getElementById('login-notification-bar')?.remove();
            document.getElementById('login')?.remove();
            document.getElementById('login-temp-styles')?.remove();

            showSection('main');
            _get('all').startAutoLock();
			
            if (pendingBookmarkRef.value) {
                openAddBookmarkModal(pendingBookmarkRef.value.title, pendingBookmarkRef.value.url);
                pendingBookmarkRef.value = null;
            }
			if (typeof window.DonationReminder !== 'undefined') {
                setTimeout(() => {
                    window.DonationReminder.checkAndShowReminder();
                }, 3000); 
            }
        } catch (e) {
            showNotification(getMessage('unlockFailed') || 'Failed to unlock: ' + e.message, true);
            SecureCrypto.clear();
        } finally {
            if (passwordBuf) secureWipeArray(passwordBuf);
            hideGlobalLoadingIndicator()
        }
    }

    // Auto-migration v1 → v2

    async function performAutoMigration(password, oldData) {
        const { STORAGE_KEY, SecureCrypto, secureWipeArray,
                showNotification, getMessage,
                showLoadingIndicator, hideLoadingIndicator } = _get('all');

        const passwordBuf = new TextEncoder().encode(password);
		
		const loginContainer = document.querySelector('.login-container') || document.body;
		const migrateText = getMessage('migratingData') || 'Migrating data to secure format...';
        try {
            showGlobalLoadingIndicator(loginContainer, migrateText);

            const salt = new Uint8Array(oldData.salt);
            const encrypted = oldData.encrypted;

            if (!encrypted?.iv || !encrypted?.data) {
                throw new Error('Invalid encrypted data structure');
            }

            await SecureCrypto.init(password, salt);

            let decrypted;
            try {
                decrypted = await SecureCrypto.decrypt(encrypted);
            } catch {
                SecureCrypto.clear();
                throw new Error('Decryption failed - wrong password');
            }

            let userData;
            try {
                userData = JSON.parse(decrypted);
            } catch {
                SecureCrypto.clear();
                throw new Error('Data corrupted - invalid JSON');
            }

            SecureCrypto.clear();

            const newCryptoData = await SecureCrypto.setupNewPassword(password);
            const newEncrypted  = await SecureCrypto.encrypt(JSON.stringify(userData));

            await chrome.storage.local.set({
                [STORAGE_KEY]: { ...newCryptoData, encrypted: newEncrypted }
            });

            SecureCrypto.clear();

            showGlobalLoadingIndicator(); 
            showNotification(getMessage('migrationSuccess') || 'Data successfully migrated to secure format!', false, 2000);

            setTimeout(() => window.location.reload(), 1000);
            return true;
			
        } catch (e) {
            showGlobalLoadingIndicator(); 
            SecureCrypto.clear();

            document.getElementById('password')?.focus();

            let errorMessage = 'Migration failed';
            if (e.message.includes('wrong password') || e.message.includes('Decryption failed')) {
                errorMessage = 'Wrong password. Please try again.';
            } else if (e.message.includes('corrupted')) {
                errorMessage = 'Data corrupted. Please reset the extension.';
            } else {
                errorMessage = 'Migration failed: ' + e.message;
            }

            showNotification(errorMessage, true, 2000);
            setTimeout(() => document.getElementById('password')?.focus(), 100);
            return false;

        } finally {
            secureWipeArray(passwordBuf);
			hideGlobalLoadingIndicator(loginContainer);
        }
    }

    // Create master password (first-time setup)

    async function createMasterPassword() {
        const { STORAGE_KEY, SecureCrypto, secureWipeArray, showNotification,
                getMessage, showLoadingIndicator, hideLoadingIndicator,
                showSection, setData } = _get('all');

        const p1Buf = readPasswordBuffer('new-pass');
        const p2Buf = readPasswordBuffer('confirm-pass');
        const p1    = new TextDecoder().decode(p1Buf);
        const p2    = new TextDecoder().decode(p2Buf);

        if (p1 !== p2 || p1.length < SecureCrypto.CONSTANTS.MIN_PASSWORD_LENGTH) {
            secureWipeArray(p1Buf);
            secureWipeArray(p2Buf);
            showNotification(
                getMessage('passwordsMismatch') ||
                `Password must be at least ${SecureCrypto.CONSTANTS.MIN_PASSWORD_LENGTH} characters`,
                true
            );
            return;
        }
		const setupContainer = document.querySelector('.setup-container') || document.body;
		const setupText = getMessage('settingUpEncryption') || 'Setting up encryption...';
        try {
            showGlobalLoadingIndicator(setupContainer, setupText); 

            const cryptoData = await SecureCrypto.setupNewPassword(p1);
            const emptyData  = { folders: [] };
            const encrypted  = await SecureCrypto.encrypt(JSON.stringify(emptyData));

            await chrome.storage.local.set({
                [STORAGE_KEY]: { ...cryptoData, encrypted }
            });

            setData(emptyData);
            document.getElementById('setup')?.remove();
            showSection('main');
            showNotification(getMessage('setupComplete') || 'Setup complete!', false);

        } catch (error) {
            showNotification(getMessage('setupError') || 'Setup failed: ' + error.message, true);
            SecureCrypto.clear();
        } finally {
            secureWipeArray(p1Buf);
            secureWipeArray(p2Buf);
            hideGlobalLoadingIndicator(setupContainer);
        }
    }

    // Change master password

    async function changeMasterPassword() {
        const { STORAGE_KEY, SecureCrypto, secureWipeArray, showNotification,
                getMessage, showLoadingIndicator, hideLoadingIndicator, showSection } = _get('all');

        const oldPassBuf  = readPasswordBuffer('old-pass');
        const newPass1Buf = readPasswordBuffer('new-pass2');
        const newPass2Buf = readPasswordBuffer('confirm-pass2');

        const oldPass  = new TextDecoder().decode(oldPassBuf);
        const newPass1 = new TextDecoder().decode(newPass1Buf);
        const newPass2 = new TextDecoder().decode(newPass2Buf);

        if (!oldPass || !newPass1 || !newPass2) {
            secureWipeArray(oldPassBuf); secureWipeArray(newPass1Buf); secureWipeArray(newPass2Buf);
            showNotification(getMessage('fillAllFields') || 'Please fill all fields', true);
            return;
        }

        if (newPass1 !== newPass2) {
            secureWipeArray(oldPassBuf); secureWipeArray(newPass1Buf); secureWipeArray(newPass2Buf);
            showNotification(getMessage('passwordsMismatch') || 'New passwords do not match', true);
            return;
        }

        if (newPass1.length < SecureCrypto.CONSTANTS.MIN_PASSWORD_LENGTH) {
            secureWipeArray(oldPassBuf); secureWipeArray(newPass1Buf); secureWipeArray(newPass2Buf);
            showNotification(
                getMessage('passwordTooShort') ||
                `Password must be at least ${SecureCrypto.CONSTANTS.MIN_PASSWORD_LENGTH} characters`,
                true
            );
            return;
        }
		const settingsContainer = document.querySelector('.change-master-password') || document.body;
		const changeText = getMessage('changingPassword') || 'Changing password...';
        try {
            showGlobalLoadingIndicator(settingsContainer, changeText);
            const stored     = await chrome.storage.local.get(STORAGE_KEY);
            const storedData = stored[STORAGE_KEY];
            if (!storedData) throw new Error('No data found');

            const isValid = await SecureCrypto.verifyPassword(oldPass, storedData);
            if (!isValid) {
                showNotification(getMessage('wrongPassword') || 'Wrong password', true);
                return;
            }

            await SecureCrypto.initAfterVerification(oldPass, storedData);
            const decrypted    = await SecureCrypto.decrypt(storedData.encrypted);
            const currentData  = JSON.parse(decrypted);

            const newCryptoData = await SecureCrypto.setupNewPassword(newPass1);
            const newEncrypted  = await SecureCrypto.encrypt(JSON.stringify(currentData));

            await chrome.storage.local.set({
                [STORAGE_KEY]: { ...newCryptoData, encrypted: newEncrypted }
            });

            showNotification(getMessage('passwordChanged') || 'Password changed successfully', false);
            setTimeout(() => showSection('main'), 1500);

        } catch (error) {
            showNotification(
                getMessage('passwordChangeFailed') || 'Failed to change password: ' + error.message,
                true
            );
        } finally {
            secureWipeArray(oldPassBuf);
            secureWipeArray(newPass1Buf);
            secureWipeArray(newPass2Buf);
            hideGlobalLoadingIndicator(settingsContainer);
        }
    }

    // Public API

    return {
        
        init(deps) { _deps.all = deps; },

        unlock,
        createMasterPassword,
        changeMasterPassword,

        // Exposed for init wiring
        readPasswordBuffer
    };

})();

if (typeof window !== 'undefined') window.PopupAuth = PopupAuth;
if (typeof module !== 'undefined') module.exports = PopupAuth;

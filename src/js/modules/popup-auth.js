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

    
    let _deps = {};

    function _get(name) {
        const v = _deps[name];
        if (!v) throw new Error(`PopupAuth: dependency "${name}" not set`);
        return v;
    }

    // Helpers

    
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

        
        const passwordBuf = readPasswordBuffer('password');

        if (!passwordBuf || passwordBuf.length === 0) {
            showNotification(getMessage('wrongPassword'), true);
            return;
        }

        
        const password = new TextDecoder().decode(passwordBuf);
		const loginContainer = document.querySelector('.login-container') || document.body;
		const unlockText = getMessage('unlocking');
		
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
                    hideGlobalLoadingIndicator(loginContainer);
                    await performAutoMigration(password, storedData);
                    return;
                }
                showNotification('Incompatible data format. Please reinstall.', true);
                return;
            }

            const isValid = await SecureCrypto.verifyPassword(password, storedData);
            if (!isValid) {
                showNotification(getMessage('wrongPassword'), true);
                return;
            }

            const initSuccess = await SecureCrypto.initAfterVerification(password, storedData);
            if (!initSuccess) throw new Error('Failed to initialize crypto');

            const decrypted = await SecureCrypto.decrypt(storedData.encrypted);
            const loadedData = JSON.parse(decrypted);
            
            if (_get('all').ensureFolderUids) {
                _get('all').ensureFolderUids(loadedData.folders);
            }
            _get('all').setData(loadedData);
            if (_get('all').saveChanges) await _get('all').saveChanges();

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
            showNotification(getMessage('unlockFailed') + e.message, true);
            SecureCrypto.clear();
        } finally {
            if (passwordBuf) secureWipeArray(passwordBuf);
            hideGlobalLoadingIndicator(loginContainer);
        }
    }

    // Auto-migration v1 → v2

    async function performAutoMigration(password, oldData) {
        const { STORAGE_KEY, SecureCrypto, secureWipeArray,
                showNotification, getMessage,
                showLoadingIndicator, hideLoadingIndicator } = _get('all');

        const passwordBuf = new TextEncoder().encode(password);
		
		const loginContainer = document.querySelector('.login-container') || document.body;
		const migrateText = getMessage('migratingData');
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
            showNotification(getMessage('migrationSuccess'), false, 2000);

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
            showConfirm, showSection, setData } = _get('all');

    const p1Buf = readPasswordBuffer('new-pass');
    const p2Buf = readPasswordBuffer('confirm-pass');
    const p1    = new TextDecoder().decode(p1Buf);
    const p2    = new TextDecoder().decode(p2Buf);

    if (p1 !== p2 || p1.length < SecureCrypto.CONSTANTS.MIN_PASSWORD_LENGTH) {
        secureWipeArray(p1Buf);
        secureWipeArray(p2Buf);
        showNotification(getMessage('passwordsMismatch'), true);
        return;
    }


    const confirmed = await showConfirm({
        
        title: getMessage('warningRemember'),
        warning: `
            <div class="sc-warn" style="text-align:left;margin:12px 0">
                <strong>${getMessage('importantWarning')}</strong>
                <ul>
                    <li>${getMessage('passwordCannotBeRecovered')}</li>
                    <li>${getMessage('noPasswordReset')}</li>
                    <li>${getMessage('weDontStorePassword')}</li>
                    <li>${getMessage('bookmarksEncrypted')}</li>
                </ul>
                <span class="sc-warn-tip">${getMessage('savePasswordSecurely')}</span>
            </div>`,
        confirmLabel: getMessage('yesRemember'),
        cancelLabel:  getMessage('cancel'),
    });

    if (!confirmed) {
        secureWipeArray(p1Buf);
        secureWipeArray(p2Buf);
        return;
    }

    const setupContainer = document.querySelector('.setup-card') || document.body;
    const setupText = getMessage('settingUpEncryption');
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
        showNotification(getMessage('setupComplete'), false);

    } catch (error) {
        showNotification(getMessage('setupError') + error.message, true);
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
            showNotification(getMessage('fillAllFields'), true);
            return;
        }

        if (newPass1 !== newPass2) {
            secureWipeArray(oldPassBuf); secureWipeArray(newPass1Buf); secureWipeArray(newPass2Buf);
            showNotification(getMessage('passwordsMismatch'), true);
            return;
        }

        if (newPass1.length < SecureCrypto.CONSTANTS.MIN_PASSWORD_LENGTH) {
            secureWipeArray(oldPassBuf); secureWipeArray(newPass1Buf); secureWipeArray(newPass2Buf);
            showNotification(
                getMessage('passwordTooShort'),
                true
            );
            return;
        }

        const settingsContainer = document.querySelector('.change-master-password') || document.body;
        const changeText = getMessage('changingPassword');

        
        let committed = false;

        
        let decryptedJson = null;

        
        const BACKUP_KEY = STORAGE_KEY + '_pwchange_pending';

        try {
            showGlobalLoadingIndicator(settingsContainer, changeText);

            const stored     = await chrome.storage.local.get(STORAGE_KEY);
            const storedData = stored[STORAGE_KEY];
            if (!storedData) throw new Error('No data found');

            
            const isValid = await SecureCrypto.verifyPassword(oldPass, storedData);
            if (!isValid) {
                showNotification(getMessage('wrongPassword'), true);
                return;
            }

            
            await SecureCrypto.initAfterVerification(oldPass, storedData);
            decryptedJson = await SecureCrypto.decrypt(storedData.encrypted);

            
            const newCryptoData = await SecureCrypto.setupNewPassword(newPass1);
            const newEncrypted  = await SecureCrypto.encrypt(JSON.stringify(JSON.parse(decryptedJson)));

            await chrome.storage.local.set({
                [BACKUP_KEY]: { ...newCryptoData, encrypted: newEncrypted }
            });

            
            await chrome.storage.local.set({
                [STORAGE_KEY]: { ...newCryptoData, encrypted: newEncrypted }
            });

            committed = true;

            showNotification(getMessage('passwordChanged'), false);
            setTimeout(() => showSection('main'), 1500);

        } catch (error) {
            
            showNotification(
                getMessage('passwordChangeFailed') + error.message,
                true
            );

            
            SecureCrypto.clear();

        } finally {
            
            secureWipeArray(oldPassBuf);
            secureWipeArray(newPass1Buf);
            secureWipeArray(newPass2Buf);

            
            if (decryptedJson !== null) {
                try {
                    const jsonBuf = new TextEncoder().encode(decryptedJson);
                    secureWipeArray(jsonBuf);
                } catch (_) {  }
                decryptedJson = null;
            }

            
            try {
                await chrome.storage.local.remove(BACKUP_KEY);
            } catch (_) { }

            hideGlobalLoadingIndicator(settingsContainer);
        }
    }

    // Public API

    return {
        
        init(deps) { _deps.all = deps; },

        unlock,
        createMasterPassword,
        changeMasterPassword,

        
        readPasswordBuffer
    };

})();

if (typeof window !== 'undefined') window.PopupAuth = PopupAuth;
if (typeof module !== 'undefined') module.exports = PopupAuth;
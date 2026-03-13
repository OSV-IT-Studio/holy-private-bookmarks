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

// MODULE: manager-lock.js
// Handles: unlock, lock, inactivity timer, lock-screen UI

const ManagerLock = (function () {

    let _deps = {};
    let _inactivityTimer;
    let _isLocked = false;

    // Inactivity timer

    function resetInactivityTimer() {
        clearTimeout(_inactivityTimer);
        if (!_isLocked && _deps.CryptoManager?.isReady()) {
            _inactivityTimer = setTimeout(lockManager, _deps.INACTIVITY_TIMEOUT);
        }
    }

    function initActivityTracking() {
        const events = [
            'mousemove', 'mousedown', 'click', 'scroll',
            'keydown', 'keypress', 'keyup', 'input', 'change',
            'focus', 'focusin'
        ];
        events.forEach(e => document.addEventListener(e, resetInactivityTimer));
        window.addEventListener('focus', resetInactivityTimer);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) resetInactivityTimer();
        });
    }

    // Lock

    async function lockManager() {
        const { CryptoManager, wipeUserData, clearAllSharedCaches,
                getMessage, showNotification,
                setData, clearManagerCaches } = _deps;

        if (_isLocked || !CryptoManager?.isReady()) return;
        _isLocked = true;

        if (_deps.getData()) wipeUserData(_deps.getData());

        CryptoManager.clear();
        setData({ folders: [] });
        clearManagerCaches();
        clearAllSharedCaches();

        // Reset folder tree to default state
        const folderTree = document.getElementById('folder-tree');
        if (folderTree) {
            folderTree.innerHTML = `
                <li class="folder-item all-bookmarks active" data-folder-id="all">
                    <div class="folder-content">
                        <span class="folder-toggle">▶</span>
                        <div class="folder-icon">
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8">
                                <polygon points="9 1 11.5 6.5 17 7.5 13 11.5 14 17 9 14 4 17 5 11.5 1 7.5 6.5 6.5 9 1" fill="currentColor" fill-opacity="0.15"/>
                            </svg>
                        </div>
                        <div class="folder-name" data-i18n="allBookmarks">All Bookmarks</div>
                    </div>
                    <div class="folder-count" id="all-count">0</div>
                </li>
            `;
        }

        const bookmarksGrid = document.getElementById('bookmarks-grid');
        if (bookmarksGrid) {
            bookmarksGrid.innerHTML = '';
            bookmarksGrid.style.display = 'none';
        }

        document.getElementById('load-more-trigger')?.remove();

        const emptyState = document.getElementById('empty-state');
        if (emptyState) {
            emptyState.style.display = 'flex';
            const icon  = emptyState.querySelector('.empty-state__icon');
            const title = emptyState.querySelector('h3');
            const desc  = emptyState.querySelector('p');
            if (icon)  icon.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>`;
            if (title) title.textContent = getMessage('noBookmarksInFolder') || 'No bookmarks in this folder';
            if (desc)  desc.textContent  = getMessage('addBookmarksToGetStarted') || 'Add bookmarks to get started';
        }

        const allCount = document.getElementById('all-count');
        if (allCount) allCount.textContent = '0';

        const bookmarksCount = document.getElementById('bookmarks-count');
        if (bookmarksCount) bookmarksCount.textContent = `0 ${getMessage('bookmarks') || 'bookmarks'}`;

        _deps.resetVirtualScroll();

        document.getElementById('lock-screen').style.display = 'flex';
        document.querySelector('.container').style.display = 'none';

        const passwordInput = document.getElementById('password-input');
        if (passwordInput) passwordInput.value = '';

        showNotification(getMessage('managerLocked') || 'Manager locked', false);
    }

    function manualLock() { lockManager(); }

    function initLockButton() {
        document.getElementById('manual-lock-btn')?.addEventListener('click', manualLock);
    }

    // Unlock

    async function unlock() {
        const { STORAGE_KEY, CryptoManager, secureWipeArray, getMessage,
                showNotification, hideLoadingIndicator,
                setData, resetInactivityTimer: reset,
                onUnlockSuccess } = _deps;

        const el  = document.getElementById('password-input');
        if (!el) return;
        const buf = new TextEncoder().encode(el.value);
        el.value  = '';

        if (!buf || buf.length === 0) {
            showNotification(getMessage('wrongPassword') || 'Please enter password', true);
            return;
        }

        const password = new TextDecoder().decode(buf);

        try {
			const loginContainer = document.querySelector('.login-container');
			const unlockText = getMessage('unlocking') || 'Unlocking...';
			showGlobalLoadingIndicator(loginContainer, unlockText);
            const stored     = await chrome.storage.local.get(STORAGE_KEY);
            const storedData = stored[STORAGE_KEY];

            if (!storedData) {
                showNotification('No data found. Please set up the extension first.', true);
                return;
            }

            if (storedData.version !== 2) {
                if (storedData.salt && storedData.encrypted && !storedData.version) {
                    showNotification('Please open the extension popup to migrate your data to the new secure format.', true);
                    return;
                }
                showNotification('Incompatible data format. Please reinstall.', true);
                return;
            }

            const isValid = await CryptoManager.verifyPassword(password, storedData);
            if (!isValid) {
                showNotification(getMessage('wrongPassword') || 'Wrong password', true);
                return;
            }

            const initSuccess = await CryptoManager.initAfterVerification(password, storedData);
            if (!initSuccess) throw new Error('Failed to initialize crypto');

            const decrypted = await CryptoManager.decrypt(storedData.encrypted);
            setData(JSON.parse(decrypted));
            _isLocked = false;

            document.getElementById('lock-screen').style.display = 'none';
            document.querySelector('.container').style.display = 'flex';

            reset();
            onUnlockSuccess();

        } catch (e) {
            console.error('Unlock error:', e);
            showNotification(getMessage('unlockFailed') || 'Failed to unlock: ' + e.message, true);
            CryptoManager.clear();
        } finally {
            secureWipeArray(buf);
            hideGlobalLoadingIndicator()
        }
    }

    // Lock screen states (not-set-up / migration needed)

    function showNotSetUpScreen() {
        const container = document.querySelector('.login-container');
        if (!container) return;
        container.innerHTML = `
            <div class="login-header">
                <div class="login-icon"><img src="icons/icon128.png"></div>
                <h1 class="lock-title">Holy Private Bookmarks</h1>
                <p class="login-subtitle">Extension not set up yet. Please open the extension popup to create a password.</p>
            </div>
            <button id="open-extension" class="unlock-button" style="margin-top:20px;">Open Extension</button>
        `;
        document.getElementById('open-extension')?.addEventListener('click', () => {
            if (chrome.action?.openPopup) chrome.action.openPopup();
        });
    }

    function showMigrationScreen() {
        const container = document.querySelector('.login-container');
        if (!container) return;
        container.innerHTML = `
            <div class="login-header">
                <div class="login-icon"><img src="icons/icon128.png"></div>
            </div>
            <h1 class="lock-title">Update Required</h1>
            <p class="login-subtitle">The extension has been updated with improved security.</p>
            <p class="login-subtitle" style="margin-bottom:20px;">Please open the extension popup to migrate your data to the new secure format.</p>
            <button id="open-popup" class="unlock-button">Open Popup</button>
        `;
        document.getElementById('open-popup')?.addEventListener('click', () => {
            chrome.action.openPopup();
        });
    }

    function showReloadingScreen() {
        const lockScreen       = document.getElementById('lock-screen');
        const mainContainer    = document.querySelector('.container');
        if (lockScreen) {
            lockScreen.style.display = 'flex';
            lockScreen.innerHTML = `
                <div class="login-container">
                    <div class="login-header">
                        <div class="login-icon"><img src="icons/icon128.png"></div>
                        <h1 class="lock-title">Holy Private Bookmarks</h1>
                        <p class="login-subtitle">manager is reloading...</p>
                        <div style="margin-top:20px;color:var(--text-secondary);font-size:14px;">
                            Please wait while the manager updates
                        </div>
                    </div>
                </div>
            `;
        }
        if (mainContainer) mainContainer.style.display = 'none';
    }

    // Public API

    return {
        init(deps) { Object.assign(_deps, deps); },

        unlock,
        lockManager,
        manualLock,
        initLockButton,
        initActivityTracking,
        resetInactivityTimer,
        showNotSetUpScreen,
        showMigrationScreen,
        showReloadingScreen,

        isLocked: () => _isLocked
    };

})();

if (typeof window !== 'undefined') window.ManagerLock = ManagerLock;
if (typeof module !== 'undefined') module.exports = ManagerLock;

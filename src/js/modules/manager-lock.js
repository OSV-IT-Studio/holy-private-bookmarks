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
		window.QuickActions?.closeAll();
        if (_deps.getData()) wipeUserData(_deps.getData());

        CryptoManager.clear();
        setData({ folders: [] });
        clearManagerCaches();
        clearAllSharedCaches();
		
		_deps.setCurrentFolderId?.('all');
        
       const folderTree = document.getElementById('folder-tree');
    if (folderTree) {
        const allBookmarksText = getMessage('allBookmarks');
        
        folderTree.innerHTML = `
            <li class="folder-item all-bookmarks active" data-folder-id="all">
                <div class="folder-content">
                    <span class="folder-toggle">▶</span>
                    <div class="folder-icon">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8">
                            <polygon points="9 1 11.5 6.5 17 7.5 13 11.5 14 17 9 14 4 17 5 11.5 1 7.5 6.5 6.5 9 1" fill="currentColor" fill-opacity="0.15"/>
                        </svg>
                    </div>
                    <div class="folder-name">${allBookmarksText}</div>
                </div>
                <div class="folder-badge" id="all-count">0</div>
            </li>
        `;
    }

    
    const breadcrumbs = document.getElementById('breadcrumbs');
if (breadcrumbs) {
    const allBookmarksText = getMessage('allBookmarks');
    breadcrumbs.innerHTML = `
        <span class="breadcrumb-item active" data-folder-id="all">
            <svg class="breadcrumb-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            ${allBookmarksText}
        </span>
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
            if (title) title.textContent = getMessage('noBookmarksInFolder');
            if (desc)  desc.textContent  = getMessage('addBookmarksToGetStarted');
        }

        const allCount = document.getElementById('all-count');
        if (allCount) allCount.textContent = '0';

        

        _deps.resetVirtualScroll();

        window.LoginUI.showLoginSection(_buildLoginOpts());

        showNotification(getMessage('managerLocked'), false);
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

        const el  = document.getElementById('password');
        if (!el) return;
        const buf = new TextEncoder().encode(el.value);
        el.value  = '';

        if (!buf || buf.length === 0) {
            showNotification(getMessage('wrongPassword'), true);
            return;
        }

        const password = new TextDecoder().decode(buf);

        const loginContainer = document.querySelector('.login-container');
        try {
			const unlockText = getMessage('unlocking');
			showGlobalLoadingIndicator(loginContainer, unlockText);
            const stored     = await chrome.storage.local.get(STORAGE_KEY);
            const storedData = stored[STORAGE_KEY];

            if (!storedData) {
                return;
            }

            if (storedData.version !== 2) {
                return;
            }

            const isValid = await CryptoManager.verifyPassword(password, storedData);
            if (!isValid) {
                showNotification(getMessage('wrongPassword'), true);
                return;
            }

            const initSuccess = await CryptoManager.initAfterVerification(password, storedData);
            if (!initSuccess) throw new Error('Failed to initialize crypto');

            const decrypted = await CryptoManager.decrypt(storedData.encrypted);
            setData(JSON.parse(decrypted));
            _isLocked = false;

            
            document.querySelector('.container').style.display = 'flex';
            document.getElementById('login')?.remove();
            document.getElementById('login-temp-styles')?.remove();
            reset();
            onUnlockSuccess();

        } catch (e) {
            console.error('Unlock error:', e);
            showNotification(getMessage('unlockFailed') + e.message, true);
            CryptoManager.clear();
        } finally {
            secureWipeArray(buf);
            hideGlobalLoadingIndicator(loginContainer)
        }
    }

    

    function showNotSetUpScreen() {
        const { getMessage } = _deps;
        const loginSection = window.LoginUI.ensureLoginSection();
        window.LoginUI.ensureLoginStyles();
        document.querySelector('.container').style.display = 'none';
        loginSection.style.display = 'flex';
		loginSection.style.opacity = '1';
        loginSection.innerHTML = `
            <div class="login-container" style="display: none;">
                <div class="login-header">
                    <div class="login-icon"><img src="icons/icon128.png"></div>
                    <h1 class="lock-title">${getMessage('notSetUpTitle')}</h1>
                    <p class="login-subtitle">${getMessage('notSetUpSubtitle')}</p>
                </div>
                <button id="open-extension" class="unlock-button" style="margin-top:20px;">${getMessage('notSetUpButton')}</button>
            </div>
        `;
        document.getElementById('open-extension')?.addEventListener('click', () => {
            if (chrome.action?.openPopup) chrome.action.openPopup();
        });
    }

    function showMigrationScreen() {
        const { getMessage } = _deps;
        const loginSection = window.LoginUI.ensureLoginSection();
        window.LoginUI.ensureLoginStyles();
        document.querySelector('.container').style.display = 'none';
        loginSection.style.display = 'flex';
        loginSection.style.opacity = '1';
        loginSection.innerHTML = `
            <div class="login-container"  style="display: none;">
                <div class="login-header">
                    <div class="login-icon"><img src="icons/icon128.png"></div>
                </div>
                <h1 class="lock-title">${getMessage('migrationScreenTitle')}</h1>
                <p class="login-subtitle">${getMessage('migrationScreenBody1')}</p>
                <p class="login-subtitle" style="margin-bottom:20px;">${getMessage('migrationScreenBody2')}</p>
                <button id="open-popup" class="unlock-button">${getMessage('migrationScreenButton')}</button>
            </div>
        `;
        document.getElementById('open-popup')?.addEventListener('click', () => {
            chrome.action.openPopup();
        });
    }

    function showReloadingScreen() {
        const { getMessage } = _deps;
        let lockScreen = document.getElementById('login');
        if (!lockScreen) {
            lockScreen = window.LoginUI.ensureLoginSection();
        }
        const mainContainer    = document.querySelector('.container');
        if (lockScreen) {
            lockScreen.style.display = 'flex';
			lockScreen.style.opacity = '1';
            lockScreen.innerHTML = `
                <div class="login-container" style="display: none;">
                    <div class="login-header">
                        <div class="login-icon"><img src="icons/icon128.png"></div>
                        <h1 class="lock-title">Holy Private Bookmarks</h1>
                        <p class="login-subtitle">${getMessage('reloadingSubtitle')}</p>
                        <div style="margin-top:20px;color:var(--text-secondary);font-size:14px;">
                            ${getMessage('reloadingWait')}
                        </div>
                    </div>
                </div>
            `;
        }
        if (mainContainer) mainContainer.style.display = 'none';
    }

    // Build opts object for LoginUI

    function _buildLoginOpts() {
        return {
            getMessage:    _deps.getMessage,
            STORAGE_KEY:   _deps.STORAGE_KEY,
            unlock,
            escapeHtml:    _deps.escapeHtml,
        };
    }



    function showLockScreen() {
        window.LoginUI.showLoginSection(_buildLoginOpts());
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
        showLockScreen,
        showNotSetUpScreen,
        showMigrationScreen,
        showReloadingScreen,

        isLocked: () => _isLocked
    };

})();

if (typeof window !== 'undefined') window.ManagerLock = ManagerLock;
if (typeof module !== 'undefined') module.exports = ManagerLock;
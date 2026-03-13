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

// MODULE: popup-ui.js
// Handles: section switching, login/setup screen rendering, localization,
//          notification bar, theme loader hide

const PopupUI = (function () {

    let _deps = {};

    // Localization

    function localizePage() {
        const getMessage = _deps.getMessage;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key  = el.getAttribute('data-i18n');
            const text = getMessage(key);
            if (!text) return;
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = text;
            } else {
                el.textContent = text;
            }
        });

        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key  = el.getAttribute('data-i18n-title');
            const text = getMessage(key);
            if (text) el.title = text;
        });
    }

    //Section management

    function showSection(id) {
        document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
        const section = document.getElementById(id);
        if (section) section.style.display = 'block';

        if (id === 'main') {
            _deps.renderTree();
            _deps.startAutoLock();

            const pb = _deps.pendingBookmarkRef;
            if (pb.value) {
                _deps.openAddBookmarkModal(pb.value.title, pb.value.url);
                pb.value = null;
            }
        }
    }

    //Setup screen

    function loadSetupContent() {
        const getMessage = _deps.getMessage;
        const setupSection = document.getElementById('setup');
        if (!setupSection) return;

        setupSection.innerHTML = `
            <h1 data-i18n="extensionName">Holy Private</h1>
            <p class="subtitle" data-i18n="createPassword"></p>
            <input type="password" id="new-pass" data-i18n="newPassword" placeholder="">
            <input type="password" id="confirm-pass" data-i18n="confirmPassword" placeholder="">

            <div class="password-warning" style="
                background: rgba(255, 64, 96, 0.1);
                border-radius: 12px;
                padding: 16px;
                margin: 16px 0;
                border-left: 4px solid var(--danger);
                text-align: left;
                font-size: 14px;
                color: var(--text-secondary);
            ">
                <p style="margin: 0 0 8px 0; color: var(--text-primary); font-weight: 600;">
                    ⚠️ <span data-i18n="importantWarning"></span>
                </p>
                <ul style="margin: 0; padding-left: 20px; line-height: 1.5;">
                    <li><span data-i18n="passwordCannotBeRecovered"></span></li>
                    <li><span data-i18n="noPasswordReset"></span></li>
                    <li><span data-i18n="weDontStorePassword"></span></li>
                    <li><span data-i18n="bookmarksEncrypted"></span></li>
                </ul>
                <p style="margin: 12px 0 0 0; font-weight: 600; color: var(--accent);">
                    💡 <span data-i18n="savePasswordSecurely"></span>
                </p>
            </div>

            <button class="btn-primary" id="create-pass" data-i18n="createStorage"></button>
        `;

        document.getElementById('create-pass')?.addEventListener('click', _deps.createMasterPassword);

        const newPassInput     = document.getElementById('new-pass');
        const confirmPassInput = document.getElementById('confirm-pass');

        newPassInput?.addEventListener('keypress', e => {
            if (e.key === 'Enter' && confirmPassInput?.value) _deps.createMasterPassword();
        });
        confirmPassInput?.addEventListener('keypress', e => {
            if (e.key === 'Enter') _deps.createMasterPassword();
        });

        localizePage();
    }

    function showSetupSection() {
        let setupSection = document.getElementById('setup');
        if (!setupSection) {
            setupSection = document.createElement('div');
            setupSection.id = 'setup';
            setupSection.className = 'section';
            document.querySelector('.container').appendChild(setupSection);
        }
        loadSetupContent();
        showSection('setup');
        setTimeout(() => document.getElementById('new-pass')?.focus(), 100);
    }

    //Login screen

    let isLoginContentLoading = false;

    function loadLoginContent(showPendingNotification = false, bookmarkTitle = '') {
        const { getMessage, escapeHtml, STORAGE_KEY } = _deps;

        if (!document.getElementById('login-temp-styles')) {
            const link = document.createElement('link');
            link.id   = 'login-temp-styles';
            link.rel  = 'stylesheet';
            link.href = 'css/login.css';
            document.head.appendChild(link);
        }

        if (isLoginContentLoading) return;
        isLoginContentLoading = true;

        const loginSection = document.getElementById('login');
        if (!loginSection) { isLoginContentLoading = false; return; }

        document.getElementById('login-notification-bar')?.remove();

        chrome.storage.local.get(STORAGE_KEY).then(stored => {
            const needsMigration = stored[STORAGE_KEY] &&
                !stored[STORAGE_KEY].version &&
                stored[STORAGE_KEY].salt &&
                stored[STORAGE_KEY].encrypted;

            const hasBar = needsMigration || showPendingNotification;

            loginSection.innerHTML = `
                <div class="login-container" style="margin-top: ${hasBar ? '100px' : '0'}; transition: margin-top 0.3s ease;">
                    <div class="login-header">
                        <div class="login-icon">
                            <img src="icons/icon128.png" alt="Holy Private Bookmarks">
                        </div>
                        <h1 data-i18n="extensionName">Holy Private Bookmarks</h1>
                        <p class="login-subtitle" data-i18n="enterMasterPassword">Enter your master password to access bookmarks</p>
                    </div>

                    <div class="password-field">
                        <input type="password" id="password" class="password-input"
                               data-i18n="masterPassword" placeholder="Master password" autofocus>
                    </div>

                    <button class="unlock-button" id="unlock" data-i18n="unlock">
                        <span class="unlock-button-content">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                <line x1="12" y1="16" x2="12" y2="16" />
                            </svg>
                            <span data-i18n="unlock">Unlock</span>
                        </span>
                    </button>
                </div>
            `;

            // Notification bar (migration notice or pending bookmark notice)
            if (hasBar && !document.getElementById('login-notification-bar')) {
                const bar = document.createElement('div');
                bar.id = 'login-notification-bar';

                if (needsMigration) {
                    bar.innerHTML = `
                        <div class="notice-content">
                            <div class="notice-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffc107" stroke-width="2">
                                    <path d="M13 2L3 14h8l-2 8 10-12h-8l2-8z" />
                                </svg>
                            </div>
                            <div>
                                <p class="notice-title migration">${getMessage('migrationRequired')}</p>
                                <p class="notice-text">${getMessage('migrationInstruction')}</p>
                            </div>
                        </div>
                    `;
                } else if (showPendingNotification) {
                    bar.innerHTML = `
                        <div class="notice-content">
                            <div class="pending-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2">
                                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                                </svg>
                            </div>
                            <div>
                                <p class="notice-title pending">${getMessage('pendingBookmarkNotification')}</p>
                                <p class="notice-text">${getMessage('pendingBookmarkInstruction')}</p>
                                ${bookmarkTitle ? `
                                    <div class="tree-item w-100">
                                        <div class="item-header">
                                            <div class="item-title">
                                                <span class="icon bookmark">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                                        <path d="M5 4C5 2.89543 5.89543 2 7 2H17C18.1046 2 19 2.89543 19 4V21L12 17L5 21V4Z" fill="currentColor"/>
                                                    </svg>
                                                </span>
                                                <span class="bookmark-title">${escapeHtml(bookmarkTitle)}</span>
                                            </div>
                                        </div>
                                    </div>` : ''}
                            </div>
                        </div>
                    `;
                }

                document.body.prepend(bar);
            }

            // Slide-in animation styles (injected once)
            if (!document.getElementById('notification-styles')) {
                const style = document.createElement('style');
                style.id = 'notification-styles';
                style.textContent = `
                    @keyframes notificationSlideDown {
                        from { opacity: 0; transform: translateY(-100%); }
                        to   { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes notificationSlideUp {
                        from { opacity: 1; transform: translateY(0); }
                        to   { opacity: 0; transform: translateY(-100%); }
                    }
                `;
                document.head.appendChild(style);
            }

            document.getElementById('unlock')?.addEventListener('click', _deps.unlock);
            document.getElementById('password')?.addEventListener('keypress', e => {
                if (e.key === 'Enter') _deps.unlock();
            });

            localizePage();
            isLoginContentLoading = false;

        }).catch(() => { isLoginContentLoading = false; });
    }

    function showLoginSection() {
        const pb             = _deps.pendingBookmarkRef;
        const hasPending     = !!pb.value;
        const bookmarkTitle  = pb.value?.title || '';

        let loginSection = document.getElementById('login');
        if (!loginSection) {
            loginSection = document.createElement('div');
            loginSection.id        = 'login';
            loginSection.className = 'login-section';
            document.body.appendChild(loginSection);
        }

        document.getElementById('main')?.style && (document.getElementById('main').style.display = 'none');
        document.getElementById('settings')?.style && (document.getElementById('settings').style.display = 'none');

        loadLoginContent(hasPending, bookmarkTitle);

        setTimeout(() => { loginSection.style.opacity = '1'; }, 50);
        setTimeout(() => document.getElementById('password')?.focus(), 100);
    }

    //Public API

    return {
        /** Inject shared dependencies */
        init(deps) { Object.assign(_deps, deps); },

        localizePage,
        showSection,
        showSetupSection,
        showLoginSection,
        loadLoginContent,
        loadSetupContent
    };

})();

if (typeof window !== 'undefined') window.PopupUI = PopupUI;
if (typeof module !== 'undefined') module.exports = PopupUI;

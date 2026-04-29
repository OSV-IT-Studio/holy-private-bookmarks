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



const LoginUI = (function () {

    let _isLoading = false;

    //  DOM helpers 

    function ensureLoginStyles() {
        if (!document.getElementById('login-temp-styles')) {
            const link = document.createElement('link');
            link.id   = 'login-temp-styles';
            link.rel  = 'stylesheet';
            link.href = 'css/login.css';
            document.head.appendChild(link);
        }
    }

    function ensureLoginSection() {
        let el = document.getElementById('login');
        if (!el) {
            el = document.createElement('div');
            el.id        = 'login';
            el.className = 'login-section';
            document.body.appendChild(el);
        }
        return el;
    }

    //  Core render 

    function renderLoginForm(opts) {
        const {
            getMessage,
            STORAGE_KEY,
            unlock,
            escapeHtml       = s => s,
            loadFaviconAsync,
            isFaviconEnabled,
            pendingBookmarkRef,
        } = opts;

        ensureLoginStyles();

        if (_isLoading) return;
        _isLoading = true;

        const loginSection = ensureLoginSection();

        document.getElementById('login-notification-bar')?.remove();

        const hasPending    = !!pendingBookmarkRef?.value;
        const bookmarkTitle = pendingBookmarkRef?.value?.title || '';
        const bookmarkUrl   = pendingBookmarkRef?.value?.url   || '';

        chrome.storage.local.get(STORAGE_KEY).then(stored => {
            const needsMigration = stored[STORAGE_KEY] &&
                !stored[STORAGE_KEY].version &&
                stored[STORAGE_KEY].salt &&
                stored[STORAGE_KEY].encrypted;

            const hasBar = needsMigration || hasPending;

            loginSection.innerHTML = `
                <div class="login-container" style="display: none; margin-top: ${hasBar ? '100px' : '0'}; transition: margin-top 0.3s ease;">
                    <div class="login-header">
                        <div class="login-icon">
                            <img src="icons/icon128.png" alt="Holy Private Bookmarks">
                        </div>
                        <h1 data-i18n="unlockTitle"></h1>
                    </div>

                    <div class="password-field">
                        <input type="password" id="password" class="password-input"
                               data-i18n="masterPassword" placeholder="" autofocus>
                    </div>

                    <div class="login-stay-unlocked">
                        <label class="login-stay-unlocked__label">
                            <input type="checkbox" id="login-stay-unlocked-checkbox" class="login-stay-unlocked__checkbox">
                            <span class="login-stay-unlocked__toggle" aria-hidden="true"></span>
							<span class="login-stay-unlocked__text" data-i18n="stayUnlocked"></span>
                        </label>
                    </div>

                    <button class="unlock-button" id="unlock">
                        <span data-i18n="unlock">Unlock</span>
                    </button>
                </div>
            `;

            // Notification bar
            if (hasBar && !document.getElementById('login-notification-bar')) {
                const bar = document.createElement('div');
                bar.id = 'login-notification-bar';
				bar.style.cssText = `display: none;`; document.body.prepend(bar);
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
                } else if (hasPending) {
                    bar.innerHTML = `
                        <div class="notice-content">
                            <div class="pending-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2">
                                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                                </svg>
                            </div>
                            <div style="min-width:0;" class="w-100">
                                <p class="notice-title pending">${getMessage('pendingBookmarkNotification')}</p>
                                <p class="notice-text">${getMessage('pendingBookmarkInstruction')}</p>
                                ${bookmarkTitle ? `
                                    <div class="tree-item" style="pointer-events:none;cursor:default;margin:8px 0 0 0;">
                                        <div class="bookmark-link" style="cursor:default;">
                                            <div class="item-header" style="min-height:44px;">
                                                <div class="item-title">
                                                    <span class="icon bookmark">
                                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <path d="M5 4C5 2.89543 5.89543 2 7 2H17C18.1046 2 19 2.89543 19 4V21L12 17L5 21V4Z" fill="currentColor"/>
                                                        </svg>
                                                    </span>
                                                    <span class="bookmark-title">${escapeHtml(bookmarkTitle)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>` : ''}
                            </div>
                        </div>
                    `;
                }

                document.body.prepend(bar);

                if (bookmarkUrl && isFaviconEnabled?.() && loadFaviconAsync) {
                    const iconEl = bar.querySelector('.icon.bookmark');
                    if (iconEl) loadFaviconAsync(bookmarkUrl, iconEl);
                }
            }

            // Event listeners
            document.getElementById('unlock')?.addEventListener('click', unlock);
            document.getElementById('password')?.addEventListener('keypress', e => {
                if (e.key === 'Enter') unlock();
            });

            // Stay unlocked checkbox
            const stayCheckbox = document.getElementById('login-stay-unlocked-checkbox');
            if (stayCheckbox) {
                chrome.storage.local.get('holyStayUnlocked').then(r => {
                    stayCheckbox.checked = !!r.holyStayUnlocked;
                }).catch(() => {});

                stayCheckbox.addEventListener('change', async (e) => {
                    await chrome.storage.local.set({ holyStayUnlocked: e.target.checked }).catch(() => {});
                });
            }

            if (window.HolyI18n?.localizePage) window.HolyI18n.localizePage();
            _isLoading = false;

        }).catch(() => { _isLoading = false; });
    }

    //  High-level show 

    function showLoginSection(opts) {
        const loginSection = ensureLoginSection();

        // Hide sibling sections (popup context)
        document.getElementById('setup-overlay')?.remove();
        document.getElementById('main')     ?.style &&
            (document.getElementById('main').style.display      = 'none');
        document.getElementById('settings') ?.style &&
            (document.getElementById('settings').style.display  = 'none');

        // Hide main content (manager context)
        const container = document.querySelector('.container');
        if (container) container.style.display = 'none';

        loginSection.style.display = 'flex';

        renderLoginForm(opts);

        setTimeout(() => { loginSection.style.opacity = '1'; }, 50);
        setTimeout(() => document.getElementById('password')?.focus(), 100);
    }

    //  Public API 

    return {
        ensureLoginStyles,
        ensureLoginSection,
        renderLoginForm,
        showLoginSection,
    };

})();

if (typeof window !== 'undefined') window.LoginUI = LoginUI;
if (typeof module !== 'undefined') module.exports = LoginUI;

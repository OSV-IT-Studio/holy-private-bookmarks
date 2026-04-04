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


    const localizePage = window.HolyI18n.localizePage;

    //Section management

    function showSection(id) {
        
        const setupOverlay = document.getElementById('setup-overlay');
        if (setupOverlay) {
            setupOverlay.remove();
            document.getElementById('setup-styles')?.remove();
        }

        const mainContainer = document.querySelector('.container');
        if (mainContainer) mainContainer.style.display = '';

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

    function loadSetupContent(container) {
        const getMessage = _deps.getMessage;
        const showLoader = window.HolyShared.showGlobalLoadingIndicator;
		const hideLoader = window.HolyShared.hideGlobalLoadingIndicator;
        const setupSection = container || document.getElementById('setup');
        if (!setupSection) return;

        
        const t = {
            name:           getMessage('createStorage'),
            welcome:        getMessage('createPassword'),
            tabNew:         getMessage('setupTabNew'),
            tabRestore:     getMessage('setupTabRestore'),
            labelPass:      getMessage('newPassword'),
            phPass:         getMessage('newPassword'),
            labelConfirm:   getMessage('confirmPassword'),
            phConfirm:      getMessage('confirmPassword'),
            createBtn:      getMessage('createStorage'),
            restoreTitle:   getMessage('setupTabRestore'),
            dropTitle:      getMessage('restoreDropTitle'),
            restoreBtn:     getMessage('setupTabRestore'),
        };

        setupSection.innerHTML = `
            <div id="setup-overlay-inner" style=" display: none;
">
                <div class="setup-card" id="setup-card">
                    <div class="sc-icon"><img src="icons/icon128.png" alt=""></div>
                    <h1 class="sc-title">${t.name}</h1>
                    <div class="sc-sub">${t.welcome}</div>

                    <div class="sc-tabs">
                        <button class="sc-tab active" id="tab-new">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                                <rect x="3" y="11" width="18" height="11" rx="2"/>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                            ${t.tabNew}
                        </button>
                        <button class="sc-tab" id="tab-restore">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                            ${t.tabRestore}
                        </button>
                    </div>

                    <div class="sc-panel visible" id="panel-new">
                        <div>
                            
                            <div class="sc-input-wrap">
                                <input type="password" id="new-pass" autocomplete="new-password" placeholder="${t.phPass}">
                                <button class="sc-eye" id="eye-new" type="button" tabindex="-1">
                                    <svg id="eye-new-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                        <circle cx="12" cy="12" r="3"/>
                                    </svg>
                                </button>
                            </div>
                            <div class="sc-strength">
                                <div class="sc-bar-bg"><div class="sc-bar-fill" id="strength-fill"></div></div>
                                <span class="sc-bar-label" id="strength-label"></span>
                            </div>
                        </div>

                        <div>
                            
                            <div class="sc-input-wrap">
                                <input type="password" id="confirm-pass" autocomplete="new-password" placeholder="${t.phConfirm}">
                                <button class="sc-eye" id="eye-confirm" type="button" tabindex="-1">
                                    <svg id="eye-confirm-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                        <circle cx="12" cy="12" r="3"/>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        

                        <button class="unlock-button" id="create-pass">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                                <rect x="3" y="11" width="18" height="11" rx="2"/>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                            ${t.createBtn}
                        </button>
                    </div>

                    <div class="sc-panel" id="panel-restore">
                        

                        <div class="sc-drop" id="restore-drop-zone" role="button" tabindex="0">
                            <div class="sc-drop-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                            </div>
                            <span class="sc-drop-title">${t.dropTitle}</span>
                            <span class="sc-drop-sub">holy-private-backup.json</span>
                            <div class="sc-file-chip" id="restore-file-name">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                </svg>
                                <span id="restore-file-label"></span>
                            </div>
                            <input type="file" id="restore-backup-file" accept=".json" style="display:none">
                        </div>

                        <button class="unlock-button" id="restore-btn" disabled>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                            ${t.restoreBtn}
                        </button>
                    </div>
                </div>
            </div>
        `;



                //  Tab switching 
        const tabNew       = document.getElementById('tab-new');
        const tabRestore   = document.getElementById('tab-restore');
        const panelNew     = document.getElementById('panel-new');
        const panelRestore = document.getElementById('panel-restore');

        tabNew.addEventListener('click', () => {
            tabNew.classList.add('active');     tabRestore.classList.remove('active');
            panelNew.classList.add('visible');  panelRestore.classList.remove('visible');
            setTimeout(() => document.getElementById('new-pass')?.focus(), 50);
        });
        tabRestore.addEventListener('click', () => {
            tabRestore.classList.add('active');   tabNew.classList.remove('active');
            panelRestore.classList.add('visible'); panelNew.classList.remove('visible');
        });

        //  Password visibility toggles 
        function makeEyeToggle(btnId, inputId, iconId) {
            document.getElementById(btnId)?.addEventListener('click', () => {
                const input = document.getElementById(inputId);
                const icon  = document.getElementById(iconId);
                if (!input) return;
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                icon.innerHTML = show
                    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
                    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
            });
        }
        makeEyeToggle('eye-new',     'new-pass',     'eye-new-icon');
        makeEyeToggle('eye-confirm', 'confirm-pass', 'eye-confirm-icon');

        //  Password strength meter 
        const strengthFill  = document.getElementById('strength-fill');
        const strengthLabel = document.getElementById('strength-label');

        function calcStrength(pw) {
            if (!pw) return { pct: '0%', color: 'transparent', label: '' };
            let s = 0;
            if (pw.length >= 8)            s++;
            if (pw.length >= 12)           s++;
            if (/[A-Z]/.test(pw))          s++;
            if (/[0-9]/.test(pw))          s++;
            if (/[^A-Za-z0-9]/.test(pw))   s++;
            const levels = [
                { pct: '0%',   color: 'transparent', label: '' },
                { pct: '25%',  color: '#ff4060', label: getMessage('strengthWeak')},
                { pct: '50%',  color: '#ffa040', label: getMessage('strengthFair')},
                { pct: '75%',  color: '#40c080', label: getMessage('strengthGood')},
                { pct: '90%',  color: '#00d4ff', label: getMessage('strengthStrong')},
                { pct: '100%', color: '#00d4ff', label: getMessage('strengthStrong')},
            ];
            return levels[Math.min(s, 5)];
        }

        document.getElementById('new-pass')?.addEventListener('input', e => {
    const strengthContainer = document.querySelector('.sc-strength');
    if (e.target.value.length > 0) {
        strengthContainer.classList.add('visible');
    } else {
        strengthContainer.classList.remove('visible');
    }
    
    const s = calcStrength(e.target.value);
    strengthFill.style.width = s.pct;
    strengthFill.style.background = s.color;
    strengthLabel.textContent = s.label;
    strengthLabel.style.color = s.color || 'var(--text-secondary)';
});

        //  Create vault 

        document.getElementById('new-pass')?.addEventListener('keypress', e => {
            if (e.key === 'Enter' && document.getElementById('confirm-pass')?.value)
                _deps.createMasterPassword();
        });
        document.getElementById('confirm-pass')?.addEventListener('keypress', e => {
            if (e.key === 'Enter') _deps.createMasterPassword();
        });

        //  Restore backup 
        const dropZone    = document.getElementById('restore-drop-zone');
        const fileInput   = document.getElementById('restore-backup-file');
        const fileNameEl  = document.getElementById('restore-file-name');
        const fileLabelEl = document.getElementById('restore-file-label');
        const restoreBtn  = document.getElementById('restore-btn');
        let _pendingFile  = null;

        function selectFile(file) {
            if (!file || !file.name.endsWith('.json')) {
                _deps.showNotification(
                    getMessage('invalidFile'), true);
                return;
            }
            _pendingFile = file;
            fileLabelEl.textContent  = file.name;
            fileNameEl.style.display = 'flex';
            restoreBtn.disabled      = false;
        }

        dropZone?.addEventListener('click', () => fileInput?.click());
        dropZone?.addEventListener('keypress', e => {
            if (e.key === 'Enter' || e.key === ' ') fileInput?.click();
        });
        dropZone?.addEventListener('dragover', e => {
            e.preventDefault(); dropZone.classList.add('drag-over');
        });
        dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone?.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            selectFile(e.dataTransfer?.files[0]);
        });
        fileInput?.addEventListener('change', e => {
            selectFile(e.target.files[0]);
            fileInput.value = '';
        });

        restoreBtn?.addEventListener('click', async () => {
            if (!_pendingFile) return;
            restoreBtn.disabled = true;
            const screen = document.getElementById('setup-card');
            showGlobalLoadingIndicator(screen,
                getMessage('importingBackup'));
            try {
                
                await ImportExportManager.importData(
                    { target: { files: [_pendingFile], value: '' } },
                    () => {
                        if (typeof lock === 'function') lock();
                        PopupUI.showLoginSection();
                    }
                );
            } finally {
                _pendingFile = null;
                hideGlobalLoadingIndicator(screen);
                restoreBtn.disabled = false;
            }
        });

        localizePage();
    }

    function showSetupSection() {
        
        if (!document.getElementById('setup-styles')) {
            const link = document.createElement('link');
            link.id   = 'setup-styles';
            link.rel  = 'stylesheet';
            link.href = 'css/setup.css';
            document.head.appendChild(link);
        }

        
        const mainContainer = document.querySelector('.container');
        if (mainContainer) mainContainer.style.display = 'none';

        
        let setupOverlay = document.getElementById('setup-overlay');
        if (!setupOverlay) {
            setupOverlay = document.createElement('div');
            setupOverlay.id = 'setup-overlay';
            document.body.appendChild(setupOverlay);
        }

        loadSetupContent(setupOverlay);

        setTimeout(() => document.getElementById('new-pass')?.focus(), 120);
    }

    //Login screen — delegates to shared LoginUI module

    function loadLoginContent(showPendingNotification = false, bookmarkTitle = '', bookmarkUrl = '') {
        const { getMessage, escapeHtml, STORAGE_KEY, loadFaviconAsync, isFaviconEnabled } = _deps;
        window.LoginUI.renderLoginForm({
            getMessage,
            STORAGE_KEY,
            unlock:            _deps.unlock,
            escapeHtml,
            loadFaviconAsync,
            isFaviconEnabled,
            pendingBookmarkRef: showPendingNotification
                ? { value: { title: bookmarkTitle, url: bookmarkUrl } }
                : { value: null },
        });
    }

    function showLoginSection() {
        const pb           = _deps.pendingBookmarkRef;
        const { getMessage, escapeHtml, STORAGE_KEY, loadFaviconAsync, isFaviconEnabled } = _deps;
        window.LoginUI.showLoginSection({
            getMessage,
            STORAGE_KEY,
            unlock:            _deps.unlock,
            escapeHtml,
            loadFaviconAsync,
            isFaviconEnabled,
            pendingBookmarkRef: pb,
        });
    }

    //Public API

    return {
        
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
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

// Dependency guards

if (!window.HolyShared)          throw new Error('HolyShared is required but not loaded');
if (!window.SecureCrypto)        throw new Error('SecureCrypto is required but not loaded');
if (!window.HTMLImporter)        throw new Error('HTMLImporter module is not loaded');
if (!window.DragDropManager)     throw new Error('DragDropManager not loaded!');
if (!window.PopupAuth)           throw new Error('PopupAuth module not loaded!');
if (!window.PopupUI)             throw new Error('PopupUI module not loaded!');
if (!window.PopupTree)           throw new Error('PopupTree module not loaded!');
if (!window.PopupBookmarks)      throw new Error('PopupBookmarks module not loaded!');
if (!window.DonationReminder)    throw new Error('DonationReminder module not loaded!');
if (!window.ImportExportManager) throw new Error('ImportExportManager not loaded!');

// Shared imports

const Shared = window.HolyShared;
const {
    STORAGE_KEY: SHARED_STORAGE_KEY,
    INACTIVITY_TIMEOUT: SHARED_INACTIVITY_TIMEOUT,
    VIRTUAL_SCROLL_CONFIG,
buildFolderTreePicker,
    LRUMap,
    messageCache,
    faviconCache,
    faviconPromises,
    virtualScrollCache,

    secureWipeArray,
    wipeUserData,
    clearAllSharedCaches,

    getCachedElement,
    clearElementCache,

    getMessage,

    normalizePath,
    getItemByPath,
    getParentByPath,
    removeItemByPath,
    generateFolderUid,

    countItemsInFolder,
	countFoldersInFolder,
    buildFolderOptions,

    isFaviconEnabled,
    setFaviconEnabled,
    getDomainFromUrl,
    loadFaviconAsync,

    isQuickCloseEnabled,
    setQuickCloseEnabled,

    isAlwaysIncognito,
    setAlwaysIncognito,

    saveEncrypted,
    showNotification,
    showConfirm,
    showPrompt,
    escapeHtml,

    openInPrivateTab,
    convertChromeBookmarks,

    debounce,
    throttle,

    showLoadingIndicator,
    hideLoadingIndicator,
	showGlobalLoadingIndicator,
    hideGlobalLoadingIndicator
, openModal, closeModal, closeModalWithAnimation, createModalEscHandler} = Shared;

// App-level state

const STORAGE_KEY       = SHARED_STORAGE_KEY || 'holyPrivateData';
const INACTIVITY_TIMEOUT = SHARED_INACTIVITY_TIMEOUT || 10 * 60 * 1000;
const CryptoManager     = window.SecureCrypto;
const SESSION_PREF_KEY  = 'holyStayUnlocked'; 

let data              = { folders: [] };
let autoLockTimer;
let isInitialized     = false;


const pendingBookmarkRef = { value: null };


const getData  = () => data;
const setData  = (d) => { data = d; };

// Auto-lock

function startAutoLock() {
    clearTimeout(autoLockTimer);
    chrome.storage.local.get(SESSION_PREF_KEY, (r) => {
        if (!r[SESSION_PREF_KEY]) {
            autoLockTimer = setTimeout(lock, INACTIVITY_TIMEOUT);
        }
    });
}

function lock() {
    clearTimeout(autoLockTimer);
	QuickActions?.closeAll();
    if (data) wipeUserData(data);
    CryptoManager.clear();
    CryptoManager.clearSession().catch(() => {});
    data = { folders: [] };
    pendingBookmarkRef.value = null;
    virtualScrollCache?.clear?.();
    clearElementCache();
    const tree = document.getElementById('tree');
    if (tree) tree.innerHTML = '';
    PopupUI.showLoginSection();
}

// Persistence

async function saveChanges() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    if (stored[STORAGE_KEY]) {
        await saveEncrypted(data, CryptoManager);
    }
    
}

async function saveAndRefresh() {
    await saveChanges();

    virtualScrollCache?.clear?.();
    PopupTree.renderTree();
}



const ensureFolderUids = Shared.ensureFolderUids;

function performFullCleanup() {
    if (data) wipeUserData(data);
    clearAllSharedCaches();
    CryptoManager?.clear?.();
    data = { folders: [] };
    pendingBookmarkRef.value = null;
    clearElementCache();
    virtualScrollCache?.clear?.();
    if (window.gc) { try { window.gc(); setTimeout(() => { try { window.gc(); } catch (e) {} }, 100); } catch (e) {} }
}

// Open manager tab

async function openManager() {
    window.close();
    const managerUrl = chrome.runtime.getURL('manager.html');
    try {
        const tabs = await chrome.tabs.query({ url: managerUrl });
        if (tabs.length > 0 && tabs[0].id) {
            await chrome.tabs.update(tabs[0].id, { active: true });
            await chrome.windows.update(tabs[0].windowId, { focused: true });
        } else {
            chrome.tabs.create({ url: managerUrl });
        }
    } catch {
        chrome.tabs.create({ url: managerUrl });
    }
}

// Favicon toggle

async function initFaviconToggle() {
    const toggle = document.getElementById('favicon-toggle');
    if (!toggle) return;
    toggle.checked = isFaviconEnabled();
    toggle.addEventListener('change', async e => {
        setFaviconEnabled(e.target.checked);
        faviconCache?.clear?.();
        faviconPromises?.clear?.();
        PopupTree.renderTree();
    });
}

// Quick Close toggle (shortcut injected dynamically)

async function isStayUnlockedEnabled() {
    const result = await chrome.storage.local.get(SESSION_PREF_KEY);
    return !!result[SESSION_PREF_KEY];
}

async function initStayUnlockedToggle() {
    const toggle  = document.getElementById('stay-unlocked-toggle');
    if (!toggle) return;

    const enabled = await isStayUnlockedEnabled();
    toggle.checked = enabled;

    toggle.addEventListener('change', async (e) => {
        const val = e.target.checked;

        if (val) {

            const confirmed = await showConfirm({
                warning: `
				<h2 class="hpb-modal__title hpb-modal__title--center">${getMessage('stayUnlocked')}</h2>
				<div style="text-align:left">${getMessage('stayUnlockedWarning')}</div>`,
                confirmLabel: getMessage('enable'),
                cancelLabel:  getMessage('cancel'),
            });
            if (!confirmed) {
                toggle.checked = false;
                return;
            }
            await chrome.storage.local.set({ [SESSION_PREF_KEY]: true });

            if (CryptoManager.isReady()) {
                await CryptoManager.saveToSession();
            }
        } else {
            await chrome.storage.local.set({ [SESSION_PREF_KEY]: false });
            await CryptoManager.clearSession();
        }
    });
}

async function initQuickCloseToggle() {
    const toggle = document.getElementById('quick-close-toggle');
    if (!toggle) return;

   
    try {
        const commands = await chrome.commands.getAll();
        const cmd = commands.find(c => c.name === 'quick-close-tab');
        const shortcut = cmd?.shortcut || 'Alt+A';
        const titleEl = document.querySelector('[data-i18n="quickCloseTab"]');
        if (titleEl) {
            titleEl.setAttribute('data-i18n-args', JSON.stringify([shortcut]));
            titleEl.textContent = chrome.i18n.getMessage('quickCloseTab', [shortcut]) || titleEl.textContent;
        }
    } catch (e) { }

    const result = await chrome.storage.local.get('holyQuickCloseEnabled');
    const enabled = !!result.holyQuickCloseEnabled;
    toggle.checked = enabled;
    
    setQuickCloseEnabled(enabled);

    toggle.addEventListener('change', async e => {
        const val = e.target.checked;
        setQuickCloseEnabled(val);
       
        chrome.runtime.sendMessage({ action: 'setQuickCloseEnabled', enabled: val }).catch(() => {});
    });
}

async function initAlwaysIncognitoToggle() {
    const toggle = document.getElementById('always-incognito-toggle');
    if (!toggle) return;
    toggle.checked = isAlwaysIncognito();
    toggle.addEventListener('change', e => {
        setAlwaysIncognito(e.target.checked);
    });
}

// Dependency bundle for sub-modules

function buildDeps() {
    return {
        // Constants
        STORAGE_KEY,
        VIRTUAL_SCROLL_CONFIG,

        // Crypto
        SecureCrypto: window.SecureCrypto,

        // State accessors
        getData,
        setData,
        pendingBookmarkRef,

        // Shared utils
        secureWipeArray,
        getMessage,
        escapeHtml,
        showNotification,
        showConfirm,
        showPrompt,
        showLoadingIndicator,
        hideLoadingIndicator,
        getCachedElement,
        normalizePath,
        getItemByPath,
        getParentByPath,
        removeItemByPath,
        generateFolderUid,
        countItemsInFolder,
		countFoldersInFolder,
        buildFolderOptions,
        buildFolderTreePicker,
        isFaviconEnabled,
        getDomainFromUrl,
        loadFaviconAsync,
        openInPrivateTab,
        isAlwaysIncognito,
        virtualScrollCache,
		showGlobalLoadingIndicator,
        hideGlobalLoadingIndicator,
        openModal,
        closeModal,
        closeModalWithAnimation,
        createModalEscHandler,
        // Cross-module calls
        showSection:          (id) => PopupUI.showSection(id),
        renderTree:           () => PopupTree.renderTree(),
        startAutoLock,
        saveAndRefresh,
        saveChanges,
        ensureFolderUids:     (items) => ensureFolderUids(items),
        openAddBookmarkModal: (...args) => PopupBookmarks.openAddBookmarkModal(...args),
        editBookmark:         (p) => PopupBookmarks.editBookmark(p),
        deleteBookmark:       (p) => PopupBookmarks.deleteBookmark(p),
        copyBookmarkUrl:      (u) => PopupBookmarks.copyBookmarkUrl(u),
        renameItem:           (p) => PopupBookmarks.renameItem(p),
        deleteItem:           (p) => PopupBookmarks.deleteItem(p),
        loadMoreFolderItems:  (...args) => PopupTree.loadMoreFolderItems(...args),
        unlock:               () => PopupAuth.unlock(),
        createMasterPassword: () => PopupAuth.createMasterPassword(),
    };
}

// Show blocking screen when manager tab is open

function showManagerBlockScreen(tabId, windowId) {

    document.querySelectorAll('section, .section, [id$="-section"]').forEach(el => {
        el.style.display = 'none';
    });

    const title       = getMessage('managerIsOpen');
    const desc        = getMessage('managerIsOpenDesc');
    const switchLabel = getMessage('switchToManager');

    const screen = document.createElement('div');
    screen.id = 'manager-block-screen';
    screen.style.cssText = [
        'position:fixed',
        'inset:0',
        'display:flex',
        'flex-direction:column',
        'align-items:center',
        'justify-content:center',
        'gap:20px',
        'padding:40px 32px',
        'text-align:center',
        'box-sizing:border-box',
        'z-index:99999',
        'background:var(--bg)',
    ].join(';');


    screen.innerHTML = `
        <div style="
            width:72px;height:72px;border-radius:50%;
            background:rgba(0,212,255,0.1);
            border:1.5px solid rgba(0,212,255,0.25);
            display:flex;align-items:center;justify-content:center;
            color:var(--accent);
            box-shadow:0 0 32px rgba(0,212,255,0.12);
        ">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.6"
                 stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18"/>
                <circle cx="7" cy="6" r="1" fill="currentColor" stroke="none"/>
                <circle cx="10" cy="6" r="1" fill="currentColor" stroke="none"/>
                <path d="M12 14v3M12 14l-2-2M12 14l2-2" stroke-width="1.5"/>
            </svg>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;max-width:280px;">
            <div style="font-weight:700;font-size:16px;color:var(--text-primary);letter-spacing:-.01em;">
                ${escapeHtml(title)}
            </div>
            <div style="font-size:13px;color:var(--text-tertiary);line-height:1.6;">
                ${escapeHtml(desc)}
            </div>
        </div>

        <button id="manager-block-switch" class="btn-primary w-au mt-16">
            
            ${escapeHtml(switchLabel)}
        </button>
    `;

    document.body.appendChild(screen);

    const btn = document.getElementById('manager-block-switch');
    btn?.addEventListener('mouseenter', () => {
        btn.style.transform = 'translateY(-2px)';
        btn.style.boxShadow = '0 8px 24px rgba(0,212,255,0.35)';
    });
    btn?.addEventListener('mouseleave', () => {
        btn.style.transform = '';
        btn.style.boxShadow = '0 4px 16px rgba(0,212,255,0.25)';
    });
    btn?.addEventListener('click', async () => {
        try {
            await chrome.tabs.update(tabId, { active: true });
            await chrome.windows.update(windowId, { focused: true });
        } catch {
            const managerUrl = chrome.runtime.getURL('manager.html');
            chrome.tabs.create({ url: managerUrl });
        }
        window.close();
    });
}

// About modal
function _openAboutModal() {
    const existing = document.getElementById('about-modal');
    if (existing) { openModal(existing); return; }

    const version = chrome.runtime.getManifest().version;

    const modal = document.createElement('div');
    modal.id        = 'about-modal';
    modal.className = 'hpb-modal';

    modal.innerHTML = `
        <div class="hpb-modal__dialog">
            <h2 class="hpb-modal__title hpb-modal__title--center">${getMessage('aboutExtension')}</h2>
            <div class="hpb-modal__body about-body">
                <div class="about-header">
                    <div class="about-icon"><img src="icons/icon48.png" alt=""></div>
                    <h3 class="about-subtitle">${getMessage('extensionName')}</h3>
                </div>
                <dl class="about-info-grid">
                    <dt>${getMessage('version')}</dt>
                    <dd>${escapeHtml(version)}</dd>
                    <dt>${getMessage('developer')}</dt>
                    <dd>OSV IT-Studio</dd>
                    <dt>License:</dt>
                    <dd>${getMessage('openSource')}</dd>
					
					<dt>${getMessage('githubRepo')}:</dt>
                    <dd><a href="https://github.com/OSV-IT-Studio/holy-private-bookmarks" target="_blank" style="color:inherit;opacity:.7;font-size:11px">https://github.com/OSV-IT-Studio/holy-private-bookmarks</a></dd>
					
                    <dt>Open Source libs:</dt>
                    <dd><a href="https://github.com/kazuhikoarase/qrcode-generator" target="_blank" style="color:inherit;opacity:.7;font-size:11px">QR Code Generator &copy; 2009 Kazuhiko Arase (MIT)</a></dd>
                </dl>
                
            </div>
            <div class="hpb-modal__footer">
                <button class="btn-secondary" id="close-about">${getMessage('close')}</button>
                
            </div>
        </div>
    `;

    const closeAndRemove = () => {
        closeModal(modal);
        modal.addEventListener('animationend', function onEnd(e) {
            if (e.target !== modal) return;
            modal.removeEventListener('animationend', onEnd);
            modal.remove();
        });
        document.removeEventListener('keydown', escHandler);
    };

    modal.querySelector('#close-about').addEventListener('click', closeAndRemove);
    modal.addEventListener('click', e => {
        if (e.target === modal && Date.now() - (modal._hpbOpenedAt || 0) > 50) closeAndRemove();
    });

    const escHandler = e => {
        if (e.key === 'Escape') closeAndRemove();
    };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(modal);
    openModal(modal);
}

// Main initialization

async function init() {
    if (isInitialized) return;

    try {
        const managerStatus = await chrome.runtime.sendMessage({ action: 'isManagerOpen' });
        if (managerStatus?.open) {
            if (window.HolyI18n?.localizePage) window.HolyI18n.localizePage();
            if (window.ThemeManager) {
                await window.ThemeManager.init().catch(() => {});
            }
            hideThemeLoader();
            showManagerBlockScreen(managerStatus.tabId, managerStatus.windowId);
            return;
        }
    } catch {  }


    if (window.HolyI18n?.localizePage) window.HolyI18n.localizePage();

	const justInstalled = await chrome.storage.local.get('donationReminderJustInstalled');
    if (justInstalled.donationReminderJustInstalled) {
        if (typeof window.DonationReminder !== 'undefined') {
            await window.DonationReminder.initOnInstall();
            await chrome.storage.local.remove('donationReminderJustInstalled');
        }
    }
    
    const safetyTimeout = setTimeout(() => { console.warn('Theme init timeout'); hideThemeLoader(); }, 3000);
    if (window.ThemeManager) {
        await window.ThemeManager.init();
        const themeContainer = document.getElementById('theme-selector-container');
        if (themeContainer) window.ThemeManager.createThemeSelector(themeContainer);
    }
    clearTimeout(safetyTimeout);
    hideThemeLoader();

    // Wire all modules
    const deps = buildDeps();
    PopupAuth.init(deps);
    PopupUI.init(deps);
    PopupTree.init(deps);
    PopupBookmarks.init(deps);

    initFaviconToggle();
    initQuickCloseToggle();
    initStayUnlockedToggle();
    initAlwaysIncognitoToggle();

    
    const [stored, session, stayPref] = await Promise.all([
        chrome.storage.local.get(STORAGE_KEY),
        chrome.storage.session.get(['pendingBookmarkAdd', '_hpbSession']),
        chrome.storage.local.get(SESSION_PREF_KEY),
    ]);

    if (session.pendingBookmarkAdd) {
        pendingBookmarkRef.value = session.pendingBookmarkAdd;
        await chrome.storage.session.remove('pendingBookmarkAdd');
    }


    if (stored[STORAGE_KEY]) {
        const d = stored[STORAGE_KEY];
        if (!d.version && d.salt && d.encrypted) {
            PopupUI.showLoginSection();
            isInitialized = true;
            return;
        }
    }

    if (!stored[STORAGE_KEY]) {
        PopupUI.showSetupSection();
    } else {

        const stayUnlocked = !!stayPref[SESSION_PREF_KEY];
        if (stayUnlocked && session._hpbSession && stored[STORAGE_KEY]) {
            const restored = await CryptoManager.restoreFromSession();
            if (restored) {
                try {
                    const storedData = stored[STORAGE_KEY];
                    const decrypted = await CryptoManager.decrypt(storedData.encrypted);
                    const loadedData = JSON.parse(decrypted);
                    if (ensureFolderUids) ensureFolderUids(loadedData.folders);
                    setData(loadedData);
                    await saveChanges();
                    PopupUI.showSection('main');
                    startAutoLock();
                    if (pendingBookmarkRef.value) {
                        PopupBookmarks.openAddBookmarkModal(pendingBookmarkRef.value.title, pendingBookmarkRef.value.url);
                        pendingBookmarkRef.value = null;
                    }
                    if (typeof window.DonationReminder !== 'undefined') {
                        setTimeout(() => window.DonationReminder.checkAndShowReminder(), 3000);
                    }
                    isInitialized = true;
                   
                } catch (e) {
                    
                    CryptoManager.clear();
                    await CryptoManager.clearSession();
                    PopupUI.showLoginSection();
                }
            } else {
                PopupUI.showLoginSection();
            }
        } else {
            PopupUI.showLoginSection();
        }
    }

    // Event handlers

    const handlers = {
		'#create-pass': () => PopupAuth.createMasterPassword(),
        '#unlock':                   () => PopupAuth.unlock(),
        '#lock':                     lock,
        '#add-current':              () => PopupBookmarks.addCurrentPage(),
        '#export':                   () => ImportExportManager.exportData(),
        '#export-html-btn':          () => ImportExportManager.exportToHTML(),
        '#import-btn':               () => getCachedElement('#import-file').click(),
        '#import-from-chrome':       () => ImportExportManager.importFromChromeBookmarks(data, saveAndRefresh),
        '#import-from-chrome-advanced': () => ImportExportManager.importFromChromeBookmarksAdvanced(data, saveAndRefresh),
        '#support-btn':              () => chrome.tabs.create({ url: chrome.runtime.getURL('donate.html') }),
        '#settings-btn':             () => PopupUI.showSection('settings'),
        '#back':                     () => PopupUI.showSection('main'),
        '#change-pass':              () => PopupAuth.changeMasterPassword(),
        '#manager-btn':              openManager,
        '#faq-btn':                  () => chrome.tabs.create({ url: 'https://osv-it-studio.github.io/holy-private-bookmarks#faq' }),
		'#survey-btn':               () => chrome.tabs.create({ url: 'https://docs.google.com/forms/d/e/1FAIpQLSfcEpeT2NA9b3XxZeR6gJjiUFBLgMJ0xE0kb0zolPssykLTag/viewform' }),
        '#quick-add-bookmark':       () => PopupBookmarks.openAddBookmarkModal('', 'https://'),
        '#open-github':              () => chrome.tabs.create({ url: 'https://github.com/OSV-IT-Studio/holy-private-bookmarks' }),
		'#rate-btn':                 () => { chrome.tabs.create({ url: 'https://chromewebstore.google.com/detail/holy-private-bookmarks-%E2%80%94/nnafnomgekidkehbgkfmhapccelgdbch/reviews' 
		});
		},
        '#about-btn':                () => { _openAboutModal(); },
        '#quick-add-folder':         () => PopupBookmarks.addFolder(),
        '#change-shortcut-btn':      () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }),
        '#clear-history':            () => {
            const btn = getCachedElement('#clear-history');
            if (btn && window.HistoryCleaner) {
                window.HistoryCleaner.clearBookmarksHistoryByDomain(btn, data.folders);
            }
        },
		'#changelog-btn':      async () => {
        
        let changelogData = [];
        try {
            const response = await fetch(chrome.runtime.getURL('changelog.json'));
            changelogData = await response.json();
        } catch (error) {
            if (window.HolyShared && window.HolyShared.showNotification) {
                window.HolyShared.showNotification(
                    getMessage('Error'), 
                    true
                );
            }
            return;
        }

        const modalBodyContent = changelogData.map((entry, i) => `
            <div class="changelog-entry">
                <div class="changelog-version-row">
                    <span class="changelog-version">v${escapeHtml(entry.version)}</span>
                    ${i === 0 ? '<span class="changelog-badge-latest">Latest</span>' : ''}
                    <span class="changelog-version-divider"></span>
                </div>
                <ul class="changelog-list">
                    ${entry.changes.map(change => `<li>${escapeHtml(change)}</li>`).join('')}
                </ul>
            </div>
        `).join('');

        const modal = document.createElement('div');
        modal.className = 'changelog-modal hpb-modal';
		
        modal.innerHTML = `
            <div class="hpb-modal__content" style="max-width: 560px; width: 90%;">
                <div class="hpb-modal__header">
                    <h2 class="hpb-modal__title">${getMessage('changelog')}</h2>
                    <button class="hpb-modal__close" id="changelog-close">&times;</button>
                </div>
                <div class="hpb-modal__body">
                    ${modalBodyContent}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeAndRemoveModal = () => {
            if (modal && modal.parentNode) {

                closeModal(modal);

                modal.addEventListener('animationend', function onAnimationEnd(e) {
                    if (e.target === modal) {
                        modal.removeEventListener('animationend', onAnimationEnd);
                        if (modal.parentNode) {
                            modal.parentNode.removeChild(modal);
                        }
                    }
                });
            }
        };

        const closeBtn = modal.querySelector('#changelog-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeAndRemoveModal);
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal && (Date.now() - (modal._hpbOpenedAt || 0) > 50)) {
                closeAndRemoveModal();
            }
        });

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeAndRemoveModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        

        modal._escHandler = escHandler;


        openModal(modal);
    }
    };

    Object.entries(handlers).forEach(([selector, handler]) => {
        getCachedElement(selector)?.addEventListener('click', handler);
    });

    // JSON import
    getCachedElement('#import-file')?.addEventListener('change', e => {
        ImportExportManager.importData(e, () => { lock(); PopupUI.showLoginSection(); });
    });

    // HTML import
    if (window.HTMLImporter) {
        window.HTMLImporter.initPopupImporter({
            maxFileSize: 1 * 1024 * 1024,
            onSuccess: async result => {
                
                const rollbackLength = data.folders.length;

                data.folders.push(...result.folders);

                try {
                    await saveAndRefresh();
                } catch (saveError) {
                    
                    data.folders.splice(rollbackLength);

                    const isOOM =
                        saveError instanceof RangeError ||
                        (saveError.message && (
                            saveError.message.toLowerCase().includes('out of memory') ||
                            saveError.message.toLowerCase().includes('allocation failed') ||
                            saveError.message.toLowerCase().includes('quota')
                        ));

                    const userMessage = isOOM
                        ? (getMessage('importOOM'))
                        : (getMessage('importSaveFailed') + saveError.message);

                    
                    try { PopupTree.renderTree(); } catch (_) {  }

                    throw new Error(userMessage);
                }

                const stats = result.stats;
                let message = getMessage('importHtmlSuccess', [stats.imported.toString()]);
                if (!message || message === 'importHtmlSuccess') message = `Imported ${stats.imported} bookmarks`;
                showNotification(message);
            },
            onError:    msg => showNotification(msg, true)
        });
    }

    isInitialized = true;
}

// Lifecycle events

window.addEventListener('beforeunload', performFullCleanup);
window.addEventListener('pagehide',     performFullCleanup);

window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        messageCache?.clear?.();
        faviconCache?.clear?.();
        faviconPromises?.clear?.();
    }
});

// Global hotkey: lock extension (Alt+L / Command+Shift+L)
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'lockExtension') {
        lock();
    }
});

document.addEventListener('DOMContentLoaded', init);
document.addEventListener('DOMContentLoaded', () => {
  const version = chrome.runtime.getManifest().version;
  const badge = document.getElementById('ext-version');
  if (badge) badge.textContent = 'v' + version;
});
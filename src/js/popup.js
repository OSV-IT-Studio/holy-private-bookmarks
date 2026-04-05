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

let data              = { folders: [] };
let autoLockTimer;
let isInitialized     = false;


const pendingBookmarkRef = { value: null };


const getData  = () => data;
const setData  = (d) => { data = d; };

// Auto-lock

function startAutoLock() {
    clearTimeout(autoLockTimer);
    autoLockTimer = setTimeout(lock, INACTIVITY_TIMEOUT);
}

function lock() {
    clearTimeout(autoLockTimer);
    if (data) wipeUserData(data);
    CryptoManager.clear();
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

// Main initialization

async function init() {
    if (isInitialized) return;
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
    chrome.runtime.sendMessage({ action: 'reloadmanager' }).catch(() => {});

    
    const [stored, session] = await Promise.all([
        chrome.storage.local.get(STORAGE_KEY),
        chrome.storage.session.get('pendingBookmarkAdd')
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
        PopupUI.showLoginSection();
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
        '#about-btn':                () => { openModal(getCachedElement('#about-modal')); },
        '#close-about':              () => { closeModal(getCachedElement('#about-modal')); },
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

   
    getCachedElement('#about-modal')?.addEventListener('click', e => {
        if (e.target.id === 'about-modal' && (Date.now() - (e.target._hpbOpenedAt || 0) > 50)) closeModal(e.target);
    });

    // JSON import
    getCachedElement('#import-file')?.addEventListener('change', e => {
        ImportExportManager.importData(e, () => { lock(); PopupUI.showLoginSection(); });
    });

    // HTML import
    if (window.HTMLImporter) {
        window.HTMLImporter._getCurrentData = getData;
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

document.addEventListener('DOMContentLoaded', init);
document.addEventListener('DOMContentLoaded', () => {
  const version = chrome.runtime.getManifest().version;
  const badge = document.getElementById('ext-version');
  const about = document.getElementById('about-version');
  if (badge) badge.textContent = 'v' + version;
  if (about) about.textContent = version;
});
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

if (!window.ImportExportManager) console.error('ImportExportManager not loaded!');

// Shared imports

const Shared = window.HolyShared;
const {
    STORAGE_KEY: SHARED_STORAGE_KEY,
    INACTIVITY_TIMEOUT: SHARED_INACTIVITY_TIMEOUT,
    VIRTUAL_SCROLL_CONFIG,

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

    countItemsInFolder,
    buildFolderOptions,

    isFaviconEnabled,
    setFaviconEnabled,
    getDomainFromUrl,
    loadFaviconAsync,

    saveEncrypted,
    showNotification,
    escapeHtml,

    openInPrivateTab,
    convertChromeBookmarks,

    debounce,
    throttle,

    showLoadingIndicator,
    hideLoadingIndicator,
	showGlobalLoadingIndicator,
    hideGlobalLoadingIndicator
} = Shared;

// App-level state

const STORAGE_KEY       = SHARED_STORAGE_KEY || 'holyPrivateData';
const INACTIVITY_TIMEOUT = SHARED_INACTIVITY_TIMEOUT || 10 * 60 * 1000;
const CryptoManager     = window.SecureCrypto;

let data              = { folders: [] };
let autoLockTimer;
let isInitialized     = false;

// Mutable ref passed into modules so they always see the current value
const pendingBookmarkRef = { value: null };

// Accessors shared with sub-modules
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
    virtualScrollCache?.clear?.();
}

async function saveAndRefresh() {
    await saveChanges();
    PopupTree.renderTree();
}

// Full cleanup (page unload)

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
        showLoadingIndicator,
        hideLoadingIndicator,
        getCachedElement,
        normalizePath,
        getItemByPath,
        getParentByPath,
        removeItemByPath,
        countItemsInFolder,
        buildFolderOptions,
        isFaviconEnabled,
        getDomainFromUrl,
        loadFaviconAsync,
        openInPrivateTab,
        virtualScrollCache,
		showGlobalLoadingIndicator,
        hideGlobalLoadingIndicator, 
        // Cross-module calls
        showSection:          (id) => PopupUI.showSection(id),
        renderTree:           () => PopupTree.renderTree(),
        startAutoLock,
        saveAndRefresh,
        openAddBookmarkModal: (...args) => PopupBookmarks.openAddBookmarkModal(...args),
        editBookmark:         (p) => PopupBookmarks.editBookmark(p),
        deleteBookmark:       (p) => PopupBookmarks.deleteBookmark(p),
        copyBookmarkUrl:      (u) => PopupBookmarks.copyBookmarkUrl(u),
        renameItem:           (p) => PopupBookmarks.renameItem(p),
        deleteItem:           (p) => PopupBookmarks.deleteItem(p),
        loadMoreFolderItems:  (...args) => PopupTree.loadMoreFolderItems(...args),
        unlock:               () => PopupAuth.unlock(),
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
    chrome.runtime.sendMessage({ action: 'reloadmanager' }).catch(() => {});

    // Load storage + pending bookmark in parallel
    const [stored, session] = await Promise.all([
        chrome.storage.local.get(STORAGE_KEY),
        chrome.storage.session.get('pendingBookmarkAdd')
    ]);

    if (session.pendingBookmarkAdd) {
        pendingBookmarkRef.value = session.pendingBookmarkAdd;
        await chrome.storage.session.remove('pendingBookmarkAdd');
    }

    // Old v1 format: show login and let unlock() handle migration
    if (stored[STORAGE_KEY]) {
        const d = stored[STORAGE_KEY];
        if (!d.version && d.salt && d.encrypted) {
            console.log('Old data format detected. Migration will happen on login.');
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
        '#create-pass':              () => PopupAuth.createMasterPassword(),
        '#unlock':                   () => PopupAuth.unlock(),
        '#lock':                     lock,
        '#add-current':              () => PopupBookmarks.addCurrentPage(),
        '#export':                   () => ImportExportManager.exportData(),
        '#import-btn':               () => getCachedElement('#import-file').click(),
        '#import-from-chrome':       () => ImportExportManager.importFromChromeBookmarks(data, saveAndRefresh),
        '#import-from-chrome-advanced': () => ImportExportManager.importFromChromeBookmarksAdvanced(data, saveAndRefresh),
        '#support-btn':              () => chrome.tabs.create({ url: chrome.runtime.getURL('donate.html') }),
        '#settings-btn':             () => PopupUI.showSection('settings'),
        '#back':                     () => PopupUI.showSection('main'),
        '#change-pass':              () => PopupAuth.changeMasterPassword(),
        '#modal-cancel':             () => { getCachedElement('#add-bookmark-modal').style.display = 'none'; },
        '#manager-btn':              openManager,
        '#faq-btn':                  () => chrome.tabs.create({ url: 'https://osv-it-studio.github.io/holy-private-bookmarks#faq' }),
        '#quick-add-bookmark':       () => PopupBookmarks.openAddBookmarkModal('', 'https://'),
        '#open-github':              () => chrome.tabs.create({ url: 'https://github.com/OSV-IT-Studio/holy-private-bookmarks' }),
        '#about-btn':                () => { getCachedElement('#about-modal').style.display = 'flex'; },
        '#close-about':              () => { getCachedElement('#about-modal').style.display = 'none'; },
        '#quick-add-folder':         () => PopupBookmarks.addFolder(),
        '#clear-history':            () => {
            const btn = getCachedElement('#clear-history');
            if (btn && window.HistoryCleaner) {
                window.HistoryCleaner.clearBookmarksHistoryByDomain(btn, data.folders);
            }
        }
    };

    Object.entries(handlers).forEach(([selector, handler]) => {
        getCachedElement(selector)?.addEventListener('click', handler);
    });

    getCachedElement('#modal-save')?.addEventListener('click', () => PopupBookmarks.handleModalSave());
    PopupBookmarks.initNewFolderInModal();

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
                data.folders.push(...result.folders);
                await saveAndRefresh();
                const stats = result.stats;
                let message = getMessage('importHtmlSuccess', [stats.imported.toString()]);
                if (!message || message === 'importHtmlSuccess') message = `Imported ${stats.imported} bookmarks`;
                showNotification(message);
                PopupTree.renderTree();
            },
            onError:    msg => showNotification(msg, true),
            onProgress: msg => showLoadingIndicator(document.body, msg)
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
    }
});

document.addEventListener('DOMContentLoaded', init);

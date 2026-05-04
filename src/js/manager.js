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

if (!window.HolyShared)       throw new Error('CRITICAL: HolyShared not loaded!');
if (!window.SecureCrypto)     throw new Error('CRITICAL: SecureCrypto not loaded!');
if (!window.ThemeManager)     throw new Error('ThemeManager not loaded');
if (!window.ManagerLock)      throw new Error('ManagerLock module not loaded!');
if (!window.ManagerFolders)   throw new Error('ManagerFolders module not loaded!');
if (!window.ManagerBookmarks) throw new Error('ManagerBookmarks module not loaded!');

// Shared imports

const Shared = window.HolyShared || {};
const {
    STORAGE_KEY: SHARED_STORAGE_KEY,
    INACTIVITY_TIMEOUT: SHARED_INACTIVITY_TIMEOUT,
    BOOKMARKS_PER_PAGE: SHARED_BOOKMARKS_PER_PAGE,

    secureWipeArray,
    wipeUserData,
    clearAllSharedCaches,

    getMessage,

    getItemByPath,
    generateFolderUid,
    ensureFolderUids,
    ensureItemUids,
    getItemByUid,
    getAnyItemByUid,
    getParentArrayForItemUid,
    moveBookmark,

    countItemsInFolder,
    countFoldersInFolder,
    countAllBookmarks,

    getDomainFromUrl,
    loadFaviconAsync,
buildFolderTreePicker,
    saveEncrypted,
    showNotification,
    showConfirm,
    showPrompt,
    escapeHtml,
    openInPrivateTab,
    collectAllBookmarkUrls,
    isAlwaysIncognito,
    showLoadingIndicator,
    hideLoadingIndicator,
	showGlobalLoadingIndicator,
    hideGlobalLoadingIndicator
, openModal, closeModal, closeModalWithAnimation, createBookmarkModal} = Shared;

// App-level state

const STORAGE_KEY        = SHARED_STORAGE_KEY    || 'holyPrivateData';
const INACTIVITY_TIMEOUT = SHARED_INACTIVITY_TIMEOUT || 10 * 60 * 1000;
const BOOKMARKS_PER_PAGE = SHARED_BOOKMARKS_PER_PAGE || 50;
const CryptoManager      = window.SecureCrypto;

let data             = { folders: [] };
let _currentFolderId = 'all';
let _searchQuery     = '';

const getData            = ()    => data;
const setData            = (d)   => { data = d; };
const getCurrentFolderId = ()    => _currentFolderId;
const setCurrentFolderId = (id)  => { _currentFolderId = id; };
const getSearchQuery     = ()    => _searchQuery;

// Persistence


async function saveChanges() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    if (stored[STORAGE_KEY]) await saveEncrypted(data, CryptoManager);
    ManagerBookmarks.clearBookmarksCache();
}

async function saveAndRefresh() {
    await saveChanges();
    ManagerFolders.renderFolderTree();
    await ManagerBookmarks.renderBookmarksPreservingScroll();
}

// Full cleanup

function performFullCleanup() {
    if (data) wipeUserData(data);
    clearAllSharedCaches();
    ManagerBookmarks.clearManagerCaches();
    CryptoManager?.clear?.();
    data = { folders: [] };
    if (window.gc) {
        try { window.gc(); setTimeout(() => { try { window.gc(); } catch (e) {} }, 100); } catch (e) {}
    }
}

// Theme

function updateToggleIcon(theme) {
    const toggle = document.getElementById('quick-theme-toggle');
    if (!toggle) return;
    toggle.removeAttribute('data-theme');
    if      (theme === window.ThemeManager.THEMES.DARK)   { toggle.setAttribute('data-theme', 'dark');   toggle.title = getMessage('themeDark'); }
    else if (theme === window.ThemeManager.THEMES.LIGHT)  { toggle.setAttribute('data-theme', 'light');  toggle.title = getMessage('themeLight'); }
    else                                                   { toggle.setAttribute('data-theme', 'system'); toggle.title = getMessage('themeSystem'); }
}

// Dependency bundle for sub-modules

function buildDeps() {
    return {
        STORAGE_KEY,
        INACTIVITY_TIMEOUT,
        BOOKMARKS_PER_PAGE,
        CryptoManager,

        getData,
        setData,
        getCurrentFolderId,
        setCurrentFolderId,
        getSearchQuery,

        secureWipeArray,
        getMessage,
        escapeHtml,
        showNotification,
        showConfirm,
        showPrompt,
        showLoadingIndicator,
        hideLoadingIndicator,
        showGlobalLoadingIndicator,
        hideGlobalLoadingIndicator,
        openModal,
        closeModal,
        closeModalWithAnimation,

        getItemByPath,
        generateFolderUid,
        ensureFolderUids,
        ensureItemUids,
        getItemByUid,
        getAnyItemByUid,
        getParentArrayForItemUid,
        moveBookmark,

        countItemsInFolder,
        countFoldersInFolder,
        countAllBookmarks,

        buildFolderTreePicker,
        createBookmarkModal,
        openInPrivateTab,
        collectAllBookmarkUrls,
        isAlwaysIncognito,
        getDomainFromUrl,
        loadFaviconAsync,
        wipeUserData,
        clearAllSharedCaches,

        saveChanges,
        saveAndRefresh,

        renderFolderTree:               ()     => ManagerFolders.renderFolderTree(),
        renderBookmarks:                ()     => ManagerBookmarks.renderBookmarks(),
        renderBookmarksPreservingScroll: ()     => ManagerBookmarks.renderBookmarksPreservingScroll(),
        editBookmark:                   (bm)   => ManagerBookmarks.editBookmark(bm),
        deleteBookmark:                 (bm)   => ManagerBookmarks.deleteBookmark(bm),
        clearManagerCaches:             ()     => ManagerBookmarks.clearManagerCaches(),
        clearBookmarksCache:            ()     => ManagerBookmarks.clearBookmarksCache(),
        countBookmarksInFolder:         (uid)  => ManagerBookmarks.countBookmarksInFolder(uid),
        getBookmarksForFolder:          (uid)  => ManagerBookmarks.getBookmarksForFolder(uid),
        resetPagination:                ()     => ManagerBookmarks.resetPagination(),
        resetVirtualScroll:             ()     => ManagerBookmarks.resetPagination(),
        resetInactivityTimer:           ()     => ManagerLock.resetInactivityTimer(),
        setActiveFolder:                (uid)  => ManagerFolders.setActiveFolder(uid),

        onUnlockSuccess: () => {
            ensureItemUids(data.folders);
            saveChanges();
            ManagerBookmarks.initVirtualScroll();
            ManagerFolders.renderFolderTree();
            ManagerBookmarks.renderBookmarks();
        }
    };
}

// Localization

const localizePage = window.HolyShared.localizePage;

// Single-tab enforcement

async function enforceSingleTab() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'requestManagerSingleTab' });
        if (!response?.allowed) {
            try {
                await chrome.tabs.update(response.existingId, { active: true });
                await chrome.windows.update(response.windowId, { focused: true });
            } catch {}
            const currentTab = await chrome.tabs.getCurrent();
            if (currentTab?.id) {
                chrome.tabs.remove(currentTab.id);
            } else {
                window.close();
            }
            return false;
        }
        return true;
    } catch {
        return true; 
    }
}

// Main initialization

async function init() {
    const shouldContinue = await enforceSingleTab();
    if (!shouldContinue) return;

    localizePage();

    // Theme
    if (window.ThemeManager) {
        await window.ThemeManager.init();

        const quickToggle = document.getElementById('quick-theme-toggle');
        if (quickToggle) {
            updateToggleIcon(window.ThemeManager.getCurrentTheme());
            quickToggle.addEventListener('click', () => {
                const cur = window.ThemeManager.getCurrentTheme();
                const T   = window.ThemeManager.THEMES;
                const next = cur === T.DARK ? T.LIGHT : cur === T.LIGHT ? T.SYSTEM : T.DARK;
                window.ThemeManager.setTheme(next).then(() => updateToggleIcon(next));
            });
        }
    }

    chrome.runtime.onMessage.addListener(message => {
        if (message.action === 'themeChanged' && window.ThemeManager) {
            window.ThemeManager.setTheme(message.theme);
            updateToggleIcon(message.theme);
        }
    });


    // Wire all modules
    const deps = buildDeps();
    ManagerLock.init(deps);
    ManagerFolders.init(deps);
    ManagerBookmarks.init(deps);
	if (window.ManagerDragDrop) {
        ManagerDragDrop.init(deps);
    }
    ManagerLock.initActivityTracking();
    ManagerLock.initLockButton();
    ManagerFolders.initNewFolderButton();
    ManagerBookmarks.initKeyboardHandlers();

    // Add bookmark button
    document.getElementById('quick-add-bookmark')?.addEventListener('click',
        () => ManagerBookmarks.addNewBookmarkFromManager()
    );
	// Open popup button
	document.getElementById('quick-open-popup')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openPopupAfterManager' });
});
    // Check storage state
    const stored = await chrome.storage.local.get(STORAGE_KEY);

    if (stored[STORAGE_KEY]) {
        const d = stored[STORAGE_KEY];
        const needsMigration = !d.version && d.salt && d.encrypted;
        if (needsMigration) {
            ManagerLock.showMigrationScreen();
            return;
        }
    }

    if (!stored[STORAGE_KEY]) {
        ManagerLock.showNotSetUpScreen();
        return;
    }

    // Try to restore session key
    const stayPref = await chrome.storage.local.get('holyStayUnlocked');
    if (stayPref.holyStayUnlocked) {
        const restored = await CryptoManager.restoreFromSession().catch(() => false);
        if (restored) {
            try {
                const storedData = stored[STORAGE_KEY];
                const decrypted  = await CryptoManager.decrypt(storedData.encrypted);
                const loadedData = JSON.parse(decrypted);
                if (window.HolyShared?.ensureItemUids) window.HolyShared.ensureItemUids(loadedData.folders);
                else if (window.HolyShared?.ensureFolderUids) window.HolyShared.ensureFolderUids(loadedData.folders);
                setData(loadedData);
                document.querySelector('.container').style.display = 'flex';
                ManagerLock.resetInactivityTimer();
                deps.onUnlockSuccess();
            } catch (e) {
                CryptoManager.clear();
                await CryptoManager.clearSession().catch(() => {});
                ManagerLock.showLockScreen();
            }
        } else {
            ManagerLock.showLockScreen();
        }
    } else {

        ManagerLock.showLockScreen();
    }

    // Search
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        let timeout;
        searchInput.addEventListener('input', e => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                _searchQuery = e.target.value.trim();
                ManagerBookmarks.resetPagination();
                ManagerBookmarks.renderBookmarks();
            }, 300);
        });
        searchInput.addEventListener('search', e => {
            if (e.target.value === '') {
                _searchQuery = '';
                ManagerBookmarks.resetPagination();
                ManagerBookmarks.renderBookmarks();
            }
        });
    }

    // "All Bookmarks" sidebar item
    document.querySelector('.all-bookmarks')?.addEventListener('click',
        () => ManagerFolders.setActiveFolder('all')
    );

    if (sessionStorage.getItem('managerReloading')) {
        sessionStorage.removeItem('managerReloading');
        ManagerLock.showReloadingScreen();
        setTimeout(() => window.location.reload(), 500);
    }
}

// Lifecycle

window.addEventListener('beforeunload', () => {
    performFullCleanup();
    chrome.runtime.sendMessage({ action: 'releaseManagerTab' });
});
window.addEventListener('pagehide',     performFullCleanup);

// Chrome message handlers

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'reloadmanager') {
        performFullCleanup();
        setTimeout(() => window.location.reload(), 1000);
        return true;
    }
    if (message.action === 'closeForPopup') {
        window.close();
        chrome.runtime.sendMessage({ action: 'managerClosed' });
        return true;
    }
    if (message.action === 'lockExtension') {
        ManagerLock.lockManager();
        return true;
    }
});

// Start

document.addEventListener('DOMContentLoaded', init);
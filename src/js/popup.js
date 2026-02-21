/*
 * Holy Private Bookmarks — Encrypted Local Bookmark Manager
 * Copyright (C) 2026 OSV-IT-Studio
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

const {
    STORAGE_KEY,
    INACTIVITY_TIMEOUT,
    VIRTUAL_SCROLL_CONFIG,
    
    virtualScrollCache,
    
    getCachedElement,
    clearElementCache,
    
    getMessage,
    
    normalizePath,
    getItemByPath,
    getParentByPath,
    removeItemByPath,
    findItemPath,
    findFolderById,
    isAncestor,
    arraysEqual,
    
    countItemsInFolder,
    
    getFaviconUrl,
    getDomainFromUrl,
    loadFaviconAsync,
    
    buildFolderOptions,
    
    saveEncrypted,
    
    showNotification,
    escapeHtml,
    
    openInPrivateTab,
    
    convertChromeBookmarks,
    collectAllBookmarkUrls,
    
    debounce,
    throttle,
    
    showLoadingIndicator,
    hideLoadingIndicator,
    ensureLoadingStyles
} = window.HolyShared || {};

if (!window.HolyShared) {
    throw new Error('HolyShared is required but not loaded');
}

if (!window.SecureCrypto) {
    throw new Error('SecureCrypto is required but not loaded');
}

const CryptoManager = window.SecureCrypto;
const FAVICON_ENABLED_KEY = 'holyFaviconEnabled';
let data = { folders: [] };
let autoLockTimer;
let pendingBookmark = null;
let editingBookmarkPath = null;
let contextMenu = null;
let clipboardItem = null;
let isInitialized = false;

let dragState = {
    draggedItem: null,
    dragPath: null,
    dragOverItem: null,
    isDragging: false,
    ghostElement: null,
    tooltipElement: null,
    startX: 0,
    startY: 0,
    canDrop: true,
    lastValidTarget: null,
    dropPosition: null
};

const DRAG_CONFIG = {
    autoScrollSpeed: 15,
    edgeThreshold: 30,
    ghostOffsetX: 20,
    ghostOffsetY: 20,
    longPressDelay: 500,
    animationDuration: 200
};

let eventHandlersInitialized = false;

function getEmptyTreeMessages() {
    return {
        title: getMessage('emptyTreeTitle') || 'No bookmarks yet',
        subtitle: getMessage('emptyTreeSubtitle') || 'Add your first bookmark or folder to get started',
        addBookmark: getMessage('addBookmark') || 'Add Bookmark',
        newFolder: getMessage('newFolder') || 'New Folder'
    };
}

function localizePage() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const text = getMessage(key);
        if (text) {
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.placeholder = text;
            } else {
                element.textContent = text;
            }
        }
    });
    
    const elements = {
        '#setup h1': 'extensionName',
        '#setup .subtitle': 'createPassword',
        '#new-pass': 'newPassword',
        '#confirm-pass': 'confirmPassword',
        '#create-pass': 'createStorage',
        '#login h1': 'extensionName',
        '#login .subtitle': 'enterMasterPassword',
        '#password': 'masterPassword',
        '#unlock': 'unlock',
        '#main h1': 'extensionName',
        '#main .subtitle': 'bookmarksProtected',
        '#add-currentdiv': 'addCurrentPage',
        '#add-folder': 'newFolder',
        '#clear-historydiv': 'clearHistory',
        '#support': 'supportProject',
        '#settings-btn': 'settingsbtn',
        '#settings h1': 'settings',
        '#settings .subtitle:nth-of-type(1)': 'changeMasterPassword',
        '#old-pass': 'currentPassword',
        '#new-pass2': 'newPassword2',
        '#confirm-pass2': 'confirmNewPassword',
        '#change-pass': 'changePassword',
        '#settings .subtitle:nth-of-type(2)': 'exportImport',
        '#export': 'export',
        '#import-btn': 'import',
        '#import-from-chrome': 'importChromeBookmarks',
        '#import-from-chrome-advanced': 'importChromeBookmarksAdvanced',
        '#settings .subtitle:nth-of-type(3)': 'importFromChrome',
        '#back': 'back',
        '#modal-cancel': 'cancel',
        '#modal-save': 'save',
        '#new-folder-in-modal': 'new',
        '#important-warning-text': 'importantWarning',
        '#cannot-recover-text': 'passwordCannotBeRecovered',
        '#no-reset-text': 'noPasswordReset',
        '#dont-store-text': 'weDontStorePassword',
        '#encrypted-only-text': 'bookmarksEncrypted',
        '#save-password-text': 'savePasswordSecurely'
    };
    
    for (const selector in elements) {
        const element = getCachedElement(selector);
        const key = elements[selector];
        if (element) {
            const text = getMessage(key);
            if (text) {
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    element.placeholder = text;
                } else if (element.tagName === 'BUTTON') {
                    const emojiMatch = element.textContent.match(/^[^\w\s]*/);
                    if (emojiMatch && !text.startsWith(emojiMatch[0])) {
                        element.textContent = emojiMatch[0] + ' ' + text;
                    } else {
                        element.textContent = text;
                    }
                } else {
                    element.textContent = text;
                }
            }
        }
    }
    
    const modalTitle = getCachedElement('#add-bookmark-modal h2');
    if (modalTitle && modalTitle.id !== 'modal-title-text') {
        modalTitle.id = 'modal-title-text';
    }
    
    const modalLabels = document.querySelectorAll('#add-bookmark-modal label');
    if (modalLabels.length >= 3) {
        modalLabels[0].setAttribute('data-i18n', 'title');
        modalLabels[1].setAttribute('data-i18n', 'url');
        modalLabels[2].setAttribute('data-i18n', 'folder');
    }
    
    const pageLabel = getCachedElement('#add-bookmark-modal p strong');
    if (pageLabel) {
        pageLabel.setAttribute('data-i18n', 'page');
    }
    
    setTimeout(() => {
        const addBookmarkBtn = getCachedElement('#empty-add-bookmark');
        const addFolderBtn = getCachedElement('#empty-add-folder');
        
        if (addBookmarkBtn) {
            const text = getMessage('addBookmark') || 'Add Bookmark';
            addBookmarkBtn.textContent = '📌 ' + text;
        }
        
        if (addFolderBtn) {
            const text = getMessage('newFolder') || 'New Folder';
            addFolderBtn.textContent = '📁 ' + text;
        }
    }, 100);
}

function initContextMenu() {
    contextMenu = document.getElementById('context-menu');
    
    if (!contextMenu) {
        return;
    }
    
    const ctxItems = {
        'ctx-new-folder': 'ctxnewFolder',
        'ctx-new-bookmark': 'newBookmark',
        'ctx-paste': 'paste'
    };
    
    Object.entries(ctxItems).forEach(([id, key]) => {
        const item = document.getElementById(id);
        if (item) {
            const textSpan = item.querySelector('span:not(.icon)');
            if (textSpan) {
                textSpan.textContent = getMessage(key);
            }
        }
    });
    
    document.getElementById('ctx-new-folder').addEventListener('click', handleNewFolder);
    document.getElementById('ctx-new-bookmark').addEventListener('click', handleNewBookmark);
    document.getElementById('ctx-paste').addEventListener('click', handlePaste);
    
    document.addEventListener('contextmenu', function(e) {
        const mainSection = document.getElementById('main');
        if (!mainSection || mainSection.style.display !== 'block') {
            return;
        }
        
        const tree = document.getElementById('tree');
        const clickedOnTreeItem = e.target.closest('.tree-item');
        const clickedOnTree = tree && (tree === e.target || tree.contains(e.target));
        
        if (clickedOnTree || clickedOnTreeItem) {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY);
        } else {
            hideContextMenu();
        }
    });
    
    document.addEventListener('click', (e) => {
        if (contextMenu && contextMenu.style.display === 'block' && !contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && contextMenu && contextMenu.style.display === 'block') {
            hideContextMenu();
        }
    });
}

function handleNewFolder() {
    hideContextMenu();
    addFolder();
}

function handleNewBookmark() {
    hideContextMenu();
    addEmptyBookmark();
}

function handlePaste() {
    hideContextMenu();
    pasteFromClipboard();
}

function showContextMenu(x, y) {
    if (!contextMenu) return;
    
    checkClipboard();
    
    contextMenu.style.display = 'block';
    
    const menuWidth = contextMenu.offsetWidth || 200;
    const menuHeight = contextMenu.offsetHeight || 150;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    let finalX = Math.max(10, Math.min(x, windowWidth - menuWidth - 10));
    let finalY = Math.max(10, Math.min(y, windowHeight - menuHeight - 10));
    
    contextMenu.style.left = finalX + 'px';
    contextMenu.style.top = finalY + 'px';
    
    setTimeout(() => {
        contextMenu.style.opacity = '1';
    }, 10);
}

function hideContextMenu() {
    if (contextMenu) {
        contextMenu.style.display = 'none';
        contextMenu.style.opacity = '0';
    }
}

async function checkClipboard() {
    const pasteBtn = document.getElementById('ctx-paste');
    if (!pasteBtn) return;
    
    try {
        const text = await navigator.clipboard.readText();
        const trimmed = text.trim();
        
        if (trimmed) {
            const urlPattern = /^(https?:\/\/|www\.)/i;
            if (urlPattern.test(trimmed)) {
                pasteBtn.style.display = 'flex';
                clipboardItem = { type: 'url', text: trimmed };
                return;
            }
        }
        
        pasteBtn.style.display = 'none';
        clipboardItem = null;
    } catch (err) {
        pasteBtn.style.display = 'none';
        clipboardItem = null;
    }
}

function addEmptyBookmark() {
    openAddBookmarkModal('', 'https://');
}

function pasteFromClipboard() {
    if (clipboardItem && clipboardItem.type === 'url') {
        openAddBookmarkModal('', clipboardItem.text);
    } else {
        showNotification(getMessage('noUrlInClipboard') || 'No valid URL in clipboard', true);
    }
}

function initQuickActions() {
    const expandAllBtn = document.getElementById('expand-all-btn');
    const collapseAllBtn = document.getElementById('collapse-all-btn');
    
    if (expandAllBtn) {
        expandAllBtn.addEventListener('click', expandAllFolders);
    }
    
    if (collapseAllBtn) {
        collapseAllBtn.addEventListener('click', collapseAllFolders);
    }
}

function expandAllFolders() {
    if (!virtualScrollCache || typeof virtualScrollCache.clear !== 'function') {
        return;
    }
    virtualScrollCache.clear();
    document.querySelectorAll('.subitems.collapsed').forEach(sub => {
        sub.classList.remove('collapsed');
        const header = sub.previousElementSibling;
        if (header && header.classList.contains('item-header')) {
            header.querySelector('.arrow').textContent = '▼';
            header.parentElement.classList.add('open');
        }
    });
}

function collapseAllFolders() {
    if (!virtualScrollCache || typeof virtualScrollCache.clear !== 'function') {
        return;
    }
    virtualScrollCache.clear();
    document.querySelectorAll('.subitems:not(.collapsed)').forEach(sub => {
        sub.classList.add('collapsed');
        const header = sub.previousElementSibling;
        if (header && header.classList.contains('item-header')) {
            header.querySelector('.arrow').textContent = '▶';
            header.parentElement.classList.remove('open');
        }
    });
}

function copyBookmarkUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
        showNotification(getMessage('urlCopied') || 'URL copied to clipboard');
    }).catch(err => {
        showNotification(getMessage('copyFailed') || 'Failed to copy URL', true);
    });
}

function editBookmark(pathStr) {
    const path = pathStr.split(',').map(Number);
    const bookmark = getItemByPath(data, path);
    if (bookmark) {
        openAddBookmarkModal(bookmark.title, bookmark.url, path);
    }
}

function deleteBookmark(pathStr) {
    const path = pathStr.split(',').map(Number);
    removeItemByPath(data, path);
    saveAndRefresh();
}

async function init() {
    if (isInitialized) return;
    
    localizePage();
    
    if (window.ThemeManager) {
        await window.ThemeManager.init();
        
        const themeContainer = document.getElementById('theme-selector-container');
        if (themeContainer) {
            window.ThemeManager.createThemeSelector(themeContainer);
        }
    }
    
    ensureLoadingStyles();
    initContextMenu();
    initQuickActions();
    initFaviconToggle();
	
    chrome.runtime.sendMessage({ action: 'reloadmanager' }).catch(() => {});
    
    const [stored, session] = await Promise.all([
        chrome.storage.local.get(STORAGE_KEY),
        chrome.storage.session.get('pendingBookmarkAdd')
    ]);
    
    if (session.pendingBookmarkAdd) {
        pendingBookmark = session.pendingBookmarkAdd;
        await chrome.storage.session.remove('pendingBookmarkAdd');
        
        if (!stored[STORAGE_KEY]) {
            showSection('setup');
        } else {
            showSection('login');
            
            const pendingNotification = document.getElementById('pending-bookmark-notification');
            if (pendingNotification) {
                pendingNotification.style.display = 'block';
                
                const pageTitle = pendingBookmark.title || 'Current page';
                const notificationText = document.getElementById('pending-notification-text');
                const instructionText = document.getElementById('pending-instruction-text');
                
                if (notificationText) {
                    notificationText.textContent = `📌 ${getMessage('pendingBookmarkNotification') || 'Bookmark pending!'}`;
                }
                
                if (instructionText) {
                    instructionText.textContent = `${getMessage('pendingBookmarkInstruction') || 'A bookmark is waiting to be added. Please unlock to continue.'} (${pageTitle})`;
                }
            }
        }
    } else {
        if (!stored[STORAGE_KEY]) {
            showSection('setup');
        } else {
            showSection('login');
        }
    }
    
    const handlers = {
        '#create-pass': createMasterPassword,
        '#unlock': unlock,
        '#lock': lock,
        '#add-current': addCurrentPage,
        '#export': exportData,
        '#import-btn': () => getCachedElement('#import-file').click(),
        '#import-from-chrome': importFromChromeBookmarks,
        '#import-from-chrome-advanced': importFromChromeBookmarksAdvanced,
        '#support-btn': () => chrome.tabs.create({ url: chrome.runtime.getURL('donate.html') }),
        '#settings-btn': () => showSection('settings'),
        '#back': () => showSection('main'),
        '#change-pass': changeMasterPassword,
        '#modal-cancel': () => getCachedElement('#add-bookmark-modal').style.display = 'none',
        '#manager-btn': openmanager,
        '#faq-btn': () => chrome.tabs.create({ url: chrome.runtime.getURL('faq.html') })
    };
    
    Object.entries(handlers).forEach(([selector, handler]) => {
        const element = getCachedElement(selector);
        if (element) {
            element.addEventListener('click', handler);
        }
    });
    
    getCachedElement('#import-file').addEventListener('change', importData);
    
    const clearHistoryBtn = getCachedElement('#clear-history');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', clearBookmarksHistoryByDomain);
    }
    
    const newFolderBtn = document.getElementById('new-folder-in-modal');
    if (newFolderBtn) {
        newFolderBtn.addEventListener('click', () => {
            const name = prompt(getMessage('folderName'));
            if (name && name.trim()) {
                const newFolder = { type: 'folder', name: name.trim(), children: [], dateAdded: Date.now() };
                data.folders.push(newFolder);
                saveAndRefresh().then(() => {
                    const select = document.getElementById('folder-select');
                    select.innerHTML = '';
                    const rootOption = document.createElement('option');
                    rootOption.value = '';
                    rootOption.textContent = getMessage('rootFolder');
                    select.appendChild(rootOption);
                    buildFolderOptions(data.folders, select, '', 0);
                    select.value = (data.folders.length - 1).toString();
                });
            }
        });
    }
    
    const modalSaveBtn = getCachedElement('#modal-save');
    if (modalSaveBtn) {
        modalSaveBtn.addEventListener('click', handleModalSave);
    }
    
    if (!stored[STORAGE_KEY]) {
        showSection('setup');
    } else {
        showSection('login');
    }
    
    const aboutBtn = document.getElementById('about-btn');
    if (aboutBtn) {
        aboutBtn.addEventListener('click', () => {
            document.getElementById('about-modal').style.display = 'flex';
        });
    }
    
    const closeAboutBtn = document.getElementById('close-about');
    if (closeAboutBtn) {
        closeAboutBtn.addEventListener('click', () => {
            document.getElementById('about-modal').style.display = 'none';
        });
    }
    
    const openGitHubBtn = document.getElementById('open-github');
    if (openGitHubBtn) {
        openGitHubBtn.addEventListener('click', () => {
            chrome.tabs.create({ 
                url: 'https://github.com/OSV-IT-Studio/holy-private-bookmarks' 
            });
            document.getElementById('about-modal').style.display = 'none';
        });
    }
    
    document.getElementById('about-modal').addEventListener('click', (e) => {
        if (e.target.id === 'about-modal') {
            e.target.style.display = 'none';
        }
    });
    
    isInitialized = true;
}

function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    const section = document.getElementById(id);
    if (section) {
        section.style.display = 'block';
    }
    
    if (id === 'main') {
        renderTree();
        startAutoLock();
        
        if (pendingBookmark) {
            openAddBookmarkModal(pendingBookmark.title, pendingBookmark.url);
            pendingBookmark = null;
        }
    }
}

function openAddBookmarkModal(pageTitle, pageUrl, editPath = null) {
    const modal = getCachedElement('#add-bookmark-modal');
    if (!modal) return;
    
    editingBookmarkPath = editPath;
    const isEdit = editPath !== null;
    
    const modalTitle = modal.querySelector('h2');
    modalTitle.textContent = getMessage(isEdit ? 'editBookmark' : 'addBookmark');
    
    document.getElementById('modal-page-title').textContent = 
        pageTitle.length > 60 ? pageTitle.slice(0, 60) + '...' : pageTitle;
    
    const titleInput = document.getElementById('modal-bookmark-title');
    const urlInput = document.getElementById('modal-bookmark-url');
    
    if (isEdit) {
        const bookmark = getItemByPath(data, editPath);
        if (bookmark) {
            titleInput.value = bookmark.title;
            urlInput.value = bookmark.url;
        }
    } else {
        titleInput.value = pageTitle;
        urlInput.value = pageUrl;
    }
    
    const select = document.getElementById('folder-select');
    select.innerHTML = '';
    const rootOption = document.createElement('option');
    rootOption.value = '';
    rootOption.textContent = getMessage('rootFolder');
    select.appendChild(rootOption);
    buildFolderOptions(data.folders, select, '', 0);
    
    if (isEdit) {
        const parentPath = editPath.slice(0, -1);
        if (parentPath.length > 0) {
            const parentPathStr = parentPath.join('/');
            select.value = parentPathStr;
        }
    }
    
    modal.style.display = 'flex';
}

async function openmanager() {
    window.close();
    
    const managerUrl = chrome.runtime.getURL('manager.html');
    
    try {
        const tabs = await chrome.tabs.query({ url: managerUrl });
        
        if (tabs.length > 0 && tabs[0].id) {
            await chrome.tabs.update(tabs[0].id, { active: true });
            await chrome.windows.update(tabs[0].windowId, { focused: true });
            
            try {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'refreshData' });
            } catch (e) {}
        } else {
            chrome.tabs.create({
                url: managerUrl
            });
        }
    } catch (error) {
        chrome.tabs.create({
            url: managerUrl
        });
    }
}

function validateImportedData(data) {
    return data && 
           typeof data === 'object' &&
           data.salt && 
           data.encrypted &&
           typeof data.encrypted === 'object' &&
           data.encrypted.iv &&
           data.encrypted.data;
}

function handleModalSave() {
    const modal = document.getElementById('add-bookmark-modal');
    if (!modal) return;
    
    const titleInput = document.getElementById('modal-bookmark-title');
    const urlInput = document.getElementById('modal-bookmark-url');
    
    const title = titleInput.value.trim();
    const url = urlInput.value.trim();
    
    if (!title || !url) {
        showNotification('Title and URL are required', true);
        return;
    }
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showNotification('Please enter a valid URL starting with http:// or https://', true);
        return;
    }
    
    const pathStr = document.getElementById('folder-select').value;
    
    let newPath = [];
    if (pathStr !== '') {
        newPath = pathStr
            .split('/')
            .map(Number)
            .filter(Number.isInteger);
    }
    
    if (newPath.length > 0) {
        const target = getItemByPath(data, newPath);
        if (!target || target.type !== 'folder') {
            showNotification('Selected path is not a folder', true);
            return;
        }
    }
    
    if (editingBookmarkPath) {
        updateBookmark(editingBookmarkPath, title, url, newPath);
    } else {
        addNewBookmark(title, url, newPath);
    }
    
    saveAndRefresh().then(() => {
        modal.style.display = 'none';
        editingBookmarkPath = null;
    });
}

function updateBookmark(oldPath, title, url, newPathRaw) {
    const newPath = normalizePath(newPathRaw);
    const oldFolderPath = normalizePath(oldPath.slice(0, -1));
    
    const sourceParent = getParentByPath(data, oldFolderPath);
    const sourceIndex = oldPath[oldPath.length - 1];
    const bookmark = sourceParent[sourceIndex];
    
    if (!bookmark) {
        return;
    }
    
    bookmark.title = title;
    bookmark.url = url;
    
    if (oldFolderPath.join('/') === newPath.join('/')) {
        return;
    }
    
    let targetArray;
    
    if (newPath.length === 0) {
        targetArray = data.folders;
    } else {
        const folder = getItemByPath(data, newPath);
        if (!folder || folder.type !== 'folder' || !Array.isArray(folder.children)) {
            return;
        }
        targetArray = folder.children;
    }
    
    sourceParent.splice(sourceIndex, 1);
    targetArray.push(bookmark);
}

function addNewBookmark(title, url, path) {
    let target = data.folders;
    for (const idx of path) {
        if (target[idx] && target[idx].type === 'folder' && target[idx].children) {
            target = target[idx].children;
        } else {
            return;
        }
    }
    target.push({ 
        type: 'bookmark', 
        title, 
        url,
        dateAdded: Date.now()
    });
}

async function unlock() {
    const pass = document.getElementById('password').value;
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    
    if (!stored[STORAGE_KEY]) {
        showNotification('No data found', true);
        return;
    }
    
    const salt = new Uint8Array(stored[STORAGE_KEY].salt);
    const encrypted = stored[STORAGE_KEY].encrypted;
    
    try {
        const isValid = await CryptoManager.verifyPassword(pass, salt, encrypted);
        
        if (!isValid) {
            showNotification(getMessage('wrongPassword') || 'Wrong password', true);
            return;
        }
        
        const success = await CryptoManager.init(pass, salt);
        if (!success) throw new Error('Init failed');
        
        const decrypted = await CryptoManager.decrypt(encrypted);
        data = JSON.parse(decrypted);
        
        const pendingNotification = document.getElementById('pending-bookmark-notification');
        if (pendingNotification) {
            pendingNotification.style.display = 'none';
        }
        
        showSection('main');
        
        if (pendingBookmark) {
            openAddBookmarkModal(pendingBookmark.title, pendingBookmark.url);
            pendingBookmark = null;
        }
        
        startAutoLock();
        
    } catch (e) {
        showNotification(getMessage('wrongPassword') || 'Wrong password', true);
        CryptoManager.clear();
    }
}

async function addCurrentPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || !tab.url.startsWith('http')) {
        showNotification(getMessage('cannotAddPage') || 'Cannot add this page', true);
        return;
    }
    openAddBookmarkModal(tab.title || 'No title', tab.url);
}

async function createMasterPassword() {
    const p1 = document.getElementById('new-pass').value;
    const p2 = document.getElementById('confirm-pass').value;
    
    if (p1 !== p2 || p1.length < 6) {
        showNotification(getMessage('passwordsMismatch') || 'Passwords do not match or too short', true);
        return;
    }
    
    const salt = crypto.getRandomValues(new Uint8Array(16));
    
    const success = await CryptoManager.init(p1, salt);
    if (!success) throw new Error('Init failed');
    
    data = { folders: [] };
    await saveEncrypted(data, salt, CryptoManager);
    showSection('main');
}

async function changeMasterPassword() {
    const old = document.getElementById('old-pass').value;
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const salt = new Uint8Array(stored[STORAGE_KEY].salt);
    const encrypted = stored[STORAGE_KEY].encrypted;
    
    const isValid = await CryptoManager.verifyPassword(old, salt, encrypted);
    
    if (!isValid) {
        showNotification(getMessage('wrongPassword') || 'Wrong password', true);
        return;
    }
    
    const p1 = document.getElementById('new-pass2').value;
    const p2 = document.getElementById('confirm-pass2').value;
    
    if (p1 !== p2 || p1.length < 6) {
        showNotification(getMessage('passwordsMismatch') || 'Passwords do not match or too short', true);
        return;
    }
    
    const newSalt = crypto.getRandomValues(new Uint8Array(16));
    
    const decrypted = await CryptoManager.decrypt(encrypted);
    data = JSON.parse(decrypted);
    
    const success = await CryptoManager.init(p1, newSalt);
    if (!success) throw new Error('Init failed');
    
    await saveEncrypted(data, newSalt, CryptoManager);
    
    showNotification(getMessage('passwordChanged') || 'Password changed successfully', false);
    setTimeout(() => showSection('main'), 1500);
}

function addFolder() {
    const name = prompt(getMessage('folderName'));
    if (name && name.trim()) {
        data.folders.push({ 
            type: 'folder', 
            name: name.trim(), 
            children: [],
            dateAdded: Date.now()
        });
        saveAndRefresh();
    }
}

function setupGlobalClickHandler() {
    if (eventHandlersInitialized) return;
    
    const tree = document.getElementById('tree');
    if (!tree) return;
    
    tree.removeEventListener('click', handleTreeClick);
    tree.addEventListener('click', handleTreeClick);
    
    eventHandlersInitialized = true;
}

function handleTreeClick(e) {
    if (e.target.closest('.action-btn')) {
        handleActionButtonClick(e);
        return;
    }
    
    if (e.target.closest('.quick-action-btn-small')) {
        return;
    }
    
    const folderHeader = e.target.closest('.item-header.folder');
    if (folderHeader) {
        e.preventDefault();
        e.stopPropagation();
        toggleFolder(folderHeader);
        return;
    }
    
    if (e.target.closest('.load-more-btn')) {
        return;
    }
}

function handleActionButtonClick(e) {
    const btn = e.target.closest('.action-btn');
    if (!btn) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const action = btn.dataset.action;
    const path = btn.dataset.path;
    
    if (!path) return;
    
    const pathArray = path.split(',').map(Number);
    
    if (action === 'rename') {
        renameItem(pathArray);
    } else if (action === 'delete') {
        deleteItem(pathArray);
    }
}

function toggleFolder(header) {
    const folderItem = header.closest('.tree-item');
    if (!folderItem) return;
    
    const sub = folderItem.querySelector('.subitems');
    if (!sub) return;
    
    const isCollapsed = sub.classList.contains('collapsed');
    const path = folderItem.dataset.path;
    
    if (isCollapsed) {
        openFolder(folderItem, header, sub, path);
    } else {
        closeFolder(folderItem, header, sub);
    }
}

function openFolder(folderItem, header, sub, path) {
    sub.classList.remove('collapsed');
    const arrow = header.querySelector('.arrow');
    if (arrow) arrow.textContent = '▼';
    folderItem.classList.add('open');

    if (!sub.hasChildNodes() || sub.children.length === 0) {
        const pathArray = path.split(',').map(Number);
        const folder = getItemByPath(data, pathArray);

        if (folder && folder.children) {
            sub.innerHTML = ''; 
            
            const scrollContainer = document.createElement('div');
            scrollContainer.className = 'folder-virtual-scroll';
            sub.appendChild(scrollContainer);

            if (virtualScrollCache && typeof virtualScrollCache.getFolderContainer === 'function') {
                const folderData = virtualScrollCache.getFolderContainer(pathArray);
                folderData.totalItems = folder.children.length;
                folderData.container = scrollContainer;
                folderData.isOpen = true;
                folderData.visibleStart = 0;
                folderData.visibleCount = 0;
                folderData.hasMore = true;

                loadMoreFolderItems(
                    folder, 
                    pathArray, 
                    scrollContainer, 
                    0, 
                    VIRTUAL_SCROLL_CONFIG.initialLoadCount
                );
            }
        }
    }
}

function closeFolder(folderItem, header, sub) {
    sub.classList.add('collapsed');
    const arrow = header.querySelector('.arrow');
    if (arrow) arrow.textContent = '▶';
    folderItem.classList.remove('open');
}

function renameItem(pathArray) {
    const targetItem = getItemByPath(data, pathArray);
    if (!targetItem) return;
    
    const currentName = targetItem.type === 'folder' ? targetItem.name : targetItem.title;
    const newName = prompt(getMessage('newName') || 'Enter new name:', currentName);
    
    if (newName && newName.trim()) {
        if (targetItem.type === 'folder') {
            targetItem.name = newName.trim();
        } else {
            targetItem.title = newName.trim();
        }
        saveAndRefresh();
    }
}

function deleteItem(pathArray) {
    if (confirm(getMessage('deleteConfirm') || 'Are you sure?')) {
        removeItemByPath(data, pathArray);
        saveAndRefresh();
    }
}

function renderFolderItemsBatch(folder, path, container, startIndex, endIndex, onComplete) {
    const batchSize = 10;
    const currentEnd = Math.min(startIndex + batchSize, endIndex);

    const fragment = document.createDocumentFragment();

    for (let i = startIndex; i < currentEnd; i++) {
        const child = folder.children[i];
        const childPath = [...path, i];

        let element;
        if (child.type === 'bookmark') {
            element = createBookmarkElement(child, childPath);
        } else if (child.type === 'folder') {
            element = createFolderElement(child, childPath);
        }

        if (element) {
            fragment.appendChild(element);
        }
    }

    container.appendChild(fragment);

    if (currentEnd < endIndex) {
        requestAnimationFrame(() => {
            renderFolderItemsBatch(folder, path, container, currentEnd, endIndex, onComplete);
        });
    } else {
        if (onComplete) onComplete();
    }
}

function loadMoreFolderItems(folder, path, container, startIndex, countToLoad) {
    if (!virtualScrollCache || typeof virtualScrollCache.getFolderContainer !== 'function') {
        return;
    }
    
    const folderData = virtualScrollCache.getFolderContainer(path);
    
    if (folder.children.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-folder-message';
        emptyMessage.setAttribute('data-i18n', 'emptyFolder');
        emptyMessage.textContent = getMessage('emptyFolder') || 'Folder is empty';
        container.appendChild(emptyMessage);
        
        folderData.hasMore = false;
        return;
    }
    
    const endIndex = Math.min(startIndex + countToLoad, folder.children.length);

    if (startIndex === 0) {
        showLoadingIndicator(container);
    }

    renderFolderItemsBatch(folder, path, container, startIndex, endIndex, () => {
        hideLoadingIndicator(container);
        
        folderData.visibleStart = startIndex;
        folderData.visibleCount = (folderData.visibleCount || 0) + (endIndex - startIndex);
        folderData.hasMore = endIndex < folder.children.length;

        if (endIndex < folder.children.length) {
            updateLoadMoreButton(container, folder, path, endIndex);
        } else {
            removeLoadMoreButton(container);
        }
    });
}

function updateLoadMoreButton(container, folder, path, nextStartIndex) {
    removeLoadMoreButton(container);

    const remaining = folder.children.length - nextStartIndex;
    const loadMoreContainer = document.createElement('div');
    loadMoreContainer.className = 'load-more-container';

    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'load-more-btn';
    loadMoreBtn.setAttribute('data-folder-path', path.join(','));
    loadMoreBtn.setAttribute('data-start-index', nextStartIndex);
    loadMoreBtn.innerHTML = `<span class="icon">↓</span> Load more (${remaining} remaining)`;

    loadMoreBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width: 16px; height: 16px;"></div> Loading...';

        loadMoreFolderItems(folder, path, container, nextStartIndex, VIRTUAL_SCROLL_CONFIG.loadMoreCount);
    };

    loadMoreContainer.appendChild(loadMoreBtn);
    container.parentNode.appendChild(loadMoreContainer);
}

function removeLoadMoreButton(container) {
    const oldContainer = container.parentNode?.querySelector('.load-more-container');
    if (oldContainer) oldContainer.remove();
}

function renderTree() {
    const tree = document.getElementById('tree');
    if (!tree) return;
    
    const hasContent = data.folders && data.folders.length > 0;
    
    if (!hasContent) {
        renderEmptyState(tree);
        return;
    }
    
    if (virtualScrollCache && typeof virtualScrollCache.clear === 'function') {
        virtualScrollCache.clear();
    }
    
    tree.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
    
    for (let i = 0; i < data.folders.length; i++) {
        const item = data.folders[i];
        const path = [i];
        
        if (item.type === 'bookmark') {
            fragment.appendChild(createBookmarkElement(item, path));
        } else if (item.type === 'folder') {
            fragment.appendChild(createFolderElement(item, path));
        }
    }
    
    tree.appendChild(fragment);
    
    setupGlobalClickHandler();
    initDragAndDrop();
    refreshDragItems();
}

function renderEmptyState(container) {
    const messages = getEmptyTreeMessages();
    
    container.innerHTML = `
        <div class="empty-tree-message" style="text-align: center; padding: 40px 20px; color: var(--text-secondary); font-size: 16px; line-height: 1.5;">
            <div style="font-size: 48px; margin-bottom: 16px;"><img src="icons/no-bookmarks.png"></div>
            <h3 style="margin: 0 0 8px 0; color: var(--text-primary);">${messages.title}</h3>
            <p style="margin: 0 0 20px 0;">${messages.subtitle}</p>
            <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                <button class="btn-secondary" id="empty-add-bookmark" style="font-size: 14px; padding: 8px 16px;">
                    ${messages.addBookmark}
                </button>
                <button class="btn-secondary" id="empty-add-folder" style="font-size: 14px; padding: 8px 16px;">
                    ${messages.newFolder}
                </button>
            </div>
        </div>
    `;
    
    setTimeout(() => {
        const addBookmarkBtn = document.getElementById('empty-add-bookmark');
        const addFolderBtn = document.getElementById('empty-add-folder');
        
        if (addBookmarkBtn) {
            addBookmarkBtn.addEventListener('click', () => openAddBookmarkModal('New Bookmark', 'https://'));
        }
        
        if (addFolderBtn) {
            addFolderBtn.addEventListener('click', addFolder);
        }
    }, 0);
}

function createFolderElement(item, path) {
    const div = document.createElement('div');
    div.className = 'tree-item';
    div.dataset.path = path.join(',');
    div.setAttribute('draggable', 'true');
    
    const itemCount = countItemsInFolder(item);
    
    div.innerHTML = `
        <div class="item-header folder">
            <div class="item-title">
                <span class="arrow">▶</span>
                <span class="icon folder-icon">📁</span>
                <span class="folder-name">${escapeHtml(item.name)}</span>
                <span class="folder-badge">${itemCount}</span>
            </div>
            <div class="actions">
                <button class="action-btn" data-action="rename" data-path="${path.join(',')}">✏️</button>
                <button class="action-btn delete" data-action="delete" data-path="${path.join(',')}">🗑️</button>
            </div>
        </div>
        <div class="subitems collapsed"></div>
    `;
    
    return div;
}

function createBookmarkElement(item, path) {
    const div = document.createElement('div');
    div.className = 'tree-item';
    div.dataset.path = path.join(',');
    div.setAttribute('draggable', 'true');
    
    const domain = getDomainFromUrl(item.url);
    
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.title = item.url;
    link.className = 'bookmark-link';
    
    const privateBtn = document.createElement('button');
    privateBtn.className = 'quick-action-btn-small';
    privateBtn.title = getMessage('openPrivate') || 'Open in private tab';
    privateBtn.style.cssText = 'width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; background: rgba(255, 255, 255, 0.1); border: none; color: var(--text-secondary); cursor: pointer; transition: all 0.2s ease;';
    privateBtn.textContent = '👁️';
    privateBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        
        try {
            const urlObj = new URL(item.url);
            if (!urlObj.protocol.startsWith('http')) {
                showNotification(getMessage('invalidUrlForPrivate') || 'Only http:// and https:// URLs can be opened in private mode', true);
                return;
            }
            openInPrivateTab(item.url, showNotification, getMessage);
        } catch (err) {
            showNotification(getMessage('invalidUrl') || 'Invalid URL', true);
        }
    });
    
    const header = document.createElement('div');
    header.className = 'item-header';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'item-title';
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'icon bookmark';
    iconSpan.textContent = '🔗';
    iconSpan.style.cssText = 'margin-right: 8px; font-size: 16px;';
    
    const textSpan = document.createElement('span');
    textSpan.textContent = item.title;
    textSpan.style.cssText = 'color: var(--accent); display: inline-block; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle;';
    
    titleDiv.appendChild(iconSpan);
    titleDiv.appendChild(textSpan);
    
    const domainSpan = document.createElement('span');
    domainSpan.className = 'item-domain';
    domainSpan.style.cssText = 'font-size: 11px; color: var(--text-secondary); margin-left: 8px; font-family: monospace; opacity: 0.7;';
    domainSpan.textContent = domain;
    titleDiv.appendChild(domainSpan);
    
    const quickActions = document.createElement('div');
    quickActions.className = 'quick-actions-hover';
    quickActions.style.cssText = 'position: absolute; right: 10px; top: 50%; transform: translateY(-50%); display: none; gap: 4px; background: var(--card-bg); backdrop-filter: blur(10px); border: 1px solid var(--card-border); border-radius: 8px; padding: 4px; z-index: 10;';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'quick-action-btn-small';
    editBtn.title = getMessage('edit') || 'Edit';
    editBtn.style.cssText = 'width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; background: rgba(255, 255, 255, 0.1); border: none; color: var(--text-secondary); cursor: pointer; transition: all 0.2s ease;';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        editBookmark(path.join(','));
    });
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'quick-action-btn-small';
    copyBtn.title = getMessage('copyUrl') || 'Copy URL';
    copyBtn.style.cssText = 'width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; background: rgba(255, 255, 255, 0.1); border: none; color: var(--text-secondary); cursor: pointer; transition: all 0.2s ease;';
    copyBtn.textContent = '📋';
    copyBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        copyBookmarkUrl(item.url);
    });
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'quick-action-btn-small delete';
    deleteBtn.title = getMessage('delete') || 'Delete';
    deleteBtn.style.cssText = 'width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; background: rgba(255, 64, 96, 0.1); border: none; color: #ff7b9c; cursor: pointer; transition: all 0.2s ease;';
    deleteBtn.textContent = '🗑️';
    deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        if (confirm(getMessage('deleteConfirm'))) {
            deleteBookmark(path.join(','));
        }
    });
    
    quickActions.appendChild(editBtn);
    quickActions.appendChild(copyBtn);
    quickActions.appendChild(privateBtn);
    quickActions.appendChild(deleteBtn);
    
    titleDiv.appendChild(quickActions);
    header.appendChild(titleDiv);
    
    link.appendChild(header);
    
    div.appendChild(link);
    
    link.style.cssText = 'display: block; text-decoration: none; color: inherit;';
    
    link.addEventListener('mouseenter', () => {
        textSpan.style.color = 'var(--accent-hover)';
        textSpan.style.textDecoration = 'none';
    });
    link.addEventListener('mouseleave', () => {
        textSpan.style.color = 'var(--accent)';
        textSpan.style.textDecoration = 'none';
    });
    
    div.addEventListener('mouseenter', function() {
        quickActions.style.display = 'flex';
    });
    
    div.addEventListener('mouseleave', function() {
        quickActions.style.display = 'none';
    });
    
    loadFaviconAsync(item.url, iconSpan);
    
    return div;
}

function initDragAndDrop() {
    const tree = document.getElementById('tree');
    if (!tree) return;
    
    removeDragListeners();
    
    tree.addEventListener('dragstart', handleDragStart, { capture: true });
    tree.addEventListener('dragend', handleDragEnd, { capture: true });
    tree.addEventListener('dragover', handleDragOver, { capture: true });
    tree.addEventListener('dragenter', handleDragEnter, { capture: true });
    tree.addEventListener('dragleave', handleDragLeave, { capture: true });
    tree.addEventListener('drop', handleDrop, { capture: true });
    
    refreshDragItems();
}

function refreshDragItems() {
    document.querySelectorAll('.tree-item').forEach(item => {
        item.setAttribute('draggable', 'true');
        item.setAttribute('aria-grabbed', 'false');
    });
}

function removeDragListeners() {
    const tree = document.getElementById('tree');
    if (!tree) return;
    
    const events = ['dragstart', 'dragend', 'dragover', 'dragenter', 'dragleave', 'drop'];
    events.forEach(event => {
        tree.removeEventListener(event, handleDragStart, { capture: true });
    });
}

function handleDragStart(e) {
    const item = e.target.closest('.tree-item');
    if (!item || e.target.closest('.action-btn, .quick-action-btn-small')) {
        e.preventDefault();
        return false;
    }
    
    dragState.draggedItem = item;
    dragState.dragPath = item.dataset.path ? item.dataset.path.split(',').map(Number) : null;
    dragState.isDragging = true;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    
    item.classList.add('dragging');
    item.setAttribute('aria-grabbed', 'true');
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.dataset.path || '');
    
    createDragGhost(item, e.clientX, e.clientY);
    
    e.dataTransfer.setDragImage(new Image(), 0, 0);
    
    document.addEventListener('keydown', handleDragKeyDown);
    
    return true;
}

function createDragGhost(item, clientX, clientY) {
    if (dragState.ghostElement) {
        dragState.ghostElement.remove();
    }
    
    const title = item.querySelector('.item-title span:nth-child(3)')?.textContent || 
                  item.querySelector('.item-title span:nth-child(2)')?.textContent || 
                  'Element';
    const icon = item.querySelector('.icon')?.textContent || '📄';
    
    const isFolder = !!item.querySelector('.folder-badge');
    const count = isFolder ? item.querySelector('.folder-badge')?.textContent : '';
    
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.innerHTML = `
        <span class="icon">${icon}</span>
        <span class="text">${title}</span>
        ${count ? `<span class="count">${count}</span>` : ''}
    `;
    
    ghost.style.left = (clientX + DRAG_CONFIG.ghostOffsetX) + 'px';
    ghost.style.top = (clientY + DRAG_CONFIG.ghostOffsetY) + 'px';
    
    document.body.appendChild(ghost);
    dragState.ghostElement = ghost;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (!dragState.isDragging) return;
    
    updateGhostPosition(e.clientX, e.clientY);
    
    const target = e.target.closest('.tree-item, .drop-spacer');
    if (!target) {
        clearDropIndicators();
        return;
    }
    
    const isValid = validateDropTarget(target);
    
    if (isValid) {
        showDropPosition(target, e.clientY);
    } else {
        showForbiddenIndicator(target);
    }
    
    handleAutoScroll(e.clientY);
}

function updateGhostPosition(x, y) {
    if (dragState.ghostElement) {
        dragState.ghostElement.style.left = (x + DRAG_CONFIG.ghostOffsetX) + 'px';
        dragState.ghostElement.style.top = (y + DRAG_CONFIG.ghostOffsetY) + 'px';
    }
}

function showDropPosition(target, mouseY) {
    clearDropIndicators();
    
    if (target.classList.contains('drop-spacer')) {
        target.classList.add('drop-over-spacer');
        dragState.dropPosition = 'after';
        dragState.lastValidTarget = target;
        return;
    }
    
    const rect = target.getBoundingClientRect();
    const isFolder = target.querySelector('.item-header.folder');
    
    if (isFolder && mouseY > rect.top + 30 && mouseY < rect.bottom - 10) {
        target.classList.add('drop-into-folder');
        dragState.dropPosition = 'inside';
    } else {
        const isBefore = mouseY < rect.top + rect.height / 2;
        
        if (isBefore) {
            target.classList.add('drop-above');
        } else {
            target.classList.add('drop-below');
        }
        
        dragState.dropPosition = isBefore ? 'before' : 'after';
    }
    
    dragState.lastValidTarget = target;
}

function clearDropIndicators() {
    document.querySelectorAll(
        '.drop-over-spacer, .drop-into-folder, .drop-above, .drop-below, .drop-forbidden'
    ).forEach(el => {
        el.classList.remove(
            'drop-over-spacer', 
            'drop-into-folder', 
            'drop-above', 
            'drop-below', 
            'drop-forbidden'
        );
    });
    
    const message = document.querySelector('.drop-forbidden-message');
    if (message) message.remove();
}

function handleAutoScroll(mouseY) {
    const tree = document.getElementById('tree');
    const rect = tree.getBoundingClientRect();
    
    if (mouseY < rect.top + DRAG_CONFIG.edgeThreshold) {
        tree.scrollTop -= DRAG_CONFIG.autoScrollSpeed;
    } else if (mouseY > rect.bottom - DRAG_CONFIG.edgeThreshold) {
        tree.scrollTop += DRAG_CONFIG.autoScrollSpeed;
    }
}

function handleDragEnter(e) {
    e.preventDefault();
    
    if (!dragState.isDragging) return;
    
    const target = e.target.closest('.tree-item, .drop-spacer');
    if (target && target !== dragState.draggedItem) {
        dragState.dragOverItem = target;
    }
}

function handleDragLeave(e) {
    e.preventDefault();
    
    const target = e.target.closest('.tree-item, .drop-spacer');
    if (target && !target.contains(e.relatedTarget)) {
        target.classList.remove('drop-above', 'drop-below', 'drop-into-folder', 'drop-forbidden');
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!dragState.isDragging || !dragState.draggedItem || !dragState.dragPath) {
        resetDragState();
        return;
    }
    
    const target = e.target.closest('.tree-item, .drop-spacer');
    if (!target || target === dragState.draggedItem) {
        resetDragState();
        return;
    }
    
    if (!validateDropTarget(target)) {
        showNotification('Cannot move here', true);
        resetDragState();
        return;
    }
    
    performDrop(target);
    
    showSuccessAnimation(target);
    
    saveAndRefresh().then(() => {
        showNotification(getMessage('dragSuccess'));
    });
    
    resetDragState();
}

function validateDropTarget(target) {
    if (!dragState.draggedItem || !dragState.dragPath) return false;
    
    if (target === dragState.draggedItem) return false;
    
    const targetPath = target.dataset.path ? target.dataset.path.split(',').map(Number) : null;
    if (!targetPath) return true;
    
    const draggedPath = dragState.dragPath;
    
    if (target.classList.contains('tree-item')) {
        const isFolder = target.querySelector('.item-header.folder');
        if (isFolder) {
            if (isAncestor(draggedPath, targetPath) || arraysEqual(draggedPath, targetPath)) {
                return false;
            }
        }
    }
    
    dragState.canDrop = true;
    return true;
}

function showForbiddenIndicator(target) {
    clearDropIndicators();
    
    target.classList.add('drop-forbidden');
    
    const tooltip = document.createElement('div');
    tooltip.className = 'drop-forbidden-message';
    tooltip.textContent = '⛔ Cannot drop here';
    
    target.style.position = 'relative';
    target.appendChild(tooltip);
    
    setTimeout(() => tooltip.remove(), 1000);
}

function performDrop(target) {
    const sourcePath = dragState.dragPath;
    let targetPath, insertBefore, isIntoFolder;
    
    if (target.classList.contains('drop-spacer')) {
        targetPath = target.dataset.path ? target.dataset.path.split(',').map(Number) : null;
        insertBefore = false;
        isIntoFolder = false;
    } else {
        targetPath = target.dataset.path ? target.dataset.path.split(',').map(Number) : null;
        
        if (dragState.dropPosition === 'inside') {
            isIntoFolder = true;
            insertBefore = false;
        } else {
            isIntoFolder = false;
            insertBefore = dragState.dropPosition === 'before';
        }
    }
    
    moveItem(sourcePath, targetPath, insertBefore, isIntoFolder);
}

function showSuccessAnimation(target) {
    const item = target.closest('.tree-item');
    if (item) {
        item.classList.add('move-success');
        setTimeout(() => {
            if (item && item.classList) {
                item.classList.remove('move-success');
            }
        }, 500);
    }
    
    if (dragState.draggedItem) {
        const draggedItem = dragState.draggedItem;
        draggedItem.classList.add('move-success');
        setTimeout(() => {
            if (draggedItem && draggedItem.classList) {
                draggedItem.classList.remove('move-success');
            }
        }, 500);
    }
}

function handleDragEnd(e) {
    const draggedItem = dragState.draggedItem;
    
    if (draggedItem) {
        draggedItem.classList.remove('dragging');
        draggedItem.setAttribute('aria-grabbed', 'false');
    }
    
    resetDragState();
}

function handleDragKeyDown(e) {
    if (e.key === 'Escape' && dragState.isDragging) {
        const draggedItem = dragState.draggedItem;
        
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem.setAttribute('aria-grabbed', 'false');
        }
        
        resetDragState();
        showNotification('Drag cancelled', false);
    }
}

function resetDragState() {
    if (dragState.ghostElement) {
        dragState.ghostElement.remove();
    }
    
    if (dragState.tooltipElement) {
        dragState.tooltipElement.remove();
    }
    
    dragState = {
        draggedItem: null,
        dragPath: null,
        dragOverItem: null,
        isDragging: false,
        ghostElement: null,
        tooltipElement: null,
        startX: 0,
        startY: 0,
        canDrop: true,
        lastValidTarget: null,
        dropPosition: null
    };
    
    clearDropIndicators();
    document.removeEventListener('keydown', handleDragKeyDown);
}

async function moveItem(sourcePath, targetPath, insertBefore = true, isIntoFolder = false) {
    const sourceParent = getParentByPath(data, sourcePath.slice(0, -1));
    const sourceIndex = sourcePath[sourcePath.length - 1];
    const itemToMove = sourceParent[sourceIndex];
    
    if (!itemToMove) {
        throw new Error('Source item not found');
    }
    
    if (itemToMove.type === 'folder' && targetPath) {
        let current = data.folders;
        for (let i = 0; i < targetPath.length; i++) {
            const idx = targetPath[i];
            if (current[idx] === itemToMove) {
                throw new Error('Cannot move folder into itself');
            }
            if (current[idx]?.type === 'folder' && current[idx].children) {
                current = current[idx].children;
            }
        }
    }
    
    let targetArray;
    let insertPos;
    
    if (isIntoFolder && targetPath) {
        const folder = getItemByPath(data, targetPath);
        if (!folder || folder.type !== 'folder') {
            throw new Error('Target is not a folder');
        }
        targetArray = folder.children;
        insertPos = targetArray.length;
    } else if (targetPath) {
        targetArray = getParentByPath(data, targetPath.slice(0, -1));
        const targetIdx = targetPath[targetPath.length - 1];
        insertPos = insertBefore ? targetIdx : targetIdx + 1;
    } else {
        targetArray = data.folders;
        insertPos = targetArray.length;
    }
    
    if (targetArray === sourceParent && !isIntoFolder) {
        sourceParent.splice(sourceIndex, 1);
        if (sourceIndex < insertPos) {
            insertPos -= 1;
        }
        targetArray.splice(insertPos, 0, itemToMove);
    } else {
        sourceParent.splice(sourceIndex, 1);
        targetArray.splice(insertPos, 0, itemToMove);
    }
    
    itemToMove.dateModified = Date.now();
    
    if (virtualScrollCache && typeof virtualScrollCache.clear === 'function') {
        virtualScrollCache.clear();
    }
}

async function saveAndRefresh() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    await saveEncrypted(data, new Uint8Array(stored[STORAGE_KEY].salt), CryptoManager);
    
    if (virtualScrollCache && typeof virtualScrollCache.clear === 'function') {
        virtualScrollCache.clear();
    }
    renderTree();
}

async function exportData() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const blob = new Blob([JSON.stringify(stored[STORAGE_KEY], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'holy-private-backup.json';
    a.click();
    URL.revokeObjectURL(url);
}

async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    showLoadingIndicator(document.body, 'Importing...');
    
    try {
        const text = await file.text();
        const json = JSON.parse(text);
        
        if (!validateImportedData(json)) {
            throw new Error('Invalid format');
        }
        
        await chrome.storage.local.set({ [STORAGE_KEY]: json });
        showNotification(getMessage('importSuccess') || 'Import successful');
        
        setTimeout(() => {
            lock();
            showSection('login');
        }, 500);
        
    } catch (error) {
        showNotification(getMessage('invalidFile') || 'Invalid file format', true);
    } finally {
        hideLoadingIndicator(document.body);
        e.target.value = '';
    }
}

async function importFromChromeBookmarks() {
    if (!confirm(getMessage('importChromeConfirm'))) {
        return;
    }
    
    showLoadingIndicator(document.body, 'Importing Chrome bookmarks...');
    
    try {
        const chromeBookmarks = await chrome.bookmarks.getTree();
        const importedFolders = convertChromeBookmarks(chromeBookmarks[0].children || []);
        
        data.folders.push(...importedFolders);
        await saveAndRefresh();
        
        showNotification(getMessage('importChromeSuccess') || 'Chrome bookmarks imported successfully');
    } catch (error) {
        showNotification(getMessage('importChromeError') + ': ' + error.message, true);
    } finally {
        hideLoadingIndicator(document.body);
    }
}

async function importFromChromeBookmarksAdvanced() {
    try {
        const chromeBookmarks = await chrome.bookmarks.getTree();
        showChromeImportModal(chromeBookmarks[0].children || []);
    } catch (error) {
        showNotification(getMessage('importChromeError') + ': ' + error.message, true);
    }
}

function showChromeImportModal(bookmarkNodes) {
    const modal = document.createElement('div');
    modal.id = 'chrome-import-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(16px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    
    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.cssText = `
        background: var(--card-bg);
        backdrop-filter: blur(20px);
        border: 1px solid var(--card-border);
        border-radius: var(--radius);
        padding: 28px;
        width: 90%;
        max-width: 500px;
        max-height: 80vh;
        overflow-y: auto;
    `;
    
    content.innerHTML = `
        <h2 style="margin-top:0; color:var(--accent);">${getMessage('selectFoldersToImport') || 'Select folders to import'}</h2>
        <div id="folders-list" style="margin: 20px 0; max-height: 300px; overflow-y: auto;"></div>
        <div class="modal-buttons">
            <button class="btn-secondary" id="cancel-import">${getMessage('cancel')}</button>
            <button class="btn-primary" id="confirm-import">${getMessage('importSelected') || 'Import selected'}</button>
        </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    const foldersList = content.querySelector('#folders-list');
    const selectedFolders = new Map();
    
    function renderFolders(nodes, parentId = '', depth = 0) {
        nodes.forEach((node, index) => {
            if (!node.url && node.children && node.children.length > 0) {
                const folderId = parentId ? `${parentId}-${index}` : `folder-${index}`;
                
                const folderDiv = document.createElement('div');
                folderDiv.style.cssText = `
                    margin: 8px 0;
                    padding: 12px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                    margin-left: ${depth * 20}px;
                `;
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = folderId;
                checkbox.checked = false;
                checkbox.style.marginRight = '10px';
                
                const label = document.createElement('label');
                label.htmlFor = folderId;
                label.textContent = (node.title || 'Unnamed Folder') + ` (${countItemsInFolder(node)} bookmarks)`;
                label.style.cssText = 'cursor: pointer; display: flex; align-items: center; font-weight: 500;';
                
                label.prepend(checkbox);
                folderDiv.appendChild(label);
                
                checkbox.addEventListener('change', (e) => {
                    const isChecked = e.target.checked;
                    
                    if (isChecked) {
                        selectedFolders.set(folderId, {
                            node: node,
                            childrenIds: getAllChildFolderIds(node, folderId, [])
                        });
                        
                        const childIds = selectedFolders.get(folderId).childrenIds;
                        childIds.forEach(childId => {
                            selectedFolders.delete(childId);
                            const childCheckbox = document.getElementById(childId);
                            if (childCheckbox) {
                                childCheckbox.checked = false;
                                childCheckbox.disabled = true;
                            }
                        });
                    } else {
                        selectedFolders.delete(folderId);
                        const childIds = getAllChildFolderIds(node, folderId, []);
                        childIds.forEach(childId => {
                            const childCheckbox = document.getElementById(childId);
                            if (childCheckbox) {
                                childCheckbox.disabled = false;
                            }
                        });
                    }
                });
                
                foldersList.appendChild(folderDiv);
                
                if (node.children) {
                    renderFolders(node.children, folderId, depth + 1);
                }
            }
        });
    }
    
    function getAllChildFolderIds(folderNode, parentId, result = []) {
        if (!folderNode.children) return result;
        
        folderNode.children.forEach((child, index) => {
            if (!child.url && child.children && child.children.length > 0) {
                const childId = `${parentId}-${index}`;
                result.push(childId);
                getAllChildFolderIds(child, childId, result);
            }
        });
        
        return result;
    }
    
    renderFolders(bookmarkNodes);
    
    content.querySelector('#cancel-import').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    content.querySelector('#confirm-import').addEventListener('click', async () => {
        const importedData = [];
        
        selectedFolders.forEach((folderData) => {
            const folder = folderData.node;
            const converted = convertChromeBookmarks(folder.children || []);
            if (converted.length > 0) {
                importedData.push({
                    type: 'folder',
                    name: folder.title || 'Imported Folder',
                    children: converted,
                    dateAdded: Date.now()
                });
            }
        });
        
        data.folders.push(...importedData);
        await saveAndRefresh();
        
        document.body.removeChild(modal);
        showNotification(getMessage('importChromeSuccess') || 'Chrome bookmarks imported successfully');
    });
}

function startAutoLock() {
    clearTimeout(autoLockTimer);
    autoLockTimer = setTimeout(lock, INACTIVITY_TIMEOUT);
}

function lock() {
    clearTimeout(autoLockTimer);
    CryptoManager.clear();
    data = { folders: [] };
    pendingBookmark = null;
    
    if (virtualScrollCache && typeof virtualScrollCache.clear === 'function') {
        virtualScrollCache.clear();
    }
    clearElementCache();
    
    showSection('login');
    document.getElementById('password').value = '';
}

async function clearBookmarksHistoryByDomain() {
    if (!confirm(getMessage('clearHistoryConfirm'))) {
        return;
    }
    
    const clearHistoryBtn = getCachedElement('#clear-history');
    if (!clearHistoryBtn) return;
    
    const buttonIcon = getCachedElement('#clear-historydiv');
    if (!buttonIcon) return;
    
    const originalContent = buttonIcon.innerHTML;
    
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    
    buttonIcon.innerHTML = '';
    buttonIcon.appendChild(spinner);
    
    clearHistoryBtn.classList.add('loading');
    clearHistoryBtn.disabled = true;
    
    showLoadingIndicator(document.body, 'Clearing history...');
    
    try {
        const allUrls = collectAllBookmarkUrls(data.folders);
        if (allUrls.length === 0) {
            showNotification(getMessage('noBookmarks') || 'No bookmarks found', true);
            return;
        }
        
        const domains = new Set();
        allUrls.forEach(urlStr => {
            try {
                const url = new URL(urlStr);
                domains.add(url.hostname);
            } catch (e) {}
        });
        
        if (domains.size === 0) {
            showNotification(getMessage('noDomains') || 'No domains found in bookmarks', true);
            return;
        }
        
        let totalDeleted = 0;
        let processedDomains = 0;
        
        for (const domain of domains) {
            try {
                const results = await chrome.history.search({
                    text: domain,
                    startTime: 0,
                    maxResults: 100000
                });
                
                for (const entry of results) {
                    try {
                        const entryUrl = new URL(entry.url);
                        if (entryUrl.hostname === domain || entryUrl.hostname.endsWith('.' + domain)) {
                            await chrome.history.deleteUrl({ url: entry.url });
                            totalDeleted++;
                        }
                    } catch (e) {}
                }
                
                processedDomains++;
                await new Promise(resolve => setTimeout(resolve, 10));
                
            } catch (e) {
                processedDomains++;
            }
        }
        
        showNotification(getMessage('historyCleared', [totalDeleted, domains.size]) || `Cleared ${totalDeleted} history entries from ${domains.size} domains`);
        
    } catch (error) {
        showNotification(getMessage('clearHistoryError') || 'An error occurred while clearing history', true);
        
    } finally {
        buttonIcon.innerHTML = originalContent;
        clearHistoryBtn.classList.remove('loading');
        clearHistoryBtn.disabled = false;
        hideLoadingIndicator(document.body);
    }
}

function performCleanup() {
    if (virtualScrollCache && typeof virtualScrollCache.clear === 'function') {
        virtualScrollCache.clear();
    }
    
    if (window.HolyShared && window.HolyShared.faviconCache && typeof window.HolyShared.faviconCache.clear === 'function') {
        window.HolyShared.faviconCache.clear();
    }
    
    if (window.HolyShared && window.HolyShared.faviconPromises && typeof window.HolyShared.faviconPromises.clear === 'function') {
        window.HolyShared.faviconPromises.clear();
    }
    
    if (window.HolyShared && window.HolyShared.messageCache && typeof window.HolyShared.messageCache.clear === 'function') {
        window.HolyShared.messageCache.clear();
    }
    
    if (CryptoManager && typeof CryptoManager.clear === 'function') {
        CryptoManager.clear();
    }
    
    data = { folders: [] };
    pendingBookmark = null;
    editingBookmarkPath = null;
    clipboardItem = null;
    
    clearElementCache();
}

window.addEventListener('pagehide', performCleanup);
window.addEventListener('beforeunload', performCleanup);

window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        if (window.HolyShared && window.HolyShared.messageCache && typeof window.HolyShared.messageCache.clear === 'function') {
            window.HolyShared.messageCache.clear();
        }
        if (window.HolyShared && window.HolyShared.faviconCache && typeof window.HolyShared.faviconCache.clear === 'function') {
            window.HolyShared.faviconCache.clear();
        }
    }
});
async function initFaviconToggle() {
    const toggle = document.getElementById('favicon-toggle');
    if (!toggle) return;
    

    const enabled = window.HolyShared.isFaviconEnabled();
    toggle.checked = enabled;
    

    toggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        window.HolyShared.setFaviconEnabled(enabled);
        

        if (window.HolyShared.faviconCache) {
            window.HolyShared.faviconCache.clear();
        }
        if (window.HolyShared.faviconPromises) {
            window.HolyShared.faviconPromises.clear();
        }
        

        renderTree();
    });
}
document.addEventListener('DOMContentLoaded', init);
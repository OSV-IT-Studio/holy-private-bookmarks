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

// IMPORTING FUNCTIONS FROM SHARED 
const Shared = window.HolyShared || {};


if (!window.HolyShared) {
    console.error('CRITICAL: HolyShared not loaded! Check script order in manager.html');
}

if (!window.SecureCrypto) {
    console.error('CRITICAL: SecureCrypto not loaded! Check script order in manager.html');
}

if (!window.ThemeManager) {
    console.error('ThemeManager not loaded');
}


const {

    STORAGE_KEY: SHARED_STORAGE_KEY,
    INACTIVITY_TIMEOUT: SHARED_INACTIVITY_TIMEOUT,
    BOOKMARKS_PER_PAGE: SHARED_BOOKMARKS_PER_PAGE,
    VIRTUAL_SCROLL_CONFIG,
    FAVICON_ENABLED_KEY,
    

    LRUMap,
    messageCache,
    faviconCache,
    faviconPromises,
    virtualScrollCache,
    

    secureWipeArray,
    secureWipeString,
    wipeSensitiveData,
    wipeUserData,
    clearAllSharedCaches,
    

    getCachedElement,
    clearElementCache,
    

    getMessage,
    

    normalizePath,
    getItemByPath,
    getParentByPath,
    removeItemByPath,
    findItemPath,
    findFolderById,
    getFolderPathById,
    isAncestor,
    arraysEqual,
    

    countItemsInFolder,
    countFoldersInFolder,
    countAllBookmarks,
    

    isFaviconEnabled,
    setFaviconEnabled,
    getFaviconUrl,
    getDomainFromUrl,
    getFaviconWithCache,
    loadFaviconAsync,
    updateIconWithFavicon,
    

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
} = Shared;

//  CONSTANTS 
const STORAGE_KEY = SHARED_STORAGE_KEY || 'holyPrivateData';
const INACTIVITY_TIMEOUT = SHARED_INACTIVITY_TIMEOUT || 10 * 60 * 1000;
const BOOKMARKS_PER_PAGE = SHARED_BOOKMARKS_PER_PAGE || 50;

const CryptoManager = window.SecureCrypto;

//  STATE
let data = { folders: [] };
let currentFolderId = 'all';
let searchQuery = '';
let editingBookmark = null;
let editingBookmarkPath = null;
let selectedBookmarks = new Set();
let isCtrlPressed = false;
let lastSelectedIndex = -1;

let inactivityTimer;
let isLocked = false;

// Caches for the manager
let bookmarksCache = new Map();
let folderCountsCache = new Map();
let lastDataVersion = 0;

// Virtual scroll
let renderedBookmarks = [];
let currentPage = 0;
let isLoadingMore = false;
let hasMoreBookmarks = true;
let bookmarksContainer = null;
let bookmarksGrid = null;
let intersectionObserver = null;

let isRendering = false;
let renderQueue = [];

//  LOCALIZATION 


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
    
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        const text = getMessage(key);
        if (text) {
            element.title = text;
        }
    });
}

//  TIMER CONTROL 


function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    
    if (!isLocked && CryptoManager?.isReady()) {
        inactivityTimer = setTimeout(lockManager, INACTIVITY_TIMEOUT);
    }
}


function initActivityTracking() {
    const events = [
        'mousemove', 'mousedown', 'click', 'scroll',
        'keydown', 'keypress', 'keyup', 'input', 'change',
        'focus', 'focusin'
    ];
    
    events.forEach(event => {
        document.addEventListener(event, resetInactivityTimer);
    });
    
    window.addEventListener('focus', resetInactivityTimer);
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            resetInactivityTimer();
        }
    });
}

// BLOCKING 


async function lockManager() {
    if (isLocked || !CryptoManager?.isReady()) return;
    
    isLocked = true;
    

    if (data) {
        wipeUserData(data);
    }
    
    CryptoManager.clear();
    data = { folders: [] };
    clearManagerCaches();
    
 
    clearAllSharedCaches();
    

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
    
    const loadMoreTrigger = document.getElementById('load-more-trigger');
    if (loadMoreTrigger) {
        loadMoreTrigger.remove();
    }
    
    const emptyState = document.getElementById('empty-state');
    if (emptyState) {
        emptyState.style.display = 'flex';
        
        const emptyStateIcon = emptyState.querySelector('.empty-state__icon');
        const emptyStateTitle = emptyState.querySelector('h3');
        const emptyStateDesc = emptyState.querySelector('p');
        
        if (emptyStateIcon) {
            emptyStateIcon.innerHTML = `
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
            `;
        }
        if (emptyStateTitle) emptyStateTitle.textContent = getMessage('noBookmarksInFolder') || 'No bookmarks in this folder';
        if (emptyStateDesc) emptyStateDesc.textContent = getMessage('addBookmarksToGetStarted') || 'Add bookmarks to get started';
    }
    
    const allCount = document.getElementById('all-count');
    if (allCount) allCount.textContent = '0';
    
    const bookmarksCount = document.getElementById('bookmarks-count');
    if (bookmarksCount) bookmarksCount.textContent = `0 ${getMessage('bookmarks') || 'bookmarks'}`;
    
    renderedBookmarks = [];
    currentPage = 0;
    hasMoreBookmarks = true;
    
    if (intersectionObserver) {
        intersectionObserver.disconnect();
        intersectionObserver = null;
    }
    
    document.getElementById('lock-screen').style.display = 'flex';
    document.querySelector('.container').style.display = 'none';
    
    const passwordInput = document.getElementById('password-input');
    if (passwordInput) {
        passwordInput.value = '';
    }
    
    const lockDescription = document.querySelector('.lock-description');
    if (lockDescription) {
        lockDescription.textContent = getMessage('managerLocked') || 'Manager locked';
    }
    
    showNotification(getMessage('managerLocked') || 'Manager locked', false);
}


function manualLock() {
    lockManager();
}

function initLockButton() {
    const lockBtn = document.getElementById('manual-lock-btn');
    if (lockBtn) {
        lockBtn.addEventListener('click', manualLock);
    }
}

// CLEARING CACHES


function clearManagerCaches() {
    if (bookmarksCache) bookmarksCache.clear();
    if (folderCountsCache) folderCountsCache.clear();
    
    bookmarksContainer = null;
    bookmarksGrid = null;
    
    if (intersectionObserver) {
        intersectionObserver.disconnect();
        intersectionObserver = null;
    }
    
    renderedBookmarks = [];
    currentPage = 0;
    hasMoreBookmarks = true;
}


function clearBookmarksCache() {
    bookmarksCache.clear();
    folderCountsCache.clear();
    
    if (Shared.faviconCache) {
        Shared.faviconCache.clear();
    }
    
    if (Shared.faviconPromises) {
        Shared.faviconPromises.clear();
    }
    
    if (data) {
        data._version = Date.now();
    }
    
    bookmarksCache = new Map();
    folderCountsCache = new Map();
}

// FULL CLEANING


function performFullCleanup() {

    if (data) {
        wipeUserData(data);
    }
    

    clearAllSharedCaches();
    

    clearManagerCaches();
    

    if (CryptoManager?.clear) {
        CryptoManager.clear();
    }
    

    data = { folders: [] };
    if (selectedBookmarks?.clear) selectedBookmarks.clear();
    editingBookmark = null;
    editingBookmarkPath = null;
    

    if (window.gc) {
        try {
            window.gc();
            setTimeout(() => {
                try { window.gc(); } catch (e) {}
            }, 100);
        } catch (e) {}
    }
}

// WORKING WITH SELECTION


function clearSelection() {
    selectedBookmarks.clear();
    document.querySelectorAll('.tree-item.selected').forEach(item => {
        item.classList.remove('selected');
    });
    updateSelectionToolbar();
}


function updateSelectionToolbar() {
    const selectionBar = document.getElementById('selection-toolbar');
    const selectionCount = document.getElementById('selection-count');
    
    if (selectedBookmarks.size > 0) {
        if (!selectionBar) {
            createSelectionToolbar();
        } else {
            selectionCount.textContent = selectedBookmarks.size;
            selectionBar.style.display = 'flex';
        }
    } else {
        if (selectionBar) {
            selectionBar.style.display = 'none';
        }
    }
}


function createSelectionToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'selection-toolbar';
    toolbar.className = 'selection-toolbar';
    
    const selectedText = getMessage('selected') || 'selected';
    const moveTitle = getMessage('moveSelectedTitle') || 'Move selected';
    const moveText = getMessage('move') || 'Move';
    const deleteTitle = getMessage('deleteSelectedTitle') || 'Delete selected';
    const deleteText = getMessage('delete') || 'Delete';
    const cancelTitle = getMessage('cancelSelectionTitle') || 'Cancel selection';
    
    toolbar.innerHTML = `
        <div class="selection-info">
            <span class="selection-count" id="selection-count">${selectedBookmarks.size}</span>
            <span>${selectedText}</span>
        </div>
        <div class="selection-actions">
            <button class="selection-btn selection-btn--move" id="selection-move" title="${moveTitle}">
                <span class="selection-btn__icon">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M2 5L2 14C2 15.1 2.9 16 4 16L14 16C15.1 16 16 15.1 16 14L16 7C16 5.9 15.1 5 14 5L9 5L7 3L4 3C2.9 3 2 3.9 2 5Z" />
                        <path d="M6 10.5L12 10.5M9 7.5L9 13.5" />
                        <path d="M10 9L12 10.5L10 12" />
                    </svg>
                </span>
                <span class="selection-btn__text">${moveText}</span>
            </button>
            <button class="selection-btn selection-btn--delete" id="selection-delete" title="${deleteTitle}">
                <span class="selection-btn__icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </span>
                <span class="selection-btn__text">${deleteText}</span>
            </button>
            <button class="selection-btn selection-btn--cancel" id="selection-cancel" title="${cancelTitle}">
                <span class="selection-btn__icon">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="4" x2="4" y2="12"/>
                        <line x1="4" y1="4" x2="12" y2="12"/>
                    </svg>
                </span>
            </button>
        </div>
    `;
    
    document.querySelector('.main-content').insertBefore(toolbar, document.querySelector('.bookmarks-container'));
    
    document.getElementById('selection-move').addEventListener('click', () => showMoveSelectedDialog());
    document.getElementById('selection-delete').addEventListener('click', () => deleteSelectedBookmarks());
    document.getElementById('selection-cancel').addEventListener('click', clearSelection);
}

// WORKING WITH DATA


function getDataVersion() {
    return data._version || (data._version = Date.now());
}


function countBookmarksInFolder(folderId) {
    const version = getDataVersion();
    
    if (folderCountsCache.has(folderId) && folderCountsCache.get(folderId).version === version) {
        return folderCountsCache.get(folderId).count;
    }
    
    if (folderId === 'all') {
        const count = countAllBookmarks(data);
        folderCountsCache.set(folderId, { count, version });
        return count;
    }
    
    const folder = findFolderById(data.folders, folderId);
    if (!folder) return 0;
    
    const count = countItemsInFolder(folder);
    folderCountsCache.set(folderId, { count, version });
    return count;
}


function getBookmarksForFolder(folderId) {
    const cacheKey = `${folderId}_${searchQuery}`;
    const version = getDataVersion();
    
    if (bookmarksCache.has(cacheKey) && bookmarksCache.get(cacheKey).version === version) {
        return bookmarksCache.get(cacheKey).bookmarks;
    }
    
    const bookmarks = [];
    
    if (folderId === 'all') {
        function collectAllBookmarks(items) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type === 'bookmark') {
                    bookmarks.push(item);
                } else if (item.type === 'folder' && item.children) {
                    collectAllBookmarks(item.children);
                }
            }
        }
        collectAllBookmarks(data.folders);
    } else {
        const folder = findFolderById(data.folders, folderId);
        if (folder && folder.children) {
            function collectBookmarksFromFolder(items) {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.type === 'bookmark') {
                        bookmarks.push(item);
                    } else if (item.type === 'folder' && item.children) {
                        collectBookmarksFromFolder(item.children);
                    }
                }
            }
            collectBookmarksFromFolder(folder.children);
        }
    }
    
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const filtered = bookmarks.filter(bookmark => 
            bookmark.title.toLowerCase().includes(query) || 
            bookmark.url.toLowerCase().includes(query)
        );
        bookmarksCache.set(cacheKey, { bookmarks: filtered, version });
        return filtered;
    }
    
    bookmarksCache.set(cacheKey, { bookmarks, version });
    return bookmarks;
}

//  VIRTUAL SCROLL 


function initVirtualScroll() {
    bookmarksContainer = document.querySelector('.bookmarks-container');
    bookmarksGrid = document.getElementById('bookmarks-grid');
    
    if (!bookmarksContainer || !bookmarksGrid) return;
    
    if (intersectionObserver) {
        intersectionObserver.disconnect();
    }
    
    intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isLoadingMore && hasMoreBookmarks) {
                loadMoreBookmarks();
            }
        });
    }, {
        root: bookmarksContainer,
        rootMargin: '200px',
        threshold: 0.1
    });
    
    addLoadMoreTrigger();
}


function addLoadMoreTrigger() {
    if (!bookmarksGrid) return;
    
    const existingTrigger = document.getElementById('load-more-trigger');
    if (existingTrigger) {
        existingTrigger.remove();
    }
    
    const trigger = document.createElement('div');
    trigger.id = 'load-more-trigger';
    trigger.style.height = '1px';
    trigger.style.width = '100%';
    bookmarksGrid.appendChild(trigger);
    if (intersectionObserver) {
        intersectionObserver.observe(trigger);
    }
}


async function loadMoreBookmarks() {
    if (isLoadingMore || !hasMoreBookmarks) return;
    
    isLoadingMore = true;
    
    const bookmarks = getBookmarksForFolder(currentFolderId);
    const startIndex = currentPage * BOOKMARKS_PER_PAGE;
    const endIndex = Math.min(startIndex + BOOKMARKS_PER_PAGE, bookmarks.length);
    
    if (startIndex >= bookmarks.length) {
        hasMoreBookmarks = false;
        isLoadingMore = false;
        return;
    }
    
    showLoadingIndicator(bookmarksGrid);
    
    const bookmarksToRender = bookmarks.slice(startIndex, endIndex);
    const fragment = document.createDocumentFragment();
    const elements = await Promise.all(
        bookmarksToRender.map(async (bookmark, index) => {
            return await createBookmarkItem(bookmark, startIndex + index);
        })
    );
    
    elements.forEach(element => {
        if (element) fragment.appendChild(element);
    });
    
    const oldTrigger = document.getElementById('load-more-trigger');
    if (oldTrigger) oldTrigger.remove();
    
    bookmarksGrid.appendChild(fragment);
    addLoadMoreTrigger();
    
    renderedBookmarks = [...renderedBookmarks, ...bookmarksToRender];
    currentPage++;
    
    if (endIndex >= bookmarks.length) {
        hasMoreBookmarks = false;
    }
    
    hideLoadingIndicator(bookmarksGrid);
    isLoadingMore = false;
    resetInactivityTimer();
}

//  CREATING ELEMENTS 


async function createBookmarkItem(bookmark, index) {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.dataset.index = index;
    
    if (selectedBookmarks.has(bookmark)) {
        item.classList.add('selected');
    }
    
    const domain = getDomainFromUrl(bookmark.url);
    const faviconUrl = await getFaviconWithCache(bookmark.url);
    
    item.innerHTML = `
        ${faviconUrl ? 
            `<img src="${faviconUrl}" class="tree-item__favicon" alt="${escapeHtml(domain)}" loading="lazy">` :
            `<div class="tree-item__favicon-placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 4C5 2.89543 5.89543 2 7 2H17C18.1046 2 19 2.89543 19 4V21L12 17L5 21V4Z" fill="currentColor"/>
                </svg>
            </div>`
        }
        <div class="tree-item__content">
            <div class="bookmark-title">${escapeHtml(bookmark.title)}</div>
        </div>
        <div class="item-domain">${escapeHtml(domain)}</div>
        <div class="quick-actions-hover">
            <button class="quick-action-btn-small edit" data-action="edit" title="${getMessage('edit') || 'Edit'}">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M11.5 2.5a2 2 0 0 1 3 3L6 14l-4 1 1-4 8.5-8.5z"></path>
                </svg>
            </button>
            <button class="quick-action-btn-small copy" data-action="copy" title="${getMessage('copyUrl') || 'Copy URL'}">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                    <rect x="2" y="4" width="10" height="10" rx="1" ry="1"></rect>
                    <path d="M4 2h8a2 2 0 0 1 2 2v8"></path>
                </svg>
            </button>
            <button class="quick-action-btn-small private" data-action="private" title="${getMessage('openPrivate') || 'Open in private tab'}">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                    <rect x="3" y="6" width="10" height="8" rx="1" ry="1"></rect>
                    <path d="M5 6V4a3 3 0 0 1 6 0v2"></path>
                    <circle cx="8" cy="10" r="1"></circle>
                </svg>
            </button>
            <button class="quick-action-btn-small delete" data-action="delete" title="${getMessage('delete') || 'Delete'}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        </div>
    `;
    
    const actions = item.querySelector('.quick-actions-hover');
    
    actions.addEventListener('click', (e) => {
        const button = e.target.closest('.quick-action-btn-small');
        if (!button) return;
        
        e.stopPropagation();
        
        const action = button.dataset.action;
        
        switch(action) {
            case 'edit':
                editBookmark(bookmark);
                break;
            case 'copy':
                navigator.clipboard.writeText(bookmark.url).then(() => {
                    showNotification(getMessage('urlCopied') || 'URL copied to clipboard');
                });
                break;
            case 'private':
                openInPrivateTab(bookmark.url);
                break;
            case 'delete':
                if (confirm(getMessage('deleteConfirm') || 'Delete this bookmark?')) {
                    deleteBookmark(bookmark);
                }
                break;
        }
    });
    
    item.addEventListener('click', (e) => {
        if (e.target.closest('.quick-actions-hover')) return;
        
        if (isCtrlPressed) {
            e.preventDefault();
            
            if (selectedBookmarks.has(bookmark)) {
                selectedBookmarks.delete(bookmark);
                item.classList.remove('selected');
            } else {
                selectedBookmarks.add(bookmark);
                item.classList.add('selected');
            }
            
            updateSelectionToolbar();
        } else if (selectedBookmarks.size > 0) {
            clearSelection();
        } else {
            window.open(bookmark.url, '_blank');
        }
    });
    
    item.addEventListener('click', (e) => {
        if (e.shiftKey && lastSelectedIndex !== -1 && lastSelectedIndex !== index) {
            e.preventDefault();
            e.stopPropagation();
            
            const bookmarks = getBookmarksForFolder(currentFolderId);
            const start = Math.min(lastSelectedIndex, index);
            const end = Math.max(lastSelectedIndex, index);
            
            for (let i = start; i <= end; i++) {
                selectedBookmarks.add(bookmarks[i]);
            }
            
            document.querySelectorAll('.tree-item').forEach((el, i) => {
                if (i >= start && i <= end) {
                    el.classList.add('selected');
                }
            });
            
            updateSelectionToolbar();
        }
        
        lastSelectedIndex = index;
    });
    
    return item;
}

//  RENDERING 


function renderFolderTree() {
    const tree = document.getElementById('folder-tree');
    if (!tree) return;
    
    const allBookmarksItem = tree.querySelector('.all-bookmarks');
    tree.innerHTML = '';
    if (allBookmarksItem) {
        tree.appendChild(allBookmarksItem);
    }
    
    const allCount = document.getElementById('all-count');
    if (allCount) {
        allCount.textContent = countAllBookmarks(data);
    }
    
    const fragment = document.createDocumentFragment();
    renderFoldersRecursive(data.folders, fragment, []);
    tree.appendChild(fragment);
    
    addFolderTreeEventListeners();
    resetInactivityTimer();
}


function renderFoldersRecursive(items, container, path = [], depth = 0) {
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type === 'folder') {
            const currentPath = [...path, i];
            const folderId = currentPath.join(',');
            const itemCount = countItemsInFolder(item);
            
            const hasSubfolders = item.children && item.children.some(child => child.type === 'folder');
            
            const li = document.createElement('li');
            li.className = 'folder-item';
            if (hasSubfolders) li.classList.add('has-children');
            li.dataset.folderId = folderId;
            
            const folderContent = document.createElement('div');
            folderContent.className = 'folder-content';
            
            const toggleSpan = document.createElement('span');
            toggleSpan.className = 'folder-toggle';
            if (hasSubfolders) {
                toggleSpan.textContent = '▶';
            }
            folderContent.appendChild(toggleSpan);
            
            const iconDiv = document.createElement('div');
            iconDiv.className = 'folder-icon';
            iconDiv.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
            `;
            folderContent.appendChild(iconDiv);
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'folder-name';
            nameDiv.textContent = item.name;
            folderContent.appendChild(nameDiv);
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'folder-actions';
            
            const editBtn = document.createElement('button');
            editBtn.className = 'folder-action-btn edit';
            editBtn.title = getMessage('rename') || 'Rename';
            editBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
            `;
            editBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const folderItem = this.closest('.folder-item');
                const folderId = folderItem.dataset.folderId;
                renameFolder(folderId);
            });
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'folder-action-btn delete';
            deleteBtn.title = getMessage('delete') || 'Delete';
            deleteBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            `;
            deleteBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const folderItem = this.closest('.folder-item');
                const folderId = folderItem.dataset.folderId;
                deleteFolder(folderId);
            });
            
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);
            folderContent.appendChild(actionsDiv);
            
            li.appendChild(folderContent);
            
            const countDiv = document.createElement('div');
            countDiv.className = 'folder-count';
            countDiv.textContent = itemCount;
            li.appendChild(countDiv);
            
            container.appendChild(li);
            
            if (hasSubfolders) {
                const subUl = document.createElement('ul');
                subUl.className = 'subfolder-list';
                container.appendChild(subUl);
                renderFoldersRecursive(item.children, subUl, currentPath, depth + 1);
            }
        }
    }
}


function addFolderTreeEventListeners() {
    document.querySelectorAll('.folder-item.has-children .folder-toggle').forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            e.stopPropagation();
            const folderItem = this.closest('.folder-item');
            toggleFolder(folderItem);
        });
    });
    
    document.querySelectorAll('.folder-item .folder-name').forEach(folderName => {
        folderName.addEventListener('click', function(e) {
            e.stopPropagation();
            const folderItem = this.closest('.folder-item');
            const folderId = folderItem.dataset.folderId || 'all';
            setActiveFolder(folderId);
        });
    });
    
    document.querySelectorAll('.folder-item').forEach(item => {
        item.addEventListener('click', function(e) {
            if (e.target.closest('.folder-toggle')) return;
            if (e.target.closest('.folder-actions')) return;
            
            const folderId = this.dataset.folderId || 'all';
            setActiveFolder(folderId);
        });
    });
    
    document.querySelectorAll('.folder-action-btn.edit').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const folderItem = this.closest('.folder-item');
            const folderId = folderItem.dataset.folderId;
            renameFolder(folderId);
        });
    });
    
    document.querySelectorAll('.folder-action-btn.delete').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const folderItem = this.closest('.folder-item');
            const folderId = folderItem.dataset.folderId;
            deleteFolder(folderId);
        });
    });
}


function toggleFolder(folderItem) {
    const toggle = folderItem.querySelector('.folder-toggle');
    const subList = folderItem.nextElementSibling;
    
    if (subList && subList.classList.contains('subfolder-list')) {
        const isExpanded = folderItem.classList.contains('expanded');
        
        if (isExpanded) {
            folderItem.classList.remove('expanded');
            toggle.textContent = '▶';
        } else {
            folderItem.classList.add('expanded');
            toggle.textContent = '▼';
        }
    }
    
    resetInactivityTimer();
}


function setActiveFolder(folderId) {
    currentFolderId = folderId;
    currentPage = 0;
    hasMoreBookmarks = true;
    
    document.querySelectorAll('.folder-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeItem = document.querySelector(`.folder-item[data-folder-id="${folderId}"]`) || 
                       document.querySelector('.all-bookmarks');
    if (activeItem) activeItem.classList.add('active');
    
    const folderNameElement = document.getElementById('current-folder-name');
    const bookmarksCountElement = document.getElementById('bookmarks-count');
    
    if (folderId === 'all') {
        folderNameElement.textContent = getMessage('allBookmarks') || 'All Bookmarks';
    } else {
        const folder = findFolderById(data.folders, folderId);
        folderNameElement.textContent = folder ? folder.name : getMessage('allBookmarks');
    }
    
    const count = getBookmarksForFolder(folderId).length;
    bookmarksCountElement.textContent = `${count} ${getMessage('bookmarks') || 'bookmarks'}`;
    
    renderBookmarks();
    resetInactivityTimer();
}


async function renderBookmarks() {
    if (!bookmarksGrid) {
        bookmarksGrid = document.getElementById('bookmarks-grid');
        if (!bookmarksGrid) return;
    }
    
    const bookmarks = getBookmarksForFolder(currentFolderId);
    const emptyState = document.getElementById('empty-state');
    
    if (bookmarks.length === 0) {
        bookmarksGrid.style.display = 'none';
        
        if (emptyState) {
            emptyState.style.display = 'flex';
            
            const emptyStateIcon = emptyState.querySelector('.empty-state__icon');
            const emptyStateTitle = emptyState.querySelector('h3');
            const emptyStateDesc = emptyState.querySelector('p');
            
            if (searchQuery && searchQuery.trim() !== '') {
                emptyStateIcon.innerHTML = `
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                `;
                emptyStateTitle.textContent = getMessage('noSearchResults') || 'No bookmarks found';
                emptyStateDesc.textContent = getMessage('noSearchResultsDesc') || 'Try a different search term';
            } else {
                emptyStateIcon.innerHTML = `
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                `;
                emptyStateTitle.textContent = getMessage('noBookmarksInFolder') || 'No bookmarks in this folder';
                emptyStateDesc.textContent = getMessage('addBookmarksToGetStarted') || 'Add bookmarks to get started';
            }
        }
        return;
    }
    
    bookmarksGrid.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    
    currentPage = 0;
    hasMoreBookmarks = true;
    renderedBookmarks = [];
    
    bookmarksGrid.innerHTML = '';
    await loadMoreBookmarks();
    addLoadMoreTrigger();
}

//  OPERATIONS WITH BOOKMARKS


function editBookmark(bookmark) {
    const modal = document.getElementById('edit-bookmark-modal');
    if (!modal) return;
    
    editingBookmark = bookmark;
    editingBookmarkPath = findItemPath(data, bookmark);
    
    modal.style.display = 'flex';
    
    document.getElementById('modal-title-text').textContent = getMessage('editBookmark') || 'Edit Bookmark';
    document.getElementById('modal-page-title').textContent = bookmark.title.length > 60 ? 
        bookmark.title.slice(0, 60) + '...' : bookmark.title;
    document.getElementById('modal-bookmark-title').value = bookmark.title;
    document.getElementById('modal-bookmark-url').value = bookmark.url;
    
    const select = document.getElementById('folder-select');
    select.innerHTML = '';
    
    const rootOption = document.createElement('option');
    rootOption.value = '';
    rootOption.textContent = getMessage('rootFolder') || 'Root folder';
    select.appendChild(rootOption);
    
    buildFolderOptions(data.folders, select, '', 0);
    
    if (editingBookmarkPath && editingBookmarkPath.length > 1) {
        const parentPath = editingBookmarkPath.slice(0, -1);
        if (parentPath.length > 0) {
            const parentPathStr = parentPath.join('/');
            select.value = parentPathStr;
        }
    }
    
    resetInactivityTimer();
}


function handleModalSave() {
    const modal = document.getElementById('edit-bookmark-modal');
    if (!modal) return;
    
    const titleInput = document.getElementById('modal-bookmark-title');
    const urlInput = document.getElementById('modal-bookmark-url');
    
    const title = titleInput.value.trim();
    const url = urlInput.value.trim();
    
    if (!title || !url) {
        showNotification(getMessage('titleRequired') || 'Title and URL are required', true);
        return;
    }
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showNotification('Please enter a valid URL starting with http:// or https://', true);
        return;
    }
    
    const pathStr = document.getElementById('folder-select').value;
    
    let targetPath = [];
    if (pathStr !== '') {
        targetPath = pathStr.split('/').map(Number).filter(Number.isInteger);
    }
    
    if (targetPath.length > 0) {
        const target = getItemByPath(data, targetPath);
        if (!target || target.type !== 'folder') {
            showNotification('Selected path is not a folder', true);
            return;
        }
    }
    
    if (editingBookmarkPath) {
        updateBookmark(editingBookmarkPath, title, url, targetPath);
    } else {
        addNewBookmarkToPath(title, url, targetPath);
    }
    
    saveAndRefresh().then(() => {
        modal.style.display = 'none';
        editingBookmark = null;
        editingBookmarkPath = null;
    });
}


function addNewBookmarkToPath(title, url, targetPath) {
    let targetArray;
    
    if (targetPath.length === 0) {
        targetArray = data.folders;
    } else {
        const folder = getItemByPath(data, targetPath);
        if (!folder || folder.type !== 'folder' || !Array.isArray(folder.children)) return;
        targetArray = folder.children;
    }
    
    targetArray.push({
        type: 'bookmark',
        title: title,
        url: url,
        dateAdded: Date.now()
    });
}


function updateBookmark(oldPath, title, url, newPathRaw) {
    const newPath = normalizePath(newPathRaw || []);
    const oldFolderPath = oldPath.slice(0, -1);
    
    const sourceParent = getParentByPath(data, oldFolderPath);
    const sourceIndex = oldPath[oldPath.length - 1];
    const bookmark = sourceParent[sourceIndex];
    
    if (!bookmark) return;
    
    bookmark.title = title;
    bookmark.url = url;
    
    if (oldFolderPath.join('/') === newPath.join('/')) return;
    
    let targetArray;
    
    if (newPath.length === 0) {
        targetArray = data.folders;
    } else {
        const folder = getItemByPath(data, newPath);
        if (!folder || folder.type !== 'folder' || !Array.isArray(folder.children)) return;
        targetArray = folder.children;
    }
    
    sourceParent.splice(sourceIndex, 1);
    targetArray.push(bookmark);
}


async function deleteBookmark(bookmark) {
    const path = findItemPath(data, bookmark);
    if (path) {
        removeItemByPath(data, path);
        
        await saveChanges();
        
        showNotification(getMessage('bookmarkDeleted') || 'Bookmark deleted');
        renderFolderTree();
        renderBookmarks();
    }
}


function handleNewFolderInModal() {
    const name = prompt(getMessage('folderName') || 'Folder name:');
    if (name && name.trim()) {
        const newFolder = { 
            type: 'folder', 
            name: name.trim(), 
            children: [], 
            dateAdded: Date.now() 
        };
        data.folders.push(newFolder);
        
        const select = document.getElementById('folder-select');
        select.innerHTML = '';
        
        const rootOption = document.createElement('option');
        rootOption.value = '';
        rootOption.textContent = getMessage('rootFolder') || 'Root folder';
        select.appendChild(rootOption);
        
        buildFolderOptions(data.folders, select, '', 0);
        select.value = (data.folders.length - 1).toString();
        
        clearBookmarksCache();
    }
}


async function createNewFolder(parentFolderId = '') {
    const folderName = prompt(getMessage('folderName') || 'Folder name:');
    
    if (!folderName || !folderName.trim()) {
        return;
    }
    
    const trimmedName = folderName.trim();
    
    const newFolder = {
        type: 'folder',
        name: trimmedName,
        children: [],
        dateAdded: Date.now()
    };
    
    if (parentFolderId === '') {
        data.folders.push(newFolder);
    } else {
        const parentFolder = findFolderById(data.folders, parentFolderId);
        if (parentFolder) {
            if (!parentFolder.children) {
                parentFolder.children = [];
            }
            parentFolder.children.push(newFolder);
        } else {
            data.folders.push(newFolder);
        }
    }
    
    await saveChanges();
    clearBookmarksCache();
    renderFolderTree();
    
    showNotification(getMessage('folderCreated') || 'Folder created successfully');
    resetInactivityTimer();
}


function initNewFolderButton() {
    const newFolderBtn = document.getElementById('new-folder-btn');
    if (newFolderBtn) {
        newFolderBtn.addEventListener('click', () => {
            createNewFolder();
        });
    }
}


async function saveChanges() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    if (stored[STORAGE_KEY]) {
        await saveEncrypted(data, CryptoManager);
    }
    
    clearBookmarksCache();
}

async function saveAndRefresh() {
    await saveChanges();
    renderFolderTree();
    renderBookmarks();
}
//  FOLDER OPERATIONS 


async function renameFolder(folderId) {
    if (folderId === 'all') {
        showNotification(getMessage('cannotRenameAll') || 'Cannot rename "All Bookmarks" folder', true);
        return;
    }
    
    const folder = findFolderById(data.folders, folderId);
    if (!folder) return;
    
    const currentName = folder.name;
    const newName = prompt(getMessage('renameFolder') || 'Rename folder:', currentName);
    
    if (newName && newName.trim() && newName.trim() !== currentName) {
        folder.name = newName.trim();
        
        await saveChanges();
        clearBookmarksCache();
        renderFolderTree();
        
        if (currentFolderId === folderId) {
            document.getElementById('current-folder-name').textContent = folder.name;
        }
        
        showNotification(getMessage('folderRenamed') || 'Folder renamed successfully');
        resetInactivityTimer();
    }
}


async function deleteFolder(folderId) {
    if (folderId === 'all') {
        showNotification(getMessage('cannotDeleteAll') || 'Cannot delete "All Bookmarks" folder', true);
        return;
    }
    
    const folder = findFolderById(data.folders, folderId);
    if (!folder) return;
    
    const bookmarkCount = countBookmarksInFolder(folderId);
    const folderCount = countFoldersInFolder(folder);
    
    let message = getMessage('deleteFolderConfirm') || 'Delete folder "{0}"?';
    message = message.replace('{0}', folder.name);
    
    if (bookmarkCount > 0 || folderCount > 0) {
        message += '\n\n';
        if (bookmarkCount > 0) {
            const bookmarksText = getMessage('bookmarksCount') || '{0} bookmarks';
            message += '• ' + bookmarksText.replace('{0}', bookmarkCount) + '\n';
        }
        if (folderCount > 0) {
            const foldersText = getMessage('foldersCount') || '{0} folders';
            message += '• ' + foldersText.replace('{0}', folderCount) + '\n';
        }
        message += '\n' + (getMessage('deleteFolderWarning') || 'All content will be permanently deleted.');
    }
    
    if (!confirm(message)) return;
    
    const path = getFolderPathById(folderId);
    if (path) {
        removeItemByPath(data, path);
        
        await saveChanges();
        clearBookmarksCache();
        
        if (currentFolderId === folderId) {
            setActiveFolder('all');
        } else {
            renderFolderTree();
            renderBookmarks();
        }
        
        showNotification(getMessage('folderDeleted') || 'Folder deleted successfully');
        resetInactivityTimer();
    }
}

//  MOVEMENT DIALOG


function showMoveSelectedDialog() {
    const bookmarksToMove = Array.from(selectedBookmarks);
    
    if (bookmarksToMove.length === 0) {
        showNotification(getMessage('noBookmarksSelected') || 'No bookmarks selected', true);
        return;
    }
    
    const folderSelect = document.createElement('div');
    folderSelect.className = 'folder-select-modal';
    
    const titleTemplate = getMessage('moveBookmarksTitle') || 'Move {0} bookmark{1}';
    const title = titleTemplate
        .replace('{0}', bookmarksToMove.length)
        .replace('{1}', bookmarksToMove.length > 1 ? 's' : '');
    
    const labelText = getMessage('selectDestinationFolder') || 'Select destination folder:';
    const rootOptionText = getMessage('rootFolder') || 'Root folder';
    const cancelText = getMessage('cancel') || 'Cancel';
    const moveText = getMessage('move') || 'Move';
    
    folderSelect.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <h3>${title}</h3>
            <label>${labelText}</label>
            <select id="move-folder-select" class="folder-select">
                <option value="">${rootOptionText}</option>
            </select>
            <div class="modal-buttons">
                <button class="modal-cancel" id="move-cancel">${cancelText}</button>
                <button class="modal-save" id="move-confirm">${moveText}</button>
            </div>
        </div>
    `;
    
    folderSelect.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);
        display: flex; justify-content: center; align-items: center;
        z-index: 3000;
    `;
    
    document.body.appendChild(folderSelect);
    
    const select = folderSelect.querySelector('#move-folder-select');
    buildFolderOptions(data.folders, select, '', 0);
    
    folderSelect.querySelector('#move-cancel').addEventListener('click', () => {
        folderSelect.remove();
    });
    
    folderSelect.querySelector('#move-confirm').addEventListener('click', async () => {
        const pathStr = select.value;
        let targetPath = [];
        if (pathStr !== '') {
            targetPath = pathStr.split('/').map(Number).filter(n => !isNaN(n));
        }
        
        await moveSelectedBookmarks(targetPath, bookmarksToMove);
        folderSelect.remove();
    });
}


async function moveSelectedBookmarks(targetPath, bookmarksList) {
    if (bookmarksList.length === 0) return;
    
    let targetArray;
    if (targetPath.length === 0) {
        targetArray = data.folders;
    } else {
        const folder = getItemByPath(data, targetPath);
        if (!folder || folder.type !== 'folder' || !Array.isArray(folder.children)) {
            showNotification(getMessage('invalidDestinationFolder') || 'Invalid destination folder', true);
            return;
        }
        targetArray = folder.children;
    }
    
    const groups = new Map();
    
    for (const bookmark of bookmarksList) {
        const path = findItemPath(data, bookmark);
        if (!path || path.length === 0) continue;
        
        const parent = getParentByPath(data, path.slice(0, -1));
        const idx = path[path.length - 1];
        
        if (!groups.has(parent)) groups.set(parent, []);
        groups.get(parent).push({ idx, bookmark });
    }
    
    let moved = 0;
    for (const [parent, items] of groups) {
        items.sort((a, b) => b.idx - a.idx);
        for (const { idx, bookmark } of items) {
            if (parent && parent[idx] === bookmark) {
                parent.splice(idx, 1);
                targetArray.push(bookmark);
                moved++;
            }
        }
    }
    
    if (moved > 0) {
        await saveChanges();
        clearBookmarksCache();
        clearSelection();
        
        const moveSuccessMessage = getMessage('bookmarksMoved') || '{0} bookmark{1} moved';
        const message = moveSuccessMessage
            .replace('{0}', moved)
            .replace('{1}', moved > 1 ? 's' : '');
        
        showNotification(message);
        renderFolderTree();
        renderBookmarks();
    } else {
        showNotification(getMessage('moveFailed') || 'Failed to move bookmarks', true);
    }
}


async function deleteSelectedBookmarks() {
    if (selectedBookmarks.size === 0) return;
    
    const count = selectedBookmarks.size;
    
    let confirmMsg = getMessage('deleteSelectedConfirm') || `Delete ${count} selected bookmark${count > 1 ? 's' : ''}?`;
    
    if (!confirm(confirmMsg)) return;
    
    const bookmarksToDelete = Array.from(selectedBookmarks);
    
    for (const bookmark of bookmarksToDelete) {
        const path = findItemPath(data, bookmark);
        if (path) {
            removeItemByPath(data, path);
        }
    }
    
    await saveChanges();
    clearBookmarksCache();
    clearSelection();
    
    let successMsg = getMessage('bookmarksDeleted') || `${count} bookmark${count > 1 ? 's' : ''} deleted`;
    
    showNotification(successMsg);
    renderFolderTree();
    renderBookmarks();
}


async function copySelectedBookmarks() {
    if (selectedBookmarks.size === 0) return;
    
    const urls = Array.from(selectedBookmarks).map(b => b.url).join('\n');
    
    try {
        await navigator.clipboard.writeText(urls);
        showNotification(getMessage('urlsCopied') || `${selectedBookmarks.size} URLs copied to clipboard`);
    } catch (error) {
        showNotification('Failed to copy URLs', true);
    }
}

//  TOPIC


function updateToggleIcon(theme) {
    const quickToggle = document.getElementById('quick-theme-toggle');
    if (!quickToggle) return;
    
    quickToggle.removeAttribute('data-theme');
    
    if (theme === window.ThemeManager.THEMES.DARK) {
        quickToggle.setAttribute('data-theme', 'dark');
        quickToggle.title = getMessage('themeDark') || 'Dark';
    } else if (theme === window.ThemeManager.THEMES.LIGHT) {
        quickToggle.setAttribute('data-theme', 'light');
        quickToggle.title = getMessage('themeLight') || 'Light';
    } else {
        quickToggle.setAttribute('data-theme', 'system');
        quickToggle.title = getMessage('themeSystem') || 'System';
    }
}

// ADDING STYLES




function addNewBookmarkFromManager() {
    const modal = document.getElementById('edit-bookmark-modal');
    if (!modal) return;
    
    editingBookmark = null;
    editingBookmarkPath = null;
    
    modal.style.display = 'flex';
    
    document.getElementById('modal-title-text').textContent = getMessage('addBookmark') || 'Add Bookmark';
    document.getElementById('modal-page-title').textContent = '';
    
    document.getElementById('modal-bookmark-title').value = '';
    document.getElementById('modal-bookmark-url').value = 'https://';
    
    const select = document.getElementById('folder-select');
    select.innerHTML = '';
    
    const rootOption = document.createElement('option');
    rootOption.value = '';
    rootOption.textContent = getMessage('rootFolder') || 'Root folder';
    select.appendChild(rootOption);
    
    buildFolderOptions(data.folders, select, '', 0);
    
    if (currentFolderId !== 'all') {
        const folderPath = currentFolderId.split(',');
        if (folderPath.length > 0) {
            const pathStr = folderPath.join('/');
            select.value = pathStr;
        }
    }
    
    resetInactivityTimer();
}

//  UNLOCK 


async function unlock() {
    const password = document.getElementById('password-input').value;
    
    if (!password) {
        showNotification(getMessage('wrongPassword') || 'Please enter password', true);
        return;
    }
    
    try {
        
        
        const stored = await chrome.storage.local.get(STORAGE_KEY);
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
            document.getElementById('password-input').value = '';
            return;
        }
        

        const initSuccess = await CryptoManager.initAfterVerification(password, storedData);
        
        if (!initSuccess) {
            throw new Error('Failed to initialize crypto');
        }
        

        const decrypted = await CryptoManager.decrypt(storedData.encrypted);
        data = JSON.parse(decrypted);
        
        isLocked = false;
        

        document.getElementById('password-input').value = '';
        

        document.getElementById('lock-screen').style.display = 'none';
        document.querySelector('.container').style.display = 'flex';
        
        const lockDescription = document.querySelector('.lock-description');
        if (lockDescription) {
            lockDescription.textContent = getMessage('enterMasterPassword') || 'Enter your master password to access bookmarks';
        }
        
        resetInactivityTimer();
        initVirtualScroll();
        renderFolderTree();
        renderBookmarks();
        
    } catch (e) {
        console.error('Unlock error:', e);
        showNotification(getMessage('unlockFailed') || 'Failed to unlock: ' + e.message, true);
        CryptoManager.clear();
    } finally {
        hideLoadingIndicator(document.body);
    }
}

//  INITIALIZATION 


async function init() {
    localizePage();
    
    if (window.ThemeManager) {
        await window.ThemeManager.init();
        hideThemeLoader();
        
        const quickToggle = document.getElementById('quick-theme-toggle');
        if (quickToggle) {
            updateToggleIcon(window.ThemeManager.getCurrentTheme());
            
            quickToggle.addEventListener('click', () => {
                const current = window.ThemeManager.getCurrentTheme();
                
                if (current === window.ThemeManager.THEMES.DARK) {
                    window.ThemeManager.setTheme(window.ThemeManager.THEMES.LIGHT).then(() => {
                        updateToggleIcon(window.ThemeManager.THEMES.LIGHT);
                    });
                } else if (current === window.ThemeManager.THEMES.LIGHT) {
                    window.ThemeManager.setTheme(window.ThemeManager.THEMES.SYSTEM).then(() => {
                        updateToggleIcon(window.ThemeManager.THEMES.SYSTEM);
                    });
                } else {
                    window.ThemeManager.setTheme(window.ThemeManager.THEMES.DARK).then(() => {
                        updateToggleIcon(window.ThemeManager.THEMES.DARK);
                    });
                }
            });
        }
    }
    
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'themeChanged') {
            if (window.ThemeManager) {
                window.ThemeManager.setTheme(message.theme);
                updateToggleIcon(message.theme);
            }
        }
    });
    
    ensureLoadingStyles();
    initActivityTracking();
    initLockButton();
    
    const addBookmarkBtn = document.getElementById('add-bookmark-btn');
    if (addBookmarkBtn) {
        addBookmarkBtn.addEventListener('click', addNewBookmarkFromManager);
    }
    
    const stored = await chrome.storage.local.get(STORAGE_KEY);

if (stored[STORAGE_KEY]) {
 
    const needsMigration = stored[STORAGE_KEY] && 
                          !stored[STORAGE_KEY].version && 
                          stored[STORAGE_KEY].salt && 
                          stored[STORAGE_KEY].encrypted;
    
    if (needsMigration) {
        // Message about the need for migration via popup
        document.querySelector('.login-container').innerHTML = `
            <div class="login-header">
			<div class="login-icon"><img src="icons/icon128.png"></div>
			</div>
            <h1 class="lock-title">Update Required</h1>
			</div>
            <p class="login-subtitle">The extension has been updated with improved security.</p>
            <p class="login-subtitle" style="margin-bottom: 20px;">Please open the extension popup to migrate your data to the new secure format.</p>
			</div>
            <button id="open-popup" class="unlock-button">Open Popup</button>
        `;
        
        document.getElementById('open-popup').addEventListener('click', () => {
            chrome.action.openPopup();
        });
        
        return; 
    }
}
    if (!stored[STORAGE_KEY]) {
        document.querySelector('.login-container').innerHTML = `
            <div class="login-header">
				<div class="login-icon"><img src="icons/icon128.png"></div>
				<h1 class="lock-title">Holy Private Bookmarks</h1>
					<p class="login-subtitle">Extension not set up yet. Please open the extension popup to create a password.</p>
				</div>
			<button id="open-extension" class="unlock-button" style="margin-top: 20px;">Open Extension</button>
			</div>
		`;
        
        document.getElementById('open-extension').addEventListener('click', () => {

    if (chrome.action && chrome.action.openPopup) {
        chrome.action.openPopup();
    } 
});
        
        return;
    }
    
    document.getElementById('unlock-btn').addEventListener('click', unlock);
    
    document.getElementById('password-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            unlock();
        }
    });
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        let searchTimeout;
        
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchQuery = e.target.value.trim();
                currentPage = 0;
                hasMoreBookmarks = true;
                renderBookmarks();
            }, 300);
        });
        
        searchInput.addEventListener('search', (e) => {
            if (e.target.value === '') {
                searchQuery = '';
                currentPage = 0;
                hasMoreBookmarks = true;
                renderBookmarks();
            }
        });
    }
    
    const modalCancel = document.getElementById('modal-cancel');
    const modalSave = document.getElementById('modal-save');
    const newFolderBtn = document.getElementById('new-folder-in-modal');
    
    if (modalCancel) {
        modalCancel.addEventListener('click', () => {
            document.getElementById('edit-bookmark-modal').style.display = 'none';
            editingBookmark = null;
            editingBookmarkPath = null;
        });
    }
    
    if (modalSave) {
        modalSave.addEventListener('click', handleModalSave);
    }
    
    if (newFolderBtn) {
        newFolderBtn.addEventListener('click', handleNewFolderInModal);
    }
    
    document.getElementById('edit-bookmark-modal').addEventListener('click', (e) => {
        if (e.target.id === 'edit-bookmark-modal') {
            e.target.style.display = 'none';
            editingBookmark = null;
            editingBookmarkPath = null;
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Control') {
            isCtrlPressed = true;
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Control') {
            isCtrlPressed = false;
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('edit-bookmark-modal');
            if (modal && modal.style.display === 'flex') {
                modal.style.display = 'none';
                editingBookmark = null;
                editingBookmarkPath = null;
            }
        }
    });
    
    const allBookmarksItem = document.querySelector('.all-bookmarks');
    if (allBookmarksItem) {
        allBookmarksItem.addEventListener('click', () => {
            setActiveFolder('all');
        });
    }
    
    initNewFolderButton();
    
    document.getElementById('password-input').focus();
    
    if (sessionStorage.getItem('managerReloading')) {
        sessionStorage.removeItem('managerReloading');
        showReloadingScreen();
        setTimeout(() => {
            window.location.reload();
        }, 500);
    }
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.tree-item') && !e.target.closest('.selection-toolbar') && !isCtrlPressed) {
            clearSelection();
        }
    });
    

}


function showReloadingScreen() {
    const lockScreen = document.getElementById('lock-screen');
    const mainContainer = document.querySelector('.container');
    
    if (lockScreen) {
        lockScreen.style.display = 'flex';
        lockScreen.innerHTML = `
            <div class="login-container">
               <div class="login-header">
				<div class="login-icon"><img src="icons/icon128.png"></div>
                <h1 class="lock-title">Holy Private Bookmarks</h1>
				
                <p class="login-subtitle">manager is reloading...</p>
                <div style="margin-top: 20px; color: var(--text-secondary); font-size: 14px;">
                    Please wait while the manager updates
                </div>
            </div>
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    if (mainContainer) {
        mainContainer.style.display = 'none';
    }
}

// GARBAGE COLLECTOR 

window.addEventListener('beforeunload', performFullCleanup);
window.addEventListener('pagehide', performFullCleanup);

window.addEventListener('focus', () => {
    if (CryptoManager.isReady() && data) {
        setTimeout(() => {
            renderFolderTree();
            renderBookmarks();
        }, 100);
    }
    resetInactivityTimer();
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && CryptoManager.isReady() && data) {
        setTimeout(() => {
            renderFolderTree();
            renderBookmarks();
        }, 100);
    }
    resetInactivityTimer();
});

//  MESSAGE HANDLERS 

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'reloadmanager') {
        performFullCleanup();
        setTimeout(() => {
            window.location.reload();
        }, 1000);
        return true;
    }
    
    if (message.action === 'closeForPopup') {
        window.close();
        chrome.runtime.sendMessage({ action: 'managerClosed' });
        return true;
    }
});

//  START 

document.addEventListener('DOMContentLoaded', init);
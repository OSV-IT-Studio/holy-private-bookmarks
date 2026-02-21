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

const Shared = window.HolyShared || {};
const CryptoManager = window.SecureCrypto || window.CryptoManager;

if (!window.HolyShared) {
    console.error('CRITICAL: HolyShared not loaded! Check script order in manager.html');
}

if (!CryptoManager) {
    console.error('CRITICAL: CryptoManager not loaded! Check script order in manager.html');
}

if (typeof window.ThemeManager === 'undefined') {
    console.error('ThemeManager not loaded');
}

const STORAGE_KEY = Shared.STORAGE_KEY || 'holyPrivateData';
const INACTIVITY_TIMEOUT = Shared.INACTIVITY_TIMEOUT || 10 * 60 * 1000;
const BOOKMARKS_PER_PAGE = Shared.BOOKMARKS_PER_PAGE || 50;

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

let bookmarksCache = new Map();
let folderCountsCache = new Map();
let lastDataVersion = 0;

let renderedBookmarks = [];
let currentPage = 0;
let isLoadingMore = false;
let hasMoreBookmarks = true;
let bookmarksContainer = null;
let bookmarksGrid = null;
let intersectionObserver = null;

let isRendering = false;
let renderQueue = [];

function getMessage(key, substitutions = []) {
    return Shared.getMessage ? Shared.getMessage(key, substitutions) : (key || '');
}

function getCachedElement(selector) {
    return Shared.getCachedElement ? Shared.getCachedElement(selector) : document.querySelector(selector);
}

function normalizePath(path) {
    return Shared.normalizePath ? Shared.normalizePath(path) : (Array.isArray(path) ? path.filter(i => Number.isInteger(i) && i >= 0) : []);
}

function getItemByPath(path) {
    return Shared.getItemByPath ? Shared.getItemByPath(data, path) : null;
}

function getParentByPath(path) {
    return Shared.getParentByPath ? Shared.getParentByPath(data, path) : (path && path.length > 0 ? data.folders : data.folders);
}

function removeItemByPath(path) {
    return Shared.removeItemByPath ? Shared.removeItemByPath(data, path) : false;
}

function findItemPath(item, items = data.folders, currentPath = []) {
    return Shared.findItemPath ? Shared.findItemPath(data, item, items, currentPath) : null;
}

function findFolderById(folderId) {
    return Shared.findFolderById ? Shared.findFolderById(data.folders, folderId) : null;
}

function getFolderPathById(folderId) {
    return Shared.getFolderPathById ? Shared.getFolderPathById(folderId) : folderId.split(',').map(Number);
}

function isAncestor(ancestor, descendant) {
    return Shared.isAncestor ? Shared.isAncestor(ancestor, descendant) : false;
}

function arraysEqual(a, b) {
    return Shared.arraysEqual ? Shared.arraysEqual(a, b) : false;
}

function countItemsInFolder(folder) {
    return Shared.countItemsInFolder ? Shared.countItemsInFolder(folder) : 0;
}

function countFoldersInFolder(folder) {
    return Shared.countFoldersInFolder ? Shared.countFoldersInFolder(folder) : 0;
}

function countAllBookmarks() {
    return Shared.countAllBookmarks ? Shared.countAllBookmarks(data) : 0;
}

function getDomainFromUrl(url) {
    return Shared.getDomainFromUrl ? Shared.getDomainFromUrl(url) : '';
}

async function getFaviconWithCache(url) {
    return Shared.getFaviconWithCache ? await Shared.getFaviconWithCache(url) : null;
}

async function getFaviconUrl(url) {
    return Shared.getFaviconUrl ? await Shared.getFaviconUrl(url) : null;
}

function buildFolderOptions(items, select, prefix = '', depth = 0) {
    if (Shared.buildFolderOptions) {
        Shared.buildFolderOptions(items, select, prefix, depth);
    }
}

async function saveEncrypted(salt) {
    return Shared.saveEncrypted ? await Shared.saveEncrypted(data, salt, CryptoManager) : false;
}

function showNotification(message, isError = false) {
    if (Shared.showNotification) {
        Shared.showNotification(message, isError);
    } else {
        alert(message);
    }
}

function escapeHtml(text) {
    return Shared.escapeHtml ? Shared.escapeHtml(text) : (text || '');
}

function openInPrivateTab(url) {
    if (Shared.openInPrivateTab) {
        Shared.openInPrivateTab(url, showNotification, getMessage);
    } else {
        window.open(url, '_blank');
    }
}

function debounce(func, wait) {
    return Shared.debounce ? Shared.debounce(func, wait) : func;
}

function throttle(func, limit) {
    return Shared.throttle ? Shared.throttle(func, limit) : func;
}

function showLoadingIndicator(container, text = 'Loading...') {
    if (Shared.showLoadingIndicator) {
        Shared.showLoadingIndicator(container, text);
    }
}

function hideLoadingIndicator(container) {
    if (Shared.hideLoadingIndicator) {
        Shared.hideLoadingIndicator(container);
    }
}

function ensureLoadingStyles() {
    if (Shared.ensureLoadingStyles) {
        Shared.ensureLoadingStyles();
    }
}

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
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    
    if (!isLocked && CryptoManager.isReady()) {
        inactivityTimer = setTimeout(lockManager, INACTIVITY_TIMEOUT);
    }
}

async function lockManager() {
    if (isLocked || !CryptoManager.isReady()) return;
    
    isLocked = true;
    
    CryptoManager.clear();
    data = { folders: [] };
    clearBookmarksCache();
    
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

function initActivityTracking() {
    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('mousedown', resetInactivityTimer);
    document.addEventListener('click', resetInactivityTimer);
    document.addEventListener('scroll', resetInactivityTimer);
    document.addEventListener('keydown', resetInactivityTimer);
    document.addEventListener('keypress', resetInactivityTimer);
    document.addEventListener('keyup', resetInactivityTimer);
    document.addEventListener('input', resetInactivityTimer);
    document.addEventListener('change', resetInactivityTimer);
    window.addEventListener('focus', resetInactivityTimer);
    document.addEventListener('focusin', resetInactivityTimer);
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            resetInactivityTimer();
        }
    });
}

function initLockButton() {
    const lockBtn = document.getElementById('manual-lock-btn');
    if (lockBtn) {
        lockBtn.addEventListener('click', manualLock);
    }
}

function clearSelection() {
    selectedBookmarks.clear();
    document.querySelectorAll('.bookmark-item.selected').forEach(item => {
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
            <button class="selection-btn move" id="selection-move" title="${moveTitle}">
                <span class="btn-icon">📦</span>
                <span>${moveText}</span>
            </button>
            
            <button class="selection-btn delete" id="selection-delete" title="${deleteTitle}">
                <span class="btn-icon">🗑️</span>
                <span>${deleteText}</span>
            </button>
            <button class="selection-btn cancel" id="selection-cancel" title="${cancelTitle}">
                <span class="btn-icon">✖</span>
            </button>
        </div>
    `;
    
    document.querySelector('.main-content').insertBefore(toolbar, document.querySelector('.bookmarks-container'));
    
    document.getElementById('selection-move').addEventListener('click', () => showMoveSelectedDialog());
    document.getElementById('selection-delete').addEventListener('click', () => deleteSelectedBookmarks());
    document.getElementById('selection-cancel').addEventListener('click', clearSelection);
}

function getDataVersion() {
    return data._version || (data._version = Date.now());
}

function getFolderId(folder) {
    if (folder._id) return folder._id;
    folder._id = `folder_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
    return folder._id;
}

function countBookmarksInFolder(folderId) {
    const version = getDataVersion();
    
    if (folderCountsCache.has(folderId) && folderCountsCache.get(folderId).version === version) {
        return folderCountsCache.get(folderId).count;
    }
    
    if (folderId === 'all') {
        const count = countAllBookmarks();
        folderCountsCache.set(folderId, { count, version });
        return count;
    }
    
    const folder = findFolderById(folderId);
    if (!folder) return 0;
    
    let count = 0;
    
    function countRecursive(items) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type === 'bookmark') {
                count++;
            } else if (item.type === 'folder' && item.children) {
                countRecursive(item.children);
            }
        }
    }
    
    countRecursive(folder.children || []);
    
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
        const folder = findFolderById(folderId);
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
        allCount.textContent = countAllBookmarks();
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
            
            li.innerHTML = `
                <div class="folder-content">
                    <span class="folder-toggle">${hasSubfolders ? '▶' : ''}</span>
                    <div class="folder-icon">${hasSubfolders ? '📁' : '📂'}</div>
                    <div class="folder-name">${escapeHtml(item.name)}</div>
                    <div class="folder-actions">
                        <button class="folder-action-btn edit" title="${getMessage('rename') || 'Rename'}">✏️</button>
                        <button class="folder-action-btn delete" title="${getMessage('delete') || 'Delete'}">🗑️</button>
                    </div>
                </div>
                <div class="folder-count">${itemCount}</div>
            `;
            
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
            if (e.target.closest('.folder-toggle')) {
                return;
            }
            
            if (e.target.closest('.folder-actions')) {
                return;
            }
            
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
    if (activeItem) {
        activeItem.classList.add('active');
    }
    
    const folderNameElement = document.getElementById('current-folder-name');
    const bookmarksCountElement = document.getElementById('bookmarks-count');
    
    if (folderId === 'all') {
        folderNameElement.textContent = getMessage('allBookmarks') || 'All Bookmarks';
    } else {
        const folder = findFolderById(folderId);
        folderNameElement.textContent = folder ? folder.name : getMessage('allBookmarks');
    }
    
    const count = getBookmarksForFolder(folderId).length;
    bookmarksCountElement.textContent = `${count} ${getMessage('bookmarks') || 'bookmarks'}`;
    
    renderBookmarks();
    
    resetInactivityTimer();
}

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
    intersectionObserver.observe(trigger);
}

async function renderBookmarks() {
    if (!bookmarksGrid) return;
    
    const bookmarks = getBookmarksForFolder(currentFolderId);
    const emptyState = document.getElementById('empty-state');
    
    if (bookmarks.length === 0) {
        bookmarksGrid.style.display = 'none';
        
        if (emptyState) {
            emptyState.style.display = 'block';
            
            const emptyStateIcon = emptyState.querySelector('.empty-state-icon');
            const emptyStateTitle = emptyState.querySelector('h3');
            const emptyStateDesc = emptyState.querySelector('p');
            
            if (searchQuery && searchQuery.trim() !== '') {
                emptyStateIcon.textContent = '🔍';
                emptyStateTitle.textContent = getMessage('noSearchResults') || 'No bookmarks found';
                emptyStateDesc.textContent = getMessage('noSearchResultsDesc') || 'Try a different search term';
            } else {
                emptyStateIcon.textContent = '📚';
                emptyStateTitle.textContent = getMessage('noBookmarksInFolder') || 'No bookmarks in this folder';
                emptyStateDesc.textContent = getMessage('addBookmarksToGetStarted') || 'Add bookmarks to get started';
            }
        }
        return;
    }
    
    bookmarksGrid.style.display = 'flex';
    bookmarksGrid.className = 'bookmarks-grid';
    if (emptyState) emptyState.style.display = 'none';
    
    currentPage = 0;
    hasMoreBookmarks = true;
    renderedBookmarks = [];
    
    bookmarksGrid.innerHTML = '';
    
    await loadMoreBookmarks();
    
    addLoadMoreTrigger();
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
            const element = await createBookmarkItem(bookmark, startIndex + index);
            return element;
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

async function createBookmarkItem(bookmark, index) {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.dataset.index = index;
    
    if (selectedBookmarks.has(bookmark)) {
        item.classList.add('selected');
    }
    
    const domain = getDomainFromUrl(bookmark.url);
    const faviconUrl = await getFaviconWithCache(bookmark.url);
    
    item.innerHTML = `
        ${faviconUrl ? 
            `<img src="${faviconUrl}" class="bookmark-item-favicon" alt="${escapeHtml(domain)}" loading="lazy">` :
            `<div class="bookmark-item-favicon-placeholder">🔗</div>`
        }
        <div class="bookmark-item-content">
            <div class="bookmark-item-title">${escapeHtml(bookmark.title)}</div>
        </div>
        <div class="bookmark-item-domain">${escapeHtml(domain)}</div>
        <div class="bookmark-item-actions">
            <button class="action-btn edit" title="${getMessage('edit') || 'Edit'}">✏️</button>
            <button class="action-btn copy" title="${getMessage('copyUrl') || 'Copy URL'}">📋</button>
            <button class="action-btn private" title="${getMessage('openPrivate') || 'Open in private tab'}">👁️</button>
            <button class="action-btn delete" title="${getMessage('delete') || 'Delete'}">🗑</button>
        </div>
    `;
    
    const actions = item.querySelector('.bookmark-item-actions');
    const editBtn = actions.querySelector('.edit');
    const copyBtn = actions.querySelector('.copy');
    const privateBtn = actions.querySelector('.private');
    const deleteBtn = actions.querySelector('.delete');
    
    item.addEventListener('click', (e) => {
        if (isCtrlPressed) {
            e.preventDefault();
            e.stopPropagation();
            
            if (selectedBookmarks.has(bookmark)) {
                selectedBookmarks.delete(bookmark);
                item.classList.remove('selected');
            } else {
                selectedBookmarks.add(bookmark);
                item.classList.add('selected');
            }
            
            updateSelectionToolbar();
        } else if (!e.target.closest('.bookmark-item-actions')) {
            if (selectedBookmarks.size > 0) {
                clearSelection();
            } else {
                window.open(bookmark.url, '_blank');
            }
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
            
            document.querySelectorAll('.bookmark-item').forEach((el, i) => {
                if (i >= start && i <= end) {
                    el.classList.add('selected');
                }
            });
            
            updateSelectionToolbar();
        }
        
        lastSelectedIndex = index;
    });
    
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editBookmark(bookmark);
    });
    
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(bookmark.url).then(() => {
            showNotification(getMessage('urlCopied') || 'URL copied to clipboard');
        });
    });
    
    privateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openInPrivateTab(bookmark.url);
    });
    
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(getMessage('deleteConfirm') || 'Delete this bookmark?')) {
            deleteBookmark(bookmark);
        }
    });
    
    return item;
}

function editBookmark(bookmark) {
    const modal = document.getElementById('edit-bookmark-modal');
    if (!modal) return;
    
    editingBookmark = bookmark;
    editingBookmarkPath = findItemPath(bookmark);
    
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
        showNotification('Title and URL are required', true);
        return;
    }
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showNotification('Please enter a valid URL starting with http:// or https://', true);
        return;
    }
    
    const pathStr = document.getElementById('folder-select').value;
    
    let targetPath = [];
    if (pathStr !== '') {
        targetPath = pathStr
            .split('/')
            .map(Number)
            .filter(Number.isInteger);
    }
    
    if (targetPath.length > 0) {
        const target = getItemByPath(targetPath);
        if (!target || target.type !== 'folder') {
            showNotification('Selected path is not a folder', true);
            return;
        }
    }
    
    const isEditing = editingBookmark && editingBookmarkPath;
    
    if (isEditing) {
        updateBookmark(editingBookmarkPath, title, url, targetPath);
    } else {
        addNewBookmarkToPath(title, url, targetPath);
    }
    
    saveChanges().then(() => {
        modal.style.display = 'none';
        editingBookmark = null;
        editingBookmarkPath = null;
        
        clearBookmarksCache();
        
        const message = isEditing 
            ? (getMessage('bookmarkUpdated') || 'Bookmark updated')
            : (getMessage('bookmarkAdded') || 'Bookmark added');
        
        showNotification(message);
        
        renderFolderTree();
        renderBookmarks();
    });
}

function addNewBookmarkToPath(title, url, targetPath) {
    let targetArray;
    
    if (targetPath.length === 0) {
        targetArray = data.folders;
    } else {
        const folder = getItemByPath(targetPath);
        if (!folder || folder.type !== 'folder' || !Array.isArray(folder.children)) {
            console.error('Target path is not a folder:', targetPath);
            return;
        }
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
    
    const sourceParent = getParentByPath(oldFolderPath);
    const sourceIndex = oldPath[oldPath.length - 1];
    const bookmark = sourceParent[sourceIndex];
    
    if (!bookmark) {
        console.error('Bookmark not found at path:', oldPath);
        return;
    }
    
    bookmark.title = title;
    bookmark.url = url;
    
    if (oldFolderPath.join('/') !== newPath.join('/')) {
        let targetArray;
        
        if (newPath.length === 0) {
            targetArray = data.folders;
        } else {
            const folder = getItemByPath(newPath);
            if (!folder || folder.type !== 'folder' || !Array.isArray(folder.children)) {
                console.error('Target path is not a folder:', newPath);
                return;
            }
            targetArray = folder.children;
        }
        
        sourceParent.splice(sourceIndex, 1);
        targetArray.push(bookmark);
    }
}

async function deleteBookmark(bookmark) {
    const path = findItemPath(bookmark);
    if (path) {
        removeItemByPath(path);
        
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        await saveEncrypted(new Uint8Array(stored[STORAGE_KEY].salt));
        
        clearBookmarksCache();
        
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

let isReloading = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'reloadmanager') {
        isReloading = true;
        
        showReloadingScreen();
        
        setTimeout(() => {
            window.location.reload();
        }, 1000);
        
        return true;
    }
});

function showReloadingScreen() {
    const lockScreen = document.getElementById('lock-screen');
    const mainContainer = document.querySelector('.container');
    
    if (lockScreen) {
        lockScreen.style.display = 'flex';
        lockScreen.innerHTML = `
            <div class="lock-container">
                <div class="lock-icon" style="animation: spin 1.5s linear infinite;">↻</div>
                <h1 class="lock-title">Holy Private Bookmarks</h1>
                <p class="lock-description">manager is reloading...</p>
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

window.addEventListener('beforeunload', () => {
    if (isReloading) {
        showReloadingScreen();
    }
    
    clearTimeout(inactivityTimer);
    
    if (intersectionObserver) {
        intersectionObserver.disconnect();
    }
});

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'closeForPopup') {
        window.close();
        chrome.runtime.sendMessage({ action: 'managerClosed' });
        return true;
    }
});

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
        const parentFolder = findFolderById(parentFolderId);
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

async function saveChanges() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    if (stored[STORAGE_KEY]) {
        await saveEncrypted(new Uint8Array(stored[STORAGE_KEY].salt));
    }
    
    clearBookmarksCache();
}

function initNewFolderButton() {
    const newFolderBtn = document.getElementById('new-folder-btn');
    if (newFolderBtn) {
        newFolderBtn.addEventListener('click', () => {
            createNewFolder();
        });
    }
}

async function init() {
    localizePage();
    
    if (window.ThemeManager) {
        await window.ThemeManager.init();
        
 requestAnimationFrame(() => {
            setTimeout(() => {
                const loader = document.getElementById('theme-loader-block');
                if (loader) {
                    loader.style.opacity = '0';
                    setTimeout(() => {
                        loader.style.display = 'none';
                        
                        loader.remove();
                    }, 200);
                }
            }, 50); 
        });
		
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
    
    if (!stored[STORAGE_KEY]) {
        document.querySelector('.lock-container').innerHTML = `
            <div class="lock-icon"><img src="icons/icon128.png"></div>
            <h1 class="lock-title">Holy Private Bookmarks</h1>
            <p class="lock-description">Extension not set up yet. Please open the extension popup to create a password.</p>
            <button id="open-extension" class="unlock-btn" style="margin-top: 20px;">Open Extension</button>
        `;
        
        document.getElementById('open-extension').addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
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
        if (!e.target.closest('.bookmark-item') && !e.target.closest('.selection-toolbar') && !isCtrlPressed) {
            clearSelection();
        }
    });
    
    addLoadingStyles();
}

function addLoadingStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .loading-indicator {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            width: 100%;
            color: var(--text-secondary);
        }
        
        .spinner {
            width: 20px;
            height: 20px;
            border: 2px solid var(--border-color);
            border-top-color: var(--accent-color);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 10px;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .bookmarks-grid {
            display: flex;
            flex-direction: column;
            gap: 8px;
            min-height: 200px;
        }
        
        .bookmark-item {
            opacity: 1;
            transition: opacity 0.2s ease;
        }
        
        .bookmark-item.loading {
            opacity: 0.5;
        }
    `;
    document.head.appendChild(style);
}

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

async function renameFolder(folderId) {
    if (folderId === 'all') {
        showNotification(getMessage('cannotRenameAll') || 'Cannot rename "All Bookmarks" folder', true);
        return;
    }
    
    const folder = findFolderById(folderId);
    if (!folder) {
        console.error('Folder not found:', folderId);
        return;
    }
    
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
    
    const folder = findFolderById(folderId);
    if (!folder) {
        console.error('Folder not found:', folderId);
        return;
    }
    
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
    
    if (!confirm(message)) {
        return;
    }
    
    const path = getFolderPathById(folderId);
    if (path) {
        removeItemByPath(path);
        
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

function openInPrivateTab(url) {
    try {
        if (chrome.windows && chrome.windows.create) {
            chrome.windows.create({
                url: url,
                incognito: true,
                focused: true
            });
        } else {
            window.open(url, '_blank');
        }
    } catch (error) {
        console.error('Error opening private tab:', error);
        showNotification(getMessage('privateTabError') || 'Cannot open private tab', true);
    }
}

async function deleteSelectedBookmarks() {
    if (selectedBookmarks.size === 0) return;
    
    const count = selectedBookmarks.size;
    
    let confirmMsg = getMessage('deleteSelectedConfirm');
    if (confirmMsg) {
        confirmMsg = confirmMsg
            .replace('$count$', count)
            .replace('{0}', count)
            .replace('{count}', count);
    } else {
        confirmMsg = `Delete ${count} selected bookmark${count > 1 ? 's' : ''}?`;
    }
    
    if (!confirm(confirmMsg)) return;
    
    const bookmarksToDelete = Array.from(selectedBookmarks);
    
    for (const bookmark of bookmarksToDelete) {
        const path = findItemPath(bookmark);
        if (path) {
            removeItemByPath(path);
        }
    }
    
    await saveChanges();
    clearBookmarksCache();
    clearSelection();
    
    let successMsg = getMessage('bookmarksDeleted');
    if (successMsg) {
        successMsg = successMsg
            .replace('$count$', count)
            .replace('{0}', count)
            .replace('{count}', count);
    } else {
        successMsg = `${count} bookmark${count > 1 ? 's' : ''} deleted`;
    }
    
    showNotification(successMsg);
    
    renderFolderTree();
    renderBookmarks();
}

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
        
        await moveSelectedBookmarksWithList(targetPath, bookmarksToMove);
        folderSelect.remove();
    });
}

async function moveSelectedBookmarksWithList(targetPath, bookmarksList) {
    if (bookmarksList.length === 0) return;
    
    let targetArray;
    if (targetPath.length === 0) {
        targetArray = data.folders;
    } else {
        const folder = getItemByPath(targetPath);
        if (!folder || folder.type !== 'folder' || !Array.isArray(folder.children)) {
            showNotification(getMessage('invalidDestinationFolder') || 'Invalid destination folder', true);
            return;
        }
        targetArray = folder.children;
    }
    
    const groups = new Map();
    
    for (const bookmark of bookmarksList) {
        const path = findItemPath(bookmark);
        if (!path || path.length === 0) continue;
        
        const parent = getParentByPath(path.slice(0, -1));
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

function updateToggleIcon(theme) {
    const quickToggle = document.getElementById('quick-theme-toggle');
    if (!quickToggle) return;
    
    if (theme === window.ThemeManager.THEMES.DARK) {
        quickToggle.textContent = '🌙';
        quickToggle.title = chrome.i18n.getMessage('themeDark') || 'Dark';
    } else if (theme === window.ThemeManager.THEMES.LIGHT) {
        quickToggle.textContent = '☀️';
        quickToggle.title = chrome.i18n.getMessage('themeLight') || 'Light';
    } else {
        quickToggle.textContent = '💻';
        quickToggle.title = chrome.i18n.getMessage('themeSystem') || 'System';
    }
}

function clearAllCaches() {
    if (bookmarksCache) {
        bookmarksCache.clear();
    }
    
    if (folderCountsCache) {
        folderCountsCache.clear();
    }
    
    if (Shared.faviconCache) {
        Shared.faviconCache.clear();
    }
    
    if (Shared.faviconPromises) {
        Shared.faviconPromises.clear();
    }
    
    if (Shared.messageCache) {
        Shared.messageCache.clear();
    }
    
    bookmarksContainer = null;
    bookmarksGrid = null;
    
    if (intersectionObserver) {
        intersectionObserver.disconnect();
        intersectionObserver = null;
    }
}

window.addEventListener('beforeunload', function() {
    clearAllCaches();
    
    if (CryptoManager && typeof CryptoManager.clear === 'function') {
        CryptoManager.clear();
    }
    
    data = { folders: [] };
    selectedBookmarks.clear();
    editingBookmark = null;
    editingBookmarkPath = null;
});

async function unlock() {
    const password = document.getElementById('password-input').value;
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    
    if (!stored[STORAGE_KEY]) {
        showNotification('No data found. Please set up the extension first.', true);
        return;
    }
    
    const salt = new Uint8Array(stored[STORAGE_KEY].salt);
    const encrypted = stored[STORAGE_KEY].encrypted;
    
    try {
        const isValid = await CryptoManager.verifyPassword(password, salt, encrypted);
        
        if (!isValid) {
            showNotification(getMessage('wrongPassword') || 'Wrong password', true);
            return;
        }
        
        const success = await CryptoManager.init(password, salt);
        if (!success) throw new Error('Init failed');
        
        const decrypted = await CryptoManager.decrypt(encrypted);
        data = JSON.parse(decrypted);
        
        isLocked = false;
        
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
        showNotification(getMessage('wrongPassword') || 'Wrong password', true);
        CryptoManager.clear();
    }
}

init();
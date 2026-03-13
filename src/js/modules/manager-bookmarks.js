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

// MODULE: manager-bookmarks.js
// Handles: bookmark grid rendering, virtual scroll (IntersectionObserver),
//          bookmark data cache, bookmark CRUD, multi-selection, move dialog

const ManagerBookmarks = (function () {

    let _deps = {};

    // State

    let _bookmarksCache     = new Map();
    let _folderCountsCache  = new Map();
    let _bookmarksContainer = null;
    let _bookmarksGrid      = null;
    let _intersectionObserver = null;

    let _renderedBookmarks  = [];
    let _currentPage        = 0;
    let _isLoadingMore      = false;
    let _hasMoreBookmarks   = true;

    let _selectedBookmarks  = new Set();
    let _isCtrlPressed      = false;
    let _lastSelectedIndex  = -1;

    let _editingBookmark     = null;
    let _editingBookmarkPath = null;

    // Cache helpers

    function _getDataVersion() {
        const data = _deps.getData();
        return data._version || (data._version = Date.now());
    }

    function clearBookmarksCache() {
        _bookmarksCache.clear();
        _folderCountsCache.clear();
        _deps.faviconCache?.clear?.();
        _deps.faviconPromises?.clear?.();
        _deps.getData()._version = Date.now();
        _bookmarksCache    = new Map();
        _folderCountsCache = new Map();
    }

    function clearManagerCaches() {
        clearBookmarksCache();
        _bookmarksContainer = null;
        _bookmarksGrid      = null;
        _intersectionObserver?.disconnect?.();
        _intersectionObserver = null;
        resetPagination();
    }

    function resetPagination() {
        _renderedBookmarks = [];
        _currentPage       = 0;
        _hasMoreBookmarks  = true;
        _isLoadingMore     = false;
    }

    // Data queries

    function countBookmarksInFolder(folderId) {
        const version = _getDataVersion();
        const cached  = _folderCountsCache.get(folderId);
        if (cached?.version === version) return cached.count;

        const count = folderId === 'all'
            ? _deps.countAllBookmarks(_deps.getData())
            : _deps.countItemsInFolder(_deps.findFolderById(_deps.getData().folders, folderId) || {});

        _folderCountsCache.set(folderId, { count, version });
        return count;
    }

    function getBookmarksForFolder(folderId) {
        const searchQuery = _deps.getSearchQuery();
        const cacheKey    = `${folderId}_${searchQuery}`;
        const version     = _getDataVersion();
        const cached      = _bookmarksCache.get(cacheKey);
        if (cached?.version === version) return cached.bookmarks;

        const data      = _deps.getData();
        const bookmarks = [];

        function collect(items) {
            for (const item of items) {
                if (item.type === 'bookmark') bookmarks.push(item);
                else if (item.type === 'folder' && item.children) collect(item.children);
            }
        }

        if (folderId === 'all') {
            collect(data.folders);
        } else {
            const folder = _deps.findFolderById(data.folders, folderId);
            if (folder?.children) collect(folder.children);
        }

        const result = searchQuery
            ? bookmarks.filter(b => {
                const q = searchQuery.toLowerCase();
                return b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q);
              })
            : bookmarks;

        _bookmarksCache.set(cacheKey, { bookmarks: result, version });
        return result;
    }

    // Virtual scroll

    function initVirtualScroll() {
        _bookmarksContainer = document.querySelector('.bookmarks-container');
        _bookmarksGrid      = document.getElementById('bookmarks-grid');
        if (!_bookmarksContainer || !_bookmarksGrid) return;

        _intersectionObserver?.disconnect?.();
        _intersectionObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !_isLoadingMore && _hasMoreBookmarks) {
                    loadMoreBookmarks();
                }
            });
        }, { root: _bookmarksContainer, rootMargin: '200px', threshold: 0.1 });

        _addLoadMoreTrigger();
    }

    function _addLoadMoreTrigger() {
        if (!_bookmarksGrid) return;
        document.getElementById('load-more-trigger')?.remove();
        const trigger = document.createElement('div');
        trigger.id           = 'load-more-trigger';
        trigger.style.height = '1px';
        trigger.style.width  = '100%';
        _bookmarksGrid.appendChild(trigger);
        _intersectionObserver?.observe(trigger);
    }

    async function loadMoreBookmarks() {
        const { BOOKMARKS_PER_PAGE, showLoadingIndicator, hideLoadingIndicator,
                getCurrentFolderId, resetInactivityTimer } = _deps;

        if (_isLoadingMore || !_hasMoreBookmarks) return;
        _isLoadingMore = true;

        const bookmarks  = getBookmarksForFolder(getCurrentFolderId());
        const startIndex = _currentPage * BOOKMARKS_PER_PAGE;
        const endIndex   = Math.min(startIndex + BOOKMARKS_PER_PAGE, bookmarks.length);

        if (startIndex >= bookmarks.length) {
            _hasMoreBookmarks = false;
            _isLoadingMore    = false;
            return;
        }

        showLoadingIndicator(_bookmarksGrid);

        const slice    = bookmarks.slice(startIndex, endIndex);
        const fragment = document.createDocumentFragment();
        const elements = await Promise.all(slice.map((bm, i) => _createBookmarkItem(bm, startIndex + i)));
        elements.forEach(el => { if (el) fragment.appendChild(el); });

        document.getElementById('load-more-trigger')?.remove();
        _bookmarksGrid.appendChild(fragment);
        _addLoadMoreTrigger();

        _renderedBookmarks = [..._renderedBookmarks, ...slice];
        _currentPage++;

        if (endIndex >= bookmarks.length) _hasMoreBookmarks = false;

        hideLoadingIndicator(_bookmarksGrid);
        _isLoadingMore = false;
        resetInactivityTimer();
    }

    // Bookmark element

    async function _createBookmarkItem(bookmark, index) {
        const { getDomainFromUrl, getFaviconWithCache, escapeHtml,
                getMessage, openInPrivateTab, showNotification,
                getCurrentFolderId } = _deps;

        const item     = document.createElement('div');
        item.className = 'tree-item';
        item.dataset.index = index;
        if (_selectedBookmarks.has(bookmark)) item.classList.add('selected');

        const domain     = getDomainFromUrl(bookmark.url);
        const faviconUrl = await getFaviconWithCache(bookmark.url);

        item.innerHTML = `
            ${faviconUrl
                ? `<img src="${faviconUrl}" class="tree-item__favicon" alt="${escapeHtml(domain)}" loading="lazy">`
                : `<div class="tree-item__favicon-placeholder">
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
                <button class="quick-action-btn-small edit"    data-action="edit"    title="${getMessage('edit')    || 'Edit'}">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11.5 2.5a2 2 0 0 1 3 3L6 14l-4 1 1-4 8.5-8.5z"></path></svg>
                </button>
                <button class="quick-action-btn-small copy"    data-action="copy"    title="${getMessage('copyUrl') || 'Copy URL'}">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="10" height="10" rx="1" ry="1"></rect><path d="M4 2h8a2 2 0 0 1 2 2v8"></path></svg>
                </button>
                <button class="quick-action-btn-small private" data-action="private" title="${getMessage('openPrivate') || 'Open in private tab'}">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="10" height="8" rx="1" ry="1"></rect><path d="M5 6V4a3 3 0 0 1 6 0v2"></path><circle cx="8" cy="10" r="1"></circle></svg>
                </button>
                <button class="quick-action-btn-small delete"  data-action="delete"  title="${getMessage('delete')  || 'Delete'}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `;

        // Quick-action delegation
        item.querySelector('.quick-actions-hover').addEventListener('click', e => {
            const btn = e.target.closest('.quick-action-btn-small');
            if (!btn) return;
            e.stopPropagation();
            switch (btn.dataset.action) {
                case 'edit':    editBookmark(bookmark); break;
                case 'copy':
                    navigator.clipboard.writeText(bookmark.url)
                        .then(() => showNotification(getMessage('urlCopied') || 'URL copied to clipboard'));
                    break;
                case 'private': openInPrivateTab(bookmark.url); break;
                case 'delete':
                    if (confirm(getMessage('deleteConfirm') || 'Delete this bookmark?')) deleteBookmark(bookmark);
                    break;
            }
        });

        // Item click — open / ctrl-select / shift-select
        item.addEventListener('click', e => {
            if (e.target.closest('.quick-actions-hover')) return;

            if (_isCtrlPressed) {
                e.preventDefault();
                if (_selectedBookmarks.has(bookmark)) {
                    _selectedBookmarks.delete(bookmark);
                    item.classList.remove('selected');
                } else {
                    _selectedBookmarks.add(bookmark);
                    item.classList.add('selected');
                }
                _updateSelectionToolbar();
                return;
            }

            if (e.shiftKey && _lastSelectedIndex !== -1 && _lastSelectedIndex !== index) {
                e.preventDefault();
                e.stopPropagation();
                const all   = getBookmarksForFolder(getCurrentFolderId());
                const start = Math.min(_lastSelectedIndex, index);
                const end   = Math.max(_lastSelectedIndex, index);
                for (let i = start; i <= end; i++) _selectedBookmarks.add(all[i]);
                document.querySelectorAll('.tree-item').forEach((el, i) => {
                    if (i >= start && i <= end) el.classList.add('selected');
                });
                _updateSelectionToolbar();
                _lastSelectedIndex = index;
                return;
            }

            if (_selectedBookmarks.size > 0) {
                clearSelection();
            } else {
                window.open(bookmark.url, '_blank');
            }

            _lastSelectedIndex = index;
        });

        return item;
    }

    // Render bookmarks grid

    async function renderBookmarks() {
        const { showLoadingIndicator, getCurrentFolderId, getMessage } = _deps;

        if (!_bookmarksGrid) {
            _bookmarksGrid = document.getElementById('bookmarks-grid');
            if (!_bookmarksGrid) return;
        }

        const bookmarks  = getBookmarksForFolder(getCurrentFolderId());
        const emptyState = document.getElementById('empty-state');
        const sq         = _deps.getSearchQuery();

        if (bookmarks.length === 0) {
            _bookmarksGrid.style.display = 'none';
            if (emptyState) {
                emptyState.style.display = 'flex';
                const icon  = emptyState.querySelector('.empty-state__icon');
                const title = emptyState.querySelector('h3');
                const desc  = emptyState.querySelector('p');

                if (sq?.trim()) {
                    icon.innerHTML     = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
                    title.textContent  = getMessage('noSearchResults')     || 'No bookmarks found';
                    desc.textContent   = getMessage('noSearchResultsDesc') || 'Try a different search term';
                } else {
                    icon.innerHTML     = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
                    title.textContent  = getMessage('noBookmarksInFolder')     || 'No bookmarks in this folder';
                    desc.textContent   = getMessage('addBookmarksToGetStarted') || 'Add bookmarks to get started';
                }
            }
            return;
        }

        _bookmarksGrid.style.display = 'flex';
        if (emptyState) emptyState.style.display = 'none';

        resetPagination();
        _bookmarksGrid.innerHTML = '';
        await loadMoreBookmarks();
        _addLoadMoreTrigger();
    }

    // Bookmark CRUD

    function editBookmark(bookmark) {
        const { getMessage, buildFolderOptions, getData, findItemPath, resetInactivityTimer } = _deps;
        const modal = document.getElementById('edit-bookmark-modal');
        if (!modal) return;

        _editingBookmark     = bookmark;
        _editingBookmarkPath = findItemPath(getData(), bookmark);

        modal.style.display = 'flex';

        document.getElementById('modal-title-text').textContent =
            getMessage('editBookmark') || 'Edit Bookmark';
        document.getElementById('modal-page-title').textContent =
            bookmark.title.length > 60 ? bookmark.title.slice(0, 60) + '...' : bookmark.title;
        document.getElementById('modal-bookmark-title').value = bookmark.title;
        document.getElementById('modal-bookmark-url').value   = bookmark.url;

        const select = document.getElementById('folder-select');
        select.innerHTML = '';
        const rootOpt = document.createElement('option');
        rootOpt.value       = '';
        rootOpt.textContent = getMessage('rootFolder') || 'Root folder';
        select.appendChild(rootOpt);
        buildFolderOptions(getData().folders, select, '', 0);

        if (_editingBookmarkPath?.length > 1) {
            const parentPath = _editingBookmarkPath.slice(0, -1);
            if (parentPath.length > 0) select.value = parentPath.join('/');
        }

        resetInactivityTimer();
    }

    function addNewBookmarkFromManager() {
        const { getMessage, buildFolderOptions, getData,
                getCurrentFolderId, resetInactivityTimer } = _deps;
        const modal = document.getElementById('edit-bookmark-modal');
        if (!modal) return;

        _editingBookmark     = null;
        _editingBookmarkPath = null;

        modal.style.display = 'flex';

        document.getElementById('modal-title-text').textContent = getMessage('addBookmark') || 'Add Bookmark';
        document.getElementById('modal-page-title').textContent = '';
        document.getElementById('modal-bookmark-title').value   = '';
        document.getElementById('modal-bookmark-url').value     = 'https://';

        const select = document.getElementById('folder-select');
        select.innerHTML = '';
        const rootOpt = document.createElement('option');
        rootOpt.value       = '';
        rootOpt.textContent = getMessage('rootFolder') || 'Root folder';
        select.appendChild(rootOpt);
        buildFolderOptions(getData().folders, select, '', 0);

        const fid = getCurrentFolderId();
        if (fid !== 'all') {
            const pathStr = fid.split(',').join('/');
            select.value  = pathStr;
        }

        resetInactivityTimer();
    }

    function handleModalSave() {
        const { getMessage, showNotification, getItemByPath, getData,
                normalizePath, getParentByPath, saveAndRefresh } = _deps;

        const modal = document.getElementById('edit-bookmark-modal');
        if (!modal) return;

        const title = document.getElementById('modal-bookmark-title').value.trim();
        const url   = document.getElementById('modal-bookmark-url').value.trim();

        if (!title || !url) {
            showNotification(getMessage('titleRequired') || 'Title and URL are required', true);
            return;
        }
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            showNotification('Please enter a valid URL starting with http:// or https://', true);
            return;
        }

        const pathStr    = document.getElementById('folder-select').value;
        let   targetPath = [];
        if (pathStr !== '') targetPath = pathStr.split('/').map(Number).filter(Number.isInteger);

        if (targetPath.length > 0) {
            const target = getItemByPath(getData(), targetPath);
            if (!target || target.type !== 'folder') {
                showNotification('Selected path is not a folder', true);
                return;
            }
        }

        if (_editingBookmarkPath) {
            _updateBookmark(_editingBookmarkPath, title, url, targetPath);
        } else {
            _addNewBookmarkToPath(title, url, targetPath);
        }

        saveAndRefresh().then(() => {
            modal.style.display  = 'none';
            _editingBookmark     = null;
            _editingBookmarkPath = null;
        });
    }

    function _addNewBookmarkToPath(title, url, targetPath) {
        const { getItemByPath, getData } = _deps;
        let targetArray;
        if (targetPath.length === 0) {
            targetArray = getData().folders;
        } else {
            const folder = getItemByPath(getData(), targetPath);
            if (!folder || folder.type !== 'folder' || !Array.isArray(folder.children)) return;
            targetArray = folder.children;
        }
        targetArray.push({ type: 'bookmark', title, url, dateAdded: Date.now() });
    }

    function _updateBookmark(oldPath, title, url, newPathRaw) {
        const { normalizePath, getParentByPath, getItemByPath, getData } = _deps;
        const data          = getData();
        const newPath       = normalizePath(newPathRaw || []);
        const oldFolderPath = oldPath.slice(0, -1);
        const sourceParent  = getParentByPath(data, oldFolderPath);
        const sourceIndex   = oldPath[oldPath.length - 1];
        const bookmark      = sourceParent[sourceIndex];
        if (!bookmark) return;

        bookmark.title = title;
        bookmark.url   = url;

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
        const { findItemPath, removeItemByPath, getData, saveChanges,
                getMessage, showNotification,
                renderFolderTree } = _deps;

        const path = findItemPath(getData(), bookmark);
        if (!path) return;

        removeItemByPath(getData(), path);
        await saveChanges();
        showNotification(getMessage('bookmarkDeleted') || 'Bookmark deleted');
        renderFolderTree();
        renderBookmarks();
    }

    function handleNewFolderInModal() {
        const { getMessage, getData, buildFolderOptions } = _deps;
        const name = prompt(getMessage('folderName') || 'Folder name:');
        if (!name?.trim()) return;

        getData().folders.push({ type: 'folder', name: name.trim(), children: [], dateAdded: Date.now() });

        const select  = document.getElementById('folder-select');
        select.innerHTML = '';
        const rootOpt = document.createElement('option');
        rootOpt.value       = '';
        rootOpt.textContent = getMessage('rootFolder') || 'Root folder';
        select.appendChild(rootOpt);
        buildFolderOptions(getData().folders, select, '', 0);
        select.value = (getData().folders.length - 1).toString();

        clearBookmarksCache();
    }

    // Selection

    function clearSelection() {
        _selectedBookmarks.clear();
        document.querySelectorAll('.tree-item.selected').forEach(i => i.classList.remove('selected'));
        _updateSelectionToolbar();
    }

    function _updateSelectionToolbar() {
        const bar   = document.getElementById('selection-toolbar');
        const count = document.getElementById('selection-count');
        if (_selectedBookmarks.size > 0) {
            if (!bar) _createSelectionToolbar();
            else { count.textContent = _selectedBookmarks.size; bar.style.display = 'flex'; }
        } else {
            if (bar) bar.style.display = 'none';
        }
    }

    function _createSelectionToolbar() {
        const { getMessage } = _deps;
        const toolbar = document.createElement('div');
        toolbar.id        = 'selection-toolbar';
        toolbar.className = 'selection-toolbar';
        toolbar.innerHTML = `
            <div class="selection-info">
                <span class="selection-count" id="selection-count">${_selectedBookmarks.size}</span>
                <span>${getMessage('selected') || 'selected'}</span>
            </div>
            <div class="selection-actions">
                <button class="selection-btn selection-btn--move"   id="selection-move"   title="${getMessage('moveSelectedTitle')   || 'Move selected'}">
                    <span class="selection-btn__icon"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 5L2 14C2 15.1 2.9 16 4 16L14 16C15.1 16 16 15.1 16 14L16 7C16 5.9 15.1 5 14 5L9 5L7 3L4 3C2.9 3 2 3.9 2 5Z"/><path d="M6 10.5L12 10.5M9 7.5L9 13.5"/><path d="M10 9L12 10.5L10 12"/></svg></span>
                    <span class="selection-btn__text">${getMessage('move') || 'Move'}</span>
                </button>
                <button class="selection-btn selection-btn--delete" id="selection-delete" title="${getMessage('deleteSelectedTitle') || 'Delete selected'}">
                    <span class="selection-btn__icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></span>
                    <span class="selection-btn__text">${getMessage('delete') || 'Delete'}</span>
                </button>
                <button class="selection-btn selection-btn--cancel" id="selection-cancel" title="${getMessage('cancelSelectionTitle') || 'Cancel selection'}">
                    <span class="selection-btn__icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="4" x2="4" y2="12"/><line x1="4" y1="4" x2="12" y2="12"/></svg></span>
                </button>
            </div>
        `;
        document.querySelector('.main-content').insertBefore(toolbar, document.querySelector('.bookmarks-container'));
        document.getElementById('selection-move'  ).addEventListener('click', showMoveSelectedDialog);
        document.getElementById('selection-delete').addEventListener('click', deleteSelectedBookmarks);
        document.getElementById('selection-cancel').addEventListener('click', clearSelection);
    }

    // Move selected dialog

    function showMoveSelectedDialog() {
        const { getMessage, buildFolderOptions, getData, showNotification } = _deps;
        const bookmarksToMove = Array.from(_selectedBookmarks);
        if (bookmarksToMove.length === 0) {
            showNotification(getMessage('noBookmarksSelected') || 'No bookmarks selected', true);
            return;
        }

        const title = (getMessage('moveBookmarksTitle') || 'Move {0} bookmark{1}')
            .replace('{count}', bookmarksToMove.length)
            .replace('{0}', bookmarksToMove.length)
            .replace('{1}', bookmarksToMove.length > 1 ? 's' : '');

        const overlay = document.createElement('div');
        overlay.className = 'folder-select-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);display:flex;justify-content:center;align-items:center;z-index:3000;';
        overlay.innerHTML = `
            <div class="modal-content" style="max-width:400px;">
                <h3>${title}</h3>
                <label>${getMessage('selectDestinationFolder') || 'Select destination folder:'}</label>
                <select id="move-folder-select" class="folder-select">
                    <option value="">${getMessage('rootFolder') || 'Root folder'}</option>
                </select>
                <div class="modal-buttons">
                    <button class="modal-cancel" id="move-cancel">${getMessage('cancel') || 'Cancel'}</button>
                    <button class="modal-save"   id="move-confirm">${getMessage('move') || 'Move'}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        buildFolderOptions(getData().folders, overlay.querySelector('#move-folder-select'), '', 0);

        overlay.querySelector('#move-cancel').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#move-confirm').addEventListener('click', async () => {
            const pathStr    = overlay.querySelector('#move-folder-select').value;
            const targetPath = pathStr !== ''
                ? pathStr.split('/').map(Number).filter(n => !isNaN(n))
                : [];
            await _moveSelectedBookmarks(targetPath, bookmarksToMove);
            overlay.remove();
        });
    }

    async function _moveSelectedBookmarks(targetPath, bookmarksList) {
        const { getItemByPath, getData, getParentByPath, findItemPath,
                getMessage, showNotification, saveChanges,
                renderFolderTree } = _deps;

        if (bookmarksList.length === 0) return;

        let targetArray;
        if (targetPath.length === 0) {
            targetArray = getData().folders;
        } else {
            const folder = getItemByPath(getData(), targetPath);
            if (!folder || folder.type !== 'folder' || !Array.isArray(folder.children)) {
                showNotification(getMessage('invalidDestinationFolder') || 'Invalid destination folder', true);
                return;
            }
            targetArray = folder.children;
        }

        const groups = new Map();
        for (const bookmark of bookmarksList) {
            const path   = findItemPath(getData(), bookmark);
            if (!path?.length) continue;
            const parent = getParentByPath(getData(), path.slice(0, -1));
            const idx    = path[path.length - 1];
            if (!groups.has(parent)) groups.set(parent, []);
            groups.get(parent).push({ idx, bookmark });
        }

        let moved = 0;
        for (const [parent, items] of groups) {
            items.sort((a, b) => b.idx - a.idx);
            for (const { idx, bookmark } of items) {
                if (parent?.[idx] === bookmark) {
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
            const msg = (getMessage('bookmarksMoved') || '{0} bookmark{1} moved')
                .replace('{count}', moved)
                .replace('{0}', moved)
                .replace('{1}', moved > 1 ? 's' : '');
            showNotification(msg);
            renderFolderTree();
            renderBookmarks();
        } else {
            showNotification(getMessage('moveFailed') || 'Failed to move bookmarks', true);
        }
    }

    async function deleteSelectedBookmarks() {
        const { getMessage, showNotification, getData, saveChanges,
                findItemPath, removeItemByPath, renderFolderTree } = _deps;

        if (_selectedBookmarks.size === 0) return;
        const count = _selectedBookmarks.size;

        const confirmMsg = (getMessage('deleteSelectedConfirm') || `Delete ${count} selected bookmark${count > 1 ? 's' : ''}?`)
            .replace('{count}', count)
            .replace('{0}', count);
        if (!confirm(confirmMsg)) return;

        for (const bookmark of Array.from(_selectedBookmarks)) {
            const path = findItemPath(getData(), bookmark);
            if (path) removeItemByPath(getData(), path);
        }

        await saveChanges();
        clearBookmarksCache();
        clearSelection();

        const successMsg = (getMessage('bookmarksDeleted') || `${count} bookmark${count > 1 ? 's' : ''} deleted`)
            .replace('{count}', count)
            .replace('{0}', count);
        showNotification(successMsg);
        renderFolderTree();
        renderBookmarks();
    }

    // Ctrl key tracking

    function initKeyboardHandlers() {
        document.addEventListener('keydown', e => { if (e.key === 'Control') _isCtrlPressed = true; });
        document.addEventListener('keyup',   e => { if (e.key === 'Control') _isCtrlPressed = false; });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('edit-bookmark-modal');
                if (modal?.style.display === 'flex') {
                    modal.style.display  = 'none';
                    _editingBookmark     = null;
                    _editingBookmarkPath = null;
                }
            }
        });

        // Deselect on click outside
        document.addEventListener('click', e => {
            if (!e.target.closest('.tree-item') && !e.target.closest('.selection-toolbar') && !_isCtrlPressed) {
                clearSelection();
            }
        });
    }

    // Public API

    return {
        init(deps) { Object.assign(_deps, deps); },

        // Data
        clearBookmarksCache,
        clearManagerCaches,
        resetPagination,
        countBookmarksInFolder,
        getBookmarksForFolder,

        // Render
        initVirtualScroll,
        renderBookmarks,
        loadMoreBookmarks,

        // CRUD
        editBookmark,
        deleteBookmark,
        addNewBookmarkFromManager,
        handleModalSave,
        handleNewFolderInModal,

        // Selection
        clearSelection,
        deleteSelectedBookmarks,
        showMoveSelectedDialog,

        // Keyboard
        initKeyboardHandlers
    };

})();

if (typeof window !== 'undefined') window.ManagerBookmarks = ManagerBookmarks;
if (typeof module !== 'undefined') module.exports = ManagerBookmarks;

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
    
    let _dataVersion = Date.now();

    function _getDataVersion() {
        return _dataVersion;
    }

    function _bumpDataVersion() {
        _dataVersion = Date.now();
    }

    function clearBookmarksCache() {
        _bookmarksCache.clear();
        _folderCountsCache.clear();
        

        _bumpDataVersion();
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

        const data  = _deps.getData();
        let   result = [];

        if (folderId === 'all') {
            if (searchQuery) {
                
                const allBm = [];
                function collectAll(items) {
                    for (const item of items) {
                        if (item.type === 'bookmark') allBm.push(item);
                        else if (item.type === 'folder' && item.children) collectAll(item.children);
                    }
                }
                collectAll(data.folders);
                const q = searchQuery.toLowerCase();
                result = allBm.filter(b =>
                    b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
                );
            } else {
                
                result = [...data.folders];
            }
        } else {
           
            const folder = _deps.findFolderById(data.folders, folderId);
            const children = folder?.children || [];

            if (searchQuery) {
                
                const bookmarks = [];
                function collectSearch(items) {
                    for (const item of items) {
                        if (item.type === 'bookmark') bookmarks.push(item);
                        else if (item.type === 'folder' && item.children) collectSearch(item.children);
                    }
                }
                collectSearch(children);
                const q = searchQuery.toLowerCase();
                result = bookmarks.filter(b =>
                    b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
                );
            } else {
                
                result = [...children];
            }
        }

        _bookmarksCache.set(cacheKey, { bookmarks: result, version });
        return result;
    }

    // Virtual scroll

    let _quickActionsListenerAttached = false;

    function _setupQuickActionsListener() {
        if (_quickActionsListenerAttached) return;
        const container = document.querySelector('.bookmarks-container') || document.getElementById('bookmarks-grid');
        if (!container) return;

        container.addEventListener('click', e => {
            const trigger = e.target.closest('.quick-actions-trigger');
            if (!trigger) return;
            e.stopPropagation();
            const item  = trigger.closest('.tree-item');
            if (!item) return;
            const panel = item.querySelector('.quick-actions-hover');
            if (!panel) return;

            const isOpen = panel.classList.contains('active');
            document.querySelectorAll('.quick-actions-hover.active').forEach(p => p.classList.remove('active'));
            if (!isOpen) panel.classList.add('active');
        }, true);

        document.addEventListener('click', e => {
            if (e.target.closest('.quick-actions-trigger') || e.target.closest('.quick-actions-hover')) return;
            document.querySelectorAll('.quick-actions-hover.active').forEach(p => p.classList.remove('active'));
        }, { passive: true });

        _quickActionsListenerAttached = true;
    }

    function initVirtualScroll() {
        _bookmarksContainer = document.querySelector('.bookmarks-container');
        _bookmarksGrid      = document.getElementById('bookmarks-grid');
        if (!_bookmarksContainer || !_bookmarksGrid) return;
        _setupQuickActionsListener();

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
        slice.forEach((bm, i) => {
            const el = _createGridItem(bm, startIndex + i);
            if (el) fragment.appendChild(el);
        });

        document.getElementById('load-more-trigger')?.remove();
        _bookmarksGrid.appendChild(fragment);
		
		if (window.ManagerDragDrop) {
            window.ManagerDragDrop.refreshDraggable();
        }
		
        _addLoadMoreTrigger();

        _renderedBookmarks = [..._renderedBookmarks, ...slice];
        _currentPage++;

        if (endIndex >= bookmarks.length) _hasMoreBookmarks = false;

        hideLoadingIndicator(_bookmarksGrid);
        _isLoadingMore = false;
        resetInactivityTimer();
    }

    // Folder item

    function _createFolderGridItem(folder, index) {
    const { escapeHtml, countItemsInFolder, getMessage } = _deps;

    const item = document.createElement('div');
    item.className = 'tree-item tree-item--folder';
    item.dataset.index = index;
    if (_selectedBookmarks.has(folder)) item.classList.add('selected');

    const childCount = countItemsInFolder(folder);

    item.innerHTML = `
        <div class="folder-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="currentColor" fill-opacity="0.12"/>
            </svg>
        </div>
        <div class="tree-item__content">
            <div class="bookmark-title">${escapeHtml(folder.name)}</div>
        </div>
        <div class="folder-badge">${childCount}</div>
        <button class="quick-actions-trigger" title="${getMessage('actions')}"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg></button>
        <div class="quick-actions-hover">
            <button class="quick-action-btn-small edit" data-action="rename" title="${getMessage('rename')}">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11.5 2.5a2 2 0 0 1 3 3L6 14l-4 1 1-4 8.5-8.5z"></path></svg>
            </button>
            <button class="quick-action-btn-small delete" data-action="delete-folder" title="${getMessage('delete')}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        </div>
    `;


    function expandFolderInSidebar(folderId) {
        if (!folderId || folderId === 'all') return;
        
      
        const sidebarFolder = document.querySelector(`.folder-item[data-folder-id="${folderId}"]`);
        if (!sidebarFolder) return;
        
        
        const parentsToExpand = [];
        let current = sidebarFolder;
        
        
        while (current) {
          
           
            const parentLi = current.closest('ul')?.previousElementSibling?.closest('.folder-item');
            if (parentLi) {
                parentsToExpand.unshift(parentLi); 
                current = parentLi;
            } else {
                current = null;
            }
        }
        
       
        parentsToExpand.forEach(parent => {
            if (!parent.classList.contains('expanded')) {
                const toggle = parent.querySelector('.folder-toggle');
                if (toggle) {
                    toggle.click();
                }
            }
        });
        
       
        if (!sidebarFolder.classList.contains('expanded')) {
            const toggle = sidebarFolder.querySelector('.folder-toggle');
            if (toggle) {
                toggle.click();
            }
        }
        
        
        sidebarFolder.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    item.addEventListener('click', e => {
        if (e.target.closest('.quick-actions-hover')) return;
        if (e.target.closest('.quick-actions-trigger')) return;
        
        if (_isCtrlPressed) {
            e.preventDefault();
            e.stopPropagation();
            
            if (_selectedBookmarks.has(folder)) {
                _selectedBookmarks.delete(folder);
                item.classList.remove('selected');
            } else {
                _selectedBookmarks.add(folder);
                item.classList.add('selected');
            }
            _updateSelectionToolbar();
            return;
        }
        
        if (e.shiftKey && _lastSelectedIndex !== -1 && _lastSelectedIndex !== index) {
            e.preventDefault();
            e.stopPropagation();
            const all = getBookmarksForFolder(getCurrentFolderId());
            const start = Math.min(_lastSelectedIndex, index);
            const end = Math.max(_lastSelectedIndex, index);
            for (let i = start; i <= end; i++) {
                const item = all[i];
                _selectedBookmarks.add(item);
                document.querySelectorAll('.tree-item')[i]?.classList.add('selected');
            }
            _updateSelectionToolbar();
            _lastSelectedIndex = index;
            return;
        }
        
        if (_selectedBookmarks.size > 0) {
            clearSelection();
        } else {
            const pathArr = _deps.findItemPath(_deps.getData(), folder);
            if (pathArr) {
                const idStr = pathArr.join(',');
                
                
                if (window.ManagerFolders) {
                    ManagerFolders.setActiveFolder(idStr);
                }
                
               
                expandFolderInSidebar(idStr);
            }
        }
        
        _lastSelectedIndex = index;
    });

    
    item.querySelector('.quick-actions-hover').addEventListener('click', e => {
        const btn = e.target.closest('.quick-action-btn-small');
        if (!btn) return;
        e.stopPropagation();
        const pathArr = _deps.findItemPath(_deps.getData(), folder);
        if (!pathArr) return;
        const folderId = pathArr.join(',');
        if (btn.dataset.action === 'rename' && window.ManagerFolders) {
            ManagerFolders.renameFolder(folderId);
        } else if (btn.dataset.action === 'delete-folder' && window.ManagerFolders) {
            ManagerFolders.deleteFolder(folderId);
        }
    });

    return item;
}

    

    function _createGridItem(item, index) {
        if (item.type === 'folder') {
            return _createFolderGridItem(item, index);
        }
        return _createBookmarkItem(item, index);
    }

    // Bookmark element

    function _createBookmarkItem(bookmark, index) {
        const { getDomainFromUrl, escapeHtml,
                getMessage, openInPrivateTab, showNotification,
                getCurrentFolderId } = _deps;

        const item     = document.createElement('div');
        item.className = 'tree-item';
        item.dataset.index = index;
        if (_selectedBookmarks.has(bookmark)) item.classList.add('selected');

        const domain = getDomainFromUrl(bookmark.url);

        
        item.innerHTML = `
            <div class="tree-item__favicon-placeholder icon bookmark">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 4C5 2.89543 5.89543 2 7 2H17C18.1046 2 19 2.89543 19 4V21L12 17L5 21V4Z" fill="currentColor"/>
                </svg>
            </div>
            <div class="tree-item__content">
                <div class="bookmark-title">${escapeHtml(bookmark.title)}</div>
            </div>
            <div class="item-domain">${escapeHtml(domain)}</div>
            <button class="quick-actions-trigger" title="${getMessage('actions')}"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg></button>
        <div class="quick-actions-hover">
                <button class="quick-action-btn-small edit"    data-action="edit"    title="${getMessage('edit')}">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11.5 2.5a2 2 0 0 1 3 3L6 14l-4 1 1-4 8.5-8.5z"></path></svg>
                </button>
                <button class="quick-action-btn-small copy"    data-action="copy"    title="${getMessage('copyUrl')}">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="10" height="10" rx="1" ry="1"></rect><path d="M4 2h8a2 2 0 0 1 2 2v8"></path></svg>
                </button>
                <button class="quick-action-btn-small private" data-action="private" title="${getMessage('openPrivate')}">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.5" fill="none"/>
					<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
					<line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
                </button>
                <button class="quick-action-btn-small delete"  data-action="delete"  title="${getMessage('delete')}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `;

        
        // favicon
        const iconEl = item.querySelector('.tree-item__favicon-placeholder');
        if (iconEl) _deps.loadFaviconAsync?.(bookmark.url, iconEl);

        item.querySelector('.quick-actions-hover').addEventListener('click', async e => {
            const btn = e.target.closest('.quick-action-btn-small');
            if (!btn) return;
            e.stopPropagation();
            switch (btn.dataset.action) {
                case 'edit':    editBookmark(bookmark); break;
                case 'copy':
                    navigator.clipboard.writeText(bookmark.url)
                        .then(() => showNotification(getMessage('urlCopied')));
                    break;
                case 'private': openInPrivateTab(bookmark.url); break;
                case 'delete':
				const _delName = bookmark?.title || bookmark?.name || '';
				if (await _deps.showConfirm({ title: `${getMessage('deleteConfirm')} "${_delName}"?` }))
					deleteBookmark(bookmark);
					break;
            }
        });

        // Item click
        item.addEventListener('click', e => {
            if (e.target.closest('.quick-actions-hover')) return;
            if (e.target.closest('.quick-actions-trigger')) return;

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
                    title.textContent  = getMessage('noSearchResults');
                    desc.textContent   = getMessage('noSearchResultsDesc');
                } else {
                    icon.innerHTML     = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
                    title.textContent  = getMessage('noBookmarksInFolder');
                    desc.textContent   = getMessage('addBookmarksToGetStarted');
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

    function _openBookmarkModal({ titleText, pageTitle, bookmarkTitle, bookmarkUrl, initialPath }) {
        const { getMessage, buildFolderTreePicker, getData, resetInactivityTimer } = _deps;

        
        
		document.getElementById('edit-bookmark-modal')?.remove();

        const modal = document.createElement('div');
        modal.id        = 'edit-bookmark-modal';
        modal.className = 'hpb-modal';
        modal.innerHTML = `
            <div class="hpb-modal__dialog">
                <h2 class="hpb-modal__title" id="modal-title-text"></h2>
                <div class="hpb-modal__body">
                    <p><strong>${getMessage('page')}</strong> <span id="modal-page-title"></span></p>
                    <label>${getMessage('title')}</label>
                    <input type="text" id="modal-bookmark-title" placeholder="Bookmark title">
                    <label>${getMessage('url')}</label>
                    <input type="text" id="modal-bookmark-url" placeholder="https://example.com">
                    <label>${getMessage('folder')}</label>
                    <div class="folder-select-container">
                        <div id="folder-select" class="folder-tree-picker"></div>
                        <button id="new-folder-in-modal" class="btn-secondary">${getMessage('new')}</button>
                    </div>
                </div>
                <div class="hpb-modal__footer">
                    <button class="btn-secondary" id="modal-cancel">${getMessage('cancel')}</button>
                    <button class="btn-primary"   id="modal-save">${getMessage('save')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Populate fields
        modal.querySelector('#modal-title-text').textContent  = titleText;
        modal.querySelector('#modal-page-title').textContent  = pageTitle;
        modal.querySelector('#modal-bookmark-title').value    = bookmarkTitle;
        modal.querySelector('#modal-bookmark-url').value      = bookmarkUrl;

        buildFolderTreePicker(modal.querySelector('#folder-select'), getData().folders, initialPath, null);

        const { _onEsc, _closeAndRemove } = (_deps.createModalEscHandler || window.HolyShared.createModalEscHandler)(modal, () => {
            _editingBookmark     = null;
            _editingBookmarkPath = null;
        });

        modal.querySelector('#modal-cancel').addEventListener('click', _closeAndRemove);
        modal.querySelector('#modal-save').addEventListener('click', () => handleModalSave(_closeAndRemove));
        modal.querySelector('#new-folder-in-modal').addEventListener('click', () => handleNewFolderInModal());

        // Backdrop click
        modal.addEventListener('click', e => {
            if (e.target === modal && (Date.now() - (modal._hpbOpenedAt || 0) > 50)) _closeAndRemove();
        });

        document.addEventListener('keydown', _onEsc);
		
        
        requestAnimationFrame(() => {
            modal.classList.add('hpb-modal--open');
            modal._hpbOpenedAt = Date.now();
        });

        resetInactivityTimer?.();
        return modal;
    }

    function editBookmark(bookmark) {
        const { getMessage, getData, findItemPath } = _deps;

        _editingBookmark     = bookmark;
        _editingBookmarkPath = findItemPath(getData(), bookmark);

        let initialPath = '';
        if (_editingBookmarkPath?.length > 1) {
            const parentPath = _editingBookmarkPath.slice(0, -1);
            if (parentPath.length > 0) initialPath = parentPath.join('/');
        }

        _openBookmarkModal({
            titleText:     getMessage('editBookmark'),
            pageTitle:     bookmark.title.length > 60 ? bookmark.title.slice(0, 60) + '...' : bookmark.title,
            bookmarkTitle: bookmark.title,
            bookmarkUrl:   bookmark.url,
            initialPath,
        });
    }

    function addNewBookmarkFromManager() {
        const { getMessage, getCurrentFolderId } = _deps;

        _editingBookmark     = null;
        _editingBookmarkPath = null;

        let initialPath = '';
        const fid = getCurrentFolderId();
        if (fid !== 'all') initialPath = fid.split(',').join('/');

        _openBookmarkModal({
            titleText:     getMessage('addBookmark'),
            pageTitle:     '',
            bookmarkTitle: '',
            bookmarkUrl:   'https://',
            initialPath,
        });
    }

    function handleModalSave(closeCallback) {
        const { getMessage, showNotification, getItemByPath, getData,
                normalizePath, getParentByPath, saveAndRefresh } = _deps;

        const modal = document.getElementById('edit-bookmark-modal');
        if (!modal) return;

        const title = modal.querySelector('#modal-bookmark-title').value.trim();
        const url   = modal.querySelector('#modal-bookmark-url').value.trim();

        if (!title || !url) {
            showNotification(getMessage('titleRequired'), true);
            return;
        }
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            showNotification('Please enter a valid URL starting with http:// or https://', true);
            return;
        }

        const pickerEl = modal.querySelector('#folder-select');
        const pathStr  = pickerEl._getPickerValue ? pickerEl._getPickerValue() : '';
        let   targetPath = [];
        if (pathStr !== '') targetPath = pathStr.split('/').map(Number).filter(Number.isInteger);

        if (targetPath.length > 0) {
            const target = getItemByPath(getData(), targetPath);
            if (!target || target.type !== 'folder') {
                showNotification('Selected path is not a folder', true);
                return;
            }
        }

        const isEdit = !!_editingBookmarkPath;
        if (isEdit) {
            _updateBookmark(_editingBookmarkPath, title, url, targetPath);
        } else {
            _addNewBookmarkToPath(title, url, targetPath);
        }

        saveAndRefresh().then(() => {
            if (typeof closeCallback === 'function') closeCallback();
            showNotification(getMessage(isEdit ? 'bookmarkUpdated' : 'bookmarkAdded'));
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
        showNotification(getMessage('bookmarkDeleted'));
        renderFolderTree();
        renderBookmarks();
    }

    async function handleNewFolderInModal() {
        const { getMessage, getData, buildFolderTreePicker } = _deps;
        const name = await _deps.showPrompt({
            title:        getMessage('newFolder'),
            placeholder:  getMessage('folderName'),
            confirmLabel: getMessage('save'),
        });
        if (!name?.trim()) return;

        getData().folders.push({ type: 'folder', name: name.trim(), children: [], dateAdded: Date.now() });
		await _deps.saveChanges();
        const modal = document.getElementById('edit-bookmark-modal');
        const pickerContainer = modal ? modal.querySelector('#folder-select') : null;
        if (pickerContainer) {
            const newIdx = (getData().folders.length - 1).toString();
            buildFolderTreePicker(pickerContainer, getData().folders, newIdx, null);
        }

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
                <span>${getMessage('selected')}</span>
            </div>
            <div class="selection-actions">
                <button class="selection-btn selection-btn--move"   id="selection-move"   title="${getMessage('moveSelectedTitle')}">
                    <span class="selection-btn__icon"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 5L2 14C2 15.1 2.9 16 4 16L14 16C15.1 16 16 15.1 16 14L16 7C16 5.9 15.1 5 14 5L9 5L7 3L4 3C2.9 3 2 3.9 2 5Z"/><path d="M6 10.5L12 10.5M9 7.5L9 13.5"/><path d="M10 9L12 10.5L10 12"/></svg></span>
                    <span class="selection-btn__text">${getMessage('move')}</span>
                </button>
                <button class="selection-btn selection-btn--delete" id="selection-delete" title="${getMessage('deleteSelectedTitle')}">
                    <span class="selection-btn__icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></span>
                    <span class="selection-btn__text">${getMessage('delete')}</span>
                </button>
                <button class="selection-btn selection-btn--cancel" id="selection-cancel" title="${getMessage('cancelSelectionTitle')}">
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
        const { getMessage, showNotification, buildFolderOptions, buildFolderTreePicker, getData,
        getCurrentFolderId, resetInactivityTimer, openModal, closeModal, closeModalWithAnimation } = _deps;
        const _closeMoveModal = (el) => (closeModalWithAnimation || closeModal)(el);
        const bookmarksToMove = Array.from(_selectedBookmarks);
        if (bookmarksToMove.length === 0) {
            showNotification(getMessage('noBookmarksSelected'), true);
            return;
        }

        const title = getMessage('moveBookmarksTitle')
			.replace('{count}', bookmarksToMove.length)
			.replace('{0}', bookmarksToMove.length)
			.replace('{1}', bookmarksToMove.length > 1 ? 's' : '');

        const overlay = document.createElement('div');
        overlay.id = 'move-modal';
        overlay.className = 'hpb-modal hpb-modal--open';
        overlay.innerHTML = `
            <div class="hpb-modal__dialog hpb-modal__dialog--sm">
                <h2 class="hpb-modal__title">${title}</h2>
                <div class="hpb-modal__body">
                    <label>${getMessage('selectDestinationFolder')}</label>
                    <div id="move-folder-select" class="folder-tree-picker"></div>
                </div>
                <div class="hpb-modal__footer">
                    <button class="btn-secondary" id="move-cancel">${getMessage('cancel')}</button>
                    <button class="btn-primary"   id="move-confirm">${getMessage('move')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        buildFolderTreePicker(overlay.querySelector('#move-folder-select'), getData().folders, '', null);

        overlay.querySelector('#move-cancel').addEventListener('click', () => {
            _closeMoveModal(overlay);
        });
        overlay.querySelector('#move-confirm').addEventListener('click', async () => {
            const movePickerEl = overlay.querySelector('#move-folder-select');
            const pathStr      = movePickerEl._getPickerValue ? movePickerEl._getPickerValue() : '';
            const targetPath   = pathStr !== ''
                ? pathStr.split('/').map(Number).filter(n => !isNaN(n))
                : [];
            await _moveSelectedBookmarks(targetPath, bookmarksToMove);
            _closeMoveModal(overlay);
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
           showNotification(getMessage('invalidDestinationFolder'), true);
            return;
        }
        targetArray = folder.children;
    }

  
    const targetPathStr = targetPath.join(',');
    const validBookmarks = [];

    for (const bookmark of bookmarksList) {
        let canMove = true;
        
        if (bookmark.type === 'folder') {
            const folderPath = findItemPath(getData(), bookmark);
            if (folderPath) {
                const folderPathStr = folderPath.join(',');
                
                
                if (targetPathStr === folderPathStr || 
                    (targetPathStr.startsWith(folderPathStr + ',') && targetPathStr.length > folderPathStr.length)) {
                    canMove = false;
                }
            }
        }
        
        if (canMove) {
            validBookmarks.push(bookmark);
        }
  
    }

    if (validBookmarks.length === 0) {
        showNotification(
            getMessage('noValidItemsToMove'), 
            true
        );
        return;
    }


    const groups = new Map();
    for (const bookmark of validBookmarks) {
        const path = findItemPath(getData(), bookmark);
        if (!path?.length) continue;
        const parent = getParentByPath(getData(), path.slice(0, -1));
        const idx = path[path.length - 1];
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
  
        if (window.ManagerBookmarks) {
            window.ManagerBookmarks.clearBookmarksCache();
            window.ManagerBookmarks.clearSelection();
        }
        
        const msg = getMessage('bookmarksMoved')
                .replace('{count}', moved)
                .replace('{0}', moved)
                .replace('{1}', moved > 1 ? 's' : '');
        
        showNotification(msg);
        renderFolderTree();
        if (window.ManagerBookmarks) {
            window.ManagerBookmarks.renderBookmarks();
        }
    } else {
        showNotification(getMessage('moveFailed'), true);
    }
}

    async function deleteSelectedBookmarks() {
        const { getMessage, showNotification, getData, saveChanges,
                findItemPath, removeItemByPath, renderFolderTree } = _deps;

        if (_selectedBookmarks.size === 0) return;
        const count = _selectedBookmarks.size;

        const confirmMsg = getMessage('deleteSelectedConfirm')
		.replace('{count}', count)
		.replace('{plural}', count > 1 ? 's' : '');
        if (!await _deps.showConfirm({ title: confirmMsg })) return;

        const paths = [];
		for (const bookmark of Array.from(_selectedBookmarks)) {
		const path = findItemPath(getData(), bookmark);
			if (path) paths.push(path);
		}

		paths.sort((a, b) => {
			for (let i = 0; i < Math.min(a.length, b.length); i++) {
				if (a[i] !== b[i]) return b[i] - a[i];
		}
		return b.length - a.length;
		});
		for (const path of paths) removeItemByPath(getData(), path);

        await saveChanges();
        clearBookmarksCache();
        clearSelection();

        const successMsg = getMessage('bookmarksDeleted')
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


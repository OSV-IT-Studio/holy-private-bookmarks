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
 
 const ManagerBookmarks = (function () {

    let _deps = {};

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

    let _editingBookmark    = null;
    let _editingBookmarkUid = null;

    let _dataVersion = Date.now();

    function _getDataVersion() { return _dataVersion; }
    function _bumpDataVersion() { _dataVersion = Date.now(); }

    function clearBookmarksCache() {
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

    function countBookmarksInFolder(folderUid) {
        const version = _getDataVersion();
        const cached  = _folderCountsCache.get(folderUid);
        if (cached?.version === version) return cached.count;

        const count = folderUid === 'all'
            ? _deps.countAllBookmarks(_deps.getData())
            : _deps.countItemsInFolder(
                folderUid
                    ? (_deps.getItemByUid(_deps.getData(), folderUid) || {})
                    : {}
              );

        _folderCountsCache.set(folderUid, { count, version });
        return count;
    }

    function getBookmarksForFolder(folderUid) {
        const searchQuery = _deps.getSearchQuery();
        const cacheKey    = `${folderUid}_${searchQuery}`;
        const version     = _getDataVersion();
        const cached      = _bookmarksCache.get(cacheKey);
        if (cached?.version === version) return cached.bookmarks;

        const data = _deps.getData();
        let result = [];

        if (folderUid === 'all') {
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
            const folder   = _deps.getItemByUid(data, folderUid);
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

    let _quickActionsListenerAttached = false;

    function _buildFolderQuickActionsPanel(folder, getMessage) {
        return QuickActions.buildPanel([
            { action: 'open-all',           title: getMessage('openAll'),          icon: 'openAll'                         },
            { action: 'open-all-window',    title: getMessage('openAllWindow'),    icon: 'openWindow'                      },
            { action: 'open-all-group',     title: getMessage('openAllGroup'),     icon: 'openGroup'                       },
            { action: 'open-all-incognito', title: getMessage('openAllIncognito'), icon: 'openIncognito', className: 'private' },
            { action: 'rename',             title: getMessage('rename'),           icon: 'rename', className: 'edit'       },
            { action: 'delete-folder',      title: getMessage('delete'),           icon: 'delete', className: 'delete'     },
        ]);
    }

    function _buildBookmarkQuickActionsPanel(bookmark, getMessage) {
        const actions = [
            { action: 'edit',    title: getMessage('edit'),                 icon: 'edit'    },
            { action: 'copy',    title: getMessage('copyUrl'),              icon: 'copy'    },
            { action: 'qr',     title: getMessage('qrCode') || 'QR Code', icon: 'qr'      },
        ];
        if (!_deps.isAlwaysIncognito || !_deps.isAlwaysIncognito()) {
            actions.push({ action: 'private', title: getMessage('openPrivate'), icon: 'private', className: 'private' });
        }
        actions.push({ action: 'delete', title: getMessage('delete'), icon: 'delete', className: 'delete' });
        return QuickActions.buildPanel(actions);
    }

    function _setupQuickActionsListener() {
        if (_quickActionsListenerAttached) return;
        const container = document.querySelector('.bookmarks-container') || document.getElementById('bookmarks-grid');
        if (!container) return;

        container.addEventListener('click', e => {
            const trigger = e.target.closest('.quick-actions-trigger');
            if (trigger) {
                e.stopPropagation();
                const item = trigger.closest('.tree-item');
                if (!item) return;
                const { getMessage } = _deps;
                const boundData = item._boundData;
                const isFolder  = item.classList.contains('tree-item--folder');
                QuickActions.toggle(trigger, () => isFolder
                    ? _buildFolderQuickActionsPanel(boundData, getMessage)
                    : _buildBookmarkQuickActionsPanel(boundData, getMessage)
                );
                return;
            }

            const btn = e.target.closest('.quick-action-btn-small');
            if (!btn) return;
            e.stopPropagation();

            const panel     = btn.closest('.quick-actions-hover') || btn._sourcePanel;
            const item      = panel?._trigger?.closest('.tree-item') ?? panel?.parentElement?.closest('.tree-item');
            const boundData = item?._boundData;
            if (!boundData) return;

            const { editBookmark, deleteBookmark, openInPrivateTab,
                    showNotification, showConfirm, getMessage: gm } = _deps;

            (async () => {
                switch (btn.dataset.action) {
                    case 'open-all':
                    case 'open-all-window':
                    case 'open-all-incognito':
                    case 'open-all-group': {
                        const { collectAllBookmarkUrls } = _deps;
                        const children = boundData?.children;
                        if (!children) break;
                        const urls = collectAllBookmarkUrls(children);
                        if (!urls.length) { showNotification(gm('noBookmarksInFolder') || 'No bookmarks in folder', true); break; }
                        if (btn.dataset.action === 'open-all') {
                            urls.forEach(url => chrome.tabs.create({ url, active: false }));
                        } else if (btn.dataset.action === 'open-all-window') {
                            chrome.windows.create({ url: urls[0], focused: true }, win => {
                                urls.slice(1).forEach(url => chrome.tabs.create({ url, windowId: win.id, active: false }));
                            });
                        } else if (btn.dataset.action === 'open-all-incognito') {
                            chrome.windows.create({ url: urls[0], incognito: true, focused: true }, win => {
                                urls.slice(1).forEach(url => chrome.tabs.create({ url, windowId: win.id, active: false }));
                            });
                        } else if (btn.dataset.action === 'open-all-group') {
                            (async () => {
                                const tabs = await Promise.all(urls.map(url => chrome.tabs.create({ url, active: false })));
                                const tabIds = tabs.map(t => t.id);
                                if (chrome.tabGroups) {
                                    const groupId = await chrome.tabs.group({ tabIds });
                                    if (boundData.name) await chrome.tabGroups.update(groupId, { title: boundData.name });
                                }
                            })();
                        }
                        break;
                    }
                    case 'edit':    editBookmark(boundData); break;
                    case 'copy':
                        navigator.clipboard.writeText(boundData.url)
                            .then(() => showNotification(gm('urlCopied')));
                        break;
                    case 'qr':
                        if (window.QrModal) window.QrModal.showQrModal(boundData.url, boundData.title || '', gm);
                        break;
                    case 'private': openInPrivateTab(boundData.url); break;
                    case 'delete': {
                        const name = boundData?.title || boundData?.name || '';
                        if (await showConfirm({ title: `${gm('deleteConfirm')} "${name}"?` }))
                            deleteBookmark(boundData);
                        break;
                    }
                    case 'rename':
                    case 'delete-folder': {
                        const uid = boundData?.uid;
                        if (!uid) break;
                        if (btn.dataset.action === 'rename' && window.ManagerFolders)
                            ManagerFolders.renameFolder(uid);
                        else if (btn.dataset.action === 'delete-folder' && window.ManagerFolders)
                            ManagerFolders.deleteFolder(uid);
                        break;
                    }
                }
                QuickActions.closeAll();
            })();
        }, true);

        QuickActions.attachGlobalCloseListener();
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

        if (window.ManagerDragDrop) window.ManagerDragDrop.refreshDraggable();

        _addLoadMoreTrigger();

        _renderedBookmarks = [..._renderedBookmarks, ...slice];
        _currentPage++;

        if (endIndex >= bookmarks.length) _hasMoreBookmarks = false;

        hideLoadingIndicator(_bookmarksGrid);
        _isLoadingMore = false;
        resetInactivityTimer();
    }

    function _createFolderGridItem(folder, index) {
        const { escapeHtml, countItemsInFolder, getMessage } = _deps;

        const item = document.createElement('div');
        item.className = 'tree-item tree-item--folder';
        item.dataset.index = index;
        if (folder.uid) item.dataset.folderUid = folder.uid;
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
        `;
        item._boundData = folder;

        item.addEventListener('click', e => {
            if (e.target.closest('.quick-actions-hover')) return;
            if (e.target.closest('.quick-actions-trigger')) return;

            if (_isCtrlPressed) {
                e.preventDefault(); e.stopPropagation();
                if (_selectedBookmarks.has(folder)) {
                    _selectedBookmarks.delete(folder); item.classList.remove('selected');
                } else {
                    _selectedBookmarks.add(folder); item.classList.add('selected');
                }
                _updateSelectionToolbar(); return;
            }

            if (e.shiftKey && _lastSelectedIndex !== -1 && _lastSelectedIndex !== index) {
                e.preventDefault(); e.stopPropagation();
                const all = getBookmarksForFolder(_deps.getCurrentFolderId());
                const start = Math.min(_lastSelectedIndex, index);
                const end   = Math.max(_lastSelectedIndex, index);
                const domItems = _bookmarksGrid?.querySelectorAll('.tree-item') || [];
                for (let i = start; i <= end; i++) {
                    _selectedBookmarks.add(all[i]);
                    domItems[i]?.classList.add('selected');
                }
                _updateSelectionToolbar(); _lastSelectedIndex = index; return;
            }

            if (_selectedBookmarks.size > 0) {
                clearSelection();
            } else if (folder.uid && window.ManagerFolders) {
                ManagerFolders.setActiveFolder(folder.uid);
            }
            _lastSelectedIndex = index;
        });

        return item;
    }

    function _createGridItem(item, index) {
        if (item.type === 'folder') return _createFolderGridItem(item, index);
        return _createBookmarkItem(item, index);
    }

    function _createBookmarkItem(bookmark, index) {
        const { getDomainFromUrl, escapeHtml, getMessage,
                openInPrivateTab, isAlwaysIncognito,
                getCurrentFolderId } = _deps;

        const item = document.createElement('div');
        item.className = 'tree-item';
        item.dataset.index = index;
        if (bookmark.uid) item.dataset.itemUid = bookmark.uid;
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
        `;

        item._boundData = bookmark;

        const iconEl = item.querySelector('.tree-item__favicon-placeholder');
        if (iconEl) _deps.loadFaviconAsync?.(bookmark.url, iconEl);

        item.addEventListener('click', e => {
            if (e.target.closest('.quick-actions-hover')) return;
            if (e.target.closest('.quick-actions-trigger')) return;

            if (_isCtrlPressed) {
                e.preventDefault();
                if (_selectedBookmarks.has(bookmark)) {
                    _selectedBookmarks.delete(bookmark); item.classList.remove('selected');
                } else {
                    _selectedBookmarks.add(bookmark); item.classList.add('selected');
                }
                _updateSelectionToolbar(); return;
            }

            if (e.shiftKey && _lastSelectedIndex !== -1 && _lastSelectedIndex !== index) {
                e.preventDefault(); e.stopPropagation();
                const all   = getBookmarksForFolder(getCurrentFolderId());
                const start = Math.min(_lastSelectedIndex, index);
                const end   = Math.max(_lastSelectedIndex, index);
                const domItems = _bookmarksGrid?.querySelectorAll('.tree-item') || [];
                for (let i = start; i <= end; i++) {
                    _selectedBookmarks.add(all[i]);
                    domItems[i]?.classList.add('selected');
                }
                _updateSelectionToolbar(); _lastSelectedIndex = index; return;
            }

            if (_selectedBookmarks.size > 0) {
                clearSelection();
            } else {
                if (isAlwaysIncognito && isAlwaysIncognito()) openInPrivateTab(bookmark.url);
                else window.open(bookmark.url, '_blank');
            }
            _lastSelectedIndex = index;
        });

        return item;
    }

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
                    icon.innerHTML    = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
                    title.textContent = getMessage('noSearchResults');
                    desc.textContent  = getMessage('noSearchResultsDesc');
                } else {
                    icon.innerHTML    = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
                    title.textContent = getMessage('noBookmarksInFolder');
                    desc.textContent  = getMessage('addBookmarksToGetStarted');
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

    async function renderBookmarksPreservingScroll() {
        const container      = document.querySelector('.bookmarks-container');
        const savedScrollTop = container ? container.scrollTop : 0;
        const pagesToRestore = _currentPage || 1;

        const { getCurrentFolderId } = _deps;
        if (!_bookmarksGrid) {
            _bookmarksGrid = document.getElementById('bookmarks-grid');
            if (!_bookmarksGrid) return;
        }

        const bookmarks = getBookmarksForFolder(getCurrentFolderId());
        if (bookmarks.length === 0) { await renderBookmarks(); return; }

        _bookmarksGrid.style.display = 'flex';
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.style.display = 'none';

        resetPagination();
        _bookmarksGrid.innerHTML = '';

        for (let i = 0; i < pagesToRestore && _hasMoreBookmarks; i++) {
            await loadMoreBookmarks();
        }
        _addLoadMoreTrigger();

        if (container) container.scrollTop = savedScrollTop;
    }

    function _openBookmarkModal({ titleText, pageTitle, bookmarkTitle, bookmarkUrl, initialFolderUid }) {
        const { getMessage, buildFolderTreePicker, getData, resetInactivityTimer } = _deps;

        document.getElementById('edit-bookmark-modal')?.remove();

        const modal = (_deps.createBookmarkModal || window.HolyShared.createBookmarkModal)({ id: 'edit-bookmark-modal', getMessage });
        document.body.appendChild(modal);

        modal.querySelector('#modal-title-text').textContent = titleText;
        modal.querySelector('#modal-bookmark-title').value   = bookmarkTitle;
        modal.querySelector('#modal-bookmark-url').value     = bookmarkUrl;

        buildFolderTreePicker(modal.querySelector('#folder-select'), getData().folders, initialFolderUid || '', null);

        const { _onEsc, _closeAndRemove } = (_deps.createModalEscHandler || window.HolyShared.createModalEscHandler)(modal, () => {
            _editingBookmark    = null;
            _editingBookmarkUid = null;
        });

        modal.querySelector('#modal-cancel').addEventListener('click', _closeAndRemove);
        modal.querySelector('#modal-save').addEventListener('click', () => handleModalSave(_closeAndRemove));
        modal.querySelector('#new-folder-in-modal').addEventListener('click', () => handleNewFolderInModal());

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
        const { getMessage } = _deps;

        _editingBookmark    = bookmark;
        _editingBookmarkUid = bookmark.uid || null;

        const parentArr = _editingBookmarkUid
            ? _deps.getParentArrayForItemUid(_deps.getData(), _editingBookmarkUid)
            : null;
        const parentFolder = parentArr && parentArr !== _deps.getData().folders
            ? _deps.getAnyItemByUid
                ? (() => {
                    function findFolder(data, arr) {
                        function search(items) {
                            for (const item of items) {
                                if (item.type === 'folder') {
                                    if (item.children === arr) return item;
                                    const found = search(item.children || []);
                                    if (found) return found;
                                }
                            }
                            return null;
                        }
                        return search(data.folders);
                    }
                    return findFolder(_deps.getData(), parentArr);
                  })()
                : null
            : null;
        const initialFolderUid = parentFolder?.uid || '';

        _openBookmarkModal({
            titleText:      getMessage('editBookmark'),
            pageTitle:      bookmark.title.length > 60 ? bookmark.title.slice(0, 60) + '...' : bookmark.title,
            bookmarkTitle:  bookmark.title,
            bookmarkUrl:    bookmark.url,
            initialFolderUid,
        });
    }

    function addNewBookmarkFromManager() {
        const { getMessage, getCurrentFolderId, getItemByUid, getData } = _deps;

        _editingBookmark    = null;
        _editingBookmarkUid = null;

        const fid = getCurrentFolderId();
        const initialFolderUid = (fid && fid !== 'all') ? fid : '';

        _openBookmarkModal({
            titleText:      getMessage('addBookmark'),
            pageTitle:      '',
            bookmarkTitle:  '',
            bookmarkUrl:    'https://',
            initialFolderUid,
        });
    }

    function handleModalSave(closeCallback) {
        const { getMessage, showNotification, getItemByUid, getData, saveAndRefresh } = _deps;

        const modal = document.getElementById('edit-bookmark-modal');
        if (!modal) return;

        const title = modal.querySelector('#modal-bookmark-title').value.trim();
        const url   = modal.querySelector('#modal-bookmark-url').value.trim();

        if (!title || !url) { showNotification(getMessage('titleRequired'), true); return; }
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            showNotification(getMessage('invalidUrlProtocol'), true);
            return;
        }

        const pickerEl    = modal.querySelector('#folder-select');
        const folderUid   = pickerEl._getPickerValue ? pickerEl._getPickerValue() : '';

        if (folderUid) {
            const target = getItemByUid(getData(), folderUid);
            if (!target || target.type !== 'folder') {
                showNotification('Selected folder no longer exists', true);
                return;
            }
        }

        const isEdit = !!_editingBookmarkUid;
        if (isEdit) {
            _updateBookmark(_editingBookmarkUid, title, url, folderUid);
        } else {
            _addNewBookmark(title, url, folderUid);
        }

        saveAndRefresh().then(() => {
            if (typeof closeCallback === 'function') closeCallback();
            showNotification(getMessage(isEdit ? 'bookmarkUpdated' : 'bookmarkAdded'));
            _editingBookmark    = null;
            _editingBookmarkUid = null;
        });
    }

    function _addNewBookmark(title, url, folderUid) {
        const { getData, getItemByUid, generateFolderUid } = _deps;
        const uid      = generateFolderUid ? generateFolderUid() : ('b_' + Date.now().toString(36));
        const bookmark = { type: 'bookmark', title, url, dateAdded: Date.now(), uid };

        if (folderUid) {
            const folder = getItemByUid(getData(), folderUid);
            if (folder?.children) { folder.children.push(bookmark); return; }
        }
        getData().folders.push(bookmark);
    }

    function _updateBookmark(editUid, title, url, newFolderUid) {
        _deps.moveBookmark(_deps.getData(), editUid, title, url, newFolderUid);
    }

    async function deleteBookmark(bookmark) {
        const { getData, saveChanges, getMessage, showNotification,
                renderFolderTree, getParentArrayForItemUid } = _deps;

        const data      = getData();
        const parentArr = getParentArrayForItemUid(data, bookmark.uid);
        if (!parentArr) return;

        const idx = parentArr.indexOf(bookmark);
        if (idx === -1) return;
        parentArr.splice(idx, 1);

        await saveChanges();
        showNotification(getMessage('bookmarkDeleted'));
        renderFolderTree();
        await renderBookmarksPreservingScroll();
    }

    async function handleNewFolderInModal() {
        const { getMessage, getData, buildFolderTreePicker, generateFolderUid } = _deps;
        const name = await _deps.showPrompt({
            title:        getMessage('newFolder'),
            placeholder:  getMessage('folderName'),
            confirmLabel: getMessage('save'),
        });
        if (!name?.trim()) return;

        const uid = generateFolderUid ? generateFolderUid() : ('f_' + Date.now().toString(36));
        getData().folders.push({ type: 'folder', name: name.trim(), children: [], dateAdded: Date.now(), uid });
        await _deps.saveChanges();

        const modal = document.getElementById('edit-bookmark-modal');
        const pickerContainer = modal?.querySelector('#folder-select');
        if (pickerContainer) {
            buildFolderTreePicker(pickerContainer, getData().folders, uid, null);
        }

        clearBookmarksCache();
    }

    function showMoveSelectedDialog() {
        const { getMessage, showNotification, buildFolderTreePicker, getData,
                closeModal, closeModalWithAnimation } = _deps;
        const _closeMoveModal = (el) => (closeModalWithAnimation || closeModal)(el);
        const bookmarksToMove = Array.from(_selectedBookmarks);
        if (bookmarksToMove.length === 0) {
            showNotification(getMessage('noBookmarksSelected'), true); return;
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

        const _onEsc = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', _onEsc); _closeMoveModal(overlay); } };
        document.addEventListener('keydown', _onEsc);

        overlay.querySelector('#move-cancel').addEventListener('click', () => {
            document.removeEventListener('keydown', _onEsc);
            _closeMoveModal(overlay);
        });
        overlay.querySelector('#move-confirm').addEventListener('click', async () => {
            const movePickerEl = overlay.querySelector('#move-folder-select');
            const targetUid    = movePickerEl._getPickerValue ? movePickerEl._getPickerValue() : '';
            try {
                await _moveSelectedBookmarks(targetUid, bookmarksToMove);
            } finally {
                document.removeEventListener('keydown', _onEsc);
                _closeMoveModal(overlay);
            }
        });
    }

    async function _moveSelectedBookmarks(targetFolderUid, bookmarksList) {
        const { getData, getItemByUid, getParentArrayForItemUid,
                getMessage, showNotification, saveChanges, renderFolderTree } = _deps;

        if (bookmarksList.length === 0) return;

        const data = getData();
        let targetArray;
        if (!targetFolderUid) {
            targetArray = data.folders;
        } else {
            const folder = getItemByUid(data, targetFolderUid);
            if (!folder || folder.type !== 'folder' || !Array.isArray(folder.children)) {
                showNotification(getMessage('invalidDestinationFolder'), true); return;
            }
            targetArray = folder.children;
        }

        const validBookmarks = bookmarksList.filter(bm => {
            if (bm.type !== 'folder') return true;
            if (bm.uid === targetFolderUid) return false;
            function isDesc(folder) {
                if (!folder.children) return false;
                for (const c of folder.children) {
                    if (c.uid === targetFolderUid) return true;
                    if (c.type === 'folder' && isDesc(c)) return true;
                }
                return false;
            }
            return !isDesc(bm);
        });

        if (validBookmarks.length === 0) {
            showNotification(getMessage('cannotMoveIntoSelf'), true); return;
        }

        let moved = 0;
        for (const bm of validBookmarks) {
            const sourceArr = getParentArrayForItemUid(data, bm.uid);
            if (!sourceArr) continue;
            const idx = sourceArr.indexOf(bm);
            if (idx === -1) continue;
            if (sourceArr === targetArray) continue;
            sourceArr.splice(idx, 1);
            targetArray.push(bm);
            moved++;
        }

        if (moved > 0) {
            await saveChanges();
            clearBookmarksCache();
            clearSelection();
            const msg = getMessage('bookmarksMoved')
                .replace('{count}', moved).replace('{0}', moved).replace('{1}', moved > 1 ? 's' : '');
            showNotification(msg);
            renderFolderTree();
            if (window.ManagerBookmarks) await window.ManagerBookmarks.renderBookmarksPreservingScroll();
        } else {
            showNotification(getMessage('moveFailed'), true);
        }
    }

    async function deleteSelectedBookmarks() {
        const { getMessage, showNotification, getData, saveChanges,
                getParentArrayForItemUid, renderFolderTree } = _deps;

        if (_selectedBookmarks.size === 0) return;

        const snapshot   = Array.from(_selectedBookmarks);
        const count      = snapshot.length;
        const confirmMsg = getMessage('deleteSelectedConfirm')
            .replace('{count}', count).replace('{plural}', count > 1 ? 's' : '');
        if (!await _deps.showConfirm({ title: confirmMsg })) return;

        const data = getData();
        for (const bm of snapshot) {
            if (!bm?.uid) continue;
            const parentArr = getParentArrayForItemUid(data, bm.uid);
            if (!parentArr) continue;
            const idx = parentArr.indexOf(bm);
            if (idx !== -1) parentArr.splice(idx, 1);
        }

        await saveChanges();
        clearBookmarksCache();
        clearSelection();
        renderFolderTree();
        await renderBookmarksPreservingScroll();

        const successMsg = getMessage('bookmarksDeleted')
            .replace('{count}', count).replace('{0}', count);
        showNotification(successMsg);
    }

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

    function initKeyboardHandlers() {
        document.addEventListener('keydown', e => { if (e.key === 'Control') _isCtrlPressed = true; });
        document.addEventListener('keyup',   e => { if (e.key === 'Control') _isCtrlPressed = false; });
        document.addEventListener('click', e => {
            if (!e.target.closest('.tree-item') && !e.target.closest('.selection-toolbar') && !_isCtrlPressed) {
                clearSelection();
            }
        });
    }

    return {
        init(deps) { Object.assign(_deps, deps); },
        clearBookmarksCache,
        clearManagerCaches,
        resetPagination,
        countBookmarksInFolder,
        getBookmarksForFolder,
        initVirtualScroll,
        renderBookmarks,
        editBookmark,
        deleteBookmark,
        addNewBookmarkFromManager,
        renderBookmarksPreservingScroll,
        initKeyboardHandlers
    };

})();

if (typeof window !== 'undefined') window.ManagerBookmarks = ManagerBookmarks;
if (typeof module !== 'undefined') module.exports = ManagerBookmarks;

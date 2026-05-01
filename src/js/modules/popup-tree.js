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

// MODULE: popup-tree.js
// Handles: tree rendering, folder/bookmark element creation,
//          virtual scroll (load-more), click delegation

const PopupTree = (function () {

    let _deps = {};
    let _eventHandlersInitialized = false;

    // Empty state

    function renderEmptyState(container) {
        const { getMessage } = _deps;
        container.innerHTML = `
            <div class="empty-tree-message" style="text-align:center;padding:40px 20px;color:var(--text-secondary);font-size:16px;line-height:1.5;">
                <div class="empty-state__icon" style="width:64px;height:64px;margin-bottom:24px;color:var(--accent);opacity:0.7;margin:auto;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                </div>
                <h3 style="margin:0 0 8px 0;color:var(--text-primary);">${getMessage('emptyTreeTitle')}</h3>
                <p style="margin:0 0 20px 0;">${getMessage('emptyTreeSubtitle')}</p>
            </div>
        `;
    }

    // Folder element

    function createFolderElement(item, path) {
        const { countItemsInFolder, escapeHtml } = _deps;

        const div = document.createElement('div');
        div.className    = 'tree-item';
        div.dataset.path = path.join(',');
        if (item.uid) div.dataset.folderUid = item.uid;
        div.setAttribute('draggable', 'true');
        div.setAttribute('data-drag-ready', '1');

        div.innerHTML = `
            <div class="item-header folder">
                <div class="item-title">
                    <span class="arrow">▶</span>
                    <span class="icon folder-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                    </span>
                    <span class="folder-name">${escapeHtml(item.name)}</span>
                    <span class="folder-badge">${countItemsInFolder(item)}</span>
                </div>
                <button class="quick-actions-trigger" title="${getMessage('actions')}"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg></button>
            </div>
            <div class="subitems collapsed"></div>
        `;

        return div;
    }

    

    function createBookmarkElement(item, path) {
        const { getDomainFromUrl, getMessage, escapeHtml,
                isFaviconEnabled, loadFaviconAsync,
                openInPrivateTab, isAlwaysIncognito, showNotification,
                editBookmark, deleteBookmark, copyBookmarkUrl } = _deps;

        const div = document.createElement('div');
        div.className    = 'tree-item';
        div.dataset.path = path.join(',');
        if (item.uid) div.dataset.itemUid = item.uid;
        div.setAttribute('draggable', 'true');
        div.setAttribute('data-drag-ready', '1');

        const domain = getDomainFromUrl(item.url);

        
        const link = document.createElement('div');
        link.className = 'bookmark-link';
        link.dataset.url = item.url;

        const header = document.createElement('div');
        header.className = 'item-header';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'item-title';

        // Favicon / bookmark icon
        const iconSpan = document.createElement('span');
        iconSpan.className = 'icon bookmark';
        iconSpan.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 4C5 2.89543 5.89543 2 7 2H17C18.1046 2 19 2.89543 19 4V21L12 17L5 21V4Z" fill="currentColor"/>
            </svg>
        `;

        const textSpan = document.createElement('span');
        textSpan.className   = 'bookmark-title';
        textSpan.textContent = item.title;

        const domainSpan = document.createElement('span');
        domainSpan.className   = 'item-domain';
        domainSpan.textContent = domain;

        titleDiv.appendChild(iconSpan);
        titleDiv.appendChild(textSpan);

        
        const quickActionsTrigger = document.createElement('button');
        quickActionsTrigger.className = 'quick-actions-trigger';
        quickActionsTrigger.title = getMessage('actions');
        quickActionsTrigger.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>';

        const pathStr = path.join(',');

        titleDiv.appendChild(quickActionsTrigger);
        header.appendChild(titleDiv);
        header.appendChild(domainSpan);
        link.appendChild(header);
        div.appendChild(link);

        link.addEventListener('click', e => {
            if (e.target.closest('.quick-actions-hover') || e.target.closest('.quick-actions-trigger')) return;
            if (isAlwaysIncognito()) {
                openInPrivateTab(item.url);
            } else {
                chrome.tabs.create({ url: item.url, active: !e.ctrlKey && !e.metaKey });
            }
        });

        
        if (isFaviconEnabled()) {
            loadFaviconAsync(item.url, iconSpan);
        }

        return div;
    }

    // Folder open / close

    function openFolder(folderItem, header, sub) {
        const { getItemByUid, getItemByPath, getData, virtualScrollCache, VIRTUAL_SCROLL_CONFIG, loadMoreFolderItems } = _deps;

        sub.classList.remove('collapsed');
        const arrow = header.querySelector('.arrow');
        if (arrow) arrow.textContent = '▼';
        folderItem.classList.add('open');
        folderItem.classList.add('loading');

        if (!sub.hasChildNodes() || sub.children.length === 0) {
            const uid       = folderItem.dataset.folderUid || null;
            const pathArray = folderItem.dataset.path
                ? folderItem.dataset.path.split(',').map(Number)
                : [];

            if (pathArray.some(n => !Number.isInteger(n) || n < 0)) {
                folderItem.classList.remove('loading');
                return;
            }

            const folder = uid
                ? getItemByUid(getData(), uid)
                : getItemByPath(getData(), pathArray);

            if (folder?.children !== undefined) {
                sub.innerHTML = '';
                const scrollContainer = document.createElement('div');
                scrollContainer.className = 'folder-virtual-scroll';
                if (uid) scrollContainer.dataset.folderUid = uid;
                sub.appendChild(scrollContainer);

                if (virtualScrollCache?.getFolderContainer) {
                    const actualPath = uid
                        ? (folderItem.dataset.path ? folderItem.dataset.path.split(',').map(Number) : pathArray)
                        : pathArray;
                    const folderData = virtualScrollCache.getFolderContainer(actualPath);
                    folderData.totalItems   = folder.children.length;
                    folderData.container    = scrollContainer;
                    folderData.isOpen       = true;
                    folderData.visibleStart = 0;
                    folderData.visibleCount = 0;
                    folderData.hasMore      = true;

                    loadMoreFolderItems(
                        folder, actualPath, scrollContainer,
                        0, VIRTUAL_SCROLL_CONFIG.initialLoadCount,
                        () => folderItem.classList.remove('loading')
                    );
                }
            } else {
                folderItem.classList.remove('loading');
            }
        } else {
            folderItem.classList.remove('loading');
        }
    }

    function closeFolder(folderItem, header, sub) {
        sub.classList.add('collapsed');
        const arrow = header.querySelector('.arrow');
        if (arrow) arrow.textContent = '▶';
        folderItem.classList.remove('open');
        saveFoldersState();

       
        const path = folderItem.dataset.path;
        if (path) {
            if (_sentinels.has(path)) {
                const { observer, sentinel } = _sentinels.get(path);
                observer.disconnect();
                sentinel.remove();
                _sentinels.delete(path);
            }
            _deps.virtualScrollCache?.folders?.delete(path);
        }
        
        sub.innerHTML = '';
    }

    function toggleFolder(header) {
        const folderItem = header.closest('.tree-item');
        if (!folderItem) return;
        const sub = folderItem.querySelector('.subitems');
        if (!sub) return;

        if (sub.classList.contains('collapsed')) {
            openFolder(folderItem, header, sub);
            saveFoldersState();
        } else {
            closeFolder(folderItem, header, sub);
        }
    }

    function saveFoldersState() {
        const openKeys = new Set();
        document.querySelectorAll('#tree .tree-item.open').forEach(el => {
            const key = el.dataset.folderUid || el.dataset.path;
            if (key) openKeys.add(key);
        });
        try {
            sessionStorage.setItem('popupOpenFolders', JSON.stringify(Array.from(openKeys)));
        } catch (e) {}
    }

    
    function restoreFoldersState() {
        let openKeys;
        try {
            const saved = sessionStorage.getItem('popupOpenFolders');
            if (!saved) return;
            openKeys = new Set(JSON.parse(saved));
        } catch (e) { return; }

        const keys = Array.from(openKeys);

        function openNext(index) {
            if (index >= keys.length) return;

            const key = keys[index];
            const el =
                document.querySelector(`#tree .tree-item[data-folder-uid="${key}"]`) ||
                document.querySelector(`#tree .tree-item[data-path="${key}"]`);

            if (el) {
                const header = el.querySelector('.item-header.folder');
                const sub    = el.querySelector('.subitems');
                if (header && sub && sub.classList.contains('collapsed')) {
                    openFolder(el, header, sub);
                }
            }

            requestAnimationFrame(() => openNext(index + 1));
        }

        requestAnimationFrame(() => openNext(0));
    }

    // Click delegation

    function _buildPopupFolderPanel(uid, getMessage) {
        return QuickActions.buildPanel([
            { action: 'open-all',           title: getMessage('openAll'),           icon: 'openAll',
              dataset: { uid } },
            { action: 'open-all-window',    title: getMessage('openAllWindow'),     icon: 'openWindow',
              dataset: { uid } },
            { action: 'open-all-group',     title: getMessage('openAllGroup'),      icon: 'openGroup',
              dataset: { uid } },
            { action: 'open-all-incognito', title: getMessage('openAllIncognito'),  icon: 'openIncognito', className: 'private',
              dataset: { uid } },
            { action: 'rename', title: getMessage('rename'), icon: 'rename',
              dataset: { uid } },
            { action: 'delete', title: getMessage('delete'), icon: 'delete', className: 'delete',
              dataset: { uid } },
        ]);
    }

    function _buildPopupBookmarkPanel(uid, url, getMessage) {
        const actions = [
            { action: 'edit',    title: getMessage('edit'),        icon: 'edit',
              dataset: { uid, 'item-type': 'bookmark' } },
            { action: 'copy',    title: getMessage('copyUrl'),     icon: 'copy',
              dataset: { url } },
            { action: 'qr',     title: getMessage('qrCode'), icon: 'qr',
              dataset: { url, uid } },
        ];
        if (!_deps.isAlwaysIncognito || !_deps.isAlwaysIncognito()) {
            actions.push({ action: 'private', title: getMessage('openPrivate'), icon: 'private', className: 'private',
              dataset: { url } });
        }
        actions.push({ action: 'delete', title: getMessage('delete'), icon: 'delete', className: 'delete',
              dataset: { uid, 'item-type': 'bookmark' } });
        return QuickActions.buildPanel(actions);
    }

    async function handleTreeClick(e) {

        const trigger = e.target.closest('.quick-actions-trigger');
        if (trigger) {
            e.stopPropagation();
            e.preventDefault();
            const { getMessage, escapeHtml } = _deps;
            const item           = trigger.closest('.tree-item');
            const isFolderHeader = !!trigger.closest('.item-header.folder');

            QuickActions.toggle(trigger, () => {
                const uid    = isFolderHeader
                    ? (item?.dataset.folderUid ?? '')
                    : (item?.dataset.itemUid ?? '');
                const linkEl = item?.querySelector('.bookmark-link') ?? null;
                if (isFolderHeader) {
                    return _buildPopupFolderPanel(uid, getMessage);
                } else {
                    const rawUrl = linkEl?.dataset.url ?? '';
                    const url    = escapeHtml ? escapeHtml(rawUrl) : rawUrl;
                    return _buildPopupBookmarkPanel(uid, url, getMessage);
                }
            });
            return;
        }

        const actionBtn = e.target.closest('.quick-action-btn-small[data-action]');
        if (actionBtn) {
            e.preventDefault();
            e.stopPropagation();
            const { editBookmark, deleteBookmark, copyBookmarkUrl, openInPrivateTab,
                    showNotification, getMessage } = _deps;
            const action = actionBtn.dataset.action;
            const uid    = actionBtn.dataset.uid ?? null;

            if (action === 'open-all' || action === 'open-all-window' || action === 'open-all-incognito' || action === 'open-all-group') {
                if (!uid) return;
                const { getData, getItemByUid, collectAllBookmarkUrls } = _deps;
                const folder = getItemByUid(getData(), uid);
                if (!folder || !folder.children) return;
                const urls = collectAllBookmarkUrls(folder.children);
                if (!urls.length) {
                    showNotification(getMessage('noBookmarksInFolder') || 'No bookmarks in folder', true);
                    return;
                }
                if (action === 'open-all') {
                    urls.forEach(url => chrome.tabs.create({ url, active: false }));
                } else if (action === 'open-all-window') {
                    chrome.windows.create({ url: urls[0], focused: true }, win => {
                        urls.slice(1).forEach(url => chrome.tabs.create({ url, windowId: win.id, active: false }));
                    });
                } else if (action === 'open-all-incognito') {
                    chrome.windows.create({ url: urls[0], incognito: true, focused: true }, win => {
                        urls.slice(1).forEach(url => chrome.tabs.create({ url, windowId: win.id, active: false }));
                    });
                } else if (action === 'open-all-group') {
                    (async () => {
                        const tabs = await Promise.all(urls.map(url => chrome.tabs.create({ url, active: false })));
                        const tabIds = tabs.map(t => t.id);
                        if (chrome.tabGroups) {
                            const groupId = await chrome.tabs.group({ tabIds });
                            if (folder.name) {
                                await chrome.tabGroups.update(groupId, { title: folder.name });
                            }
                        }
                    })();
                }
                return;
            }

            if (action === 'rename' || (action === 'delete' && actionBtn.dataset.itemType !== 'bookmark')) {
                if (!uid) return;
                if (action === 'rename') _deps.renameItem(uid);
                else                     _deps.deleteItem(uid);
                return;
            }

            if (action === 'edit') {
                editBookmark(uid);
            } else if (action === 'copy') {
                copyBookmarkUrl(actionBtn.dataset.url);
            } else if (action === 'private') {
                const url = actionBtn.dataset.url;
                try {
                    const urlObj = new URL(url);
                    if (!urlObj.protocol.startsWith('http')) {
                        showNotification(getMessage('invalidUrlForPrivate'), true);
                        return;
                    }
                    openInPrivateTab(url);
                } catch {
                    showNotification(getMessage('invalidUrl'), true);
                }
            } else if (action === 'qr') {
                const bookmarkLink  = actionBtn.dataset.url;
                const treeItem      = actionBtn.closest?.('.tree-item');
                const bookmarkTitle = treeItem?.querySelector('.bookmark-title')?.textContent ?? '';
                if (window.QrModal) window.QrModal.showQrModal(bookmarkLink, bookmarkTitle, getMessage);
            } else if (action === 'delete') {
                deleteBookmark(uid);
            }
            return;
        }

        // Folder header toggle
        const folderHeader = e.target.closest('.item-header.folder');
        if (folderHeader) {
            e.preventDefault();
            e.stopPropagation();
			QuickActions.closeAll();
            toggleFolder(folderHeader);
        }
    }

    


    function setupGlobalClickHandler() {
        if (_eventHandlersInitialized) return;
        const tree = document.getElementById('tree');
        if (!tree) return;

        tree.removeEventListener('click', handleTreeClick);
        tree.addEventListener('click', handleTreeClick);

        QuickActions.attachGlobalCloseListener();

        _eventHandlersInitialized = true;
    }

    // Virtual scroll helpers

    
    const _sentinels = new Map();

    function _folderKey(path) {
        return path.join(',');
    }

    function removeLoadMoreButton(container) {
        
        const key = container.dataset && container.dataset.folderKey;
        if (key && _sentinels.has(key)) {
            const { sentinel, observer } = _sentinels.get(key);
            observer.disconnect();
            sentinel.remove();
            _sentinels.delete(key);
        }
        
        container.parentNode?.querySelector('.load-more-container')?.remove();
    }

    function updateLoadMoreButton(container, folder, path, nextStartIndex) {
        removeLoadMoreButton(container);

        const key = _folderKey(path);
        container.dataset.folderKey = key;
        const folderUid = folder?.uid || container.dataset.folderUid || null;

        const sentinel = document.createElement('div');
        sentinel.className = 'load-more-sentinel';
        sentinel.style.cssText = 'height:1px;width:100%;pointer-events:none;';
        container.appendChild(sentinel);

        let loading = false;

        const observer = new IntersectionObserver(entries => {
            if (!entries[0].isIntersecting || loading) return;
            loading = true;
            observer.disconnect();
            _sentinels.delete(key);
            sentinel.remove();

            const freshFolder = folderUid
                ? _deps.getItemByUid(_deps.getData(), folderUid)
                : _deps.getItemByPath(_deps.getData(), path);

            if (!freshFolder || !Array.isArray(freshFolder.children)) return;

            const actualPath = folderUid
                ? (() => {
                    const el = document.querySelector(`#tree .tree-item[data-folder-uid="${folderUid}"]`);
                    return el?.dataset.path ? el.dataset.path.split(',').map(Number) : path;
                })()
                : path;

            const safeStart = Math.min(nextStartIndex, freshFolder.children.length);
            if (safeStart >= freshFolder.children.length) return;
            loadMoreFolderItems(freshFolder, actualPath, container, safeStart, _deps.VIRTUAL_SCROLL_CONFIG.loadMoreCount);
        }, {
            
            root: document.getElementById('tree'),
            rootMargin: '0px 0px 80px 0px',
            threshold: 0
        });

        observer.observe(sentinel);
        _sentinels.set(key, { sentinel, observer });
    }

    function renderFolderItemsBatch(folder, path, container, startIndex, endIndex, onComplete) {
        const batchSize  = 10;
        const safeEnd    = Math.min(endIndex, folder.children.length);
        const currentEnd = Math.min(startIndex + batchSize, safeEnd);

        const fragment = document.createDocumentFragment();
        for (let i = startIndex; i < currentEnd; i++) {
            const child = folder.children[i];
            if (!child) continue;
            const childPath = [...path, i];
            const element   = child.type === 'bookmark'
                ? createBookmarkElement(child, childPath)
                : child.type === 'folder'
                    ? createFolderElement(child, childPath)
                    : null;
            if (element) fragment.appendChild(element);
        }
        container.appendChild(fragment);

        if (currentEnd < safeEnd) {
            requestAnimationFrame(() =>
                renderFolderItemsBatch(folder, path, container, currentEnd, safeEnd, onComplete)
            );
        } else {
            onComplete?.();
        }
    }

    function loadMoreFolderItems(folder, path, container, startIndex, countToLoad, onFirstBatchDone) {
        const { virtualScrollCache, getMessage } = _deps;

        if (!virtualScrollCache?.getFolderContainer) return;
        const folderData = virtualScrollCache.getFolderContainer(path);

        if (!folder || !Array.isArray(folder.children)) {
            onFirstBatchDone?.();
            return;
        }

        if (folder.children.length === 0) {
            const msg = document.createElement('div');
            msg.className   = 'empty-folder-message';
            msg.setAttribute('data-i18n', 'emptyFolder');
            msg.textContent = getMessage('emptyFolder');
            container.appendChild(msg);
            folderData.hasMore = false;
            onFirstBatchDone?.();
            return;
        }

        const safeStart = Math.max(0, Math.min(startIndex, folder.children.length));
        const endIndex = Math.min(safeStart + countToLoad, folder.children.length);
        renderFolderItemsBatch(folder, path, container, safeStart, endIndex, () => {
            folderData.visibleStart = safeStart;
            folderData.visibleCount = (folderData.visibleCount || 0) + (endIndex - safeStart);
            folderData.hasMore      = endIndex < folder.children.length;

            if (endIndex < folder.children.length) {
                updateLoadMoreButton(container, folder, path, endIndex);
            } else {
                removeLoadMoreButton(container);
            }

            
            DragDropManager.refreshDragItems();
            onFirstBatchDone?.();
        });
    }

    // Main render

    function renderTree() {
        const { getData, virtualScrollCache, saveAndRefresh } = _deps;
        const data = getData();
        const tree = document.getElementById('tree');
        if (!tree) return;

        saveFoldersState();

        virtualScrollCache?.clear?.();
        _sentinels.forEach(({ observer }) => observer.disconnect());
        _sentinels.clear();
        tree.innerHTML = '';
        _eventHandlersInitialized = false;

        if (!data.folders?.length) {
            renderEmptyState(tree);
            setupGlobalClickHandler();
            DragDropManager.initDragAndDrop(data, saveAndRefresh, _deps.saveChanges);
            return;
        }

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
        DragDropManager.initDragAndDrop(data, saveAndRefresh, _deps.saveChanges);
        DragDropManager.refreshDragItems();

        restoreFoldersState();
    }

    function clearAllSentinels() {
        _sentinels.forEach(({ observer, sentinel }) => {
            observer.disconnect();
            sentinel.remove();
        });
        _sentinels.clear();
    }

    // Public API

    return {
        init(deps) { Object.assign(_deps, deps); },
        renderTree,
        renderEmptyState,
        createFolderElement,
        createBookmarkElement,
        loadMoreFolderItems,
        updateLoadMoreButton,
        removeLoadMoreButton,
        clearAllSentinels
    };

})();

if (typeof window !== 'undefined') window.PopupTree = PopupTree;
if (typeof module !== 'undefined') module.exports = PopupTree;
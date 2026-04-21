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

    function openFolder(folderItem, header, sub, path) {
        const { getItemByPath, getData, virtualScrollCache, VIRTUAL_SCROLL_CONFIG, loadMoreFolderItems } = _deps;

        sub.classList.remove('collapsed');
        const arrow = header.querySelector('.arrow');
        if (arrow) arrow.textContent = '▼';
        folderItem.classList.add('open');
        folderItem.classList.add('loading');

        if (!sub.hasChildNodes() || sub.children.length === 0) {
            const pathArray = path.split(',').map(Number);
            const folder    = getItemByPath(getData(), pathArray);

            if (folder?.children) {
                sub.innerHTML = '';
                const scrollContainer = document.createElement('div');
                scrollContainer.className = 'folder-virtual-scroll';
                sub.appendChild(scrollContainer);

                if (virtualScrollCache?.getFolderContainer) {
                    const folderData = virtualScrollCache.getFolderContainer(pathArray);
                    folderData.totalItems   = folder.children.length;
                    folderData.container    = scrollContainer;
                    folderData.isOpen       = true;
                    folderData.visibleStart = 0;
                    folderData.visibleCount = 0;
                    folderData.hasMore      = true;

                    loadMoreFolderItems(
                        folder, pathArray, scrollContainer,
                        0, VIRTUAL_SCROLL_CONFIG.initialLoadCount,
                        () => folderItem.classList.remove('loading')
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
            openFolder(folderItem, header, sub, folderItem.dataset.path);
            saveFoldersState();
        } else {
            closeFolder(folderItem, header, sub);
        }
    }

    // Folder state persistence (save/restore open folders across re-renders)

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
                    openFolder(el, header, sub, el.dataset.path);
                }
            }

            requestAnimationFrame(() => openNext(index + 1));
        }

        requestAnimationFrame(() => openNext(0));
    }

    // Click delegation

    function _buildPopupFolderPanel(path, getMessage) {
        return QuickActions.buildPanel([
            { action: 'rename', title: getMessage('rename'), icon: 'rename',
              dataset: { path } },
            { action: 'delete', title: getMessage('delete'), icon: 'delete', className: 'delete',
              dataset: { path } },
        ]);
    }

    function _buildPopupBookmarkPanel(pathStr, url, getMessage) {
        const actions = [
            { action: 'edit',    title: getMessage('edit'),        icon: 'edit',
              dataset: { path: pathStr, 'item-type': 'bookmark' } },
            { action: 'copy',    title: getMessage('copyUrl'),     icon: 'copy',
              dataset: { url } },
            { action: 'qr',     title: getMessage('qrCode') || 'QR Code', icon: 'qr',
              dataset: { url } },
        ];
        if (!_deps.isAlwaysIncognito || !_deps.isAlwaysIncognito()) {
            actions.push({ action: 'private', title: getMessage('openPrivate'), icon: 'private', className: 'private',
              dataset: { url } });
        }
        actions.push({ action: 'delete',  title: getMessage('delete'),      icon: 'delete',  className: 'delete',
              dataset: { path: pathStr, 'item-type': 'bookmark' } });
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
                const path   = item?.dataset.path ?? '';
                const linkEl = item?.querySelector('.bookmark-link') ?? null;
                if (isFolderHeader) {
                    return _buildPopupFolderPanel(path, getMessage);
                } else {
                    const rawUrl = linkEl?.dataset.url ?? '';
                    const url    = escapeHtml ? escapeHtml(rawUrl) : rawUrl;
                    return _buildPopupBookmarkPanel(path, url, getMessage);
                }
            });
            return;
        }

        // Bookmark action buttons (edit / copy / private / delete)
        const actionBtn = e.target.closest('.quick-action-btn-small[data-action]');
        if (actionBtn) {
            e.preventDefault();
            e.stopPropagation();
            const { editBookmark, deleteBookmark, copyBookmarkUrl, openInPrivateTab,
                    showNotification, getMessage } = _deps;
            const action = actionBtn.dataset.action;

            // Folder rename / delete
            if (action === 'rename' || (action === 'delete' && actionBtn.dataset.itemType !== 'bookmark')) {
                const path = actionBtn.dataset.path;
                if (!path) return;
                const pathArray = path.split(',').map(Number);
                if (action === 'rename') _deps.renameItem(pathArray);
                else                     _deps.deleteItem(pathArray);
                return;
            }

            // Bookmark actions
            if (action === 'edit') {
                editBookmark(actionBtn.dataset.path);
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
                const bookmarkLink = actionBtn.dataset.url;
                const treeItem     = actionBtn.closest?.('.tree-item') ?? document.querySelector(`.tree-item[data-path="${actionBtn.dataset.path}"]`);
                const bookmarkTitle = treeItem?.querySelector('.bookmark-title')?.textContent ?? '';
                if (window.QrModal) window.QrModal.showQrModal(bookmarkLink, bookmarkTitle, getMessage);
            } else if (action === 'delete') {
                deleteBookmark(actionBtn.dataset.path);
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
            loadMoreFolderItems(folder, path, container, nextStartIndex, _deps.VIRTUAL_SCROLL_CONFIG.loadMoreCount);
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
        const currentEnd = Math.min(startIndex + batchSize, endIndex);

        const fragment = document.createDocumentFragment();
        for (let i = startIndex; i < currentEnd; i++) {
            const child     = folder.children[i];
            const childPath = [...path, i];
            const element   = child.type === 'bookmark'
                ? createBookmarkElement(child, childPath)
                : child.type === 'folder'
                    ? createFolderElement(child, childPath)
                    : null;
            if (element) fragment.appendChild(element);
        }
        container.appendChild(fragment);

        if (currentEnd < endIndex) {
            requestAnimationFrame(() =>
                renderFolderItemsBatch(folder, path, container, currentEnd, endIndex, onComplete)
            );
        } else {
            onComplete?.();
        }
    }

    function loadMoreFolderItems(folder, path, container, startIndex, countToLoad, onFirstBatchDone) {
        const { virtualScrollCache, getMessage } = _deps;

        if (!virtualScrollCache?.getFolderContainer) return;
        const folderData = virtualScrollCache.getFolderContainer(path);

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

        const endIndex = Math.min(startIndex + countToLoad, folder.children.length);
        renderFolderItemsBatch(folder, path, container, startIndex, endIndex, () => {
            folderData.visibleStart = startIndex;
            folderData.visibleCount = (folderData.visibleCount || 0) + (endIndex - startIndex);
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

        // Save open state before wiping the DOM
        saveFoldersState();

        if (!data.folders?.length) {
            renderEmptyState(tree);
            return;
        }

        virtualScrollCache?.clear?.();
        
        _sentinels.forEach(({ observer }) => observer.disconnect());
        _sentinels.clear();
        tree.innerHTML = '';
        
        _eventHandlersInitialized = false;

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
        DragDropManager.initDragAndDrop(data, saveAndRefresh);
        
        DragDropManager.refreshDragItems();

        restoreFoldersState();
    }

    // Public API

    return {
        init(deps) { Object.assign(_deps, deps); },
        renderTree,
        createFolderElement,
        createBookmarkElement,
        loadMoreFolderItems
    };

})();

if (typeof window !== 'undefined') window.PopupTree = PopupTree;
if (typeof module !== 'undefined') module.exports = PopupTree;
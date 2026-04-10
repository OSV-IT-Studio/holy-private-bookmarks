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
                <div class="quick-actions-hover">
                    <button class="quick-action-btn-small" data-action="rename" data-path="${path.join(',')}" title="Rename">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                    </button>
                    <button class="quick-action-btn-small delete" data-action="delete" data-path="${path.join(',')}" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                    </button>
                </div>
            </div>
            <div class="subitems collapsed"></div>
        `;

        return div;
    }

    

    function createBookmarkElement(item, path) {
        const { getDomainFromUrl, getMessage, escapeHtml,
                isFaviconEnabled, loadFaviconAsync,
                openInPrivateTab, showNotification,
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

        const quickActions = document.createElement('div');
        quickActions.className = 'quick-actions-hover';

        const pathStr = path.join(',');

        quickActions.innerHTML = `
            <button class="quick-action-btn-small" data-qa="edit" data-path="${pathStr}"
                    title="${getMessage('edit')}">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M11.5 2.5a2 2 0 0 1 3 3L6 14l-4 1 1-4 8.5-8.5z"></path>
                </svg>
            </button>
            <button class="quick-action-btn-small" data-qa="copy" data-url="${escapeHtml(item.url)}"
                    title="${getMessage('copyUrl')}">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                    <rect x="2" y="4" width="10" height="10" rx="1" ry="1"></rect>
                    <path d="M4 2h8a2 2 0 0 1 2 2v8"></path>
                </svg>
            </button>
            <button class="quick-action-btn-small" data-qa="private" data-url="${escapeHtml(item.url)}"
                    title="${getMessage('openPrivate')}">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.5" fill="none"/>
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
    <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
            </button>
            <button class="quick-action-btn-small delete" data-qa="delete" data-path="${pathStr}"
                    title="${getMessage('delete')}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        `;

        titleDiv.appendChild(quickActionsTrigger);
        titleDiv.appendChild(quickActions);
        header.appendChild(titleDiv);
        header.appendChild(domainSpan);
        link.appendChild(header);
        div.appendChild(link);

        link.addEventListener('click', e => {
            if (e.target.closest('.quick-actions-hover') || e.target.closest('.quick-actions-trigger')) return;
            chrome.tabs.create({ url: item.url, active: !e.ctrlKey && !e.metaKey });
        });

        
        if (isFaviconEnabled()) {
            setTimeout(() => loadFaviconAsync(item.url, iconSpan), 0);
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

    async function handleTreeClick(e) {


        const trigger = e.target.closest('.quick-actions-trigger');
        if (trigger) {
            e.stopPropagation();
            e.preventDefault();
            const item  = trigger.closest('.tree-item');
            const panel = item && item.querySelector('.quick-actions-hover');
            if (!panel) return;
            const isOpen = panel.classList.contains('active');
            document.querySelectorAll('.quick-actions-hover.active').forEach(p => p.classList.remove('active'));
            if (!isOpen) panel.classList.add('active');
            return;
        }

        const qaBtn = e.target.closest('[data-qa]');
        if (qaBtn) {
            e.preventDefault();
            e.stopPropagation();
            const { editBookmark, deleteBookmark, copyBookmarkUrl, openInPrivateTab,
                    showNotification, getMessage } = _deps;
            const qa = qaBtn.dataset.qa;

            if (qa === 'edit') {
                editBookmark(qaBtn.dataset.path);
            } else if (qa === 'copy') {
                copyBookmarkUrl(qaBtn.dataset.url);
            } else if (qa === 'private') {
                const url = qaBtn.dataset.url;
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
            } else if (qa === 'delete') {
				deleteBookmark(qaBtn.dataset.path);

}
            return;
        }

        // Folder rename / delete action buttons
        const folderActionBtn = e.target.closest('.quick-action-btn-small[data-action]');
        if (folderActionBtn) {
            e.preventDefault();
            e.stopPropagation();

            const action    = folderActionBtn.dataset.action;
            const path      = folderActionBtn.dataset.path;
            if (!path) return;
            const pathArray = path.split(',').map(Number);

            if (action === 'rename') _deps.renameItem(pathArray);
            else if (action === 'delete') _deps.deleteItem(pathArray);
            return;
        }

        // Folder header toggle
        const folderHeader = e.target.closest('.item-header.folder');
        if (folderHeader) {
            e.preventDefault();
            e.stopPropagation();
            toggleFolder(folderHeader);
        }
    }

    


    function setupGlobalClickHandler() {
        if (_eventHandlersInitialized) return;
        const tree = document.getElementById('tree');
        if (!tree) return;

        tree.removeEventListener('click', handleTreeClick);
        tree.addEventListener('click', handleTreeClick);

        document.addEventListener('click', e => {
            if (e.target.closest('.quick-actions-trigger') || e.target.closest('.quick-actions-hover')) return;
            document.querySelectorAll('.quick-actions-hover.active').forEach(p => p.classList.remove('active'));
        }, { passive: true });

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
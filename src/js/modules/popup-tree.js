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
                <h3 style="margin:0 0 8px 0;color:var(--text-primary);">${getMessage('emptyTreeTitle') || 'No bookmarks yet'}</h3>
                <p style="margin:0 0 20px 0;">${getMessage('emptyTreeSubtitle') || 'Add your first bookmark or folder to get started'}</p>
            </div>
        `;
    }

    // Folder element

    function createFolderElement(item, path) {
        const { countItemsInFolder, escapeHtml } = _deps;

        const div = document.createElement('div');
        div.className        = 'tree-item';
        div.dataset.path     = path.join(',');
        div.setAttribute('draggable', 'true');

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
                <div class="actions">
                    <button class="action-btn" data-action="rename" data-path="${path.join(',')}" title="Rename">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                    </button>
                    <button class="action-btn delete" data-action="delete" data-path="${path.join(',')}" title="Delete">
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

    // Bookmark element

    function createBookmarkElement(item, path) {
        const { getDomainFromUrl, getMessage, escapeHtml,
                isFaviconEnabled, loadFaviconAsync,
                openInPrivateTab, showNotification,
                editBookmark, deleteBookmark, copyBookmarkUrl } = _deps;

        const div = document.createElement('div');
        div.className    = 'tree-item';
        div.dataset.path = path.join(',');
        div.setAttribute('draggable', 'true');

        const domain = getDomainFromUrl(item.url);

        const link = document.createElement('a');
        link.href      = item.url;
        link.target    = '_blank';
        link.title     = item.url;
        link.className = 'bookmark-link';

        const header   = document.createElement('div');
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
        titleDiv.appendChild(domainSpan);

        // Quick-action buttons
        const quickActions = document.createElement('div');
        quickActions.className    = 'quick-actions-hover';
        quickActions.style.display = 'none';

        const makeBtn = (title, svgPath, onClick) => {
            const btn = document.createElement('button');
            btn.className = 'quick-action-btn-small';
            btn.title     = title;
            btn.innerHTML = svgPath;
            btn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); onClick(); });
            return btn;
        };

        quickActions.appendChild(makeBtn(
            getMessage('edit') || 'Edit',
            `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M11.5 2.5a2 2 0 0 1 3 3L6 14l-4 1 1-4 8.5-8.5z"></path>
             </svg>`,
            () => editBookmark(path.join(','))
        ));

        quickActions.appendChild(makeBtn(
            getMessage('copyUrl') || 'Copy URL',
            `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="2" y="4" width="10" height="10" rx="1" ry="1"></rect>
                <path d="M4 2h8a2 2 0 0 1 2 2v8"></path>
             </svg>`,
            () => copyBookmarkUrl(item.url)
        ));

        quickActions.appendChild(makeBtn(
            getMessage('openPrivate') || 'Open in private tab',
            `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="3" y="6" width="10" height="8" rx="1" ry="1"></rect>
                <path d="M5 6V4a3 3 0 0 1 6 0v2"></path>
                <circle cx="8" cy="10" r="1"></circle>
             </svg>`,
            () => {
                try {
                    const urlObj = new URL(item.url);
                    if (!urlObj.protocol.startsWith('http')) {
                        showNotification(getMessage('invalidUrlForPrivate') || 'Only http/https URLs can be opened in private mode', true);
                        return;
                    }
                    openInPrivateTab(item.url);
                } catch {
                    showNotification(getMessage('invalidUrl') || 'Invalid URL', true);
                }
            }
        ));

        const deleteBtn = makeBtn(
            getMessage('delete') || 'Delete',
            `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
             </svg>`,
            () => {
                if (confirm(getMessage('deleteConfirm') || 'Delete this bookmark?')) {
                    deleteBookmark(path.join(','));
                }
            }
        );
        deleteBtn.classList.add('delete');
        quickActions.appendChild(deleteBtn);

        titleDiv.appendChild(quickActions);
        header.appendChild(titleDiv);
        link.appendChild(header);
        div.appendChild(link);

        if (isFaviconEnabled()) loadFaviconAsync(item.url, iconSpan);

        div.addEventListener('mouseenter', () => { quickActions.style.display = 'flex'; });
        div.addEventListener('mouseleave', () => { quickActions.style.display = 'none'; });

        return div;
    }

    // Folder open / close

    function openFolder(folderItem, header, sub, path) {
        const { getItemByPath, getData, virtualScrollCache, VIRTUAL_SCROLL_CONFIG, loadMoreFolderItems } = _deps;

        sub.classList.remove('collapsed');
        const arrow = header.querySelector('.arrow');
        if (arrow) arrow.textContent = '▼';
        folderItem.classList.add('open');

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
                        0, VIRTUAL_SCROLL_CONFIG.initialLoadCount
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

    function toggleFolder(header) {
        const folderItem = header.closest('.tree-item');
        if (!folderItem) return;
        const sub = folderItem.querySelector('.subitems');
        if (!sub) return;

        if (sub.classList.contains('collapsed')) {
            openFolder(folderItem, header, sub, folderItem.dataset.path);
        } else {
            closeFolder(folderItem, header, sub);
        }
    }

    // Click delegation

    function handleTreeClick(e) {
        if (e.target.closest('.action-btn')) {
            const btn = e.target.closest('.action-btn');
            e.preventDefault(); e.stopPropagation();

            const action    = btn.dataset.action;
            const path      = btn.dataset.path;
            if (!path) return;
            const pathArray = path.split(',').map(Number);

            if (action === 'rename') _deps.renameItem(pathArray);
            else if (action === 'delete') _deps.deleteItem(pathArray);
            return;
        }

        const folderHeader = e.target.closest('.item-header.folder');
        if (folderHeader) {
            e.preventDefault(); e.stopPropagation();
            toggleFolder(folderHeader);
        }
    }

    function setupGlobalClickHandler() {
        if (_eventHandlersInitialized) return;
        const tree = document.getElementById('tree');
        if (!tree) return;
        tree.removeEventListener('click', handleTreeClick);
        tree.addEventListener('click', handleTreeClick);
        _eventHandlersInitialized = true;
    }

    // Virtual scroll helpers

    function removeLoadMoreButton(container) {
        container.parentNode?.querySelector('.load-more-container')?.remove();
    }

    function updateLoadMoreButton(container, folder, path, nextStartIndex) {
        removeLoadMoreButton(container);

        const remaining        = folder.children.length - nextStartIndex;
        const loadMoreContainer = document.createElement('div');
        loadMoreContainer.className = 'load-more-container';

        const btn = document.createElement('button');
        btn.className = 'load-more-btn';
        btn.setAttribute('data-folder-path', path.join(','));
        btn.setAttribute('data-start-index', nextStartIndex);
        btn.innerHTML = `<span class="icon">↓</span> Load more (${remaining} remaining)`;

        btn.onclick = e => {
            e.preventDefault(); e.stopPropagation();
            btn.disabled  = true;
            btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;"></div> Loading...';
            loadMoreFolderItems(folder, path, container, nextStartIndex, _deps.VIRTUAL_SCROLL_CONFIG.loadMoreCount);
        };

        loadMoreContainer.appendChild(btn);
        container.parentNode.appendChild(loadMoreContainer);
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

    function loadMoreFolderItems(folder, path, container, startIndex, countToLoad) {
        const { virtualScrollCache, showLoadingIndicator, hideLoadingIndicator, getMessage } = _deps;

        if (!virtualScrollCache?.getFolderContainer) return;
        const folderData = virtualScrollCache.getFolderContainer(path);

        if (folder.children.length === 0) {
            const msg = document.createElement('div');
            msg.className      = 'empty-folder-message';
            msg.setAttribute('data-i18n', 'emptyFolder');
            msg.textContent    = getMessage('emptyFolder') || 'Folder is empty';
            container.appendChild(msg);
            folderData.hasMore = false;
            return;
        }

        const endIndex = Math.min(startIndex + countToLoad, folder.children.length);
        if (startIndex === 0) showLoadingIndicator(container);

        renderFolderItemsBatch(folder, path, container, startIndex, endIndex, () => {
            hideLoadingIndicator(container);
            folderData.visibleStart  = startIndex;
            folderData.visibleCount  = (folderData.visibleCount || 0) + (endIndex - startIndex);
            folderData.hasMore       = endIndex < folder.children.length;

            if (endIndex < folder.children.length) {
                updateLoadMoreButton(container, folder, path, endIndex);
            } else {
                removeLoadMoreButton(container);
            }
        });
    }

    // Main render

    function renderTree() {
        const { getData, virtualScrollCache, saveAndRefresh } = _deps;
        const data = getData();
        const tree = document.getElementById('tree');
        if (!tree) return;

        if (!data.folders?.length) {
            renderEmptyState(tree);
            return;
        }

        virtualScrollCache?.clear?.();
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
        DragDropManager.initDragAndDrop(data, saveAndRefresh);
        DragDropManager.refreshDragItems();
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

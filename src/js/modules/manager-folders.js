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
 
 const ManagerFolders = (function () {

    let _deps = {};

    let _activeFolderEl      = null;
    let _treeListenerAttached = false;

    function _generateUid() {
        if (_deps.generateFolderUid) return _deps.generateFolderUid();
        return 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function renderFolderTree() {
        const { getData, countAllBookmarks, resetInactivityTimer } = _deps;
        const tree = document.getElementById('folder-tree');
        if (!tree) return;

        saveFoldersState();

        const allBookmarksItem = tree.querySelector('.all-bookmarks');
        tree.innerHTML = '';
        _activeFolderEl = null;
        if (allBookmarksItem) tree.appendChild(allBookmarksItem);

        const allCount = document.getElementById('all-count');
        if (allCount) allCount.textContent = countAllBookmarks(getData());

        const fragment = document.createDocumentFragment();
        _renderFoldersRecursive(getData().folders, fragment);
        tree.appendChild(fragment);

        _attachDelegatedTreeListener();
        restoreFoldersState();

        const currentId = _deps.getCurrentFolderId?.();
        if (currentId) {
            const active = currentId === 'all'
                ? document.querySelector('.all-bookmarks')
                : (document.querySelector(`.folder-item[data-folder-uid="${currentId}"]`) ||
                   document.querySelector('.all-bookmarks'));
            if (active) active.classList.add('active');
            _activeFolderEl = active || null;
        } else {
            _activeFolderEl = tree.querySelector('.folder-item.active') || null;
        }

        resetInactivityTimer();
    }

    function _renderFoldersRecursive(items, container) {
        const { countItemsInFolder, getMessage } = _deps;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type !== 'folder') continue;

            const itemCount     = countItemsInFolder(item);
            const hasSubfolders = item.children?.some(c => c.type === 'folder');

            const li = document.createElement('li');
            li.className = 'folder-item' + (hasSubfolders ? ' has-children' : '');
            if (item.uid) {
                li.dataset.folderUid = item.uid;
            }

            const folderContent = document.createElement('div');
            folderContent.className = 'folder-content';

            const toggleSpan = document.createElement('span');
            toggleSpan.className = 'folder-toggle';
            if (hasSubfolders) toggleSpan.textContent = '▶';
            folderContent.appendChild(toggleSpan);

            const iconDiv = document.createElement('div');
            iconDiv.className = 'folder-icon';
            iconDiv.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
            folderContent.appendChild(iconDiv);

            const nameDiv = document.createElement('div');
            nameDiv.className   = 'folder-name';
            nameDiv.textContent = item.name;
            folderContent.appendChild(nameDiv);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'folder-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'folder-action-btn edit';
            editBtn.title     = getMessage('rename');
            editBtn.dataset.action = 'rename';
            editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'folder-action-btn delete';
            deleteBtn.title     = getMessage('delete');
            deleteBtn.dataset.action = 'delete-folder';
            deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);
            folderContent.appendChild(actionsDiv);
            li.appendChild(folderContent);

            const countDiv = document.createElement('div');
            countDiv.className   = 'folder-badge';
            countDiv.textContent = itemCount;
            li.appendChild(countDiv);

            container.appendChild(li);

            if (hasSubfolders) {
                const subUl = document.createElement('ul');
                subUl.className = 'subfolder-list';
                subUl.style.display = 'none';
                container.appendChild(subUl);
                _renderFoldersRecursive(item.children, subUl);
            }
        }
    }

    function _attachDelegatedTreeListener() {
        if (_treeListenerAttached) return;
        const tree = document.getElementById('folder-tree');
        if (!tree) return;

        tree.addEventListener('click', e => {
            const toggle = e.target.closest('.folder-toggle');
            if (toggle) {
                e.stopPropagation();
                const folderItem = toggle.closest('.folder-item');
                if (folderItem) _toggleFolderExpand(folderItem);
                return;
            }

            const actionBtn = e.target.closest('.folder-action-btn[data-action]');
            if (actionBtn) {
                e.stopPropagation();
                const folderItem = actionBtn.closest('.folder-item');
                if (!folderItem) return;
                const uid = folderItem.dataset.folderUid;
                if (!uid) return;
                if (actionBtn.dataset.action === 'rename') renameFolder(uid);
                else if (actionBtn.dataset.action === 'delete-folder') deleteFolder(uid);
                return;
            }

            if (e.target.closest('.folder-actions')) return;

            const folderItem = e.target.closest('.folder-item');
            if (folderItem) {
                const uid = folderItem.dataset.folderUid;
                setActiveFolder(uid || 'all');
            }
        });

        _treeListenerAttached = true;
    }

    function _toggleFolderExpand(folderItem) {
        const toggle  = folderItem.querySelector('.folder-toggle');
        const subList = folderItem.nextElementSibling;
        if (!subList?.classList.contains('subfolder-list')) return;

        const isExpanded = folderItem.classList.contains('expanded');
        folderItem.classList.toggle('expanded', !isExpanded);
        toggle.textContent = isExpanded ? '▶' : '▼';
        subList.style.display = isExpanded ? 'none' : 'block';

        _deps.resetInactivityTimer();
    }

    function _expandTreeToFolder(folderUid) {
        if (!folderUid || folderUid === 'all') return;

        const target = document.querySelector(`.folder-item[data-folder-uid="${folderUid}"]`);
        if (!target) return;
        let node = target.parentElement;
        while (node) {
            if (node.classList.contains('subfolder-list')) {
                node.style.display = 'block';
                const parentFolderItem = node.previousElementSibling;
                if (parentFolderItem?.classList.contains('folder-item')) {
                    parentFolderItem.classList.add('expanded');
                    const toggle = parentFolderItem.querySelector('.folder-toggle');
                    if (toggle) toggle.textContent = '▼';
                }
            }
            node = node.parentElement;
        }

        requestAnimationFrame(() => {
            target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    }

    function setActiveFolder(folderUid) {
        const { renderBookmarks, resetInactivityTimer,
                setCurrentFolderId, resetPagination } = _deps;

        setCurrentFolderId(folderUid);
        resetPagination();

        if (_activeFolderEl) _activeFolderEl.classList.remove('active');

        const active = folderUid === 'all' || !folderUid
            ? document.querySelector('.all-bookmarks')
            : (document.querySelector(`.folder-item[data-folder-uid="${folderUid}"]`) ||
               document.querySelector('.all-bookmarks'));

        if (active) active.classList.add('active');
        _activeFolderEl = active || null;

        _expandTreeToFolder(folderUid);

        updateBreadcrumbs(folderUid);
        renderBookmarks();
        resetInactivityTimer();
    }

    async function createNewFolder(parentFolderUid = '') {
        const { getMessage, showNotification, getData, saveChanges,
                clearBookmarksCache, resetInactivityTimer, getItemByUid } = _deps;

        const folderName = await _deps.showPrompt({
            title:        getMessage('newFolder'),
            placeholder:  getMessage('folderName'),
            confirmLabel: getMessage('save'),
        });
        if (!folderName?.trim()) return;

        const newFolder = {
            type: 'folder', name: folderName.trim(),
            children: [], dateAdded: Date.now(), uid: _generateUid()
        };

        if (!parentFolderUid || parentFolderUid === 'all') {
            getData().folders.push(newFolder);
        } else {
            const parent = getItemByUid(getData(), parentFolderUid);
            if (parent) {
                if (!parent.children) parent.children = [];
                parent.children.push(newFolder);
            } else {
                getData().folders.push(newFolder);
            }
        }

        await saveChanges();
        clearBookmarksCache();
        renderFolderTree();
        await _deps.renderBookmarksPreservingScroll();
        showNotification(getMessage('folderCreated'));
        resetInactivityTimer();
    }

    async function renameFolder(folderUid) {
        const { getMessage, showNotification, getData, saveChanges,
                clearBookmarksCache, resetInactivityTimer,
                getCurrentFolderId, getItemByUid } = _deps;

        if (!folderUid || folderUid === 'all') {
            showNotification(getMessage('cannotRenameAll'), true); return;
        }

        const folder = getItemByUid(getData(), folderUid);
        if (!folder) return;

        const newName = await _deps.showPrompt({
            title:        getMessage('renameFolder'),
            defaultValue: folder.name,
            confirmLabel: getMessage('save'),
        });
        if (!newName?.trim() || newName.trim() === folder.name) return;

        folder.name = newName.trim();
        await saveChanges();
        clearBookmarksCache();
        renderFolderTree();
        await _deps.renderBookmarksPreservingScroll();

        if (getCurrentFolderId() === folderUid) updateBreadcrumbs(folderUid);

        showNotification(getMessage('folderRenamed'));
        resetInactivityTimer();
    }

    async function deleteFolder(folderUid) {
        const { getMessage, showNotification, getData, saveChanges, clearBookmarksCache,
                resetInactivityTimer, countFoldersInFolder,
                getItemByUid, getParentArrayForItemUid, getCurrentFolderId } = _deps;

        if (!folderUid || folderUid === 'all') {
            showNotification(getMessage('cannotDeleteAll'), true); return;
        }

        const folder = getItemByUid(getData(), folderUid);
        if (!folder) return;

        const bookmarkCount = _deps.countBookmarksInFolder(folderUid);
        const folderCount   = countFoldersInFolder(folder);

        let message = getMessage('deleteFolderConfirm')
            .replace('{0}', folder.name).replace('{name}', folder.name);
        if (bookmarkCount > 0 || folderCount > 0) {
            message += '\n\n' + getMessage('deleteFolderWarning');
        }

        const lines = message.split('\n\n');
        const confirmed = await _deps.showConfirm({ title: lines[0] || message, warning: lines[1] || '' });
        if (!confirmed) return;

        const parentArr = getParentArrayForItemUid(getData(), folderUid);
        if (!parentArr) return;
        const idx = parentArr.indexOf(folder);
        if (idx !== -1) parentArr.splice(idx, 1);

        await saveChanges();
        clearBookmarksCache();

        try {
            const saved = sessionStorage.getItem('expandedFolders');
            if (saved) {
                const keys     = JSON.parse(saved);
                const filtered = keys.filter(k => k !== folderUid);
                sessionStorage.setItem('expandedFolders', JSON.stringify(filtered));
            }
        } catch (e) {}

        renderFolderTree();

        const currentId = getCurrentFolderId();
        if (currentId === folderUid) setActiveFolder('all');
        else await _deps.renderBookmarksPreservingScroll();

        showNotification(getMessage('folderDeleted'));
        resetInactivityTimer();
    }

    function initNewFolderButton() {
        document.getElementById('quick-add-folder')?.addEventListener('click', () => {
            const currentId = _deps.getCurrentFolderId ? _deps.getCurrentFolderId() : '';
            createNewFolder(currentId === 'all' ? '' : currentId);
        });
		document.getElementById('new-folder-mini-btn')?.addEventListener('click', () => {
            const currentId = _deps.getCurrentFolderId ? _deps.getCurrentFolderId() : '';
            createNewFolder(currentId === 'all' ? '' : currentId);
        });
    }

    function updateBreadcrumbs(folderUid) {
        const { getData, getItemByUid, getMessage, countBookmarksInFolder,
                escapeHtml } = _deps;
        const breadcrumbsContainer = document.getElementById('breadcrumbs');
        if (!breadcrumbsContainer) return;

        let breadcrumbs = [{ uid: 'all', name: getMessage('allBookmarks') }];

        if (folderUid && folderUid !== 'all') {
            const folder = getItemByUid(getData(), folderUid);
            if (folder) {
                function buildPath(items, targetUid, path) {
                    for (const item of items) {
                        if (item.type !== 'folder') continue;
                        const newPath = [...path, { uid: item.uid, name: item.name }];
                        if (item.uid === targetUid) return newPath;
                        if (item.children) {
                            const found = buildPath(item.children, targetUid, newPath);
                            if (found) return found;
                        }
                    }
                    return null;
                }
                const path = buildPath(getData().folders, folderUid, []);
                if (path) breadcrumbs = [{ uid: 'all', name: getMessage('allBookmarks') }, ...path];
            }
        }

        let html = '';
        for (let i = 0; i < breadcrumbs.length; i++) {
            const crumb  = breadcrumbs[i];
            const isLast = i === breadcrumbs.length - 1;
            html += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" data-folder-uid="${crumb.uid}" ${isLast ? 'aria-current="page"' : ''}>`;
            if (i === 0) html += `<svg class="breadcrumb-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
            html += `${escapeHtml(crumb.name)}</span>`;
            if (!isLast) html += `<span class="breadcrumb-separator"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 3 10 7 5 11" /></svg></span>`;
        }
        breadcrumbsContainer.innerHTML = html;

        breadcrumbsContainer.querySelectorAll('.breadcrumb-item:not(.active)').forEach(item => {
            item.addEventListener('click', e => {
                e.stopPropagation();
                const uid = item.dataset.folderUid;
                if (uid) setActiveFolder(uid);
            });
        });

        const count        = countBookmarksInFolder(folderUid);
        const countElement = document.getElementById('bookmarks-count');
        if (countElement) {
            countElement.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                <span class="count-number">${count}</span>
                <span>${count === 1 ? getMessage('bookmark') : getMessage('bookmarks')}</span>
            `;
        }
    }

    function saveFoldersState() {
        const expandedFolders = new Set();
        document.querySelectorAll('.folder-item.expanded').forEach(folder => {
            const key = folder.dataset.folderUid;
            if (key) expandedFolders.add(key);
        });
        sessionStorage.setItem('expandedFolders', JSON.stringify(Array.from(expandedFolders)));
        return expandedFolders;
    }

    function restoreFoldersState() {
        try {
            const saved = sessionStorage.getItem('expandedFolders');
            if (!saved) return;
            const expandedKeys = new Set(JSON.parse(saved));
            expandedKeys.forEach(key => {
                const folder = document.querySelector(`.folder-item[data-folder-uid="${key}"]`);
                if (folder && !folder.classList.contains('expanded')) {
                    folder.classList.add('expanded');
                    const toggle = folder.querySelector('.folder-toggle');
                    if (toggle) toggle.textContent = '▼';
                    const subList = folder.nextElementSibling;
                    if (subList?.classList.contains('subfolder-list')) subList.style.display = 'block';
                }
            });
        } catch (e) {}
    }

    return {
        init(deps) {
            Object.assign(_deps, deps);
            _activeFolderEl = document.querySelector('.folder-item.active') || null;
        },
        renderFolderTree,
        setActiveFolder,
        createNewFolder,
        renameFolder,
        deleteFolder,
        initNewFolderButton,
        updateBreadcrumbs,
        saveFoldersState,
        restoreFoldersState
    };

})();

if (typeof window !== 'undefined') window.ManagerFolders = ManagerFolders;
if (typeof module !== 'undefined') module.exports = ManagerFolders;


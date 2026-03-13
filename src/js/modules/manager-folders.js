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

// MODULE: manager-folders.js
// Handles: folder tree rendering (recursive), active folder selection,
//          folder toggle (expand/collapse), folder CRUD (create/rename/delete)

const ManagerFolders = (function () {

    let _deps = {};

    // Folder tree render

    function renderFolderTree() {
        const { getData, countAllBookmarks, resetInactivityTimer } = _deps;
        const tree = document.getElementById('folder-tree');
        if (!tree) return;

        const allBookmarksItem = tree.querySelector('.all-bookmarks');
        tree.innerHTML = '';
        if (allBookmarksItem) tree.appendChild(allBookmarksItem);

        const allCount = document.getElementById('all-count');
        if (allCount) allCount.textContent = countAllBookmarks(getData());

        const fragment = document.createDocumentFragment();
        _renderFoldersRecursive(getData().folders, fragment, []);
        tree.appendChild(fragment);

        _addFolderTreeEventListeners();
        resetInactivityTimer();
    }

    function _renderFoldersRecursive(items, container, path = [], depth = 0) {
        const { countItemsInFolder, getMessage } = _deps;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type !== 'folder') continue;

            const currentPath   = [...path, i];
            const folderId      = currentPath.join(',');
            const itemCount     = countItemsInFolder(item);
            const hasSubfolders = item.children?.some(c => c.type === 'folder');

            const li = document.createElement('li');
            li.className    = 'folder-item' + (hasSubfolders ? ' has-children' : '');
            li.dataset.folderId = folderId;

            // Toggle arrow
            const folderContent = document.createElement('div');
            folderContent.className = 'folder-content';

            const toggleSpan = document.createElement('span');
            toggleSpan.className = 'folder-toggle';
            if (hasSubfolders) toggleSpan.textContent = '▶';
            folderContent.appendChild(toggleSpan);

            // Icon
            const iconDiv = document.createElement('div');
            iconDiv.className = 'folder-icon';
            iconDiv.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
            `;
            folderContent.appendChild(iconDiv);

            // Name
            const nameDiv = document.createElement('div');
            nameDiv.className   = 'folder-name';
            nameDiv.textContent = item.name;
            folderContent.appendChild(nameDiv);

            // Action buttons
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'folder-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'folder-action-btn edit';
            editBtn.title     = getMessage('rename') || 'Rename';
            editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
            editBtn.addEventListener('click', e => {
                e.stopPropagation();
                renameFolder(e.currentTarget.closest('.folder-item').dataset.folderId);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'folder-action-btn delete';
            deleteBtn.title     = getMessage('delete') || 'Delete';
            deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
            deleteBtn.addEventListener('click', e => {
                e.stopPropagation();
                deleteFolder(e.currentTarget.closest('.folder-item').dataset.folderId);
            });

            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);
            folderContent.appendChild(actionsDiv);
            li.appendChild(folderContent);

            // Count badge
            const countDiv = document.createElement('div');
            countDiv.className   = 'folder-count';
            countDiv.textContent = itemCount;
            li.appendChild(countDiv);

            container.appendChild(li);

            // Recurse
            if (hasSubfolders) {
                const subUl = document.createElement('ul');
                subUl.className = 'subfolder-list';
                container.appendChild(subUl);
                _renderFoldersRecursive(item.children, subUl, currentPath, depth + 1);
            }
        }
    }

    function _addFolderTreeEventListeners() {
        // Expand/collapse toggles
        document.querySelectorAll('.folder-item.has-children .folder-toggle').forEach(toggle => {
            toggle.addEventListener('click', e => {
                e.stopPropagation();
                _toggleFolderExpand(toggle.closest('.folder-item'));
            });
        });

        // Click on folder item → activate
        document.querySelectorAll('.folder-item').forEach(item => {
            item.addEventListener('click', e => {
                if (e.target.closest('.folder-toggle')) return;
                if (e.target.closest('.folder-actions')) return;
                setActiveFolder(item.dataset.folderId || 'all');
            });
        });
    }

    function _toggleFolderExpand(folderItem) {
        const toggle  = folderItem.querySelector('.folder-toggle');
        const subList = folderItem.nextElementSibling;
        if (!subList?.classList.contains('subfolder-list')) return;

        const isExpanded = folderItem.classList.contains('expanded');
        folderItem.classList.toggle('expanded', !isExpanded);
        toggle.textContent = isExpanded ? '▶' : '▼';

        _deps.resetInactivityTimer();
    }

    // Active folder

    function setActiveFolder(folderId) {
        const { getMessage, findFolderById, getBookmarksForFolder,
                renderBookmarks, resetInactivityTimer,
                setCurrentFolderId, resetPagination } = _deps;

        setCurrentFolderId(folderId);
        resetPagination();

        document.querySelectorAll('.folder-item').forEach(i => i.classList.remove('active'));
        const active = document.querySelector(`.folder-item[data-folder-id="${folderId}"]`) ||
                       document.querySelector('.all-bookmarks');
        if (active) active.classList.add('active');

        const nameEl  = document.getElementById('current-folder-name');
        const countEl = document.getElementById('bookmarks-count');

        if (folderId === 'all') {
            nameEl.textContent = getMessage('allBookmarks') || 'All Bookmarks';
        } else {
            const folder = findFolderById(_deps.getData().folders, folderId);
            nameEl.textContent = folder ? folder.name : (getMessage('allBookmarks') || 'All Bookmarks');
        }

        const count = getBookmarksForFolder(folderId).length;
        countEl.textContent = `${count} ${getMessage('bookmarks') || 'bookmarks'}`;

        renderBookmarks();
        resetInactivityTimer();
    }

    // Folder CRUD

    async function createNewFolder(parentFolderId = '') {
        const { getMessage, showNotification, getData, saveChanges,
                clearBookmarksCache, resetInactivityTimer } = _deps;

        const folderName = prompt(getMessage('folderName') || 'Folder name:');
        if (!folderName?.trim()) return;

        const newFolder = { type: 'folder', name: folderName.trim(), children: [], dateAdded: Date.now() };

        if (parentFolderId === '') {
            getData().folders.push(newFolder);
        } else {
            const parent = _deps.findFolderById(getData().folders, parentFolderId);
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
        showNotification(getMessage('folderCreated') || 'Folder created successfully');
        resetInactivityTimer();
    }

    async function renameFolder(folderId) {
        const { getMessage, showNotification, getData, saveChanges,
                clearBookmarksCache, resetInactivityTimer,
                getCurrentFolderId, findFolderById } = _deps;

        if (folderId === 'all') {
            showNotification(getMessage('cannotRenameAll') || 'Cannot rename "All Bookmarks" folder', true);
            return;
        }

        const folder = findFolderById(getData().folders, folderId);
        if (!folder) return;

        const newName = prompt(getMessage('renameFolder') || 'Rename folder:', folder.name);
        if (!newName?.trim() || newName.trim() === folder.name) return;

        folder.name = newName.trim();
        await saveChanges();
        clearBookmarksCache();
        renderFolderTree();

        if (getCurrentFolderId() === folderId) {
            document.getElementById('current-folder-name').textContent = folder.name;
        }

        showNotification(getMessage('folderRenamed') || 'Folder renamed successfully');
        resetInactivityTimer();
    }

    async function deleteFolder(folderId) {
        const { getMessage, showNotification, getData, saveChanges, clearBookmarksCache,
                resetInactivityTimer, countFoldersInFolder, removeItemByPath,
                getFolderPathById, findFolderById, getCurrentFolderId } = _deps;

        if (folderId === 'all') {
            showNotification(getMessage('cannotDeleteAll') || 'Cannot delete "All Bookmarks" folder', true);
            return;
        }

        const folder = findFolderById(getData().folders, folderId);
        if (!folder) return;

        const bookmarkCount = _deps.countBookmarksInFolder(folderId);
        const folderCount   = countFoldersInFolder(folder);

        let message = (getMessage('deleteFolderConfirm') || 'Delete folder "{0}"?')
            .replace('{0}', folder.name)
            .replace('{name}', folder.name);

        if (bookmarkCount > 0 || folderCount > 0) {
            message += '\n\n';
            if (bookmarkCount > 0) message += '• ' + (getMessage('bookmarksCount') || '{0} bookmarks')
                .replace('{0}', bookmarkCount).replace('{count}', bookmarkCount) + '\n';
            if (folderCount   > 0) message += '• ' + (getMessage('foldersCount')   || '{0} folders')
                .replace('{0}', folderCount)  .replace('{count}', folderCount)   + '\n';
            message += '\n' + (getMessage('deleteFolderWarning') || 'All content will be permanently deleted.');
        }

        if (!confirm(message)) return;

        const path = getFolderPathById(folderId);
        if (!path) return;

        removeItemByPath(getData(), path);
        await saveChanges();
        clearBookmarksCache();

        if (getCurrentFolderId() === folderId) {
            setActiveFolder('all');
        } else {
            renderFolderTree();
            _deps.renderBookmarks();
        }

        showNotification(getMessage('folderDeleted') || 'Folder deleted successfully');
        resetInactivityTimer();
    }

    function initNewFolderButton() {
        document.getElementById('new-folder-btn')?.addEventListener('click', () => createNewFolder());
    }

    // Public API

    return {
        init(deps) { Object.assign(_deps, deps); },

        renderFolderTree,
        setActiveFolder,
        createNewFolder,
        renameFolder,
        deleteFolder,
        initNewFolderButton
    };

})();

if (typeof window !== 'undefined') window.ManagerFolders = ManagerFolders;
if (typeof module !== 'undefined') module.exports = ManagerFolders;

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

// MODULE: popup-bookmarks.js
// Handles: bookmark CRUD (add/edit/delete/copy/rename), folder add,
//          add-bookmark modal, "add current page"

const PopupBookmarks = (function () {

    let _deps = {};
    let _editingBookmarkPath = null;

    // Modal open

    function openAddBookmarkModal(pageTitle, pageUrl, editPath = null) {
        const { getCachedElement, getItemByPath, getData,
                buildFolderOptions, getMessage } = _deps;

        const modal = getCachedElement('#add-bookmark-modal');
        if (!modal) return;

        _editingBookmarkPath = editPath;
        const isEdit = editPath !== null;

        modal.querySelector('h2').textContent = getMessage(isEdit ? 'editBookmark' : 'addBookmark');

        document.getElementById('modal-page-title').textContent =
            pageTitle.length > 60 ? pageTitle.slice(0, 60) + '...' : pageTitle;

        const titleInput = document.getElementById('modal-bookmark-title');
        const urlInput   = document.getElementById('modal-bookmark-url');

        if (isEdit) {
            const bookmark = getItemByPath(getData(), editPath);
            if (bookmark) {
                titleInput.value = bookmark.title;
                urlInput.value   = bookmark.url;
            }
        } else {
            titleInput.value = pageTitle;
            urlInput.value   = pageUrl;
        }

        // Populate folder selector
        const select = document.getElementById('folder-select');
        select.innerHTML = '';
        const rootOption = document.createElement('option');
        rootOption.value       = '';
        rootOption.textContent = getMessage('rootFolder') || 'Root folder';
        select.appendChild(rootOption);
        buildFolderOptions(getData().folders, select, '', 0);

        if (isEdit) {
            const parentPath = editPath.slice(0, -1);
            if (parentPath.length > 0) select.value = parentPath.join('/');
        }

        modal.style.display = 'flex';
    }

    // Modal save

    function handleModalSave() {
        const { getItemByPath, getData, showNotification, getMessage,
                saveAndRefresh, getCachedElement } = _deps;

        const modal      = document.getElementById('add-bookmark-modal');
        if (!modal) return;

        const titleInput = document.getElementById('modal-bookmark-title');
        const urlInput   = document.getElementById('modal-bookmark-url');

        const title = titleInput.value.trim();
        const url   = urlInput.value.trim();

        if (!title || !url) {
            showNotification(getMessage('titleRequired') || 'Title and URL are required', true);
            return;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            showNotification('Please enter a valid URL starting with http:// or https://', true);
            return;
        }

        const pathStr = document.getElementById('folder-select').value;
        let newPath   = [];
        if (pathStr !== '') {
            newPath = pathStr.split('/').map(Number).filter(Number.isInteger);
        }

        if (newPath.length > 0) {
            const target = getItemByPath(getData(), newPath);
            if (!target || target.type !== 'folder') {
                showNotification('Selected path is not a folder', true);
                return;
            }
        }

        if (_editingBookmarkPath) {
            updateBookmark(_editingBookmarkPath, title, url, newPath);
        } else {
            addNewBookmark(title, url, newPath);
        }

        saveAndRefresh().then(() => {
            modal.style.display = 'none';
            _editingBookmarkPath = null;
        });
    }

    // CRUD

    function addNewBookmark(title, url, path) {
        const data = _deps.getData();
        let target = data.folders;
        for (const idx of path) {
            if (target[idx]?.type === 'folder' && target[idx].children) {
                target = target[idx].children;
            } else {
                return;
            }
        }
        target.push({ type: 'bookmark', title, url, dateAdded: Date.now() });
    }

    function updateBookmark(oldPath, title, url, newPathRaw) {
        const { normalizePath, getParentByPath, getItemByPath, getData } = _deps;
        const data = getData();

        const newPath        = normalizePath(newPathRaw);
        const oldFolderPath  = normalizePath(oldPath.slice(0, -1));
        const sourceParent   = getParentByPath(data, oldFolderPath);
        const sourceIndex    = oldPath[oldPath.length - 1];
        const bookmark       = sourceParent[sourceIndex];
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

    function editBookmark(pathStr) {
        const path     = pathStr.split(',').map(Number);
        const bookmark = _deps.getItemByPath(_deps.getData(), path);
        if (bookmark) openAddBookmarkModal(bookmark.title, bookmark.url, path);
    }

    function deleteBookmark(pathStr) {
        const path = pathStr.split(',').map(Number);
        _deps.removeItemByPath(_deps.getData(), path);
        _deps.saveAndRefresh();
    }

    function copyBookmarkUrl(url) {
        const { getMessage, showNotification } = _deps;
        navigator.clipboard.writeText(url)
            .then(() => showNotification(getMessage('urlCopied') || 'URL copied to clipboard'))
            .catch(() => showNotification(getMessage('copyFailed') || 'Failed to copy URL', true));
    }

    // Folder add

    function addFolder() {
        const { getMessage, getData, saveAndRefresh } = _deps;
        const name = prompt(getMessage('folderName') || 'Folder name:');
        if (name?.trim()) {
            getData().folders.push({ type: 'folder', name: name.trim(), children: [], dateAdded: Date.now() });
            saveAndRefresh();
        }
    }

    // Rename / delete items

    function renameItem(pathArray) {
        const { getItemByPath, getData, getMessage, saveAndRefresh } = _deps;
        const target = getItemByPath(getData(), pathArray);
        if (!target) return;

        const currentName = target.type === 'folder' ? target.name : target.title;
        const newName     = prompt(getMessage('newName') || 'Enter new name:', currentName);

        if (newName?.trim()) {
            if (target.type === 'folder') target.name  = newName.trim();
            else                          target.title = newName.trim();
            saveAndRefresh();
        }
    }

    function deleteItem(pathArray) {
        const { getMessage, removeItemByPath, getData, saveAndRefresh } = _deps;
        if (confirm(getMessage('deleteConfirm') || 'Are you sure?')) {
            removeItemByPath(getData(), pathArray);
            saveAndRefresh();
        }
    }

    // Add current page

    async function addCurrentPage() {
        const { getMessage, showNotification } = _deps;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.url?.startsWith('http')) {
            showNotification(getMessage('cannotAddPage') || 'Cannot add this page', true);
            return;
        }
        openAddBookmarkModal(tab.title || 'No title', tab.url);
    }

    // In-modal "new folder" button

    function initNewFolderInModal() {
        const { getMessage, getData, saveAndRefresh, buildFolderOptions } = _deps;
        const btn = document.getElementById('new-folder-in-modal');
        if (!btn) return;

        btn.addEventListener('click', () => {
            const name = prompt(getMessage('folderName') || 'Folder name:');
            if (name?.trim()) {
                getData().folders.push({ type: 'folder', name: name.trim(), children: [], dateAdded: Date.now() });
                saveAndRefresh().then(() => {
                    const select = document.getElementById('folder-select');
                    select.innerHTML = '';
                    const rootOption = document.createElement('option');
                    rootOption.value       = '';
                    rootOption.textContent = getMessage('rootFolder') || 'Root folder';
                    select.appendChild(rootOption);
                    buildFolderOptions(getData().folders, select, '', 0);
                    select.value = (getData().folders.length - 1).toString();
                });
            }
        });
    }

    // Public API

    return {
        init(deps) { Object.assign(_deps, deps); },

        openAddBookmarkModal,
        handleModalSave,
        addNewBookmark,
        updateBookmark,
        editBookmark,
        deleteBookmark,
        copyBookmarkUrl,
        addFolder,
        renameItem,
        deleteItem,
        addCurrentPage,
        initNewFolderInModal
    };

})();

if (typeof window !== 'undefined') window.PopupBookmarks = PopupBookmarks;
if (typeof module !== 'undefined') module.exports = PopupBookmarks;

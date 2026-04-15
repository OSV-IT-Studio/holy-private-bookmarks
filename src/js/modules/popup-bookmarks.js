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
        const { getItemByPath, getData, getMessage, buildFolderTreePicker } = _deps;

        
        
		document.getElementById('add-bookmark-modal')?.remove();

        _editingBookmarkPath = editPath;
        const isEdit = editPath !== null;

        let titleVal = pageTitle;
        let urlVal   = pageUrl;
        if (isEdit) {
            const bookmark = getItemByPath(getData(), editPath);
            if (bookmark) { titleVal = bookmark.title; urlVal = bookmark.url; }
        }

        let initialPath = '';
        if (isEdit && editPath.length > 1) {
            const parentPath = editPath.slice(0, -1);
            if (parentPath.length > 0) initialPath = parentPath.join('/');
        }

        const modal = document.createElement('div');
        modal.id        = 'add-bookmark-modal';
        modal.className = 'hpb-modal';
        modal.innerHTML = `
            <div class="hpb-modal__dialog">
                <h2 class="hpb-modal__title"></h2>
                <div class="hpb-modal__body">
                    <p><strong>${getMessage('page')}</strong> <span id="modal-page-title"></span></p>
                    <label for="modal-bookmark-title">${getMessage('title')}</label>
                    <input type="text" id="modal-bookmark-title" placeholder="Bookmark title">
                    <label for="modal-bookmark-url">${getMessage('url')}</label>
                    <input type="text" id="modal-bookmark-url" placeholder="https://example.com">
                    <label for="folder-select">${getMessage('folder')}</label>
                    <div class="folder-select-container">
                        <div id="folder-select" class="folder-tree-picker"></div>
                        <button class="btn-secondary" id="new-folder-in-modal">${getMessage('new') || 'New'}</button>
                    </div>
                </div>
                <div class="hpb-modal__footer">
                    <button class="btn-secondary" id="modal-cancel">${getMessage('cancel')}</button>
                    <button class="btn-primary"   id="modal-save">${getMessage('save')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('h2').textContent = getMessage(isEdit ? 'editBookmark' : 'addBookmark');
        modal.querySelector('#modal-page-title').textContent =
            pageTitle.length > 60 ? pageTitle.slice(0, 60) + '...' : pageTitle;
        modal.querySelector('#modal-bookmark-title').value = titleVal;
        modal.querySelector('#modal-bookmark-url').value   = urlVal;

        buildFolderTreePicker(modal.querySelector('#folder-select'), getData().folders, initialPath, null);

        const { _onEsc, _closeAndRemove } = (_deps.createModalEscHandler || window.HolyShared.createModalEscHandler)(modal, () => {
            _editingBookmarkPath = null;
        });

        modal.querySelector('#modal-cancel').addEventListener('click', _closeAndRemove);
        modal.querySelector('#modal-save').addEventListener('click', () => handleModalSave(_closeAndRemove));
        modal.querySelector('#new-folder-in-modal').addEventListener('click', () => _handleNewFolderInModal(modal));

        
        modal.addEventListener('click', e => {
            if (e.target === modal && (Date.now() - (modal._hpbOpenedAt || 0) > 50)) _closeAndRemove();
        });

        document.addEventListener('keydown', _onEsc);
		
   
        requestAnimationFrame(() => {
            modal.classList.add('hpb-modal--open');
            modal._hpbOpenedAt = Date.now();
        });
    }

    // Modal save

    function handleModalSave(closeCallback) {
        const { getItemByPath, getData, showNotification, getMessage, saveAndRefresh } = _deps;

        const modal = document.getElementById('add-bookmark-modal');
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
        let newPath    = [];
        if (pathStr !== '') newPath = pathStr.split('/').map(Number).filter(Number.isInteger);

        if (newPath.length > 0) {
            const target = getItemByPath(getData(), newPath);
            if (!target || target.type !== 'folder') {
                showNotification('Selected path is not a folder', true);
                return;
            }
        }

        const isEdit = !!_editingBookmarkPath;
        if (isEdit) {
            updateBookmark(_editingBookmarkPath, title, url, newPath);
        } else {
            addNewBookmark(title, url, newPath);
        }

        saveAndRefresh().then(() => {
            if (typeof closeCallback === 'function') closeCallback();
            showNotification(getMessage(isEdit ? 'bookmarkUpdated' : 'bookmarkAdded'));
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

        const newPath       = normalizePath(newPathRaw);
        const oldFolderPath = normalizePath(oldPath.slice(0, -1));
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

    function editBookmark(pathStr) {
        const path     = pathStr.split(',').map(Number);
        const bookmark = _deps.getItemByPath(_deps.getData(), path);
        if (bookmark) openAddBookmarkModal(bookmark.title, bookmark.url, path);
    }

    
    async function deleteBookmark(pathStr) {
    const path = pathStr.split(',').map(Number);
    const item = _deps.getItemByPath(_deps.getData(), path);
    const name = item?.title || item?.name || '';
    if (await _deps.showConfirm({ title: `${_deps.getMessage('deleteConfirm')} "${name}"?` })) {
        _deps.removeItemByPath(_deps.getData(), path);
        _deps.showNotification(_deps.getMessage('bookmarkDeleted'));
        _deps.saveAndRefresh();
    }
}

    function copyBookmarkUrl(url) {
        const { getMessage, showNotification } = _deps;
        navigator.clipboard.writeText(url)
            .then(() => showNotification(getMessage('urlCopied')))
            .catch(() => showNotification(getMessage('copyFailed'), true));
    }

    // Folder add

    async function addFolder() {
		const { getMessage, getData, saveAndRefresh, generateFolderUid, showNotification } = _deps;
        const name = await _deps.showPrompt({
            title:        getMessage('newFolder'),
            placeholder:  getMessage('folderName'),
            confirmLabel: getMessage('save'),
        });
        if (name?.trim()) {
            const uid = generateFolderUid
                ? generateFolderUid()
                : ('f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
            getData().folders.push({ type: 'folder', name: name.trim(), children: [], dateAdded: Date.now(), uid });
            showNotification(getMessage('folderCreated'));
            saveAndRefresh();
        }
    }

    // Rename / delete items

    async function renameItem(pathArray) {
    const { getItemByPath, getData, getMessage, saveAndRefresh, showNotification } = _deps;
        const target = getItemByPath(getData(), pathArray);
        if (!target) return;

        const currentName = target.type === 'folder' ? target.name : target.title;
        const newName = await _deps.showPrompt({
            title:        getMessage('renameFolder'),
            defaultValue: currentName,
            confirmLabel: getMessage('save'),
        });

        if (newName?.trim()) {
            const pathStr = pathArray.join(',');

            if (target.type === 'folder') {
    target.name = newName.trim();
    
    const el = document.querySelector(`#tree .tree-item[data-path="${pathStr}"]`);
    const nameEl = el?.querySelector('.folder-name');
    if (nameEl) {
        nameEl.textContent = newName.trim();
        _deps.saveChanges();
        _deps.virtualScrollCache?.clear?.();
        showNotification(getMessage('folderRenamed'));
        return;
    }
} else {
    target.title = newName.trim();
    
    const el = document.querySelector(`#tree .tree-item[data-path="${pathStr}"]`);
    const titleEl = el?.querySelector('.bookmark-title');
    if (titleEl) {
        titleEl.textContent = newName.trim();
        _deps.saveChanges();
        _deps.virtualScrollCache?.clear?.();
        showNotification(getMessage('bookmarkUpdated'));
        return;
    }
}

showNotification(getMessage(target.type === 'folder' ? 'folderRenamed' : 'bookmarkUpdated'));
saveAndRefresh();
        }
    }

    async function deleteItem(pathArray) {
    const { getMessage, removeItemByPath, getData, saveAndRefresh,
            getItemByPath, countItemsInFolder, countFoldersInFolder } = _deps;

    const item = getItemByPath(getData(), pathArray);
    const name = item?.name || item?.title || '';

    let title, warning = '';

    if (item?.type === 'folder') {
        title = (getMessage('deleteFolderConfirm'))
            .replace('{0}', name)
            .replace('{name}', name);
        const bookmarkCount = countItemsInFolder(item);
        const folderCount   = countFoldersInFolder(item);
        if (bookmarkCount > 0 || folderCount > 0) {
            warning = getMessage('deleteFolderWarning');
        }
    } else {
        title = (getMessage('deleteConfirm'))
            .replace('{0}', name)
            .replace('{name}', name);
    }

    if (!await _deps.showConfirm({ title, warning })) return;
	removeItemByPath(getData(), pathArray);
	const { showNotification } = _deps;
	showNotification(getMessage(item?.type === 'folder' ? 'folderDeleted' : 'bookmarkDeleted'));
	saveAndRefresh();
}

    // Add current page

    async function addCurrentPage() {
        const { getMessage, showNotification } = _deps;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.url?.startsWith('http')) {
            showNotification(getMessage('cannotAddPage'), true);
            return;
        }
        openAddBookmarkModal(tab.title || 'No title', tab.url);
    }

    // In-modal "new folder" button 

    async function _handleNewFolderInModal(modal) {
        const { getMessage, getData, saveAndRefresh, buildFolderTreePicker, generateFolderUid } = _deps;
        const name = await _deps.showPrompt({
            title:        getMessage('newFolder'),
            placeholder:  getMessage('folderName'),
            confirmLabel: getMessage('save'),
        });
        if (!name?.trim()) return;

        const uid = generateFolderUid
            ? generateFolderUid()
            : ('f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
        getData().folders.push({ type: 'folder', name: name.trim(), children: [], dateAdded: Date.now(), uid });

        saveAndRefresh().then(() => {
            const pickerContainer = modal?.querySelector('#folder-select');
            if (pickerContainer) {
                const newIdx = (getData().folders.length - 1).toString();
                buildFolderTreePicker(pickerContainer, getData().folders, newIdx, null);
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
        addCurrentPage
    };

})();

if (typeof window !== 'undefined') window.PopupBookmarks = PopupBookmarks;
if (typeof module !== 'undefined') module.exports = PopupBookmarks;
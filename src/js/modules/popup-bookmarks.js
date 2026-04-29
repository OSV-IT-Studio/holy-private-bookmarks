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
    let _editingBookmarkUid = null;

    function _findFolderContainingArray(data, targetArray) {
        function search(items) {
            for (const item of items) {
                if (item.type === 'folder') {
                    if (item.children === targetArray) return item;
                    if (item.children) {
                        const found = search(item.children);
                        if (found) return found;
                    }
                }
            }
            return null;
        }
        return search(data.folders);
    }
	
    // Modal open

    function openAddBookmarkModal(pageTitle, pageUrl, editUid = null) {
        const { getAnyItemByUid, getData, getMessage, buildFolderTreePicker } = _deps;

        document.getElementById('add-bookmark-modal')?.remove();

        _editingBookmarkUid = editUid;
        const isEdit = editUid !== null;

        let titleVal = pageTitle;
        let urlVal   = pageUrl;
        let initialFolderUid = '';
        if (isEdit) {
            const bookmark = getAnyItemByUid(getData(), editUid);
            if (bookmark) { titleVal = bookmark.title; urlVal = bookmark.url; }
            const parentArr = _deps.getParentArrayForItemUid(getData(), editUid);
            if (parentArr && parentArr !== getData().folders) {
                const parentFolder = _findFolderContainingArray(getData(), parentArr);
                if (parentFolder?.uid) initialFolderUid = parentFolder.uid;
            }
        }

        const modal = document.createElement('div');
        modal.id        = 'add-bookmark-modal';
        modal.className = 'hpb-modal';
        modal.innerHTML = `
            <div class="hpb-modal__dialog">
                <h2 class="hpb-modal__title"></h2>
                <div class="hpb-modal__body">
				<div class="hpb-modal__body_bookmark">
                    <label for="modal-bookmark-title">${getMessage('title')}</label>
                    <input type="text" id="modal-bookmark-title" placeholder="Bookmark title">
					</div>
					<div class="hpb-modal__body_bookmark">
                    <label for="modal-bookmark-url">${getMessage('url')}</label>
                    <input type="text" id="modal-bookmark-url" placeholder="https://example.com">
					</div>
					<div class="hpb-modal__body_bookmark">
                    <label for="folder-select">${getMessage('folder')}</label>
                    <div class="folder-select-container w-100">
                        <div id="folder-select" class="folder-tree-picker"></div>
                        <button class="btn-secondary" id="new-folder-in-modal">${getMessage('new') || 'New'}</button>
                    </div>
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
        const _safeTitle = (pageTitle != null && typeof pageTitle === 'string') ? pageTitle : '';
        modal.querySelector('#modal-bookmark-title').value = titleVal;
        modal.querySelector('#modal-bookmark-url').value   = urlVal;

        buildFolderTreePicker(modal.querySelector('#folder-select'), getData().folders, initialFolderUid, null);

        const { _onEsc, _closeAndRemove } = (_deps.createModalEscHandler || window.HolyShared.createModalEscHandler)(modal, () => {
            _editingBookmarkUid = null;
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
        const { getItemByUid, getData, showNotification, getMessage, saveAndRefresh } = _deps;

        const modal = document.getElementById('add-bookmark-modal');
        if (!modal) return;

        const title = modal.querySelector('#modal-bookmark-title').value.trim();
        const url   = modal.querySelector('#modal-bookmark-url').value.trim();

        if (!title || !url) {
            showNotification(getMessage('titleRequired'), true);
            return;
        }
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            showNotification(getMessage('invalidUrlProtocol'), true);
            return;
        }

        const pickerEl  = modal.querySelector('#folder-select');
        const folderUid = pickerEl._getPickerValue ? pickerEl._getPickerValue() : '';

        if (folderUid) {
            const targetFolder = getItemByUid(getData(), folderUid);
            if (!targetFolder) {
                showNotification('Selected folder no longer exists', true);
                return;
            }
        }

        const isEdit  = !!_editingBookmarkUid;
        const editUid = _editingBookmarkUid;

        let oldFolderUid = null;

        if (isEdit) {
            const bookmark = _deps.getAnyItemByUid(getData(), editUid);
            if (!bookmark) {
                showNotification('Bookmark not found', true);
                return;
            }
            const parentArr = _deps.getParentArrayForItemUid(getData(), editUid);
            if (parentArr && parentArr !== getData().folders) {
                const parentFolder = _findFolderContainingArray(getData(), parentArr);
                oldFolderUid = parentFolder?.uid || null;
            }
        }

        if (isEdit) {
            updateBookmark(editUid, title, url, folderUid || null);
        } else {
            addNewBookmark(title, url, [], folderUid || null);
        }

        const domUpdated = isEdit
            ? _domUpdateEditBookmark(editUid, title, url, oldFolderUid, folderUid || null)
            : _domInsertBookmark(title, url, [], folderUid || null);

        if (domUpdated) {
            _deps.virtualScrollCache?.clear?.();
            _deps.saveChanges();
            if (typeof closeCallback === 'function') closeCallback();
            showNotification(getMessage(isEdit ? 'bookmarkUpdated' : 'bookmarkAdded'));
            _editingBookmarkUid = null;
        } else {
            saveAndRefresh().then(() => {
                if (typeof closeCallback === 'function') closeCallback();
                showNotification(getMessage(isEdit ? 'bookmarkUpdated' : 'bookmarkAdded'));
                _editingBookmarkUid = null;
            });
        }
    }

    // CRUD

    function addNewBookmark(title, url, path, folderUid) {
        const { getData, getItemByUid } = _deps;
        const data = getData();
        const uid  = _deps.generateFolderUid();
        const bookmark = { type: 'bookmark', title, url, dateAdded: Date.now(), uid };

        if (folderUid) {
            const folder = getItemByUid(data, folderUid);
            if (folder?.children) { folder.children.push(bookmark); return; }
        }
        if (path.length === 0) {
            data.folders.push(bookmark);
            return;
        }
        let target = data.folders;
        for (const idx of path) {
            if (target[idx]?.type === 'folder' && target[idx].children) {
                target = target[idx].children;
            } else { return; }
        }
        target.push(bookmark);
    }

    function updateBookmark(editUid, title, url, newFolderUid) {
        const { getData, getAnyItemByUid, getItemByUid, getParentArrayForItemUid } = _deps;
        const data = getData();

        const bookmark = getAnyItemByUid(data, editUid);
        if (!bookmark) return;

        bookmark.title = title;
        bookmark.url   = url;

        const sourceArr = getParentArrayForItemUid(data, editUid);
        if (!sourceArr) return;

        let targetArr;
        if (!newFolderUid) {
            targetArr = data.folders;
        } else {
            const folder = getItemByUid(data, newFolderUid);
            if (!folder || folder.type !== 'folder') return;
            if (!Array.isArray(folder.children)) folder.children = [];
            targetArr = folder.children;
        }

        if (targetArr === sourceArr) return;

        const idx = sourceArr.indexOf(bookmark);
        if (idx !== -1) sourceArr.splice(idx, 1);
        targetArr.push(bookmark);
    }

    function editBookmark(uid) {
        const bookmark = _deps.getAnyItemByUid(_deps.getData(), uid);
        if (bookmark) openAddBookmarkModal(bookmark.title, bookmark.url, uid);
    }

    function _resyncFolderSentinel(container, parentUid) {
        if (!container || !parentUid) return;
        const freshFolder = _deps.getItemByUid(_deps.getData(), parentUid);
        if (!freshFolder) return;
        const folderEl = document.querySelector(`#tree .tree-item[data-folder-uid="${parentUid}"]`);
        if (!folderEl) return;
        const actualPath = folderEl.dataset.path
            ? folderEl.dataset.path.split(',').map(Number)
            : [];
        const visibleCount = container.querySelectorAll(':scope > .tree-item').length;
        if (visibleCount < freshFolder.children.length) {
            window.PopupTree?.updateLoadMoreButton?.(container, freshFolder, actualPath, visibleCount);
        } else {
            window.PopupTree?.removeLoadMoreButton?.(container);
        }
    }

    function _reindexAfterRemoval(container, parentUid) {
        if (!container || !window.DragDropManager?.reindexAfterRemoval) return;
        const basePath = parentUid
            ? (() => {
                const pEl = document.querySelector(`#tree .tree-item[data-folder-uid="${parentUid}"]`);
                return pEl?.dataset.path ? pEl.dataset.path.split(',').map(Number) : [];
            })()
            : [];
        window.DragDropManager.reindexAfterRemoval(container, basePath);
    }

    async function deleteBookmark(uid) {
        const data = _deps.getData();
        const item = _deps.getAnyItemByUid(data, uid);
        const name = item?.title || item?.name || '';
        if (!await _deps.showConfirm({ title: `${_deps.getMessage('deleteConfirm')} "${name}"?` })) return;

        const el = uid
            ? document.querySelector(`#tree .tree-item[data-item-uid="${uid}"]`)
            : null;

        const parentArr    = _deps.getParentArrayForItemUid(data, uid);
        const parentFolder = parentArr && parentArr !== data.folders
            ? _findFolderContainingArray(data, parentArr)
            : null;
        const parentUid = parentFolder?.uid || null;

        if (parentArr) parentArr.splice(parentArr.indexOf(item), 1);

        _deps.showNotification(_deps.getMessage('bookmarkDeleted'));

        if (el) {
            const container = el.parentElement;
            el.remove();
            _reindexAfterRemoval(container, parentUid);
            _resyncFolderSentinel(container, parentUid);
            _updateAncestorBadges(parentUid);
            _updateFolderBadgeByUid(parentUid);
            _deps.saveChanges();
            _deps.virtualScrollCache?.clear?.();
            if (_deps.getData().folders.length === 0) {
                if (window.PopupTree?.renderEmptyState) {
                    const tree = document.getElementById('tree');
                    if (tree) window.PopupTree.renderEmptyState(tree);
                }
            }
        } else {
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
        const { getMessage, getData, saveChanges, generateFolderUid, showNotification } = _deps;
        const name = await _deps.showPrompt({
            title:        getMessage('newFolder'),
            placeholder:  getMessage('folderName'),
            confirmLabel: getMessage('save'),
        });
        if (name?.trim()) {
            const uid = generateFolderUid
                ? generateFolderUid()
                : ('f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
            const newFolder = { type: 'folder', name: name.trim(), children: [], dateAdded: Date.now(), uid };
            getData().folders.push(newFolder);
            showNotification(getMessage('folderCreated'));

            const idx = getData().folders.length - 1;
            const tree = document.getElementById('tree');
            if (tree && window.PopupTree?.createFolderElement) {
                const el = window.PopupTree.createFolderElement(newFolder, [idx]);
                tree.appendChild(el);
                _deps.virtualScrollCache?.clear?.();
                window.DragDropManager?.refreshDragItems?.();
                saveChanges();
            } else {
                _deps.saveAndRefresh();
            }
        }
    }

    // Rename / delete items

    async function renameItem(uid) {
        const { getData, getMessage, saveChanges, showNotification } = _deps;
        const target = _deps.getAnyItemByUid(getData(), uid);
        if (!target) return;

        const currentName = target.type === 'folder' ? target.name : target.title;
        const newName = await _deps.showPrompt({
            title:        getMessage('renameFolder'),
            defaultValue: currentName,
            confirmLabel: getMessage('save'),
        });

        if (newName?.trim()) {
            if (target.type === 'folder') {
                target.name = newName.trim();
                const el = document.querySelector(`#tree .tree-item[data-folder-uid="${uid}"]`);
                const nameEl = el?.querySelector('.folder-name');
                if (nameEl) nameEl.textContent = newName.trim();
            } else {
                target.title = newName.trim();
                const el = document.querySelector(`#tree .tree-item[data-item-uid="${uid}"]`);
                const titleEl = el?.querySelector('.bookmark-title');
                if (titleEl) titleEl.textContent = newName.trim();
            }

            _deps.virtualScrollCache?.clear?.();
            saveChanges();
            showNotification(getMessage(target.type === 'folder' ? 'folderRenamed' : 'bookmarkUpdated'));
        }
    }

    async function deleteItem(uid) {
        const { getMessage, getData, saveAndRefresh, countItemsInFolder, countFoldersInFolder } = _deps;

        const data = getData();
        const item = _deps.getAnyItemByUid(data, uid);
        const name = item?.name || item?.title || '';

        let title, warning = '';
        if (item?.type === 'folder') {
            title = getMessage('deleteFolderConfirm').replace('{0}', name).replace('{name}', name);
            const bookmarkCount = countItemsInFolder(item);
            const folderCount   = countFoldersInFolder(item);
            if (bookmarkCount > 0 || folderCount > 0) warning = getMessage('deleteFolderWarning');
        } else {
            title = getMessage('deleteConfirm').replace('{0}', name).replace('{name}', name);
        }

        if (!await _deps.showConfirm({ title, warning })) return;

        const parentArr    = _deps.getParentArrayForItemUid(data, uid);
        const parentFolder = parentArr && parentArr !== data.folders
            ? _findFolderContainingArray(data, parentArr)
            : null;
        const parentUid = parentFolder?.uid || null;

        if (parentArr) parentArr.splice(parentArr.indexOf(item), 1);

        _deps.showNotification(getMessage(item?.type === 'folder' ? 'folderDeleted' : 'bookmarkDeleted'));

        const el = item?.type === 'folder'
            ? document.querySelector(`#tree .tree-item[data-folder-uid="${uid}"]`)
            : document.querySelector(`#tree .tree-item[data-item-uid="${uid}"]`);

        if (el) {
            const container = el.parentElement;
            el.remove();
            _reindexAfterRemoval(container, parentUid);
            _resyncFolderSentinel(container, parentUid);
            _updateAncestorBadges(parentUid);
            _updateFolderBadgeByUid(parentUid);
            _deps.saveChanges();
            _deps.virtualScrollCache?.clear?.();
            if (_deps.getData().folders.length === 0) {
                if (window.PopupTree?.renderEmptyState) {
                    const tree = document.getElementById('tree');
                    if (tree) window.PopupTree.renderEmptyState(tree);
                }
            }
        } else {
            saveAndRefresh();
        }
    }


    async function addCurrentPage() {
        const { getMessage, showNotification } = _deps;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.url?.startsWith('http')) {
            showNotification(getMessage('cannotAddPage'), true);
            return;
        }
        openAddBookmarkModal(tab.title || 'No title', tab.url);
    }


    async function _handleNewFolderInModal(modal) {
        const { getMessage, getData, buildFolderTreePicker, generateFolderUid } = _deps;
        const name = await _deps.showPrompt({
            title:        getMessage('newFolder'),
            placeholder:  getMessage('folderName'),
            confirmLabel: getMessage('save'),
        });
        if (!name?.trim()) return;

        const uid = generateFolderUid();
        getData().folders.push({ type: 'folder', name: name.trim(), children: [], dateAdded: Date.now(), uid });

        _deps.virtualScrollCache?.clear?.();
        _deps.saveChanges();

        if (window.PopupTree?.createFolderElement) {
            const idx  = getData().folders.length - 1;
            const tree = document.getElementById('tree');
            if (tree) {
                const emptyMsg = tree.querySelector('.empty-tree-message');
                if (emptyMsg) emptyMsg.remove();
                const el = window.PopupTree.createFolderElement(getData().folders[idx], [idx]);
                tree.appendChild(el);
                window.DragDropManager?.refreshDragItems?.();
            }
        }

        const pickerContainer = modal?.querySelector('#folder-select');
        if (pickerContainer) {
            buildFolderTreePicker(pickerContainer, getData().folders, uid, null);
        }
    }

    function _domInsertBookmark(title, url, folderPath, folderUid) {
        const { getData, getItemByUid } = _deps;
        const data = getData();
        const tree = document.getElementById('tree');
        if (!tree || !window.PopupTree?.createBookmarkElement) return false;

        let targetContainer, itemPath;

        if (!folderUid && folderPath.length === 0) {
            targetContainer = tree;
            itemPath = [data.folders.length - 1];
            const emptyMsg = tree.querySelector('.empty-tree-message');
            if (emptyMsg) emptyMsg.remove();
        } else {
            const folderEl = folderUid
                ? document.querySelector(`#tree .tree-item[data-folder-uid="${folderUid}"]`)
                : document.querySelector(`#tree .tree-item[data-path="${folderPath.join(',')}"]`);
            if (!folderEl) return false;
            const sub = folderEl.querySelector('.subitems');
            if (!sub || sub.classList.contains('collapsed')) return false;
            const scrollContainer = sub.querySelector('.folder-virtual-scroll');
            if (!scrollContainer) return false;
            targetContainer = scrollContainer;

            const folder = folderUid
                ? getItemByUid(data, folderUid)
                : _deps.getItemByPath(data, folderPath);
            if (!folder) return false;

            const actualFolderPath = folderEl.dataset.path
                ? folderEl.dataset.path.split(',').map(Number)
                : folderPath;
            itemPath = [...actualFolderPath, folder.children.length - 1];
            _updateAncestorBadges(folderUid || null);
            _updateFolderBadgeByUid(folderUid);
            const emptyMsg = scrollContainer.querySelector(':scope > .empty-folder-message');
            if (emptyMsg) emptyMsg.remove();
        }

        const actualItem = (!folderUid && folderPath.length === 0)
            ? data.folders[itemPath[0]]
            : (() => {
                const f = folderUid
                    ? getItemByUid(data, folderUid)
                    : _deps.getItemByPath(data, folderPath);
                return f?.children?.[f.children.length - 1];
            })();

        if (!actualItem) return false;

        const el = window.PopupTree.createBookmarkElement(actualItem, itemPath);
        const loadMoreBtn = targetContainer.querySelector('.load-more-btn');
        if (loadMoreBtn) targetContainer.insertBefore(el, loadMoreBtn);
        else             targetContainer.appendChild(el);
        window.DragDropManager?.refreshDragItems?.();
        return true;
    }


    function _domUpdateEditBookmark(editUid, title, url, oldFolderUid, newFolderUid) {
        const { getData, getDomainFromUrl, getItemByUid } = _deps;
        const data = getData();

        const sameFolder = oldFolderUid === (newFolderUid || null)
            || (!oldFolderUid && !newFolderUid);

        const bookmarkEl = document.querySelector(`#tree .tree-item[data-item-uid="${editUid}"]`);

        if (sameFolder) {
            if (!bookmarkEl) return false;
            const titleEl  = bookmarkEl.querySelector('.bookmark-title');
            const domainEl = bookmarkEl.querySelector('.item-domain');
            const linkEl   = bookmarkEl.querySelector('.bookmark-link');
            if (titleEl)  titleEl.textContent  = title;
            if (domainEl) domainEl.textContent = getDomainFromUrl ? getDomainFromUrl(url) : '';
            if (linkEl)   linkEl.dataset.url   = url;
            return true;
        }

        if (bookmarkEl) {
            const container = bookmarkEl.parentElement;
            bookmarkEl.remove();
            if (container) {
                const basePath = oldFolderUid
                    ? (() => {
                        const pEl = document.querySelector(`#tree .tree-item[data-folder-uid="${oldFolderUid}"]`);
                        return pEl?.dataset.path ? pEl.dataset.path.split(',').map(Number) : [];
                    })()
                    : [];
                window.DragDropManager?.reindexAfterRemoval(container, basePath);
                _resyncFolderSentinel(container, oldFolderUid);
            }
            _updateAncestorBadges(oldFolderUid);
            if (oldFolderUid) _updateFolderBadgeByUid(oldFolderUid);
        }

        if (!newFolderUid) {
            const tree = document.getElementById('tree');
            if (!tree || !window.PopupTree?.createBookmarkElement) return false;
            const bookmark = _deps.getAnyItemByUid(data, editUid);
            if (!bookmark) return false;
            const idx   = data.folders.indexOf(bookmark);
            if (idx === -1) return false;
            const newEl = window.PopupTree.createBookmarkElement(bookmark, [idx]);
            tree.appendChild(newEl);
            window.DragDropManager?.refreshDragItems?.();
            return true;
        }

        const folderEl = document.querySelector(`#tree .tree-item[data-folder-uid="${newFolderUid}"]`);
        if (!folderEl) return !!bookmarkEl;

        const folder = getItemByUid(data, newFolderUid);
        if (!folder) return !!bookmarkEl;

        _updateFolderBadgeByUid(newFolderUid);
        _updateAncestorBadges(newFolderUid);

        const sub = folderEl.querySelector('.subitems');
        if (!sub || sub.classList.contains('collapsed')) return !!bookmarkEl;

        const scrollContainer = sub.querySelector('.folder-virtual-scroll');
        if (!scrollContainer || !window.PopupTree?.createBookmarkElement) return !!bookmarkEl;

        const bookmark = _deps.getAnyItemByUid(data, editUid);
        if (!bookmark) return !!bookmarkEl;

        const newIdx = folder.children.indexOf(bookmark);
        if (newIdx === -1) return !!bookmarkEl;

        const actualFolderPath = folderEl.dataset.path
            ? folderEl.dataset.path.split(',').map(Number)
            : [];

        const emptyMsg = scrollContainer.querySelector(':scope > .empty-folder-message');
        if (emptyMsg) emptyMsg.remove();

        const newEl = window.PopupTree.createBookmarkElement(bookmark, [...actualFolderPath, newIdx]);
        const loadMoreBtn = scrollContainer.querySelector('.load-more-btn');
        if (loadMoreBtn) scrollContainer.insertBefore(newEl, loadMoreBtn);
        else             scrollContainer.appendChild(newEl);

        _resyncFolderSentinel(scrollContainer, newFolderUid);
        window.DragDropManager?.refreshDragItems?.();
        return true;
    }

    function _findParentFolder(data, childArr) {
        function search(items) {
            for (const item of items) {
                if (item.type === 'folder') {
                    if (item.children === childArr) return item;
                    if (item.children) {
                        const found = search(item.children);
                        if (found) return found;
                    }
                }
            }
            return null;
        }
        return search(data.folders);
    }

    function _updateAncestorBadges(startUidOrPath) {
        const { getItemByUid, getAnyItemByUid, getParentArrayForItemUid, getData, countItemsInFolder } = _deps;
        const data = getData();

        let currentUid = null;

        if (typeof startUidOrPath === 'string') {
            currentUid = startUidOrPath;
        } else if (Array.isArray(startUidOrPath) && startUidOrPath.length > 0) {
            const el = document.querySelector(`#tree .tree-item[data-path="${startUidOrPath.join(',')}"]`);
            currentUid = el?.dataset.folderUid || el?.dataset.itemUid || null;
            if (!currentUid) return;
        } else {
            return;
        }

        const visited = new Set();
        while (currentUid) {
            if (visited.has(currentUid)) break;
            visited.add(currentUid);

            const parentArr = getParentArrayForItemUid(data, currentUid);
            if (!parentArr || parentArr === data.folders) break;

            const parentFolder = _findParentFolder(data, parentArr);
            if (!parentFolder?.uid) break;

            const folderEl = document.querySelector(`#tree .tree-item[data-folder-uid="${parentFolder.uid}"]`);
            if (folderEl) {
                const badge = folderEl.querySelector(':scope > .item-header .folder-badge');
                if (badge) badge.textContent = countItemsInFolder(parentFolder);
            }

            currentUid = parentFolder.uid;
        }
    }

    function _updateFolderBadgeByUid(uid) {
        const { getItemByUid, getData, countItemsInFolder } = _deps;
        if (!uid) return;
        const folderEl = document.querySelector(`#tree .tree-item[data-folder-uid="${uid}"]`);
        if (!folderEl) return;
        const folder = getItemByUid(getData(), uid);
        if (!folder || folder.type !== 'folder') return;
        const badge = folderEl.querySelector(':scope > .item-header .folder-badge');
        if (badge) badge.textContent = countItemsInFolder(folder);
        const sc = folderEl.querySelector('.subitems:not(.collapsed) .folder-virtual-scroll');
        if (!sc) return;
        const isEmpty = folder.children.length === 0;
        const existingMsg = sc.querySelector(':scope > .empty-folder-message');
        if (isEmpty && !existingMsg) {
            const msg = document.createElement('div');
            msg.className = 'empty-folder-message';
            msg.setAttribute('data-i18n', 'emptyFolder');
            msg.textContent = _deps.getMessage('emptyFolder');
            sc.appendChild(msg);
        } else if (!isEmpty && existingMsg) {
            existingMsg.remove();
        }
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
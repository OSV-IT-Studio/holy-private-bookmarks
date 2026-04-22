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

// MODULE: manager-drag-drop.js

const ManagerDragDrop = (function () {

    const GHOST_X = 20;
    const GHOST_Y = 20;

    //  State 

    let _deps        = {};
    let _dragged     = null;
    let _draggedPath = null;
    let _draggedEl   = null;
    let _isFolder    = false;
    let _ghostEl     = null;
    let _escHandler  = null;

    let _rafPending     = false;
    let _latestDragOver = null;

    //  Public API 

    function init(deps) {
        Object.assign(_deps, deps);
        _attachGridListeners();
        _attachSidebarListeners();
    }

    function refreshDraggable() {
        document.querySelectorAll('#bookmarks-grid .tree-item').forEach(el => {
            el.setAttribute('draggable', 'true');
        });
    }

    //  Grid listeners (delegated) 

    function _attachGridListeners() {
        const grid = document.getElementById('bookmarks-grid');
        if (!grid) return;

        grid.addEventListener('dragstart',  _onGridDragStart);
        grid.addEventListener('dragend',    _onGridDragEnd);
        grid.addEventListener('dragover',   _onGridDragOver);
        grid.addEventListener('dragleave',  _onGridDragLeave);
        grid.addEventListener('drop',       _onGridDrop);
    }

    //  Sidebar listeners 

    function _attachSidebarListeners() {
        const tree = document.querySelector('.sidebar .folder-tree');
        if (tree) {
            tree.addEventListener('dragover',  _onSidebarDragOver);
            tree.addEventListener('dragleave', _onSidebarDragLeave);
            tree.addEventListener('drop',      _onSidebarDrop);
        }

        const allItem = document.querySelector('.all-bookmarks');
        if (allItem) {
            allItem.addEventListener('dragover',  _onSidebarDragOver);
            allItem.addEventListener('dragleave', _onSidebarDragLeave);
            allItem.addEventListener('drop',      _onSidebarDrop);
        }
    }

    //  Drag start / end 

    function _onGridDragStart(e) {
        const el = e.target.closest('.tree-item');
        if (!el) { e.preventDefault(); return; }

        const index = parseInt(el.dataset.index, 10);
        if (isNaN(index)) { e.preventDefault(); return; }

        const allItems = ManagerBookmarks.getBookmarksForFolder(_deps.getCurrentFolderId());
        const item     = allItems[index];
        if (!item) { e.preventDefault(); return; }

        _dragged     = item;
        _draggedPath = _deps.findItemPath(_deps.getData(), item);
        _draggedEl   = el;
        _isFolder    = item.type === 'folder';

        if (!_draggedPath) { e.preventDefault(); return; }

        el.classList.add('dragging');

        if (typeof QuickActions !== 'undefined') QuickActions.closeAll();

        _ghostEl = window.HolyShared.dragCreateGhost(el, e.clientX, e.clientY, GHOST_X, GHOST_Y);

        // Invisible drag image
        const blank = Object.assign(document.createElement('div'), { style: 'opacity:0' });
        document.body.appendChild(blank);
        e.dataTransfer.setDragImage(blank, 0, 0);
        setTimeout(() => blank.remove(), 0);

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({
            action: 'manager-drag',
            path:   _draggedPath,
        }));

        const _onMove = ev => window.HolyShared.dragMoveGhost(_ghostEl, ev.clientX, ev.clientY, GHOST_X, GHOST_Y);
        const _onEnd  = () => {
            document.removeEventListener('dragover', _onMove);
            document.removeEventListener('dragend',  _onEnd);
        };
        document.addEventListener('dragover', _onMove);
        document.addEventListener('dragend',  _onEnd);

        _escHandler = window.HolyShared.dragHandleEscape(
            () => !!_dragged,
            () => {
                if (_draggedEl) _draggedEl.classList.remove('dragging');
                if (_ghostEl)   { _ghostEl.remove(); _ghostEl = null; }
                _clearGridIndicators();
                _clearSidebarIndicators();
                _dragged     = null;
                _draggedPath = null;
                _draggedEl   = null;
                _isFolder    = false;
                _escHandler  = null;
            }
        );
    }

    function _onGridDragEnd() {
        if (_draggedEl) _draggedEl.classList.remove('dragging');
        if (_ghostEl)   { _ghostEl.remove(); _ghostEl = null; }
        if (_escHandler){ document.removeEventListener('keydown', _escHandler); _escHandler = null; }

        _clearGridIndicators();
        _clearSidebarIndicators();

        _dragged     = null;
        _draggedPath = null;
        _draggedEl   = null;
        _isFolder    = false;
        _rafPending     = false;
        _latestDragOver = null;
    }

    //  Grid dragover (rAF-throttled) 

    function _onGridDragOver(e) {
        if (!_dragged) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        _latestDragOver = e;
        if (!_rafPending) {
            _rafPending = true;
            requestAnimationFrame(_processGridDragOver);
        }
    }

    function _processGridDragOver() {
        _rafPending = false;
        const e = _latestDragOver;
        if (!e || !_dragged) return;

        const target = e.target.closest('.tree-item');
        if (!target || target === _draggedEl) {
            _clearGridIndicators();
            return;
        }

        _clearGridIndicators();

        const rect           = target.getBoundingClientRect();
        const relY           = e.clientY - rect.top;
        const zone           = rect.height * 0.25;
        const isTargetFolder = target.classList.contains('tree-item--folder');

        if (isTargetFolder && relY > zone && relY < rect.height - zone) {
            target.classList.add('drop-into-folder');
        } else {
            target.classList.add(relY <= rect.height / 2 ? 'drop-above' : 'drop-below');
        }
    }

    function _onGridDragLeave(e) {
        const target = e.target.closest('.tree-item');
        if (target) target.classList.remove('drop-above', 'drop-below', 'drop-into-folder');
    }

    //  Grid drop 

    function _onGridDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!_dragged || !_draggedPath) return;

        _clearGridIndicators();

        const target = e.target.closest('.tree-item');
        if (!target || target === _draggedEl) return;

        const rect           = target.getBoundingClientRect();
        const relY           = e.clientY - rect.top;
        const zone           = rect.height * 0.25;
        const isTargetFolder = target.classList.contains('tree-item--folder');
        const dropInto       = isTargetFolder && relY > zone && relY < rect.height - zone;

        const targetIndex = parseInt(target.dataset.index, 10);
        const allItems    = ManagerBookmarks.getBookmarksForFolder(_deps.getCurrentFolderId());
        const targetItem  = allItems[targetIndex];
        if (!targetItem || targetItem === _dragged) return;

        const targetPath = _deps.findItemPath(_deps.getData(), targetItem);
        if (!targetPath) return;

        if (dropInto) {
            if (!_validateMove(_draggedPath, targetPath)) return;
            _applyMove(_draggedPath, targetPath, true, false);
        } else {
            const isAbove = relY <= rect.height / 2;
            _applyMove(_draggedPath, targetPath, false, isAbove);
        }
    }

    //  Sidebar dragover / drop 

    function _onSidebarDragOver(e) {
        if (!_dragged) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const folderEl = e.target.closest('.folder-item');
        if (!folderEl) return;
        if (_draggedEl && folderEl.contains(_draggedEl)) return;

        _clearSidebarIndicators();
        folderEl.classList.add('drop-target');
    }

    function _onSidebarDragLeave(e) {
        const folderEl = e.target.closest('.folder-item');
        if (folderEl) folderEl.classList.remove('drop-target');
    }

    function _onSidebarDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!_dragged || !_draggedPath) return;

        const folderEl = e.target.closest('.folder-item');
        if (!folderEl) return;
        folderEl.classList.remove('drop-target');

        const folderId = folderEl.dataset.folderId;
        if (!folderId) return;

        const targetPathArray = folderId !== 'all' ? folderId.split(',').map(Number) : [];

        const sourceParentPath = _draggedPath.slice(0, -1);
        if (sourceParentPath.join(',') === targetPathArray.join(',')) {
            _deps.showNotification(_deps.getMessage('bookmarkAlreadyInFolder'), true);
            return;
        }

        if (!_validateMove(_draggedPath, targetPathArray, true)) return;
        _applyMove(_draggedPath, targetPathArray, true, false);
    }

    //  Validation 

    function _validateMove(sourcePath, targetPath, targetIsFolder = false) {
        if (!_isFolder) return true;

        const sourceStr = sourcePath.join(',');
        const targetStr = targetIsFolder
            ? targetPath.join(',')
            : targetPath.slice(0, -1).join(',');

        if (targetIsFolder && targetStr === sourcePath.slice(0, -1).join(',')) return true;

        if (targetStr === sourceStr || targetStr.startsWith(sourceStr + ',')) {
            _deps.showNotification(_deps.getMessage('cannotMoveIntoSelf'), true);
            return false;
        }
        return true;
    }

    async function _applyMove(sourcePath, targetPath, intoFolder, insertAbove) {
        const {
            getData, getItemByPath, getParentByPath,
            saveChanges, showNotification, getMessage,
            renderFolderTree, renderBookmarks, resetInactivityTimer,
        } = _deps;

        const data         = getData();
        const sourceParent = getParentByPath(data, sourcePath.slice(0, -1));
        const sourceIndex  = sourcePath[sourcePath.length - 1];

        if (!sourceParent || sourceParent[sourceIndex] !== _dragged) return;

        let targetArray, insertPos;

        if (intoFolder) {

            let targetArray_;
            if (targetPath.length === 0) {
                targetArray_ = data.folders;
            } else {
                const folder = getItemByPath(data, targetPath);
                if (!folder || folder.type !== 'folder') {
                    showNotification(getMessage('invalidDestinationFolder'), true);
                    return;
                }
                targetArray_ = folder.children;
            }
            targetArray = targetArray_;

            sourceParent.splice(sourceIndex, 1);
            insertPos = targetArray.length;
        } else {
            const targetParent = getParentByPath(data, targetPath.slice(0, -1));
            if (!targetParent) return;
            let targetIndex = targetPath[targetPath.length - 1];

            sourceParent.splice(sourceIndex, 1);

            if (sourceParent === targetParent && sourceIndex < targetIndex) targetIndex--;

            insertPos   = insertAbove ? targetIndex : targetIndex + 1;
            targetArray = targetParent;
        }

        targetArray.splice(insertPos, 0, _dragged);
        _dragged.dateModified = Date.now();

        await saveChanges();
        ManagerBookmarks.clearBookmarksCache();
        renderFolderTree();
        ManagerBookmarks.resetPagination();
        renderBookmarks();
        showNotification(getMessage('dragSuccess'));
        resetInactivityTimer();
    }

    //  Indicator helpers 

    function _clearGridIndicators() {
        const grid = document.getElementById('bookmarks-grid');
        window.HolyShared.dragClearIndicators(grid || undefined);
    }

    function _clearSidebarIndicators() {
        const sidebar = document.querySelector('.sidebar');
        window.HolyShared.dragClearIndicators(sidebar || undefined);
    }

    //  Public 

    return { init, refreshDraggable };

})();

if (typeof window !== 'undefined') window.ManagerDragDrop = ManagerDragDrop;
if (typeof module !== 'undefined') module.exports = ManagerDragDrop;
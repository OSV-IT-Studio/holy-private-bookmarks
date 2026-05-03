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

const DragDropManager = (function () {

    const DRAG_CONFIG = {
        autoScrollSpeed: 15,
        edgeThreshold:   30,
        ghostOffsetX:    20,
        ghostOffsetY:    20,
    };

    //  State 

    function _emptyState() {
        return {
            draggedItem:     null,
            dragPath:        null,
            dragUid:         null,
            dragOverItem:    null,
            isDragging:      false,
            ghostElement:    null,
            dropPosition:    null,
            lastValidTarget: null,
            _escHandler:     null,
        };
    }

    let _state         = _emptyState();
    let _dataRef       = null;
    let _saveCallback  = null;
    let _boundHandlers       = null;
    let _saveChangesCallback = null;

    let _rafPending     = false;
    let _latestDragOver = null;

    let _dragCache = null;

    function _buildDragCache(sourceUid) {
        const S = window.HolyShared;
        const sourceItem = S.getAnyItemByUid(_dataRef, sourceUid);
        const forbidden  = new Set();

        if (sourceItem?.type === 'folder') {
            forbidden.add(sourceUid);
            (function collect(folder) {
                if (!folder.children) return;
                for (const child of folder.children) {
                    if (child.uid) forbidden.add(child.uid);
                    if (child.type === 'folder') collect(child);
                }
            })(sourceItem);
        }

        _dragCache = {
            forbiddenUids:    forbidden,
            lastTargetUid:    null,
            lastTargetResult: null,
        };
    }

    function _clearDragCache() { _dragCache = null; }

    //  Init 

    function initDragAndDrop(data, saveFn, saveChangesFn) {
        _dataRef             = data;
        _saveCallback        = saveFn;
        _saveChangesCallback = saveChangesFn || saveFn;

        const tree = document.getElementById('tree');
        if (!tree) return;

        removeDragListeners();

        _boundHandlers = {
            dragstart: _onDragStart,
            dragend:   _onDragEnd,
            dragover:  _onDragOver,
            dragenter: _onDragEnter,
            dragleave: _onDragLeave,
            drop:      _onDrop,
        };

        for (const [evt, fn] of Object.entries(_boundHandlers)) {
            tree.addEventListener(evt, fn, { capture: true });
        }

        refreshDragItems();
    }

    function refreshDragItems() {
        const tree = document.getElementById('tree');
        if (!tree) return;
        tree.querySelectorAll('.tree-item:not([data-drag-ready])').forEach(item => {
            item.setAttribute('draggable', 'true');
            item.setAttribute('aria-grabbed', 'false');
            item.setAttribute('data-drag-ready', '1');
        });
    }

    function removeDragListeners() {
        const tree = document.getElementById('tree');
        if (!tree || !_boundHandlers) return;
        for (const [evt, fn] of Object.entries(_boundHandlers)) {
            tree.removeEventListener(evt, fn, { capture: true });
        }
        _boundHandlers = null;
    }

    //  Drag start / end 

    function _onDragStart(e) {
        const item = e.target.closest('.tree-item');
        if (!item || e.target.closest('.quick-actions-trigger, .quick-action-btn-small, .quick-actions-hover')) {
            e.preventDefault();
            return false;
        }

        _state.draggedItem = item;
        _state.dragPath    = item.dataset.path ? item.dataset.path.split(',').map(Number) : null;
        _state.dragUid     = item.dataset.itemUid || item.dataset.folderUid || null;
        _state.isDragging  = true;

        if (!_state.dragUid) {
            e.preventDefault();
            return false;
        }

        _buildDragCache(_state.dragUid);

        item.classList.add('dragging');
        item.setAttribute('aria-grabbed', 'true');

        if (typeof QuickActions !== 'undefined') QuickActions.closeAll();

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.path || '');

        _state.ghostElement = window.HolyShared.dragCreateGhost(
            item, e.clientX, e.clientY,
            DRAG_CONFIG.ghostOffsetX, DRAG_CONFIG.ghostOffsetY
        );
        e.dataTransfer.setDragImage(new Image(), 0, 0);

        _state._escHandler = window.HolyShared.dragHandleEscape(
            () => _state.isDragging,
            () => {
                if (_state.draggedItem) {
                    _state.draggedItem.classList.remove('dragging');
                    _state.draggedItem.setAttribute('aria-grabbed', 'false');
                }
                _resetState();
                window.HolyShared.showNotification('Drag cancelled', false);
            }
        );

        return true;
    }

    function _onDragEnd() {
        document.querySelectorAll('#tree .tree-item.dragging').forEach(el => {
            el.classList.remove('dragging');
            el.setAttribute('aria-grabbed', 'false');
        });
        _clearDragCache();
        _resetState();
    }


    function _onDragOver(e) {
        e.preventDefault();
        if (!_state.isDragging) return;

        window.HolyShared.dragMoveGhost(
            _state.ghostElement, e.clientX, e.clientY,
            DRAG_CONFIG.ghostOffsetX, DRAG_CONFIG.ghostOffsetY
        );

        _latestDragOver = e;
        if (!_rafPending) {
            _rafPending = true;
            requestAnimationFrame(_processDragOver);
        }
    }

    function _processDragOver() {
        _rafPending = false;
        const e = _latestDragOver;
        if (!e || !_state.isDragging) return;

        const tree = document.getElementById('tree');
        if (tree) {
            const r = tree.getBoundingClientRect();
            if (e.clientY < r.top + DRAG_CONFIG.edgeThreshold) {
                tree.scrollTop -= DRAG_CONFIG.autoScrollSpeed;
            } else if (e.clientY > r.bottom - DRAG_CONFIG.edgeThreshold) {
                tree.scrollTop += DRAG_CONFIG.autoScrollSpeed;
            }
        }

        const target = e.target.closest('.tree-item');

        if (!target || target === _state.draggedItem) {
            _clearIndicators();
            return;
        }

        if (_state.dragOverItem && _state.dragOverItem !== target) {
            _state.dragOverItem.classList.remove(
                'drop-above', 'drop-below', 'drop-into-folder', 'drop-forbidden'
            );
        }

        if (!_validateTarget(target)) {
            target.classList.remove('drop-above', 'drop-below', 'drop-into-folder');
            target.classList.add('drop-forbidden');
            _state.dragOverItem    = target;
            _state.lastValidTarget = target;
            return;
        }

        const rect     = target.getBoundingClientRect();
        const relY     = e.clientY - rect.top;
        const isFolder = !!target.dataset.folderUid;

        target.classList.remove('drop-above', 'drop-below', 'drop-into-folder', 'drop-forbidden');

        if (isFolder) {
            const zone = rect.height / 3;
            if (relY < zone) {
                target.classList.add('drop-above');
                _state.dropPosition = 'before';
            } else if (relY > rect.height - zone) {
                target.classList.add('drop-below');
                _state.dropPosition = 'after';
            } else {
                target.classList.add('drop-into-folder');
                _state.dropPosition = 'inside';
            }
        } else {
            if (relY < rect.height / 2) {
                target.classList.add('drop-above');
                _state.dropPosition = 'before';
            } else {
                target.classList.add('drop-below');
                _state.dropPosition = 'after';
            }
        }

        _state.dragOverItem    = target;
        _state.lastValidTarget = target;
    }

    //  Drag enter / leave 

    function _onDragEnter(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function _onDragLeave(e) {
        e.stopPropagation();
        const target = e.target.closest('.tree-item');
        if (target && !target.contains(e.relatedTarget)) {
            target.classList.remove('drop-above', 'drop-below', 'drop-into-folder', 'drop-forbidden');
        }
    }

    //  Drop 

    function _captureDropSnapshot(sourceUid, targetEl) {
        const S = window.HolyShared;
        const isIntoFolder = _state.dropPosition === 'inside';
        const insertBefore = !isIntoFolder && _state.dropPosition === 'before';

        const targetUid = targetEl.dataset.itemUid || targetEl.dataset.folderUid || null;

        const sourceItem = S.getAnyItemByUid(_dataRef, sourceUid);
        if (!sourceItem) return null;
        const sourceParentArr = S.getParentArrayForItemUid(_dataRef, sourceUid);
        const sourceIndex     = sourceParentArr ? sourceParentArr.indexOf(sourceItem) : -1;
        if (sourceIndex === -1) return null;

        const sourceFolderEl  = _state.draggedItem?.parentElement?.closest?.('.tree-item') || null;
        const sourceFolderUid = sourceFolderEl?.dataset.folderUid || null;
        const sourceFolderPath = _state.dragPath ? _state.dragPath.slice(0, -1) : [];

        let destFolderUid, destFolderPath, insertPos;

        if (isIntoFolder && targetUid) {
            destFolderUid  = targetUid;
            const folder   = S.getItemByUid(_dataRef, targetUid);
            if (!folder || folder.type !== 'folder') return null;
            destFolderPath = targetEl.dataset.path ? targetEl.dataset.path.split(',').map(Number) : [];
            insertPos      = Array.isArray(folder.children) ? folder.children.length : 0;
        } else if (targetUid) {
            const targetFolderEl  = targetEl.parentElement?.closest?.('.tree-item') || null;
            destFolderUid  = targetFolderEl?.dataset.folderUid || null;
            destFolderPath = targetFolderEl?.dataset.path
                ? targetFolderEl.dataset.path.split(',').map(Number)
                : [];

            const targetParentArr = S.getParentArrayForItemUid(_dataRef, targetUid);
            const targetItem      = S.getAnyItemByUid(_dataRef, targetUid);
            const targetIdx       = targetParentArr && targetItem ? targetParentArr.indexOf(targetItem) : -1;
            if (targetIdx === -1) return null;

            insertPos = insertBefore ? targetIdx : targetIdx + 1;
            if (targetParentArr === sourceParentArr && sourceIndex < insertPos) insertPos--;
            const destLen = targetParentArr ? targetParentArr.length : 0;
            if (insertPos > destLen) insertPos = destLen;
            if (insertPos < 0)       insertPos = 0;
        } else {
            destFolderUid  = null;
            destFolderPath = [];
            insertPos      = _dataRef.folders.length;
        }

        return { sourceFolderPath, sourceFolderUid, sourceIndex, destFolderPath, destFolderUid, insertPos, isIntoFolder };
    }

    function _onDrop(e) {
        e.preventDefault();
        e.stopPropagation();

        if (!_state.isDragging || !_state.draggedItem || !_state.dragUid) {
            _resetState();
            return;
        }

        const target = e.target.closest('.tree-item, .drop-spacer');
        if (!target || target === _state.draggedItem) {
            _resetState();
            return;
        }

        if (!_validateTarget(target)) {
            window.HolyShared.showNotification('Cannot move here', true);
            _resetState();
            return;
        }

        const draggedEl  = _state.draggedItem;
        const sourcePath = _state.dragPath ? [..._state.dragPath] : [];
        const sourceUid  = _state.dragUid;

        const dropSnapshot = _captureDropSnapshot(sourceUid, target);

        _performDrop(target);
        _showSuccess(target);
        _clearDragCache();

        const domMoved = _domMoveElement(draggedEl, sourcePath, target, dropSnapshot);
        const S = window.HolyShared;
        const msg = S.getMessage('dragSuccess');

        if (domMoved) {
            _saveChangesCallback().then(() => S.showNotification(msg));
        } else {
            _saveCallback().then(() => S.showNotification(msg));
        }

        _resetState();
    }

    //  Helpers 

    function _validateTarget(target) {
        if (!_state.dragUid) return false;
        if (target === _state.draggedItem) return false;

        const targetUid = target.dataset.folderUid || target.dataset.itemUid || null;
        if (!targetUid) return true;

        if (!target.dataset.folderUid) return true;

        if (_dragCache) {
            if (_dragCache.lastTargetUid === targetUid) return _dragCache.lastTargetResult;
            const result = !_dragCache.forbiddenUids.has(targetUid);
            _dragCache.lastTargetUid    = targetUid;
            _dragCache.lastTargetResult = result;
            return result;
        }

        if (_state.dragUid === targetUid) return false;
        const S = window.HolyShared;
        const draggedItem = S.getAnyItemByUid(_dataRef, _state.dragUid);
        if (!draggedItem || draggedItem.type !== 'folder') return true;
        function _isDescendant(folder, uid) {
            if (!folder.children) return false;
            for (const child of folder.children) {
                if (child.uid === uid) return true;
                if (child.type === 'folder' && _isDescendant(child, uid)) return true;
            }
            return false;
        }
        return !_isDescendant(draggedItem, targetUid);
    }

    function _performDrop(target) {
        const sourceUid  = _state.dragUid;
        const isIntoFolder = _state.dropPosition === 'inside';
        const insertBefore = !isIntoFolder && _state.dropPosition === 'before';

        const targetUid = isIntoFolder
            ? (target.dataset.folderUid || null)
            : (target.dataset.itemUid || target.dataset.folderUid || null);

        _moveItem(sourceUid, targetUid, insertBefore, isIntoFolder);
    }

    function _showSuccess(target) {
        [target.closest('.tree-item'), _state.draggedItem].forEach(el => {
            if (!el) return;
            el.classList.add('move-success');
            setTimeout(() => el.classList && el.classList.remove('move-success'), 500);
        });
    }

    function _clearIndicators() {
        const tree = document.getElementById('tree');
        window.HolyShared.dragClearIndicators(tree || undefined);
    }

    function _resetState() {
        if (_state.ghostElement) _state.ghostElement.remove();
        if (_state._escHandler)  document.removeEventListener('keydown', _state._escHandler);

        _clearIndicators();

        _rafPending     = false;
        _latestDragOver = null;
        _state          = _emptyState();
    }

    //  Move logic 

    function _moveItem(sourceUid, targetUid, insertBefore, isIntoFolder) {
        if (!_dataRef || !sourceUid) return;

        const S = window.HolyShared;

        const itemToMove   = S.getAnyItemByUid(_dataRef, sourceUid);
        if (!itemToMove) return;

        const sourceParentArr = S.getParentArrayForItemUid(_dataRef, sourceUid);
        if (!sourceParentArr) return;
        const sourceIndex = sourceParentArr.indexOf(itemToMove);
        if (sourceIndex === -1) return;

        if (itemToMove.type === 'folder' && targetUid) {
            let cur = itemToMove;
            function _isDescendant(folder, uid) {
                if (!folder.children) return false;
                for (const child of folder.children) {
                    if (child.uid === uid) return true;
                    if (child.type === 'folder' && _isDescendant(child, uid)) return true;
                }
                return false;
            }
            if (itemToMove.uid === targetUid || _isDescendant(itemToMove, targetUid)) return;
        }

        let targetArray, insertPos;

        if (isIntoFolder && targetUid) {
            const folder = S.getItemByUid(_dataRef, targetUid);
            if (!folder || folder.type !== 'folder') return;
            if (!Array.isArray(folder.children)) folder.children = [];
            targetArray = folder.children;
            insertPos   = targetArray.length;
        } else if (targetUid) {
            const targetItem = S.getAnyItemByUid(_dataRef, targetUid);
            if (!targetItem) return;
            targetArray = S.getParentArrayForItemUid(_dataRef, targetUid);
            if (!targetArray) return;
            const targetIdx = targetArray.indexOf(targetItem);
            if (targetIdx === -1) return;
            insertPos = insertBefore ? targetIdx : targetIdx + 1;
        } else {
            targetArray = _dataRef.folders;
            insertPos   = targetArray.length;
        }

        sourceParentArr.splice(sourceIndex, 1);
        if (targetArray === sourceParentArr && !isIntoFolder && sourceIndex < insertPos) {
            insertPos--;
        }
        targetArray.splice(insertPos, 0, itemToMove);

        itemToMove.dateModified = Date.now();
    }

    function _getContainerForPath(folderPath) {
        if (!Array.isArray(folderPath)) return null;
        if (folderPath.length === 0) {
            return document.getElementById('tree');
        }
        if (folderPath.some(n => !Number.isInteger(n) || n < 0)) return null;
        const folderEl = document.querySelector(`#tree .tree-item[data-path="${folderPath.join(',')}"]`);
        if (!folderEl) return null;
        const sub = folderEl.querySelector('.subitems');
        if (!sub || sub.classList.contains('collapsed')) return null;
        return sub.querySelector('.folder-virtual-scroll') || null;
    }

    function _updateBadge(S, folderEl) {
        if (!folderEl) return;
        const uid    = folderEl.dataset.folderUid;
        const folder = uid ? S.getItemByUid(_dataRef, uid) : null;
        if (!folder || folder.type !== 'folder') return;
        const badge = folderEl.querySelector('.folder-badge');
        if (badge) badge.textContent = S.countItemsInFolder(folder);
        const sc = folderEl.querySelector('.subitems:not(.collapsed) .folder-virtual-scroll');
        if (!sc) return;
        const isEmpty     = folder.children.length === 0;
        const existingMsg = sc.querySelector(':scope > .empty-folder-message');
        if (isEmpty && !existingMsg) {
            const msg = document.createElement('div');
            msg.className = 'empty-folder-message';
            msg.setAttribute('data-i18n', 'emptyFolder');
            msg.textContent = S.getMessage?.('emptyFolder');
            sc.appendChild(msg);
        } else if (!isEmpty && existingMsg) {
            existingMsg.remove();
        }
    }

    function _domMoveElement(draggedEl, sourcePath, targetEl, snapshot) {
        try {
            if (!snapshot) return false;

            const S = window.HolyShared;
            const { sourceFolderPath, sourceFolderUid, sourceIndex, destFolderPath, destFolderUid, insertPos, isIntoFolder } = snapshot;

            const sourceContainer = _getContainerForPath(sourceFolderPath);
            if (!sourceContainer) return false;

            const destContainer = _getContainerForPath(destFolderPath);

            if (!destContainer) {
                if (!isIntoFolder) return false;

                sourceContainer.removeChild(draggedEl);
                _reindexAllPathsRecursive(sourceContainer, sourceFolderPath);

                const srcFolderEl = sourceFolderUid
                    ? document.querySelector(`#tree .tree-item[data-folder-uid="${sourceFolderUid}"]`)
                    : null;
                const destFolderEl = destFolderUid
                    ? document.querySelector(`#tree .tree-item[data-folder-uid="${destFolderUid}"]`)
                    : null;
                _updateBadge(S, srcFolderEl);
                _updateAncestorBadges(S, srcFolderEl);
                _updateBadge(S, destFolderEl);
                _updateAncestorBadges(S, destFolderEl);
                _resyncSentinel(sourceContainer, sourceFolderUid);
                refreshDragItems();
                return true;
            }

            sourceContainer.removeChild(draggedEl);

            const preSiblings = destContainer.querySelectorAll(':scope > .tree-item');
            const refNode = [...preSiblings].find(el => {
                const p = el.dataset.path ? el.dataset.path.split(',').map(Number) : null;
                if (!p) return false;
                const elIdx = p[p.length - 1];
                const sameContainer = S.arraysEqual(sourceFolderPath, destFolderPath);
                const effectiveIdx  = (sameContainer && elIdx > sourceIndex) ? elIdx - 1 : elIdx;
                return effectiveIdx >= insertPos;
            });
            if (refNode) {
                destContainer.insertBefore(draggedEl, refNode);
            } else {
                const loadMore = destContainer.querySelector('.load-more-btn');
                if (loadMore) destContainer.insertBefore(draggedEl, loadMore);
                else          destContainer.appendChild(draggedEl);
            }

            _reindexAllPathsRecursive(sourceContainer, sourceFolderPath);
            if (destContainer !== sourceContainer) {
                const actualDestPath = (() => {
                    const folderEl = destContainer.closest('.tree-item');
                    if (folderEl?.dataset.path) return folderEl.dataset.path.split(',').map(Number);
                    return destFolderPath;
                })();
                _reindexAllPathsRecursive(destContainer, actualDestPath);
            }

            const updateBadge = (folderEl) => _updateBadge(S, folderEl);

            const srcFolderEl = sourceFolderUid
                ? document.querySelector(`#tree .tree-item[data-folder-uid="${sourceFolderUid}"]`)
                : (sourceFolderPath.length > 0
                    ? document.querySelector(`#tree .tree-item[data-path="${sourceFolderPath.join(',')}"]`)
                    : null);

            const destFolderEl = destFolderUid
                ? document.querySelector(`#tree .tree-item[data-folder-uid="${destFolderUid}"]`)
                : (destFolderPath.length > 0
                    ? (() => {
                        const c = _getContainerForPath(destFolderPath);
                        return c?.closest('.tree-item') ?? null;
                    })()
                    : null);

            updateBadge(srcFolderEl);
            _updateAncestorBadges(S, srcFolderEl);
            if (srcFolderEl !== destFolderEl) {
                updateBadge(destFolderEl);
                _updateAncestorBadges(S, destFolderEl);
            }

            _resyncSentinel(sourceContainer, sourceFolderUid);
            if (destContainer !== sourceContainer) {
                _resyncSentinel(destContainer, destFolderUid);
            }

            refreshDragItems();
            return true;
        } catch (err) {
            console.warn('Error', err);
            return false;
        }
    }
    function _updateAncestorBadges(S, folderEl) {
        if (!folderEl) return;
        let ancestor = folderEl.parentElement?.closest?.('.tree-item');
        while (ancestor) {
            const aUid = ancestor.dataset.folderUid;
            if (aUid) {
                const aFolder = S.getItemByUid(_dataRef, aUid);
                if (aFolder && aFolder.type === 'folder') {
                    const aBadge = ancestor.querySelector('.folder-badge');
                    if (aBadge) aBadge.textContent = S.countItemsInFolder(aFolder);
                }
            }
            ancestor = ancestor.parentElement?.closest?.('.tree-item');
        }
    }

    function _resyncSentinel(container, folderUid) {
        if (!container || !folderUid) return;
        const freshFolder = window.HolyShared.getItemByUid(_dataRef, folderUid);
        if (!freshFolder) return;
        const folderEl = document.querySelector(`#tree .tree-item[data-folder-uid="${folderUid}"]`);
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

    function _reindexAllPathsRecursive(container, basePath) {
        if (!container) return;
        const children = container.querySelectorAll(':scope > .tree-item');
        children.forEach((el, idx) => {
            const newPath = [...basePath, idx];
            el.dataset.path = newPath.join(',');
            const subitems = el.querySelector('.subitems');
            if (subitems && !subitems.classList.contains('collapsed')) {
                const scrollContainer = subitems.querySelector('.folder-virtual-scroll');
                if (scrollContainer) {
                    _reindexAllPathsRecursive(scrollContainer, newPath);
                }
            }
        });
    }
    //  Public API 

    return {
        initDragAndDrop,
        refreshDragItems,
        removeDragListeners,
        DRAG_CONFIG,
        reindexAfterRemoval(containerEl, basePath) {
            if (containerEl) _reindexAllPathsRecursive(containerEl, basePath);
        },
    };

})();

if (typeof window !== 'undefined') window.DragDropManager = DragDropManager;
if (typeof module !== 'undefined') module.exports = DragDropManager;
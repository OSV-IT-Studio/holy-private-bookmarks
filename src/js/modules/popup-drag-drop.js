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
    let _boundHandlers = null;

    // rAF throttle
    let _rafPending     = false;
    let _latestDragOver = null;

    //  Init 

    function initDragAndDrop(data, saveFn) {
        _dataRef      = data;
        _saveCallback = saveFn;

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
        _state.isDragging  = true;

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
        _resetState();
    }

    //  Drag over (rAF-throttled) 

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

        // Auto-scroll
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

        // Clear previous indicator
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
        const isFolder = !!target.querySelector('.item-header.folder');

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

    function _onDrop(e) {
        e.preventDefault();
        e.stopPropagation();

        if (!_state.isDragging || !_state.draggedItem || !_state.dragPath) {
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

        _performDrop(target);
        _showSuccess(target);

        if (_saveCallback) {
            _saveCallback().then(() => {
                window.HolyShared.showNotification(
                    window.HolyShared.getMessage('dragSuccess') || 'Item moved successfully'
                );
            });
        }

        _resetState();
    }

    //  Helpers 

    function _validateTarget(target) {
        if (!_state.dragPath) return false;
        if (target === _state.draggedItem) return false;

        const targetPath = target.dataset.path ? target.dataset.path.split(',').map(Number) : null;
        if (!targetPath) return true;

        if (target.querySelector('.item-header.folder')) {
            const S = window.HolyShared;
            if (S.isAncestor(_state.dragPath, targetPath) || S.arraysEqual(_state.dragPath, targetPath)) {
                return false;
            }
        }

        return true;
    }

    function _performDrop(target) {
        const sourcePath = _state.dragPath;
        let targetPath, insertBefore, isIntoFolder;

        if (target.classList.contains('drop-spacer')) {
            targetPath   = target.dataset.path ? target.dataset.path.split(',').map(Number) : null;
            insertBefore = false;
            isIntoFolder = false;
        } else {
            targetPath   = target.dataset.path ? target.dataset.path.split(',').map(Number) : null;
            isIntoFolder = _state.dropPosition === 'inside';
            insertBefore = !isIntoFolder && _state.dropPosition === 'before';
        }

        _moveItem(sourcePath, targetPath, insertBefore, isIntoFolder);
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

    function _moveItem(sourcePath, targetPath, insertBefore, isIntoFolder) {
        if (!_dataRef) return;

        const S            = window.HolyShared;
        const sourceParent = S.getParentByPath(_dataRef, sourcePath.slice(0, -1));
        const sourceIndex  = sourcePath[sourcePath.length - 1];
        const itemToMove   = sourceParent ? sourceParent[sourceIndex] : null;

        if (!itemToMove) return;

        // Guard: folder can't be moved into itself or its descendants
        if (itemToMove.type === 'folder' && targetPath) {
            let cur = _dataRef.folders;
            for (let i = 0; i < targetPath.length; i++) {
                const idx = targetPath[i];
                if (cur[idx] === itemToMove) return;
                if (cur[idx]?.type === 'folder' && cur[idx].children) cur = cur[idx].children;
            }
        }

        let targetArray, insertPos;

        if (isIntoFolder && targetPath) {
            const folder = S.getItemByPath(_dataRef, targetPath);
            if (!folder || folder.type !== 'folder') return;
            targetArray = folder.children;
            insertPos   = targetArray.length;
        } else if (targetPath) {
            targetArray     = S.getParentByPath(_dataRef, targetPath.slice(0, -1));
            const targetIdx = targetPath[targetPath.length - 1];
            insertPos       = insertBefore ? targetIdx : targetIdx + 1;
        } else {
            targetArray = _dataRef.folders;
            insertPos   = targetArray.length;
        }

        sourceParent.splice(sourceIndex, 1);
        if (targetArray === sourceParent && !isIntoFolder && sourceIndex < insertPos) {
            insertPos--;
        }
        targetArray.splice(insertPos, 0, itemToMove);

        itemToMove.dateModified = Date.now();

        if (S.virtualScrollCache?.clear) S.virtualScrollCache.clear();
    }

    //  Public API 

    return {
        initDragAndDrop,
        refreshDragItems,
        removeDragListeners,
        DRAG_CONFIG,
    };

})();

if (typeof window !== 'undefined') window.DragDropManager = DragDropManager;
if (typeof module !== 'undefined') module.exports = DragDropManager;
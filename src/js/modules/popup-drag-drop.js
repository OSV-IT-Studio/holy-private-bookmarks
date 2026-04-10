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

const DragDropManager = (function() {
    // DEPENDENCIES
    const Shared = window.HolyShared || {};
    const {
        getMessage,
        showNotification,
        getParentByPath,
        getItemByPath,
        isAncestor,
        arraysEqual,
        virtualScrollCache
    } = Shared;

    // CONFIGURATION
    const DRAG_CONFIG = {
        autoScrollSpeed: 15,
        edgeThreshold: 30,
        ghostOffsetX: 20,
        ghostOffsetY: 20,
        longPressDelay: 500,
        animationDuration: 200
    };

    // STATE
    let dragState = {
        draggedItem: null,
        dragPath: null,
        dragOverItem: null,
        isDragging: false,
        ghostElement: null,
        tooltipElement: null,
        startX: 0,
        startY: 0,
        canDrop: true,
        lastValidTarget: null,
        dropPosition: null,
        _escHandler: null
    };

    let dataRef = null;
    let saveCallback = null;

    let _boundHandlers = null;

    // INITIALIZATION

    function initDragAndDrop(data, saveFn) {
        dataRef = data;
        saveCallback = saveFn;

        const tree = document.getElementById('tree');
        if (!tree) return;

        removeDragListeners();

        _boundHandlers = {
            dragstart: handleDragStart,
            dragend:   handleDragEnd,
            dragover:  handleDragOver,
            dragenter: handleDragEnter,
            dragleave: handleDragLeave,
            drop:      handleDrop
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

    // DRAG & DROP HANDLERS

    function handleDragStart(e) {
        const item = e.target.closest('.tree-item');
        if (!item || e.target.closest('.quick-actions-trigger, .quick-action-btn-small, .quick-actions-hover')) {
            e.preventDefault();
            return false;
        }

        dragState.draggedItem = item;
        dragState.dragPath    = item.dataset.path ? item.dataset.path.split(',').map(Number) : null;
        dragState.isDragging  = true;
        dragState.startX      = e.clientX;
        dragState.startY      = e.clientY;

        item.classList.add('dragging');
        item.setAttribute('aria-grabbed', 'true');

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.path || '');

        dragState.ghostElement = Shared.dragCreateGhost(
            item, e.clientX, e.clientY,
            DRAG_CONFIG.ghostOffsetX, DRAG_CONFIG.ghostOffsetY
        );
        e.dataTransfer.setDragImage(new Image(), 0, 0);

        dragState._escHandler = Shared.dragHandleEscape(
            () => dragState.isDragging,
            () => {
                if (dragState.draggedItem) {
                    dragState.draggedItem.classList.remove('dragging');
                    dragState.draggedItem.setAttribute('aria-grabbed', 'false');
                }
                resetDragState();
                showNotification('Drag cancelled', false);
            }
        );

        return true;
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();

        Shared.dragMoveGhost(
            dragState.ghostElement, e.clientX, e.clientY,
            DRAG_CONFIG.ghostOffsetX, DRAG_CONFIG.ghostOffsetY
        );

        const target = e.target.closest('.tree-item');
        if (!target || target === dragState.draggedItem) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }

        if (!validateDropTarget(target)) {
            e.dataTransfer.dropEffect = 'none';
            showForbiddenIndicator(target);
            return;
        }

        e.dataTransfer.dropEffect = 'move';

        const rect     = target.getBoundingClientRect();
        const relY     = e.clientY - rect.top;
        const isFolder = !!target.querySelector('.item-header.folder');

        if (dragState.dragOverItem && dragState.dragOverItem !== target) {
            dragState.dragOverItem.classList.remove(
                'drop-above', 'drop-below', 'drop-into-folder', 'drop-forbidden'
            );
        }

        if (isFolder) {
            const zone = rect.height / 3;
            if (relY < zone) {
                dragState.dropPosition = 'before';
                target.classList.remove('drop-below', 'drop-into-folder', 'drop-forbidden');
                target.classList.add('drop-above');
            } else if (relY > rect.height - zone) {
                dragState.dropPosition = 'after';
                target.classList.remove('drop-above', 'drop-into-folder', 'drop-forbidden');
                target.classList.add('drop-below');
            } else {
                dragState.dropPosition = 'inside';
                target.classList.remove('drop-above', 'drop-below', 'drop-forbidden');
                target.classList.add('drop-into-folder');
            }
        } else {
            if (relY < rect.height / 2) {
                dragState.dropPosition = 'before';
                target.classList.remove('drop-below', 'drop-forbidden');
                target.classList.add('drop-above');
            } else {
                dragState.dropPosition = 'after';
                target.classList.remove('drop-above', 'drop-forbidden');
                target.classList.add('drop-below');
            }
        }

        dragState.dragOverItem = target;
    }

    function handleDragEnter(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function handleDragLeave(e) {
        e.stopPropagation();
        const target = e.target.closest('.tree-item');
        if (target && !target.contains(e.relatedTarget)) {
            target.classList.remove('drop-above', 'drop-below', 'drop-into-folder', 'drop-forbidden');
        }
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();

        if (!dragState.isDragging || !dragState.draggedItem || !dragState.dragPath) {
            resetDragState();
            return;
        }

        const target = e.target.closest('.tree-item, .drop-spacer');
        if (!target || target === dragState.draggedItem) {
            resetDragState();
            return;
        }

        if (!validateDropTarget(target)) {
            showNotification('Cannot move here', true);
            resetDragState();
            return;
        }

        performDrop(target);
        showSuccessAnimation(target);

        if (saveCallback) {
            saveCallback().then(() => {
                showNotification(getMessage('dragSuccess') || 'Item moved successfully');
            });
        }

        resetDragState();
    }

    function validateDropTarget(target) {
        if (!dragState.draggedItem || !dragState.dragPath) return false;
        if (target === dragState.draggedItem) return false;

        const targetPath  = target.dataset.path ? target.dataset.path.split(',').map(Number) : null;
        if (!targetPath) return true;

        const draggedPath = dragState.dragPath;

        if (target.classList.contains('tree-item')) {
            const isFolder = target.querySelector('.item-header.folder');
            if (isFolder) {
                if (isAncestor(draggedPath, targetPath) || arraysEqual(draggedPath, targetPath)) {
                    return false;
                }
            }
        }

        dragState.canDrop = true;
        return true;
    }

    function showForbiddenIndicator(target) {
        Shared.dragClearIndicators();
        target.classList.add('drop-forbidden');
    }

    function performDrop(target) {
        const sourcePath = dragState.dragPath;
        let targetPath, insertBefore, isIntoFolder;

        if (target.classList.contains('drop-spacer')) {
            targetPath   = target.dataset.path ? target.dataset.path.split(',').map(Number) : null;
            insertBefore = false;
            isIntoFolder = false;
        } else {
            targetPath = target.dataset.path ? target.dataset.path.split(',').map(Number) : null;

            if (dragState.dropPosition === 'inside') {
                isIntoFolder = true;
                insertBefore = false;
            } else {
                isIntoFolder = false;
                insertBefore = dragState.dropPosition === 'before';
            }
        }

        moveItem(sourcePath, targetPath, insertBefore, isIntoFolder);
    }

    function showSuccessAnimation(target) {
        const item = target.closest('.tree-item');
        if (item) {
            item.classList.add('move-success');
            setTimeout(() => item.classList && item.classList.remove('move-success'), 500);
        }
        if (dragState.draggedItem) {
            const di = dragState.draggedItem;
            di.classList.add('move-success');
            setTimeout(() => di.classList && di.classList.remove('move-success'), 500);
        }
    }

    function handleDragEnd() {
        document.querySelectorAll('.tree-item.dragging').forEach(el => {
            el.classList.remove('dragging');
            el.setAttribute('aria-grabbed', 'false');
        });
        resetDragState();
    }

    function resetDragState() {
        if (dragState.ghostElement) dragState.ghostElement.remove();
        if (dragState.tooltipElement) dragState.tooltipElement.remove();
        if (dragState._escHandler) {
            document.removeEventListener('keydown', dragState._escHandler);
        }

        dragState = {
            draggedItem: null,
            dragPath: null,
            dragOverItem: null,
            isDragging: false,
            ghostElement: null,
            tooltipElement: null,
            startX: 0,
            startY: 0,
            canDrop: true,
            lastValidTarget: null,
            dropPosition: null,
            _escHandler: null
        };

        Shared.dragClearIndicators();
    }

    async function moveItem(sourcePath, targetPath, insertBefore = true, isIntoFolder = false) {
        if (!dataRef) return;

        const sourceParent = getParentByPath(dataRef, sourcePath.slice(0, -1));
        const sourceIndex  = sourcePath[sourcePath.length - 1];
        const itemToMove   = sourceParent[sourceIndex];

        if (!itemToMove) throw new Error('Source item not found');

        if (itemToMove.type === 'folder' && targetPath) {
            let current = dataRef.folders;
            for (let i = 0; i < targetPath.length; i++) {
                const idx = targetPath[i];
                if (current[idx] === itemToMove) throw new Error('Cannot move folder into itself');
                if (current[idx]?.type === 'folder' && current[idx].children) {
                    current = current[idx].children;
                }
            }
        }

        let targetArray, insertPos;

        if (isIntoFolder && targetPath) {
            const folder = getItemByPath(dataRef, targetPath);
            if (!folder || folder.type !== 'folder') throw new Error('Target is not a folder');
            targetArray = folder.children;
            insertPos   = targetArray.length;
        } else if (targetPath) {
            targetArray = getParentByPath(dataRef, targetPath.slice(0, -1));
            const targetIdx = targetPath[targetPath.length - 1];
            insertPos = insertBefore ? targetIdx : targetIdx + 1;
        } else {
            targetArray = dataRef.folders;
            insertPos   = targetArray.length;
        }

        if (targetArray === sourceParent && !isIntoFolder) {
            sourceParent.splice(sourceIndex, 1);
            if (sourceIndex < insertPos) insertPos -= 1;
            targetArray.splice(insertPos, 0, itemToMove);
        } else {
            sourceParent.splice(sourceIndex, 1);
            targetArray.splice(insertPos, 0, itemToMove);
        }

        itemToMove.dateModified = Date.now();

        if (virtualScrollCache?.clear) virtualScrollCache.clear();
    }

    // PUBLIC API
    return {
        initDragAndDrop,
        refreshDragItems,
        removeDragListeners,
        DRAG_CONFIG
    };

})();

// EXPORT TO THE GLOBAL AREA
if (typeof window !== 'undefined') {
    window.DragDropManager = DragDropManager;
}

if (typeof module !== 'undefined') {
    module.exports = DragDropManager;
}
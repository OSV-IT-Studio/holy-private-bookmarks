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
        dropPosition: null
    };

    let dataRef = null;
    let saveCallback = null;

    // INITIALIZATION 

    function initDragAndDrop(data, saveFn) {
        dataRef = data;
        saveCallback = saveFn;

        const tree = document.getElementById('tree');
        if (!tree) return;
        
        removeDragListeners();
        
        tree.addEventListener('dragstart', handleDragStart, { capture: true });
        tree.addEventListener('dragend', handleDragEnd, { capture: true });
        tree.addEventListener('dragover', handleDragOver, { capture: true });
        tree.addEventListener('dragenter', handleDragEnter, { capture: true });
        tree.addEventListener('dragleave', handleDragLeave, { capture: true });
        tree.addEventListener('drop', handleDrop, { capture: true });
        
        refreshDragItems();
    }


    function refreshDragItems() {
        document.querySelectorAll('.tree-item').forEach(item => {
            item.setAttribute('draggable', 'true');
            item.setAttribute('aria-grabbed', 'false');
        });
    }


    function removeDragListeners() {
        const tree = document.getElementById('tree');
        if (!tree) return;
        
        const events = ['dragstart', 'dragend', 'dragover', 'dragenter', 'dragleave', 'drop'];
        events.forEach(event => {
            tree.removeEventListener(event, handleDragStart, { capture: true });
        });
    }

    // DRAG & DROP HANDLERS 

    function handleDragStart(e) {
        const item = e.target.closest('.tree-item');
        if (!item || e.target.closest('.action-btn, .quick-action-btn-small')) {
            e.preventDefault();
            return false;
        }
        
        dragState.draggedItem = item;
        dragState.dragPath = item.dataset.path ? item.dataset.path.split(',').map(Number) : null;
        dragState.isDragging = true;
        dragState.startX = e.clientX;
        dragState.startY = e.clientY;
        
        item.classList.add('dragging');
        item.setAttribute('aria-grabbed', 'true');
        
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.path || '');
        
        createDragGhost(item, e.clientX, e.clientY);
        e.dataTransfer.setDragImage(new Image(), 0, 0);
        
        document.addEventListener('keydown', handleDragKeyDown);
        
        return true;
    }

    function createDragGhost(item, clientX, clientY) {
        if (dragState.ghostElement) {
            dragState.ghostElement.remove();
        }
        
        const title = item.querySelector('.item-title span:nth-child(3)')?.textContent || 
                      item.querySelector('.item-title span:nth-child(2)')?.textContent || 
                      'Element';
        
        const isFolder = !!item.querySelector('.folder-badge');
        const count = isFolder ? item.querySelector('.folder-badge')?.textContent : '';
        
        let iconSvg = '';
        if (isFolder) {
            iconSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M18 15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8z"/>
            </svg>`;
        } else {
            iconSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M5 4h10v12l-5-3-5 3V4z"/>
            </svg>`;
        }
        
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.innerHTML = `
            <span class="icon">${iconSvg}</span>
            <span class="text">${title}</span>
            ${count ? `<span class="count">${count}</span>` : ''}
        `;
        
        ghost.style.left = (clientX + DRAG_CONFIG.ghostOffsetX) + 'px';
        ghost.style.top = (clientY + DRAG_CONFIG.ghostOffsetY) + 'px';
        
        document.body.appendChild(ghost);
        dragState.ghostElement = ghost;
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        if (!dragState.isDragging) return;
        
        updateGhostPosition(e.clientX, e.clientY);
        
        const target = e.target.closest('.tree-item, .drop-spacer');
        if (!target) {
            clearDropIndicators();
            return;
        }
        
        const isValid = validateDropTarget(target);
        
        if (isValid) {
            showDropPosition(target, e.clientY);
        } else {
            showForbiddenIndicator(target);
        }
        
        handleAutoScroll(e.clientY);
    }

    function updateGhostPosition(x, y) {
        if (dragState.ghostElement) {
            dragState.ghostElement.style.left = (x + DRAG_CONFIG.ghostOffsetX) + 'px';
            dragState.ghostElement.style.top = (y + DRAG_CONFIG.ghostOffsetY) + 'px';
        }
    }

    function showDropPosition(target, mouseY) {
        clearDropIndicators();
        
        if (target.classList.contains('drop-spacer')) {
            target.classList.add('drop-over-spacer');
            dragState.dropPosition = 'after';
            dragState.lastValidTarget = target;
            return;
        }
        
        const rect = target.getBoundingClientRect();
        const isFolder = target.querySelector('.item-header.folder');
        
        if (isFolder && mouseY > rect.top + 30 && mouseY < rect.bottom - 10) {
            target.classList.add('drop-into-folder');
            dragState.dropPosition = 'inside';
        } else {
            const isBefore = mouseY < rect.top + rect.height / 2;
            
            if (isBefore) {
                target.classList.add('drop-above');
            } else {
                target.classList.add('drop-below');
            }
            
            dragState.dropPosition = isBefore ? 'before' : 'after';
        }
        
        dragState.lastValidTarget = target;
    }

    function clearDropIndicators() {
        document.querySelectorAll(
            '.drop-over-spacer, .drop-into-folder, .drop-above, .drop-below, .drop-forbidden'
        ).forEach(el => {
            el.classList.remove(
                'drop-over-spacer', 
                'drop-into-folder', 
                'drop-above', 
                'drop-below', 
                'drop-forbidden'
            );
        });
        
        const message = document.querySelector('.drop-forbidden-message');
        if (message) message.remove();
    }

    function handleAutoScroll(mouseY) {
        const tree = document.getElementById('tree');
        const rect = tree.getBoundingClientRect();
        
        if (mouseY < rect.top + DRAG_CONFIG.edgeThreshold) {
            tree.scrollTop -= DRAG_CONFIG.autoScrollSpeed;
        } else if (mouseY > rect.bottom - DRAG_CONFIG.edgeThreshold) {
            tree.scrollTop += DRAG_CONFIG.autoScrollSpeed;
        }
    }

    function handleDragEnter(e) {
        e.preventDefault();
        
        if (!dragState.isDragging) return;
        
        const target = e.target.closest('.tree-item, .drop-spacer');
        if (target && target !== dragState.draggedItem) {
            dragState.dragOverItem = target;
        }
    }

    function handleDragLeave(e) {
        e.preventDefault();
        
        const target = e.target.closest('.tree-item, .drop-spacer');
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
        
        const targetPath = target.dataset.path ? target.dataset.path.split(',').map(Number) : null;
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
        clearDropIndicators();
        target.classList.add('drop-forbidden');
    }

    function performDrop(target) {
        const sourcePath = dragState.dragPath;
        let targetPath, insertBefore, isIntoFolder;
        
        if (target.classList.contains('drop-spacer')) {
            targetPath = target.dataset.path ? target.dataset.path.split(',').map(Number) : null;
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
            setTimeout(() => {
                if (item && item.classList) {
                    item.classList.remove('move-success');
                }
            }, 500);
        }
        
        if (dragState.draggedItem) {
            const draggedItem = dragState.draggedItem;
            draggedItem.classList.add('move-success');
            setTimeout(() => {
                if (draggedItem && draggedItem.classList) {
                    draggedItem.classList.remove('move-success');
                }
            }, 500);
        }
    }

    function handleDragEnd(e) {
        const draggedItem = dragState.draggedItem;
        
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem.setAttribute('aria-grabbed', 'false');
        }
        
        resetDragState();
    }

    function handleDragKeyDown(e) {
        if (e.key === 'Escape' && dragState.isDragging) {
            const draggedItem = dragState.draggedItem;
            
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                draggedItem.setAttribute('aria-grabbed', 'false');
            }
            
            resetDragState();
            showNotification('Drag cancelled', false);
        }
    }

    function resetDragState() {
        if (dragState.ghostElement) {
            dragState.ghostElement.remove();
        }
        
        if (dragState.tooltipElement) {
            dragState.tooltipElement.remove();
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
            dropPosition: null
        };
        
        clearDropIndicators();
        document.removeEventListener('keydown', handleDragKeyDown);
    }

    async function moveItem(sourcePath, targetPath, insertBefore = true, isIntoFolder = false) {
        if (!dataRef) return;
        
        const sourceParent = getParentByPath(dataRef, sourcePath.slice(0, -1));
        const sourceIndex = sourcePath[sourcePath.length - 1];
        const itemToMove = sourceParent[sourceIndex];
        
        if (!itemToMove) {
            throw new Error('Source item not found');
        }
        
        if (itemToMove.type === 'folder' && targetPath) {
            let current = dataRef.folders;
            for (let i = 0; i < targetPath.length; i++) {
                const idx = targetPath[i];
                if (current[idx] === itemToMove) {
                    throw new Error('Cannot move folder into itself');
                }
                if (current[idx]?.type === 'folder' && current[idx].children) {
                    current = current[idx].children;
                }
            }
        }
        
        let targetArray;
        let insertPos;
        
        if (isIntoFolder && targetPath) {
            const folder = getItemByPath(dataRef, targetPath);
            if (!folder || folder.type !== 'folder') {
                throw new Error('Target is not a folder');
            }
            targetArray = folder.children;
            insertPos = targetArray.length;
        } else if (targetPath) {
            targetArray = getParentByPath(dataRef, targetPath.slice(0, -1));
            const targetIdx = targetPath[targetPath.length - 1];
            insertPos = insertBefore ? targetIdx : targetIdx + 1;
        } else {
            targetArray = dataRef.folders;
            insertPos = targetArray.length;
        }
        
        if (targetArray === sourceParent && !isIntoFolder) {
            sourceParent.splice(sourceIndex, 1);
            if (sourceIndex < insertPos) {
                insertPos -= 1;
            }
            targetArray.splice(insertPos, 0, itemToMove);
        } else {
            sourceParent.splice(sourceIndex, 1);
            targetArray.splice(insertPos, 0, itemToMove);
        }
        
        itemToMove.dateModified = Date.now();
        
        if (virtualScrollCache?.clear) {
            virtualScrollCache.clear();
        }
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
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
 
 const ManagerDragDrop = (function () {

    const GHOST_X = 20;
    const GHOST_Y = 20;

    let _deps        = {};
    let _dragged     = null;
    let _draggedUid  = null;
    let _draggedEl   = null;
    let _isFolder    = false;
    let _ghostEl     = null;
    let _escHandler  = null;
    let _forbiddenUids = null;

    let _rafPending      = false;
    let _latestDragOver  = null;
    let _lastIndicatorEl = null;
    let _ghostRafPending = false;
    let _latestGhostPos  = null;

    let _browserDropOverlay = null;
    let _browserDropCounter = 0;

    function init(deps) {
        Object.assign(_deps, deps);
        _attachGridListeners();
        _attachSidebarListeners();
        _attachBrowserDropListeners();
    }

    function _isBrowserDrag(e) {
        if (!e.dataTransfer) return false;
        const types = Array.from(e.dataTransfer.types);
        return types.includes('text/uri-list') || types.includes('text/plain');
    }

    function _showBrowserDropOverlay() {
        if (_browserDropOverlay) return;
        const overlay = document.createElement('div');
        overlay.className = 'browser-drop-overlay';
        overlay.innerHTML = `
            <div class="browser-drop-overlay__inner">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                </svg>
                <span>${_deps.getMessage('browserDropHint')}</span>
            </div>
        `;
        document.querySelector('.main-content')?.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('browser-drop-overlay--visible'));
        _browserDropOverlay = overlay;
    }

    function _hideBrowserDropOverlay() {
        if (!_browserDropOverlay) return;
        _browserDropOverlay.classList.remove('browser-drop-overlay--visible');
        const el = _browserDropOverlay;
        _browserDropOverlay = null;
        setTimeout(() => el.remove(), 200);
    }

    function _extractUrlFromDrop(e) {
        const uriList = e.dataTransfer.getData('text/uri-list');
        if (uriList) {
            const first = uriList.split('\n').map(s => s.trim()).find(s => s && !s.startsWith('#'));
            if (first && (first.startsWith('http://') || first.startsWith('https://'))) return first;
        }
        const plain = e.dataTransfer.getData('text/plain');
        if (plain && (plain.startsWith('http://') || plain.startsWith('https://'))) return plain.trim();
        return null;
    }

    function _extractTitleFromHtml(html) {
        try {
            const parser = new DOMParser();
            const doc    = parser.parseFromString(html, 'text/html');
            const a      = doc.querySelector('a');
            if (a) {
                const t = a.textContent.trim();
                if (t) return t;
            }
            const title = doc.querySelector('title');
            if (title) {
                const t = title.textContent.trim();
                if (t) return t;
            }
        } catch (_) {}
        return '';
    }

    function _normalizeUrl(url) {
        try {
            const u = new URL(url);
            u.hash = '';
            return u.href.replace(/\/$/, '');
        } catch (_) { return url; }
    }

    async function _resolveTitleForUrl(url, htmlHint) {
        if (htmlHint) {
            const fromHtml = _extractTitleFromHtml(htmlHint);
            if (fromHtml) return fromHtml;
        }

        const normalized = _normalizeUrl(url);

        try {
            const tabs = await chrome.tabs.query({});
            const tab  = tabs.find(t => _normalizeUrl(t.url) === normalized);
            if (tab && tab.title && tab.title !== url) return tab.title;
        } catch (_) {}

        try {
            const results = await chrome.bookmarks.search({ url });
            const match   = results.find(b => _normalizeUrl(b.url) === normalized && b.title);
            if (match) return match.title;
        } catch (_) {}

        try { return new URL(url).hostname; } catch (_) { return url; }
    }

    function _attachBrowserDropListeners() {
        const main = document.querySelector('.main-content');
        if (!main) return;

        main.addEventListener('dragenter', e => {
            if (_dragged) return;
            if (!_isBrowserDrag(e)) return;
            e.preventDefault();
            _browserDropCounter++;
            _showBrowserDropOverlay();
        });

        main.addEventListener('dragleave', () => {
            if (_dragged) return;
            _browserDropCounter--;
            if (_browserDropCounter <= 0) {
                _browserDropCounter = 0;
                _hideBrowserDropOverlay();
            }
        });

        main.addEventListener('dragover', e => {
            if (_dragged) return;
            if (!_isBrowserDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        main.addEventListener('drop', async e => {
            if (_dragged) return;
            _browserDropCounter = 0;
            _hideBrowserDropOverlay();

            const url = _extractUrlFromDrop(e);
            if (!url) return;

            e.preventDefault();
            e.stopPropagation();

            let htmlHint = '';
            try { htmlHint = e.dataTransfer.getData('text/html'); } catch (_) {}

            const title = await _resolveTitleForUrl(url, htmlHint);

            const { getData, getItemByUid, getCurrentFolderId, generateFolderUid,
                    saveAndRefresh, showNotification, getMessage, resetInactivityTimer } = _deps;

            const data     = getData();
            const fid      = getCurrentFolderId();
            const uid      = generateFolderUid();
            const bookmark = { type: 'bookmark', title, url, dateAdded: Date.now(), uid };

            if (fid && fid !== 'all') {
                const folder = getItemByUid(data, fid);
                if (folder?.children) {
                    folder.children.push(bookmark);
                } else {
                    data.folders.push(bookmark);
                }
            } else {
                data.folders.push(bookmark);
            }

            await saveAndRefresh();
            showNotification(getMessage('bookmarkAdded'));
            resetInactivityTimer?.();
        });
    }

    function refreshDraggable() {
        document.querySelectorAll('#bookmarks-grid .tree-item').forEach(el => {
            el.setAttribute('draggable', 'true');
        });
    }

    function _buildForbiddenSet(item) {
        const set = new Set();
        if (!item || item.type !== 'folder') return set;
        set.add(item.uid);
        (function collect(folder) {
            if (!folder.children) return;
            for (const child of folder.children) {
                if (child.uid) set.add(child.uid);
                if (child.type === 'folder') collect(child);
            }
        })(item);
        return set;
    }

    function _attachGridListeners() {
        const grid = document.getElementById('bookmarks-grid');
        if (!grid) return;
        grid.addEventListener('dragstart', _onGridDragStart);
        grid.addEventListener('dragend',   _onGridDragEnd);
        grid.addEventListener('dragover',  _onGridDragOver);
        grid.addEventListener('dragleave', _onGridDragLeave);
        grid.addEventListener('drop',      _onGridDrop);
    }

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

    function _onGridDragStart(e) {
        const el = e.target.closest('.tree-item');
        if (!el) { e.preventDefault(); return; }

        const index = parseInt(el.dataset.index, 10);
        if (isNaN(index)) { e.preventDefault(); return; }

        const allItems = ManagerBookmarks.getBookmarksForFolder(_deps.getCurrentFolderId());
        const item     = allItems[index];
        if (!item || !item.uid) { e.preventDefault(); return; }

        _dragged    = item;
        _draggedUid = item.uid;
        _draggedEl  = el;
        _isFolder   = item.type === 'folder';
        _forbiddenUids = _buildForbiddenSet(item);

        el.classList.add('dragging');
        if (typeof QuickActions !== 'undefined') QuickActions.closeAll();

        _ghostEl = window.HolyShared.dragCreateGhost(el, e.clientX, e.clientY, GHOST_X, GHOST_Y);

        const blank = Object.assign(document.createElement('div'), { style: 'opacity:0' });
        document.body.appendChild(blank);
        e.dataTransfer.setDragImage(blank, 0, 0);
        setTimeout(() => blank.remove(), 0);

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({ action: 'manager-drag', uid: _draggedUid }));

        const _onMove = ev => {
            _latestGhostPos = { x: ev.clientX, y: ev.clientY };
            if (!_ghostRafPending) {
                _ghostRafPending = true;
                requestAnimationFrame(() => {
                    _ghostRafPending = false;
                    if (_ghostEl && _latestGhostPos) {
                        window.HolyShared.dragMoveGhost(_ghostEl, _latestGhostPos.x, _latestGhostPos.y, GHOST_X, GHOST_Y);
                    }
                });
            }
        };
        const _onEnd = () => {
            document.removeEventListener('dragover', _onMove);
            document.removeEventListener('dragend',  _onEnd);
        };
        document.addEventListener('dragover', _onMove);
        document.addEventListener('dragend',  _onEnd);

        _escHandler = window.HolyShared.dragHandleEscape(
            () => !!_dragged,
            () => { _resetState(); }
        );
    }

    function _onGridDragEnd() {
        if (_draggedEl) _draggedEl.classList.remove('dragging');
        if (_ghostEl)   { _ghostEl.remove(); _ghostEl = null; }
        if (_escHandler){ document.removeEventListener('keydown', _escHandler); _escHandler = null; }
        _clearGridIndicators();
        _clearSidebarIndicators();
        _resetState();
    }

    function _resetState() {
        _dragged         = null;
        _draggedUid      = null;
        _draggedEl       = null;
        _isFolder        = false;
        _forbiddenUids   = null;
        _rafPending      = false;
        _latestDragOver  = null;
        _lastIndicatorEl = null;
        _ghostRafPending = false;
        _latestGhostPos  = null;
    }

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
            _clearLastIndicator();
            return;
        }

        const targetUid = target.dataset.folderUid || target.dataset.itemUid;
        if (_forbiddenUids?.has(targetUid)) {
            _clearLastIndicator();
            return;
        }

        const rect           = target.getBoundingClientRect();
        const relY           = e.clientY - rect.top;
        const zone           = rect.height * 0.25;
        const isTargetFolder = target.classList.contains('tree-item--folder');

        let newClass;
        if (isTargetFolder && relY > zone && relY < rect.height - zone) {
            newClass = 'drop-into-folder';
        } else {
            newClass = relY <= rect.height / 2 ? 'drop-above' : 'drop-below';
        }

        if (_lastIndicatorEl !== target) {
            _clearLastIndicator();
            _lastIndicatorEl = target;
        } else {
            target.classList.remove('drop-above', 'drop-below', 'drop-into-folder');
        }

        target.classList.add(newClass);
    }

    function _onGridDragLeave(e) {
        const target = e.target.closest('.tree-item');
        if (target) target.classList.remove('drop-above', 'drop-below', 'drop-into-folder');
    }

    function _onGridDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!_dragged || !_draggedUid) return;

        _clearGridIndicators();

        const target = e.target.closest('.tree-item');
        if (!target || target === _draggedEl) return;

        const targetUid = target.dataset.folderUid || target.dataset.itemUid;
        if (!targetUid || targetUid === _draggedUid) return;
        if (_forbiddenUids?.has(targetUid)) return;

        const rect           = target.getBoundingClientRect();
        const relY           = e.clientY - rect.top;
        const zone           = rect.height * 0.25;
        const isTargetFolder = target.classList.contains('tree-item--folder');
        const dropInto       = isTargetFolder && relY > zone && relY < rect.height - zone;

        if (dropInto) {
            _applyMoveIntoFolder(targetUid);
        } else {
            _applyMoveRelative(targetUid, relY <= rect.height / 2);
        }
    }

    function _onSidebarDragOver(e) {
        if (!_dragged) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const folderEl = e.target.closest('.folder-item') || e.target.closest('.all-bookmarks');
        if (!folderEl) return;
        if (_draggedEl && folderEl.contains(_draggedEl)) return;

        const targetUid = folderEl.dataset.folderUid || 'all';
        if (_forbiddenUids?.has(targetUid)) return;

        _clearSidebarIndicators();
        folderEl.classList.add('drop-target');
    }

    function _onSidebarDragLeave(e) {
        const folderEl = e.target.closest('.folder-item') || e.target.closest('.all-bookmarks');
        if (folderEl) folderEl.classList.remove('drop-target');
    }

    function _onSidebarDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!_dragged || !_draggedUid) return;

        _clearSidebarIndicators();

        const folderEl  = e.target.closest('.folder-item') || e.target.closest('.all-bookmarks');
        if (!folderEl) return;
        folderEl.classList.remove('drop-target');

        const targetUid = folderEl.dataset.folderUid || null;
        if (_forbiddenUids?.has(targetUid)) return;

        const data          = _deps.getData();
        const sourceArr     = _deps.getParentArrayForItemUid(data, _draggedUid);
        const sourceIsRoot  = sourceArr === data.folders;
        const targetIsRoot  = !targetUid || targetUid === 'all';

        const sourceParentFolder = sourceIsRoot ? null : (() => {
            function find(items) {
                for (const item of items) {
                    if (item.type === 'folder' && item.children === sourceArr) return item;
                    if (item.type === 'folder' && item.children) { const f = find(item.children); if (f) return f; }
                }
                return null;
            }
            return find(data.folders);
        })();

        if ((sourceIsRoot && targetIsRoot) || (sourceParentFolder?.uid && sourceParentFolder.uid === targetUid)) {
            _deps.showNotification(_deps.getMessage('bookmarkAlreadyInFolder'), true);
            return;
        }

        _applyMoveIntoFolder(targetIsRoot ? null : targetUid);
    }

    async function _applyMoveIntoFolder(targetFolderUid) {
        const { getData, getItemByUid, getParentArrayForItemUid,
                saveChanges, showNotification, getMessage,
                renderFolderTree, renderBookmarks, resetInactivityTimer } = _deps;

        const data      = getData();
        const sourceArr = getParentArrayForItemUid(data, _draggedUid);
        if (!sourceArr) return;

        const sourceIdx = sourceArr.indexOf(_dragged);
        if (sourceIdx === -1) return;

        let targetArr;
        if (!targetFolderUid) {
            targetArr = data.folders;
        } else {
            const folder = getItemByUid(data, targetFolderUid);
            if (!folder || folder.type !== 'folder') {
                showNotification(getMessage('invalidDestinationFolder'), true); return;
            }
            if (!Array.isArray(folder.children)) folder.children = [];
            targetArr = folder.children;
        }

        if (targetArr === sourceArr) return;

        sourceArr.splice(sourceIdx, 1);
        targetArr.push(_dragged);
        _dragged.dateModified = Date.now();

        await saveChanges();
        ManagerBookmarks.clearBookmarksCache();
        renderFolderTree();
        await ManagerBookmarks.renderBookmarksPreservingScroll();
        showNotification(getMessage('dragSuccess'));
        resetInactivityTimer();
    }

    async function _applyMoveRelative(targetUid, insertAbove) {
        const { getData, getAnyItemByUid, getParentArrayForItemUid,
                saveChanges, showNotification, getMessage,
                renderFolderTree, renderBookmarks, resetInactivityTimer } = _deps;

        const data      = getData();
        const targetItem = getAnyItemByUid(data, targetUid);
        if (!targetItem || targetItem === _dragged) return;

        const sourceArr = getParentArrayForItemUid(data, _draggedUid);
        const targetArr = getParentArrayForItemUid(data, targetUid);
        if (!sourceArr || !targetArr) return;

        const sourceIdx = sourceArr.indexOf(_dragged);
        const targetIdx = targetArr.indexOf(targetItem);
        if (sourceIdx === -1 || targetIdx === -1) return;

        sourceArr.splice(sourceIdx, 1);

        let insertPos = insertAbove ? targetIdx : targetIdx + 1;
        if (sourceArr === targetArr && sourceIdx < targetIdx) insertPos--;

        targetArr.splice(insertPos, 0, _dragged);
        _dragged.dateModified = Date.now();

        await saveChanges();
        ManagerBookmarks.clearBookmarksCache();
        renderFolderTree();
        await ManagerBookmarks.renderBookmarksPreservingScroll();
        showNotification(getMessage('dragSuccess'));
        resetInactivityTimer();
    }

    function _clearLastIndicator() {
        if (_lastIndicatorEl) {
            _lastIndicatorEl.classList.remove('drop-above', 'drop-below', 'drop-into-folder');
            _lastIndicatorEl = null;
        }
    }

    function _clearGridIndicators() {
        _clearLastIndicator();
        const grid = document.getElementById('bookmarks-grid');
        window.HolyShared.dragClearIndicators(grid || undefined);
    }

    function _clearSidebarIndicators() {
        const sidebar = document.querySelector('.sidebar');
        window.HolyShared.dragClearIndicators(sidebar || undefined);
    }

    return { init, refreshDraggable };

})();

if (typeof window !== 'undefined') window.ManagerDragDrop = ManagerDragDrop;
if (typeof module !== 'undefined') module.exports = ManagerDragDrop;

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

const TreeItemFactory = (function () {

    const FOLDER_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    const BOOKMARK_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 4C5 2.89543 5.89543 2 7 2H17C18.1046 2 19 2.89543 19 4V21L12 17L5 21V4Z" fill="currentColor"/></svg>`;
    const QA_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>`;

    function _makeQATrigger(title) {
        const btn = document.createElement('button');
        btn.className = 'quick-actions-trigger';
        btn.title = title;
        btn.innerHTML = QA_SVG;
        return btn;
    }

    function createBookmarkItem(item, { escapeHtml, getDomainFromUrl, getMessage, isFaviconEnabled, loadFaviconAsync, showActions = true }) {
        const domain = getDomainFromUrl(item.url);

        const iconSpan = document.createElement('span');
        iconSpan.className = 'tree-item__icon icon bookmark';
        iconSpan.innerHTML = BOOKMARK_SVG;

        const titleSpan = document.createElement('span');
        titleSpan.className = 'bookmark-title';
        titleSpan.textContent = item.title;

        const domainSpan = document.createElement('span');
        domainSpan.className = 'item-domain';
        domainSpan.textContent = domain;

        const body = document.createElement('div');
        body.className = 'tree-item__body';
        body.appendChild(titleSpan);

        const header = document.createElement('div');
        header.className = 'item-header';
        header.appendChild(iconSpan);
        header.appendChild(body);
        header.appendChild(domainSpan);
        if (showActions) header.appendChild(_makeQATrigger(getMessage('actions')));

        const link = document.createElement('div');
        link.className = 'bookmark-link';
        link.dataset.url = item.url;
        link.appendChild(header);

        const div = document.createElement('div');
        div.className = 'tree-item';
        if (item.uid) div.dataset.itemUid = item.uid;
        div.appendChild(link);

        if (isFaviconEnabled && isFaviconEnabled() && loadFaviconAsync) {
            loadFaviconAsync(item.url, iconSpan);
        } else if (!isFaviconEnabled && loadFaviconAsync) {
            loadFaviconAsync(item.url, iconSpan);
        }

        return div;
    }

    function createFolderItem(item, { escapeHtml, getMessage, countItemsInFolder, withArrow = false }) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'tree-item__icon folder-icon';
        iconSpan.innerHTML = FOLDER_SVG;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'bookmark-title folder-name';
        nameSpan.textContent = item.name;

        const body = document.createElement('div');
        body.className = 'tree-item__body';
        body.appendChild(nameSpan);

        const badge = document.createElement('span');
        badge.className = 'folder-badge';
        badge.textContent = countItemsInFolder(item);

        const header = document.createElement('div');
        header.className = 'item-header';

        if (withArrow) {
            const arrow = document.createElement('span');
            arrow.className = 'arrow';
            arrow.textContent = '▶';
            header.appendChild(arrow);
        }

        header.appendChild(iconSpan);
        header.appendChild(body);
        header.appendChild(badge);
        header.appendChild(_makeQATrigger(getMessage('actions')));

        const link = document.createElement('div');
        link.className = 'bookmark-link';
        link.appendChild(header);

        const div = document.createElement('div');
        div.className = 'tree-item tree-item--folder';
        if (item.uid) div.dataset.folderUid = item.uid;
        div.appendChild(link);

        return div;
    }

    return { createBookmarkItem, createFolderItem };

})();

if (typeof window !== 'undefined') window.TreeItemFactory = TreeItemFactory;
if (typeof module !== 'undefined') module.exports = TreeItemFactory;

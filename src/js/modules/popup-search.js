/*
 * Holy Private Bookmarks — Encrypted Local Bookmark Manager
 * Copyright (C) 2026 OSV IT-Studio
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Source code: https://github.com/OSV-IT-Studio/holy-private-bookmarks
 */

// MODULE: popup-search.js
// Handles: full-text search across all bookmarks in the popup

const PopupSearch = (function () {

    let _deps = {};
    let _debounceTimer = null;
    let _active = false;

    function _collectAllBookmarks(items, results = []) {
        if (!Array.isArray(items)) return results;
        for (const item of items) {
            if (item.type === 'bookmark') {
                results.push(item);
            } else if (item.type === 'folder' && Array.isArray(item.children)) {
                _collectAllBookmarks(item.children, results);
            }
        }
        return results;
    }

    function _search(query) {
        const { getData, getMessage, getDomainFromUrl, isFaviconEnabled,
                loadFaviconAsync, openInPrivateTab, isAlwaysIncognito,
                showNotification, editBookmark, deleteBookmark, copyBookmarkUrl,
                escapeHtml } = _deps;

        const tree = document.getElementById('tree');
        if (!tree) return;

        const q = query.trim().toLowerCase();

        if (!q) {
            _active = false;
            _deps.renderTree();
            return;
        }

        _active = true;

        const data = getData();
        if (!data || !data.folders) {
            _renderSearchResults([], q, tree);
            return;
        }

        const all = _collectAllBookmarks(data.folders);
        const matched = all.filter(item => {
            const titleMatch = item.title?.toLowerCase().includes(q);
            const urlMatch   = item.url?.toLowerCase().includes(q);
            return titleMatch || urlMatch;
        });

        _renderSearchResults(matched, q, tree);
    }

    function _highlight(text, query) {
        if (!text || !query) return text || '';
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return text.replace(new RegExp(`(${escaped})`, 'gi'),
            '<mark class="search-highlight">$1</mark>');
    }

    function _renderSearchResults(results, query, tree) {
        const { getMessage, getDomainFromUrl, escapeHtml } = _deps;

        tree.innerHTML = '';

        if (results.length === 0) {
            tree.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state__icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                    </div>
                    <h3 class="empty-state__title">${getMessage('noSearchResults')}</h3>
                    <p class="empty-state__text">${getMessage('noSearchResultsDesc')}</p>
                </div>
            `;
            return;
        }

        const safeQuery = query ? escapeHtml(query) : '';
        const fragment  = document.createDocumentFragment();

        for (const item of results) {
            const div = PopupTree.createBookmarkElement(item, [], { noActions: true });
            div.removeAttribute('draggable');
            div.removeAttribute('data-drag-ready');
            const domain     = getDomainFromUrl ? getDomainFromUrl(item.url) : '';
            const safeTitle  = item.title ? escapeHtml(item.title) : '';
            const safeDomain = domain ? escapeHtml(domain) : escapeHtml(item.url || '');

            const titleSpan  = div.querySelector('.bookmark-title');
            const domainSpan = div.querySelector('.item-domain');
            if (titleSpan)  titleSpan.innerHTML  = _highlight(safeTitle,  safeQuery);
            if (domainSpan) domainSpan.innerHTML = _highlight(safeDomain, safeQuery);

            fragment.appendChild(div);
        }

        tree.appendChild(fragment);
    }

    function _onInput(e) {
        const query = e.target.value;
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => _search(query), 200);
    }

    function init(deps) {
        Object.assign(_deps, deps);

        const input    = document.getElementById('search-input');

        if (!input) return;

        input.addEventListener('input', _onInput);
        input.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                input.value = '';
                _active = false;
                _deps.renderTree();
            }
        });
    }

    function reset() {
        if (!_active) return;
        const input = document.getElementById('search-input');
        if (input) input.value = '';
        _active = false;
        _deps.renderTree?.();
    }

    function isActive() {
        return _active;
    }

    return { init, reset, isActive };

})();

if (typeof window !== 'undefined') window.PopupSearch = PopupSearch;
if (typeof module !== 'undefined') module.exports = PopupSearch;
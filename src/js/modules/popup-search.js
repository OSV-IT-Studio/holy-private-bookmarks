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
        const { getMessage, getDomainFromUrl, isFaviconEnabled,
                loadFaviconAsync, openInPrivateTab, isAlwaysIncognito,
                copyBookmarkUrl, editBookmark, deleteBookmark,
                showNotification, escapeHtml } = _deps;

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

        const fragment = document.createDocumentFragment();

        for (const item of results) {
            const div = document.createElement('div');
            div.className = 'tree-item';
            if (item.uid) div.dataset.itemUid = item.uid;

            const domain = getDomainFromUrl ? getDomainFromUrl(item.url) : '';
            const safeTitle = item.title ? escapeHtml(item.title) : '';
            const safeUrl   = item.url   ? escapeHtml(item.url)   : '';
            const safeQuery = query ? escapeHtml(query) : '';

            const highlightedTitle  = _highlight(safeTitle,  safeQuery);
            const highlightedDomain = _highlight(domain || safeUrl, safeQuery);

            const link = document.createElement('div');
            link.className   = 'bookmark-link';
            link.dataset.url = item.url;

            const header = document.createElement('div');
            header.className = 'item-header';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'item-title';

            const iconSpan = document.createElement('span');
            iconSpan.className = 'icon bookmark';
            iconSpan.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 4C5 2.89543 5.89543 2 7 2H17C18.1046 2 19 2.89543 19 4V21L12 17L5 21V4Z" fill="currentColor"/>
                </svg>
            `;

            const textSpan = document.createElement('span');
            textSpan.className = 'bookmark-title';
            textSpan.innerHTML = highlightedTitle;

            const domainSpan = document.createElement('span');
            domainSpan.className = 'item-domain';
            domainSpan.innerHTML = highlightedDomain;

            const quickActionsTrigger = document.createElement('button');
            quickActionsTrigger.className = 'quick-actions-trigger';
            quickActionsTrigger.title = getMessage('actions');
            quickActionsTrigger.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>';

            titleDiv.appendChild(iconSpan);
            titleDiv.appendChild(textSpan);
            titleDiv.appendChild(quickActionsTrigger);
            header.appendChild(titleDiv);
            header.appendChild(domainSpan);
            link.appendChild(header);
            div.appendChild(link);

            link.addEventListener('click', e => {
                if (e.target.closest('.quick-actions-hover') || e.target.closest('.quick-actions-trigger')) return;
                if (isAlwaysIncognito && isAlwaysIncognito()) {
                    openInPrivateTab(item.url);
                } else {
                    chrome.tabs.create({ url: item.url, active: !e.ctrlKey && !e.metaKey });
                }
            });

            if (isFaviconEnabled && isFaviconEnabled() && loadFaviconAsync) {
                loadFaviconAsync(item.url, iconSpan);
            }

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
        const input = document.getElementById('search-input');
        if (input) input.value = '';
        _active = false;
    }

    function isActive() {
        return _active;
    }

    return { init, reset, isActive };

})();

if (typeof window !== 'undefined') window.PopupSearch = PopupSearch;
if (typeof module !== 'undefined') module.exports = PopupSearch;
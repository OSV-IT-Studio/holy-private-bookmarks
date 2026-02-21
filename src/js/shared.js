/*
 * Holy Private Bookmarks — Encrypted Local Bookmark Manager
 * Copyright (C) 2026 OSV-IT-Studio
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

(function() {


    const STORAGE_KEY = 'holyPrivateData';
    const INACTIVITY_TIMEOUT = 10 * 60 * 1000; 
    const BOOKMARKS_PER_PAGE = 50;
	const FAVICON_ENABLED_KEY = 'holyFaviconEnabled';
    const VIRTUAL_SCROLL_CONFIG = {
        initialLoadCount: 50,
        batchSize: 10,
        loadMoreCount: 30,
        renderDelay: 5
    };

    class LRUMap extends Map {
        constructor(maxSize = 100) {
            super();
            this.maxSize = maxSize;
        }

        set(key, value) {
            if (this.size >= this.maxSize) {
                const firstKey = this.keys().next().value;
                this.delete(firstKey);
            }
            super.set(key, value);
        }
    }

    
    const messageCache = new LRUMap(50);
    const faviconCache = new LRUMap(200);
    const faviconPromises = new Map();

    let elementCache = {};


    const virtualScrollCache = {
        folders: new Map(),
        visibleItems: new Set(),
        scrollPositions: new Map(),
        renderQueue: [],
        isRendering: false,
        totalItemsCount: 0,
        
        clear() {
            this.folders.clear();
            this.visibleItems.clear();
            this.scrollPositions.clear();
            this.renderQueue = [];
            this.totalItemsCount = 0;
        },
        
        getFolderContainer(path) {
            const pathKey = path.join(',');
            if (!this.folders.has(pathKey)) {
                this.folders.set(pathKey, {
                    items: [],
                    visibleStart: 0,
                    visibleCount: VIRTUAL_SCROLL_CONFIG.initialLoadCount,
                    isLoading: false,
                    hasMore: true,
                    scrollTop: 0,
                    container: null,
                    totalItems: 0,
                    isOpen: false
                });
            }
            return this.folders.get(pathKey);
        }
    };

function isFaviconEnabled() {
    const stored = localStorage.getItem(FAVICON_ENABLED_KEY);
    return stored === 'true'; 
}

function setFaviconEnabled(enabled) {
    localStorage.setItem(FAVICON_ENABLED_KEY, enabled.toString());
    

    if (faviconCache) faviconCache.clear();
    if (faviconPromises) faviconPromises.clear();
}    

    function getCachedElement(selector) {
        if (!elementCache[selector]) {
            elementCache[selector] = document.querySelector(selector);
        }
        return elementCache[selector];
    }

   
    function clearElementCache() {
        elementCache = {};
    }

   
    function getMessage(key, substitutions = []) {
        if (messageCache.has(key)) {
            return messageCache.get(key);
        }
        
        try {
            const message = chrome.i18n.getMessage(key, substitutions);
            if (message) {
                messageCache.set(key, message);
                return message;
            }
        } catch (e) {
            console.warn('Error getting message for key:', key, e);
        }
        
        return key;
    }

    
    function normalizePath(path) {
        if (!Array.isArray(path)) return [];
        return path.filter(i => Number.isInteger(i) && i >= 0);
    }

    
    function getItemByPath(data, path) {
        if (!data || !data.folders) return null;
        
        let current = data.folders;
        for (let i = 0; i < path.length; i++) {
            const idx = path[i];
            if (i === path.length - 1) {
                return current[idx];
            }
            if (current[idx] && current[idx].type === 'folder' && current[idx].children) {
                current = current[idx].children;
            } else {
                return null;
            }
        }
        return null;
    }

    
    function getParentByPath(data, path) {
        if (!data || !data.folders) return data?.folders || [];
        
        if (!path || path.length === 0) {
            return data.folders;
        }
        
        let current = data.folders;
        
        for (const idx of path) {
            if (current[idx] && current[idx].type === 'folder' && current[idx].children) {
                current = current[idx].children;
            } else {
                return data.folders;
            }
        }
        
        return current;
    }

    
    function removeItemByPath(data, path) {
        if (!data || !data.folders || path.length === 0) return false;
        
        const parent = getParentByPath(data, path.slice(0, -1));
        const indexToRemove = path[path.length - 1];
        
        if (parent && parent[indexToRemove]) {
            parent.splice(indexToRemove, 1);
            return true;
        }
        
        return false;
    }

    
    function findItemPath(data, item, items = data?.folders || [], currentPath = []) {
        if (!data || !items) return null;
        
        for (let i = 0; i < items.length; i++) {
            const currentItem = items[i];
            const path = [...currentPath, i];
            
            if (currentItem === item) {
                return path;
            }
            
            if (currentItem.type === 'folder' && currentItem.children) {
                const found = findItemPath(data, item, currentItem.children, path);
                if (found) return found;
            }
        }
        return null;
    }

    
    function findFolderById(items, folderId, path = []) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            if (item.type === 'folder') {
                const currentPath = [...path, i];
                const currentId = currentPath.join(',');
                
                if (currentId === folderId) {
                    return item;
                }
                
                if (item.children && item.children.length > 0) {
                    const found = findFolderById(item.children, folderId, currentPath);
                    if (found) return found;
                }
            }
        }
        return null;
    }

    
    function getFolderPathById(folderId) {
        const parts = folderId.split(',').map(Number);
        return parts;
    }

    
    function isAncestor(ancestor, descendant) {
        if (descendant.length <= ancestor.length) return false;
        for (let i = 0; i < ancestor.length; i++) {
            if (ancestor[i] !== descendant[i]) return false;
        }
        return true;
    }

    
    function arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    
    function countItemsInFolder(folder) {
        if (!folder || !folder.children) return 0;
        
        let count = 0;
        
        function countRecursive(items) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type === 'bookmark') {
                    count++;
                } else if (item.type === 'folder' && item.children) {
                    countRecursive(item.children);
                }
            }
        }
        
        countRecursive(folder.children);
        return count;
    }

    
    function countFoldersInFolder(folder) {
        if (!folder || !folder.children) return 0;
        
        let count = 0;
        
        function countRecursive(items) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type === 'folder') {
                    count++;
                    if (item.children && item.children.length > 0) {
                        countRecursive(item.children);
                    }
                }
            }
        }
        
        countRecursive(folder.children);
        return count;
    }

    
    function countAllBookmarks(data) {
        if (!data || !data.folders) return 0;
        
        let count = 0;
        
        function countRecursive(items) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type === 'bookmark') {
                    count++;
                } else if (item.type === 'folder' && item.children) {
                    countRecursive(item.children);
                }
            }
        }
        
        countRecursive(data.folders);
        return count;
    }

    
    function getBookmarksForFolder(data, folderId, searchQuery = '', cache = null, version = 0) {
        if (!data || !data.folders) return [];
        
        const cacheKey = `${folderId}_${searchQuery}`;
        
        if (cache && cache.has(cacheKey) && cache.get(cacheKey).version === version) {
            return cache.get(cacheKey).bookmarks;
        }
        
        const bookmarks = [];
        
        if (folderId === 'all') {
            function collectAllBookmarks(items) {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.type === 'bookmark') {
                        bookmarks.push(item);
                    } else if (item.type === 'folder' && item.children) {
                        collectAllBookmarks(item.children);
                    }
                }
            }
            collectAllBookmarks(data.folders);
        } else {
            const folder = findFolderById(data.folders, folderId);
            if (folder && folder.children) {
                function collectBookmarksFromFolder(items) {
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        if (item.type === 'bookmark') {
                            bookmarks.push(item);
                        } else if (item.type === 'folder' && item.children) {
                            collectBookmarksFromFolder(item.children);
                        }
                    }
                }
                collectBookmarksFromFolder(folder.children);
            }
        }
        
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const filtered = bookmarks.filter(bookmark => 
                bookmark.title.toLowerCase().includes(query) || 
                bookmark.url.toLowerCase().includes(query)
            );
            
            if (cache) {
                cache.set(cacheKey, { bookmarks: filtered, version });
            }
            
            return filtered;
        }
        
        if (cache) {
            cache.set(cacheKey, { bookmarks, version });
        }
        
        return bookmarks;
    }

   
    async function getFaviconUrl(url) {
        try {
            const urlObj = new URL(url);
            return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
        } catch {
            return null;
        }
    }

   
    function getDomainFromUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch {
            return '';
        }
    }

    
    async function getFaviconWithCache(url) {

    if (!isFaviconEnabled()) {
        return null;
    }
    
    if (faviconCache.has(url)) {
        return faviconCache.get(url);
    }
    
    if (faviconPromises.has(url)) {
        return faviconPromises.get(url);
    }
    
    const promise = getFaviconUrl(url).then(favicon => {
        faviconCache.set(url, favicon);
        faviconPromises.delete(url);
        return favicon;
    }).catch(() => null);
    
    faviconPromises.set(url, promise);
    return promise;
}

   
    async function loadFaviconAsync(url, iconElement) {

    if (!isFaviconEnabled()) {
        return;
    }
    
    if (!iconElement || !iconElement.parentNode) return;
    
    if (faviconCache.has(url)) {
        const faviconUrl = faviconCache.get(url);
        if (faviconUrl) {
            updateIconWithFavicon(iconElement, faviconUrl);
        }
        return;
    }
    
    if (faviconPromises.has(url)) {
        const faviconUrl = await faviconPromises.get(url);
        if (faviconUrl) {
            updateIconWithFavicon(iconElement, faviconUrl);
        }
        return;
    }
    
    const promise = getFaviconUrl(url).then(faviconUrl => {
        faviconCache.set(url, faviconUrl);
        faviconPromises.delete(url);
        return faviconUrl;
    }).catch(error => {
        faviconPromises.delete(url);
        return null;
    });
    
    faviconPromises.set(url, promise);
    
    const faviconUrl = await promise;
    if (faviconUrl) {
        updateIconWithFavicon(iconElement, faviconUrl);
    }
}

    function updateIconWithFavicon(iconElement, faviconUrl) {
        if (!iconElement || !iconElement.parentNode) return;
        
        const faviconImg = document.createElement('img');
        faviconImg.src = faviconUrl;
        faviconImg.style.cssText = 'width: 16px; height: 16px; margin-right: 8px; border-radius: 2px;';
        faviconImg.loading = 'lazy';
        faviconImg.onerror = () => faviconImg.remove();
        
        iconElement.parentNode.replaceChild(faviconImg, iconElement);
    }

    
    function buildFolderOptions(items, select, prefix = '', depth = 0) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item || item.type !== 'folder') continue;
            
            const option = document.createElement('option');
            option.value = prefix ? `${prefix}/${i}` : i.toString();
            option.textContent = '— '.repeat(depth) + item.name;
            select.appendChild(option);
            
            if (Array.isArray(item.children) && item.children.length > 0) {
                const newPrefix = prefix ? `${prefix}/${i}` : i.toString();
                buildFolderOptions(item.children, select, newPrefix, depth + 1);
            }
        }
    }

    
    async function saveEncrypted(data, salt, CryptoManager) {
        try {
            const encrypted = await CryptoManager.encrypt(JSON.stringify(data));
            await chrome.storage.local.set({ 
                [STORAGE_KEY]: { 
                    salt: Array.from(salt), 
                    encrypted 
                } 
            });
            return true;
        } catch (e) {
            console.error('Save error:', e);
            return false;
        }
    }

   
    function showNotification(message, isError = false, duration = 2000) {
        const oldNotifications = document.querySelectorAll('.notification');
        oldNotifications.forEach(notification => notification.remove());
        
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        
        if (isError) {
            notification.style.background = 'rgba(255, 64, 96, 0.9)';
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, duration);
    }

    
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    
    function openInPrivateTab(url, showNotificationFn = showNotification, getMessageFn = getMessage) {
        try {
            if (chrome.windows && chrome.windows.create) {
                chrome.windows.create({
                    url: url,
                    incognito: true,
                    focused: true
                });
            } else {
                window.open(url, '_blank');
            }
        } catch (error) {
            console.error('Error opening private tab:', error);
            if (showNotificationFn) {
                showNotificationFn(getMessageFn('privateTabError') || 'Cannot open private tab', true);
            }
        }
    }

    
    function convertChromeBookmarks(chromeNodes) {
        const result = [];
        
        for (const node of chromeNodes) {
            if (node.url) {
                result.push({
                    type: 'bookmark',
                    title: node.title || 'Untitled',
                    url: node.url,
                    dateAdded: Date.now()
                });
            } else if (node.children && node.children.length > 0) {
                const folder = {
                    type: 'folder',
                    name: node.title || 'Unnamed Folder',
                    children: convertChromeBookmarks(node.children),
                    dateAdded: Date.now()
                };
                
                if (folder.children.length > 0) {
                    result.push(folder);
                }
            }
        }
        
        return result;
    }

    
    function collectAllBookmarkUrls(items, urls = []) {
        for (const item of items) {
            if (item.type === 'bookmark' && item.url) {
                urls.push(item.url);
            } else if (item.type === 'folder' && item.children) {
                collectAllBookmarkUrls(item.children, urls);
            }
        }
        return urls;
    }

    

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    
    function showLoadingIndicator(container, text = 'Loading...') {
        hideLoadingIndicator(container);
        
        const loader = document.createElement('div');
        loader.className = 'folder-loader';
        loader.innerHTML = `
            <div class="spinner"></div>
            <span>${text}</span>
        `;
        container.appendChild(loader);
    }

    
    function hideLoadingIndicator(container) {
        const oldLoader = container.querySelector('.folder-loader');
        if (oldLoader) {
            oldLoader.remove();
        }
    }

    
    function ensureLoadingStyles() {
        if (document.getElementById('shared-loading-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'shared-loading-styles';
        style.textContent = `
            .loading-indicator {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                width: 100%;
                color: var(--text-secondary);
            }
            .spinner {
    display: inline-block;
            width: 24px;
            height: 24px;
            border: 3px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: var(--accent, #00d4ff);
            border-right-color: var(--accent, #00d4ff);
            animation: spin 0.8s linear infinite;
            box-sizing: border-box;
}
            
            
            .folder-loader {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                padding: 24px;
                margin: 8px 0;
                background: rgba(0, 212, 255, 0.03);
                border-radius: var(--radius-sm);
                border: 1px dashed rgba(0, 212, 255, 0.2);
                animation: loaderPulse 2s infinite ease-in-out;
            }
            
            .folder-loader .spinner {
                width: 24px;
                height: 24px;
                border: 3px solid rgba(0, 212, 255, 0.1);
                border-radius: 50%;
                border-top-color: var(--accent);
                border-right-color: var(--accent);
                animation: spin 0.8s linear infinite;
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            
            @keyframes loaderPulse {
                0%, 100% {
                    background: rgba(0, 212, 255, 0.03);
                    border-color: rgba(0, 212, 255, 0.2);
                }
                50% {
                    background: rgba(0, 212, 255, 0.06);
                    border-color: rgba(0, 212, 255, 0.4);
                }
            }
        `;
        document.head.appendChild(style);
    }

    
    if (typeof window !== 'undefined') {
        window.HolyShared = {
            
            STORAGE_KEY,
            INACTIVITY_TIMEOUT,
            BOOKMARKS_PER_PAGE,
            VIRTUAL_SCROLL_CONFIG,
            FAVICON_ENABLED_KEY,
			
            
            LRUMap,
            messageCache,
            faviconCache,
            faviconPromises,
            virtualScrollCache,
            isFaviconEnabled,
			setFaviconEnabled,
            
            getCachedElement,
            clearElementCache,
            
            
            getMessage,
            
            
            normalizePath,
            getItemByPath,
            getParentByPath,
            removeItemByPath,
            findItemPath,
            findFolderById,
            getFolderPathById,
            isAncestor,
            arraysEqual,
            
            
            countItemsInFolder,
            countFoldersInFolder,
            countAllBookmarks,
            getBookmarksForFolder,
            
            
            getFaviconUrl,
            getDomainFromUrl,
            getFaviconWithCache,
            loadFaviconAsync,
            updateIconWithFavicon,
            
           
            buildFolderOptions,
            
            
            saveEncrypted,
            
            
            showNotification,
            escapeHtml,
            
           
            openInPrivateTab,
            
            
            convertChromeBookmarks,
            collectAllBookmarkUrls,
            
            
            debounce,
            throttle,
            
            
            showLoadingIndicator,
            hideLoadingIndicator,
            ensureLoadingStyles
        };
    }

    
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            STORAGE_KEY,
            INACTIVITY_TIMEOUT,
            BOOKMARKS_PER_PAGE,
            VIRTUAL_SCROLL_CONFIG,
            
            LRUMap,
            virtualScrollCache,
            
            getMessage,
            
            normalizePath,
            getItemByPath,
            getParentByPath,
            removeItemByPath,
            findItemPath,
            findFolderById,
            getFolderPathById,
            isAncestor,
            arraysEqual,
            
            countItemsInFolder,
            countFoldersInFolder,
            countAllBookmarks,
            getBookmarksForFolder,
            
            getFaviconUrl,
            getDomainFromUrl,
            getFaviconWithCache,
            loadFaviconAsync,
            
            buildFolderOptions,
            
            saveEncrypted,
            
            showNotification,
            escapeHtml,
            
            openInPrivateTab,
            
            convertChromeBookmarks,
            collectAllBookmarkUrls,
            
            debounce,
            throttle,
            
            showLoadingIndicator,
            hideLoadingIndicator
        };
    }
})();
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

(function() {
    // CONSTANTS 
    const STORAGE_KEY = 'holyPrivateData';
    const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes
    const BOOKMARKS_PER_PAGE = 50;
    const FAVICON_ENABLED_KEY = 'holyFaviconEnabled';
    
    const VIRTUAL_SCROLL_CONFIG = {
        initialLoadCount: 50,
        batchSize: 10,
        loadMoreCount: 30,
        renderDelay: 5
    };

// LRU CACHE WITH LIMIT 
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
        
        clear() {

            for (const [key, value] of this.entries()) {
                if (value && typeof value === 'object') {
                    try {
                        if (value instanceof Uint8Array) {
                            secureWipeArray(value);
                        }
                    } catch (e) {}
                }
                this.delete(key);
            }
            super.clear();
        }
    }

// CACHES 
    const messageCache = new LRUMap(50);
    const faviconCache = new LRUMap(200);
    const faviconPromises = new Map();

    // DOM ELEMENTS 
    let elementCache = {};

    // VIRTUAL SCROLL CACHE 
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

    // MEMORY CLEARANCE 

    function secureWipeArray(array, secure = true) {
        if (!array || !(array instanceof Uint8Array)) return;
        
        try {
            if (secure) {
               
                for (let pass = 0; pass < 3; pass++) {
                    for (let i = 0; i < array.length; i++) {
                        switch(pass) {
                            case 0: array[i] = 0x00; break; 
                            case 1: array[i] = 0xFF; break; 
                            case 2: array[i] = Math.floor(Math.random() * 256); break; 
                        }
                    }
                }
            }
            
            
            for (let i = 0; i < array.length; i++) {
                array[i] = 0;
            }
        } catch (e) {
            
        }
    }


    function secureWipeString(str) {
        if (!str || typeof str !== 'string') return;
        
        try {
            const buffer = new TextEncoder().encode(str);
            secureWipeArray(buffer);
        } catch (e) {}
    }


    function wipeSensitiveData(items) {
        if (!items || !Array.isArray(items)) return;
        
        for (const item of items) {
            if (item.url) {
                secureWipeString(item.url);
                item.url = null;
            }
            if (item.title) {
                secureWipeString(item.title);
                item.title = null;
            }
            if (item.name) {
                secureWipeString(item.name);
                item.name = null;
            }
            if (item.children && Array.isArray(item.children)) {
                wipeSensitiveData(item.children);
            }
        }
    }


    function wipeUserData(data) {
        if (!data) return;
        
        try {
            
            if (data.folders && Array.isArray(data.folders)) {
                wipeSensitiveData(data.folders);
            }
            
           
            if (data._version) {
                const versionBuffer = new TextEncoder().encode(String(data._version));
                secureWipeArray(versionBuffer);
                data._version = null;
            }
            
            
            for (const key in data) {
                if (data.hasOwnProperty(key)) {
                    const value = data[key];
                    if (typeof value === 'string') {
                        secureWipeString(value);
                    } else if (Array.isArray(value)) {
                        wipeSensitiveData(value);
                    }
                    delete data[key];
                }
            }
        } catch (e) {
            console.warn('Error wiping user data:', e);
        }
    }


    function clearAllSharedCaches() {
       
        if (messageCache) {
            try {
                for (const [key, value] of messageCache.entries()) {
                    if (value && typeof value === 'string') {
                        secureWipeString(value);
                    }
                    secureWipeString(key);
                }
                messageCache.clear();
            } catch (e) {}
        }
        
        
        if (faviconCache) {
            try {
                for (const [url] of faviconCache.entries()) {
                    secureWipeString(url);
                }
                faviconCache.clear();
            } catch (e) {}
        }
        
        
        if (faviconPromises) {
            try {
                for (const [url] of faviconPromises.entries()) {
                    secureWipeString(url);
                }
                faviconPromises.clear();
            } catch (e) {}
        }
        
        
        if (virtualScrollCache) {
            try {
                if (virtualScrollCache.folders) {
                    for (const [path, data] of virtualScrollCache.folders.entries()) {
                        secureWipeString(path);
                        if (data && data.items) {
                            wipeSensitiveData(data.items);
                        }
                    }
                    virtualScrollCache.clear();
                }
            } catch (e) {}
        }
        
        
        if (elementCache) {
            try {
                for (const [selector] of Object.entries(elementCache)) {
                    secureWipeString(selector);
                }
                elementCache = {};
            } catch (e) {}
        }
    }

    // DOM ELEMENTS 
    
    function getCachedElement(selector) {
        if (!elementCache[selector]) {
            elementCache[selector] = document.querySelector(selector);
        }
        return elementCache[selector];
    }

    function clearElementCache() {
        elementCache = {};
    }

    // LOCALIZATION 
    
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

    // WORKING WITH PATHS
    
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
            
            const item = parent[indexToRemove];
            if (item.url) secureWipeString(item.url);
            if (item.title) secureWipeString(item.title);
            if (item.name) secureWipeString(item.name);
            
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

    // COUNT ELEMENTS 
    
    function countItemsInFolder(folder) {
        if (!folder) return 0;
        
        if (folder.url) {
            return 0;
        }
        
        if (folder.children && Array.isArray(folder.children)) {
            let count = 0;
            
            function countChromeBookmarks(nodes) {
                for (let i = 0; i < nodes.length; i++) {
                    const node = nodes[i];
                    if (node.url) {
                        count++;
                    } else if (node.children && node.children.length > 0) {
                        countChromeBookmarks(node.children);
                    }
                }
            }
            
            countChromeBookmarks(folder.children);
            return count;
        }
        
        if (folder.type === 'folder' && folder.children) {
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
        
        return 0;
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

    // FAVICONS 
    
    function isFaviconEnabled() {
        const stored = localStorage.getItem(FAVICON_ENABLED_KEY);
        return stored === 'true';
    }

    function setFaviconEnabled(enabled) {
        localStorage.setItem(FAVICON_ENABLED_KEY, enabled.toString());
        
        if (faviconCache) faviconCache.clear();
        if (faviconPromises) faviconPromises.clear();
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

    function updateIconWithFavicon(iconElement, faviconUrl) {
        if (!iconElement || !iconElement.parentNode) return;
        
        const faviconImg = document.createElement('img');
        faviconImg.src = faviconUrl;
        faviconImg.className = 'favicon-img';
        faviconImg.loading = 'lazy';
        faviconImg.onerror = () => faviconImg.remove();
        
        iconElement.parentNode.replaceChild(faviconImg, iconElement);
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
        }).catch(() => null);
        
        faviconPromises.set(url, promise);
        
        const faviconUrl = await promise;
        if (faviconUrl) {
            updateIconWithFavicon(iconElement, faviconUrl);
        }
    }

    // UI COMPONENTS 
    
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

    // ENCRYPTION 
    

async function saveEncrypted(data, cryptoManager) {
    try {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        const storedData = stored[STORAGE_KEY];
        
        if (!storedData) {
            throw new Error('No stored data found');
        }
        
        const encrypted = await cryptoManager.encrypt(JSON.stringify(data));
        
        await chrome.storage.local.set({ 
            [STORAGE_KEY]: {
                ...storedData,
                encrypted: encrypted
            } 
        });
        
        return true;
    } catch (e) {
        return false;
    }
}

    // NOTIFICATIONS 
    
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

    // PRIVATE TABS 
    
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
            if (showNotificationFn) {
                showNotificationFn(getMessageFn('privateTabError') || 'Cannot open private tab', true);
            }
        }
    }

    // IMPORT FROM CHROME 
    
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

    // AUXILIARY FUNCTIONS
    
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

    // LOADING INDICATORS 
    
function showLoadingIndicator(container, text = null) {
    hideLoadingIndicator(container);
    
    
    if (!document.getElementById('folder-loader-styles')) {
        const style = document.createElement('style');
        style.id = 'folder-loader-styles';
        style.textContent = `
            .loading-indicator {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                width: 100%;
                color: var(--text-secondary);
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
            
            
        `;
        document.head.appendChild(style);
    }
    const displayText = text || (window.HolyShared?.getMessage ? 
     window.HolyShared.getMessage('loading') : 'Loading...');
    
    const loader = document.createElement('div');
    loader.className = 'folder-loader';
    loader.innerHTML = `
        <div class="spinner"></div>
        <span>${displayText}</span>
    `;
    container.appendChild(loader);
}

function hideLoadingIndicator(container) {
    const oldLoader = container.querySelector('.folder-loader');
    if (oldLoader) {
        oldLoader.remove();
    }
	 const style = document.getElementById('folder-loader-styles');
    if (style) {
        style.remove();
    }
}

// GLOBAL LOADING INDICATOR 

function showGlobalLoadingIndicator(container = null, text = null) {
    hideGlobalLoadingIndicator();
    
    
    const targetContainer = container || document.body;
    
    
    if (!document.getElementById('accent-line-styles')) {
        const style = document.createElement('style');
        style.id = 'accent-line-styles';
        style.textContent = `
            .global-loader-container {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
				background: var(--bg);
                backdrop-filter: blur(12px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                border-radius: inherit;
            }
            
            .global-loader-accent-line {
                background: var(--card-bg);
				backdrop-filter: blur(20px);
				border: 1px solid var(--card-border);
				border-radius: var(--radius);
				padding: 24px;
				overflow: hidden;
				width: 100%;
				height: 100%;
				display: flex;
				justify-content: center;
				align-items: center;
            }
            
            .accent-line-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 20px;
            }
            
            .accent-line-icon {
                width: 48px;
                height: 48px;
                background: rgba(0, 212, 255, 0.1);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--accent);
                animation: pulseGlow 2s ease-in-out infinite;
            }
            
            .accent-line-icon svg {
                width: 24px;
                height: 24px;
                stroke: currentColor;
            }
            
            @keyframes pulseGlow {
                0%, 100% { box-shadow: 0 0 0 0 rgba(0, 212, 255, 0.3); }
                50% { box-shadow: 0 0 20px 5px rgba(0, 212, 255, 0.5); }
            }
            
            .accent-line-text {
                color: var(--text-primary);
                font-size: 16px;
                font-weight: 500;
                text-align: center;
            }
            
            .accent-line-progress {
                width: 100%;
                height: 4px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 2px;
                position: relative;
                overflow: hidden;
            }
            
            .accent-line-fill {
                position: absolute;
                top: 0;
                left: 0;
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, var(--accent), #a0f1ff);
                border-radius: 2px;
            }
            
            .accent-line-fill.animated {
                animation: lineProgress 2s ease-in-out infinite;
            }
            
            @keyframes lineProgress {
                0% { width: 0%; left: 0; }
                50% { width: 100%; left: 0; }
                100% { width: 0%; left: 100%; }
            }
        `;
        document.head.appendChild(style);
    }
    
    const displayText = text || (window.HolyShared?.getMessage ? 
        window.HolyShared.getMessage('Processing') : 'Processing...');
    
    
    const computedStyle = window.getComputedStyle(targetContainer);
    if (computedStyle.position === 'static') {
        targetContainer.style.position = 'relative';
    }
    
    
    const overlay = document.createElement('div');
    overlay.className = 'global-loader-container';
    
    
    const loader = document.createElement('div');
    loader.className = 'global-loader-accent-line';
    loader.innerHTML = `
        <div class="accent-line-container">
            <div class="accent-line-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
            </div>
            
            <div class="accent-line-text">${displayText}</div>
            
            <div class="accent-line-progress">
                <div class="accent-line-fill animated"></div>
            </div>
        </div>
    `;
    
    overlay.appendChild(loader);
    targetContainer.appendChild(overlay);
}

function hideGlobalLoadingIndicator(container = null) {
    if (container) {
        
        const overlay = container.querySelector('.global-loader-container');
        if (overlay) {
            overlay.remove();
        }
    } else {
        
        const overlays = document.querySelectorAll('.global-loader-container');
        overlays.forEach(overlay => overlay.remove());
    }
    
    
    if (!document.querySelector('.global-loader-container')) {
        const style = document.getElementById('accent-line-styles');
        if (style) {
            style.remove();
        }
    }
}


    // EXPORT 
    
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
            
            
            secureWipeArray,
            secureWipeString,
            wipeSensitiveData,
            wipeUserData,
            clearAllSharedCaches,
            
            
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
            
            
            isFaviconEnabled,
            setFaviconEnabled,
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
			showGlobalLoadingIndicator,  
			hideGlobalLoadingIndicator   
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
            
            secureWipeArray,
            secureWipeString,
            wipeSensitiveData,
            wipeUserData,
            clearAllSharedCaches,
            
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
            
            isFaviconEnabled,
            setFaviconEnabled,
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
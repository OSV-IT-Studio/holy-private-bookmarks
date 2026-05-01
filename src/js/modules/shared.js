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
    const BOOKMARKS_PER_PAGE = 20;
    const FAVICON_ENABLED_KEY = 'holyFaviconEnabled';
    const QUICK_CLOSE_KEY = 'holyQuickCloseEnabled';
    const ALWAYS_INCOGNITO_KEY = 'holyAlwaysIncognito';
    const BLUR_PAGE_KEY = 'holyBlurPageEnabled';
    
    const VIRTUAL_SCROLL_CONFIG = {
        initialLoadCount: 20,
        batchSize: 10,
        loadMoreCount: 20,
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

    const faviconCache = new LRUMap(200);
    const faviconPromises = new Map();

    // FAVICON QUEUE — limits concurrent favicon requests to avoid browser stall
    const _faviconQueue = [];
    let _faviconRunning = 0;
    const FAVICON_CONCURRENCY = 4;

    function _drainFaviconQueue() {
        while (_faviconRunning < FAVICON_CONCURRENCY && _faviconQueue.length > 0) {
            const { url, iconElement, force } = _faviconQueue.shift();
            _faviconRunning++;
            _loadFaviconNow(url, iconElement, force).finally(() => {
                _faviconRunning--;
                _drainFaviconQueue();
            });
        }
    }

    function _cancelFaviconQueue() {
        _faviconQueue.length = 0;
    }

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

    const secureWipeArray  = window.HolySecureUtils.secureWipeArray;
    const secureWipeString = window.HolySecureUtils.secureWipeString;


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

        // Drain pending favicon queue so locked state doesn't fire requests
        _cancelFaviconQueue();

        
        
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


    const getMessage   = window.HolyI18n.getMessage;
    const messageCache = window.HolyI18n.messageCache;
    const localizePage = window.HolyI18n.localizePage;

    // WORKING WITH PATHS
    
    function getItemByPath(data, path) {
        if (!data || !data.folders) return null;
        if (!Array.isArray(path)) return null;
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

    function arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    // COUNT ELEMENTS 

    
    function _countBookmarksRecursive(items, ref) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type === 'bookmark') {
                ref.n++;
            } else if (item.type === 'folder' && item.children) {
                _countBookmarksRecursive(item.children, ref);
            }
        }
    }

    function _countFoldersRecursive(items, ref) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type === 'folder') {
                ref.n++;
                if (item.children && item.children.length > 0) {
                    _countFoldersRecursive(item.children, ref);
                }
            }
        }
    }

    function _countChromeBookmarks(nodes, ref) {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.url) {
                ref.n++;
            } else if (node.children && node.children.length > 0) {
                _countChromeBookmarks(node.children, ref);
            }
        }
    }

    function countItemsInFolder(folder) {
        if (!folder) return 0;
        if (folder.url) return 0;

        const ref = { n: 0 };

        if (folder.children && Array.isArray(folder.children) && folder.type !== 'folder') {
            _countChromeBookmarks(folder.children, ref);
            return ref.n;
        }

        if (folder.type === 'folder' && folder.children) {
            _countBookmarksRecursive(folder.children, ref);
        }

        return ref.n;
    }

    function countFoldersInFolder(folder) {
        if (!folder || !folder.children) return 0;
        const ref = { n: 0 };
        _countFoldersRecursive(folder.children, ref);
        return ref.n;
    }

    function countAllBookmarks(data) {
        if (!data || !data.folders) return 0;
        const ref = { n: 0 };
        _countBookmarksRecursive(data.folders, ref);
        return ref.n;
    }

    // FAVICONS 
    
    function isFaviconEnabled() {
        const stored = localStorage.getItem(FAVICON_ENABLED_KEY);

        return stored === null ? false : stored === 'true';
    }

    function setFaviconEnabled(enabled) {
        localStorage.setItem(FAVICON_ENABLED_KEY, enabled.toString());
        
        if (faviconCache) faviconCache.clear();
        if (faviconPromises) faviconPromises.clear();
    }

    function isQuickCloseEnabled() {
        return localStorage.getItem(QUICK_CLOSE_KEY) === 'true';
    }

    function setQuickCloseEnabled(enabled) {
        localStorage.setItem(QUICK_CLOSE_KEY, enabled.toString());
    }

    // ALWAYS INCOGNITO

    function isAlwaysIncognito() {
        return localStorage.getItem(ALWAYS_INCOGNITO_KEY) === 'true';
    }

    function setAlwaysIncognito(enabled) {
        localStorage.setItem(ALWAYS_INCOGNITO_KEY, enabled.toString());
    }

    function isBlurPageEnabled() {
        return localStorage.getItem(BLUR_PAGE_KEY) === 'true';
    }

    function setBlurPageEnabled(enabled) {
        localStorage.setItem(BLUR_PAGE_KEY, enabled.toString());
        chrome.storage.local.set({ holyBlurPageEnabled: enabled });
    }

    function getFaviconUrl(url) {
        try {
            const urlObj = new URL(url);
            
            return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${urlObj.hostname}&size=32`;
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
        if (!isFaviconEnabled()) return null;

        
        if (faviconCache.has(url)) return faviconCache.get(url);

        if (faviconPromises.has(url)) return faviconPromises.get(url);

        const promise = (async () => {
            const faviconUrl = getFaviconUrl(url);
            if (!faviconUrl) return null;
            return new Promise(resolve => {
                const probe = new Image();
                probe.onload  = () => { faviconCache.set(url, faviconUrl); faviconPromises.delete(url); resolve(faviconUrl); };
                probe.onerror = () => { faviconCache.set(url, null);       faviconPromises.delete(url); resolve(null); };
                probe.src = faviconUrl;
            });
        })();

        faviconPromises.set(url, promise);
        return promise;
    }

    function _loadFaviconNow(url, iconElement, force = false) {
        if (!force && !isFaviconEnabled()) return Promise.resolve();
        if (!iconElement) return Promise.resolve();

        if (faviconCache.has(url) && faviconCache.get(url) === null) return Promise.resolve();

        if (faviconCache.has(url)) {
            const cached = faviconCache.get(url);
            if (iconElement.isConnected) {
                iconElement.style.setProperty('--favicon-url', 'url("' + cached + '")');
                iconElement.classList.add('has-favicon');
            }
            return Promise.resolve();
        }

        const faviconUrl = getFaviconUrl(url);
        if (!faviconUrl) return Promise.resolve();

        return new Promise(resolve => {
            const probe = new Image();
            probe.onload = () => {
                faviconCache.set(url, faviconUrl);
                if (iconElement.isConnected) {
                    iconElement.style.setProperty('--favicon-url', 'url("' + faviconUrl + '")');
                    iconElement.classList.add('has-favicon');
                }
                resolve();
            };
            probe.onerror = () => {
                faviconCache.set(url, null);
                resolve();
            };
            probe.src = faviconUrl;
        });
    }

    function loadFaviconAsync(url, iconElement, force = false) {
        if (!force && !isFaviconEnabled()) return;
        if (!iconElement) return;
        if (faviconCache.has(url) && faviconCache.get(url) === null) return;

        if (faviconCache.has(url)) {
            const cached = faviconCache.get(url);
            iconElement.style.setProperty('--favicon-url', 'url("' + cached + '")');
            iconElement.classList.add('has-favicon');
            return;
        }

        _faviconQueue.push({ url, iconElement, force });
        _drainFaviconQueue();
    }

    // UI COMPONENTS 
    
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

    
    function _closeModalWithAnimation(overlay, onDone) {
        overlay.classList.replace('hpb-modal--open', 'hpb-modal--closing');
        overlay.addEventListener('animationend', function _onOut(e) {
            if (e.target !== overlay) return;
            overlay.removeEventListener('animationend', _onOut);
            overlay.remove();
            if (typeof onDone === 'function') onDone();
        });
    }

    function showConfirm({ title, warning = '', confirmLabel, cancelLabel } = {}) {
        return new Promise((resolve) => {
            let overlay = document.getElementById('hpb-modal-confirm');
            if (overlay) overlay.remove();

            overlay = document.createElement('div');
            overlay.id = 'hpb-modal-confirm';
            overlay.className = 'hpb-modal hpb-modal--open';
            overlay.style.zIndex = '9999';
            overlay._hpbOpenedAt = Date.now();

            overlay.innerHTML = `
                <div class="hpb-modal__dialog hpb-modal__dialog--xs" role="dialog" aria-modal="true" aria-labelledby="hpb-confirm-title">
                    <div class="hpb-modal__icon hpb-modal__icon--danger">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                    </div>
                    <h3 class="hpb-confirm-title hpb-modal__title--center" id="hpb-confirm-title">${title || ''}</h3>
                    ${warning ? `<p class="hpb-modal__desc">${warning}</p>` : ''}
                    <div class="hpb-modal__footer">
                        <button class="btn-secondary" id="hpb-confirm-cancel">
                            ${cancelLabel || (getMessage('cancel'))}
                        </button>
                        <button class="btn-danger" id="hpb-confirm-ok">
                            ${confirmLabel || (getMessage('delete'))}
                        </button>
                    </div>
                </div>`;

            document.body.appendChild(overlay);

            const dialog    = overlay.querySelector('.hpb-modal__dialog');
            const btnOk     = overlay.querySelector('#hpb-confirm-ok');
            const btnCancel = overlay.querySelector('#hpb-confirm-cancel');

            function cleanup(result) {
                _closeModalWithAnimation(overlay, () => resolve(result));
            }

            btnOk.addEventListener('click',    () => cleanup(true));
            btnCancel.addEventListener('click', () => cleanup(false));
            overlay.addEventListener('click', (e) => { if (e.target === overlay && (Date.now() - (overlay._hpbOpenedAt || 0) > 50)) cleanup(false); });
            overlay.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') cleanup(false);
                if (e.key === 'Enter')  { e.preventDefault(); cleanup(true); }
            });

            overlay.setAttribute('tabindex', '-1');
            btnOk.focus();
        });
    }


    function showPrompt({ title, description = '', placeholder = '', defaultValue = '', confirmLabel, cancelLabel, inputType = 'text', icon = '', confirmStyle = '' } = {}) {
        return new Promise((resolve) => {
            let overlay = document.getElementById('hpb-modal-confirm');
            if (overlay) overlay.remove();

            overlay = document.createElement('div');
            overlay.id = 'hpb-modal-confirm';
            overlay.className = 'hpb-modal hpb-modal--open';
            overlay.style.zIndex = '9999';
            overlay._hpbOpenedAt = Date.now();

            const isPassword   = inputType === 'password';

            overlay.innerHTML = `
                <div class="hpb-modal__dialog hpb-modal__dialog--xs" role="dialog" aria-modal="true" aria-labelledby="hpb-confirm-title">
                    ${icon ? `<div class="hpb-modal__icon hpb-modal__icon--danger">${icon}</div>` : ''}
                    <h2 class="hpb-modal__title hpb-modal__title--center" id="hpb-confirm-title">${title || ''}</h2>
                    ${description ? `<p class="hpb-modal__desc">${description}</p>` : ''}
                    <div class="hpb-modal__body">
                        <input class="hpb-modal__input" type="${inputType}"
                               placeholder="${placeholder}"
                               value="${isPassword ? '' : defaultValue.replace(/"/g, '&quot;')}"
                               spellcheck="false">
                    </div>
                    <div class="hpb-modal__footer">
                        <button class="btn-secondary" id="hpb-confirm-cancel">
                            ${cancelLabel || getMessage('cancel')}
                        </button>
                        <button class="${confirmStyle || 'btn-primary'}" id="hpb-confirm-ok">
                            ${confirmLabel || getMessage('save')}
                        </button>
                    </div>
                </div>`;

            document.body.appendChild(overlay);

            const input     = overlay.querySelector('.hpb-modal__input');
            const btnOk     = overlay.querySelector('#hpb-confirm-ok');
            const btnCancel = overlay.querySelector('#hpb-confirm-cancel');

            input.focus();
            if (!isPassword) input.select();

            function cleanup(result) {
                if (isPassword && input) input.value = '';
                _closeModalWithAnimation(overlay, () => resolve(result));
            }

            btnOk.addEventListener('click', () => {
                const val = input.value;
                cleanup(val || null);
            });
            btnCancel.addEventListener('click', () => cleanup(null));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter')  { e.preventDefault(); const val = input.value; cleanup(val || null); }
                if (e.key === 'Escape') { e.preventDefault(); cleanup(null); }
            });
        });
    }

    // Factory: creates paired _onEsc / _closeAndRemove for a modal element
    function createModalEscHandler(modal, onClose) {
        function _closeAndRemove() {
            document.removeEventListener('keydown', _onEsc);
            modal.classList.remove('hpb-modal--open');
            modal.classList.add('hpb-modal--closing');
            modal.addEventListener('animationend', function handler(e) {
                if (e.target !== modal) return;
                modal.removeEventListener('animationend', handler);
                modal.remove();
            });
            if (typeof onClose === 'function') onClose();
        }
        function _onEsc(e) {
            if (e.key === 'Escape') _closeAndRemove();
        }
        return { _onEsc, _closeAndRemove };
    }

    // Modal helpers
    function openModal(el) {
        if (!el) return;
        el.classList.remove('hpb-modal--closing');
        el.classList.add('hpb-modal--open');
        el._hpbOpenedAt = Date.now();
    }

    function closeModal(el) {
        if (!el) return;
        requestAnimationFrame(() => {
            el.classList.remove('hpb-modal--open');
            el.classList.add('hpb-modal--closing');
            el.addEventListener('animationend', function handler(e) {
                if (e.target !== el) return;
                el.removeEventListener('animationend', handler);
                el.classList.remove('hpb-modal--closing');
            });
        });
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
        chrome.tabs.query({}, (tabs) => {
            if (chrome.runtime.lastError) {
                chrome.windows.create({
                    url: url,
                    incognito: true,
                    focused: true
                });
                return;
            }
            
            const incognitoTab = tabs.find(tab => tab.incognito === true);
            
            if (incognitoTab && incognitoTab.windowId) {
                chrome.tabs.create({
                    url: url,
                    windowId: incognitoTab.windowId,
                    active: true
                });
            } else {
                chrome.windows.create({
                    url: url,
                    incognito: true,
                    focused: true
                });
            }
        });
    } catch (error) {
        if (showNotificationFn) {
            showNotificationFn(getMessageFn('Error'), true);
        }
    }
}

    // IMPORT FROM CHROME 
    
    function convertChromeBookmarks(chromeNodes) {
        const result = [];
        
        for (const node of chromeNodes) {
            if (node.url) {
                result.push({
                    type:      'bookmark',
                    title:     node.title || 'Untitled',
                    url:       node.url,
                    dateAdded: Date.now(),
                    uid:       generateFolderUid()
                });
            } else if (node.children && node.children.length > 0) {
                const folder = {
                    type:      'folder',
                    name:      node.title || 'Unnamed Folder',
                    children:  convertChromeBookmarks(node.children),
                    dateAdded: Date.now(),
                    uid:       generateFolderUid()
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
            .loading-indicator { display:flex; align-items:center; justify-content:center; padding:20px; width:100%; color:var(--text-secondary); }
            .folder-loader { display:flex; align-items:center; justify-content:center; gap:12px; padding:24px; margin:8px 0; background:rgba(0,212,255,.03); border-radius:var(--radius-sm); border:1px dashed rgba(0,212,255,.2); animation:loaderPulse 2s infinite ease-in-out; }
            .folder-loader .spinner { width:24px; height:24px; border:3px solid rgba(0,212,255,.1); border-radius:50%; border-top-color:var(--accent); border-right-color:var(--accent); animation:spin 0.8s linear infinite; }
            @keyframes loaderPulse { 0%,100%{background:rgba(0,212,255,.03);border-color:rgba(0,212,255,.2)} 50%{background:rgba(0,212,255,.06);border-color:rgba(0,212,255,.4)} }
        `;
        document.head.appendChild(style);
    }
    const displayText = text || (window.HolyShared?.getMessage?.('loading') ?? '');
    
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
            .global-loader-container { position:absolute; inset:0; background:var(--bg); backdrop-filter:blur(12px); display:flex; align-items:center; justify-content:center; z-index:10000; border-radius:inherit; }
            .global-loader-accent-line { background:var(--card-bg); backdrop-filter:blur(20px); border:1px solid var(--card-border); border-radius:var(--radius); padding:24px; overflow:hidden; width:100%; height:100%; display:flex; justify-content:center; align-items:center; }
            .accent-line-container { display:flex; flex-direction:column; align-items:center; gap:20px; }
            .accent-line-icon { width:48px; height:48px; background:rgba(0,212,255,.1); border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--accent); animation:accentPulse 2s ease-in-out infinite; }
            .accent-line-icon svg { width:24px; height:24px; stroke:currentColor; }
            .accent-line-text { color:var(--text-primary); font-size:16px; font-weight:500; text-align:center; }
            .accent-line-progress { width:100%; height:4px; background:rgba(255,255,255,.05); border-radius:2px; position:relative; overflow:hidden; }
            .accent-line-fill { position:absolute; inset:0; width:0%; background:linear-gradient(90deg,var(--accent),var(--accent-light,#a0f1ff)); border-radius:2px; }
            .accent-line-fill.animated { animation:lineProgress 2s ease-in-out infinite; }
            @keyframes accentPulse { 0%,100%{box-shadow:0 0 0 0 rgba(0,212,255,.3)} 50%{box-shadow:0 0 20px 5px rgba(0,212,255,.5)} }
            @keyframes lineProgress { 0%{width:0%;left:0} 50%{width:100%;left:0} 100%{width:0%;left:100%} }
        `;
        document.head.appendChild(style);
    }
    
    const displayText = text || getMessage('Processing') || 'Processing...';
    
    
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


    // FOLDER UID GENERATION

    function generateFolderUid() {
        const ts = Date.now().toString(36);
        const rnd = Math.random().toString(36).slice(2, 7);
        return 'f_' + ts + rnd;
    }

    
    function ensureFolderUids(items) {
        if (!Array.isArray(items)) return;
        for (const item of items) {
            if (item.type === 'folder') {
                if (!item.uid) item.uid = generateFolderUid();
                if (item.children) ensureFolderUids(item.children);
            }
        }
    }

    function getItemByUid(data, uid) {
        if (!uid || !data?.folders) return null;
        function search(items) {
            for (const item of items) {
                if (item.type === 'folder') {
                    if (item.uid === uid) return item;
                    if (item.children) {
                        const found = search(item.children);
                        if (found) return found;
                    }
                }
            }
            return null;
        }
        return search(data.folders);
    }

    function getParentArrayByUid(data, uid) {
        if (!uid || !data?.folders) return null;
        function search(items) {
            for (const item of items) {
                if (item.type === 'folder' && item.children) {
                    for (const child of item.children) {
                        if (child.type === 'folder' && child.uid === uid) return item.children;
                    }
                    const found = search(item.children);
                    if (found) return found;
                }
            }
            return null;
        }
        for (const item of data.folders) {
            if (item.type === 'folder' && item.uid === uid) return data.folders;
        }
        return search(data.folders);
    }

    function getAnyItemByUid(data, uid) {
        if (!uid || !data?.folders) return null;
        function search(items) {
            for (const item of items) {
                if (item.uid === uid) return item;
                if (item.type === 'folder' && item.children) {
                    const found = search(item.children);
                    if (found) return found;
                }
            }
            return null;
        }
        return search(data.folders);
    }

    function getParentArrayForItemUid(data, uid) {
        if (!uid || !data?.folders) return null;
        function search(items) {
            for (const item of items) {
                if (item.uid === uid) return items;
                if (item.type === 'folder' && item.children) {
                    const found = search(item.children);
                    if (found) return found;
                }
            }
            return null;
        }
        return search(data.folders);
    }

    function moveBookmark(data, editUid, title, url, newFolderUid) {
        const bookmark = getAnyItemByUid(data, editUid);
        if (!bookmark) return;

        bookmark.title = title;
        bookmark.url   = url;

        const sourceArr = getParentArrayForItemUid(data, editUid);
        if (!sourceArr) return;

        let targetArr;
        if (!newFolderUid) {
            targetArr = data.folders;
        } else {
            const folder = getItemByUid(data, newFolderUid);
            if (!folder || folder.type !== 'folder') return;
            if (!Array.isArray(folder.children)) folder.children = [];
            targetArr = folder.children;
        }

        if (targetArr === sourceArr) return;

        const idx = sourceArr.indexOf(bookmark);
        if (idx !== -1) sourceArr.splice(idx, 1);
        targetArr.push(bookmark);
    }

    function ensureItemUids(items) {
        if (!Array.isArray(items)) return;
        for (const item of items) {
            if (!item.uid) item.uid = generateFolderUid();
            if (item.type === 'folder' && item.children) ensureItemUids(item.children);
        }
    }


// Shared Drag-Drop Utils

function dragCreateGhost(item, clientX, clientY, offsetX, offsetY) {
    const isFolder = !!item.querySelector('.folder-badge') ||
                     item.classList.contains('tree-item--folder');

    let title = 'Element';
    title = item.querySelector('.bookmark-title')?.textContent ||
        item.querySelector('.folder-name')?.textContent   ||
        'Item';

    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';

    // Icon
    const iconContainer = document.createElement('span');
    iconContainer.className = 'icon';

    const svgNS = 'http://www.w3.org/2000/svg';
    function makeSvgIcon(pathD) {
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', '20'); svg.setAttribute('height', '20');
        svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', pathD);
        svg.appendChild(path);
        return svg;
    }

    if (isFolder) {
        iconContainer.appendChild(makeSvgIcon('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'));
        ghost.appendChild(iconContainer);
    } else {
        const faviconUrl = dragGetFaviconUrl(item);
        if (faviconUrl) {
            const img = document.createElement('img');
            img.src = faviconUrl;
            img.alt = '';
            img.style.cssText = 'width:20px;height:20px;border-radius:4px;object-fit:contain;flex-shrink:0;';
            img.onerror = function () {
                iconContainer.appendChild(makeSvgIcon('M5 4C5 2.895 5.895 2 7 2h10c1.105 0 2 .895 2 2v17l-7-4-7 4V4Z'));
                this.replaceWith(iconContainer);
            };
            ghost.appendChild(img);
        } else {
            iconContainer.appendChild(makeSvgIcon('M5 4C5 2.895 5.895 2 7 2h10c1.105 0 2 .895 2 2v17l-7-4-7 4V4Z'));
            ghost.appendChild(iconContainer);
        }
    }

    // Title
    const textEl = document.createElement('span');
    textEl.className = 'drag-ghost__text';
    textEl.textContent = title.length > 20 ? title.slice(0, 20) + '…' : title;
    ghost.appendChild(textEl);

    ghost.style.cssText = `position:fixed;top:${clientY + offsetY}px;left:${clientX + offsetX}px;z-index:99999;pointer-events:none;`;
    document.body.appendChild(ghost);
    return ghost;
}

function dragGetFaviconUrl(item) {
    const iconEl = item.querySelector('.tree-item__favicon-placeholder') ||
                   item.querySelector('.icon.bookmark');
    if (!iconEl) return null;
    const val = iconEl.style.getPropertyValue('--favicon-url');
    if (!val) return null;
    const m = val.match(/url\(["'](.*?)["']\)/);
    return (m && iconEl.classList.contains('has-favicon')) ? m[1] : null;
}

function dragMoveGhost(ghostEl, clientX, clientY, offsetX, offsetY) {
    if (!ghostEl) return;
    ghostEl.style.left = (clientX + offsetX) + 'px';
    ghostEl.style.top  = (clientY + offsetY) + 'px';
}

function dragClearIndicators(scope) {
    (scope || document).querySelectorAll(
        '.drop-above, .drop-below, .drop-into-folder, .drop-forbidden, .drop-target'
    ).forEach(el => el.classList.remove(
        'drop-above', 'drop-below', 'drop-into-folder', 'drop-forbidden', 'drop-target'
    ));
}

function dragHandleEscape(isDraggingFn, cancelFn) {
    function handler(e) {
        if (e.key === 'Escape' && isDraggingFn()) {
            cancelFn();
            document.removeEventListener('keydown', handler);
        }
    }
    document.addEventListener('keydown', handler);
    return handler; 
}

function buildFolderTreePicker(container, folders, initialValue, onChange) {

        function getLabelForUid(uid, items) {
            for (const item of items) {
                if (!item || item.type !== 'folder') continue;
                if (item.uid === uid) return item.name;
                if (Array.isArray(item.children)) {
                    const found = getLabelForUid(uid, item.children);
                    if (found) return found;
                }
            }
            return null;
        }

        function resolveInitialUid(val) {
            if (!val) return '';
            if (typeof val === 'string' && val.startsWith('f_')) return val;
            const parts = val.split('/').map(Number);
            let cur = folders;
            for (let i = 0; i < parts.length; i++) {
                const item = cur[parts[i]];
                if (!item || item.type !== 'folder') return '';
                if (i === parts.length - 1) return item.uid || '';
                cur = item.children || [];
            }
            return '';
        }

        let currentValue = resolveInitialUid(initialValue);

        function getRootLabel() {
            const existing = container.querySelector('option[value=""]');
            if (existing) return existing.textContent;
            return 'Root folder';
        }

        function getInitialLabel() {
            if (!currentValue) return getRootLabel();
            return getLabelForUid(currentValue, folders) || getRootLabel();
        }

        const FOLDER_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px;vertical-align:-2px;flex-shrink:0"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
        const ROOT_SVG   = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px;vertical-align:-2px;flex-shrink:0"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';

        container.innerHTML = `
            <div class="folder-tree-picker__trigger" tabindex="0">
                <span class="folder-tree-picker__trigger-text">${currentValue ? FOLDER_SVG : ROOT_SVG}${getInitialLabel()}</span>
                <span class="folder-tree-picker__arrow">\▶</span>
            </div>
            <div class="folder-tree-picker__dropdown" style="display:none"></div>
        `;

        const trigger  = container.querySelector('.folder-tree-picker__trigger');
        const dropdown = container.querySelector('.folder-tree-picker__dropdown');

        function setTriggerLabel(uid, name) {
            trigger.querySelector('.folder-tree-picker__trigger-text').innerHTML =
                (uid ? FOLDER_SVG : ROOT_SVG) + (name || getRootLabel());
        }

        function buildNodes(items, parent, depth) {
            for (const item of items) {
                if (!item || item.type !== 'folder') continue;
                const uid = item.uid || '';
                const hasChildren = Array.isArray(item.children) &&
                    item.children.some(c => c && c.type === 'folder');

                const node = document.createElement('div');
                node.style.paddingLeft = (depth * 16 + 8) + 'px';
                node.className = 'folder-tree-picker__node' + (uid === currentValue ? ' selected' : '');
                node.dataset.uid = uid;
                node.innerHTML = `
                    <span class="${hasChildren ? 'folder-tree-picker__toggle' : 'folder-tree-picker__toggle leaf'}">\▶</span>
                    <span class="folder-tree-picker__icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></span>
                    <span class="folder-tree-picker__label">${item.name}</span>
                `;

                const childrenWrap = document.createElement('div');
                childrenWrap.className = 'folder-tree-picker__children';
                childrenWrap.dataset.parentUid = uid;

                if (hasChildren) {
                    const toggleEl = node.querySelector('.folder-tree-picker__toggle');
                    toggleEl.addEventListener('click', e => {
                        e.stopPropagation();
                        const isOpen = childrenWrap.classList.contains('open');
                        childrenWrap.classList.toggle('open', !isOpen);
                        toggleEl.classList.toggle('expanded', !isOpen);
                    });
                    buildNodes(item.children, childrenWrap, depth + 1);
                }

                node.addEventListener('click', () => {
                    dropdown.querySelectorAll('.folder-tree-picker__node.selected')
                        .forEach(n => n.classList.remove('selected'));
                    node.classList.add('selected');
                    currentValue = uid;
                    setTriggerLabel(uid, item.name);
                    closeDropdown();
                    if (onChange) onChange(uid, item.name);
                });

                parent.appendChild(node);
                if (hasChildren) parent.appendChild(childrenWrap);
            }
        }

        const rootNode = document.createElement('div');
        rootNode.className = 'folder-tree-picker__node' + (currentValue === '' ? ' selected' : '');
        rootNode.dataset.uid = '';
        rootNode.style.paddingLeft = '8px';
        rootNode.innerHTML = `
            <span class="folder-tree-picker__toggle leaf">\u25ba</span>
            <span class="folder-tree-picker__icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span>
            <span class="folder-tree-picker__label">${getRootLabel()}</span>
        `;
        rootNode.addEventListener('click', () => {
            dropdown.querySelectorAll('.folder-tree-picker__node.selected')
                .forEach(n => n.classList.remove('selected'));
            rootNode.classList.add('selected');
            currentValue = '';
            setTriggerLabel('', '');
            closeDropdown();
            if (onChange) onChange('', getRootLabel());
        });
        dropdown.appendChild(rootNode);
        buildNodes(folders, dropdown, 0);

        if (currentValue) {
            const sel = dropdown.querySelector(`[data-uid="${currentValue}"]`);
            if (sel) {
                let node = sel.parentElement;
                while (node && node !== dropdown) {
                    if (node.classList.contains('folder-tree-picker__children')) {
                        node.classList.add('open');
                        node.previousElementSibling
                            ?.querySelector('.folder-tree-picker__toggle')
                            ?.classList.add('expanded');
                    }
                    node = node.parentElement;
                }
            }
        }

        function openDropdown()  { dropdown.style.display = 'block'; trigger.classList.add('open'); }
        function closeDropdown() { dropdown.style.display = 'none';  trigger.classList.remove('open'); }

        trigger.addEventListener('click', () =>
            dropdown.style.display === 'none' ? openDropdown() : closeDropdown());
        trigger.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dropdown.style.display === 'none' ? openDropdown() : closeDropdown(); }
            if (e.key === 'Escape') closeDropdown();
        });
        document.addEventListener('click', e => {
            if (!container.contains(e.target)) closeDropdown();
        }, { capture: true });

        container._getPickerValue = () => currentValue;
        container._setPickerValue = (uid) => {
            currentValue = uid || '';
            const label = uid ? getLabelForUid(uid, folders) : null;
            setTriggerLabel(uid, label);
            dropdown.querySelectorAll('.folder-tree-picker__node.selected').forEach(n => n.classList.remove('selected'));
            const sel = dropdown.querySelector(`[data-uid="${currentValue}"]`);
            if (sel) sel.classList.add('selected');
        };
    }

    // BOOKMARK MODAL FACTORY

    function createBookmarkModal({ id, getMessage }) {
        const modal = document.createElement('div');
        modal.id        = id;
        modal.className = 'hpb-modal';
        modal.innerHTML = `
            <div class="hpb-modal__dialog">
                <h2 class="hpb-modal__title" id="modal-title-text"></h2>
                <div class="hpb-modal__body">
                    <div class="hpb-modal__bookmark-form">
                        <label for="modal-bookmark-title">${getMessage('title')}</label>
                        <input type="text" id="modal-bookmark-title" placeholder="Bookmark title">
                        <label for="modal-bookmark-url">${getMessage('url')}</label>
                        <input type="text" id="modal-bookmark-url" placeholder="https://example.com">
                        <label for="folder-select">${getMessage('folder')}</label>
                        <div class="folder-select-container w-100">
                            <div id="folder-select" class="folder-tree-picker"></div>
                            <button class="btn-secondary" id="new-folder-in-modal">${getMessage('new') || 'New'}</button>
                        </div>
                    </div>
                </div>
                <div class="hpb-modal__footer">
                    <button class="btn-secondary" id="modal-cancel">${getMessage('cancel')}</button>
                    <button class="btn-primary"   id="modal-save">${getMessage('save')}</button>
                </div>
            </div>
        `;
        return modal;
    }

    // EXPORT 
    
    if (typeof window !== 'undefined') {
        window.HolyShared = {
           
            STORAGE_KEY,
            INACTIVITY_TIMEOUT,
            BOOKMARKS_PER_PAGE,
            VIRTUAL_SCROLL_CONFIG,
            
            
            LRUMap,
            messageCache,
            faviconCache,
            faviconPromises,
            virtualScrollCache,
            
            
            secureWipeArray,
            secureWipeString,
            wipeUserData,
            clearAllSharedCaches,
            
            
            getCachedElement,
            clearElementCache,
            
            
            getMessage,
            localizePage,
            
            
            getItemByPath,
            generateFolderUid,
            ensureFolderUids,
            ensureItemUids,
            getItemByUid,
            getParentArrayByUid,
            getAnyItemByUid,
            getParentArrayForItemUid,
            moveBookmark,
            arraysEqual,
            
            
            countItemsInFolder,
            countFoldersInFolder,
            countAllBookmarks,
            
            
            isFaviconEnabled,
            setFaviconEnabled,
            getDomainFromUrl,
            loadFaviconAsync,
            
            isQuickCloseEnabled,
            setQuickCloseEnabled,
            
            isAlwaysIncognito,
            setAlwaysIncognito,
            
            isBlurPageEnabled,
            setBlurPageEnabled,
            
            
            buildFolderTreePicker,
            
            saveEncrypted,
            
            
            showNotification,
            showConfirm,
            showPrompt,
            closeModalWithAnimation: _closeModalWithAnimation,
            createModalEscHandler,
            createBookmarkModal,
			openModal,
			closeModal,
            escapeHtml,
            
            
            openInPrivateTab,
            
            
            convertChromeBookmarks,
            collectAllBookmarkUrls,
            
            
            debounce,
            throttle,
            
            
            showLoadingIndicator,
            hideLoadingIndicator,
			showGlobalLoadingIndicator,  
			hideGlobalLoadingIndicator,
			dragCreateGhost,
			dragMoveGhost,
			dragClearIndicators,
			dragHandleEscape			
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
            wipeUserData,
            clearAllSharedCaches,
            
            getMessage,
            localizePage,
            
            getItemByPath,
            generateFolderUid,
            arraysEqual,
            
            countItemsInFolder,
            countFoldersInFolder,
            countAllBookmarks,
            
            isFaviconEnabled,
            setFaviconEnabled,
            getDomainFromUrl,
            loadFaviconAsync,
            
            isQuickCloseEnabled,
            setQuickCloseEnabled,
            
            isAlwaysIncognito,
            setAlwaysIncognito,
            
            isBlurPageEnabled,
            setBlurPageEnabled,
            
            buildFolderTreePicker,
            saveEncrypted,
            
            showNotification,
            showConfirm,
            showPrompt,
			openModal,
			closeModal,
            escapeHtml,
            
            openInPrivateTab,
            
            convertChromeBookmarks,
            collectAllBookmarkUrls,
            
            debounce,
            throttle,
            
            showLoadingIndicator,
            hideLoadingIndicator,
            createBookmarkModal
        };
    }
})();
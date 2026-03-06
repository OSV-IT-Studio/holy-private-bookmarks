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

// IMPORTING FUNCTIONS FROM SHARED 

const Shared = window.HolyShared || {};

if (!window.HolyShared) {
    throw new Error('HolyShared is required but not loaded');
}

if (!window.SecureCrypto) {
    throw new Error('SecureCrypto is required but not loaded');
}

if (!window.HTMLImporter) {
    console.warn('HTMLImporter module is not loaded. HTML import functionality will be unavailable.');
}
if (!window.DragDropManager) {
    console.error('DragDropManager not loaded!');
}

const {

    STORAGE_KEY: SHARED_STORAGE_KEY,
    INACTIVITY_TIMEOUT: SHARED_INACTIVITY_TIMEOUT,
    BOOKMARKS_PER_PAGE: SHARED_BOOKMARKS_PER_PAGE,
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
    ensureLoadingStyles
} = Shared;

if (!window.ImportExportManager) {
    console.error('ImportExportManager not loaded!');
}

// CONSTANTS 
const STORAGE_KEY = SHARED_STORAGE_KEY || 'holyPrivateData';
const INACTIVITY_TIMEOUT = SHARED_INACTIVITY_TIMEOUT || 10 * 60 * 1000;
const CryptoManager = window.SecureCrypto;

let data = { folders: [] };
let autoLockTimer;
let pendingBookmark = null;
let editingBookmarkPath = null;
let isInitialized = false;
let clipboardItem = null;
let isLoginContentLoading = false;
let eventHandlersInitialized = false;




// FULL CLEANING

function performFullCleanup() {

    if (data) {
        wipeUserData(data);
    }
    

    clearAllSharedCaches();
    

    if (CryptoManager?.clear) {
        CryptoManager.clear();
    }
    

    data = { folders: [] };
    pendingBookmark = null;
    editingBookmarkPath = null;
    clipboardItem = null;
    

    clearElementCache();
    

    if (virtualScrollCache?.clear) {
        virtualScrollCache.clear();
    }
    

    if (window.gc) {
        try {
            window.gc();
            setTimeout(() => {
                try { window.gc(); } catch (e) {}
            }, 100);
        } catch (e) {}
    }
}

// LOCALIZATION 

function localizePage() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const text = getMessage(key);
        if (text) {
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.placeholder = text;
            } else {
                element.textContent = text;
            }
        }
    });
    
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        const text = getMessage(key);
        if (text) {
            element.title = text;
        }
    });
}

// SECTION MANAGEMENT 

function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    const section = document.getElementById(id);
    if (section) {
        section.style.display = 'block';
    }
    
    if (id === 'main') {
        renderTree();
        startAutoLock();
        
        if (pendingBookmark) {
            openAddBookmarkModal(pendingBookmark.title, pendingBookmark.url);
            pendingBookmark = null;
        }
    }
}

// INSTALLATION

function loadSetupContent() {
    const setupSection = document.getElementById('setup');
    if (!setupSection) return;

    setupSection.innerHTML = `
        <h1 data-i18n="extensionName">Holy Private</h1>
        <p class="subtitle" data-i18n="createPassword"></p>
        <input type="password" id="new-pass" data-i18n="newPassword" placeholder="">
        <input type="password" id="confirm-pass" data-i18n="confirmPassword" placeholder="">

        <div class="password-warning" style="
            background: rgba(255, 64, 96, 0.1);
            border-radius: 12px;
            padding: 16px;
            margin: 16px 0;
            border-left: 4px solid var(--danger);
            text-align: left;
            font-size: 14px;
            color: var(--text-secondary);
        ">
            <p style="margin: 0 0 8px 0; color: var(--text-primary); font-weight: 600;">
                ⚠️ <span data-i18n="importantWarning" id="important-warning-text"></span>
            </p>
            <ul style="margin: 0; padding-left: 20px; line-height: 1.5;">
                <li><span data-i18n="passwordCannotBeRecovered" id="cannot-recover-text"></span></li>
                <li><span data-i18n="noPasswordReset" id="no-reset-text"></span></li>
                <li><span data-i18n="weDontStorePassword" id="dont-store-text"></span></li>
                <li><span data-i18n="bookmarksEncrypted" id="encrypted-only-text"></span></li>
            </ul>
            <p style="margin: 12px 0 0 0; font-weight: 600; color: var(--accent);">
                💡 <span data-i18n="savePasswordSecurely" id="save-password-text"></span>
            </p>
        </div>

        <button class="btn-primary" id="create-pass" data-i18n="createStorage"></button>
    `;

    const createPassBtn = document.getElementById('create-pass');
    if (createPassBtn) {
        createPassBtn.addEventListener('click', createMasterPassword);
    }

    const newPassInput = document.getElementById('new-pass');
    const confirmPassInput = document.getElementById('confirm-pass');
    
    if (newPassInput) {
        newPassInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && confirmPassInput?.value) {
                createMasterPassword();
            }
        });
    }
    
    if (confirmPassInput) {
        confirmPassInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                createMasterPassword();
            }
        });
    }

    localizePage();
}

function showSetupSection() {
    let setupSection = document.getElementById('setup');
    if (!setupSection) {
        setupSection = document.createElement('div');
        setupSection.id = 'setup';
        setupSection.className = 'section';
        document.querySelector('.container').appendChild(setupSection);
    }
    
    loadSetupContent();
    showSection('setup');
    setTimeout(() => document.getElementById('new-pass')?.focus(), 100);
}


// LOGIN 

function loadLoginContent(showPendingNotification = false, bookmarkTitle = '') {
    
    if (isLoginContentLoading) {
        
        return;
    }
    
    isLoginContentLoading = true;
    
    const loginSection = document.getElementById('login');
    if (!loginSection) {
        isLoginContentLoading = false;
        return;
    }

    
    const existingBar = document.getElementById('login-notification-bar');
    if (existingBar && existingBar.parentNode) {
        existingBar.parentNode.removeChild(existingBar);
    }

    chrome.storage.local.get(STORAGE_KEY).then((stored) => {
        const needsMigration = stored[STORAGE_KEY] && 
                              !stored[STORAGE_KEY].version && 
                              stored[STORAGE_KEY].salt && 
                              stored[STORAGE_KEY].encrypted;
        
        
        const hasBar = needsMigration || showPendingNotification;
        
        loginSection.innerHTML = `
            <div class="login-container" style="margin-top: ${hasBar ? '100px' : '0'}; transition: margin-top 0.3s ease;">
                <div class="login-header">
                    <div class="login-icon">
                        <img src="icons/icon128.png" alt="Holy Private Bookmarks">
                    </div>
                    <h1 data-i18n="extensionName">Holy Private Bookmarks</h1>
                    <p class="login-subtitle" data-i18n="enterMasterPassword">Enter your master password to access bookmarks</p>
                </div>
                
                <div class="password-field">
                    <input type="password" id="password" class="password-input" 
                           data-i18n="masterPassword" placeholder="Master password" autofocus>
                </div>
                
                <button class="unlock-button" id="unlock" data-i18n="unlock">
                    <span class="unlock-button-content">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            <line x1="12" y1="16" x2="12" y2="16" />
                        </svg>
                        <span data-i18n="unlock">Unlock</span>
                    </span>
                </button>
            </div>
        `;

        
        if (needsMigration || showPendingNotification) {
            
            if (document.getElementById('login-notification-bar')) {
            } else {
                const notificationBar = document.createElement('div');
                notificationBar.id = 'login-notification-bar';
                
                

                if (needsMigration) {
                    notificationBar.innerHTML = `
                        <div class="notice-content">
                            <div class="notice-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffc107"" stroke-width="2">
                                    <path d="M13 2L3 14h8l-2 8 10-12h-8l2-8z" />
                                </svg>
                            </div>
                            <div>
                                <p class="notice-title  migration">${getMessage('migrationRequired')}</p>
                                <p class="notice-text">${getMessage('migrationInstruction')}</p>
                            </div>
                        </div>
                    `;
                } else if (showPendingNotification) {
                    notificationBar.innerHTML = `
                        <div class="notice-content">
                            <div class="pending-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                            </div>
                            <div>
                                <p class="notice-title pending">${getMessage('pendingBookmarkNotification')}</p>
                                
                                    <p class="notice-text">${getMessage('pendingBookmarkInstruction')}</p>
                                    ${bookmarkTitle ? `
                                        <div class="tree-item" style=" width: 100%;">
                        
                            <div class="item-header">
                                <div class="item-title">
                                    <span class="icon bookmark">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M5 4C5 2.89543 5.89543 2 7 2H17C18.1046 2 19 2.89543 19 4V21L12 17L5 21V4Z" fill="currentColor"/>
                                        </svg>
                                    </span>
                                    <span class="bookmark-title">${escapeHtml(bookmarkTitle)}</span>
                                </div>
                            </div>
                        
                    
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }

                document.body.prepend(notificationBar);
            }
        }

        
        if (!document.getElementById('notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes notificationSlideDown {
                    0% {
                        opacity: 0;
                        transform: translateY(-100%);
                    }
                    100% {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                @keyframes notificationSlideUp {
                    0% {
                        opacity: 1;
                        transform: translateY(0);
                    }
                    100% {
                        opacity: 0;
                        transform: translateY(-100%);
                    }
                }
            `;
            document.head.appendChild(style);
        }

        
        const unlockBtn = document.getElementById('unlock');
        if (unlockBtn) {
            unlockBtn.addEventListener('click', unlock);
        }

        const passwordInput = document.getElementById('password');
        if (passwordInput) {
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') unlock();
            });
        }

        localizePage();
        
        
        isLoginContentLoading = false;
        
    }).catch(error => {
        console.error('Error in loadLoginContent:', error);
        isLoginContentLoading = false;
    });
}
function showLoginSection() {
    const hasPendingBookmark = !!pendingBookmark;
    const bookmarkTitle = pendingBookmark?.title || '';
    
    let loginSection = document.getElementById('login');
    if (!loginSection) {
        loginSection = document.createElement('div');
        loginSection.id = 'login';
        loginSection.className = 'login-section';
        document.body.appendChild(loginSection);
    }
    
	const mainSection = document.getElementById('main');
    if (mainSection) {
        mainSection.style.display = 'none';
    }
	const settingsSection = document.getElementById('settings');
    if (settingsSection) {
        settingsSection.style.display = 'none';
    }
    loadLoginContent(hasPendingBookmark, bookmarkTitle);
    

    setTimeout(() => {
        loginSection.style.opacity = '1';
    }, 50);
    
    setTimeout(() => document.getElementById('password')?.focus(), 100);
}

// UNLOCK 

async function unlock() {
    const password = document.getElementById('password').value;
    
    if (!password) {
        showNotification(getMessage('wrongPassword') || 'Please enter password', true);
        return;
    }
    
    try {
        
       
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        const storedData = stored[STORAGE_KEY];
        
        if (!storedData) {
            showNotification('No data found. Please set up the extension first.', true);
            return;
        }
        

if (storedData.version !== 2) {

    if (storedData.salt && storedData.encrypted && !storedData.version) {
        hideLoadingIndicator(document.body);
        

        const migrationSuccess = await performAutoMigration(password, storedData);
        
        if (migrationSuccess) {
            return; 
        } else {

            return;
        }
    }
    showNotification('Incompatible data format. Please reinstall.', true);
    return;
}
        

        const isValid = await SecureCrypto.verifyPassword(password, storedData);
        
        if (!isValid) {
            showNotification(getMessage('wrongPassword') || 'Wrong password', true);
            document.getElementById('password').value = '';
            return;
        }
        

        const initSuccess = await SecureCrypto.initAfterVerification(password, storedData);
        
        if (!initSuccess) {
            throw new Error('Failed to initialize crypto');
        }
        

        const decrypted = await SecureCrypto.decrypt(storedData.encrypted);
        data = JSON.parse(decrypted);
        

        document.getElementById('password').value = '';
        
		const notificationBar = document.getElementById('login-notification-bar');
        if (notificationBar) {
            notificationBar.remove();
        }

        const loginSection = document.getElementById('login');
        if (loginSection) {
            loginSection.remove();
        }
        
        showSection('main');
        startAutoLock();
        
 
        if (pendingBookmark) {
            openAddBookmarkModal(pendingBookmark.title, pendingBookmark.url);
            pendingBookmark = null;
        }
        
    } catch (e) {
        showNotification(getMessage('unlockFailed') || 'Failed to unlock: ' + e.message, true);
        SecureCrypto.clear();
    } finally {
        hideLoadingIndicator(document.body);
    }
}

async function performAutoMigration(password, oldData) {
    try {
        showLoadingIndicator(document.body, 'Migrating data to secure format...');
        

        const salt = new Uint8Array(oldData.salt);
        const encrypted = oldData.encrypted;
        

        if (!encrypted || !encrypted.iv || !encrypted.data) {
            throw new Error('Invalid encrypted data structure');
        }
        

        await window.SecureCrypto.init(password, salt);
        
        let decrypted;
        try {
            decrypted = await window.SecureCrypto.decrypt(encrypted);
        } catch (decryptError) {

            window.SecureCrypto.clear();
            throw new Error('Decryption failed - wrong password');
        }
        

        let userData;
        try {
            userData = JSON.parse(decrypted);
        } catch (parseError) {
            window.SecureCrypto.clear();
            throw new Error('Data corrupted - invalid JSON');
        }
        

        window.SecureCrypto.clear();
        

        const newCryptoData = await window.SecureCrypto.setupNewPassword(password);
        

        const newEncrypted = await window.SecureCrypto.encrypt(JSON.stringify(userData));
        

        await chrome.storage.local.set({ 
            [STORAGE_KEY]: {
                ...newCryptoData,
                encrypted: newEncrypted
            }
        });
        

        window.SecureCrypto.clear();
        
        hideLoadingIndicator(document.body);
        showNotification(getMessage('migrationSuccess') || 'Data successfully migrated to secure format!', false, 2000);
        

        setTimeout(() => {
            window.location.reload();
        }, 1000);
        
        return true;
        
    } catch (e) {
        hideLoadingIndicator(document.body);
        

        window.SecureCrypto.clear();
        

        const passwordInput = document.getElementById('password');
        if (passwordInput) {
            passwordInput.value = '';
        }
        

        let errorMessage = 'Migration failed';
        if (e.message.includes('wrong password')) {
            errorMessage = 'Wrong password. Please try again.';
        } else if (e.message.includes('corrupted')) {
            errorMessage = 'Data corrupted. Please reset the extension.';
        } else if (e.message.includes('Decryption failed')) {
            errorMessage = 'Wrong password. Please try again.';
        } else {
            errorMessage = 'Migration failed: ' + e.message;
        }
        
        showNotification(errorMessage, true, 2000);
        

        setTimeout(() => {
            if (passwordInput) {
                passwordInput.focus();
            }
        }, 100);
        
        return false;
    }
}
// CREATE A PASSWORD 

async function createMasterPassword() {
    const p1 = document.getElementById('new-pass').value;
    const p2 = document.getElementById('confirm-pass').value;
    
    if (p1 !== p2 || p1.length < SecureCrypto.CONSTANTS.MIN_PASSWORD_LENGTH) {
        showNotification(
            getMessage('passwordsMismatch') || 
            `Password must be at least ${SecureCrypto.CONSTANTS.MIN_PASSWORD_LENGTH} characters`, 
            true
        );
        return;
    }
    
    try {
        showLoadingIndicator(document.body, getMessage('settingUpEncryption') || 'Setting up encryption...');
        

        const cryptoData = await SecureCrypto.setupNewPassword(p1);
        


        

        data = { folders: [] };
        const encrypted = await SecureCrypto.encrypt(JSON.stringify(data));
        

        await chrome.storage.local.set({ 
            [STORAGE_KEY]: {
                ...cryptoData,
                encrypted: encrypted
            }
        });
        

        document.getElementById('new-pass').value = '';
        document.getElementById('confirm-pass').value = '';
        

        const setupSection = document.getElementById('setup');
        if (setupSection) {
            setupSection.remove();
        }
        
        showSection('main');
        showNotification(getMessage('setupComplete') || 'Setup complete!', false);
        
    } catch (error) {
        showNotification(getMessage('setupError') || 'Setup failed: ' + error.message, true);
        SecureCrypto.clear();
    } finally {
        hideLoadingIndicator(document.body);
    }
}

// SAVE 


async function saveChanges() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    if (stored[STORAGE_KEY]) {

        await saveEncrypted(data, CryptoManager);
    }
    
    if (virtualScrollCache?.clear) {
        virtualScrollCache.clear();
    }
}


async function saveAndRefresh() {
    await saveChanges();
    renderTree();
}

// TREE RENDERING 

function getEmptyTreeMessages() {
    return {
        title: getMessage('emptyTreeTitle') || 'No bookmarks yet',
        subtitle: getMessage('emptyTreeSubtitle') || 'Add your first bookmark or folder to get started',
        addBookmark: getMessage('addBookmark') || 'Add Bookmark',
        newFolder: getMessage('newFolder') || 'New Folder'
    };
}

function renderTree() {
    const tree = document.getElementById('tree');
    if (!tree) return;
    
    const hasContent = data.folders && data.folders.length > 0;
    
    if (!hasContent) {
        renderEmptyState(tree);
        return;
    }
    
    if (virtualScrollCache?.clear) {
        virtualScrollCache.clear();
    }
    
    tree.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
    
    for (let i = 0; i < data.folders.length; i++) {
        const item = data.folders[i];
        const path = [i];
        
        if (item.type === 'bookmark') {
            fragment.appendChild(createBookmarkElement(item, path));
        } else if (item.type === 'folder') {
            fragment.appendChild(createFolderElement(item, path));
        }
    }
    
    tree.appendChild(fragment);
    
    setupGlobalClickHandler();
	DragDropManager.initDragAndDrop(data, saveAndRefresh);
	DragDropManager.refreshDragItems();
}

function renderEmptyState(container) {
    const messages = getEmptyTreeMessages();
    
    container.innerHTML = `
        <div class="empty-tree-message" style="text-align: center; padding: 40px 20px; color: var(--text-secondary); font-size: 16px; line-height: 1.5;">
            <div class="empty-state__icon" style="width: 64px; height: 64px; margin-bottom: 24px; color: var(--accent); opacity: 0.7; margin: auto;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
            </div>
            <h3 style="margin: 0 0 8px 0; color: var(--text-primary);">${messages.title}</h3>
            <p style="margin: 0 0 20px 0;">${messages.subtitle}</p>
        </div>
    `;
}

function createFolderElement(item, path) {
    const div = document.createElement('div');
    div.className = 'tree-item';
    div.dataset.path = path.join(',');
    div.setAttribute('draggable', 'true');
    
    const itemCount = countItemsInFolder(item);
    
    div.innerHTML = `
        <div class="item-header folder">
            <div class="item-title">
                <span class="arrow">▶</span>
                <span class="icon folder-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                </span>
                <span class="folder-name">${escapeHtml(item.name)}</span>
                <span class="folder-badge">${itemCount}</span>
            </div>
            <div class="actions">
                <button class="action-btn" data-action="rename" data-path="${path.join(',')}" title="Rename">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    </svg>
                </button>
                <button class="action-btn delete" data-action="delete" data-path="${path.join(',')}" title="Delete">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                </button>
            </div>
        </div>
        <div class="subitems collapsed"></div>
    `;
    
    return div;
}

function createBookmarkElement(item, path) {
    const div = document.createElement('div');
    div.className = 'tree-item';
    div.dataset.path = path.join(',');
    div.setAttribute('draggable', 'true');
    
    const domain = getDomainFromUrl(item.url);
    
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.title = item.url;
    link.className = 'bookmark-link';
    
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
    textSpan.textContent = item.title;
    
    const domainSpan = document.createElement('span');
    domainSpan.className = 'item-domain';
    domainSpan.textContent = domain;
    
    titleDiv.appendChild(iconSpan);
    titleDiv.appendChild(textSpan);
    titleDiv.appendChild(domainSpan);
    
    const quickActions = document.createElement('div');
    quickActions.className = 'quick-actions-hover';
    quickActions.style.display = 'none';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'quick-action-btn-small';
    editBtn.title = getMessage('edit') || 'Edit';
    editBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M11.5 2.5a2 2 0 0 1 3 3L6 14l-4 1 1-4 8.5-8.5z"></path>
        </svg>
    `;
    editBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        editBookmark(path.join(','));
    });
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'quick-action-btn-small';
    copyBtn.title = getMessage('copyUrl') || 'Copy URL';
    copyBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="2" y="4" width="10" height="10" rx="1" ry="1"></rect>
            <path d="M4 2h8a2 2 0 0 1 2 2v8"></path>
        </svg>
    `;
    copyBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        copyBookmarkUrl(item.url);
    });
    
    const privateBtn = document.createElement('button');
    privateBtn.className = 'quick-action-btn-small';
    privateBtn.title = getMessage('openPrivate') || 'Open in private tab';
    privateBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="6" width="10" height="8" rx="1" ry="1"></rect>
            <path d="M5 6V4a3 3 0 0 1 6 0v2"></path>
            <circle cx="8" cy="10" r="1"></circle>
        </svg>
    `;
    privateBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        
        try {
            const urlObj = new URL(item.url);
            if (!urlObj.protocol.startsWith('http')) {
                showNotification(getMessage('invalidUrlForPrivate') || 'Only http:// and https:// URLs can be opened in private mode', true);
                return;
            }
            openInPrivateTab(item.url);
        } catch (err) {
            showNotification(getMessage('invalidUrl') || 'Invalid URL', true);
        }
    });
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'quick-action-btn-small delete';
    deleteBtn.title = getMessage('delete') || 'Delete';
    deleteBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
    `;
    deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        if (confirm(getMessage('deleteConfirm') || 'Delete this bookmark?')) {
            deleteBookmark(path.join(','));
        }
    });
    
    quickActions.appendChild(editBtn);
    quickActions.appendChild(copyBtn);
    quickActions.appendChild(privateBtn);
    quickActions.appendChild(deleteBtn);
    
    titleDiv.appendChild(quickActions);
    header.appendChild(titleDiv);
    link.appendChild(header);
    div.appendChild(link);
    
    if (isFaviconEnabled()) {
        loadFaviconAsync(item.url, iconSpan);
    }
    
    div.addEventListener('mouseenter', function() {
        quickActions.style.display = 'flex';
    });
    
    div.addEventListener('mouseleave', function() {
        quickActions.style.display = 'none';
    });
    
    return div;
}

// CLICK HANDLERS 

function setupGlobalClickHandler() {
    if (eventHandlersInitialized) return;
    
    const tree = document.getElementById('tree');
    if (!tree) return;
    
    tree.removeEventListener('click', handleTreeClick);
    tree.addEventListener('click', handleTreeClick);
    
    eventHandlersInitialized = true;
}

function handleTreeClick(e) {
    if (e.target.closest('.action-btn')) {
        handleActionButtonClick(e);
        return;
    }
    
    const folderHeader = e.target.closest('.item-header.folder');
    if (folderHeader) {
        e.preventDefault();
        e.stopPropagation();
        toggleFolder(folderHeader);
        return;
    }
}

function handleActionButtonClick(e) {
    const btn = e.target.closest('.action-btn');
    if (!btn) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const action = btn.dataset.action;
    const path = btn.dataset.path;
    
    if (!path) return;
    
    const pathArray = path.split(',').map(Number);
    
    if (action === 'rename') {
        renameItem(pathArray);
    } else if (action === 'delete') {
        deleteItem(pathArray);
    }
}

function toggleFolder(header) {
    const folderItem = header.closest('.tree-item');
    if (!folderItem) return;
    
    const sub = folderItem.querySelector('.subitems');
    if (!sub) return;
    
    const isCollapsed = sub.classList.contains('collapsed');
    const path = folderItem.dataset.path;
    
    if (isCollapsed) {
        openFolder(folderItem, header, sub, path);
    } else {
        closeFolder(folderItem, header, sub);
    }
}

function openFolder(folderItem, header, sub, path) {
    sub.classList.remove('collapsed');
    const arrow = header.querySelector('.arrow');
    if (arrow) arrow.textContent = '▼';
    folderItem.classList.add('open');
    
    if (!sub.hasChildNodes() || sub.children.length === 0) {
        const pathArray = path.split(',').map(Number);
        const folder = getItemByPath(data, pathArray);
        
        if (folder && folder.children) {
            sub.innerHTML = '';
            
            const scrollContainer = document.createElement('div');
            scrollContainer.className = 'folder-virtual-scroll';
            sub.appendChild(scrollContainer);
            
            if (virtualScrollCache?.getFolderContainer) {
                const folderData = virtualScrollCache.getFolderContainer(pathArray);
                folderData.totalItems = folder.children.length;
                folderData.container = scrollContainer;
                folderData.isOpen = true;
                folderData.visibleStart = 0;
                folderData.visibleCount = 0;
                folderData.hasMore = true;
                
                loadMoreFolderItems(
                    folder, 
                    pathArray, 
                    scrollContainer, 
                    0, 
                    VIRTUAL_SCROLL_CONFIG.initialLoadCount
                );
            }
        }
    }
}

function closeFolder(folderItem, header, sub) {
    sub.classList.add('collapsed');
    const arrow = header.querySelector('.arrow');
    if (arrow) arrow.textContent = '▶';
    folderItem.classList.remove('open');
}

function renameItem(pathArray) {
    const targetItem = getItemByPath(data, pathArray);
    if (!targetItem) return;
    
    const currentName = targetItem.type === 'folder' ? targetItem.name : targetItem.title;
    const newName = prompt(getMessage('newName') || 'Enter new name:', currentName);
    
    if (newName && newName.trim()) {
        if (targetItem.type === 'folder') {
            targetItem.name = newName.trim();
        } else {
            targetItem.title = newName.trim();
        }
        saveAndRefresh();
    }
}

function deleteItem(pathArray) {
    if (confirm(getMessage('deleteConfirm') || 'Are you sure?')) {
        removeItemByPath(data, pathArray);
        saveAndRefresh();
    }
}

function loadMoreFolderItems(folder, path, container, startIndex, countToLoad) {
    if (!virtualScrollCache?.getFolderContainer) return;
    
    const folderData = virtualScrollCache.getFolderContainer(path);
    
    if (folder.children.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-folder-message';
        emptyMessage.setAttribute('data-i18n', 'emptyFolder');
        emptyMessage.textContent = getMessage('emptyFolder') || 'Folder is empty';
        container.appendChild(emptyMessage);
        
        folderData.hasMore = false;
        return;
    }
    
    const endIndex = Math.min(startIndex + countToLoad, folder.children.length);
    
    if (startIndex === 0) {
        showLoadingIndicator(container);
    }
    
    renderFolderItemsBatch(folder, path, container, startIndex, endIndex, () => {
        hideLoadingIndicator(container);
        
        folderData.visibleStart = startIndex;
        folderData.visibleCount = (folderData.visibleCount || 0) + (endIndex - startIndex);
        folderData.hasMore = endIndex < folder.children.length;
        
        if (endIndex < folder.children.length) {
            updateLoadMoreButton(container, folder, path, endIndex);
        } else {
            removeLoadMoreButton(container);
        }
    });
}

function renderFolderItemsBatch(folder, path, container, startIndex, endIndex, onComplete) {
    const batchSize = 10;
    const currentEnd = Math.min(startIndex + batchSize, endIndex);
    
    const fragment = document.createDocumentFragment();
    
    for (let i = startIndex; i < currentEnd; i++) {
        const child = folder.children[i];
        const childPath = [...path, i];
        
        let element;
        if (child.type === 'bookmark') {
            element = createBookmarkElement(child, childPath);
        } else if (child.type === 'folder') {
            element = createFolderElement(child, childPath);
        }
        
        if (element) {
            fragment.appendChild(element);
        }
    }
    
    container.appendChild(fragment);
    
    if (currentEnd < endIndex) {
        requestAnimationFrame(() => {
            renderFolderItemsBatch(folder, path, container, currentEnd, endIndex, onComplete);
        });
    } else {
        if (onComplete) onComplete();
    }
}

function updateLoadMoreButton(container, folder, path, nextStartIndex) {
    removeLoadMoreButton(container);
    
    const remaining = folder.children.length - nextStartIndex;
    const loadMoreContainer = document.createElement('div');
    loadMoreContainer.className = 'load-more-container';
    
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'load-more-btn';
    loadMoreBtn.setAttribute('data-folder-path', path.join(','));
    loadMoreBtn.setAttribute('data-start-index', nextStartIndex);
    loadMoreBtn.innerHTML = `<span class="icon">↓</span> Load more (${remaining} remaining)`;
    
    loadMoreBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width: 16px; height: 16px;"></div> Loading...';
        
        loadMoreFolderItems(folder, path, container, nextStartIndex, VIRTUAL_SCROLL_CONFIG.loadMoreCount);
    };
    
    loadMoreContainer.appendChild(loadMoreBtn);
    container.parentNode.appendChild(loadMoreContainer);
}

function removeLoadMoreButton(container) {
    const oldContainer = container.parentNode?.querySelector('.load-more-container');
    if (oldContainer) oldContainer.remove();
}



// OPERATIONS WITH BOOKMARKS

function openAddBookmarkModal(pageTitle, pageUrl, editPath = null) {
    const modal = getCachedElement('#add-bookmark-modal');
    if (!modal) return;
    
    editingBookmarkPath = editPath;
    const isEdit = editPath !== null;
    
    const modalTitle = modal.querySelector('h2');
    modalTitle.textContent = getMessage(isEdit ? 'editBookmark' : 'addBookmark');
    
    document.getElementById('modal-page-title').textContent = 
        pageTitle.length > 60 ? pageTitle.slice(0, 60) + '...' : pageTitle;
    
    const titleInput = document.getElementById('modal-bookmark-title');
    const urlInput = document.getElementById('modal-bookmark-url');
    
    if (isEdit) {
        const bookmark = getItemByPath(data, editPath);
        if (bookmark) {
            titleInput.value = bookmark.title;
            urlInput.value = bookmark.url;
        }
    } else {
        titleInput.value = pageTitle;
        urlInput.value = pageUrl;
    }
    
    const select = document.getElementById('folder-select');
    select.innerHTML = '';
    const rootOption = document.createElement('option');
    rootOption.value = '';
    rootOption.textContent = getMessage('rootFolder') || 'Root folder';
    select.appendChild(rootOption);
    buildFolderOptions(data.folders, select, '', 0);
    
    if (isEdit) {
        const parentPath = editPath.slice(0, -1);
        if (parentPath.length > 0) {
            const parentPathStr = parentPath.join('/');
            select.value = parentPathStr;
        }
    }
    
    modal.style.display = 'flex';
}

function handleModalSave() {
    const modal = document.getElementById('add-bookmark-modal');
    if (!modal) return;
    
    const titleInput = document.getElementById('modal-bookmark-title');
    const urlInput = document.getElementById('modal-bookmark-url');
    
    const title = titleInput.value.trim();
    const url = urlInput.value.trim();
    
    if (!title || !url) {
        showNotification(getMessage('titleRequired') || 'Title and URL are required', true);
        return;
    }
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showNotification('Please enter a valid URL starting with http:// or https://', true);
        return;
    }
    
    const pathStr = document.getElementById('folder-select').value;
    
    let newPath = [];
    if (pathStr !== '') {
        newPath = pathStr.split('/').map(Number).filter(Number.isInteger);
    }
    
    if (newPath.length > 0) {
        const target = getItemByPath(data, newPath);
        if (!target || target.type !== 'folder') {
            showNotification('Selected path is not a folder', true);
            return;
        }
    }
    
    if (editingBookmarkPath) {
        updateBookmark(editingBookmarkPath, title, url, newPath);
    } else {
        addNewBookmark(title, url, newPath);
    }
    
    saveAndRefresh().then(() => {
        modal.style.display = 'none';
        editingBookmarkPath = null;
    });
}

function addNewBookmark(title, url, path) {
    let target = data.folders;
    for (const idx of path) {
        if (target[idx] && target[idx].type === 'folder' && target[idx].children) {
            target = target[idx].children;
        } else {
            return;
        }
    }
    target.push({ 
        type: 'bookmark', 
        title, 
        url,
        dateAdded: Date.now()
    });
}

function updateBookmark(oldPath, title, url, newPathRaw) {
    const newPath = normalizePath(newPathRaw);
    const oldFolderPath = normalizePath(oldPath.slice(0, -1));
    
    const sourceParent = getParentByPath(data, oldFolderPath);
    const sourceIndex = oldPath[oldPath.length - 1];
    const bookmark = sourceParent[sourceIndex];
    
    if (!bookmark) return;
    
    bookmark.title = title;
    bookmark.url = url;
    
    if (oldFolderPath.join('/') === newPath.join('/')) return;
    
    let targetArray;
    
    if (newPath.length === 0) {
        targetArray = data.folders;
    } else {
        const folder = getItemByPath(data, newPath);
        if (!folder || folder.type !== 'folder' || !Array.isArray(folder.children)) return;
        targetArray = folder.children;
    }
    
    sourceParent.splice(sourceIndex, 1);
    targetArray.push(bookmark);
}

function editBookmark(pathStr) {
    const path = pathStr.split(',').map(Number);
    const bookmark = getItemByPath(data, path);
    if (bookmark) {
        openAddBookmarkModal(bookmark.title, bookmark.url, path);
    }
}

function deleteBookmark(pathStr) {
    const path = pathStr.split(',').map(Number);
    removeItemByPath(data, path);
    saveAndRefresh();
}

function copyBookmarkUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
        showNotification(getMessage('urlCopied') || 'URL copied to clipboard');
    }).catch(() => {
        showNotification(getMessage('copyFailed') || 'Failed to copy URL', true);
    });
}

function addFolder() {
    const name = prompt(getMessage('folderName') || 'Folder name:');
    if (name && name.trim()) {
        data.folders.push({ 
            type: 'folder', 
            name: name.trim(), 
            children: [],
            dateAdded: Date.now()
        });
        saveAndRefresh();
    }
}

async function addCurrentPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || !tab.url.startsWith('http')) {
        showNotification(getMessage('cannotAddPage') || 'Cannot add this page', true);
        return;
    }
    openAddBookmarkModal(tab.title || 'No title', tab.url);
}

// AUTO-LOCK 

function startAutoLock() {
    clearTimeout(autoLockTimer);
    autoLockTimer = setTimeout(lock, INACTIVITY_TIMEOUT);
}

function lock() {
    clearTimeout(autoLockTimer);
    
    if (data) {
        wipeUserData(data);
    }
    
    CryptoManager.clear();
    data = { folders: [] };
    pendingBookmark = null;
    
    if (virtualScrollCache?.clear) {
        virtualScrollCache.clear();
    }
    clearElementCache();
    
    const tree = document.getElementById('tree');
    if (tree) {
        tree.innerHTML = '';
    }
	
    showLoginSection();
}



// CHANGE PASSWORD 

async function changeMasterPassword() {
    const oldPass = document.getElementById('old-pass').value;
    const newPass1 = document.getElementById('new-pass2').value;
    const newPass2 = document.getElementById('confirm-pass2').value;
    
// Validation
    if (!oldPass || !newPass1 || !newPass2) {
        showNotification(getMessage('fillAllFields') || 'Please fill all fields', true);
        return;
    }
    
    if (newPass1 !== newPass2) {
        showNotification(getMessage('passwordsMismatch') || 'New passwords do not match', true);
        return;
    }
    
    if (newPass1.length < SecureCrypto.CONSTANTS.MIN_PASSWORD_LENGTH) {
        showNotification(
            getMessage('passwordTooShort') || 
            `Password must be at least ${SecureCrypto.CONSTANTS.MIN_PASSWORD_LENGTH} characters`, 
            true
        );
        return;
    }
    
    try {
        showLoadingIndicator(document.body, 'Changing password...');
        

        const stored = await chrome.storage.local.get(STORAGE_KEY);
        const storedData = stored[STORAGE_KEY];
        
        if (!storedData) {
            throw new Error('No data found');
        }
        

        const isValid = await SecureCrypto.verifyPassword(oldPass, storedData);
        
        if (!isValid) {
            showNotification(getMessage('wrongPassword') || 'Wrong password', true);
            return;
        }
        

        await SecureCrypto.initAfterVerification(oldPass, storedData);
        const decrypted = await SecureCrypto.decrypt(storedData.encrypted);
        const currentData = JSON.parse(decrypted);
        

        const newCryptoData = await SecureCrypto.setupNewPassword(newPass1);
        

        const newEncrypted = await SecureCrypto.encrypt(JSON.stringify(currentData));
        

        await chrome.storage.local.set({ 
            [STORAGE_KEY]: {
                ...newCryptoData,
                encrypted: newEncrypted
            }
        });
        

        document.getElementById('old-pass').value = '';
        document.getElementById('new-pass2').value = '';
        document.getElementById('confirm-pass2').value = '';
        
        showNotification(getMessage('passwordChanged') || 'Password changed successfully', false);
        

        setTimeout(() => showSection('main'), 1500);
        
    } catch (error) {
        showNotification(getMessage('passwordChangeFailed') || 'Failed to change password: ' + error.message, true);
    } finally {
        hideLoadingIndicator(document.body);
    }
}

// FAVICONS 

async function initFaviconToggle() {
    const toggle = document.getElementById('favicon-toggle');
    if (!toggle) return;
    
    const enabled = isFaviconEnabled();
    toggle.checked = enabled;
    
    toggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        setFaviconEnabled(enabled);
        
        if (faviconCache) faviconCache.clear();
        if (faviconPromises) faviconPromises.clear();
        
        renderTree();
    });
}

// INITIALIZATION

async function init() {
    if (isInitialized) return;
    
    const safetyTimeout = setTimeout(() => {
        console.warn('Theme initialization timeout');
        hideThemeLoader();
    }, 3000);
    
    if (window.ThemeManager) {
        await window.ThemeManager.init();
        
        const themeContainer = document.getElementById('theme-selector-container');
        if (themeContainer) {
            window.ThemeManager.createThemeSelector(themeContainer);
        }
    }
    clearTimeout(safetyTimeout);
    hideThemeLoader();
    ensureLoadingStyles();

    initFaviconToggle();
    
    chrome.runtime.sendMessage({ action: 'reloadmanager' }).catch(() => {});
    
    const [stored, session] = await Promise.all([
        chrome.storage.local.get(STORAGE_KEY),
        chrome.storage.session.get('pendingBookmarkAdd')
    ]);
    
    if (session.pendingBookmarkAdd) {
        pendingBookmark = session.pendingBookmarkAdd;
        await chrome.storage.session.remove('pendingBookmarkAdd');
    }
    
// *** CHECKING FOR THE PRESENCE OF OLD DATA ***
    if (stored[STORAGE_KEY]) {
        // Check if we need to migrate (old version v1)
        const needsMigration = stored[STORAGE_KEY] && 
                              !stored[STORAGE_KEY].version && 
                              stored[STORAGE_KEY].salt && 
                              stored[STORAGE_KEY].encrypted;
        
        if (needsMigration) {
            console.log('Old data format detected. Migration will happen on login.');
            // Just show the login screen - the migration will happen in unlock()
            showLoginSection();
            return;
        }
    }
    
    // Normal initialization
    if (!stored[STORAGE_KEY]) {
        showSetupSection();
    } else {
        showLoginSection();
    }
    
    const handlers = {
        '#create-pass': createMasterPassword,
        '#unlock': unlock,
        '#lock': lock,
        '#add-current': addCurrentPage,
		'#export': () => ImportExportManager.exportData(),
		'#import-btn': () => getCachedElement('#import-file').click(),
		'#import-from-chrome': () => ImportExportManager.importFromChromeBookmarks(data, saveAndRefresh),
		'#import-from-chrome-advanced': () => ImportExportManager.importFromChromeBookmarksAdvanced(data, saveAndRefresh),
        '#support-btn': () => chrome.tabs.create({ url: chrome.runtime.getURL('donate.html') }),
        '#settings-btn': () => showSection('settings'),
        '#back': () => showSection('main'),
        '#change-pass': changeMasterPassword,
        '#modal-cancel': () => getCachedElement('#add-bookmark-modal').style.display = 'none',
        '#manager-btn': openManager,
        '#faq-btn': () => chrome.tabs.create({ url: 'https://osv-it-studio.github.io/holy-private-bookmarks#faq' }),
        '#quick-add-bookmark': () => openAddBookmarkModal('', 'https://'),
        '#open-github': () => chrome.tabs.create({ url: 'https://github.com/OSV-IT-Studio/holy-private-bookmarks'}),
        '#about-btn': () => getCachedElement('#about-modal').style.display = 'flex',
        '#close-about': () => getCachedElement('#about-modal').style.display = 'none',
        '#quick-add-folder': addFolder,
        '#clear-history': () => {
            const clearHistoryBtn = getCachedElement('#clear-history');
            if (clearHistoryBtn && window.HistoryCleaner) {
                window.HistoryCleaner.clearBookmarksHistoryByDomain(clearHistoryBtn, data.folders);
            }
        }
    };
    
    Object.entries(handlers).forEach(([selector, handler]) => {
        const element = getCachedElement(selector);
        if (element) {
            element.addEventListener('click', handler);
        }
    });
    
    
    const newFolderBtn = document.getElementById('new-folder-in-modal');
    if (newFolderBtn) {
        newFolderBtn.addEventListener('click', () => {
            const name = prompt(getMessage('folderName') || 'Folder name:');
            if (name && name.trim()) {
                const newFolder = { type: 'folder', name: name.trim(), children: [], dateAdded: Date.now() };
                data.folders.push(newFolder);
                saveAndRefresh().then(() => {
                    const select = document.getElementById('folder-select');
                    select.innerHTML = '';
                    const rootOption = document.createElement('option');
                    rootOption.value = '';
                    rootOption.textContent = getMessage('rootFolder') || 'Root folder';
                    select.appendChild(rootOption);
                    buildFolderOptions(data.folders, select, '', 0);
                    select.value = (data.folders.length - 1).toString();
                });
            }
        });
    }
    
    const modalSaveBtn = getCachedElement('#modal-save');
    if (modalSaveBtn) {
        modalSaveBtn.addEventListener('click', handleModalSave);
    }
    const importFile = getCachedElement('#import-file');
	if (importFile) {
    importFile.addEventListener('change', (e) => {
        ImportExportManager.importData(e, () => {
            lock(); 
            showLoginSection(); 
        });
    });
}


    // HTML Importer
if (window.HTMLImporter) {
    window.HTMLImporter._getCurrentData = () => data;
    
    const initialized = window.HTMLImporter.initPopupImporter({
        maxFileSize: 1 * 1024 * 1024,
        onSuccess: async (result) => {
            data.folders.push(...result.folders);
            await saveAndRefresh();
            
            const stats = result.stats;
            let message = getMessage('importHtmlSuccess', [stats.imported.toString()]);
            
            if (!message || message === 'importHtmlSuccess') {
                message = `Imported ${stats.imported} bookmarks`;
            }

            showNotification(message);

            if (typeof renderTree === 'function') {
                renderTree();
            }
        }, 
        onError: (errorMessage) => {
            showNotification(errorMessage, true);
        },
        onProgress: (statusMessage) => {
            showLoadingIndicator(document.body, statusMessage);
        }
    });
    
    if (!initialized) {
    }
}
    isInitialized = true;
}

async function openManager() {
    window.close();
    
    const managerUrl = chrome.runtime.getURL('manager.html');
    
    try {
        const tabs = await chrome.tabs.query({ url: managerUrl });
        
        if (tabs.length > 0 && tabs[0].id) {
            await chrome.tabs.update(tabs[0].id, { active: true });
            await chrome.windows.update(tabs[0].windowId, { focused: true });
        } else {
            chrome.tabs.create({ url: managerUrl });
        }
    } catch (error) {
        chrome.tabs.create({ url: managerUrl });
    }
}

// CLEANING 

window.addEventListener('beforeunload', performFullCleanup);
window.addEventListener('pagehide', performFullCleanup);

window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        if (messageCache?.clear) messageCache.clear();
        if (faviconCache?.clear) faviconCache.clear();
    }
});

// Launch
document.addEventListener('DOMContentLoaded', init);
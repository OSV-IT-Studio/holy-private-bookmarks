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

const ImportExportManager = (function() {
    // DEPENDENCIES 
    const Shared = window.HolyShared || {};
    const {
        STORAGE_KEY,
        getMessage,
        showNotification,
        showLoadingIndicator,
        hideLoadingIndicator,
        convertChromeBookmarks,
        countItemsInFolder,
        getItemByPath,
        closeModal,
        data
    } = Shared;

    // EXPORT 
    
    
    async function exportData() {
        try {
            const stored = await chrome.storage.local.get(STORAGE_KEY);
            const blob = new Blob([JSON.stringify(stored[STORAGE_KEY], null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'holy-private-backup.json';
            a.click();
            URL.revokeObjectURL(url);
            
            showNotification(getMessage('exportSuccess'));
        } catch (error) {
            showNotification(getMessage('exportFailed') + error.message, true);
        }
    }

	// IMPORT FROM JSON 
    
   
    async function importData(e, callback) {
        const file = e.target.files[0];
        if (!file) return;
        
        showLoadingIndicator(document.body, 'Importing...');
        
        try {
            const text = await file.text();
            const importedJson = JSON.parse(text);
            

            if (!validateImportedData(importedJson)) {
                throw new Error('Invalid file format');
            }
            

            await chrome.storage.local.set({ [STORAGE_KEY]: importedJson });
            
            showNotification(getMessage('importSuccess'), false);
            

            if (callback) callback();
            
        } catch (error) {
            
            showNotification(getMessage('invalidFile') + error.message, true);
        } finally {
            hideLoadingIndicator(document.body);
            e.target.value = '';
        }
    }


    function validateImportedData(data) {
        if (!data || typeof data !== 'object') return false;
        

        if (data.version === 2) {
            return !!(data.encryptionSalt && data.hashSalt && data.passwordHash && data.encrypted);
        }
        

        if (data.salt && data.encrypted && !data.version) {
            return !!(data.salt && data.encrypted.iv && data.encrypted.data);
        }
        
        return false;
    }

// IMPORT FROM CHROME 
    

    async function importFromChromeBookmarks(dataRef, saveCallback) {
        if (!confirm(getMessage('importChromeConfirm'))) {
            return;
        }
        
        showLoadingIndicator(document.body, 'Importing Chrome bookmarks...');
        
        try {
            const chromeBookmarks = await chrome.bookmarks.getTree();
            const importedFolders = convertChromeBookmarks(chromeBookmarks[0].children || []);
            
            dataRef.folders.push(...importedFolders);
            
            if (saveCallback) {
                await saveCallback();
            }
            
            showNotification(getMessage('importChromeSuccess'));
        } catch (error) {
            showNotification(getMessage('importChromeError') + ': ' + error.message, true);
        } finally {
            hideLoadingIndicator(document.body);
        }
    }


    async function importFromChromeBookmarksAdvanced(dataRef, saveCallback) {
        try {
            const chromeBookmarks = await chrome.bookmarks.getTree();
            showChromeImportModal(chromeBookmarks[0].children || [], dataRef, saveCallback);
        } catch (error) {
            showNotification(getMessage('importChromeError') + ': ' + error.message, true);
        }
    }


    function showChromeImportModal(bookmarkNodes, dataRef, saveCallback) {
        const modal = document.createElement('div');
        modal.id = 'chrome-import-modal';
        modal.className = 'hpb-modal hpb-modal--open';
        modal.innerHTML = `
            <div class="hpb-modal__dialog">
                <h2 class="hpb-modal__title">${getMessage('selectFoldersToImport')}</h2>
                <div class="hpb-modal__body">
                    <div id="folders-list" class="import-folders-list"></div>
                </div>
                <div class="hpb-modal__footer">
                    <button class="btn-secondary" id="cancel-import">${getMessage('cancel')}</button>
                    <button class="btn-primary"   id="confirm-import">${getMessage('importSelected')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        const foldersList = modal.querySelector('#folders-list');
        const selectedFolders = new Map();
        
        function renderFolders(nodes, parentId = '', depth = 0) {
            nodes.forEach((node, index) => {
                if (!node.url && node.children && node.children.length > 0) {
                    const folderId = parentId ? `${parentId}-${index}` : `folder-${index}`;
                    
                    const folderDiv = document.createElement('div');
                    folderDiv.className = 'import-folder-item';
                    folderDiv.style.marginLeft = `${depth * 20}px`;
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.id = folderId;
                    checkbox.checked = false;
                    checkbox.className = 'import-folder-checkbox';
                    
                    const label = document.createElement('label');
                    label.htmlFor = folderId;
                    label.textContent = (node.title || 'Unnamed Folder') + ` (${countItemsInFolder(node)} bookmarks)`;
                    label.className = 'import-folder-label';
                    
                    label.prepend(checkbox);
                    folderDiv.appendChild(label);
                    
                    checkbox.addEventListener('change', (e) => {
                        const isChecked = e.target.checked;
                        
                        if (isChecked) {
                            selectedFolders.set(folderId, {
                                node: node,
                                childrenIds: getAllChildFolderIds(node, folderId, [])
                            });
                            
                            const childIds = selectedFolders.get(folderId).childrenIds;
                            childIds.forEach(childId => {
                                selectedFolders.delete(childId);
                                const childCheckbox = document.getElementById(childId);
                                if (childCheckbox) {
                                    childCheckbox.checked = false;
                                    childCheckbox.disabled = true;
                                }
                            });
                        } else {
                            selectedFolders.delete(folderId);
                            const childIds = getAllChildFolderIds(node, folderId, []);
                            childIds.forEach(childId => {
                                const childCheckbox = document.getElementById(childId);
                                if (childCheckbox) {
                                    childCheckbox.disabled = false;
                                }
                            });
                        }
                    });
                    
                    foldersList.appendChild(folderDiv);
                    
                    if (node.children) {
                        renderFolders(node.children, folderId, depth + 1);
                    }
                }
            });
        }

        function getAllChildFolderIds(folderNode, parentId, result = []) {
            if (!folderNode.children) return result;
            
            folderNode.children.forEach((child, index) => {
                if (!child.url && child.children && child.children.length > 0) {
                    const childId = `${parentId}-${index}`;
                    result.push(childId);
                    getAllChildFolderIds(child, childId, result);
                }
            });
            
            return result;
        }
        
        renderFolders(bookmarkNodes);
        
        modal.querySelector('#cancel-import').addEventListener('click', () => {
            (Shared.closeModalWithAnimation || ((el) => { Shared.closeModal(el); }))(modal);
        });
        
        modal.querySelector('#confirm-import').addEventListener('click', async () => {
            const importedData = [];
            
            selectedFolders.forEach((folderData) => {
                const folder = folderData.node;
                const converted = convertChromeBookmarks(folder.children || []);
                if (converted.length > 0) {
                    importedData.push({
                        type: 'folder',
                        name: folder.title || 'Imported Folder',
                        children: converted,
                        dateAdded: Date.now(),
                        uid: (Shared.generateFolderUid ? Shared.generateFolderUid() : ('f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)))
                    });
                }
            });
            
            dataRef.folders.push(...importedData);
            
            if (saveCallback) {
                await saveCallback();
            }
            
            const closeImport = Shared.closeModalWithAnimation || ((el) => { Shared.closeModal(el); });
            closeImport(modal);
            showNotification(getMessage('importChromeSuccess'));
        });
    }


   
// EXPORT TO HTML (Netscape Bookmarks Format)

    function _buildNetscapeHTML(folders, indent) {
        let html = '';
        const pad = '    '.repeat(indent);
        for (const item of folders) {
            if (!item) continue;
            if (item.type === 'bookmark') {
                const title = _escapeHtml(item.title || 'Untitled');
                const url   = _escapeHtml(item.url  || '');
                const ts    = item.dateAdded ? Math.floor(item.dateAdded / 1000) : 0;
                html += `${pad}<DT><A HREF="${url}" ADD_DATE="${ts}">${title}</A>\n`;
            } else if (item.type === 'folder') {
                const name = _escapeHtml(item.name || 'Folder');
                const ts   = item.dateAdded ? Math.floor(item.dateAdded / 1000) : 0;
                html += `${pad}<DT><H3 ADD_DATE="${ts}">${name}</H3>\n`;
                html += `${pad}<DL><p>\n`;
                if (Array.isArray(item.children) && item.children.length > 0) {
                    html += _buildNetscapeHTML(item.children, indent + 1);
                }
                html += `${pad}</DL><p>\n`;
            }
        }
        return html;
    }

    function _escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function _showPasswordModal() {
        const lockIcon = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>`;
        return (window.HolyShared.showPrompt || Shared.showPrompt)({
            title:        getMessage('exportHtmlConfirmTitle'),
            description:  getMessage('exportHtmlConfirmDesc'),
            placeholder:  getMessage('masterPassword'),
            confirmLabel: getMessage('exportHtmlConfirmBtn'),
            cancelLabel:  getMessage('cancel'),
            inputType:    'password',
            icon:         lockIcon,
            confirmStyle: 'btn-danger',
        });
    }
    async function exportToHTML() {
    const SecureCrypto = window.SecureCrypto;
    const { secureWipeArray, showGlobalLoadingIndicator, hideGlobalLoadingIndicator } = window.HolyShared || {};

    const password = await _showPasswordModal();
    if (!password) return;

    let passwordBuf   = null;
    let decryptedJson = null;
    const exportImport = document.querySelector('.exportImport') || document.body;
    const wasReady = SecureCrypto.isReady();

    try {
        passwordBuf = new TextEncoder().encode(password);

        const stored = await chrome.storage.local.get(STORAGE_KEY);
        const storedData = stored[STORAGE_KEY];
        if (!storedData) throw new Error(getMessage('exportFailed') + ': no stored data');

        showGlobalLoadingIndicator(exportImport, getMessage('exportHtmlVerifying'));

        const isValid = await SecureCrypto.verifyPassword(password, storedData);
        if (!isValid) {
            showNotification(getMessage('wrongPassword'), true);
            return;
        }

        if (!wasReady) {
            await SecureCrypto.initAfterVerification(password, storedData);
        }

        decryptedJson = await SecureCrypto.decrypt(storedData.encrypted);
        const loadedData = JSON.parse(decryptedJson);
        const folders = Array.isArray(loadedData.folders) ? loadedData.folders : [];

        let content  = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n`;
        content += `<!-- This is an automatically generated file.\n`;
        content += `     It will be read and overwritten.\n`;
        content += `     DO NOT EDIT! -->\n`;
        content += `<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n`;
        content += `<TITLE>Bookmarks</TITLE>\n`;
        content += `<H1>Bookmarks</H1>\n`;
        content += `<DL><p>\n`;
        content += _buildNetscapeHTML(folders, 1);
        content += `</DL><p>\n`;

        const blob = new Blob([content], { type: 'text/html; charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = 'holy-private-bookmarks.html';
        a.click();
        URL.revokeObjectURL(url);

        showNotification(getMessage('exportHtmlSuccess'));

    } catch (error) {
        showNotification(getMessage('exportFailed') + ': ' + error.message, true);
    } finally {

        if (passwordBuf) {
            try { secureWipeArray(passwordBuf); } catch (_) {}
            passwordBuf = null;
        }

        if (decryptedJson !== null) {
            try { secureWipeArray(new TextEncoder().encode(decryptedJson)); } catch (_) {}
            decryptedJson = null;
        }

        if (!wasReady) {
            try { SecureCrypto.clear(); } catch (_) {}
        }

        hideGlobalLoadingIndicator(exportImport);
    }
}


// EXPORT API 
    
    return {
        exportData,
        exportToHTML,
        importData,
        validateImportedData,
        importFromChromeBookmarks,
        importFromChromeBookmarksAdvanced,
        
    };

})();

// EXPORT TO THE GLOBAL AREA
if (typeof window !== 'undefined') {
    window.ImportExportManager = ImportExportManager;
}

if (typeof module !== 'undefined') {
    module.exports = ImportExportManager;
}
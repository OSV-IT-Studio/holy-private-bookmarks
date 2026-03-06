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
            
            showNotification(getMessage('exportSuccess') || 'Export successful');
        } catch (error) {
            showNotification(getMessage('exportFailed') || 'Export failed: ' + error.message, true);
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
            
            hideLoadingIndicator(document.body);
            showNotification(getMessage('importSuccess') || 'Import successful', false);
            

            if (callback) callback();
            
        } catch (error) {
            console.error('Import error:', error);
            showNotification(getMessage('invalidFile') || 'Invalid file format: ' + error.message, true);
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
            
            showNotification(getMessage('importChromeSuccess') || 'Chrome bookmarks imported successfully');
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
        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(16px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;
        
        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.cssText = `
            background: var(--card-bg);
            backdrop-filter: blur(20px);
            border: 1px solid var(--card-border);
            border-radius: var(--radius);
            padding: 28px;
            width: 90%;
            max-width: 500px;
            max-height: 80vh;
            overflow-y: auto;
        `;
        
        content.innerHTML = `
            <h2 style="margin-top:0; color:var(--accent);">${getMessage('selectFoldersToImport') || 'Select folders to import'}</h2>
            <div id="folders-list" style="margin: 20px 0; max-height: 300px; overflow-y: auto;"></div>
            <div class="modal-buttons">
                <button class="btn-secondary" id="cancel-import">${getMessage('cancel')}</button>
                <button class="btn-primary" id="confirm-import">${getMessage('importSelected') || 'Import selected'}</button>
            </div>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        const foldersList = content.querySelector('#folders-list');
        const selectedFolders = new Map();
        
        function renderFolders(nodes, parentId = '', depth = 0) {
            nodes.forEach((node, index) => {
                if (!node.url && node.children && node.children.length > 0) {
                    const folderId = parentId ? `${parentId}-${index}` : `folder-${index}`;
                    
                    const folderDiv = document.createElement('div');
                    folderDiv.style.cssText = `
                        margin: 8px 0;
                        padding: 12px;
                        background: rgba(255, 255, 255, 0.05);
                        border-radius: 10px;
                        margin-left: ${depth * 20}px;
                    `;
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.id = folderId;
                    checkbox.checked = false;
                    checkbox.style.marginRight = '10px';
                    
                    const label = document.createElement('label');
                    label.htmlFor = folderId;
                    label.textContent = (node.title || 'Unnamed Folder') + ` (${countItemsInFolder(node)} bookmarks)`;
                    label.style.cssText = 'cursor: pointer; display: flex; align-items: center; font-weight: 500;';
                    
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
        
        content.querySelector('#cancel-import').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        content.querySelector('#confirm-import').addEventListener('click', async () => {
            const importedData = [];
            
            selectedFolders.forEach((folderData) => {
                const folder = folderData.node;
                const converted = convertChromeBookmarks(folder.children || []);
                if (converted.length > 0) {
                    importedData.push({
                        type: 'folder',
                        name: folder.title || 'Imported Folder',
                        children: converted,
                        dateAdded: Date.now()
                    });
                }
            });
            
            dataRef.folders.push(...importedData);
            
            if (saveCallback) {
                await saveCallback();
            }
            
            document.body.removeChild(modal);
            showNotification(getMessage('importChromeSuccess') || 'Chrome bookmarks imported successfully');
        });
    }


   
// EXPORT API 
    
    return {
        exportData,
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
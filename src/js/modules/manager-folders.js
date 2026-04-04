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

// MODULE: manager-folders.js
// Handles: folder tree rendering (recursive), active folder selection,
//          folder toggle (expand/collapse), folder CRUD (create/rename/delete)

const ManagerFolders = (function () {

    let _deps = {};

    function _generateUid() {
        if (_deps.generateFolderUid) return _deps.generateFolderUid();
        
        return 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    

    function renderFolderTree() {
    const { getData, countAllBookmarks, resetInactivityTimer } = _deps;
    const tree = document.getElementById('folder-tree');
    if (!tree) return;

    
    saveFoldersState();

    const allBookmarksItem = tree.querySelector('.all-bookmarks');
    tree.innerHTML = '';
    if (allBookmarksItem) tree.appendChild(allBookmarksItem);

    const allCount = document.getElementById('all-count');
    if (allCount) allCount.textContent = countAllBookmarks(getData());

    const fragment = document.createDocumentFragment();
    _renderFoldersRecursive(getData().folders, fragment, []);
    tree.appendChild(fragment);

    _addFolderTreeEventListeners();
    
    
    restoreFoldersState();
    
    const currentId = _deps.getCurrentFolderId?.();
    if (currentId) {
        const active = document.querySelector(`.folder-item[data-folder-id="${currentId}"]`) ||
                       document.querySelector('.all-bookmarks');
        if (active) active.classList.add('active');
    }

    resetInactivityTimer();
}

    function _renderFoldersRecursive(items, container, path = [], depth = 0) {
    const { countItemsInFolder, getMessage } = _deps;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type !== 'folder') continue;

        const currentPath   = [...path, i];
        const folderId      = currentPath.join(',');
        const itemCount     = countItemsInFolder(item);
        const hasSubfolders = item.children?.some(c => c.type === 'folder');

        const li = document.createElement('li');
        li.className    = 'folder-item' + (hasSubfolders ? ' has-children' : '');
        li.dataset.folderId = folderId;
        if (item.uid) li.dataset.folderUid = item.uid;

        // Toggle arrow
        const folderContent = document.createElement('div');
        folderContent.className = 'folder-content';

        const toggleSpan = document.createElement('span');
        toggleSpan.className = 'folder-toggle';
        if (hasSubfolders) toggleSpan.textContent = '▶'; 
        folderContent.appendChild(toggleSpan);

        // Icon
        const iconDiv = document.createElement('div');
        iconDiv.className = 'folder-icon';
        iconDiv.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
        `;
        folderContent.appendChild(iconDiv);

        // Name
        const nameDiv = document.createElement('div');
        nameDiv.className   = 'folder-name';
        nameDiv.textContent = item.name;
        folderContent.appendChild(nameDiv);

        // Action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'folder-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'folder-action-btn edit';
        editBtn.title     = getMessage('rename');
        editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
        editBtn.addEventListener('click', e => {
            e.stopPropagation();
            renameFolder(e.currentTarget.closest('.folder-item').dataset.folderId);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'folder-action-btn delete';
        deleteBtn.title     = getMessage('delete');
        deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
        deleteBtn.addEventListener('click', e => {
            e.stopPropagation();
            deleteFolder(e.currentTarget.closest('.folder-item').dataset.folderId);
        });

        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(deleteBtn);
        folderContent.appendChild(actionsDiv);
        li.appendChild(folderContent);

        // Count badge
        const countDiv = document.createElement('div');
        countDiv.className   = 'folder-badge';
        countDiv.textContent = itemCount;
        li.appendChild(countDiv);

        container.appendChild(li);


if (hasSubfolders) {
    const subUl = document.createElement('ul');
    subUl.className = 'subfolder-list';
    subUl.style.display = 'none'; 
    container.appendChild(subUl);
    _renderFoldersRecursive(item.children, subUl, currentPath, depth + 1);
}
    }
}

    function _addFolderTreeEventListeners() {
        
        document.querySelectorAll('.folder-item.has-children .folder-toggle').forEach(toggle => {
            toggle.addEventListener('click', e => {
                e.stopPropagation();
                _toggleFolderExpand(toggle.closest('.folder-item'));
            });
        });

        
        document.querySelectorAll('.folder-item').forEach(item => {
            item.addEventListener('click', e => {
                if (e.target.closest('.folder-toggle')) return;
                if (e.target.closest('.folder-actions')) return;
                setActiveFolder(item.dataset.folderId || 'all');
            });
        });
    }

    function _toggleFolderExpand(folderItem) {
    const toggle  = folderItem.querySelector('.folder-toggle');
    const subList = folderItem.nextElementSibling;
    if (!subList?.classList.contains('subfolder-list')) return;

    const isExpanded = folderItem.classList.contains('expanded');
    
    
    folderItem.classList.toggle('expanded', !isExpanded);
    
    
    toggle.textContent = isExpanded ? '▶' : '▼';
    
    
    if (isExpanded) {
        subList.style.display = 'none'; 
    } else {
        subList.style.display = 'block'; 
    }

    _deps.resetInactivityTimer();
}

    // Active folder

    function setActiveFolder(folderId) {
    const { getMessage, findFolderById, getBookmarksForFolder,
            renderBookmarks, resetInactivityTimer,
            setCurrentFolderId, resetPagination, escapeHtml } = _deps; 

    setCurrentFolderId(folderId);
    resetPagination();

    document.querySelectorAll('.folder-item').forEach(i => i.classList.remove('active'));
    const active = document.querySelector(`.folder-item[data-folder-id="${folderId}"]`) ||
                   document.querySelector('.all-bookmarks');
    if (active) active.classList.add('active');

    
    updateBreadcrumbs(folderId);

    renderBookmarks();
    resetInactivityTimer();
}

    // Folder CRUD

    async function createNewFolder(parentFolderId = '') {
        const { getMessage, showNotification, getData, saveChanges,
                clearBookmarksCache, resetInactivityTimer } = _deps;

        const folderName = await _deps.showPrompt({
            title:        getMessage('newFolder'),
            placeholder:  getMessage('folderName'),
            confirmLabel: getMessage('save'),
        });
        if (!folderName?.trim()) return;

        const newFolder = {
            type: 'folder',
            name: folderName.trim(),
            children: [],
            dateAdded: Date.now(),
            uid: _generateUid()
        };

        if (parentFolderId === '') {
            getData().folders.push(newFolder);
        } else {
            const parent = _deps.findFolderById(getData().folders, parentFolderId);
            if (parent) {
                if (!parent.children) parent.children = [];
                parent.children.push(newFolder);
            } else {
                getData().folders.push(newFolder);
            }
        }

        await saveChanges();
        clearBookmarksCache();
        renderFolderTree();
        _deps.renderBookmarks();
        showNotification(getMessage('folderCreated'));
        resetInactivityTimer();
    }

    async function renameFolder(folderId) {
        const { getMessage, showNotification, getData, saveChanges,
                clearBookmarksCache, resetInactivityTimer,
                getCurrentFolderId, findFolderById } = _deps;

        if (folderId === 'all') {
            showNotification(getMessage('cannotRenameAll'), true);
            return;
        }

        const folder = findFolderById(getData().folders, folderId);
        if (!folder) return;

        const newName = await _deps.showPrompt({
            title:        getMessage('renameFolder'),
            defaultValue: folder.name,
            confirmLabel: getMessage('save'),
        });
        if (!newName?.trim() || newName.trim() === folder.name) return;

        folder.name = newName.trim();
        await saveChanges();
        clearBookmarksCache();
        renderFolderTree();
        _deps.renderBookmarks();

        if (getCurrentFolderId() === folderId) {
            updateBreadcrumbs(folderId);
        }

        showNotification(getMessage('folderRenamed'));
        resetInactivityTimer();
    }

    async function deleteFolder(folderId) {
    const { getMessage, showNotification, getData, saveChanges, clearBookmarksCache,
            resetInactivityTimer, countFoldersInFolder, removeItemByPath,
            getFolderPathById, findFolderById, getCurrentFolderId } = _deps;

    if (folderId === 'all') {
        showNotification(getMessage('cannotDeleteAll'), true);
        return;
    }

    const folder = findFolderById(getData().folders, folderId);
    if (!folder) return;

    const bookmarkCount = _deps.countBookmarksInFolder(folderId);
    const folderCount   = countFoldersInFolder(folder);

    let message = (getMessage('deleteFolderConfirm'))
        .replace('{0}', folder.name)
        .replace('{name}', folder.name);

    if (bookmarkCount > 0 || folderCount > 0) {
        message += '\n\n' + (getMessage('deleteFolderWarning'));
    }

    const lines   = message.split('\n\n');
    const confirmed = await _deps.showConfirm({
        title:   lines[0] || message,
        warning: lines[1] || '',
    });
    if (!confirmed) return;

    const path = getFolderPathById(folderId);
    if (!path) return;

    removeItemByPath(getData(), path);
    await saveChanges();
    clearBookmarksCache();


    try {
        const saved = sessionStorage.getItem('expandedFolders');
        if (saved) {
            const expandedKeys = JSON.parse(saved);
            const filtered = expandedKeys.filter(key => key !== folderId && !key.startsWith(folderId + ','));
            sessionStorage.setItem('expandedFolders', JSON.stringify(filtered));
        }
    } catch (e) {  }

    renderFolderTree();  
if (getCurrentFolderId() === folderId || getCurrentFolderId().startsWith(folderId + ',')) {
    setActiveFolder('all');
} else {
    _deps.renderBookmarks();
}

    showNotification(getMessage('folderDeleted'));
    resetInactivityTimer();
}

    function initNewFolderButton() {
    document.getElementById('new-folder-btn')?.addEventListener('click', () => {
        const currentId = _deps.getCurrentFolderId ? _deps.getCurrentFolderId() : '';
        createNewFolder(currentId === 'all' ? '' : currentId);
    });
}

function updateBreadcrumbs(folderId) {
  const { getData, findFolderById, getMessage, countBookmarksInFolder, escapeHtml, setActiveFolder } = _deps;
  const breadcrumbsContainer = document.getElementById('breadcrumbs');
  if (!breadcrumbsContainer) return;

  let breadcrumbs = [];
  
  if (folderId === 'all') {
    breadcrumbs = [{
      id: 'all',
      name: getMessage('allBookmarks')
    }];
  } else {
    const path = folderId.split(',').map(Number);
    let currentPath = [];
    let currentItems = getData().folders;
    
   
    breadcrumbs.push({
      id: 'all',
      name: getMessage('allBookmarks')
    });
    
 
    for (let i = 0; i < path.length; i++) {
      const index = path[i];
      const folder = currentItems[index];
      if (folder && folder.type === 'folder') {
        const folderPath = [...currentPath, index];
        breadcrumbs.push({
          id: folderPath.join(','),
          name: folder.name
        });
        currentPath = folderPath;
        currentItems = folder.children || [];
      } else {
        break;
      }
    }
  }

 
  let html = '';
  for (let i = 0; i < breadcrumbs.length; i++) {
    const crumb = breadcrumbs[i];
    const isLast = i === breadcrumbs.length - 1;
    
    html += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" 
                  data-folder-id="${crumb.id}"
                  ${isLast ? 'aria-current="page"' : ''}>`;
    
 
    if (i === 0) {
      html += `<svg class="breadcrumb-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>`;
    }
    
    html += `${escapeHtml(crumb.name)}</span>`;
    
    if (!isLast) {
      html += `<span class="breadcrumb-separator">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="5 3 10 7 5 11" />
        </svg>
      </span>`;
    }
  }
  
  breadcrumbsContainer.innerHTML = html;

  
  breadcrumbsContainer.querySelectorAll('.breadcrumb-item:not(.active)').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = item.dataset.folderId;
      if (id) {
        setActiveFolder(id); 
      }
    });
  });


  const count = countBookmarksInFolder(folderId);
  const countElement = document.getElementById('bookmarks-count');
  if (countElement) {
    countElement.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
      <span class="count-number">${count}</span> 
      <span>${count === 1 
        ? (getMessage('bookmark')) 
        : (getMessage('bookmarks'))}</span>
    `;
  }
}


function saveFoldersState() {
    const expandedFolders = new Set();
    
    document.querySelectorAll('.folder-item.expanded').forEach(folder => {
        
        const key = folder.dataset.folderUid || folder.dataset.folderId;
        if (key) expandedFolders.add(key);
    });
    
    sessionStorage.setItem('expandedFolders', JSON.stringify(Array.from(expandedFolders)));
    return expandedFolders;
}


function restoreFoldersState() {
    try {
        const saved = sessionStorage.getItem('expandedFolders');
        if (!saved) return;
        
        const expandedKeys = new Set(JSON.parse(saved));
        
        expandedKeys.forEach(key => {
            
            const folder =
                document.querySelector(`.folder-item[data-folder-uid="${key}"]`) ||
                document.querySelector(`.folder-item[data-folder-id="${key}"]`);

            if (folder && !folder.classList.contains('expanded')) {
                folder.classList.add('expanded');
                const toggle = folder.querySelector('.folder-toggle');
                if (toggle) toggle.textContent = '▼';
                
                const subList = folder.nextElementSibling;
                if (subList?.classList.contains('subfolder-list')) {
                    subList.style.display = 'block';
                }
            }
        });
    } catch (e) {
    }
}

    // Public API

    return {
        init(deps) { Object.assign(_deps, deps); },

        renderFolderTree,
        setActiveFolder,
        createNewFolder,
        renameFolder,
        deleteFolder,
        initNewFolderButton,
		updateBreadcrumbs,
		saveFoldersState,
		restoreFoldersState
    };

})();

if (typeof window !== 'undefined') window.ManagerFolders = ManagerFolders;
if (typeof module !== 'undefined') module.exports = ManagerFolders;
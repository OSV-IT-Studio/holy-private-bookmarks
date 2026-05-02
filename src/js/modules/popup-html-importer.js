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

const HTMLImporter = (function() {
  
  let _callbacks = {
    onSuccess: null,
    onError: null,
    onProgress: null
  };

  function _makeUid() {
    if (typeof window !== 'undefined' && window.HolyShared && window.HolyShared.generateFolderUid) {
      return window.HolyShared.generateFolderUid();
    }
    return 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }


  const _messages = {
    noFileSelected: 'htmlImporterNoFileSelected',
    fileTooLarge: 'htmlImporterFileTooLarge',
    parseError: 'htmlImporterParseError',
    noBookmarksFound: 'htmlImporterNoBookmarksFound',
    maxFileSize: 1024 * 1024 
  };


  function getLocalizedMessage(key, substitutions = []) {
    return window.HolyI18n.getMessage(key, substitutions);
  }

  function setCallbacks(callbacks) {
    _callbacks = { ..._callbacks, ...callbacks };
  }

  function parseNetscapeHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const result = {
      folders: [],
      stats: { imported: 0, skipped: 0, errors: 0 }
    };

    function processNode(node, parentFolder) {
      if (!node || !node.children) return;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        
        if (child.tagName === 'DT') {
          const h3 = child.querySelector('h3');
          if (h3) {
            const folder = {
              type: 'folder',
              name: h3.textContent.trim() || 'Unnamed Folder',
              children: [],
              dateAdded: Date.now(),
              uid: _makeUid()
            };
            
            const dl = child.querySelector('dl');
            if (dl && dl.children.length > 0) {
              processNode(dl, folder.children);
            }
            
            parentFolder.push(folder);
            continue;
          }
          
          const a = child.querySelector('a');
          if (a && a.href && a.href.startsWith('http')) {
            parentFolder.push({
              type: 'bookmark',
              title: a.textContent.trim() || a.href,
              url: a.href,
              dateAdded: Date.now()
            });
            result.stats.imported++;
            continue;
          }
          
          const p = child.querySelector('p');
          if (p) {
            const links = p.querySelectorAll('a');
            links.forEach(link => {
              if (link.href && link.href.startsWith('http')) {
                parentFolder.push({
                  type: 'bookmark',
                  title: link.textContent.trim() || link.href,
                  url: link.href,
                  dateAdded: Date.now()
                });
                result.stats.imported++;
              }
            });
          }
        }
      }
    }

    const rootDL = doc.querySelector('dl');
    if (rootDL) {
      processNode(rootDL, result.folders);
    }

    return result;
  }

  function createFolderStructure(items, targetArray) {
    for (const item of items) {
      if (item.type === 'folder') {
        const newFolder = {
          type: 'folder',
          name: item.name,
          children: [],
          dateAdded: Date.now(),
          uid: _makeUid()
        };
        
        if (item.children && item.children.length > 0) {
          createFolderStructure(item.children, newFolder.children);
        }
        
        targetArray.push(newFolder);
      } else if (item.type === 'bookmark') {
        targetArray.push({
          type: 'bookmark',
          title: item.title,
          url: item.url,
          dateAdded: Date.now()
        });
      }
    }
  }

  async function importFromHTML(file) {
    if (!file) {
      if (_callbacks.onError) {
        const message = getLocalizedMessage(_messages.noFileSelected);
        _callbacks.onError(message);
      }
      return;
    }

    if (file.size > _messages.maxFileSize) {
      if (_callbacks.onError) {
        const message = getLocalizedMessage(_messages.fileTooLarge);
        _callbacks.onError(message);
      }
      return;
    }

    let text = null;

    try {
      text = await file.text();

      const parsed = parseNetscapeHTML(text);

      
      text = null;

      if (parsed.stats.imported === 0) {
        if (_callbacks.onError) {
          const message = getLocalizedMessage(_messages.noBookmarksFound);
          _callbacks.onError(message);
        }
        return;
      }

      const result = {
        folders: [],
        stats: parsed.stats
      };

      createFolderStructure(parsed.folders, result.folders);

      
      parsed.folders.length = 0;

      if (_callbacks.onSuccess) {
        
        await _callbacks.onSuccess(result);
      }

    } catch (error) {
      
      text = null;

      if (_callbacks.onError) {
        const msg = error && error.message ? error.message : String(error);
        const isOOM =
          error instanceof RangeError ||
          msg.toLowerCase().includes('out of memory') ||
          msg.toLowerCase().includes('allocation failed') ||
          msg.toLowerCase().includes('quota');

        const detail = isOOM
          ? 'Not enough memory — the file may be too large. Try a smaller export.'
          : msg;

        const message = getLocalizedMessage(_messages.parseError, [detail]);
        _callbacks.onError(message);
      }
    }
  }

  function initPopupImporter(callbacks = {}) {
    setCallbacks(callbacks);
    
    const importBtn = document.getElementById('import-html-btn');
    const importFile = document.getElementById('import-html-file');
    
    if (!importBtn || !importFile) {
      getMessage('Error');
      return false;
    }

    importBtn.addEventListener('click', () => {
      importFile.click();
    });

    importFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await importFromHTML(file);
      }
      importFile.value = '';
    });

    return true;
  }

  return {
    initPopupImporter,
  };
})();

if (typeof window !== 'undefined') {
  window.HTMLImporter = HTMLImporter;
}

if (typeof module !== 'undefined') {
  module.exports = HTMLImporter;
}
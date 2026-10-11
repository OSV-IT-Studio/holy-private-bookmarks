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
        showConfirm,
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
        const confirmed = await (window.HolyShared.showConfirm || showConfirm)({
            title: getMessage('importChromeConfirm'),
            confirmLabel: getMessage('importSelected'),
        });
        if (!confirmed) {
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
			hideSearchAndClear();
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
			hideSearchAndClear();
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


    const PAGE_KDF_ITERATIONS = 600000;

    async function _capturePageInTab() {
        const MAX_ONE = 8 * 1024 * 1024;
        const MAX_TOTAL = 40 * 1024 * 1024;
        const FETCH_TIMEOUT = 10000;
        const cache = new Map();
        let total = 0;
        let started = 0;
        let finished = 0;
        let lastSent = 0;

        const READER_CSS = `
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fbfbfa;color:#1f2328;font:18px/1.7 Georgia,"Times New Roman",serif}
article{max-width:42rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}
h1{font:700 2rem/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;margin:0 0 .5rem}
h2,h3,h4,h5,h6{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.3;margin:2em 0 .6em}
.byline{margin:0 0 2rem;color:#6a7078;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
p,ul,ol,blockquote,pre,figure,table{margin:0 0 1.2em}
img,svg{max-width:100%;height:auto}
figure{margin-left:0;margin-right:0}
figcaption{font-size:.85em;color:#6a7078}
a{color:#2563eb}
blockquote{margin-left:0;padding-left:1em;border-left:3px solid #c9ced6;color:#4a5058}
pre,code{font-family:ui-monospace,Consolas,monospace;font-size:.9em}
pre{padding:1em;background:#eef0f3;overflow:auto;border-radius:6px}
table{border-collapse:collapse;display:block;overflow:auto}
td,th{border:1px solid #d5d9df;padding:.4em .7em}
@media(prefers-color-scheme:dark){body{background:#14161a;color:#e6e8eb}.byline,figcaption{color:#98a0aa}a{color:#7db4f2}blockquote{border-color:#3a4049;color:#b4bac2}pre{background:#1d2026}td,th{border-color:#343a42}}
`;

        function buildReaderRoot() {
            if (typeof Readability !== 'function') return null;
            let article = null;
            try {
                article = new Readability(document.cloneNode(true), { keepClasses: false }).parse();
            } catch (e) {
                return null;
            }
            if (!article || !article.content || (article.textContent || '').trim().length < 250) return null;
            const title = article.title || document.title || '';
            const doc = document.implementation.createHTMLDocument(title);
            const html = doc.documentElement;
            if (article.lang) html.setAttribute('lang', article.lang);
            if (article.dir) html.setAttribute('dir', article.dir);
            const wrap = doc.createElement('article');
            const heading = doc.createElement('h1');
            heading.textContent = title;
            wrap.appendChild(heading);
            if (article.byline) {
                const byline = doc.createElement('p');
                byline.className = 'byline';
                byline.textContent = article.byline;
                wrap.appendChild(byline);
            }
            const content = doc.createElement('div');
            content.innerHTML = article.content;
            wrap.appendChild(content);
            doc.body.appendChild(wrap);
            return html;
        }

        function reportProgress(force) {
            const now = Date.now();
            if (!force && now - lastSent < 120) return;
            lastSent = now;
            try {
                const result = chrome.runtime.sendMessage({ action: 'hpbPageProgress', done: finished, total: started });
                if (result && result.catch) result.catch(() => {});
            } catch (e) {}
        }

        function blobToDataUrl(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
        }

        async function guardedFetch(url) {
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT);
            try {
                return await fetch(url, { credentials: 'include', signal: ctl.signal });
            } finally {
                clearTimeout(timer);
            }
        }

        function fetchData(url) {
            if (cache.has(url)) return cache.get(url);
            const task = (async () => {
                if (!/^(https?|blob):/i.test(url)) return null;
                started++;
                reportProgress(false);
                try {
                    const res = await guardedFetch(url);
                    if (!res.ok) return null;
                    const blob = await res.blob();
                    if (blob.size > MAX_ONE || total + blob.size > MAX_TOTAL) return null;
                    total += blob.size;
                    return await blobToDataUrl(blob);
                } catch (e) {
                    return null;
                } finally {
                    finished++;
                    reportProgress(finished === started);
                }
            })();
            cache.set(url, task);
            return task;
        }

        async function inlineCssUrls(css, base) {
            const re = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
            const found = new Set();
            let m;
            while ((m = re.exec(css))) found.add(m[2]);
            const map = new Map();
            await Promise.all(Array.from(found).map(async raw => {
                if (!raw || raw.startsWith('data:') || raw.startsWith('#')) return;
                let abs;
                try {
                    abs = new URL(raw, base).href;
                } catch (e) {
                    map.set(raw, null);
                    return;
                }
                map.set(raw, await fetchData(abs));
            }));
            return css
                .replace(re, (all, q, raw) => {
                    if (!raw || raw.startsWith('data:') || raw.startsWith('#')) return all;
                    const value = map.get(raw);
                    return value ? 'url("' + value + '")' : 'url("data:,")';
                })
                .replace(/@import[^;]*;/gi, '');
        }

        async function sheetCss(sheet, depth) {
            if (sheet.disabled || depth > 5) return '';
            const base = sheet.href || document.baseURI;
            let rules = null;
            try {
                rules = sheet.cssRules;
            } catch (e) {
                rules = null;
            }
            let own = '';
            let imported = '';
            if (rules) {
                for (const rule of Array.from(rules)) {
                    if (rule.type === CSSRule.IMPORT_RULE) {
                        if (rule.styleSheet) {
                            const inner = await sheetCss(rule.styleSheet, depth + 1);
                            const media = rule.media && rule.media.mediaText;
                            imported += media && media !== 'all' ? '@media ' + media + '{' + inner + '}\n' : inner;
                        }
                    } else {
                        own += rule.cssText + '\n';
                    }
                }
            } else if (sheet.href) {
                try {
                    const res = await guardedFetch(sheet.href);
                    if (res.ok) own = await res.text();
                } catch (e) {
                    own = '';
                }
            }
            return imported + await inlineCssUrls(own, base);
        }

        function viaCanvas(img) {
            try {
                if (!img.complete || !img.naturalWidth) return null;
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                canvas.getContext('2d').drawImage(img, 0, 0);
                return canvas.toDataURL('image/png');
            } catch (e) {
                return null;
            }
        }

        const root = document.documentElement;
        const readerRoot = buildReaderRoot();
        const reader = !!readerRoot;
        const clone = reader ? readerRoot : root.cloneNode(true);
        const origImgs = reader ? [] : Array.from(root.querySelectorAll('img'));
        const cloneImgs = Array.from(clone.querySelectorAll('img'));
        const origCanvases = reader ? [] : Array.from(root.querySelectorAll('canvas'));
        const cloneCanvases = Array.from(clone.querySelectorAll('canvas'));

        const canvasImages = origCanvases.map(c => {
            try {
                return { url: c.toDataURL('image/png'), w: c.clientWidth, h: c.clientHeight };
            } catch (e) {
                return null;
            }
        });

        let css = reader ? READER_CSS : '';
        for (const sheet of reader ? [] : Array.from(document.styleSheets)) {
            try {
                const text = await sheetCss(sheet, 0);
                if (!text) continue;
                const media = sheet.media && sheet.media.mediaText;
                css += media && media !== 'all' ? '@media ' + media + '{' + text + '}\n' : text + '\n';
            } catch (e) {
                continue;
            }
        }
        css = css.replace(/<\/style/gi, '<\\/style');

        await Promise.all(cloneImgs.map(async (img, i) => {
            const orig = origImgs[i];
            const src = (orig && (orig.currentSrc || orig.src)) || img.getAttribute('src') || '';
            img.removeAttribute('srcset');
            img.removeAttribute('sizes');
            img.removeAttribute('loading');
            let data = null;
            if (src.startsWith('data:')) data = src;
            else if (src) data = await fetchData(src);
            if (!data && orig) data = viaCanvas(orig);
            if (data) img.setAttribute('src', data);
            else img.removeAttribute('src');
        }));

        cloneCanvases.forEach((canvas, i) => {
            const snap = canvasImages[i];
            if (!snap) {
                canvas.remove();
                return;
            }
            const img = document.createElement('img');
            img.setAttribute('src', snap.url);
            img.setAttribute('style', 'width:' + snap.w + 'px;height:' + snap.h + 'px');
            canvas.replaceWith(img);
        });

        clone.querySelectorAll('script, noscript, iframe, frame, frameset, object, embed, applet, video, audio, source, track, link, base, style, template, meta[http-equiv], input[type="hidden"]').forEach(el => el.remove());

        clone.querySelectorAll('input[type="password"]').forEach(el => el.removeAttribute('value'));
        clone.querySelectorAll('input[type="image"]').forEach(el => el.removeAttribute('src'));
        clone.querySelectorAll('image').forEach(el => {
            ['href', 'xlink:href'].forEach(attr => {
                const v = el.getAttribute(attr);
                if (v && !v.startsWith('data:')) el.removeAttribute(attr);
            });
        });
        clone.querySelectorAll('use').forEach(el => {
            ['href', 'xlink:href'].forEach(attr => {
                const v = el.getAttribute(attr);
                if (v && !v.startsWith('#')) el.removeAttribute(attr);
            });
        });

        const styled = Array.from(clone.querySelectorAll('[style*="url("]'));
        await Promise.all(styled.map(async el => {
            el.setAttribute('style', await inlineCssUrls(el.getAttribute('style'), document.baseURI));
        }));

        clone.querySelectorAll('a[href], area[href]').forEach(el => {
            const href = el.getAttribute('href');
            if (href.startsWith('#')) {
                el.setAttribute('target', '_self');
                return;
            }
            try {
                const abs = new URL(href, document.baseURI);
                if (/^(https?|mailto|tel):$/i.test(abs.protocol)) el.setAttribute('href', abs.href);
                else el.removeAttribute('href');
            } catch (e) {
                el.removeAttribute('href');
            }
        });

        clone.querySelectorAll('form').forEach(el => {
            el.removeAttribute('action');
            el.removeAttribute('target');
        });

        clone.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
            });
        });

        let head = clone.querySelector('head');
        if (!head) {
            head = document.createElement('head');
            clone.insertBefore(head, clone.firstChild);
        }
        const charset = document.createElement('meta');
        charset.setAttribute('charset', 'utf-8');
        head.insertBefore(charset, head.firstChild);
        const base = document.createElement('base');
        base.setAttribute('target', '_blank');
        head.appendChild(base);
        const style = document.createElement('style');
        style.textContent = css;
        head.appendChild(style);

        return {
            html: '<!DOCTYPE html>\n' + clone.outerHTML,
            title: document.title || '',
            url: location.href
        };
    }

    function _bytesToBase64(bytes) {
        const CHUNK = 8192;
        let binary = '';
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(binary);
    }

    async function _gzipBytes(bytes) {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    function _buildEncryptedPageFile(enc, strings, lang) {
        const params = JSON.stringify(enc);
        const texts = JSON.stringify(strings).replace(/</g, '\\u003c');
        const title = _escapeHtml(strings.title);
        const language = _escapeHtml(lang);
        const dir = /^(ar|he|fa|ur)(-|_|$)/i.test(lang) ? ' dir="rtl"' : '';

        return `<!DOCTYPE html>
<html lang="${language}"${dir}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; frame-src about:; form-action 'none'">
<title>${title}</title>
<style id="s">
:root{--bg:linear-gradient(160deg,#0a0c12 0%,#0d1117 50%,#0c0f1a 100%);--card-bg:rgba(255,255,255,.055);--card-border:rgba(255,255,255,.10);--accent:#63b3ed;--text-primary:#f0f4f8;--text-secondary:rgba(240,244,248,.72);--text-tertiary:rgba(240,244,248,.45);--danger:#fc8181;--text-on-primary:#f0f4f8;--radius:18px;--shadow:0 8px 24px rgba(0,0,0,.6),0 2px 8px rgba(0,0,0,.4);--shadow-box:rgba(0,0,0,.40);--shadow-xs:rgba(0,0,0,.20);--accent-tint-sm:rgba(99,179,237,.09);--accent-tint-xl:rgba(99,179,237,.24);--accent-tint-5xl:rgba(99,179,237,.48);--accent-border-sm:rgba(99,179,237,.18);--white-tint-xs:rgba(255,255,255,.04);--white-tint-3xl:rgba(255,255,255,.32);color-scheme:dark}
html.holy-light-theme{--bg:linear-gradient(160deg,#f0f4ff 0%,#f7f8fc 50%,#eef2ff 100%);--card-bg:#ffffff;--card-border:rgba(0,0,0,.15);--accent:#2563eb;--text-primary:#1a1f36;--text-secondary:#374151;--text-tertiary:#9096b0;--danger:#e53e3e;--text-on-primary:#ffffff;--shadow:0 4px 16px rgba(26,31,54,.12),0 2px 6px rgba(26,31,54,.07);--shadow-box:rgba(26,31,54,.12);--shadow-xs:rgba(26,31,54,.06);--accent-tint-sm:rgba(0,212,255,.1);--accent-tint-xl:rgba(0,212,255,.2);--accent-tint-5xl:rgba(79,122,244,.44);--accent-border-sm:rgba(79,122,244,.18);--white-tint-xs:rgba(0,0,0,.02);--white-tint-3xl:rgba(0,0,0,.24);color-scheme:light}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--text-primary);font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5}
#box{flex:1;display:flex;align-items:center;justify-content:center;padding:20px}
.login-container{max-width:400px;width:80%;min-width:280px;padding:40px 32px;background:var(--card-bg);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border:1px solid var(--card-border);border-radius:32px;box-shadow:var(--shadow),0 20px 40px -10px var(--shadow-box);animation:fadeInUp .4s ease;position:relative;overflow:hidden; max-height: 450px}
.login-container::before{content:'';position:absolute;top:-50px;right:-50px;width:200px;height:200px;background:radial-gradient(circle,var(--accent-tint-sm) 0%,transparent 70%);border-radius:50%;pointer-events:none}
.login-header{margin-bottom:15px}
.login-icon{width:80px;height:80px;margin:0 auto 24px auto;background:var(--white-tint-xs);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-radius:24px;border:1px solid var(--accent-border-sm);display:flex;align-items:center;justify-content:center}
.login-icon svg{width:45px;height:45px;color:var(--accent)}
h1{font-size:24px;font-weight:700;text-align:center;margin:20px 0;background:var(--accent);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:-.5px}
.login-subtitle{margin:0 0 8px;color:var(--text-secondary);font-size:15px;line-height:1.5;text-align:center}
.password-field{margin-bottom:20px}
input[type=password]{width:100%;padding:16px;background:var(--card-bg);font-size:16px;color:var(--text-primary);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);transition:all .3s ease-in-out;border-radius:20px;border:1px solid var(--card-border);outline:none;margin:12px 0;font-family:inherit;box-shadow:0 2px 10px var(--shadow-xs)}
input[type=password]::placeholder{color:var(--text-tertiary)}
input[type=password]:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-tint-xl)}
.unlock-button{width:100%;padding:16px;background:linear-gradient(135deg,var(--accent),#0099cc);color:var(--text-on-primary);border:none;border-radius:var(--radius);font-family:inherit;font-size:16px;font-weight:600;cursor:pointer;transition:all .3s ease-in-out;display:flex;align-items:center;justify-content:center;position:relative;line-height:1.5;overflow:hidden}
.unlock-button:hover{transform:translateY(-2px);box-shadow:0 10px 20px -5px var(--accent-tint-5xl)}
.unlock-button:active{transform:translateY(0)}
.unlock-button:disabled{opacity:.6;cursor:wait;transform:none;box-shadow:none}
.unlock-button::after{content:'';position:absolute;inset:0;background:radial-gradient(circle,var(--white-tint-3xl) 0%,transparent 70%);transform:scale(0);transition:transform .5s ease;pointer-events:none}
.unlock-button:hover::after{transform:scale(1.5)}
#er{min-height:21px;margin:14px 0 0;color:var(--danger);font-size:14px;text-align:center}
@keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
</style>
<style id="b">
[hidden]{display:none!important}
html,body{height:100%;margin:0}
body{display:flex;flex-direction:column}
#bar{display:flex;gap:12px;align-items:center;padding:8px 14px;background:#0d1019;color:#f0f4f8;border-bottom:1px solid rgba(255,255,255,.10);font:13px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
html.holy-light-theme #bar{background:#ffffff;color:#1a1f36;border-bottom-color:rgba(0,0,0,.15)}
#bt{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45%}
#bu{color:rgba(240,244,248,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;direction:ltr;text-align:start}
html.holy-light-theme #bu{color:#9096b0}
#v{display:block;flex:1;width:100%;border:0;background:#fff}
</style>
</head>
<body>
<main id="box">
<form id="f" class="login-container" autocomplete="off">
<div class="login-header">
<div class="login-icon">
<svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" fill="none">
<g transform="matrix(0.32395952,0,0,0.32395952,-4.1461257,-4.337526)" style="clip-rule:evenodd;fill-rule:evenodd;stroke-width:6.17273;stroke-miterlimit:4;stroke-dasharray:none">
<path d="M 49.755,81.327 C 30.101,71.953 20.908,54.999 22.175,30.465 32.644,27.85 41.855,24.227 49.807,19.597 c 7.669,4.938 16.897,8.641 27.684,11.109 1.351,24.093 -7.894,40.967 -27.736,50.621 z"/>
<g transform="translate(49.8 47) scale(0.82) translate(-49.8 -47)"><polygon points="49.776,52.121 57.011,59.355 57.011,34.827 42.67,34.912 42.67,59.228" fill="currentColor"/></g>
</g>
</svg>
</div>
<h1 id="h"></h1>
</div>
<p id="hint" class="login-subtitle"></p>
<div class="password-field"><input id="pw" type="password" autocomplete="current-password" autofocus></div>
<button id="go" class="unlock-button" type="submit"></button>
<p id="er" role="alert"></p>
</form>
</main>
<div id="bar" hidden><span id="bt"></span><span id="bu"></span></div>
<iframe id="v" hidden sandbox="allow-popups allow-popups-to-escape-sandbox"></iframe>
<script type="application/json" id="p">${params}</script>
<script type="application/json" id="t">${texts}</script>
<script>
(function(){
var P=JSON.parse(document.getElementById('p').textContent);
var T=JSON.parse(document.getElementById('t').textContent);
var $=function(i){return document.getElementById(i)};
var th=T.theme||'dark';
if(th==='system')th=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
if(th==='light')document.documentElement.classList.add('holy-light-theme');
$('h').textContent=T.title;
$('hint').textContent=T.hint;
$('go').textContent=T.open;
$('pw').placeholder=T.pw;
function b64(s){var x=atob(s),u=new Uint8Array(x.length);for(var i=0;i<x.length;i++)u[i]=x.charCodeAt(i);return u}
async function gunzip(u){var s=new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'));return new Uint8Array(await new Response(s).arrayBuffer())}
$('f').addEventListener('submit',async function(e){
e.preventDefault();
var er=$('er'),go=$('go'),pw=$('pw');
er.textContent='';
if(!pw.value)return;
go.disabled=true;
try{
if(!window.crypto||!crypto.subtle||typeof DecompressionStream==='undefined')throw new Error('unsupported');
var km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw.value),'PBKDF2',false,['deriveKey']);
var key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64(P.s),iterations:P.n,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['decrypt']);
var plain;
try{plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(P.i)},key,b64(P.d)))}catch(x){er.textContent=T.wrong;pw.select();return}
var o=JSON.parse(new TextDecoder().decode(await gunzip(b64(new TextDecoder().decode(plain)))));
pw.value='';
document.title=o.title||T.title;
$('bt').textContent=o.title||'';
$('bu').textContent=o.url||'';
$('v').srcdoc=o.html;
$('s').remove();
$('box').remove();
$('bar').hidden=false;
$('v').hidden=false;
}catch(x){er.textContent=T.error}
finally{go.disabled=false}
});
})();
</script>
</body>
</html>
`;
    }

    function _setSaveProgress(container, text, percent) {
        const overlay = container.querySelector('.global-loader-container');
        if (!overlay) return;
        const label = overlay.querySelector('.accent-line-text');
        const fill = overlay.querySelector('.accent-line-fill');
        if (label && text) label.textContent = text;
        if (fill && typeof percent === 'number') {
            fill.classList.remove('animated');
            fill.style.transition = 'width .25s ease';
            fill.style.width = Math.max(0, Math.min(100, percent)) + '%';
        }
    }

    function _nextFrame() {
        return new Promise(resolve => setTimeout(resolve, 30));
    }

    async function savePageEncrypted() {
        const SecureCrypto = window.SecureCrypto;
        const { secureWipeArray, showGlobalLoadingIndicator, hideGlobalLoadingIndicator } = window.HolyShared || {};

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id || !/^(https?|file):/i.test(tab.url || '')) {
            showNotification(getMessage('savePageUnsupported'), true);
            return;
        }
        if (tab.status !== 'complete') {
            showNotification(getMessage('savePageWaitLoad'), true);
            return;
        }

        let plainBytes = null;
        let capturePercent = 0;
        const container = document.getElementById('main') || document.body;
        const previousPosition = container.style.position;

        const onProgress = (message) => {
            if (!message || message.action !== 'hpbPageProgress' || !message.total) return;
            capturePercent = Math.max(capturePercent, Math.min(99, Math.floor(100 * message.done / message.total)));
            _setSaveProgress(container, getMessage('savePageCapturing') + ' ' + capturePercent + '%', 5 + Math.round(0.7 * capturePercent));
        };
        chrome.runtime.onMessage.addListener(onProgress);

        try {
            const stored = await chrome.storage.local.get(STORAGE_KEY);
            const storedData = stored[STORAGE_KEY];
            if (!SecureCrypto.isReady() || !storedData || storedData.version !== 2 || !storedData.encryptionSalt) {
                throw new Error('vault key is not available');
            }

            showGlobalLoadingIndicator(container, getMessage('savePageCapturing') + ' 0%', true);
            _setSaveProgress(container, getMessage('savePageCapturing') + ' 0%', 5);

            let theme = 'dark';
            try {
                const themeStored = await chrome.storage.local.get('holyThemePreference');
                if (['dark', 'light', 'system'].includes(themeStored.holyThemePreference)) theme = themeStored.holyThemePreference;
            } catch (_) {}

            await _nextFrame();

            let results;
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['js/modules/readability.js']
                });
                results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: _capturePageInTab
                });
            } catch (injectError) {
                if (/Cannot access contents of url|must request permission/i.test(injectError.message || '')) {
                    showNotification(getMessage('savePageReopenPopup'), true);
                    return;
                }
                throw injectError;
            }
            const captured = results && results[0] && results[0].result;
            if (!captured || !captured.html) throw new Error(getMessage('savePageUnsupported'));

            _setSaveProgress(container, getMessage('savePageCompressing'), 75);
            await _nextFrame();

            plainBytes = await _gzipBytes(new TextEncoder().encode(JSON.stringify({
                title: captured.title,
                url: captured.url,
                date: Date.now(),
                html: captured.html
            })));

            _setSaveProgress(container, getMessage('savePageEncrypting'), 85);
            await _nextFrame();

            const sealed = await SecureCrypto.encrypt(_bytesToBase64(plainBytes));
            const enc = {
                n: PAGE_KDF_ITERATIONS,
                s: _bytesToBase64(new Uint8Array(storedData.encryptionSalt)),
                i: sealed.iv,
                d: sealed.data
            };

            _setSaveProgress(container, getMessage('savePageFinishing'), 95);
            await _nextFrame();

            const file = _buildEncryptedPageFile(enc, {
                title: getMessage('savePageViewerTitle'),
                hint:  getMessage('savePageViewerHint'),
                pw:    getMessage('masterPassword'),
                open:  getMessage('savePageViewerOpen'),
                wrong: getMessage('savePageViewerWrong'),
                error: getMessage('savePageViewerError'),
                theme: theme
            }, (chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || 'en');

            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

            const blob = new Blob([file], { type: 'text/html; charset=utf-8' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `holy-private-page-${stamp}.html`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);

            _setSaveProgress(container, getMessage('savePageSuccess'), 100);
            await new Promise(resolve => setTimeout(resolve, 400));

            showNotification(getMessage('savePageSuccess'));
        } catch (error) {
            showNotification(getMessage('exportFailed') + ': ' + error.message, true);
        } finally {
            chrome.runtime.onMessage.removeListener(onProgress);
            if (plainBytes) {
                try { secureWipeArray(plainBytes); } catch (_) {}
                plainBytes = null;
            }
            hideGlobalLoadingIndicator(container);
            container.style.position = previousPosition;
        }
    }


// EXPORT API 
    
    return {
        exportData,
        exportToHTML,
        savePageEncrypted,
        importData,
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
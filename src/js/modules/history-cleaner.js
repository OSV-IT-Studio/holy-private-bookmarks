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

const HistoryCleaner = (function() {
    
    let progressModal = null;
    let isCancelled = false;
    
    function getMessage(key, substitutions = []) {
        if (window.HolyShared && window.HolyShared.getMessage) {
            return window.HolyShared.getMessage(key, substitutions);
        }
        try {
            return chrome.i18n.getMessage(key, substitutions);
        } catch (e) {
            return key;
        }
    }

    
    function showNotification(message, isError = false) {
        if (window.HolyShared && window.HolyShared.showNotification) {
            window.HolyShared.showNotification(message, isError);
        } else {
            const notification = document.createElement('div');
            notification.className = 'notification';
            notification.textContent = message;
            if (isError) {
                notification.style.background = 'rgba(255, 64, 96, 0.9)';
            }
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 2000);
        }
    }

    
    function collectAllBookmarkUrls(items) {
        const urls = [];
        
        function collectRecursive(items) {
            for (const item of items) {
                if (item.type === 'bookmark' && item.url) {
                    urls.push(item.url);
                } else if (item.type === 'folder' && item.children) {
                    collectRecursive(item.children);
                }
            }
        }
        
        collectRecursive(items);
        return urls;
    }

    
    function showProgressModal(totalDomains) {
        if (progressModal) {
            closeProgressModal();
        }

        isCancelled = false;

        progressModal = document.createElement('div');
        progressModal.id = 'history-cleaner-progress';
        progressModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(16px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            animation: modalFadeIn 0.3s ease;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: var(--card-bg);
            backdrop-filter: blur(20px);
            border: 1px solid var(--card-border);
            border-radius: 24px;
            padding: 32px;
            width: 90%;
            max-width: 400px;
            text-align: center;
            box-shadow: var(--shadow);
        `;

        modalContent.innerHTML = `
            <div style="margin-bottom: 24px;">
                <div class="spinner" style="width: 48px; height: 48px; border-width: 4px; margin: 0 auto 16px auto;"></div>
                <h3 style="color: var(--accent); margin: 0 0 8px 0; font-size: 20px;">${getMessage('clearingHistory') || 'Clearing History'}</h3>
                <p style="color: var(--text-secondary); margin: 0; font-size: 14px;" id="progress-status">
                    ${getMessage('preparingToClear') || 'Preparing to clear history...'}
                </p>
            </div>
            
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: var(--text-secondary); font-size: 13px;">
                    <span>${getMessage('progress') || 'Progress'}</span>
                    <span id="progress-percentage">0%</span>
                </div>
                <div style="width: 100%; height: 8px; background: var(--card-bg); border-radius: 4px; overflow: hidden;">
                    <div id="progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--accent), #a0f1ff); transition: width 0.2s ease;"></div>
                </div>
            </div>
            
            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 16px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: var(--text-secondary);">${getMessage('domainsProcessed') || 'Domains processed'}:</span>
                    <span style="color: var(--text-primary); font-weight: 600;">
                        <span id="processed-domains">0</span>/${totalDomains}
                    </span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">${getMessage('entriesDeleted') || 'Entries deleted'}:</span>
                    <span style="color: var(--text-primary); font-weight: 600;" id="deleted-entries">0</span>
                </div>
            </div>
            
            <button id="cancel-clear-history" class="btn-secondary">${getMessage('cancel') || 'Cancel'}</button>
        `;

        progressModal.appendChild(modalContent);
        document.body.appendChild(progressModal);

        
        document.getElementById('cancel-clear-history').addEventListener('click', () => {
            isCancelled = true;
            document.getElementById('progress-status').textContent = getMessage('cancelling') || 'Cancelling...';
            document.getElementById('cancel-clear-history').disabled = true;
        });

        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes modalFadeIn {
                from { opacity: 0; backdrop-filter: blur(0px); }
                to { opacity: 1; backdrop-filter: blur(16px); }
            }
            #cancel-clear-history:hover {
                background: var(--danger);
                border-color: var(--danger);
                color: white;
            }
        `;
        document.head.appendChild(style);
    }

    
    function updateProgress(current, total, processedDomains, deletedEntries) {
        if (!progressModal) return;
        if (isCancelled) return;

        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        
        const progressBar = document.getElementById('progress-bar');
        const percentageEl = document.getElementById('progress-percentage');
        const processedEl = document.getElementById('processed-domains');
        const deletedEl = document.getElementById('deleted-entries');
        const statusEl = document.getElementById('progress-status');

        if (progressBar) progressBar.style.width = `${percentage}%`;
        if (percentageEl) percentageEl.textContent = `${percentage}%`;
        if (processedEl) processedEl.textContent = processedDomains;
        if (deletedEl) deletedEl.textContent = deletedEntries;
        
        if (statusEl) {
            if (current === 0) {
                statusEl.textContent = getMessage('startingCleanup') || 'Starting cleanup...';
            } else if (current < total) {
                statusEl.textContent = getMessage('processing') || 'Processing...';
            } else {
                statusEl.textContent = getMessage('finalizingCleanup') || 'Finalizing cleanup...';
            }
        }
    }

    
    function closeProgressModal() {
        if (progressModal && progressModal.parentNode) {
            progressModal.parentNode.removeChild(progressModal);
        }
        progressModal = null;
    }

    
    async function clearBookmarksHistoryByDomain(buttonElement, dataFolders, callbacks = {}) {
        
        if (!confirm(getMessage('clearHistoryConfirm'))) {
            return;
        }
        
        const btn = buttonElement;
        if (!btn) return;

        
        const originalContent = btn.innerHTML;
        const originalDisabled = btn.disabled;

        
        btn.disabled = true;
        btn.innerHTML = `
            <span class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></span>
            
        `;
        btn.classList.add('loading');

        try {
            
            if (!dataFolders || dataFolders.length === 0) {
                showNotification(getMessage('noBookmarks') || 'No bookmarks found', true);
                return;
            }

            const allUrls = collectAllBookmarkUrls(dataFolders);
            
            if (allUrls.length === 0) {
                showNotification(getMessage('noBookmarks') || 'No bookmarks found', true);
                return;
            }

            
            const domains = new Set();
            allUrls.forEach(urlStr => {
                try {
                    const url = new URL(urlStr);
                    domains.add(url.hostname);
                } catch (e) {}
            });

            if (domains.size === 0) {
                showNotification(getMessage('noDomains') || 'No valid domains found in bookmarks', true);
                return;
            }

            const domainsArray = Array.from(domains);
            let totalDeleted = 0;
            let processedDomains = 0;

            
            showProgressModal(domainsArray.length);
            updateProgress(0, domainsArray.length, processedDomains, totalDeleted);

            
            if (callbacks.onStart) {
                callbacks.onStart(domainsArray.length);
            }

            for (let i = 0; i < domainsArray.length; i++) {
                
                if (isCancelled) {
                    showNotification(getMessage('clearCancelled') || 'Operation cancelled', false);
                    break;
                }

                const domain = domainsArray[i];
                
                
                updateProgress(i, domainsArray.length, processedDomains, totalDeleted);
                
                if (callbacks.onProgress) {
                    callbacks.onProgress(i, domainsArray.length, domain, totalDeleted);
                }

                try {
                    const results = await chrome.history.search({
                        text: domain,
                        startTime: 0,
                        maxResults: 100000
                    });

                    let domainDeleted = 0;
                    
                    for (const entry of results) {
                        try {
                            const entryUrl = new URL(entry.url);
                            if (entryUrl.hostname === domain || entryUrl.hostname.endsWith('.' + domain)) {
                                await chrome.history.deleteUrl({ url: entry.url });
                                totalDeleted++;
                                domainDeleted++;
                            }
                        } catch (e) {}
                    }

                    processedDomains++;

                    
                    updateProgress(i + 1, domainsArray.length, processedDomains, totalDeleted);

                    if (callbacks.onDomainComplete) {
                        callbacks.onDomainComplete(domain, domainDeleted, totalDeleted);
                    }

                    
                    await new Promise(resolve => setTimeout(resolve, 10));

                } catch (e) {
                    processedDomains++;
                }
            }

            
            if (!isCancelled) {
                updateProgress(domainsArray.length, domainsArray.length, processedDomains, totalDeleted);
                
                if (callbacks.onComplete) {
                    callbacks.onComplete(totalDeleted, domainsArray.length);
                }

                
                setTimeout(() => {
                    closeProgressModal();
                    
                    const successMessage = getMessage('historyCleared', [totalDeleted, domainsArray.length]) || 
                        `✅ Cleared ${totalDeleted} history entries from ${domainsArray.length} domains`;
                    showNotification(successMessage);
                }, 500);
            } else {
                closeProgressModal();
            }

        } catch (error) {
            closeProgressModal();
            showNotification(getMessage('clearHistoryError') || '❌ An error occurred while clearing history', true);

        } finally {
            
            btn.disabled = originalDisabled;
            btn.innerHTML = originalContent;
            btn.classList.remove('loading');
        }
    }

    
    return {
        clearBookmarksHistoryByDomain
    };

})();


if (typeof window !== 'undefined') {
    window.HistoryCleaner = HistoryCleaner;
}

if (typeof module !== 'undefined') {
    module.exports = HistoryCleaner;
}
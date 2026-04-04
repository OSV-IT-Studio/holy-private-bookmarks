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
    

    const getMessage = window.HolyI18n.getMessage;

    const showNotification = (message, isError = false) => window.HolyShared.showNotification(message, isError);
    const showConfirm = (opts) => window.HolyShared.showConfirm(opts);
    const collectAllBookmarkUrls = window.HolyShared.collectAllBookmarkUrls;

    
    function showProgressModal(totalDomains) {
        if (progressModal) {
            closeProgressModal();
        }

        isCancelled = false;

        progressModal = document.createElement('div');
        progressModal.id = 'history-cleaner-progress';
        progressModal.className = 'hpb-modal hpb-modal--open';
        progressModal.style.zIndex = '10000';
        progressModal.innerHTML = `
            <div class="hpb-modal__dialog hpb-modal__dialog--sm" style="text-align:center;">
                <div class="spinner" style="width: 48px; height: 48px; border-width: 4px; margin: 0 auto 16px auto;"></div>
                <h2 class="hpb-modal__title hpb-modal__title--center progress-title">
                    ${getMessage('clearingHistory')}
                </h2>
                <div class="hpb-modal__body">
                    <p class="progress-status hpb-modal__desc" id="progress-status">
                        ${getMessage('preparingToClear')}
                    </p>
                    <div class="progress-bar-wrap">
                        <div class="progress-bar-header">
                            <span>${getMessage('progress')}</span>
                            <span id="progress-percentage">0%</span>
                        </div>
                        <div class="progress-track">
                            <div id="progress-bar" class="progress-fill"></div>
                        </div>
                    </div>
                    <div class="progress-stats">
                        <div class="progress-stat-row">
                            <span class="progress-stat-label">${getMessage('domainsProcessed')}:</span>
                            <span class="progress-stat-value"><span id="processed-domains">0</span>/${totalDomains}</span>
                        </div>
                        <div class="progress-stat-row">
                            <span class="progress-stat-label">${getMessage('entriesDeleted')}:</span>
                            <span class="progress-stat-value" id="deleted-entries">0</span>
                        </div>
                    </div>
                </div>
                <div class="hpb-modal__footer">
                    <button id="cancel-clear-history" class="btn-secondary w-100">${getMessage('cancel')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(progressModal);

        
        document.getElementById('cancel-clear-history').addEventListener('click', () => {
            isCancelled = true;
            document.getElementById('progress-status').textContent = getMessage('cancelling');
            document.getElementById('cancel-clear-history').disabled = true;
        });


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
                statusEl.textContent = getMessage('startingCleanup');
            } else if (current < total) {
                statusEl.textContent = getMessage('processing');
            } else {
                statusEl.textContent = getMessage('finalizingCleanup');
            }
        }
    }

    
    function closeProgressModal() {
        if (!progressModal) return;
        const el = progressModal;
        progressModal = null;
        if (window.HolyShared && window.HolyShared.closeModalWithAnimation) {
            window.HolyShared.closeModalWithAnimation(el);
        } else if (window.HolyShared && window.HolyShared.closeModal) {
            window.HolyShared.closeModal(el);
        } else if (el.parentNode) {
            el.parentNode.removeChild(el);
        }
    }

    
    async function clearBookmarksHistoryByDomain(buttonElement, dataFolders, callbacks = {}) {
        
        if (!await showConfirm({ title: getMessage('clearHistoryConfirm') })) {
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
                showNotification(getMessage('noBookmarks'), true);
                return;
            }

            const allUrls = collectAllBookmarkUrls(dataFolders);
            
            if (allUrls.length === 0) {
                showNotification(getMessage('noBookmarks'), true);
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
                showNotification(getMessage('noDomains'), true);
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
                    showNotification(getMessage('clearCancelled'), false);
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
                    
                    const successMessage = getMessage('historyCleared', [totalDeleted, domainsArray.length]);
                    showNotification(successMessage);
                }, 500);
            } else {
                closeProgressModal();
            }

        } catch (error) {
            closeProgressModal();
            showNotification(getMessage('clearHistoryError'), true);

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
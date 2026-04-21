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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeAndHideLoader);
} else {
    initThemeAndHideLoader();
}

async function initThemeAndHideLoader() {
    if (window.ThemeManager) {
        await window.ThemeManager.init();
    }
}


if (!document.querySelector('#theme-loader-animation')) {
    const style = document.createElement('style');
    style.id = 'theme-loader-animation';
    style.textContent = `
        @keyframes theme-loader-spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}


const getMessage = window.HolyI18n.getMessage;


function localizeDonatePage() {
    window.HolyI18n.localizePage();
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
        showNotification(getMessage('copiedToClipboard'));
    }).catch(function(err) {
        console.error('Failed to copy: ', err);
        showNotification(getMessage('copyFailed'), true);
    });
}


function showNotification(message, isError = false) {
    document.querySelectorAll('.notification').forEach(n => n.remove());
    const el = document.createElement('div');
    el.className = 'notification';
    el.textContent = message;
    if (isError) el.style.background = 'rgba(255, 64, 96, 0.9)';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

function setupEventListeners() {
    document.querySelectorAll('.copy-btn[data-action="copy"]').forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const donateCard = this.closest('.donate-card');
            if (donateCard && donateCard.dataset.address) {
                copyToClipboard(donateCard.dataset.address);
            } else {
                const addressElement = donateCard.querySelector('.address');
                if (addressElement) {
                    copyToClipboard(addressElement.textContent);
                }
            }
        });
    });
    
    document.querySelectorAll('.address').forEach(addressElement => {
        addressElement.style.cursor = 'pointer';
        addressElement.title = getMessage('clickToCopy');
        
        addressElement.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            copyToClipboard(this.textContent);
        });
    });
}

function setupQrCodeAltTexts() {
    document.querySelectorAll('.qr').forEach(qr => {
        const parent = qr.closest('.donate-card');
        if (parent) {
            const titleElement = parent.querySelector('h3');
            if (titleElement) {
                qr.alt = getMessage('qrCodeFor', [titleElement.textContent]);
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    localizeDonatePage();
    setupQrCodeAltTexts();
    setupEventListeners();
});

window.copyToClipboard = copyToClipboard;
window.localizeDonatePage = localizeDonatePage;
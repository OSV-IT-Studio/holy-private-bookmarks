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


const HolyI18n = (function () {

    
    const MAX_CACHE_SIZE = 200;
    const messageCache = new Map();

    function getMessage(key, substitutions = []) {
        if (messageCache.has(key)) {
            return messageCache.get(key);
        }

        try {
            const message = chrome.i18n.getMessage(key, substitutions);
            if (message) {
                if (messageCache.size >= MAX_CACHE_SIZE) {
                    messageCache.delete(messageCache.keys().next().value);
                }
                messageCache.set(key, message);
                return message;
            }
        } catch (e) {
            
        }

        return key;
    }

    
    function localizePage() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key  = el.getAttribute('data-i18n');
            const text = getMessage(key);
            if (!text) return;

            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = text;
            } else if (el.tagName === 'TITLE') {
                document.title = text;
            } else if (el.hasAttribute('data-i18n-html')) {
                el.innerHTML = text;
            } else {
                el.textContent = text;
            }
        });

        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const text = getMessage(el.getAttribute('data-i18n-title'));
            if (text) el.title = text;
        });
    }

    const api = { getMessage, messageCache, localizePage };

    if (typeof window !== 'undefined') {
        window.HolyI18n = api;
    }

    if (typeof module !== 'undefined') {
        module.exports = api;
    }

    return api;
})();

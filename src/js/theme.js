/*
 * Holy Private Bookmarks — Encrypted Local Bookmark Manager
 * Copyright (C) 2026 OSV-IT-Studio
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

const ThemeManager = (function() {
    const STORAGE_KEY = 'holyThemePreference';
    

    const THEMES = {
        DARK: 'dark',
        LIGHT: 'light',
        SYSTEM: 'system'
    };
    
 
    let currentTheme = THEMES.DARK;
    

    const messageCache = new Map();
    

    function getMessage(key, substitutions = []) {
        if (messageCache.has(key)) {
            return messageCache.get(key);
        }
        
        try {
            const message = chrome.i18n.getMessage(key, substitutions);
            if (message) {
                messageCache.set(key, message);
                return message;
            }
        } catch (e) {
            console.warn('Error getting message for key:', key, e);
        }
        

        return key;
    }
    

    async function init() {

        const stored = await chrome.storage.local.get(STORAGE_KEY);
        if (stored[STORAGE_KEY]) {
            currentTheme = stored[STORAGE_KEY];
        }
        

        applyTheme(currentTheme);
        

        setupSystemThemeListener();
        
        return currentTheme;
    }
    
    /**
     * Apply theme
     */
    function applyTheme(theme) {
        let themeToApply = theme;
        
        if (theme === THEMES.SYSTEM) {
            themeToApply = getSystemTheme();
        }
        

        document.body.classList.remove('light-theme', 'dark-theme');
        
 
        if (themeToApply === THEMES.LIGHT) {
            document.body.classList.add('light-theme');
        } else {

            document.body.classList.remove('light-theme');
        }
        
        currentTheme = theme;
        

        updateThemeButtons(theme);
    }
    

    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? THEMES.DARK : THEMES.LIGHT;
    }
    

    function setupSystemThemeListener() {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (currentTheme === THEMES.SYSTEM) {
                applyTheme(THEMES.SYSTEM);
            }
        });
    }
    

    async function setTheme(theme) {
        if (!Object.values(THEMES).includes(theme)) {
            console.error('Invalid theme:', theme);
            return;
        }
        
        currentTheme = theme;
        

        await chrome.storage.local.set({ [STORAGE_KEY]: theme });
        

        applyTheme(theme);
        

        chrome.runtime.sendMessage({ 
            action: 'themeChanged', 
            theme: theme 
        }).catch(() => {

        });
        
        return theme;
    }
    

    function updateThemeButtons(activeTheme) {
        document.querySelectorAll('.theme-option').forEach(btn => {
            const themeValue = btn.dataset.theme;
            if (themeValue === activeTheme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    

    function createThemeSelector(container) {
        if (!container) return;
        

        messageCache.clear();
        
        const selector = document.createElement('div');
        selector.className = 'theme-selector';
        

        const darkName = getMessage('themeDark') || 'Dark';
        const darkDesc = getMessage('themeDarkDesc') || 'For night use';
        const lightName = getMessage('themeLight') || 'Light';
        const lightDesc = getMessage('themeLightDesc') || 'For daytime use';
        const systemName = getMessage('themeSystem') || 'System';
        const systemDesc = getMessage('themeSystemDesc') || 'Follows system preference';
        
        selector.innerHTML = `
            <div class="theme-option ${currentTheme === THEMES.DARK ? 'active' : ''}" data-theme="${THEMES.DARK}">
                <span class="theme-icon">🌙</span>
                <div class="theme-name">${darkName}</div>
            </div>
            <div class="theme-option ${currentTheme === THEMES.LIGHT ? 'active' : ''}" data-theme="${THEMES.LIGHT}">
                <span class="theme-icon">☀️</span>
                <div class="theme-name">${lightName}</div>
            </div>
            <div class="theme-option ${currentTheme === THEMES.SYSTEM ? 'active' : ''}" data-theme="${THEMES.SYSTEM}">
                <span class="theme-icon">💻</span>
                <div class="theme-name">${systemName}</div>
            </div>
        `;
        
        selector.querySelectorAll('.theme-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                setTheme(theme);
            });
        });
        
        container.appendChild(selector);
        return selector;
    }
    

    function getCurrentTheme() {
        return currentTheme;
    }
    

    function getAvailableThemes() {
        return { ...THEMES };
    }
    

    function refreshAllSelectors() {

        messageCache.clear();
        

        document.querySelectorAll('#theme-selector-container').forEach(container => {
            container.innerHTML = '';
            createThemeSelector(container);
        });
    }
    

    return {
        init,
        setTheme,
        getCurrentTheme,
        getAvailableThemes,
        createThemeSelector,
        refreshAllSelectors,
        THEMES
    };
})();


if (typeof window !== 'undefined') {
    window.ThemeManager = ThemeManager;
}

if (typeof module !== 'undefined') {
    module.exports = ThemeManager;
}
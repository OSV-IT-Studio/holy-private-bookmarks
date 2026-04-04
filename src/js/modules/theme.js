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

const ThemeManager = (function() {
    const STORAGE_KEY = 'holyThemePreference';
    

    const THEMES = {
        DARK: 'dark',
        LIGHT: 'light',
        SYSTEM: 'system'
    };
    
 
    let currentTheme = THEMES.DARK;
    


    const { getMessage, messageCache } = window.HolyI18n;
    

    async function init() {

        const stored = await chrome.storage.local.get(STORAGE_KEY);
        if (stored[STORAGE_KEY]) {
            currentTheme = stored[STORAGE_KEY];
        }
        

        applyTheme(currentTheme);
        

        setupSystemThemeListener();
        
        return currentTheme;
    }
    

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
        

        const darkName = getMessage('themeDark');
        const darkDesc = getMessage('themeDarkDesc');
        const lightName = getMessage('themeLight');
        const lightDesc = getMessage('themeLightDesc');
        const systemName = getMessage('themeSystem');
        const systemDesc = getMessage('themeSystemDesc');
        
        selector.innerHTML = `
            <div class="theme-option ${currentTheme === THEMES.DARK ? 'active' : ''}" data-theme="${THEMES.DARK}">
    <span class="theme-option__icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
    </span>
    <span class="theme-option__name">${darkName}</span>
</div>

<div class="theme-option ${currentTheme === THEMES.LIGHT ? 'active' : ''}" data-theme="${THEMES.LIGHT}">
    <span class="theme-option__icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
    </span>
    <span class="theme-option__name">${lightName}</span>
</div>

<div class="theme-option ${currentTheme === THEMES.SYSTEM ? 'active' : ''}" data-theme="${THEMES.SYSTEM}">
    <span class="theme-option__icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
    </span>
    <span class="theme-option__name">${systemName}</span>
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
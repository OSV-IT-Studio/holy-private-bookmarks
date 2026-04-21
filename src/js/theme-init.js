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

(function () {
    var STORAGE_KEY = 'holyThemePreference';

    var stored = localStorage.getItem(STORAGE_KEY);

    var theme = stored || 'dark';

    if (theme === 'system') {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    var html = document.documentElement;

    html.classList.add('no-transition');

    if (theme === 'light') {
        html.classList.add('holy-light-theme');
    }

    document.addEventListener('DOMContentLoaded', function () {
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                html.classList.remove('no-transition');
            });
        });
    });
})();

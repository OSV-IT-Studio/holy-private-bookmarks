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
 
 (function initSidebarResize() {
  const resizer = document.getElementById('sidebar-resizer');
  const sidebar = document.querySelector('.sidebar');
  if (!resizer || !sidebar) return;

  const MIN_WIDTH    = 320;
  const MAX_WIDTH    = 480;
  const STORAGE_KEY  = 'sidebarWidth';

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) sidebar.style.width = saved + 'px';

  let startX, startWidth;

  resizer.addEventListener('mousedown', e => {
    startX     = e.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    resizer.classList.add('is-dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor     = 'col-resize';

    function onMouseMove(e) {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (e.clientX - startX)));
      sidebar.style.width = newWidth + 'px';
    }

    function onMouseUp() {
      resizer.classList.remove('is-dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor     = '';
      localStorage.setItem(STORAGE_KEY, parseInt(sidebar.style.width));
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  });
})();
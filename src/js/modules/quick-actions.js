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

const QuickActions = (() => {

    //  SVG icons 

    const ICONS = {
        edit: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                 <path d="M11.5 2.5a2 2 0 0 1 3 3L6 14l-4 1 1-4 8.5-8.5z"/>
               </svg>`,

        copy: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                 <rect x="2" y="4" width="10" height="10" rx="1" ry="1"/>
                 <path d="M4 2h8a2 2 0 0 1 2 2v8"/>
               </svg>`,

        private: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.5" fill="none"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
                    <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>`,

        delete: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <polyline points="3 6 5 6 21 6"/>
                   <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                   <line x1="10" y1="11" x2="10" y2="17"/>
                   <line x1="14" y1="11" x2="14" y2="17"/>
                 </svg>`,

        rename: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
                   <path d="M11.5 2.5a2 2 0 0 1 3 3L6 14l-4 1 1-4 8.5-8.5z"/>
                 </svg>`,

        openAll: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>`,

        openWindow: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                       <rect x="3" y="3" width="18" height="18" rx="2"/>
                       <line x1="3" y1="9" x2="21" y2="9"/>
                       <line x1="9" y1="9" x2="9" y2="21"/>
                     </svg>`,

        openGroup: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                      <rect x="2" y="6" width="20" height="14" rx="2"/>
                      <path d="M2 10h20"/>
                      <circle cx="6" cy="8" r="1" fill="currentColor" stroke="none"/>
                      <circle cx="10" cy="8" r="1" fill="currentColor" stroke="none"/>
                    </svg>`,

        openIncognito: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                          <line x1="3" y1="3" x2="21" y2="21" stroke-linecap="round"/>
                        </svg>`,

        qr: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
               <rect x="3" y="3" width="8" height="8" rx="1"/>
               <rect x="13" y="3" width="8" height="8" rx="1"/>
               <rect x="3" y="13" width="8" height="8" rx="1"/>
               <rect x="5" y="5" width="4" height="4" fill="currentColor" stroke="none"/>
               <rect x="15" y="5" width="4" height="4" fill="currentColor" stroke="none"/>
               <rect x="5" y="15" width="4" height="4" fill="currentColor" stroke="none"/>
               <line x1="13" y1="13" x2="13" y2="13" stroke-width="3" stroke-linecap="round"/>
               <line x1="17" y1="13" x2="17" y2="13" stroke-width="3" stroke-linecap="round"/>
               <line x1="21" y1="13" x2="21" y2="13" stroke-width="3" stroke-linecap="round"/>
               <line x1="13" y1="17" x2="13" y2="17" stroke-width="3" stroke-linecap="round"/>
               <line x1="17" y1="17" x2="21" y2="17" stroke-width="3" stroke-linecap="round"/>
               <line x1="21" y1="21" x2="21" y2="21" stroke-width="3" stroke-linecap="round"/>
               <line x1="13" y1="21" x2="17" y2="21" stroke-width="3" stroke-linecap="round"/>
             </svg>`,
    };

    //  Core helpers 

    function closeAll() {
        document.querySelectorAll('.quick-actions-hover').forEach(p => p.remove());
    }

    function buildPanel(buttons) {
        const panel = document.createElement('div');
        panel.className = 'quick-actions-hover';
        panel.innerHTML = buttons.map(b => {
            const extraAttrs = b.dataset
                ? Object.entries(b.dataset).map(([k, v]) => ` data-${k}="${v}"`).join('')
                : '';
            return `<button class="quick-action-btn-small${b.className ? ' ' + b.className : ''}"
                            data-action="${b.action}"
                            title="${b.title}"${extraAttrs}>
                        <span class="qa-icon">${ICONS[b.icon] || ''}</span>
                        <span class="qa-label">${b.title}</span>
                    </button>`;
        }).join('');
        return panel;
    }

    function toggle(trigger, buildPanelFn) {
        const alreadyOpen = !!document.querySelector('.quick-actions-hover[data-portal]');
        closeAll();
        if (!alreadyOpen) {
            const panel = buildPanelFn();
            panel.setAttribute('data-portal', '1');
            panel._trigger = trigger;


            const delegateContainer =
                trigger.closest('#tree') ||
                trigger.closest('.bookmarks-container') ||
                trigger.closest('#bookmarks-grid') ||
                document.getElementById('tree');

            panel._delegateContainer = delegateContainer;

            document.body.appendChild(panel);

            const tr = trigger.getBoundingClientRect();
            const pw = panel.offsetWidth  || 160;
            const ph = panel.offsetHeight || 120;
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            let left = tr.left - pw - 6;
            if (left < 4) left = tr.right + 6;
            if (left + pw > vw - 4) left = vw - pw - 4;
            let top = tr.top;
            if (top + ph > vh - 4) top = tr.bottom - ph;
            if (top < 4) top = 4;

            panel.style.position  = 'fixed';
            panel.style.left      = left + 'px';
            panel.style.top       = top  + 'px';
            panel.style.right     = 'auto';
            panel.style.transform = 'none';

            const onScroll = () => closeAll();
            window.addEventListener('scroll', onScroll, { passive: true, once: true });
            document.querySelector('#tree')?.addEventListener('scroll', onScroll, { passive: true, once: true });
        }
    }

    function _attachPortalClickDelegate() {
        document.addEventListener('click', e => {
            const btn = e.target.closest('.quick-action-btn-small[data-action]');
            if (!btn) return;
            const panel = btn.closest('.quick-actions-hover[data-portal]');
            if (!panel) return;

            const container = panel._delegateContainer;
            if (!container) return;

            const clone = new MouseEvent('click', {
                bubbles:    true,
                cancelable: true,
                clientX:    e.clientX,
                clientY:    e.clientY,
            });

            const ghost = btn.cloneNode(true);
            ghost.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0';
            ghost._sourcePanel  = panel; 
            container.appendChild(ghost);
            ghost.dispatchEvent(clone);
            ghost.remove();

            closeAll();
        }, true); 
    }

    _attachPortalClickDelegate();


    let _globalListenerAttached = false;

    function attachGlobalCloseListener() {
        if (_globalListenerAttached) return;
        document.addEventListener('click', e => {
            if (e.target.closest('.quick-actions-trigger') || e.target.closest('.quick-actions-hover')) return;
            closeAll();
        }, { passive: true });
        _globalListenerAttached = true;
    }

    //  Public API 

    return { ICONS, buildPanel, closeAll, toggle, attachGlobalCloseListener };

})();

if (typeof window !== 'undefined') window.QuickActions = QuickActions;
if (typeof module !== 'undefined') module.exports = QuickActions;

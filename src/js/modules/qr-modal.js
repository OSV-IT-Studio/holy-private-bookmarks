/*
 * Holy Private Bookmarks — Encrypted Local Bookmark Manager
 * Copyright (C) 2026 OSV IT-Studio
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const QrModal = (() => {

    let _qrcodeReady = false;
    let _qrcodeLoading = false;
    let _pendingQueue = [];

    function _loadQrcode(callback) {
        if (_qrcodeReady) { callback(); return; }

        _pendingQueue.push(callback);
        if (_qrcodeLoading) return;

        _qrcodeLoading = true;
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('js/modules/qrcode.js');
        script.onload = () => {
            _qrcodeReady  = true;
            _qrcodeLoading = false;
            _pendingQueue.forEach(fn => fn());
            _pendingQueue = [];
        };
        script.onerror = () => {
            _qrcodeLoading = false;
            _pendingQueue = [];
        };
        document.body.appendChild(script);
    }

    function _esc(str) {
        if (!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function showQrModal(url, title, getMessage) {
        _loadQrcode(() => _show(url, title, getMessage));
    }

    function _show(url, title, getMessage) {
        const existing = document.getElementById('hpb-qr-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'hpb-qr-modal';
        overlay.className = 'hpb-modal hpb-modal--open';
        overlay.style.zIndex = '99999';
        overlay._hpbOpenedAt = Date.now();

        const label      = getMessage ? getMessage('qrCode')  : '';
        const closeLabel = getMessage ? getMessage('close')   : '';

        overlay.innerHTML = `
            <div class="hpb-modal__dialog hpb-modal__dialog--xs" role="dialog" aria-modal="true" aria-labelledby="hpb-qr-title" style="text-align:center">
                <h2 class="hpb-modal__title hpb-modal__title--center" id="hpb-qr-title">${label}</h2>

                <div id="hpb-qr-canvas-wrap" style="display:flex;justify-content:center;margin:0 0 16px"></div>
                <div style="display:flex;align-items:center;gap:10px;background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.18);border-radius:12px;padding:10px 14px;margin:0 0 0px;text-align:left">
                    <span style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:rgba(0,212,255,.12);box-shadow:0 0 0 1px rgba(0,212,255,.2);display:flex;align-items:center;justify-content:center;color:var(--accent)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                    </span>
                    <span style="font-size:12px;line-height:1.5;color:var(--text-secondary)">${getMessage ? getMessage('qrScanHint') : ''}</span>
                </div>
                <div class="hpb-modal__footer" style="justify-content:center">
                    <button class="btn-secondary" id="hpb-qr-close">${closeLabel}</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            const wrap = document.getElementById('hpb-qr-canvas-wrap');
            if (!wrap) return;

            try {
                const qr = window.qrcode(0, 'M');
                qr.addData(url);
                qr.make();

                const moduleCount = qr.getModuleCount();
                const cellSize = Math.max(3, Math.floor(220 / moduleCount));
                const size = moduleCount * cellSize;

                const canvas = document.createElement('canvas');
                canvas.width  = size;
                canvas.height = size;
                canvas.style.cssText = `width:${size}px;height:${size}px;border-radius:8px; padding: 20px; background: white;`;

                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = '#000000';

                for (let row = 0; row < moduleCount; row++) {
                    for (let col = 0; col < moduleCount; col++) {
                        if (qr.isDark(row, col)) {
                            ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
                        }
                    }
                }

                wrap.appendChild(canvas);
            } catch (err) {
                wrap.textContent = 'QR generation error';
            }
        });

        function close() {
            overlay.classList.replace('hpb-modal--open', 'hpb-modal--closing');
            overlay.addEventListener('animationend', function h(e) {
                if (e.target !== overlay) return;
                overlay.removeEventListener('animationend', h);
                overlay.remove();
            });
            document.removeEventListener('keydown', onEsc);
        }

        function onEsc(e) { if (e.key === 'Escape') close(); }

        document.getElementById('hpb-qr-close').addEventListener('click', close);
        overlay.addEventListener('click', e => {
            if (e.target === overlay && Date.now() - (overlay._hpbOpenedAt || 0) > 50) close();
        });
        document.addEventListener('keydown', onEsc);
    }

    return { showQrModal };
})();

if (typeof window !== 'undefined') window.QrModal = QrModal;
if (typeof module !== 'undefined') module.exports = QrModal;
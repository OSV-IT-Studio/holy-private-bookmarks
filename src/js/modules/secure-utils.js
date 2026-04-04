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


const HolySecureUtils = (function () {


    function secureWipeArray(array, secure = true) {
        if (!array || !(array instanceof Uint8Array)) return;

        try {
            if (secure) {
                for (let pass = 0; pass < 3; pass++) {
                    for (let i = 0; i < array.length; i++) {
                        switch (pass) {
                            case 0: array[i] = 0x00; break;
                            case 1: array[i] = 0xFF; break;
                            case 2: array[i] = Math.floor(Math.random() * 256); break;
                        }
                    }
                }
            }

            
            for (let i = 0; i < array.length; i++) {
                array[i] = 0;
            }
        } catch (e) {
            
        }

        
        if (typeof window !== 'undefined' && window.gc) {
            try { window.gc(); } catch (e) {}
        }
    }

    
    function secureWipeString(str) {
        if (!str || typeof str !== 'string') return;

        try {
            const buffer = new TextEncoder().encode(str);
            secureWipeArray(buffer);
        } catch (e) {}
    }

    const api = { secureWipeArray, secureWipeString };

    if (typeof window !== 'undefined') {
        window.HolySecureUtils = api;
    }

    if (typeof module !== 'undefined') {
        module.exports = api;
    }

    return api;
})();

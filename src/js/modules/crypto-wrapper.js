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

const SecureCrypto = (function() {
    let _masterKey = null;
    let _currentSalt = null;
    
   
    const ALGORITHMS = {
        KEY_DERIVATION: 'PBKDF2-SHA256',
        HASH_DERIVATION: 'PBKDF2-SHA256',
        ENCRYPTION: 'AES-GCM'
    };
    
    const ITERATIONS = {
        KEY: 600000, 
        HASH: 1000000 
    };
    
    const SALT_SIZES = {
        ENCRYPTION: 32, 
        HASH: 16   
    };
    

    function secureWipeArray(array, secure = true) {
        if (!array || !(array instanceof Uint8Array)) return;
        
        try {
            if (secure) {
               
                for (let pass = 0; pass < 3; pass++) {
                    for (let i = 0; i < array.length; i++) {
                        switch(pass) {
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
            console.warn('Error during secure wipe:', e);
        }
    }
    

    function secureWipeString(str) {
        if (!str || typeof str !== 'string') return;
        
        try {
            const encoder = new TextEncoder();
            const buffer = encoder.encode(str);
            secureWipeArray(buffer);
            
            if (window.gc) {
                try { window.gc(); } catch (e) {}
            }
        } catch (e) {}
    }
    
 
    function constantTimeEqual(a, b) {
        if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) {
            return false;
        }
        
        if (a.length !== b.length) {
            
            let result = 0;
            for (let i = 0; i < a.length; i++) {
                result |= a[i] ^ 0;
            }
            return false;
        }
        
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i];
        }
        return result === 0;
    }
    
    
    function secureWipe() {
        if (_masterKey) {
            try {
                _masterKey = null;
            } catch (e) {
                _masterKey = null;
            }
        }
        
        if (_currentSalt) {
            secureWipeArray(_currentSalt);
            _currentSalt = null;
        }
        
        if (window.gc) {
            try { window.gc(); } catch (e) {}
        }
    }
    
    
    async function deriveEncryptionKey(password, salt) {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        
        try {
            const keyMaterial = await crypto.subtle.importKey(
                'raw', 
                passwordBuffer, 
                { name: 'PBKDF2' }, 
                false, 
                ['deriveKey']
            );
            
            const key = await crypto.subtle.deriveKey(
                { 
                    name: 'PBKDF2', 
                    salt: salt, 
                    iterations: ITERATIONS.KEY, 
                    hash: 'SHA-256' 
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            
            return key;
        } finally {
            secureWipeArray(passwordBuffer);
        }
    }
    
    
    async function createPasswordHash(password, salt) {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        
        try {
            const keyMaterial = await crypto.subtle.importKey(
                'raw', 
                passwordBuffer, 
                { name: 'PBKDF2' }, 
                false, 
                ['deriveBits']
            );
            
            const hashBits = await crypto.subtle.deriveBits(
                { 
                    name: 'PBKDF2', 
                    salt: salt, 
                    iterations: ITERATIONS.HASH, 
                    hash: 'SHA-256' 
                },
                keyMaterial,
                256 
            );
            
            return new Uint8Array(hashBits);
        } finally {
            secureWipeArray(passwordBuffer);
        }
    }
    

    async function _verifyPasswordLegacy(password, salt, encryptedObj) {
        let tempKey = null;
        let tempSalt = null;
        
        try {
            
            const encoder = new TextEncoder();
            const passwordBuffer = encoder.encode(password);
            
            const keyMaterial = await crypto.subtle.importKey(
                'raw', 
                passwordBuffer, 
                { name: 'PBKDF2' }, 
                false, 
                ['deriveKey']
            );
            
            tempKey = await crypto.subtle.deriveKey(
                { 
                    name: 'PBKDF2', 
                    salt: salt, 
                    iterations: ITERATIONS.KEY, 
                    hash: 'SHA-256' 
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );
            
            tempSalt = salt;
            
            
            const iv = new Uint8Array(encryptedObj.iv);
            const data = new Uint8Array(encryptedObj.data);
            
            await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                tempKey,
                data
            );
            
            return true;
            
        } catch (e) {
            return false;
            
        } finally {
            
            if (tempKey) tempKey = null;
            if (tempSalt) {
                secureWipeArray(tempSalt);
            }
            
            if (window.gc) {
                try { window.gc(); } catch (e) {}
            }
        }
    }
    
    return {

        async setupNewPassword(password) {
            try {
               
                if (!password || typeof password !== 'string' || password.length < 6) {
                    throw new Error('Invalid password');
                }
                
               
                const encryptionSalt = crypto.getRandomValues(new Uint8Array(SALT_SIZES.ENCRYPTION));
                const hashSalt = crypto.getRandomValues(new Uint8Array(SALT_SIZES.HASH));
                
                
                _masterKey = await deriveEncryptionKey(password, encryptionSalt);
                _currentSalt = encryptionSalt;
                
                
                const passwordHash = await createPasswordHash(password, hashSalt);
                
               
                return {
                    encryptionSalt: Array.from(encryptionSalt),
                    hashSalt: Array.from(hashSalt),
                    passwordHash: Array.from(passwordHash),
                    version: 2,
                    keyIterations: ITERATIONS.KEY,
                    hashIterations: ITERATIONS.HASH,
                    keyAlgorithm: ALGORITHMS.KEY_DERIVATION,
                    hashAlgorithm: ALGORITHMS.HASH_DERIVATION
                };
                
            } catch (e) {
                this.clear();
                throw e;
            }
        },
        

        async verifyPassword(password, storedData) {
            try {
                
                if (!password || !storedData) return false;
                
                
                if (storedData.version === 2) {
                    const hashSalt = new Uint8Array(storedData.hashSalt);
                    const storedHash = new Uint8Array(storedData.passwordHash);
                    
                    const computedHash = await createPasswordHash(password, hashSalt);
                    const isValid = constantTimeEqual(computedHash, storedHash);
                    
                    secureWipeArray(computedHash);
                    return isValid;
                }
                
                
                return false;
                
            } catch (e) {
                return false;
            }
        },
        

        async verifyPasswordLegacy(password, salt, encryptedObj) {
            return _verifyPasswordLegacy(password, salt, encryptedObj);
        },
        

        async initAfterVerification(password, storedData) {
            try {
                this.clear();
                
                if (storedData.version !== 2) {
                    throw new Error('Unsupported data version');
                }
                
                const encryptionSalt = new Uint8Array(storedData.encryptionSalt);
                _masterKey = await deriveEncryptionKey(password, encryptionSalt);
                _currentSalt = encryptionSalt;
                
                return true;
                
            } catch (e) {
                this.clear();
                return false;
            }
        },
        

        async init(password, salt) {
            try {
                this.clear();
                
                if (!password || typeof password !== 'string') {
                    throw new Error('Invalid password');
                }
                
                if (!salt || !(salt instanceof Uint8Array) || salt.length < 16) {
                    throw new Error('Invalid salt');
                }
                
                const saltCopy = new Uint8Array(salt.length);
                saltCopy.set(salt);
                
                _masterKey = await deriveEncryptionKey(password, saltCopy);
                _currentSalt = saltCopy;
                
                return true;
                
            } catch (e) {
                this.clear();
                return false;
            }
        },
        

        async encrypt(text) {
            if (!_masterKey) throw new Error('No key initialized');
            if (!text || typeof text !== 'string') throw new Error('Invalid text');
            
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encoder = new TextEncoder();
            const encoded = encoder.encode(text);
            
            try {
                const encrypted = await crypto.subtle.encrypt(
                    { name: 'AES-GCM', iv }, 
                    _masterKey, 
                    encoded
                );
                
                return { 
                    iv: Array.from(iv), 
                    data: Array.from(new Uint8Array(encrypted)) 
                };
            } finally {
                secureWipeArray(encoded);
            }
        },
        

        async decrypt(encryptedObj) {
            if (!_masterKey) throw new Error('No key initialized');
            
            if (!encryptedObj || !encryptedObj.iv || !encryptedObj.data) {
                throw new Error('Invalid encrypted object');
            }
            
            const iv = new Uint8Array(encryptedObj.iv);
            const data = new Uint8Array(encryptedObj.data);
            
            try {
                const decrypted = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv }, 
                    _masterKey, 
                    data
                );
                
                const decoder = new TextDecoder();
                return decoder.decode(decrypted);
                
            } catch (e) {
                throw new Error('Decryption failed: ' + e.message);
            } finally {
                secureWipeArray(iv);
                secureWipeArray(data);
            }
        },
        

        startAutoLock(timeout = 600000) {
            setTimeout(() => {
                this.clear();
            }, timeout);
        },
        

        clear() {
            secureWipe();
        },
        

        isReady() {
            return _masterKey !== null;
        },
        

        _getSalt() {
            if (!_currentSalt) return null;
            
            const saltCopy = new Uint8Array(_currentSalt.length);
            saltCopy.set(_currentSalt);
            return saltCopy;
        },
        

        CONSTANTS: {
            ALGORITHMS,
            ITERATIONS,
            SALT_SIZES,
            MIN_PASSWORD_LENGTH: 6
        }
    };
})();

if (typeof window !== 'undefined') {
    window.SecureCrypto = SecureCrypto;
}

if (typeof module !== 'undefined') {
    module.exports = SecureCrypto;
}
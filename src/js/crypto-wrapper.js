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
const SecureCrypto = (function() {
  let _masterKey = null;
  let _currentSalt = null;
  

  function secureWipe() {

    if (_masterKey) {
      try {

        _masterKey = null;
      } catch (e) {
        _masterKey = null;
      }
    }
    

    if (_currentSalt) {
      try {

        for (let i = 0; i < _currentSalt.length; i++) {
          _currentSalt[i] = 0;
        }
      } catch (e) {}
      _currentSalt = null;
    }
    

    
  }
  
  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', 
      enc.encode(password), 
      'PBKDF2', 
      false, 
      ['deriveKey']
    );
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }
  
  return {
    async init(password, salt) {
      try {

        this.clear();
        
        _masterKey = await deriveKey(password, salt);
        _currentSalt = new Uint8Array(salt); 
        return true;
      } catch (e) {

        this.clear();
        return false;
      }
    },
    
    async encrypt(text) {
      if (!_masterKey) throw new Error('No key');
      
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(text);
      

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, 
        _masterKey, 
        encoded
      );
      

      for (let i = 0; i < encoded.length; i++) {
        encoded[i] = 0;
      }
      
      return { 
        iv: Array.from(iv), 
        data: Array.from(new Uint8Array(encrypted)) 
      };
    },
    
    async decrypt(encryptedObj) {
      if (!_masterKey) throw new Error('No key');
      
      if (!encryptedObj || !encryptedObj.iv || !encryptedObj.data) {
        throw new Error('Invalid encrypted object');
      }
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(encryptedObj.iv) }, 
        _masterKey, 
        new Uint8Array(encryptedObj.data)
      );
      
      const decoded = new TextDecoder().decode(decrypted);
      

      const decryptedArray = new Uint8Array(decrypted);
      for (let i = 0; i < decryptedArray.length; i++) {
        decryptedArray[i] = 0;
      }
      
      return decoded;
    },
    
    async verifyPassword(password, salt, encryptedObj) {
      try {
        const testKey = await deriveKey(password, salt);
        const result = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: new Uint8Array(encryptedObj.iv) },
          testKey,
          new Uint8Array(encryptedObj.data)
        );
        

        const resultArray = new Uint8Array(result);
        for (let i = 0; i < resultArray.length; i++) {
          resultArray[i] = 0;
        }
        
        return true;
      } catch (e) {
        return false;
      }
    },
    
    startAutoLock() {
      setTimeout(() => {
        this.clear();
      }, 10 * 60 * 1000);
    },
    
    clear() {
      secureWipe();
    },
    
    isReady() {
      return _masterKey !== null;
    }
  };
})();

if (typeof window !== 'undefined') {
  window.SecureCrypto = SecureCrypto;
}
if (typeof module !== 'undefined') {
  module.exports = SecureCrypto;
}
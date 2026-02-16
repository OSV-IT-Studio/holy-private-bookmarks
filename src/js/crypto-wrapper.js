const SecureCrypto = (function() {
  let _masterKey = null;
  let _currentSalt = null; 
  
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
        _masterKey = await deriveKey(password, salt);
        _currentSalt = salt; 
        return true;
      } catch (e) {
        console.error('Crypto init failed:', e);
        return false;
      }
    },
    
    async encrypt(text) {
      if (!_masterKey) throw new Error('No key');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, 
        _masterKey, 
        new TextEncoder().encode(text)
      );
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
      return new TextDecoder().decode(decrypted);
    },
    

    async verifyPassword(password, salt, encryptedObj) {
      try {
        const testKey = await deriveKey(password, salt);
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: new Uint8Array(encryptedObj.iv) },
          testKey,
          new Uint8Array(encryptedObj.data)
        );
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
      _masterKey = null;
      _currentSalt = null;
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
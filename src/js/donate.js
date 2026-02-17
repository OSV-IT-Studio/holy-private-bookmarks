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
function getMessage(key, substitutions = []) {
  return chrome.i18n.getMessage(key, substitutions);
}


function localizeDonatePage() {

  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const text = getMessage(key);
    if (text) {
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.placeholder = text;
      } else if (element.tagName === 'TITLE') {
        document.title = text;
      } else {
        element.textContent = text;
      }
    }
  });
}


function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(function() {
    showNotification(getMessage('copiedToClipboard') || 'Address copied!');
  }).catch(function(err) {
    console.error('Failed to copy: ', err);
    showNotification(getMessage('copyFailed') || 'Failed to copy address', true);
  });
}


function showNotification(message, isError = false) {

  const oldNotifications = document.querySelectorAll('.notification');
  oldNotifications.forEach(notification => notification.remove());
  

  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  

  if (isError) {
    notification.style.background = 'rgba(255, 64, 96, 0.9)';
  }
  
  document.body.appendChild(notification);
  

  setTimeout(function() {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 2000);
}


function setupEventListeners() {

  document.querySelectorAll('.copy-btn[data-action="copy"]').forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      const donateCard = this.closest('.donate-card');
      if (donateCard && donateCard.dataset.address) {
        copyToClipboard(donateCard.dataset.address);
      } else {

        const addressElement = donateCard.querySelector('.address');
        if (addressElement) {
          copyToClipboard(addressElement.textContent);
        }
      }
    });
  });
  

  document.querySelectorAll('.address').forEach(addressElement => {
    addressElement.style.cursor = 'pointer';
    addressElement.title = getMessage('clickToCopy') || 'Click to copy';
    
    addressElement.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      copyToClipboard(this.textContent);
    });
  });
}


function setupQrCodeAltTexts() {
  document.querySelectorAll('.qr').forEach(qr => {
    const parent = qr.closest('.donate-card');
    if (parent) {
      const titleElement = parent.querySelector('h3');
      if (titleElement) {
        qr.alt = getMessage('qrCodeFor', [titleElement.textContent]) || 'QR Code';
      }
    }
  });
}


document.addEventListener('DOMContentLoaded', function() {

  localizeDonatePage();
  

  setupQrCodeAltTexts();
  

  setupEventListeners();
});


window.copyToClipboard = copyToClipboard;
window.localizeDonatePage = localizeDonatePage;
window.getMessage = getMessage;
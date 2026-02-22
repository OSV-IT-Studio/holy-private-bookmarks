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
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "add-to-holy",
    title: chrome.i18n.getMessage("addToHoly") || "Add to Holy Private Bookmarks",
    contexts: ["page", "link", "frame"]
  });


  chrome.contextMenus.create({
    id: "add-current-tab",
    title: chrome.i18n.getMessage("addToHoly") || "Add to Holy Private Bookmarks",
    contexts: ["action"]  
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let url, title;

  if (info.menuItemId === "add-to-holy") {
    url = info.linkUrl || info.pageUrl || tab?.url;
    title = tab?.title || "No title";
  } else if (info.menuItemId === "add-current-tab") {
    url = tab?.url;
    title = tab?.title;
  }

  if (!url || !url.startsWith('http')) return;

  await chrome.storage.session.set({
    pendingBookmarkAdd: {
      url: url,
      title: title.slice(0, 200)
    }
  });

  if (chrome.action.openPopup) {
    chrome.action.openPopup();
  } else {

    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'reloadmanager') {

    chrome.tabs.query({ url: chrome.runtime.getURL('manager.html') }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.reload(tab.id);
      });
    });
  }
});


chrome.runtime.onInstalled.addListener((details) => {

  const uninstallURL = 'https://docs.google.com/forms/d/e/1FAIpQLSeC7QN0uyKRdEw5MXko2_RLE1y8oQxgkZShqNQOjnVr3FKpnA/viewform?usp=publish-editor';
  chrome.runtime.setUninstallURL(uninstallURL);
});
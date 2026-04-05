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

// Quick Close Tab (Alt+A on Windows/Linux, Command+Shift+A on Mac)
chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'quick-close-tab') return;

    
    const result = await chrome.storage.local.get('holyQuickCloseEnabled');
    if (!result.holyQuickCloseEnabled) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;

    let hostname;
    try {
        hostname = new URL(tab.url).hostname;
    } catch {
        
        await chrome.tabs.remove(tab.id);
        return;
    }

    // Delete all history entries for this domain
    if (hostname) {
        try {
            const entries = await chrome.history.search({
                text: hostname,
                startTime: 0,
                maxResults: 100000
            });
            for (const entry of entries) {
                try {
                    const entryHostname = new URL(entry.url).hostname;
                    if (entryHostname === hostname || entryHostname.endsWith('.' + hostname)) {
                        await chrome.history.deleteUrl({ url: entry.url });
                    }
                } catch {  }
            }
        } catch {  }
    }

    // Close the tab
    try {
        await chrome.tabs.remove(tab.id);
    } catch {  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "add-to-holy") {
        const url   = info.linkUrl || info.pageUrl || tab?.url;
        const title = tab?.title || "No title";
        if (!url || !url.startsWith('http')) return;
        await chrome.storage.session.set({
            pendingBookmarkAdd: { url, title: title.slice(0, 200) }
        });
        if (chrome.action.openPopup) {
            chrome.action.openPopup();
        } else {
            chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
        }
    } else if (info.menuItemId === "add-current-tab") {
        const managerUrl = chrome.runtime.getURL('manager.html');
        chrome.storage.session.get('managerTabId', (stored) => {
            const existingId = stored.managerTabId ?? null;
            if (existingId !== null) {
                chrome.tabs.get(existingId, (t) => {
                    if (chrome.runtime.lastError || !t) {
                        chrome.tabs.create({ url: managerUrl });
                    } else {
                        chrome.tabs.update(existingId, { active: true });
                        chrome.windows.update(t.windowId, { focused: true });
                    }
                });
            } else {
                chrome.tabs.create({ url: managerUrl });
            }
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'reloadmanager') {
        chrome.storage.session.get('managerTabId', (stored) => {
            const existingId = stored.managerTabId ?? null;
            if (existingId !== null) {
                chrome.tabs.get(existingId, (tab) => {
                    if (chrome.runtime.lastError || !tab) {
                        chrome.storage.session.remove('managerTabId');
                        return;
                    }
                    chrome.tabs.reload(existingId);
                });
            }
        });
    }

    if (message.action === 'requestManagerSingleTab') {
    const requesterId = sender.tab?.id ?? null;
    chrome.storage.session.get('managerTabId', (stored) => {
        const existingId = stored.managerTabId ?? null;
        if (existingId !== null && existingId !== requesterId) {
            chrome.tabs.get(existingId, (tab) => {
                if (chrome.runtime.lastError || !tab) {

                    chrome.storage.session.set({ managerTabId: requesterId });
                    sendResponse({ allowed: true });
                } else {
                    sendResponse({ allowed: false, existingId, windowId: tab.windowId });
                }
            });
        } else {
            chrome.storage.session.set({ managerTabId: requesterId });
            sendResponse({ allowed: true });
        }
    });
    return true;
}

    if (message.action === 'releaseManagerTab') {
        chrome.storage.session.get('managerTabId', (stored) => {
            if (stored.managerTabId === sender.tab?.id) {
                chrome.storage.session.remove('managerTabId');
            }
        });
    }

    if (message.action === 'setQuickCloseEnabled') {
        chrome.storage.local.set({ holyQuickCloseEnabled: !!message.enabled });
    }
});

chrome.runtime.onInstalled.addListener((details) => {
    // Context menus
    chrome.contextMenus.create({
        id: "add-to-holy",
        title: chrome.i18n.getMessage("addToHoly"),
        contexts: ["page", "link", "frame"]
    });
    chrome.contextMenus.create({
        id: "add-current-tab",
        title: chrome.i18n.getMessage("openManager"),
        contexts: ["action"]
    });

    // First install
    if (details.reason === 'install') {
        chrome.storage.local.set({ 'donationReminderJustInstalled': true });
    }

    // Uninstall feedback
    const uninstallURL = 'https://docs.google.com/forms/d/e/1FAIpQLSeC7QN0uyKRdEw5MXko2_RLE1y8oQxgkZShqNQOjnVr3FKpnA/viewform?usp=publish-editor';
    chrome.runtime.setUninstallURL(uninstallURL);
});
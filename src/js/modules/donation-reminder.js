/*
 * Holy Private Bookmarks — Encrypted Local Bookmark Manager
 * Copyright (C) 2026 OSV IT-Studio
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const DonationReminder = (function() {
    const STORAGE_KEY = 'holyDonationReminder';
    
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const ONE_WEEK = 7 * ONE_DAY;
    const SIX_MONTHS = 7 * ONE_DAY;

    function getMessage(key) {
        if (window.HolyShared && window.HolyShared.getMessage) {
            return window.HolyShared.getMessage(key);
        }
        try {
            return chrome.i18n.getMessage(key);
        } catch (e) {
            return key;
        }
    }

    async function getReminderData() {
        const data = await chrome.storage.local.get(STORAGE_KEY);
        
        if (!data[STORAGE_KEY]) {
            const newData = {
                installDate: Date.now(),
                lastReminder: null,
                reminderCount: 0,
                lastVersion: chrome.runtime.getManifest().version
            };
            await chrome.storage.local.set({ [STORAGE_KEY]: newData });
            return newData;
        }
        
        return data[STORAGE_KEY];
    }

    async function saveReminderData(data) {
        await chrome.storage.local.set({ [STORAGE_KEY]: data });
    }

    async function shouldShowReminder() {
        const data = await getReminderData();
        const now = Date.now();
        

        if (data.dismissed) return false;

        const timeSinceInstall = now - data.installDate;
        if (timeSinceInstall < ONE_WEEK) return false;

        if (!data.lastReminder) return true;

        const timeSinceLastReminder = now - data.lastReminder;
        return timeSinceLastReminder >= SIX_MONTHS;
    }

    function createElementWithText(tag, className, textContent, attributes = {}) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (textContent) element.textContent = textContent;
        
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'data-i18n') {
                element.setAttribute('data-i18n', value);
            } else {
                element.setAttribute(key, value);
            }
        });
        
        return element;
    }

    function createSVGElement(path) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.8');
        
        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathElement.setAttribute('d', path);
        
        svg.appendChild(pathElement);
        return svg;
    }

    function showMinimalReminder() {
        if (document.getElementById('donation-reminder')) return;

        const reminder = document.createElement('div');
        reminder.id = 'donation-reminder';
        reminder.className = 'donation-reminder';
        
        if (!document.getElementById('reminder-styles')) {
            const style = document.createElement('style');
            style.id = 'reminder-styles';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                
                @keyframes slideOutRight {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
                
                .donation-reminder {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    background: var(--card-bg, #1e1e2f);
                    backdrop-filter: blur(20px);
                    border: 1px solid var(--card-border, rgba(0, 212, 255, 0.3));
                    border-radius: 20px;
                    padding: 24px;
                    max-width: 400px;
                    width: calc(100% - 48px);
                    box-shadow: 0 15px 40px rgba(0, 212, 255, 0.2);
                    animation: slideInRight 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                    z-index: 20000;
                    color: var(--text-primary, white);
                }
                
                .donation-reminder.hiding {
                    animation: slideOutRight 0.3s ease forwards;
                }
                
                .reminder-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 15px;
                }
                
                .reminder-icon {
                    width: 44px;
                    height: 44px;
                    background: rgba(0, 212, 255, 0.1);
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #00d4ff;
                    flex-shrink: 0;
                }
                
                .reminder-icon svg {
                    width: 24px;
                    height: 24px;
                    stroke: currentColor;
                    fill: rgba(0, 212, 255, 0.2);
                }
                
                .reminder-title {
                    color: var(--text-primary, white);
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                }
                
                .reminder-text {
                    color: var(--text-secondary, rgba(255,255,255,0.8));
                    font-size: 14px;
                    margin: 0 0 20px 56px;
                    line-height: 1.5;
                }
                
                .reminder-buttons {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 12px;
                }
                
                .reminder-btn {
                    flex: 1;
                    padding: 12px;
                    border-radius: 30px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    border: none;
                    transition: all 0.2s;
                }
                
                .reminder-btn-primary {
                    background: linear-gradient(135deg, #00d4ff, #a0f1ff);
                    color: #000;
                    font-weight: 600;
                }
                
                .reminder-btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(0, 212, 255, 0.4);
                }
                
                .reminder-btn-secondary {
                    background: transparent;
                    border: 1px solid rgba(255,255,255,0.1);
                    color: var(--text-secondary, rgba(255,255,255,0.7));
                }
                
                .reminder-btn-secondary:hover {
                    background: rgba(255,255,255,0.05);
                    border-color: #00d4ff;
                    color: white;
                }
                
                .reminder-dismiss-link {
                    width: 100%;
                    background: transparent;
                    border: none;
                    color: var(--text-secondary, rgba(255,255,255,0.3));
                    font-size: 11px;
                    cursor: pointer;
                    text-align: center;
                    padding: 6px;
                    transition: color 0.2s;
                }
                
                .reminder-dismiss-link:hover { 
                    color: #ff4d4d; 
                }
                
            `;
            document.head.appendChild(style);
        }

        getReminderData().then(data => {

            const header = document.createElement('div');
            header.className = 'reminder-header';


            const iconDiv = document.createElement('div');
            iconDiv.className = 'reminder-icon';
            const heartSVG = createSVGElement('M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z');
            iconDiv.appendChild(heartSVG);


            const titleContainer = document.createElement('div');
            const title = createElementWithText('h4', 'reminder-title', getMessage('donationReminderTitle') || 'Support the project', { 'data-i18n': 'donationReminderTitle' });
            titleContainer.appendChild(title);

            header.appendChild(iconDiv);
            header.appendChild(titleContainer);


            const text = createElementWithText('p', 'reminder-text', getMessage('donationReminderText') || 'If you like this extension, please support its development!', { 'data-i18n': 'donationReminderText' });


            const buttonsDiv = document.createElement('div');
            buttonsDiv.className = 'reminder-buttons';


            const laterBtn = document.createElement('button');
            laterBtn.id = 'reminder-later';
            laterBtn.className = 'reminder-btn reminder-btn-secondary';
            laterBtn.setAttribute('data-i18n', 'remindLater');
            laterBtn.textContent = getMessage('remindLater') || 'remindLater';
            
            laterBtn.addEventListener('click', async () => {
                reminder.classList.add('hiding');
                const data = await getReminderData();
                data.lastReminder = Date.now();
                data.reminderCount++;
                await saveReminderData(data);
                setTimeout(() => reminder.remove(), 300);
            });


            const donateBtn = document.createElement('button');
            donateBtn.id = 'reminder-donate';
            donateBtn.className = 'reminder-btn reminder-btn-primary';
            donateBtn.setAttribute('data-i18n', 'supportNow');
            donateBtn.textContent = getMessage('supportNow') || 'Support now';
            
            donateBtn.addEventListener('click', async () => {

                chrome.tabs.create({ url: chrome.runtime.getURL('donate.html') });
                
 
                reminder.classList.add('hiding');
                const data = await getReminderData();
                data.dismissed = true;
                data.lastReminder = Date.now();
                data.reminderCount++;
                await saveReminderData(data);
                
                setTimeout(() => reminder.remove(), 300);
            });

            buttonsDiv.appendChild(laterBtn);
            buttonsDiv.appendChild(donateBtn);


            const dismissLink = document.createElement('button');
            dismissLink.id = 'reminder-dismiss';
            dismissLink.className = 'reminder-dismiss-link';
            dismissLink.setAttribute('data-i18n', 'remindNever');
            dismissLink.textContent = getMessage('remindNever') || "Don't show again";
            
            dismissLink.addEventListener('click', async () => {
                if (confirm(getMessage('confirmDismiss') || 'Never show donation reminders again?')) {
                    reminder.classList.add('hiding');
                    const data = await getReminderData();
                    data.dismissed = true;
                    await saveReminderData(data);
                    setTimeout(() => reminder.remove(), 300);
                }
            });


            reminder.appendChild(header);
            reminder.appendChild(text);
            reminder.appendChild(buttonsDiv);
            reminder.appendChild(dismissLink);

            document.body.appendChild(reminder);

            
        });
    }

    async function checkAndShowReminder() {
        if (await shouldShowReminder()) {
            showMinimalReminder();
        }
    }

    async function initOnInstall() {
        const data = await getReminderData();
        const currentVersion = chrome.runtime.getManifest().version;
        
        if (!data.installDate) {
            data.installDate = Date.now();
            data.lastReminder = null;
            data.reminderCount = 0;
            data.dismissed = false;
            data.lastVersion = currentVersion;
            await saveReminderData(data);
        }
    }

    return {
        initOnInstall,
        checkAndShowReminder
    };
})();

if (typeof window !== 'undefined') {
    window.DonationReminder = DonationReminder;
}
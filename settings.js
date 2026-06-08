const THEME_ICON_COLORS = {
    "#000000": "rgb(113, 118, 123)",
    "#15202B": "rgb(139, 152, 165)",
    "#FFFFFF": "rgb(83, 100, 113)",
};

function parseRgbColor(color) {
    if (!color) return null;
    if (color.startsWith("#")) {
        const hex = color.length === 4
            ? color.slice(1).split("").map((c) => c + c).join("")
            : color.slice(1);
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
        };
    }
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
        return { r: +match[1], g: +match[2], b: +match[3] };
    }
    return null;
}

function isDarkColor(color) {
    const rgb = parseRgbColor(color);
    if (!rgb) return false;
    return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 < 0.5;
}

function getElementBackground(element) {
    let el = element?.parentElement;
    while (el) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
            return bg;
        }
        el = el.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor || "#000000";
}

function getThemeColors(contextElement) {
    const bgColor = contextElement
        ? getElementBackground(contextElement)
        : getElementBackground(document.body);
    const iconColor = isDarkColor(bgColor)
        ? THEME_ICON_COLORS["#000000"]
        : THEME_ICON_COLORS["#FFFFFF"];
    return { bgColor, iconColor };
}

class SettingsManager {
    constructor() {
        this.settings = AccountData.DEFAULT_SETTINGS;
        this.resolvedSettings = null;
        this.loadSettings();
    }

    async loadSettings(detectedHandle, options = {}) {
        try {
            let settings = await AccountData.loadFromChromeStorage(AccountData.DEFAULT_SETTINGS);
            settings = AccountData.migrateSettings(settings, detectedHandle);
            if (options.persist === true) {
                await AccountData.saveToChromeStorage(settings);
            }
            this.settings = settings;
            this.resolvedSettings = AccountData.resolveForActiveAccount(settings);
            return this.resolvedSettings;
        } catch (error) {
            console.error('Error loading settings:', error);
            this.resolvedSettings = AccountData.resolveForActiveAccount(AccountData.DEFAULT_SETTINGS);
            return this.resolvedSettings;
        }
    }

    async syncAccountFromPage(detectedHandle) {
        const handle = AccountData.normalizeHandle(detectedHandle);
        if (!handle) {
            return this.loadSettings();
        }
        try {
            let settings = await AccountData.loadFromChromeStorage(AccountData.DEFAULT_SETTINGS);
            settings = AccountData.migrateSettings(settings, handle);
            settings.detectedAccount = handle;
            if (!settings.accounts[handle]) {
                settings.accounts[handle] = AccountData.defaultAccountData();
            }
            settings = AccountData.attachUnassignedToHandle(settings, handle);
            settings.activeAccount = handle;
            await chrome.storage.local.set({ loggedInHandle: handle });
            await AccountData.saveToChromeStorage(settings);
            this.settings = settings;
            this.resolvedSettings = AccountData.resolveForActiveAccount(settings);
            return this.resolvedSettings;
        } catch (error) {
            console.error('Error syncing account:', error);
            return this.loadSettings();
        }
    }

    getSettings() {
        return this.resolvedSettings || AccountData.resolveForActiveAccount(this.settings);
    }

    async saveSettings(newSettings, detectedHandle) {
        try {
            let settings = await AccountData.loadFromChromeStorage(AccountData.DEFAULT_SETTINGS);
            settings = AccountData.migrateSettings(
                settings,
                detectedHandle || settings.detectedAccount
            );
            const accountKey = settings.activeAccount;
            const account = AccountData.getAccount(settings, accountKey);

            if (
                newSettings.stats !== undefined ||
                newSettings.toBlockUsers !== undefined ||
                newSettings.toBlockNotFoundUsers !== undefined ||
                newSettings.bulkQueueAction !== undefined
            ) {
                settings = AccountData.updateActiveAccountLists(settings, {
                    stats: newSettings.stats !== undefined ? newSettings.stats : account.stats,
                    toBlockUsers: newSettings.toBlockUsers !== undefined
                        ? newSettings.toBlockUsers
                        : account.toBlockUsers,
                    toBlockNotFoundUsers: newSettings.toBlockNotFoundUsers !== undefined
                        ? newSettings.toBlockNotFoundUsers
                        : account.toBlockNotFoundUsers,
                    bulkQueueAction: newSettings.bulkQueueAction !== undefined
                        ? newSettings.bulkQueueAction
                        : account.bulkQueueAction
                });
            }

            if (newSettings.action !== undefined) {
                settings.action = newSettings.action;
            }
            if (newSettings.enabledPages !== undefined) {
                settings.enabledPages = newSettings.enabledPages;
            }
            if (newSettings.showSettingsIcon !== undefined) {
                settings.showSettingsIcon = newSettings.showSettingsIcon;
            }
            if (newSettings.tweetButtonPosition !== undefined) {
                settings.tweetButtonPosition = newSettings.tweetButtonPosition;
            }

            await AccountData.saveToChromeStorage(settings);
            this.settings = settings;
            this.resolvedSettings = AccountData.resolveForActiveAccount(settings);
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }
}

class SettingsUI {
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
        this.button = null;
        this.init();
    }

    async init() {
        // Wait for settings to be loaded
        const settings = await this.settingsManager.loadSettings();
        if (settings.showSettingsIcon === true) {
            this.mount();
        }

        // Listen for settings changes
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync' && changes.settings?.newValue?.showSettingsIcon !== undefined) {
                const showIcon = changes.settings.newValue.showSettingsIcon === true;
                if (showIcon && !this.button) {
                    this.mount();
                } else if (!showIcon && this.button) {
                    this.unmount();
                }
            }
        });
    }

    createSettingsButton() {
        const button = document.createElement('div');
        button.className = 'one-click-blocker-settings-button';
        
        const { bgColor, iconColor: color } = getThemeColors(document.body);

        // Create wrapper and background elements
        const wrapper = document.createElement('div');
        wrapper.className = 'settings-button-wrapper';
        
        const background = document.createElement('div');
        background.className = 'settings-button-background';
        
        // Create the settings icon
        const icon = document.createElement('div');
        icon.className = 'settings-icon';
        icon.innerHTML = `
            <svg viewBox="0 0 72 72" width="16" height="16" fill="${bgColor}">
                <circle cx="36" cy="36" r="29" stroke="currentColor" stroke-width="7"/>
                <line x1="17" y1="17" x2="55" y2="55" stroke="currentColor" stroke-width="7"/>
            </svg>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .settings-button-wrapper {
                display: grid;
                position: fixed;
                border-radius: 100%;
                top: 12px;
                right: 16px;
                place-items: center;
                grid-template-areas: "icon";
                grid-template-columns: 1fr;
                z-index: 9999;
            }

            .settings-icon {
                grid-area: icon;
                cursor: pointer;
                text-align: center;
                border-radius: 100%;
                background-color: ${bgColor};
                line-height: 10px;
                transition: all 0.1s ease-in-out;
                box-sizing: border-box;
                display: flex;
                align-items: center;
                justify-content: center;
                place-self: center;
                width: 33px;
                height: 33px;
                color: ${color};
            }

            .settings-icon svg {
                transition: transform 0.1s ease-in-out;
            }

            .settings-button-background {
                grid-area: icon;
                background-color: ${bgColor};
                border-radius: 100%;
                height: 33px;
                width: 33px;
                z-index: -1;
                transition: all 0.1s ease-in-out;
                box-sizing: border-box;
            }

            .settings-button-wrapper:hover .settings-icon {
                background-color: rgba(255,0,64, 0.1);
                color: rgb(255,0,64);
            }

            .settings-button-wrapper:hover .settings-icon svg {
                transform: rotate(270deg);
            }

            .settings-button-wrapper:hover .settings-button-background {
                background-color: rgba(255,0,64, 0.1);
            }

            .settings-button-wrapper:hover .settings-icon svg {
                fill: rgba(255,0,64, 0.1);
            }

            /* Tooltip styles */
            .settings-button-wrapper::after {
                content: 'Settings';
                position: absolute;
                top: 42px;
                right: -8px;
                background-color: rgba(91, 112, 131);
                color: #fff;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
                white-space: nowrap;
                opacity: 0;
                transform: translateY(-4px);
                transition: all 0.1s ease-in-out;
                pointer-events: none;
                font-family: 'TwitterChirp', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            }

            .settings-button-wrapper:hover::after {
                opacity: 1;
                transform: translateY(0);
            }
        `;
        document.head.appendChild(style);

        // Assemble the button
        wrapper.appendChild(background);
        wrapper.appendChild(icon);

        // Open options page when clicked
        wrapper.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'open_options' });
        });

        return wrapper;
    }

    async mount() {
        if (this.button) return;
        const settings = await this.settingsManager.loadSettings();
        if (settings.showSettingsIcon !== true) {
            return;
        }

        this.button = this.createSettingsButton();
        document.body.appendChild(this.button);
    }

    unmount() {
        if (this.button) {
            this.button.remove();
            this.button = null;
        }
    }
}

// Export for use in index.js
window.OneClickBlockerSettings = {
    SettingsManager,
    SettingsUI,
    getThemeColors
}; 
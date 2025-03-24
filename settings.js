// Default settings configuration
const DEFAULT_SETTINGS = {
    action: 'block', // 'block' or 'mute'
    enabledPages: {
        timeline: true,
        followers: true,
        following: true,
        search: true,
        communities: true,
        engagements: true,
        status: true,
        hashtag: true,
        trending: true,
        notifications: true,
        profile: true,
        explore: true
    },
    showSettingsIcon: true,
    stats: {
        totalBlocks: 0,
        totalMutes: 0,
        blockedUsers: [],
        mutedUsers: []
    }
};

class SettingsManager {
    constructor() {
        this.settings = DEFAULT_SETTINGS;
        this.loadSettings();
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get('settings');
            this.settings = result.settings || DEFAULT_SETTINGS;
            return this.settings;
        } catch (error) {
            console.error('Error loading settings:', error);
            return DEFAULT_SETTINGS;
        }
    }

    async saveSettings(newSettings) {
        try {
            await chrome.storage.sync.set({ settings: newSettings });
            this.settings = newSettings;
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }
}

class SettingsUI {
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
        this.isOpen = false;
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
        
        // Get background color from theme
        const bgColor = document.querySelector("meta[name=theme-color]")?.content || "#FFFFFF";
        const color = {
            "#000000": "rgb(113, 118, 123)",
            "#15202B": "rgb(139, 152, 165)",
            "#FFFFFF": "rgb(83, 100, 113)"
        }[bgColor] || "rgb(83, 100, 113)";

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

    createSettingsPanel() {
        const panel = document.createElement('div');
        panel.className = 'one-click-blocker-settings-panel';
        panel.style.display = 'none';

        panel.innerHTML = `
      <div class="settings-panel-header">One-Click Blocker Settings</div>
      
      <div class="settings-section">
        <div class="settings-section-title">Default Action</div>
        <div class="radio-group">
          <label class="radio-option">
            <input type="radio" name="action" value="block" ${this.settingsManager.settings.action === 'block' ? 'checked' : ''}>
            Block
          </label>
          <label class="radio-option">
            <input type="radio" name="action" value="mute" ${this.settingsManager.settings.action === 'mute' ? 'checked' : ''}>
            Mute
          </label>
        </div>
      </div>
      
      <div class="settings-section">
        <div class="settings-section-title">Show Button On</div>
        <div class="checkbox-group">
          ${Object.entries(this.settingsManager.settings.enabledPages).map(([key, value]) => `
            <label class="checkbox-option">
              <input type="checkbox" name="pages" value="${key}" ${value ? 'checked' : ''}>
              ${key.charAt(0).toUpperCase() + key.slice(1)}
            </label>
          `).join('')}
        </div>
      </div>
    `;

        // Add event listeners for settings changes
        panel.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(input => {
            input.addEventListener('change', () => this.saveSettings());
        });

        return panel;
    }

    toggleSettingsPanel() {
        this.isOpen = !this.isOpen;
        const panel = document.querySelector('.one-click-blocker-settings-panel');
        panel.style.display = this.isOpen ? 'block' : 'none';
    }

    saveSettings() {
        const newSettings = {
            action: document.querySelector('input[name="action"]:checked').value,
            enabledPages: Object.fromEntries(
                Array.from(document.querySelectorAll('input[name="pages"]'))
                    .map(checkbox => [checkbox.value, checkbox.checked])
            )
        };

        this.settingsManager.saveSettings(newSettings);
    }

    async mount() {
        const settings = await this.settingsManager.loadSettings();
        if (settings.showSettingsIcon !== true) {
            return;
        }

        this.button = this.createSettingsButton();
        const settingsPanel = this.createSettingsPanel();

        document.body.appendChild(this.button);
        document.body.appendChild(settingsPanel);
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
    SettingsUI
}; 
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
    status: true
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
  }

  createSettingsButton() {
    const button = document.createElement('div');
    button.className = 'one-click-blocker-settings-button';
    button.innerHTML = `
      <div class="settings-button-inner">
        <button role="button" type="button">
          <svg viewBox="0 0 24 24" aria-hidden="true" style="width: 20px; height: 20px;">
            <g>
              <path d="M10.54 1.75h2.92l1.57 2.36c.11.17.32.25.53.21l2.53-.59 2.17 2.17-.58 2.54c-.05.2.04.41.21.53l2.36 1.57v2.92l-2.36 1.57c-.17.12-.26.33-.21.53l.58 2.54-2.17 2.17-2.53-.59c-.21-.04-.42.04-.53.21l-1.57 2.36h-2.92l-1.58-2.36c-.11-.17-.32-.25-.52-.21l-2.54.59-2.17-2.17.58-2.54c.05-.2-.03-.41-.21-.53l-2.35-1.57v-2.92L4.1 8.97c.18-.12.26-.33.21-.53L3.73 5.9 5.9 3.73l2.54.59c.2.04.41-.04.52-.21l1.58-2.36zm1.07 2l-.98 1.47C10.05 6.08 9 6.5 7.99 6.27l-1.46-.34-.6.6.33 1.46c.24 1.01-.18 2.07-1.05 2.64l-1.46.98v.78l1.46.98c.87.57 1.29 1.63 1.05 2.64l-.33 1.46.6.6 1.46-.34c1.01-.23 2.06.19 2.64 1.05l.98 1.47h.78l.97-1.47c.58-.86 1.63-1.28 2.65-1.05l1.45.34.61-.6-.34-1.46c-.23-1.01.18-2.07 1.05-2.64l1.47-.98v-.78l-1.47-.98c-.87-.57-1.28-1.63-1.05-2.64l.34-1.46-.61-.6-1.45.34c-1.02.23-2.07-.19-2.65-1.05l-.97-1.47h-.78zM12 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5c.82 0 1.5-.67 1.5-1.5s-.68-1.5-1.5-1.5zM8.5 12c0-1.93 1.56-3.5 3.5-3.5 1.93 0 3.5 1.57 3.5 3.5s-1.57 3.5-3.5 3.5c-1.94 0-3.5-1.57-3.5-3.5z"></path>
            </g>
          </svg>
        </button>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .one-click-blocker-settings-button {
        width: 400px;
        height: 57px;
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 9999;
        background-color: rgb(239, 243, 244);
        border-radius: 12px;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      
      .one-click-blocker-settings-button:hover {
        background-color: rgb(215, 219, 220);
      }
      
      .settings-button-inner {
        height: 100%;
        display: flex;
        align-items: center;
        padding: 0 16px;
      }
      
      .settings-button-inner button {
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        border-radius: 50%;
      }
      
      .settings-button-inner button:hover {
        background-color: rgba(15, 20, 25, 0.1);
      }
      
      .one-click-blocker-settings-panel {
        position: fixed;
        right: 16px;
        bottom: 80px;
        width: 400px;
        background-color: white;
        border-radius: 16px;
        box-shadow: rgb(101 119 134 / 20%) 0px 0px 15px, rgb(101 119 134 / 15%) 0px 0px 3px 1px;
        z-index: 9999;
        padding: 16px;
      }
      
      .settings-panel-header {
        font-size: 20px;
        font-weight: bold;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgb(239, 243, 244);
      }
      
      .settings-section {
        margin-bottom: 24px;
      }
      
      .settings-section-title {
        font-size: 15px;
        font-weight: bold;
        margin-bottom: 12px;
      }
      
      .radio-group, .checkbox-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .radio-option, .checkbox-option {
        display: flex;
        align-items: center;
        gap: 8px;
      }
    `;
    document.head.appendChild(style);

    button.addEventListener('click', () => this.toggleSettingsPanel());
    return button;
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

  mount() {
    const settingsButton = this.createSettingsButton();
    const settingsPanel = this.createSettingsPanel();
    
    document.body.appendChild(settingsButton);
    document.body.appendChild(settingsPanel);
  }
}

// Export for use in index.js
window.OneClickBlockerSettings = {
  SettingsManager,
  SettingsUI
}; 
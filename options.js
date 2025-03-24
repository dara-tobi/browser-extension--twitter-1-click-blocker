// Default settings configuration
const DEFAULT_SETTINGS = {
  action: 'block',
  enabledPages: {
    timeline: true,
    followers: true,
    following: true,
    search: true,
    communities: true,
    engagements: true,
    status: true,
    trending: true,
    notifications: true,
    hashtag: true,
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

class OptionsManager {
  constructor() {
    this.initializeUI();
    this.loadSettings();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings || DEFAULT_SETTINGS;
      this.updateUI(settings);
    } catch (error) {
      console.error('Error loading settings:', error);
      this.updateUI(DEFAULT_SETTINGS);
    }
  }

  async saveSettings() {
    const settings = {
      action: document.querySelector('input[name="action"]:checked').value,
      enabledPages: Object.fromEntries(
        Array.from(document.querySelectorAll('input[name="pages"]'))
          .map(checkbox => [checkbox.value, checkbox.checked])
      ),
      showSettingsIcon: document.getElementById('show-settings-icon').checked,
      stats: await this.getStats()
    };

    try {
      await chrome.storage.sync.set({ settings });
      this.showSaveNotice();
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  async getStats() {
    const result = await chrome.storage.sync.get('settings');
    return result.settings?.stats || DEFAULT_SETTINGS.stats;
  }

  updateUI(settings) {
    // Update action radios
    const actionRadio = document.querySelector(`input[name="action"][value="${settings.action}"]`);
    if (actionRadio) actionRadio.checked = true;

    // Update page checkboxes
    Object.entries(settings.enabledPages).forEach(([page, enabled]) => {
      const checkbox = document.querySelector(`input[name="pages"][value="${page}"]`);
      if (checkbox) checkbox.checked = enabled;
    });

    // Update interface settings
    const showSettingsIcon = document.getElementById('show-settings-icon');
    if (showSettingsIcon) showSettingsIcon.checked = settings.showSettingsIcon ?? true;

    // Update stats
    if (settings.stats) {
      const totalBlocks = document.getElementById('total-blocks');
      const totalMutes = document.getElementById('total-mutes');
      
      if (totalBlocks) totalBlocks.textContent = settings.stats.totalBlocks || 0;
      if (totalMutes) totalMutes.textContent = settings.stats.totalMutes || 0;
    }

    // Update blocked and muted users lists
    this.updateBlockedUsersList(settings.stats?.blockedUsers || []);
    this.updateMutedUsersList(settings.stats?.mutedUsers || []);
  }

  updateBlockedUsersList(users) {
    const list = document.getElementById('blocked-users-list');
    list.innerHTML = users.length ? users.map(user => `
      <div class="blocked-user">
        <a href="https://twitter.com/${user}" target="_blank" class="user-link">@${user}</a>
      </div>
    `).join('') : '<p>No blocked users yet.</p>';
  }

  updateMutedUsersList(users) {
    const list = document.getElementById('muted-users-list');
    list.innerHTML = users.length ? users.map(user => `
      <div class="blocked-user">
        <a href="https://twitter.com/${user}" target="_blank" class="user-link">@${user}</a>
      </div>
    `).join('') : '<p>No muted users yet.</p>';
  }

  showSaveNotice() {
    const notice = document.querySelector('.save-notice');
    notice.classList.add('visible');
    setTimeout(() => notice.classList.remove('visible'), 2000);
  }

  initializeUI() {
    // Add event listeners for settings changes
    document.querySelectorAll('input[type="radio"], input[type="checkbox"]')
      .forEach(input => {
        input.addEventListener('change', () => this.saveSettings());
      });

    // Add event listeners for tab navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        // Update active tab
        document.querySelectorAll('.nav-item').forEach(tab => tab.classList.remove('active'));
        item.classList.add('active');

        // Show corresponding content
        document.querySelectorAll('.tab-content').forEach(content => {
          content.style.display = content.id === item.dataset.tab ? 'block' : 'none';
        });
      });
    });

    // Add event listeners for backup/restore
    document.getElementById('export-data').addEventListener('click', () => this.exportData());
    document.getElementById('import-data').addEventListener('click', () => this.importData());
    document.getElementById('clear-data').addEventListener('click', () => this.clearData());
  }

  async exportData() {
    try {
      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings || DEFAULT_SETTINGS;
      
      // Get selected export options
      const exportBlocks = document.getElementById('export-blocks').checked;
      const exportMutes = document.getElementById('export-mutes').checked;
      const exportSettings = document.getElementById('export-settings').checked;
      
      // Create export data object with timestamp
      let exportData = {
        exportDate: new Date().toISOString()
      };
      
      if (exportSettings) {
        // Export general settings (action and enabledPages)
        exportData.action = settings.action;
        exportData.enabledPages = settings.enabledPages;
        exportData.showSettingsIcon = settings.showSettingsIcon;
      }
      
      // Only create stats object if we're exporting any stats
      if (exportBlocks || exportMutes) {
        exportData.stats = {};
        
        // Only include block-related stats if blocks are being exported
        if (exportBlocks) {
          exportData.stats.totalBlocks = settings.stats?.totalBlocks || 0;
          exportData.stats.blockedUsers = settings.stats?.blockedUsers || [];
        }
        
        // Only include mute-related stats if mutes are being exported
        if (exportMutes) {
          exportData.stats.totalMutes = settings.stats?.totalMutes || 0;
          exportData.stats.mutedUsers = settings.stats?.mutedUsers || [];
        }
      }
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Format date and time for filename
      const now = new Date();
      const dateStr = now.toISOString()
        .replace(/[:.]/g, '-') // replace colons and dots with hyphens
        .replace('T', '_') // replace T with underscore
        .slice(0, -5); // remove milliseconds and timezone
      
      // Build filename with exported data types
      const exportTypes = [];
      if (exportBlocks) exportTypes.push('blocks');
      if (exportMutes) exportTypes.push('mutes');
      if (exportSettings) exportTypes.push('settings');
      const typesStr = exportTypes.join('-');
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `one-click-blocker-${typesStr}-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting data:', error);
    }
  }

  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    
    input.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        const text = await file.text();
        const importedData = JSON.parse(text);
        
        // Get current settings to merge with
        const result = await chrome.storage.sync.get('settings');
        const currentSettings = result.settings || DEFAULT_SETTINGS;
        
        // Get selected import options
        const importBlocks = document.getElementById('export-blocks').checked;
        const importMutes = document.getElementById('export-mutes').checked;
        const importSettings = document.getElementById('export-settings').checked;
        
        // Create merged settings object
        const settings = {
          // Import general settings only if selected
          action: importSettings ? importedData.action : currentSettings.action,
          enabledPages: importSettings ? importedData.enabledPages : currentSettings.enabledPages,
          showSettingsIcon: importSettings ? importedData.showSettingsIcon : currentSettings.showSettingsIcon,
          
          // Initialize stats object
          stats: {
            // Preserve current stats if not importing respective data
            totalBlocks: importBlocks ? (importedData.stats?.totalBlocks || 0) : currentSettings.stats?.totalBlocks || 0,
            totalMutes: importMutes ? (importedData.stats?.totalMutes || 0) : currentSettings.stats?.totalMutes || 0,
            blockedUsers: importBlocks ? (importedData.stats?.blockedUsers || []) : currentSettings.stats?.blockedUsers || [],
            mutedUsers: importMutes ? (importedData.stats?.mutedUsers || []) : currentSettings.stats?.mutedUsers || []
          }
        };
        
        await chrome.storage.sync.set({ settings });
        this.updateUI(settings);
        this.showSaveNotice();
      } catch (error) {
        console.error('Error importing data:', error);
      }
    };
    
    input.click();
  }

  async clearData() {
    if (!confirm('Are you sure you want to clear the selected data? This cannot be undone.')) {
      return;
    }

    try {
      const result = await chrome.storage.sync.get('settings');
      const currentSettings = result.settings || DEFAULT_SETTINGS;
      
      // Get selected options
      const clearBlocks = document.getElementById('export-blocks').checked;
      const clearMutes = document.getElementById('export-mutes').checked;
      const clearSettings = document.getElementById('export-settings').checked;
      
      // Create new settings object
      const settings = {
        // Clear or keep general settings
        action: clearSettings ? DEFAULT_SETTINGS.action : currentSettings.action,
        enabledPages: clearSettings ? DEFAULT_SETTINGS.enabledPages : currentSettings.enabledPages,
        showSettingsIcon: clearSettings ? DEFAULT_SETTINGS.showSettingsIcon : currentSettings.showSettingsIcon,
        
        // Initialize stats object
        stats: {
          // Clear or keep respective stats
          totalBlocks: clearBlocks ? 0 : currentSettings.stats?.totalBlocks || 0,
          totalMutes: clearMutes ? 0 : currentSettings.stats?.totalMutes || 0,
          blockedUsers: clearBlocks ? [] : currentSettings.stats?.blockedUsers || [],
          mutedUsers: clearMutes ? [] : currentSettings.stats?.mutedUsers || []
        }
      };
      
      await chrome.storage.sync.set({ settings });
      this.updateUI(settings);
      this.showSaveNotice();
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }
}

// Initialize options manager
const optionsManager = new OptionsManager(); 
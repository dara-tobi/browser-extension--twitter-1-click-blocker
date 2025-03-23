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
  stats: {
    totalBlocks: 0,
    totalMutes: 0,
    weeklyBlocks: 0,
    monthlyBlocks: 0,
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

    // Update stats
    if (settings.stats) {
      document.getElementById('total-blocks').textContent = settings.stats.totalBlocks || 0;
      document.getElementById('total-mutes').textContent = settings.stats.totalMutes || 0;
      document.getElementById('monthly-blocks').textContent = settings.stats.monthlyBlocks || 0;
      document.getElementById('monthly-mutes').textContent = settings.stats.monthlyMutes || 0;
    }

    // Update blocked and muted users lists
    this.updateBlockedUsersList(settings.stats?.blockedUsers || []);
    this.updateMutedUsersList(settings.stats?.mutedUsers || []);
  }

  updateBlockedUsersList(users) {
    const list = document.getElementById('blocked-users-list');
    list.innerHTML = users.length ? users.map(user => `
      <div class="blocked-user">
        <div class="blocked-user-info">
          <span>@${user}</span>
        </div>
        <button class="button" onclick="optionsManager.unblockUser('${user}')">Unblock</button>
      </div>
    `).join('') : '<p>No blocked users yet.</p>';
  }

  updateMutedUsersList(users) {
    const list = document.getElementById('muted-users-list');
    list.innerHTML = users.length ? users.map(user => `
      <div class="blocked-user">
        <div class="blocked-user-info">
          <span>@${user}</span>
        </div>
        <button class="button" onclick="optionsManager.unmuteUser('${user}')">Unmute</button>
      </div>
    `).join('') : '<p>No muted users yet.</p>';
  }

  async unblockUser(username) {
    try {
      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings || DEFAULT_SETTINGS;
      
      settings.stats.blockedUsers = settings.stats.blockedUsers.filter(user => user !== username);
      settings.stats.totalBlocks = Math.max(0, settings.stats.totalBlocks - 1);
      
      await chrome.storage.sync.set({ settings });
      this.updateBlockedUsersList(settings.stats.blockedUsers);
      this.updateUI(settings);
    } catch (error) {
      console.error('Error unblocking user:', error);
    }
  }

  async unmuteUser(username) {
    try {
      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings || DEFAULT_SETTINGS;
      
      settings.stats.mutedUsers = settings.stats.mutedUsers.filter(user => user !== username);
      settings.stats.totalMutes = Math.max(0, settings.stats.totalMutes - 1);
      
      await chrome.storage.sync.set({ settings });
      this.updateMutedUsersList(settings.stats.mutedUsers);
      this.updateUI(settings);
    } catch (error) {
      console.error('Error unmuting user:', error);
    }
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
  }

  async exportData() {
    try {
      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings || DEFAULT_SETTINGS;
      
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = 'one-click-blocker-settings.json';
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
        const settings = JSON.parse(text);
        
        await chrome.storage.sync.set({ settings });
        this.updateUI(settings);
        this.showSaveNotice();
      } catch (error) {
        console.error('Error importing data:', error);
      }
    };
    
    input.click();
  }
}

// Initialize options manager
const optionsManager = new OptionsManager(); 
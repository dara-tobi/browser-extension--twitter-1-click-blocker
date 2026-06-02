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
  accounts: {},
  activeAccount: '_unassigned',
  detectedAccount: null,
  _migratedToAccounts: false
};

class OptionsManager {
  constructor() {
    this.currentHandle = null;
    this.initializeUI();
    this.loadSettings();
  }

  async resolveStoredHandle() {
    const { loggedInHandle } = await chrome.storage.local.get('loggedInHandle');
    const result = await chrome.storage.sync.get('settings');
    return AccountData.normalizeHandle(
      loggedInHandle ||
        result.settings?.detectedAccount ||
        (result.settings?.activeAccount !== '_unassigned'
          ? result.settings.activeAccount
          : null)
    );
  }

  async loadStoredSettings(detectedHandle) {
    let settings = await AccountData.loadFromChromeStorage(DEFAULT_SETTINGS);
    settings = AccountData.migrateSettings(settings, detectedHandle);
    const handle = AccountData.normalizeHandle(detectedHandle);
    if (handle) {
      settings = AccountData.switchActiveAccount(settings, handle);
    }
    await AccountData.saveToChromeStorage(settings);
    return settings;
  }

  async refreshUIFromStorage() {
    if (!this.currentHandle) return;
    let settings = await this.loadStoredSettings(this.currentHandle);
    const account = AccountData.getAccount(settings, settings.activeAccount);
    const queueAction = account.bulkQueueAction || 'block';
    const pruned = AccountData.filterToBlockQueue(
      account.toBlockUsers || [],
      account.stats,
      queueAction
    );
    if (pruned.length !== (account.toBlockUsers || []).length) {
      settings = AccountData.updateActiveAccountLists(settings, { toBlockUsers: pruned });
      await AccountData.saveToChromeStorage(settings);
    }
    this.updateUI(AccountData.resolveForActiveAccount(settings), settings);
  }

  showToBlockFeedback(event) {
    if (!event?.username) {
      return;
    }
    const handle = AccountData.listUsernameKey(event.username) || event.username;
    const user = `@${handle}`;
    const messages = {
      blocked: `${user} blocked.`,
      muted: `${user} muted.`,
      already_blocked: `${user} is already blocked.`,
      already_muted: `${user} is already muted.`,
      not_found: `${user} no longer exists.`
    };
    const message = messages[event.type] || `${user} removed from queue.`;
    chrome.storage.local.get(['toBlockQueueRunning'], (result) => {
      if (!result.toBlockQueueRunning) {
        const status = document.getElementById('to-block-queue-status');
        if (status) {
          status.textContent = message;
          clearTimeout(this._toBlockFeedbackTimer);
          this._toBlockFeedbackTimer = setTimeout(() => {
            if (status.textContent === message) status.textContent = '';
          }, 8000);
        }
      }
      this.showSaveNotice(message);
    });
  }

  async refreshToBlockListOnly() {
    if (!this.currentHandle) return;
    let settings = await this.loadStoredSettings(this.currentHandle);
    const resolved = AccountData.resolveForActiveAccount(settings);
    this.updateToBlockFilterUI(resolved);
    this.updateToBlockUsersList(
      resolved.toBlockUsers || [],
      resolved.bulkQueueAction || 'block',
      resolved.toBlockNotFoundUsers || [],
      resolved.toBlockShowNotFound !== false
    );
  }

  async loadResolvedAccountFromStorage() {
    if (!this.currentHandle) return null;
    let settings = await AccountData.loadFromChromeStorage(DEFAULT_SETTINGS);
    settings = AccountData.migrateSettings(settings, this.currentHandle);
    settings = AccountData.switchActiveAccount(settings, this.currentHandle);
    return AccountData.resolveForActiveAccount(settings);
  }

  async loadBlockedTabFromStorage() {
    const resolved = await this.loadResolvedAccountFromStorage();
    if (!resolved) return;
    this.updateBlockedUsersList(resolved.stats?.blockedUsers || []);
  }

  async loadMutedTabFromStorage() {
    const resolved = await this.loadResolvedAccountFromStorage();
    if (!resolved) return;
    this.updateMutedUsersList(resolved.stats?.mutedUsers || []);
  }

  async persistSettings(settings) {
    await AccountData.saveToChromeStorage(settings);
    this.updateUI(AccountData.resolveForActiveAccount(settings), settings);
  }

  async loadSettings() {
    try {
      const handle = await this.resolveStoredHandle();
      if (!handle) {
        this.currentHandle = null;
        return;
      }
      this.currentHandle = handle;
      await this.refreshUIFromStorage();
      this.setAccountHandleInput(handle);
    } catch (error) {
      console.error('Error loading settings:', error);
      this.currentHandle = null;
    }
  }

  async saveSettings() {
    if (!this.currentHandle) return;
    try {
      let settings = await this.loadStoredSettings(this.currentHandle);
      const account = AccountData.getAccount(settings, settings.activeAccount);
      settings.action = document.querySelector('input[name="action"]:checked').value;
      settings.enabledPages = Object.fromEntries(
        Array.from(document.querySelectorAll('input[name="pages"]'))
          .map(checkbox => [checkbox.value, checkbox.checked])
      );
      settings.showSettingsIcon = document.getElementById('show-settings-icon').checked;
      settings = AccountData.setAccount(settings, settings.activeAccount, account);
      await this.persistSettings(settings);
      this.showSaveNotice();
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  async getStats() {
    if (!this.currentHandle) return { totalBlocks: 0, totalMutes: 0, blockedUsers: [], mutedUsers: [] };
    const settings = await this.loadStoredSettings(this.currentHandle);
    return AccountData.getAccount(settings, settings.activeAccount).stats;
  }

  updateUI(settings, rawSettings) {
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
    this.updateToBlockFilterUI(settings);
    this.updateToBlockUsersList(
      settings.toBlockUsers || [],
      settings.bulkQueueAction || 'block',
      settings.toBlockNotFoundUsers || [],
      settings.toBlockShowNotFound !== false
    );
    this.updateBulkQueueUI(settings);
    this.updateToBlockQueueStatus();
    if (this.currentHandle) {
      this.setAccountHandleInput(this.currentHandle);
    }
  }

  setAccountHandleInput(handle) {
    const input = document.getElementById('active-account-input');
    if (input && handle) {
      input.value = handle;
    }
  }

  async saveAccountHandle() {
    if (!this.currentHandle) return;
    const input = document.getElementById('active-account-input');
    const newHandle = input?.value?.trim();
    if (!newHandle) return;

    let settings = await this.loadStoredSettings(this.currentHandle);
    const { settings: updated, error } = AccountData.reassignAccountData(settings, newHandle);
    if (error) {
      alert(error);
      return;
    }

    updated.detectedAccount = updated.activeAccount;
    await chrome.storage.local.set({ loggedInHandle: updated.activeAccount });
    this.currentHandle = updated.activeAccount;
    await this.persistSettings(updated);
    this.setAccountHandleInput(updated.activeAccount);
    this.showSaveNotice(`Lists now saved for @${updated.activeAccount}`);
  }

  updateBulkQueueUI(settings) {
    const action = settings.bulkQueueAction || 'block';
    const radio = document.querySelector(`input[name="bulk-queue-action"][value="${action}"]`);
    if (radio) radio.checked = true;
  }

  updateToBlockFilterUI(settings) {
    const checkbox = document.getElementById('show-to-block-not-found');
    if (checkbox) checkbox.checked = settings.toBlockShowNotFound !== false;
  }

  async saveToBlockNotFoundFilter() {
    if (!this.currentHandle) return;
    let settings = await this.loadStoredSettings(this.currentHandle);
    const show = document.getElementById('show-to-block-not-found')?.checked ?? true;
    settings = AccountData.updateActiveAccountLists(settings, { toBlockShowNotFound: show });
    await this.persistSettings(settings);
  }

  updateToBlockUsersList(users, queueAction = 'block', notFoundUsers = [], showNotFound = true) {
    const list = document.getElementById('to-block-users-list');
    if (!list) return;
    const actionLabel = queueAction === 'mute' ? 'Mute' : 'Block';
    const notFoundSet = new Set(
      (notFoundUsers || []).map((u) => (AccountData.listUsernameKey(u) || u).toLowerCase())
    );
    const isNotFoundUser = (user) =>
      notFoundSet.has((AccountData.listUsernameKey(user) || user).toLowerCase());
    const visibleUsers = showNotFound ? users : users.filter((user) => !isNotFoundUser(user));
    list.innerHTML = users.length ? (visibleUsers.length ? visibleUsers.map(user => {
      const key = (AccountData.listUsernameKey(user) || user).toLowerCase();
      const notFoundTag = notFoundSet.has(key)
        ? '<span class="to-block-not-found-tag">not found</span>'
        : '';
      return `
      <div class="blocked-user to-block-user" data-username="${user}">
        <a href="https://twitter.com/${user}" target="_blank" class="user-link">@${user}</a>
        ${notFoundTag}
        <div class="to-block-user-actions">
          <button type="button" class="button one-click-to-block-user" data-username="${user}" data-action="${queueAction}">${actionLabel}</button>
          <button type="button" class="button remove-to-block-user" data-username="${user}">Remove</button>
        </div>
      </div>
    `;
    }).join('') : (
      showNotFound
        ? '<p>No accounts in queue. Import a list to get started.</p>'
        : '<p>No accounts to show. Suspended and deleted accounts are hidden.</p>'
    )) : '<p>No accounts in queue. Import a list to get started.</p>';

    list.querySelectorAll('.one-click-to-block-user').forEach(btn => {
      btn.addEventListener('click', () => this.blockToBlockUser(btn.dataset.username, btn.dataset.action));
    });
    list.querySelectorAll('.remove-to-block-user').forEach(btn => {
      btn.addEventListener('click', () => this.removeFromToBlockQueue(btn.dataset.username));
    });
  }

  async blockToBlockUser(username, queueAction = 'block') {
    if (!username || !this.currentHandle) {
      return;
    }
    const normalized = AccountData.listUsernameKey(username) || username;
    let settings = await this.loadStoredSettings(this.currentHandle);
    settings = AccountData.switchActiveAccount(settings, this.currentHandle);
    const account = AccountData.getAccount(settings, settings.activeAccount);
    if (AccountData.isToBlockNotFoundTagged(normalized, account.toBlockNotFoundUsers)) {
      settings = AccountData.updateActiveAccountLists(settings, {
        toBlockNotFoundUsers: AccountData.removeToBlockNotFoundTag(
          account.toBlockNotFoundUsers,
          normalized
        )
      });
      await AccountData.saveToChromeStorage(settings);
    }
    const resolved = AccountData.resolveForActiveAccount(settings);
    if (AccountData.isOnBlockedOrMutedList(normalized, resolved.stats, queueAction)) {
      await this.removeFromToBlockQueueWithFeedback(
        normalized,
        queueAction === 'mute' ? 'already_muted' : 'already_blocked'
      );
      return;
    }
    chrome.runtime.sendMessage({
      type: 'open_tab',
      username: normalized,
      mute: queueAction === 'mute'
    }, () => {
      if (chrome.runtime.lastError) {
      }
    });
  }

  async removeFromToBlockQueueWithFeedback(username, eventType) {
    if (!this.currentHandle) return;
    const normalized = AccountData.listUsernameKey(username) || username;
    const key = normalized.toLowerCase();
    let settings = await this.loadStoredSettings(this.currentHandle);
    settings = AccountData.switchActiveAccount(settings, this.currentHandle);
    const account = AccountData.getAccount(settings, settings.activeAccount);
    const queue = (account.toBlockUsers || []).filter(
      (u) => (AccountData.listUsernameKey(u) || u).toLowerCase() !== key
    );
    const removedFromQueue = queue.length !== (account.toBlockUsers || []).length;
    if (removedFromQueue) {
      settings = AccountData.updateActiveAccountLists(settings, { toBlockUsers: queue });
      await AccountData.saveToChromeStorage(settings);
      await this.refreshToBlockListOnly();
    }
    this.showToBlockFeedback({ type: eventType, username: normalized });
  }

  formatQueueRunStats(queueAction, stats) {
    const s = stats || { blocked: 0, muted: 0, notFound: 0 };
    const parts = [];
    if (queueAction === 'mute') {
      parts.push(`${s.muted || 0} muted`);
    } else {
      parts.push(`${s.blocked || 0} blocked`);
    }
    parts.push(`${s.notFound || 0} not found`);
    return parts.join(', ');
  }

  updateToBlockQueueStatus() {
    const status = document.getElementById('to-block-queue-status');
    const startBtn = document.getElementById('start-to-block-queue');
    const stopBtn = document.getElementById('stop-to-block-queue');
    if (!status) return;
    chrome.storage.local.get(
      ['toBlockQueueRunning', 'toBlockQueueAction', 'toBlockQueueRunStats'],
      (result) => {
      const running = !!result.toBlockQueueRunning;
      const queueAction = result.toBlockQueueAction === 'mute' ? 'mute' : 'block';
      const startLabel = queueAction === 'mute' ? 'Start Muting' : 'Start Blocking';

      if (startBtn) {
        startBtn.textContent = running ? 'Stop' : startLabel;
        startBtn.classList.toggle('danger', running);
      }
      if (stopBtn) {
        stopBtn.style.display = 'none';
      }

      if (running) {
        const label = queueAction === 'mute' ? 'Muting' : 'Blocking';
        const runStats = this.formatQueueRunStats(queueAction, result.toBlockQueueRunStats);
        status.textContent = `${label} queue is running… This run: ${runStats}.`;
      } else if (status.textContent.includes('queue is running')) {
        status.textContent = '';
      }
    }
    );
  }

  async saveBulkQueueAction() {
    if (!this.currentHandle) return;
    let settings = await this.loadStoredSettings(this.currentHandle);
    const account = AccountData.getAccount(settings, settings.activeAccount);
    account.bulkQueueAction = document.querySelector('input[name="bulk-queue-action"]:checked')?.value || 'block';
    settings = AccountData.setAccount(settings, settings.activeAccount, account);
    await this.persistSettings(settings);
    const resolved = AccountData.resolveForActiveAccount(settings);
    this.updateBulkQueueUI(resolved);
    this.updateToBlockUsersList(
      resolved.toBlockUsers || [],
      resolved.bulkQueueAction || 'block',
      resolved.toBlockNotFoundUsers || [],
      resolved.toBlockShowNotFound !== false
    );
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

  showSaveNotice(message = 'Settings saved!') {
    const notice = document.querySelector('.save-notice');
    notice.textContent = message;
    notice.classList.add('visible');
    setTimeout(() => {
      notice.classList.remove('visible');
      notice.textContent = 'Settings saved!';
    }, 2000);
  }

  initializeUI() {
    // Add event listeners for settings changes
    document.querySelectorAll('input[type="radio"], input[type="checkbox"]')
      .forEach(input => {
        input.addEventListener('change', () => {
          if (input.name === 'bulk-queue-action') {
            this.saveBulkQueueAction();
          } else {
            this.saveSettings();
          }
        });
      });

    // Add event listeners for tab navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        // Update active tab
        document.querySelectorAll('.nav-item').forEach(tab => tab.classList.remove('active'));
        item.classList.add('active');

        // Show corresponding content
        const tabId = item.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(content => {
          content.style.display = content.id === tabId ? 'block' : 'none';
        });
        if (tabId === 'blocked') void this.loadBlockedTabFromStorage();
        if (tabId === 'muted') void this.loadMutedTabFromStorage();
      });
    });

    // Add event listeners for backup/restore
    document.getElementById('export-data').addEventListener('click', () => this.exportData());
    document.getElementById('import-data').addEventListener('click', () => this.importData());
    document.getElementById('clear-data').addEventListener('click', () => this.clearData());

    document.getElementById('import-to-block').addEventListener('click', () => this.importToBlockUsers());
    document.getElementById('start-to-block-queue').addEventListener('click', () => {
      chrome.storage.local.get(['toBlockQueueRunning'], (result) => {
        if (result.toBlockQueueRunning) {
          this.stopToBlockQueue();
        } else {
          this.startToBlockQueue();
        }
      });
    });
    document.getElementById('stop-to-block-queue').addEventListener('click', () => this.stopToBlockQueue());
    document.getElementById('clear-to-block-queue').addEventListener('click', () => this.clearToBlockQueue());
    document.getElementById('show-to-block-not-found')?.addEventListener('change', () => {
      this.saveToBlockNotFoundFilter();
    });
    document.getElementById('save-account-handle').addEventListener('click', () => this.saveAccountHandle());
    document.getElementById('active-account-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.saveAccountHandle();
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'to_block_queue_feedback') {
        this.showToBlockFeedback({
          type: message.eventType,
          username: message.username
        });
        void this.refreshToBlockListOnly();
        this.updateToBlockQueueStatus();
      }
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.loggedInHandle) {
        this.loadSettings();
      }
      if (namespace === 'local' && changes.toBlockQueueRunning) {
        this.updateToBlockQueueStatus();
      }
      if (namespace === 'local' && changes.toBlockQueueRunStats) {
        this.updateToBlockQueueStatus();
      }
    });
  }

  normalizeUsername(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let s = raw.trim();
    if (!s || s.startsWith('#')) return null;
    if (s.startsWith('@')) s = s.slice(1);
    const urlMatch = s.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)/i);
    if (urlMatch) s = urlMatch[1];
    s = s.replace(/^["']|["']$/g, '').trim();
    if (!/^[A-Za-z0-9_]{1,15}$/.test(s)) return null;
    return s;
  }

  extractUsernamesFromFile(text, filename) {
    const lowerName = (filename || '').toLowerCase();
    if (lowerName.endsWith('.csv')) {
      return this.parseBlockedUsersFromCsv(text);
    }
    if (lowerName.endsWith('.json')) {
      return this.parseBlockedUsersFromJson(text);
    }
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return this.parseBlockedUsersFromJson(text);
    }
    return this.parseBlockedUsersFromCsv(text);
  }

  parseBlockedUsersFromJson(text) {
    const data = JSON.parse(text);
    let rawList = [];
    if (Array.isArray(data)) {
      rawList = data;
    } else if (Array.isArray(data.stats?.blockedUsers)) {
      rawList = data.stats.blockedUsers;
    } else if (Array.isArray(data.blockedUsers)) {
      rawList = data.blockedUsers;
    } else if (Array.isArray(data.toBlockUsers)) {
      rawList = data.toBlockUsers;
    }
    const seen = new Set();
    const usernames = [];
    for (const item of rawList) {
      const username = this.normalizeUsername(typeof item === 'string' ? item : String(item));
      if (username) {
        const key = username.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          usernames.push(username);
        }
      }
    }
    return usernames;
  }

  parseCsvLine(line, delimiter) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current);
    return values;
  }

  parseBlockedUsersFromCsv(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
    if (!lines.length) return [];

    const delimiter = lines[0].includes('\t') ? '\t' : (lines[0].split(';').length > lines[0].split(',').length ? ';' : ',');
    const firstRow = this.parseCsvLine(lines[0], delimiter).map((cell) => cell.trim());
    const headerLower = firstRow.map((cell) => cell.toLowerCase().replace(/^@/, ''));
    const usernameHeaders = ['username', 'user', 'handle', 'screen_name', 'screenname', 'account'];
    const usernameColIndex = headerLower.findIndex((h) => usernameHeaders.includes(h));

    const seen = new Set();
    const usernames = [];
    const addFromCell = (cell) => {
      const username = this.normalizeUsername(cell);
      if (!username) return;
      const key = username.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      usernames.push(username);
    };

    if (usernameColIndex >= 0) {
      for (let i = 1; i < lines.length; i++) {
        const row = this.parseCsvLine(lines[i], delimiter);
        addFromCell(row[usernameColIndex] || '');
      }
      return usernames;
    }

    for (const line of lines) {
      const row = this.parseCsvLine(line, delimiter);
      if (row.length === 1) {
        addFromCell(row[0]);
      } else {
        addFromCell(row[0]);
      }
    }
    return usernames;
  }

  async setToBlockUsers(newUsers, merge = true) {
    if (!this.currentHandle) return { added: 0, total: 0, skipped: 0 };
    let settings = await this.loadStoredSettings(this.currentHandle);
    const account = AccountData.getAccount(settings, settings.activeAccount);
    const queueAction = account.bulkQueueAction || 'block';
    const eligible = AccountData.filterUsernamesForToBlockQueue(
      newUsers,
      account.stats,
      queueAction
    );
    const skipped = newUsers.length - eligible.length;
    const existing = merge
      ? AccountData.filterToBlockQueue(account.toBlockUsers || [], account.stats, queueAction)
      : [];
    const existingLower = new Set(existing.map((u) => u.toLowerCase()));
    const queue = [...existing];
    let added = 0;

    for (const username of eligible) {
      const key = username.toLowerCase();
      if (!existingLower.has(key)) {
        existingLower.add(key);
        queue.push(username);
        added++;
      }
    }

    settings = AccountData.updateActiveAccountLists(settings, { toBlockUsers: queue });
    await this.persistSettings(settings);
    return { added, total: queue.length, skipped };
  }

  async removeFromToBlockQueue(username) {
    if (!this.currentHandle) return;
    let settings = await this.loadStoredSettings(this.currentHandle);
    const account = AccountData.getAccount(settings, settings.activeAccount);
    const queue = (account.toBlockUsers || []).filter(
      (u) => u.toLowerCase() !== username.toLowerCase()
    );
    const notFoundUsers = AccountData.removeToBlockNotFoundTag(
      account.toBlockNotFoundUsers,
      username
    );
    settings = AccountData.updateActiveAccountLists(settings, {
      toBlockUsers: queue,
      toBlockNotFoundUsers: notFoundUsers
    });
    await this.persistSettings(settings);
  }

  async clearToBlockQueue() {
    if (!this.currentHandle) return;
    if (!confirm('Clear the entire to-block queue?')) return;
    let settings = await this.loadStoredSettings(this.currentHandle);
    settings = AccountData.updateActiveAccountLists(settings, {
      toBlockUsers: [],
      toBlockNotFoundUsers: []
    });
    await this.persistSettings(settings);
    this.showSaveNotice('To-block queue cleared.');
  }

  async startToBlockQueue() {
    await this.saveBulkQueueAction();
    const queueAction =
      document.querySelector('input[name="bulk-queue-action"]:checked')?.value || 'block';
    await chrome.storage.local.set({
      toBlockQueueRunning: true,
      toBlockQueueAction: queueAction,
      toBlockQueueRunStats: { blocked: 0, muted: 0, notFound: 0 }
    });
    chrome.runtime.sendMessage({ type: 'start_to_block_queue' });
    this.updateToBlockQueueStatus();
  }

  async stopToBlockQueue() {
    await chrome.storage.local.set({
      toBlockQueueRunning: false,
      toBlockQueueAction: null
    });
    await chrome.storage.local.remove('toBlockQueueRunStats');
    chrome.runtime.sendMessage({ type: 'stop_to_block_queue' });
    this.updateToBlockQueueStatus();
  }

  importToBlockUsers() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.csv,application/json,text/csv';

    input.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const usernames = this.extractUsernamesFromFile(text, file.name);
        if (!usernames.length) {
          alert('No usernames found in file.');
          return;
        }
        const { added, total, skipped } = await this.setToBlockUsers(usernames, true);
        let message = added
          ? `Imported ${added} account(s). ${total} in to-block queue.`
          : `No new accounts added (${total} already in queue).`;
        if (skipped) {
          message += ` ${skipped} skipped (already on your blocked list).`;
        }
        this.showSaveNotice(message);
      } catch (error) {
        console.error('Error importing to-block users:', error);
        alert('Import failed. Use a JSON backup export or a CSV with usernames.');
      }
    };

    input.click();
  }

  async exportData() {
    try {
      const settings = AccountData.resolveForActiveAccount(
        await this.loadStoredSettings(null)
      );
      
      // Get selected export options
      const exportBlocks = document.getElementById('export-blocks').checked;
      const exportMutes = document.getElementById('export-mutes').checked;
      const exportSettings = document.getElementById('export-settings').checked;
      
      // Create export data object with timestamp
      let exportData = {
        exportDate: new Date().toISOString(),
        activeAccount: (await chrome.storage.sync.get('settings')).settings?.activeAccount
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
        let settings = await this.loadStoredSettings(null);
        const account = AccountData.getAccount(settings, settings.activeAccount);
        const resolved = AccountData.resolveForActiveAccount(settings);

        const importBlocks = document.getElementById('export-blocks').checked;
        const importMutes = document.getElementById('export-mutes').checked;
        const importSettings = document.getElementById('export-settings').checked;

        if (importSettings) {
          settings.action = importedData.action ?? settings.action;
          settings.enabledPages = importedData.enabledPages ?? settings.enabledPages;
          settings.showSettingsIcon = importedData.showSettingsIcon ?? settings.showSettingsIcon;
        }

        account.stats = {
          totalBlocks: importBlocks ? (importedData.stats?.totalBlocks || 0) : account.stats.totalBlocks,
          totalMutes: importMutes ? (importedData.stats?.totalMutes || 0) : account.stats.totalMutes,
          blockedUsers: importBlocks ? (importedData.stats?.blockedUsers || []) : account.stats.blockedUsers,
          mutedUsers: importMutes ? (importedData.stats?.mutedUsers || []) : account.stats.mutedUsers
        };
        account.toBlockUsers = resolved.toBlockUsers;
        account.bulkQueueAction = resolved.bulkQueueAction;

        settings = AccountData.setAccount(settings, settings.activeAccount, account);
        await this.persistSettings(settings);
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
      let settings = await this.loadStoredSettings(null);
      const account = AccountData.getAccount(settings, settings.activeAccount);

      const clearBlocks = document.getElementById('export-blocks').checked;
      const clearMutes = document.getElementById('export-mutes').checked;
      const clearSettings = document.getElementById('export-settings').checked;

      if (clearSettings) {
        settings.action = DEFAULT_SETTINGS.action;
        settings.enabledPages = { ...DEFAULT_SETTINGS.enabledPages };
        settings.showSettingsIcon = true;
      }

      account.stats = {
        totalBlocks: clearBlocks ? 0 : account.stats.totalBlocks,
        totalMutes: clearMutes ? 0 : account.stats.totalMutes,
        blockedUsers: clearBlocks ? [] : account.stats.blockedUsers,
        mutedUsers: clearMutes ? [] : account.stats.mutedUsers
      };

      settings = AccountData.setAccount(settings, settings.activeAccount, account);
      await this.persistSettings(settings);
      this.showSaveNotice();
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }
}

// Initialize options manager
const optionsManager = new OptionsManager(); 
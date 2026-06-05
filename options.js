const TOAST_ICONS = { success: 'check', danger: 'x', warn: 'alert', accent: 'info', default: 'info' };
const TOAST_COLORS = {
  success: 'var(--success)',
  danger: 'var(--danger)',
  warn: 'var(--warn)',
  accent: 'var(--accent)',
  default: 'var(--text-3)'
};

/** English source strings for translation. Prefer full phrases; use nouns (Mute, Block), not gerunds (Muting). */
const UI_COPY = {
  action: {
    block: { label: 'Block', infinitive: 'block', past: 'blocked', progress: 'blocking' },
    mute: { label: 'Mute', infinitive: 'mute', past: 'muted', progress: 'muting' }
  },
  queue: {
    runTitle(action) {
      const { progress } = queueActionLabels(action);
      return `Queue run (${progress})`;
    },
    runInProgress: 'Queue in progress',
    startButton: 'Start queue',
    stopButton: 'Stop queue',
    stoppedToast: 'Queue stopped',
    startedToast: 'Queue started',
    startedSelectedAccounts(count) {
      const n = Number(count) || 0;
      return `Queue started for ${n} selected account${n === 1 ? '' : 's'}`;
    },
    savedToStatisticsToast: 'Queue run saved to Statistics',
    finished: 'Queue finished',
    alreadyRunning: 'Queue is already running.',
    processingAccount: 'Processing account',
    preparing: 'Preparing',
    historyEmpty:
      'Start a queue run on the To Block tab. Each run is logged here with timings and outcomes.',
    notFound: 'not found',
    alreadyDone: 'already done',
    remaining: 'remaining',
    readyAccounts(infinitive) {
      return `accounts ready to ${infinitive}`;
    },
    flaggedNotFound(count) {
      return `${count} flagged as not found`;
    },
    bulkSelected(actionLabel) {
      return `${actionLabel} selected`;
    },
    stagedSwitchTo: 'Set as active queue',
    stagedMergeIntoActive: 'Merge into active queue',
    stagedSwitchedToast(label, total) {
      return `Switched to <b>${label}</b> · <b>${total}</b> accounts in active queue`;
    },
    progressMeta(processed, total, pct, etaSec) {
      return `${processed} / ${total} processed · ${pct}% · about ${etaSec} s remaining`;
    }
  }
};

function queueActionLabels(action) {
  return UI_COPY.action[action === 'mute' ? 'mute' : 'block'];
}

function queueInProgressText(action) {
  const { progress } = queueActionLabels(action);
  return `${UI_COPY.queue.runInProgress} (${progress})`;
}

class OptionsManager {
  constructor() {
    this.currentHandle = null;
    this.currentTab = localStorage.getItem('ocb_route') || 'settings';
    this.blockedSearch = '';
    this.mutedSearch = '';
    this._blockedUsers = [];
    this._mutedUsers = [];
    this._queueUsers = [];
    this._queueNotFound = [];
    this._queueTryAgain = [];
    this._queueAction = 'block';
    this._queueFilter = 'all';
    this._queueSearch = '';
    this._queueSelected = new Set();
    this._queueRunning = false;
    this._queueUserStopped = false;
    this._queueLastProcessingHandle = null;
    this._suppressStorageRefresh = false;
    this._loadSettingsPromise = null;
    this._catchUpTimer = null;
    this._pasteDraft = [];
    this._showNotFound = true;
    this._stagedQueues = [];
    this._stagedSelected = new Set();
    this._activeQueueId = null;
    this._activeQueueLabel = null;
    this.backupScope = { blocks: true, mutes: true, settings: true };
    this.injectStaticIcons();
    this.initTheme();
    this.renderPageChips();
    this.initializeUI();
    this.loadSettings();
  }

  injectStaticIcons() {
    document.getElementById('sidebar-open').innerHTML = icon('menu', 20);
    document.getElementById('storage-debug-open').innerHTML = icon('database', 17);
    document.querySelector('#theme-light').innerHTML = icon('sun', 14) + 'Light';
    document.querySelector('#theme-dark').innerHTML = icon('moon', 14) + 'Dark';

    document.querySelectorAll('[data-icon]').forEach(el => {
      el.innerHTML = icon(el.dataset.icon, 18);
    });
    document.querySelectorAll('[data-section-icon]').forEach(el => {
      el.innerHTML = icon(el.dataset.sectionIcon, 18, 'var(--text-2)');
    });
    document.querySelectorAll('[data-btn-icon]').forEach(el => {
      el.innerHTML = icon(el.dataset.btnIcon, 17);
    });
    document.querySelectorAll('[data-seg-icon]').forEach(el => {
      el.innerHTML = icon(el.dataset.segIcon, 15);
    });
    document.querySelectorAll('[data-stat-icon]').forEach(el => {
      el.innerHTML = icon(el.dataset.statIcon, 20);
    });
    document.querySelectorAll('[data-trend-icon]').forEach(el => {
      el.innerHTML = icon(el.dataset.trendIcon, 12);
    });
    document.querySelectorAll('[data-search-icon]').forEach(el => {
      el.innerHTML = icon(el.dataset.searchIcon, 17);
    });
    document.querySelectorAll('[data-scope-icon]').forEach(el => {
      el.innerHTML = icon(el.dataset.scopeIcon, 16);
    });
    document.querySelectorAll('[data-modal-icon]').forEach(el => {
      el.innerHTML = icon('trash', 26);
    });
    document.querySelectorAll('[data-drop-icon]').forEach(el => {
      el.innerHTML = icon(el.dataset.dropIcon, 24);
    });
    document.querySelectorAll('[data-check]').forEach(el => {
      el.innerHTML = icon('check', 13);
    });
  }

  initTheme() {
    const saved = localStorage.getItem('ocb_theme') || 'dark';
    this.setTheme(saved);
  }

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ocb_theme', theme);
    document.getElementById('theme-light').classList.toggle('on', theme === 'light');
    document.getElementById('theme-dark').classList.toggle('on', theme === 'dark');
  }

  toast(message, opts = {}) {
    const host = document.getElementById('toasts');
    const kind = opts.kind || 'default';
    const ttl = opts.ttl || 2400;
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.animation = 'toastIn .35s var(--ease-out)';
    el.innerHTML = `<span class="toast-ico" style="background:${TOAST_COLORS[kind]}">${icon(TOAST_ICONS[kind], 13, '#fff')}</span><span>${message}</span>`;
    host.appendChild(el);
    setTimeout(() => el.classList.add('out'), ttl);
    setTimeout(() => el.remove(), ttl + 320);
  }

  renderPageChips(enabledPages) {
    const grid = document.getElementById('page-chips');
    if (!grid) return;
    const pages = enabledPages || AccountData.DEFAULT_SETTINGS.enabledPages;
    grid.innerHTML = PAGE_TYPES.map(p => {
      const on = pages[p.id] ?? false;
      return `<button type="button" class="chip${on ? ' on' : ''}" data-page="${p.id}">
        <span class="chip-ico">${icon(p.icon, 16)}</span>
        <span class="chip-name">${p.name}</span>
        <span class="switch${on ? ' on' : ''}" data-page-switch="${p.id}" role="presentation"></span>
      </button>`;
    }).join('');
    grid.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        if (e.target.closest('[data-page-switch]')) e.stopPropagation();
        this.togglePageChip(chip.dataset.page);
      });
    });
    this.updatePageCount(pages);
  }

  getEnabledPagesFromDOM() {
    const pages = {};
    document.querySelectorAll('.chip[data-page]').forEach(chip => {
      pages[chip.dataset.page] = chip.classList.contains('on');
    });
    return pages;
  }

  togglePageChip(pageId) {
    const chip = document.querySelector(`.chip[data-page="${pageId}"]`);
    if (!chip) return;
    const on = !chip.classList.contains('on');
    chip.classList.toggle('on', on);
    chip.querySelector('.switch')?.classList.toggle('on', on);
    this.updatePageCount(this.getEnabledPagesFromDOM());
    this.saveSettings();
  }

  toggleAllPages() {
    const pages = this.getEnabledPagesFromDOM();
    const enabledCount = Object.values(pages).filter(Boolean).length;
    const allOn = enabledCount === PAGE_TYPES.length;
    const next = {};
    PAGE_TYPES.forEach(p => { next[p.id] = !allOn; });
    this.renderPageChips(next);
    document.getElementById('toggle-all-pages').textContent = allOn ? 'Enable all' : 'Disable all';
    this.toast(allOn ? 'Buttons hidden on all pages' : 'Buttons enabled everywhere', { kind: 'accent' });
    this.saveSettings();
  }

  updatePageCount(pages) {
    const enabledCount = Object.values(pages).filter(Boolean).length;
    const el = document.getElementById('page-enabled-count');
    if (el) el.textContent = `· ${enabledCount}/${PAGE_TYPES.length}`;
    const btn = document.getElementById('toggle-all-pages');
    if (btn) btn.textContent = enabledCount === PAGE_TYPES.length ? 'Disable all' : 'Enable all';
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

  async readStoredSettings(detectedHandle) {
    let settings = await AccountData.loadFromChromeStorage(AccountData.DEFAULT_SETTINGS);
    settings = AccountData.migrateSettings(settings, detectedHandle);
    const handle = AccountData.normalizeHandle(detectedHandle);
    if (handle) {
      settings = AccountData.switchActiveAccount(settings, handle);
    }
    return settings;
  }

  async loadQueueSliceFromStorage() {
    if (!this.currentHandle) return null;
    const settings = await this.readStoredSettings(this.currentHandle);
    const account = AccountData.getAccount(settings, settings.activeAccount);
    return {
      settings,
      account,
      resolved: AccountData.resolveForActiveAccount(settings)
    };
  }

  removeQueueListRow(username) {
    if (!username) return;
    const key = username.toLowerCase();
    document.querySelectorAll('#queue-users-list .row[data-user]').forEach((row) => {
      if (row.dataset.user?.toLowerCase() === key) row.remove();
    });
  }

  async patchQueueRunFromStorage(opts = {}) {
    if (!this.currentHandle) return;
    const slice = await this.loadQueueSliceFromStorage();
    if (!slice) return;
    const { account, resolved } = slice;
    this._queueUsers = account.toBlockUsers || [];
    this._queueNotFound = account.toBlockNotFoundUsers || [];
    this._queueTryAgain = account.toBlockTryAgainUsers || [];
    this._queueAction = account.bulkQueueAction || this._queueAction || 'block';
    this.updateNavQueueCount(this._queueUsers.length);
    if (opts.removedUsername) {
      this.removeQueueListRow(opts.removedUsername);
    }
    if (opts.rerenderList) {
      this._queueLastProcessingHandle = null;
    }
    if (this.currentTab !== 'queue') return;
    const runState = await chrome.storage.local.get([
      'toBlockQueueRunStats',
      'toBlockQueueRunTotal',
      'toBlockQueueCurrentHandle'
    ]);
    this.renderQueueLaunch();
    this.renderQueueHero(runState);
    this.renderQueueToolbar();
    this.renderQueueSelectAll();
    const processing = runState.toBlockQueueCurrentHandle || null;
    if (!this._queueRunning || opts.rerenderList) {
      this._queueLastProcessingHandle = null;
      this.renderQueueList(processing);
      if (!this._queueRunning) return;
    }
    if (processing !== this._queueLastProcessingHandle) {
      if (this._queueLastProcessingHandle) {
        this.removeQueueListRow(this._queueLastProcessingHandle);
      }
      this._queueLastProcessingHandle = processing;
      this.renderQueueList(processing);
    }
  }

  async refreshUIFromStorage() {
    if (!this.currentHandle) return;
    if (this._queueRunning) {
      return this.patchQueueRunFromStorage();
    }
    const settings = await this.readStoredSettings(this.currentHandle);
    this.updateUI(AccountData.resolveForActiveAccount(settings), settings);
  }

  async loadResolvedAccountFromStorage() {
    if (!this.currentHandle) return null;
    let settings = await AccountData.loadFromChromeStorage(AccountData.DEFAULT_SETTINGS);
    settings = AccountData.migrateSettings(settings, this.currentHandle);
    settings = AccountData.switchActiveAccount(settings, this.currentHandle);
    return AccountData.resolveForActiveAccount(settings);
  }

  async loadBlockedTabFromStorage() {
    if (!this.currentHandle) return;
    const settings = await this.readStoredSettings(this.currentHandle);
    const resolved = AccountData.resolveForActiveAccount(settings);
    this.updateBlockedUsersList(resolved.stats?.blockedUsers || []);
    this.updateNavCounts(resolved.stats?.blockedUsers?.length || 0, resolved.stats?.mutedUsers?.length || 0);
    this.updateBackupDescs(resolved.stats?.blockedUsers?.length || 0, resolved.stats?.mutedUsers?.length || 0);
  }

  async loadMutedTabFromStorage() {
    if (!this.currentHandle) return;
    const settings = await this.readStoredSettings(this.currentHandle);
    const resolved = AccountData.resolveForActiveAccount(settings);
    this.updateMutedUsersList(resolved.stats?.mutedUsers || []);
    this.updateNavCounts(resolved.stats?.blockedUsers?.length || 0, resolved.stats?.mutedUsers?.length || 0);
    this.updateBackupDescs(resolved.stats?.blockedUsers?.length || 0, resolved.stats?.mutedUsers?.length || 0);
  }

  async persistSettings(settings, opts = {}) {
    this._suppressStorageRefresh = true;
    try {
      await AccountData.saveToChromeStorage(settings);
    } finally {
      this._suppressStorageRefresh = false;
    }
    if (!opts.skipUi) {
      this.updateUI(AccountData.resolveForActiveAccount(settings), settings);
    }
  }

  async loadSettings() {
    if (this._loadSettingsPromise) return this._loadSettingsPromise;
    this._loadSettingsPromise = this._loadSettingsImpl();
    try {
      return await this._loadSettingsPromise;
    } finally {
      this._loadSettingsPromise = null;
    }
  }

  async recoverLegacyHeldQueueUsers() {
    const { toBlockQueueHeldUsers } = await chrome.storage.local.get('toBlockQueueHeldUsers');
    if (!toBlockQueueHeldUsers?.length || !this.currentHandle) return false;
    let settings = await this.readStoredSettings(this.currentHandle);
    const account = AccountData.getAccount(settings, settings.activeAccount);
    const seen = new Set();
    const queue = [];
    for (const u of [...(account.toBlockUsers || []), ...toBlockQueueHeldUsers]) {
      const key = (AccountData.listUsernameKey(u) || u).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(AccountData.listUsernameKey(u) || u);
    }
    settings = AccountData.updateActiveAccountLists(settings, { toBlockUsers: queue });
    await this.persistSettings(settings);
    await chrome.storage.local.remove('toBlockQueueHeldUsers');
    return toBlockQueueHeldUsers.length;
  }

  async _loadSettingsImpl() {
    try {
      const handle = await this.resolveStoredHandle();
      if (!handle) {
        this.currentHandle = null;
        return;
      }
      this.currentHandle = handle;
      const restored = await this.recoverLegacyHeldQueueUsers();
      if (restored) {
        this.toast(`Restored <b>${restored}</b> accounts to your queue`, { kind: 'success', ttl: 4000 });
      }
      await this.refreshUIFromStorage();
      this.setAccountHandleInput(handle);
      this.switchTab(this.currentTab, { skipDataRefresh: true });
      void this.syncQueueRunUiFromStorage();
    } catch (error) {
      console.error('Error loading settings:', error);
      this.currentHandle = null;
    }
  }

  async saveSettings() {
    if (!this.currentHandle) return;
    try {
      let settings = await this.readStoredSettings(this.currentHandle);
      const account = AccountData.getAccount(settings, settings.activeAccount);
      const activeSeg = document.querySelector('#action-seg button.on');
      settings.action = activeSeg?.dataset.value || 'block';
      settings.enabledPages = this.getEnabledPagesFromDOM();
      settings.showSettingsIcon = document.getElementById('show-settings-icon').classList.contains('on');
      settings = AccountData.setAccount(settings, settings.activeAccount, account);
      await this.persistSettings(settings);
      this.toast('Settings saved!', { kind: 'success', ttl: 1400 });
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  async getStats() {
    if (!this.currentHandle) return { totalBlocks: 0, totalMutes: 0, blockedUsers: [], mutedUsers: [] };
    const settings = await this.readStoredSettings(this.currentHandle);
    return AccountData.getAccount(settings, settings.activeAccount).stats;
  }

  updateActionSeg(action) {
    document.querySelectorAll('#action-seg button').forEach(btn => {
      const on = btn.dataset.value === action;
      btn.classList.toggle('on', on);
      btn.classList.toggle('accent', on);
    });
    const help = document.getElementById('action-help');
    if (help) {
      help.textContent = action === 'block'
        ? 'One click blocks the account immediately.'
        : "One click mutes the account.";
    }
  }

  updateUI(settings, rawSettings) {
    this.updateActionSeg(settings.action);

    this.renderPageChips(settings.enabledPages);

    const gearSwitch = document.getElementById('show-settings-icon');
    if (gearSwitch) gearSwitch.classList.toggle('on', settings.showSettingsIcon ?? true);

    if (settings.stats) {
      const totalBlocks = document.getElementById('total-blocks');
      const totalMutes = document.getElementById('total-mutes');
      if (totalBlocks) totalBlocks.textContent = (settings.stats.totalBlocks || 0).toLocaleString();
      if (totalMutes) totalMutes.textContent = (settings.stats.totalMutes || 0).toLocaleString();
    }

    this.updateBlockedUsersList(settings.stats?.blockedUsers || []);
    this.updateMutedUsersList(settings.stats?.mutedUsers || []);
    this.updateNavCounts(settings.stats?.blockedUsers?.length || 0, settings.stats?.mutedUsers?.length || 0);
    this.updateNavQueueCount(settings.toBlockUsers?.length || 0);
    this.updateBackupDescs(settings.stats?.blockedUsers?.length || 0, settings.stats?.mutedUsers?.length || 0);
    this._queueAction = settings.bulkQueueAction || 'block';
    this._queueUsers = settings.toBlockUsers || [];
    this._queueNotFound = settings.toBlockNotFoundUsers || [];
    this._queueTryAgain = settings.toBlockTryAgainUsers || [];
    this.updateToBlockPanel(settings);
    this.renderQueueRunHistory(settings);

    if (this.currentHandle) {
      this.setAccountHandleInput(this.currentHandle);
      this.updateAccountLabels(this.currentHandle);
    }
  }

  updateAccountLabels(handle) {
    const label = `@${handle}`;
    ['account-display-handle', 'blocked-account-label', 'muted-account-label', 'sidebar-handle'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = label;
    });
    const av = document.getElementById('sidebar-avatar');
    if (av) {
      const a = avatarFor(handle);
      av.style.background = a.grad;
      av.textContent = a.initial;
    }
    const saveBtn = document.getElementById('save-account-handle');
    const input = document.getElementById('active-account-input');
    if (saveBtn && input) {
      const clean = input.value.trim().replace(/^@/, '');
      saveBtn.disabled = clean === handle;
    }
  }

  updateNavQueueCount(count) {
    const el = document.getElementById('nav-count-queue');
    const live = document.getElementById('nav-queue-live');
    if (live) live.hidden = !this._queueRunning;
    if (el) {
      if (this._queueRunning || count <= 0) {
        el.hidden = true;
      } else {
        el.textContent = count;
        el.hidden = false;
      }
    }
  }

  checkButtonHtml(on, partial) {
    const cls = 'check' + (on ? ' on' : '') + (partial ? ' partial' : '');
    return `<button type="button" class="${cls}" data-check-btn aria-checked="${!!on}">${icon(partial ? 'minus' : 'check', 13)}</button>`;
  }

  isQueueNotFound(user) {
    const key = (AccountData.listUsernameKey(user) || user).toLowerCase();
    return (this._queueNotFound || []).some(
      (u) => (AccountData.listUsernameKey(u) || u).toLowerCase() === key
    );
  }

  isQueueTryAgain(user) {
    const key = (AccountData.listUsernameKey(user) || user).toLowerCase();
    return (this._queueTryAgain || []).some(
      (u) => (AccountData.listUsernameKey(u) || u).toLowerCase() === key
    );
  }

  getQueueCounts() {
    const users = this._queueUsers || [];
    const pending = users.filter((u) => !this.isQueueNotFound(u));
    const visible = this._showNotFound ? users : pending;
    return {
      all: visible.length,
      pending: pending.length,
      notfound: users.length - pending.length
    };
  }

  getShownQueueUsers() {
    let shown = [...(this._queueUsers || [])];
    if (!this._showNotFound) {
      shown = shown.filter((u) => !this.isQueueNotFound(u));
    }
    if (this._queueFilter === 'pending') {
      shown = shown.filter((u) => !this.isQueueNotFound(u));
    } else if (this._queueFilter === 'notfound') {
      shown = shown.filter((u) => this.isQueueNotFound(u));
    }
    if (this._queueSearch) {
      const q = this._queueSearch.toLowerCase();
      shown = shown.filter((u) => u.toLowerCase().includes(q));
    }
    return shown;
  }

  async refreshQueueRunState() {
    const result = await chrome.storage.local.get([
      'toBlockQueueRunning',
      'toBlockQueueAction',
      'toBlockQueueRunStats',
      'toBlockQueueRunTotal',
      'toBlockQueueCurrentHandle'
    ]);
    this._queueRunning = !!result.toBlockQueueRunning;
    if (result.toBlockQueueAction) {
      this._queueAction = result.toBlockQueueAction;
    }
    this._queueLastProcessingHandle = null;
    if (this.currentTab === 'queue') {
      this.renderQueueHero(result);
      this.renderQueueLaunch();
      this.renderQueueToolbar();
      await this.patchQueueRunFromStorage({ rerenderList: true });
    }
  }

  async syncQueueRunUiFromStorage(opts = {}) {
    const wasRunning = this._queueRunning;
    const { toBlockQueueRunning } = await chrome.storage.local.get('toBlockQueueRunning');
    this._queueRunning = !!toBlockQueueRunning;
    if (!this._queueRunning) {
      this._queueLastProcessingHandle = null;
      if (wasRunning) {
        if (!this._queueUserStopped) {
          this.showToBlockFeedback({ type: 'run_complete', username: null });
        }
        this._queueUserStopped = false;
        void this.refreshUIFromStorage();
        void this.loadStatsTabFromStorage();
      }
      void this.refreshQueueRunState();
      return;
    }
    await this.patchQueueRunFromStorage(opts);
  }

  scheduleCatchUpQueueRunUi() {
    if (this._catchUpTimer) clearTimeout(this._catchUpTimer);
    this._catchUpTimer = setTimeout(() => {
      this._catchUpTimer = null;
      void this.catchUpQueueRunUi();
    }, 50);
  }

  async catchUpQueueRunUi() {
    await this.syncQueueRunUiFromStorage({ rerenderList: true });
    if (!this._queueRunning && this.currentHandle) {
      await this.refreshUIFromStorage();
    }
  }

  initQueueRunVisibilityCatchUp() {
    const onWake = () => {
      if (document.visibilityState !== 'hidden') {
        this.scheduleCatchUpQueueRunUi();
      }
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) this.scheduleCatchUpQueueRunUi();
    });
  }

  updateToBlockPanel(settings) {
    const empty = document.getElementById('queue-empty');
    const content = document.getElementById('queue-content');
    const listSection = document.getElementById('queue-list-section');
    const activeLabel = document.getElementById('queue-active-label');
    const stagedSection = document.getElementById('queue-staged-section');

    this._showNotFound = settings.toBlockShowNotFound !== false;
    this._stagedQueues = settings.toBlockStagedQueues || [];
    this._activeQueueId = settings.toBlockActiveQueueId || null;
    this._activeQueueLabel = settings.toBlockActiveQueueLabel || null;

    const hasQueue = (settings.toBlockUsers || []).length > 0;
    const hasStaged = this._stagedQueues.length > 0;
    const hasDraft = this._pasteDraft.length > 0;

    if (empty) empty.hidden = hasQueue || hasStaged || hasDraft;
    if (content) content.hidden = !hasQueue;
    if (listSection) listSection.hidden = !hasQueue;
    if (activeLabel) activeLabel.hidden = !hasQueue;
    if (stagedSection) stagedSection.hidden = !hasStaged;

    this.renderQueueStagedSection();
    this.renderQueueActiveLabel();

    if (hasQueue) void this.refreshQueueRunState();
  }

  renderQueueActiveLabel() {
    const el = document.getElementById('queue-active-label');
    if (!el) return;
    const n = this._queueUsers?.length || 0;
    if (!n) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const name = this._activeQueueLabel || 'Active queue';
    el.textContent = `${name} · ${n} account${n === 1 ? '' : 's'}`;
  }

  updateQueueEmptyVisibility() {
    const empty = document.getElementById('queue-empty');
    if (!empty) return;
    const hasQueue = (this._queueUsers || []).length > 0;
    const hasStaged = (this._stagedQueues || []).length > 0;
    const hasDraft = this._pasteDraft.length > 0;
    empty.hidden = hasQueue || hasStaged || hasDraft;
  }

  parseHandlesFromText(text) {
    const parts = String(text || '').split(/[\s,;]+/).filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const part of parts) {
      const username = this.normalizeUsername(part);
      if (!username) continue;
      const key = username.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(username);
    }
    return out;
  }

  addPasteDraftHandles(handles) {
    const seen = new Set(this._pasteDraft.map((h) => h.toLowerCase()));
    let added = 0;
    for (const raw of handles) {
      const username = this.normalizeUsername(raw);
      if (!username) continue;
      const key = username.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      this._pasteDraft.push(username);
      added++;
    }
    if (added) {
      this.renderQueuePastePanel();
      this.updateQueueEmptyVisibility();
      const stagedSection = document.getElementById('queue-staged-section');
      if (stagedSection && this._stagedQueues.length) stagedSection.hidden = false;
    }
    return added;
  }

  removePasteDraftHandle(handle) {
    const key = (AccountData.listUsernameKey(handle) || handle).toLowerCase();
    this._pasteDraft = this._pasteDraft.filter(
      (h) => (AccountData.listUsernameKey(h) || h).toLowerCase() !== key
    );
    this.renderQueuePastePanel();
    this.updateQueueEmptyVisibility();
  }

  collectPasteHandles() {
    const input = document.getElementById('queue-paste-input');
    const pending = input?.value?.trim() ? this.parseHandlesFromText(input.value) : [];
    return AccountData.mergeUsernameLists(this._pasteDraft, pending);
  }

  clearPasteDraftUI() {
    this._pasteDraft = [];
    const input = document.getElementById('queue-paste-input');
    if (input) input.value = '';
    this.renderQueuePastePanel();
    this.updateQueueEmptyVisibility();
  }

  renderQueuePastePanel() {
    const tagsEl = document.getElementById('queue-paste-tags');
    if (!tagsEl) return;
    tagsEl.innerHTML = this._pasteDraft
      .map(
        (handle) =>
          `<span class="queue-paste-tag">@${this.escapeHtml(handle)}<button type="button" data-remove-paste="${this.escapeHtml(handle)}" aria-label="Remove">×</button></span>`
      )
      .join('');
    tagsEl.querySelectorAll('[data-remove-paste]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.removePasteDraftHandle(btn.getAttribute('data-remove-paste'));
      });
    });
  }

  async createStagedQueue(users, label) {
    if (!this.currentHandle) return null;
    const merged = AccountData.mergeUsernameLists(users);
    if (!merged.length) return null;
    let settings = await this.readStoredSettings(this.currentHandle);
    const account = AccountData.getAccount(settings, settings.activeAccount);
    const entryId = String(Date.now());
    const entryLabel = label || `Queue ${(account.toBlockStagedQueues || []).length + 1}`;
    const entry = {
      id: entryId,
      label: entryLabel,
      createdAt: new Date().toISOString(),
      users: merged
    };

    if (!(account.toBlockUsers || []).length) {
      const queueAction = account.bulkQueueAction || 'block';
      const eligible = AccountData.filterUsernamesForToBlockQueue(merged, account.stats, queueAction);
      if (!eligible.length) return null;
      entry.users = eligible;
      const staged = (account.toBlockStagedQueues || []).filter((q) => q.id !== entryId);
      settings = AccountData.updateActiveAccountLists(settings, {
        toBlockUsers: eligible,
        toBlockStagedQueues: staged,
        toBlockActiveQueueId: entryId,
        toBlockActiveQueueLabel: entryLabel
      });
      await this.persistSettings(settings);
      this._queueUsers = eligible;
      this._activeQueueId = entryId;
      this._activeQueueLabel = entryLabel;
      this._stagedQueues = staged;
      this.renderQueueStagedSection();
      const stagedSection = document.getElementById('queue-staged-section');
      if (stagedSection) stagedSection.hidden = !staged.length;
      this.updateQueueEmptyVisibility();
      return { ...entry, activated: true };
    }

    const staged = [...(account.toBlockStagedQueues || [])];
    staged.push(entry);
    settings = AccountData.updateActiveAccountLists(settings, { toBlockStagedQueues: staged });
    await this.persistSettings(settings);
    this._stagedQueues = staged;
    this.renderQueueStagedSection();
    const stagedSection = document.getElementById('queue-staged-section');
    if (stagedSection) stagedSection.hidden = false;
    this.updateQueueEmptyVisibility();
    return entry;
  }

  async deleteStagedQueue(id) {
    if (!this.currentHandle || !id) return;
    const settings = await this.readStoredSettings(this.currentHandle);
    const accountKey = settings.activeAccount;
    const account = AccountData.getAccount(settings, accountKey);
    const staged = (account.toBlockStagedQueues || []).filter((q) => q.id !== id);
    await AccountData.patchLocalAccountList(accountKey, { toBlockStagedQueues: staged });
    this._stagedQueues = staged;
    this._stagedSelected.delete(id);
    this.renderQueueStagedSection();
    this.updateQueueEmptyVisibility();
    const stagedSection = document.getElementById('queue-staged-section');
    if (stagedSection) stagedSection.hidden = !staged.filter((q) => q.id !== this._activeQueueId).length;
  }

  renderQueueStagedSection() {
    const list = document.getElementById('queue-staged-list');
    const mergeBtn = document.getElementById('queue-staged-merge');
    if (!list) return;
    const activeId = this._activeQueueId;
    const staged = (this._stagedQueues || []).filter((q) => q.id !== activeId);
    if (!staged.length) {
      list.innerHTML = '';
      if (mergeBtn) mergeBtn.disabled = true;
      return;
    }
    list.innerHTML = staged
      .map((q) => {
        const sel = this._stagedSelected.has(q.id);
        const when = this.formatQueueRunDateTime(q.createdAt);
        return `<div class="queue-staged-card${sel ? ' sel' : ''}" data-staged-id="${this.escapeHtml(q.id)}">
          ${this.checkButtonHtml(sel, false)}
          <div class="queue-staged-card-main">
            <div class="queue-staged-card-title">${this.escapeHtml(q.label)}</div>
            <div class="queue-staged-card-meta tnum">${q.users?.length || 0} accounts · ${this.escapeHtml(when)}</div>
          </div>
          <div class="queue-staged-card-actions">
            <button type="button" class="btn btn-sm btn-primary queue-staged-use-active" data-use-staged="${this.escapeHtml(q.id)}">${UI_COPY.queue.stagedSwitchTo}</button>
            <button type="button" class="btn-icon queue-staged-delete" data-delete-staged="${this.escapeHtml(q.id)}" title="Delete staged queue">${icon('x', 16)}</button>
          </div>
        </div>`;
      })
      .join('');
    const selectedCount = staged.filter((q) => this._stagedSelected.has(q.id)).length;
    if (mergeBtn) {
      mergeBtn.disabled = selectedCount === 0;
      mergeBtn.textContent = UI_COPY.queue.stagedMergeIntoActive;
    }

    list.querySelectorAll('.queue-staged-card').forEach((card) => {
      const id = card.dataset.stagedId;
      card.addEventListener('click', (e) => {
        if (
          e.target.closest('.queue-staged-delete') ||
          e.target.closest('.queue-staged-use-active') ||
          e.target.closest('[data-check-btn]')
        )
          return;
        if (this._stagedSelected.has(id)) this._stagedSelected.delete(id);
        else this._stagedSelected.add(id);
        this.renderQueueStagedSection();
      });
      card.querySelector('[data-check-btn]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._stagedSelected.has(id)) this._stagedSelected.delete(id);
        else this._stagedSelected.add(id);
        this.renderQueueStagedSection();
      });
    });
    list.querySelectorAll('[data-delete-staged]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delId = btn.getAttribute('data-delete-staged');
        if (delId) void this.deleteStagedQueue(delId);
      });
    });
    list.querySelectorAll('[data-use-staged]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const useId = btn.getAttribute('data-use-staged');
        if (useId) void this.useStagedQueueAsActive(useId);
      });
    });
  }

  buildQueueSwitchUpdate(account, targetId) {
    const staged = [...(account.toBlockStagedQueues || [])];
    const target = staged.find((q) => q.id === targetId);
    if (!target) return null;
    const queueAction = account.bulkQueueAction || 'block';
    const activeUsers = AccountData.filterToBlockQueue(
      account.toBlockUsers || [],
      account.stats,
      queueAction
    );
    let nextStaged = staged.filter((q) => q.id !== targetId);
    if (activeUsers.length) {
      const stashId = account.toBlockActiveQueueId || String(Date.now());
      const stashLabel =
        account.toBlockActiveQueueLabel ||
        staged.find((q) => q.id === stashId)?.label ||
        `Queue ${nextStaged.length + 1}`;
      const stashEntry = {
        id: stashId,
        label: stashLabel,
        createdAt: staged.find((q) => q.id === stashId)?.createdAt || new Date().toISOString(),
        users: activeUsers
      };
      const idx = nextStaged.findIndex((q) => q.id === stashId);
      if (idx >= 0) nextStaged[idx] = stashEntry;
      else nextStaged.push(stashEntry);
    }
    const nextUsers = AccountData.filterUsernamesForToBlockQueue(
      AccountData.mergeUsernameLists(target.users || []),
      account.stats,
      queueAction
    );
    if (!nextUsers.length) return null;
    return {
      toBlockUsers: nextUsers,
      toBlockStagedQueues: nextStaged,
      toBlockActiveQueueId: target.id,
      toBlockActiveQueueLabel: target.label
    };
  }

  async useStagedQueueAsActive(id) {
    if (!this.currentHandle || !id) return;
    const queue = (this._stagedQueues || []).find((q) => q.id === id);
    if (!queue) return;
    let settings = await this.readStoredSettings(this.currentHandle);
    const account = AccountData.getAccount(settings, settings.activeAccount);
    const listsUpdate = this.buildQueueSwitchUpdate(account, id);
    if (!listsUpdate) {
      this.toast('That queue has no accounts to switch to.', { kind: 'warn' });
      return;
    }
    settings = AccountData.updateActiveAccountLists(settings, listsUpdate);
    await this.persistSettings(settings);
    this._stagedSelected.delete(id);
    this.toast(UI_COPY.queue.stagedSwitchedToast(this.escapeHtml(queue.label), listsUpdate.toBlockUsers.length), {
      kind: 'success'
    });
    await this.refreshUIFromStorage();
  }

  async mergeSelectedStagedQueues() {
    if (!this.currentHandle || !this._stagedSelected.size) return;
    const selected = (this._stagedQueues || []).filter((q) => this._stagedSelected.has(q.id));
    const handles = AccountData.mergeUsernameLists(...selected.map((q) => q.users || []));
    if (!handles.length) return;
    const { added, total } = await this.setToBlockUsers(handles, true);
    let settings = await this.readStoredSettings(this.currentHandle);
    const remaining = (AccountData.getAccount(settings, settings.activeAccount).toBlockStagedQueues || [])
      .filter((q) => !this._stagedSelected.has(q.id));
    settings = AccountData.updateActiveAccountLists(settings, { toBlockStagedQueues: remaining });
    await this.persistSettings(settings);
    this._stagedQueues = remaining;
    this._stagedSelected.clear();
    this.toast(
      added
        ? `Merged <b>${added}</b> accounts · <b>${total}</b> in active queue`
        : `No new accounts · <b>${total}</b> in active queue`,
      { kind: 'success' }
    );
    await this.refreshUIFromStorage();
  }

  async setShowNotFoundInQueue(show) {
    if (!this.currentHandle) return;
    this._showNotFound = !!show;
    let settings = await this.readStoredSettings(this.currentHandle);
    settings = AccountData.updateActiveAccountLists(settings, { toBlockShowNotFound: this._showNotFound });
    await this.persistSettings(settings);
    if (this._queueFilter === 'notfound' && !this._showNotFound) {
      this._queueFilter = 'all';
    }
    this.renderQueueToolbar();
    this.renderQueueList();
    this.renderQueueSelectAll();
  }

  openQueueAddModal() {
    document.getElementById('queue-add-scrim')?.classList.remove('hidden');
    this.showQueueAddMenu();
  }

  closeQueueAddModal() {
    document.getElementById('queue-add-scrim')?.classList.add('hidden');
    this.showQueueAddMenu();
  }

  showQueueAddMenu() {
    const menu = document.getElementById('queue-add-menu');
    const paste = document.getElementById('queue-add-paste');
    if (menu) menu.hidden = false;
    if (paste) paste.hidden = true;
  }

  showQueueAddPaste() {
    const menu = document.getElementById('queue-add-menu');
    const paste = document.getElementById('queue-add-paste');
    if (menu) menu.hidden = true;
    if (paste) paste.hidden = false;
    this.renderQueuePastePanel();
    document.getElementById('queue-paste-input')?.focus();
  }

  initQueueAddUI() {
    if (document.body.dataset.queueAddBound) return;
    document.body.dataset.queueAddBound = '1';

    document.getElementById('queue-empty-add-btn')?.addEventListener('click', () => this.openQueueAddModal());
    document.getElementById('queue-staged-add-btn')?.addEventListener('click', () => this.openQueueAddModal());
    document.getElementById('queue-dropzone')?.addEventListener('click', () => this.openQueueAddModal());
    document.getElementById('queue-add-cancel')?.addEventListener('click', () => this.closeQueueAddModal());
    document.getElementById('queue-add-scrim')?.addEventListener('click', (e) => {
      if (e.target.id === 'queue-add-scrim') this.closeQueueAddModal();
    });
    document.getElementById('queue-add-choose-paste')?.addEventListener('click', () => this.showQueueAddPaste());
    document.getElementById('queue-add-choose-import')?.addEventListener('click', () => {
      this.closeQueueAddModal();
      this.importToBlockUsers();
    });
    document.getElementById('queue-add-paste-back')?.addEventListener('click', () => this.showQueueAddMenu());

    document.querySelectorAll('[data-add-opt-icon]').forEach((el) => {
      el.innerHTML = icon(el.dataset.addOptIcon, 18);
    });

    const input = document.getElementById('queue-paste-input');
    if (!input) return;

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const raw = input.value.trim();
      if (!raw) return;
      const added = this.addPasteDraftHandles(this.parseHandlesFromText(raw));
      if (!added) {
        this.toast('Could not parse that handle.', { kind: 'warn' });
      }
      input.value = '';
    });

    input.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text') || '';
      const handles = this.parseHandlesFromText(text);
      if (!handles.length) return;
      e.preventDefault();
      this.addPasteDraftHandles(handles);
      input.value = '';
    });

    document.getElementById('queue-paste-save-staged')?.addEventListener('click', async () => {
      const handles = this.collectPasteHandles();
      if (!handles.length) {
        this.toast('Add at least one handle first.', { kind: 'warn' });
        return;
      }
      const entry = await this.createStagedQueue(handles, `Queue ${(this._stagedQueues?.length || 0) + 1}`);
      if (entry) {
        this.clearPasteDraftUI();
        this.closeQueueAddModal();
        await this.refreshUIFromStorage();
        this.toast(
          entry.activated
            ? `Set <b>${entry.users.length}</b> accounts as active queue “${this.escapeHtml(entry.label)}”`
            : `Saved <b>${entry.users.length}</b> accounts as “${this.escapeHtml(entry.label)}”`,
          { kind: 'success' }
        );
      }
    });

    document.getElementById('queue-paste-add-active')?.addEventListener('click', async () => {
      const handles = this.collectPasteHandles();
      if (!handles.length) {
        this.toast('Add at least one handle first.', { kind: 'warn' });
        return;
      }
      const { added, total } = await this.setToBlockUsers(handles, true);
      this.clearPasteDraftUI();
      this.closeQueueAddModal();
      await this.refreshUIFromStorage();
      this.toast(
        added
          ? `Added <b>${added}</b> · <b>${total}</b> in active queue`
          : `No new accounts · <b>${total}</b> in active queue`,
        { kind: 'success' }
      );
    });

    document.getElementById('queue-paste-clear-draft')?.addEventListener('click', () => {
      this.clearPasteDraftUI();
    });

    document.getElementById('queue-staged-merge')?.addEventListener('click', () => {
      void this.mergeSelectedStagedQueues();
    });

    document.getElementById('queue-staged-select-all')?.addEventListener('click', () => {
      const staged = this._stagedQueues || [];
      const allSel = staged.length && staged.every((q) => this._stagedSelected.has(q.id));
      if (allSel) {
        this._stagedSelected.clear();
      } else {
        staged.forEach((q) => this._stagedSelected.add(q.id));
      }
      this.renderQueueStagedSection();
    });
  }

  renderQueueLaunch() {
    const el = document.getElementById('queue-launch');
    if (!el || this._queueRunning) {
      if (el) el.innerHTML = '';
      return;
    }
    const counts = this.getQueueCounts();
    const action = queueActionLabels(this._queueAction);
    el.innerHTML = `
      <div class="launch-info">
        <div class="launch-num tnum">${counts.pending}</div>
        <div>
          <div style="font-weight:600;font-size:15px">${UI_COPY.queue.readyAccounts(action.infinitive)}</div>
          <div class="muted" style="font-size:13px">${counts.notfound > 0 ? `${UI_COPY.queue.flaggedNotFound(counts.notfound)}` : ''}</div>
        </div>
      </div>
      <div class="row-gap">
        <div class="seg lg" id="queue-action-seg" role="group">
          <button type="button" data-value="block" class="${this._queueAction === 'block' ? 'on accent' : ''}"><span data-seg-icon="block"></span>${UI_COPY.action.block.label}</button>
          <button type="button" data-value="mute" class="${this._queueAction === 'mute' ? 'on accent' : ''}"><span data-seg-icon="mute"></span>${UI_COPY.action.mute.label}</button>
        </div>
        <button type="button" class="btn btn-ghost" id="queue-add-btn"><span data-btn-icon="plus"></span>Add</button>
        <button type="button" class="btn btn-primary" id="queue-start-btn"><span data-btn-icon="play"></span>${UI_COPY.queue.startButton}</button>
      </div>`;
    el.querySelectorAll('[data-seg-icon]').forEach(n => { n.innerHTML = icon(n.dataset.segIcon, 15); });
    el.querySelectorAll('[data-btn-icon]').forEach(n => { n.innerHTML = icon(n.dataset.btnIcon, 17); });
    el.querySelector('#queue-add-btn')?.addEventListener('click', () => this.openQueueAddModal());
    el.querySelector('#queue-action-seg')?.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        this._queueAction = btn.dataset.value;
        void this.saveBulkQueueAction();
        this.renderQueueLaunch();
        this.renderQueueList();
      });
    });
    el.querySelector('#queue-start-btn')?.addEventListener('click', () => this.startToBlockQueue());
  }

  renderQueueHero(runState) {
    const el = document.getElementById('queue-hero');
    if (!el) return;
    if (!this._queueRunning) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    const stats = runState?.toBlockQueueRunStats || {
      blocked: 0, muted: 0, notFound: 0, alreadyBlocked: 0, alreadyMuted: 0
    };
    const total = runState?.toBlockQueueRunTotal || this.getQueueCounts().pending || 1;
    const doneCount = (stats.blocked || 0) + (stats.muted || 0);
    const notFoundCount = stats.notFound || 0;
    const alreadyBlockedCount = stats.alreadyBlocked || 0;
    const alreadyMutedCount = stats.alreadyMuted || 0;
    const alreadyDoneCount = alreadyBlockedCount + alreadyMutedCount;
    const processed = doneCount + notFoundCount + alreadyDoneCount;
    const pct = total ? Math.min(100, Math.round((processed / total) * 100)) : 0;
    const remaining = Math.max(0, total - processed);
    const eta = Math.max(0, Math.round(remaining * 0.7));
    const current = runState?.toBlockQueueCurrentHandle;
    const action = queueActionLabels(this._queueAction);
    const a = current ? avatarFor(current) : null;
    el.innerHTML = `
      <div class="hero-top">
        <div>
          <div class="hero-state"><span class="nav-dot" style="position:static"></span>${queueInProgressText(this._queueAction)}</div>
          <div class="hero-current">
            ${current ? `<div class="avatar lg" style="background:${a.grad}">${a.initial}</div>` : '<div class="spinner"></div>'}
            <div>
              <div class="hero-doing">${current ? UI_COPY.queue.processingAccount : UI_COPY.queue.preparing}</div>
              <div class="hero-user">@${current || '…'}</div>
            </div>
          </div>
        </div>
        <div class="hero-stats">
          <div class="hero-stat"><div class="n tnum">${doneCount}</div><div class="l">${action.past}</div></div>
          <div class="hero-stat"><div class="n warn tnum">${notFoundCount}</div><div class="l">${UI_COPY.queue.notFound}</div></div>
          <div class="hero-stat"><div class="n muted-stat tnum">${alreadyDoneCount}</div><div class="l">${UI_COPY.queue.alreadyDone}</div></div>
          <div class="hero-stat"><div class="n tnum">${remaining}</div><div class="l">${UI_COPY.queue.remaining}</div></div>
        </div>
      </div>
      <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="hero-foot">
        <div class="hero-meta">${UI_COPY.queue.progressMeta(processed, total, pct, eta)}</div>
        <button type="button" class="btn btn-danger" id="queue-stop-btn"><span data-btn-icon="stop"></span>${UI_COPY.queue.stopButton}</button>
      </div>`;
    const stopIco = el.querySelector('#queue-stop-btn span');
    if (stopIco) stopIco.innerHTML = icon('stop', 17);
    el.querySelector('#queue-stop-btn')?.addEventListener('click', () => this.stopToBlockQueue());
  }

  renderQueueToolbar() {
    const el = document.getElementById('queue-toolbar');
    if (!el) return;
    const counts = this.getQueueCounts();
    const nfChip = this._showNotFound
      ? `<button type="button" class="${this._queueFilter === 'notfound' ? 'on' : ''}" data-filter="notfound">Not found <span class="mini tnum">${counts.notfound}</span></button>`
      : '';
    el.innerHTML = `
      <div class="search">
        <span data-search-icon="search"></span>
        <input type="search" class="input" id="queue-search" placeholder="Search handles…" value="${this.escapeHtml(this._queueSearch)}" autocomplete="off">
      </div>
      <div class="filter-chips" id="queue-filter">
        <button type="button" class="${this._queueFilter === 'all' ? 'on' : ''}" data-filter="all">All <span class="mini tnum">${counts.all}</span></button>
        <button type="button" class="${this._queueFilter === 'pending' ? 'on' : ''}" data-filter="pending">Pending <span class="mini tnum">${counts.pending}</span></button>
        ${nfChip}
      </div>
      <div class="queue-toolbar-extra">
        <label class="queue-show-nf" id="queue-show-notfound-label">
          <span>Show not found</span>
          <span class="switch${this._showNotFound ? ' on' : ''}" id="queue-show-notfound-toggle" role="switch" aria-checked="${this._showNotFound}"></span>
        </label>
        ${this._queueRunning ? '' : '<button type="button" class="btn btn-sm btn-danger-soft" id="queue-clear-btn"><span data-btn-icon="trash"></span>Clear queue</button>'}
      </div>`;
    el.querySelector('[data-search-icon]')?.insertAdjacentHTML('afterbegin', icon('search', 17));
    el.querySelector('#queue-clear-btn [data-btn-icon]')?.insertAdjacentHTML('afterbegin', icon('trash', 15));
    el.querySelector('#queue-search')?.addEventListener('input', (e) => {
      this._queueSearch = e.target.value;
      this.renderQueueList();
      this.renderQueueSelectAll();
    });
    el.querySelectorAll('#queue-filter button').forEach(btn => {
      btn.addEventListener('click', () => {
        this._queueFilter = btn.dataset.filter;
        this._queueSelected.clear();
        this.renderQueueToolbar();
        this.renderQueueSelectAll();
        this.renderQueueList();
        this.renderQueueBulkbar();
      });
    });
    el.querySelector('#queue-clear-btn')?.addEventListener('click', () => this.openClearQueueConfirm());
    const nfToggle = el.querySelector('#queue-show-notfound-toggle');
    const nfLabel = el.querySelector('#queue-show-notfound-label');
    const onNfToggle = () => {
      void this.setShowNotFoundInQueue(!this._showNotFound);
    };
    nfToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      onNfToggle();
    });
    nfLabel?.addEventListener('click', (e) => {
      if (e.target.closest('#queue-show-notfound-toggle')) return;
      onNfToggle();
    });
  }

  renderQueueSelectAll() {
    const el = document.getElementById('queue-select-all');
    if (!el) return;
    const shown = this.getShownQueueUsers();
    if (!shown.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const shownKeys = shown.map((u) => u.toLowerCase());
    const allSel = shownKeys.length > 0 && shownKeys.every((k) => this._queueSelected.has(k));
    const partial = !allSel && shownKeys.some((k) => this._queueSelected.has(k));
    const label = this._queueFilter !== 'all' ? this._queueFilter : '';
    el.innerHTML = `${this.checkButtonHtml(allSel, partial)}<span style="white-space:nowrap">Select all ${label} (${shown.length})</span>`;
    el.querySelector('[data-check-btn]')?.addEventListener('click', () => {
      if (allSel) {
        shownKeys.forEach((k) => this._queueSelected.delete(k));
      } else {
        shownKeys.forEach((k) => this._queueSelected.add(k));
      }
      this.renderQueueSelectAll();
      this.renderQueueList();
      this.renderQueueBulkbar();
    });
  }

  renderQueueList(processingHandle) {
    const list = document.getElementById('queue-users-list');
    if (!list) return;
    const shown = this.getShownQueueUsers();
    const action = queueActionLabels(this._queueAction);
    this.renderQueueSelectAll();

    if (!shown.length) {
      list.innerHTML = `<div class="empty">
        <div class="empty-art">${icon('search', 38)}</div>
        <div class="empty-title">Nothing matches</div>
        <div class="empty-sub">${this._queueSearch ? `No handles contain “${this.escapeHtml(this._queueSearch)}”.` : 'No accounts in this filter.'}</div>
      </div>`;
      this.renderQueueBulkbar();
      return;
    }

    list.innerHTML = `<div class="rows">${shown.map(user => {
      const key = user.toLowerCase();
      const sel = this._queueSelected.has(key);
      const nf = this.isQueueNotFound(user);
      const retry = this.isQueueTryAgain(user);
      const processing = this._queueRunning && processingHandle && processingHandle.toLowerCase() === key;
      const a = avatarFor(user);
      return `<div class="row${sel ? ' sel' : ''}${nf ? ' gone' : ''}${processing ? ' processing' : ''}" data-user="${this.escapeHtml(user)}">
        ${this.checkButtonHtml(sel, false)}
        <div class="avatar sm" style="background:${a.grad}">${a.initial}</div>
        <div class="row-stack">
          <div class="row-handle">
            <a class="h" href="https://twitter.com/${this.escapeHtml(user)}" target="_blank" rel="noopener">@${this.escapeHtml(user)}</a>
            ${processing ? '<span class="spinner" style="width:15px;height:15px;border-width:2px"></span>' : icon('ext', 13, 'var(--text-3)')}
          </div>
        </div>
        ${nf ? `<span class="tag tag-warn">${icon('alert', 12)}not found</span>` : ''}
        ${retry && !nf ? `<span class="tag tag-accent">${icon('info', 12)}try again</span>` : ''}
        <div class="row-actions">
          <button type="button" class="btn btn-sm btn-ghost queue-act-one">${action.label}</button>
          <button type="button" class="btn-icon queue-remove-one" title="Remove from queue">${icon('x', 16)}</button>
        </div>
      </div>`;
    }).join('')}</div>`;

    list.querySelectorAll('.row').forEach(row => {
      const user = row.dataset.user;
      row.querySelector('[data-check-btn]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = user.toLowerCase();
        if (this._queueSelected.has(key)) this._queueSelected.delete(key);
        else this._queueSelected.add(key);
        this.renderQueueSelectAll();
        this.renderQueueList(processingHandle);
        this.renderQueueBulkbar();
      });
      row.querySelector('.queue-act-one')?.addEventListener('click', () => {
        void this.blockToBlockUser(user, this._queueAction);
      });
      row.querySelector('.queue-remove-one')?.addEventListener('click', () => {
        void this.removeFromToBlockQueue(user);
      });
    });
    this.renderQueueBulkbar();
  }

  renderQueueBulkbar() {
    const bar = document.getElementById('queue-bulkbar');
    if (!bar) return;
    if (!this._queueSelected.size) {
      bar.hidden = true;
      bar.innerHTML = '';
      return;
    }
    bar.hidden = false;
    const action = queueActionLabels(this._queueAction);
    bar.innerHTML = `
      ${this.checkButtonHtml(true, false)}
      <span class="count tnum">${this._queueSelected.size} selected</span>
      <span class="spacer" style="flex:1"></span>
      <button type="button" class="btn btn-sm btn-ghost" id="queue-bulk-act"><span data-btn-icon="${this._queueAction}"></span>${UI_COPY.queue.bulkSelected(action.label)}</button>
      <button type="button" class="btn btn-sm btn-danger-soft" id="queue-bulk-remove"><span data-btn-icon="trash"></span>Remove</button>`;
    bar.querySelector('#queue-bulk-act [data-btn-icon]')?.insertAdjacentHTML('afterbegin', icon(this._queueAction, 15));
    bar.querySelector('#queue-bulk-remove [data-btn-icon]')?.insertAdjacentHTML('afterbegin', icon('trash', 15));
    bar.querySelector('[data-check-btn]')?.addEventListener('click', () => {
      this._queueSelected.clear();
      this.renderQueueSelectAll();
      this.renderQueueList();
      this.renderQueueBulkbar();
    });
    bar.querySelector('#queue-bulk-act')?.addEventListener('click', () => {
      void this.startToBlockQueueSelected([...this._queueSelected]);
    });
    bar.querySelector('#queue-bulk-remove')?.addEventListener('click', () => {
      [...this._queueSelected].forEach((u) => void this.removeFromToBlockQueue(u));
      this._queueSelected.clear();
      this.renderQueueBulkbar();
    });
  }

  formatQueueRunDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return iso;
    }
  }

  renderQueueRunHistory(settings) {
    const host = document.getElementById('queue-run-history');
    if (!host) return;
    const runs = settings?.queueRunHistory || [];
    if (!runs.length) {
      host.innerHTML = `<div class="empty">
        <div class="empty-art">${icon('queue', 38)}</div>
        <div class="empty-title">No queue runs yet</div>
        <div class="empty-sub">${UI_COPY.queue.historyEmpty}</div>
      </div>`;
      return;
    }
    host.innerHTML = runs.map(run => {
      const status = run.status === 'stopped' ? 'stopped' : 'completed';
      const statusLabel = status === 'stopped' ? 'Stopped' : 'Completed';
      const isMute = run.action === 'mute';
      const actionLabel = UI_COPY.queue.runTitle(run.action);
      const actionBadge = queueActionLabels(run.action).label;
      const actionIcon = isMute ? 'mute' : 'block';
      const started = this.formatQueueRunDateTime(run.startedAt);
      const stopped = this.formatQueueRunDateTime(run.stoppedAt);
      const primaryDone = isMute
        ? `<span><b class="tnum">${run.muted || 0}</b> muted</span>`
        : `<span><b class="tnum">${run.blocked || 0}</b> blocked</span>`;
      const primaryAlready = isMute
        ? `<span><b class="tnum">${run.alreadyMuted || 0}</b> already muted</span>`
        : `<span><b class="tnum">${run.alreadyBlocked || 0}</b> already blocked</span>`;
      return `<div class="queue-run-card">
        <div class="queue-run-head">
          <div>
            <div class="title">${this.escapeHtml(actionLabel)}</div>
            <div class="meta">${this.escapeHtml(started)} → ${this.escapeHtml(stopped)}</div>
          </div>
          <div class="queue-run-badges">
            <span class="queue-run-action ${isMute ? 'mute' : 'block'}">${icon(actionIcon, 13)}${actionBadge}</span>
            <span class="queue-run-status ${status}">${statusLabel}</span>
          </div>
        </div>
        <div class="queue-run-metrics">
          ${primaryDone}
          ${primaryAlready}
          <span><b class="tnum">${run.notFound || 0}</b> not found</span>
          <span><b class="tnum">${run.total || 0}</b> queued</span>
        </div>
      </div>`;
    }).join('');
  }

  showToBlockFeedback(event) {
    if (event?.type !== 'run_complete') return;
    this.toast(UI_COPY.queue.savedToStatisticsToast, { kind: 'accent', ttl: 3200 });
  }

  async saveBulkQueueAction() {
    if (!this.currentHandle) return;
    let settings = await this.readStoredSettings(this.currentHandle);
    settings = AccountData.updateActiveAccountLists(settings, { bulkQueueAction: this._queueAction });
    await this.persistSettings(settings);
  }

  normalizeUsername(raw) {
    return AccountData.normalizeHandle(raw) || null;
  }

  extractUsernamesFromFile(text, filename) {
    const lowerName = (filename || '').toLowerCase();
    if (lowerName.endsWith('.csv')) return this.parseBlockedUsersFromCsv(text);
    if (lowerName.endsWith('.json')) return this.parseBlockedUsersFromJson(text);
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return this.parseBlockedUsersFromJson(text);
    }
    return this.parseBlockedUsersFromCsv(text);
  }

  parseBlockedUsersFromJson(text) {
    const data = JSON.parse(text);
    let rawList = [];
    if (Array.isArray(data)) rawList = data;
    else if (Array.isArray(data.stats?.blockedUsers)) rawList = data.stats.blockedUsers;
    else if (Array.isArray(data.blockedUsers)) rawList = data.blockedUsers;
    else if (Array.isArray(data.toBlockUsers)) rawList = data.toBlockUsers;
    const seen = new Set();
    const usernames = [];
    for (const item of rawList) {
      const raw = typeof item === 'string' ? item : (item && typeof item === 'object' && item.handle ? item.handle : String(item));
      const username = this.normalizeUsername(raw);
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
      addFromCell(row[0]);
    }
    return usernames;
  }

  async setToBlockUsers(newUsers, merge = true) {
    if (!this.currentHandle) return { added: 0, total: 0, skipped: 0 };
    let settings = await this.readStoredSettings(this.currentHandle);
    const account = AccountData.getAccount(settings, settings.activeAccount);
    const queueAction = account.bulkQueueAction || 'block';
    const eligible = AccountData.filterUsernamesForToBlockQueue(newUsers, account.stats, queueAction);
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
    let settings = await this.readStoredSettings(this.currentHandle);
    const account = AccountData.getAccount(settings, settings.activeAccount);
    const queue = (account.toBlockUsers || []).filter(
      (u) => u.toLowerCase() !== username.toLowerCase()
    );
    const notFoundUsers = AccountData.removeToBlockNotFoundTag(account.toBlockNotFoundUsers, username);
    const tryAgainUsers = AccountData.removeToBlockTryAgainTag(account.toBlockTryAgainUsers, username);
    settings = AccountData.updateActiveAccountLists(settings, {
      toBlockUsers: queue,
      toBlockNotFoundUsers: notFoundUsers,
      toBlockTryAgainUsers: tryAgainUsers
    });
    await this.persistSettings(settings);
    this._queueSelected.delete(username.toLowerCase());
  }

  async blockToBlockUser(username, queueAction = 'block') {
    if (!username || !this.currentHandle) return;
    const normalized = AccountData.listUsernameKey(username) || username;
    let settings = await this.readStoredSettings(this.currentHandle);
    const account = AccountData.getAccount(settings, settings.activeAccount);
    if (AccountData.isToBlockNotFoundTagged(normalized, account.toBlockNotFoundUsers)) {
      settings = AccountData.updateActiveAccountLists(settings, {
        toBlockNotFoundUsers: AccountData.removeToBlockNotFoundTag(account.toBlockNotFoundUsers, normalized)
      });
      await this.persistSettings(settings);
    }
    chrome.runtime.sendMessage({
      type: 'open_tab',
      username: normalized,
      [queueAction]: true,
      mute: queueAction === 'mute'
    });
  }

  importToBlockUsers() {
    const input = document.getElementById('queue-import-file');
    if (!input) return;
    input.value = '';
    input.onchange = async (e) => {
      try {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const usernames = this.extractUsernamesFromFile(text, file.name);
        if (!usernames.length) {
          this.toast('No usernames found in file.', { kind: 'warn' });
          return;
        }
        const base = file.name.replace(/\.[^.]+$/, '') || 'Import';
        const entry = await this.createStagedQueue(
          usernames,
          `${base} (${new Date().toLocaleDateString()})`
        );
        if (!entry) {
          this.toast('No usernames found in file.', { kind: 'warn' });
          return;
        }
        this.toast(
          entry.activated
            ? `Set <b>${entry.users.length}</b> accounts as active queue “${this.escapeHtml(entry.label)}”`
            : `Imported <b>${entry.users.length}</b> accounts into saved queue “${this.escapeHtml(entry.label)}”`,
          { kind: 'success' }
        );
        await this.refreshUIFromStorage();
      } catch (error) {
        console.error('Error importing to-block users:', error);
        this.toast('Could not import file', { kind: 'danger' });
      }
      input.value = '';
    };
    input.click();
  }

  async startToBlockQueue() {
    await this.saveBulkQueueAction();
    chrome.runtime.sendMessage({ type: 'start_to_block_queue' });
    this._queueRunning = true;
    this._queueLastProcessingHandle = null;
    this.renderQueueLaunch();
    void this.syncQueueRunUiFromStorage();
    this.toast(UI_COPY.queue.startedToast, { kind: 'accent' });
  }

  async startToBlockQueueSelected(selectedUsernames) {
    if (this._queueRunning) {
      this.toast(UI_COPY.queue.alreadyRunning, { kind: 'warn' });
      return;
    }
    const selectedSet = new Set(
      selectedUsernames.map((u) => (AccountData.listUsernameKey(u) || u).toLowerCase())
    );
    if (!selectedSet.size) return;

    await this.saveBulkQueueAction();

    const settings = await this.readStoredSettings(this.currentHandle);
    if (!settings) return;
    const account = AccountData.getAccount(settings, settings.activeAccount);
    const selectedOrdered = (account.toBlockUsers || []).filter((u) =>
      selectedSet.has((AccountData.listUsernameKey(u) || u).toLowerCase())
    );
    if (!selectedOrdered.length) return;

    await chrome.storage.local.set({
      toBlockQueueRunBatch: selectedOrdered.map((u) => AccountData.listUsernameKey(u) || u)
    });

    this._queueSelected.clear();
    this.renderQueueBulkbar();
    this.renderQueueSelectAll();

    chrome.runtime.sendMessage({ type: 'start_to_block_queue', selectedOnly: true });
    this._queueRunning = true;
    this._queueLastProcessingHandle = null;
    this.renderQueueLaunch();
    void this.syncQueueRunUiFromStorage();
    this.toast(UI_COPY.queue.startedSelectedAccounts(selectedOrdered.length), { kind: 'accent' });
  }

  stopToBlockQueue() {
    this._queueUserStopped = true;
    chrome.runtime.sendMessage({ type: 'stop_to_block_queue' });
    this._queueLastProcessingHandle = null;
    this.toast(UI_COPY.queue.stoppedToast, { kind: 'warn' });
  }

  openClearQueueConfirm() {
    document.getElementById('clear-queue-scrim')?.classList.remove('hidden');
  }

  closeClearQueueConfirm() {
    document.getElementById('clear-queue-scrim')?.classList.add('hidden');
  }

  async clearToBlockQueue() {
    if (!this.currentHandle) return;
    let settings = await this.readStoredSettings(this.currentHandle);
    settings = AccountData.updateActiveAccountLists(settings, {
      toBlockUsers: [],
      toBlockNotFoundUsers: [],
      toBlockTryAgainUsers: [],
      toBlockActiveQueueId: null,
      toBlockActiveQueueLabel: null
    });
    await this.persistSettings(settings);
    this._queueSelected.clear();
    this.toast('Queue cleared', { kind: 'danger' });
  }

  updateNavCounts(blocked, muted) {
    const setCount = (id, n) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (n > 0) {
        el.textContent = n;
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    };
    setCount('nav-count-blocked', blocked);
    setCount('nav-count-muted', muted);
    const blockedTitle = document.getElementById('blocked-title-count');
    const mutedTitle = document.getElementById('muted-title-count');
    if (blockedTitle) blockedTitle.textContent = blocked;
    if (mutedTitle) mutedTitle.textContent = muted;
  }

  updateBackupDescs(blocked, muted) {
    const b = document.getElementById('backup-desc-blocks');
    const m = document.getElementById('backup-desc-mutes');
    if (b) b.textContent = `${blocked} account${blocked === 1 ? '' : 's'}`;
    if (m) m.textContent = `${muted} account${muted === 1 ? '' : 's'}`;
  }

  setAccountHandleInput(handle) {
    const input = document.getElementById('active-account-input');
    if (input && handle) {
      input.value = handle;
      this.updateAccountLabels(handle);
    }
  }

  async saveAccountHandle() {
    if (!this.currentHandle) return;
    const input = document.getElementById('active-account-input');
    const newHandle = input?.value?.trim().replace(/^@/, '');
    if (!newHandle) return;

    let settings = await this.readStoredSettings(this.currentHandle);
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
    this.toast(`Lists now saved for <b>@${updated.activeAccount}</b>`, { kind: 'success' });
  }

  formatActionAgo(at) {
    const sec = Math.max(0, Math.floor((Date.now() - at) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return min === 1 ? '1 minute ago' : `${min} minutes ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr === 1 ? '1 hour ago' : `${hr} hours ago`;
    const day = Math.floor(hr / 24);
    if (day < 30) return day === 1 ? '1 day ago' : `${day} days ago`;
    const month = Math.floor(day / 30);
    if (month < 12) return month === 1 ? '1 month ago' : `${month} months ago`;
    const year = Math.floor(day / 365);
    return year === 1 ? '1 year ago' : `${year} years ago`;
  }

  filterUsers(users, q) {
    if (!q) return users;
    const lower = q.toLowerCase();
    return users.filter((u) => (AccountData.listUsernameKey(u) || '').includes(lower));
  }

  renderUserList(containerId, users, kind) {
    const list = document.getElementById(containerId);
    const toolbarId = kind === 'blocked' ? 'blocked-toolbar' : 'muted-toolbar';
    const toolbar = document.getElementById(toolbarId);
    const q = kind === 'blocked' ? this.blockedSearch : this.mutedSearch;
    const isBlocked = kind === 'blocked';

    const searchInput = document.getElementById(kind === 'blocked' ? 'blocked-search' : 'muted-search');
    if (searchInput) {
      searchInput.placeholder = users.length ? `Search ${users.length} handles…` : 'Search handles…';
    }

    if (!users.length) {
      if (toolbar) toolbar.hidden = true;
      list.innerHTML = `<div class="card"><div class="empty">
        <div class="empty-art">${icon(isBlocked ? 'block' : 'mute', 38)}</div>
        <div class="empty-title">No ${isBlocked ? 'blocked' : 'muted'} users yet</div>
        <div class="empty-sub">Accounts you ${isBlocked ? 'block' : 'mute'} through the extension will be recorded here.</div>
      </div></div>`;
      return;
    }

    if (toolbar) toolbar.hidden = false;

    let shown = this.filterUsers(users, q);
    shown = [...shown].sort((a, b) => {
      const idxA = users.indexOf(a);
      const idxB = users.indexOf(b);
      const keyA = AccountData.listUserAt(a) ?? idxA;
      const keyB = AccountData.listUserAt(b) ?? idxB;
      return keyB - keyA;
    });

    if (!shown.length) {
      list.innerHTML = `<div class="empty">
        <div class="empty-art">${icon('search', 38)}</div>
        <div class="empty-title">Nothing matches</div>
        <div class="empty-sub">No handles contain “${this.escapeHtml(q)}”.</div>
      </div>`;
      return;
    }

    list.innerHTML = `<div class="rows">${shown.map(user => {
      const handle = AccountData.listUsernameKey(user) || user;
      const at = AccountData.listUserAt(user);
      const a = avatarFor(handle);
      const sub = at != null
        ? `${isBlocked ? 'Blocked' : 'Muted'} ${this.formatActionAgo(at)}`
        : `${isBlocked ? 'Blocked' : 'Muted'} via extension`;
      return `<a class="row row-link" href="https://twitter.com/${this.escapeHtml(handle)}" target="_blank" rel="noopener">
        <div class="avatar sm" style="background:${a.grad}">${a.initial}</div>
        <div class="row-stack">
          <div class="row-handle">
            <span class="h">@${this.escapeHtml(handle)}</span>
            ${icon('ext', 13, 'var(--text-3)')}
          </div>
          <div class="row-sub">${sub}</div>
        </div>
      </a>`;
    }).join('')}</div>`;
  }

  updateBlockedUsersList(users) {
    this._blockedUsers = users;
    this.renderUserList('blocked-users-list', users, 'blocked');
  }

  updateMutedUsersList(users) {
    this._mutedUsers = users;
    this.renderUserList('muted-users-list', users, 'muted');
  }

  focusCurrentTabSearch() {
    const panel = document.querySelector('.tab-panel.active');
    if (!panel) return false;
    const input = panel.querySelector('input[type="search"]');
    if (!input || input.disabled) return false;
    input.focus();
    if (typeof input.select === 'function') input.select();
    return true;
  }

  switchTab(tabId, opts = {}) {
    this.currentTab = tabId;
    localStorage.setItem('ocb_route', tabId);
    document.querySelectorAll('.nav-item[data-tab]').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === tabId);
    });
    if (!opts.skipDataRefresh && tabId === 'queue') void this.refreshUIFromStorage();
    if (!opts.skipDataRefresh && (tabId === 'settings' || tabId === 'backup')) void this.refreshUIFromStorage();
    if (tabId === 'blocked') void this.loadBlockedTabFromStorage();
    if (tabId === 'muted') void this.loadMutedTabFromStorage();
    if (tabId === 'stats') void this.loadStatsTabFromStorage();
  }

  async loadStatsTabFromStorage() {
    if (!this.currentHandle) return;
    const settings = await this.readStoredSettings(this.currentHandle);
    const resolved = AccountData.resolveForActiveAccount(settings);
    if (resolved.stats) {
      const totalBlocks = document.getElementById('total-blocks');
      const totalMutes = document.getElementById('total-mutes');
      if (totalBlocks) totalBlocks.textContent = (resolved.stats.totalBlocks || 0).toLocaleString();
      if (totalMutes) totalMutes.textContent = (resolved.stats.totalMutes || 0).toLocaleString();
    }
    this.updateNavCounts(resolved.stats?.blockedUsers?.length || 0, resolved.stats?.mutedUsers?.length || 0);
    this.renderQueueRunHistory(resolved);
  }

  getBackupCheckboxes() {
    return {
      blocks: this.backupScope.blocks,
      mutes: this.backupScope.mutes,
      settings: this.backupScope.settings
    };
  }

  initializeUI() {
    document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
      item.addEventListener('click', () => {
        this.switchTab(item.dataset.tab);
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebar-backdrop')?.classList.remove('open');
      });
    });

    document.getElementById('sidebar-open')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.add('open');
      document.getElementById('sidebar-backdrop')?.classList.add('open');
    });
    document.getElementById('sidebar-backdrop')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebar-backdrop')?.classList.remove('open');
    });

    document.getElementById('theme-light')?.addEventListener('click', () => this.setTheme('light'));
    document.getElementById('theme-dark')?.addEventListener('click', () => this.setTheme('dark'));

    document.querySelectorAll('#action-seg button').forEach(btn => {
      btn.addEventListener('click', () => {
        this.updateActionSeg(btn.dataset.value);
        this.saveSettings();
        this.toast(`Default set to <b>${btn.dataset.value}</b>`, { kind: 'accent', ttl: 1600 });
      });
    });

    document.getElementById('show-settings-icon')?.addEventListener('click', function () {
      this.classList.toggle('on');
      optionsManager.saveSettings();
    });

    document.getElementById('toggle-all-pages')?.addEventListener('click', () => this.toggleAllPages());

    this.initQueueAddUI();
    document.getElementById('clear-queue-cancel')?.addEventListener('click', () => this.closeClearQueueConfirm());
    document.getElementById('clear-queue-confirm')?.addEventListener('click', () => {
      this.closeClearQueueConfirm();
      void this.clearToBlockQueue();
    });
    document.getElementById('clear-queue-scrim')?.addEventListener('click', (e) => {
      if (e.target.id === 'clear-queue-scrim') this.closeClearQueueConfirm();
    });

    document.getElementById('save-account-handle')?.addEventListener('click', () => this.saveAccountHandle());
    document.getElementById('active-account-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.saveAccountHandle();
    });
    document.getElementById('active-account-input')?.addEventListener('input', () => {
      if (this.currentHandle) this.updateAccountLabels(this.currentHandle);
    });

    document.getElementById('blocked-search')?.addEventListener('input', (e) => {
      this.blockedSearch = e.target.value;
      this.updateBlockedUsersList(this._blockedUsers);
    });
    document.getElementById('muted-search')?.addEventListener('input', (e) => {
      this.mutedSearch = e.target.value;
      this.updateMutedUsersList(this._mutedUsers);
    });

    document.querySelectorAll('#backup-scopes .row[data-scope]').forEach(row => {
      row.addEventListener('click', () => {
        const scope = row.dataset.scope;
        this.backupScope[scope] = !this.backupScope[scope];
        row.classList.toggle('sel', this.backupScope[scope]);
        row.querySelector('.check')?.classList.toggle('on', this.backupScope[scope]);
        const ico = row.querySelector('.chip-ico');
        if (ico) {
          if (this.backupScope[scope]) {
            ico.style.background = 'var(--accent)';
            ico.style.color = '#fff';
          } else {
            ico.style.background = '';
            ico.style.color = '';
          }
        }
      });
    });

    document.getElementById('export-data').addEventListener('click', () => this.exportData());
    document.getElementById('import-data').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', (e) => this.importData(e));
    document.getElementById('clear-data').addEventListener('click', () => this.openClearConfirm());

    document.getElementById('clear-cancel')?.addEventListener('click', () => this.closeClearConfirm());
    document.getElementById('clear-confirm')?.addEventListener('click', () => {
      this.closeClearConfirm();
      void this.clearData();
    });
    document.getElementById('clear-confirm-scrim')?.addEventListener('click', (e) => {
      if (e.target.id === 'clear-confirm-scrim') this.closeClearConfirm();
    });

    document.getElementById('storage-debug-open')?.addEventListener('click', () => {
      void this.openStorageDebug();
    });
    document.getElementById('storage-debug-close')?.addEventListener('click', () => {
      this.closeStorageDebug();
    });
    document.getElementById('storage-debug-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'storage-debug-overlay') this.closeStorageDebug();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeStorageDebug();
        this.closeClearConfirm();
        this.closeClearQueueConfirm();
        this.closeQueueAddModal();
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key === 'i' || e.key === 'I') &&
        (this.currentTab === 'queue' || this.currentTab === 'settings' || this.currentTab === 'backup')
      ) {
        const t = e.target;
        if (
          t &&
          (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        if (this.currentTab === 'backup') {
          document.getElementById('import-file')?.click();
        } else {
          this.importToBlockUsers();
        }
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target;
        if (
          t &&
          (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
        ) {
          return;
        }
        if (this.focusCurrentTabSearch()) e.preventDefault();
      }
    });

    this.initQueueRunVisibilityCatchUp();

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (this._suppressStorageRefresh) return;
      if (namespace === 'local' && changes.loggedInHandle) {
        void this.loadSettings();
      }
      if (namespace === 'local' && changes.toBlockQueueRunning) {
        void this.syncQueueRunUiFromStorage();
        return;
      }
      if (namespace === 'local' && this._queueRunning) {
        if (
          changes.toBlockQueueRunStats ||
          changes.toBlockQueueCurrentHandle ||
          changes.toBlockQueueRunTotal ||
          changes[AccountData.ACCOUNT_LISTS_STORAGE_KEY]
        ) {
          void this.patchQueueRunFromStorage();
          return;
        }
      }
      if (namespace === 'local' && changes[AccountData.ACCOUNT_LISTS_STORAGE_KEY]) {
        void this.refreshUIFromStorage();
      }
    });
  }

  openClearConfirm() {
    const scope = this.getBackupCheckboxes();
    const names = [];
    if (scope.blocks) names.push('blocked users');
    if (scope.mutes) names.push('muted users');
    if (scope.settings) names.push('settings & preferences');
    if (!names.length) {
      this.toast('Select at least one category to reset.', { kind: 'warn' });
      return;
    }
    const handle = this.currentHandle ? `@${this.currentHandle}` : 'this device';
    document.getElementById('clear-modal-text').innerHTML =
      `This permanently clears <b>${names.join(', ')}</b> for ${handle}. Export a backup first if you're not sure.`;
    document.getElementById('clear-confirm-scrim').classList.remove('hidden');
  }

  closeClearConfirm() {
    document.getElementById('clear-confirm-scrim')?.classList.add('hidden');
  }

  closeStorageDebug() {
    document.getElementById('storage-debug-overlay')?.classList.add('hidden');
  }

  async openStorageDebug() {
    const overlay = document.getElementById('storage-debug-overlay');
    const body = document.getElementById('storage-debug-body');
    if (!overlay || !body) return;

    body.innerHTML = '<p class="storage-debug-meta">Loading…</p>';
    overlay.classList.remove('hidden');

    try {
      body.innerHTML = await this.buildStorageDebugHtml();
    } catch (error) {
      console.error('Error loading storage debug:', error);
      body.innerHTML = '<p>Could not load storage.</p>';
    }
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async buildStorageDebugHtml() {
    const [syncAll, localAll] = await Promise.all([
      chrome.storage.sync.get(null),
      chrome.storage.local.get(null)
    ]);

    const accountLists = localAll[AccountData.ACCOUNT_LISTS_STORAGE_KEY] || {};
    const syncSettings = syncAll.settings || {};
    const mergedSettings = await AccountData.loadFromChromeStorage(AccountData.DEFAULT_SETTINGS);

    const userKeys = new Set([
      ...Object.keys(accountLists),
      ...Object.keys(syncSettings.accounts || {}),
      ...Object.keys(mergedSettings.accounts || {})
    ]);
    if (mergedSettings.activeAccount) userKeys.add(mergedSettings.activeAccount);
    if (mergedSettings.detectedAccount) userKeys.add(mergedSettings.detectedAccount);
    if (localAll.loggedInHandle) userKeys.add(localAll.loggedInHandle);

    const sortedUsers = [...userKeys].sort((a, b) => {
      if (a === '_unassigned') return 1;
      if (b === '_unassigned') return -1;
      return a.localeCompare(b);
    });

    const active = mergedSettings.activeAccount || '—';
    let html = `<p class="storage-debug-meta">Active account: <strong>@${this.escapeHtml(active)}</strong> · chrome.storage.sync + local</p>`;

    html += '<div class="storage-debug-section-title">By user</div>';

    if (!sortedUsers.length) {
      html += '<p>No per-user data in storage.</p>';
    } else {
      for (const key of sortedUsers) {
        const account = mergedSettings.accounts?.[key] || accountLists[key] || {};
        const stats = account.stats || {};
        const blocked = stats.blockedUsers || [];
        const muted = stats.mutedUsers || [];
        const isActive = key === mergedSettings.activeAccount;
        const label = key === '_unassigned' ? '_unassigned' : `@${key}`;
        const summary = `${this.escapeHtml(label)}${isActive ? ' (active)' : ''} — blocked ${blocked.length}, muted ${muted.length}`;

        const payload = {
          stats: {
            totalBlocks: stats.totalBlocks ?? blocked.length,
            totalMutes: stats.totalMutes ?? muted.length,
            blockedUsers: blocked,
            mutedUsers: muted
          }
        };

        html += `<details class="storage-debug-user"${isActive ? ' open' : ''}><summary>${summary}</summary><pre>${this.escapeHtml(JSON.stringify(payload, null, 2))}</pre></details>`;
      }
    }

    const syncGlobal = {
      action: syncSettings.action,
      enabledPages: syncSettings.enabledPages,
      showSettingsIcon: syncSettings.showSettingsIcon,
      activeAccount: syncSettings.activeAccount,
      detectedAccount: syncSettings.detectedAccount,
      _migratedToAccounts: syncSettings._migratedToAccounts
    };

    html += '<div class="storage-debug-section-title">Global settings (sync)</div>';
    html += `<pre>${this.escapeHtml(JSON.stringify(syncGlobal, null, 2))}</pre>`;

    const localOther = { ...localAll };
    delete localOther[AccountData.ACCOUNT_LISTS_STORAGE_KEY];
    if (Object.keys(localOther).length) {
      html += '<div class="storage-debug-section-title">Other local storage</div>';
      html += `<pre>${this.escapeHtml(JSON.stringify(localOther, null, 2))}</pre>`;
    }

    const syncOther = { ...syncAll };
    delete syncOther.settings;
    if (Object.keys(syncOther).length) {
      html += '<div class="storage-debug-section-title">Other sync storage</div>';
      html += `<pre>${this.escapeHtml(JSON.stringify(syncOther, null, 2))}</pre>`;
    }

    return html;
  }

  async exportData() {
    try {
      const scope = this.getBackupCheckboxes();
      if (!scope.blocks && !scope.mutes && !scope.settings) {
        this.toast('Select at least one category to export.', { kind: 'warn' });
        return;
      }

      const settings = AccountData.resolveForActiveAccount(
        await this.readStoredSettings(null)
      );

      let exportData = {
        exportDate: new Date().toISOString(),
        activeAccount: (await chrome.storage.sync.get('settings')).settings?.activeAccount
      };

      if (scope.settings) {
        exportData.action = settings.action;
        exportData.enabledPages = settings.enabledPages;
        exportData.showSettingsIcon = settings.showSettingsIcon;
      }

      if (scope.blocks || scope.mutes) {
        exportData.stats = {};
        if (scope.blocks) {
          exportData.stats.totalBlocks = settings.stats?.totalBlocks || 0;
          exportData.stats.blockedUsers = settings.stats?.blockedUsers || [];
        }
        if (scope.mutes) {
          exportData.stats.totalMutes = settings.stats?.totalMutes || 0;
          exportData.stats.mutedUsers = settings.stats?.mutedUsers || [];
        }
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const now = new Date();
      const dateStr = now.toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, -5);

      const exportTypes = [];
      if (scope.blocks) exportTypes.push('blocks');
      if (scope.mutes) exportTypes.push('mutes');
      if (scope.settings) exportTypes.push('settings');
      const typesStr = exportTypes.join('-');

      const a = document.createElement('a');
      a.href = url;
      a.download = `one-click-blocker-${typesStr}-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.toast(`Exported <b>${exportTypes.length}</b> ${exportTypes.length === 1 ? 'category' : 'categories'}`, { kind: 'success' });
    } catch (error) {
      console.error('Error exporting data:', error);
    }
  }

  async importData(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const importedData = JSON.parse(text);

      let settings = await this.readStoredSettings(null);
      const account = AccountData.getAccount(settings, settings.activeAccount);
      const scope = this.getBackupCheckboxes();

      if (scope.settings) {
        settings.action = importedData.action ?? settings.action;
        settings.enabledPages = importedData.enabledPages ?? settings.enabledPages;
        settings.showSettingsIcon = importedData.showSettingsIcon ?? settings.showSettingsIcon;
      }

      account.stats = {
        totalBlocks: scope.blocks ? (importedData.stats?.totalBlocks || 0) : account.stats.totalBlocks,
        totalMutes: scope.mutes ? (importedData.stats?.totalMutes || 0) : account.stats.totalMutes,
        blockedUsers: scope.blocks ? (importedData.stats?.blockedUsers || []) : account.stats.blockedUsers,
        mutedUsers: scope.mutes ? (importedData.stats?.mutedUsers || []) : account.stats.mutedUsers
      };
      settings = AccountData.setAccount(settings, settings.activeAccount, account);
      await this.persistSettings(settings);
      this.toast('Import complete', { kind: 'success' });
    } catch (error) {
      console.error('Error importing data:', error);
      this.toast('Could not import file', { kind: 'danger' });
    }
  }

  async clearData() {
    try {
      let settings = await this.readStoredSettings(this.currentHandle);
      const account = AccountData.getAccount(settings, settings.activeAccount);
      const scope = this.getBackupCheckboxes();

      if (scope.settings) {
        settings.action = AccountData.DEFAULT_SETTINGS.action;
        settings.enabledPages = { ...AccountData.DEFAULT_SETTINGS.enabledPages };
        settings.showSettingsIcon = true;
      }

      account.stats = {
        totalBlocks: scope.blocks ? 0 : account.stats.totalBlocks,
        totalMutes: scope.mutes ? 0 : account.stats.totalMutes,
        blockedUsers: scope.blocks ? [] : account.stats.blockedUsers,
        mutedUsers: scope.mutes ? [] : account.stats.mutedUsers
      };

      settings = AccountData.setAccount(settings, settings.activeAccount, account);

      if (scope.blocks || scope.mutes) {
        const accountLists = await AccountData.readLocalAccountLists();
        const key = settings.activeAccount;
        const existing = accountLists[key] || {};
        accountLists[key] = {
          ...existing,
          stats: {
            ...(existing.stats || {}),
            totalBlocks: account.stats.totalBlocks,
            totalMutes: account.stats.totalMutes,
            blockedUsers: account.stats.blockedUsers,
            mutedUsers: account.stats.mutedUsers
          }
        };
        await AccountData.writeLocalAccountLists(accountLists);
      }

      await this.persistSettings(settings);

      const names = [];
      if (scope.blocks) names.push('blocked users');
      if (scope.mutes) names.push('muted users');
      if (scope.settings) names.push('settings');
      this.toast(`Cleared ${names.join(', ')}`, { kind: 'danger' });
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }
}

const optionsManager = new OptionsManager();

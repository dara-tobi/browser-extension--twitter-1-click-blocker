const DEFAULT_ACCOUNT_DATA = {
  stats: {
    totalBlocks: 0,
    totalMutes: 0,
    blockedUsers: [],
    mutedUsers: []
  },
  toBlockUsers: [],
  toBlockNotFoundUsers: [],
  toBlockTryAgainUsers: [],
  toBlockShowNotFound: true,
  toBlockStagedQueues: [],
  toBlockActiveQueueId: null,
  toBlockActiveQueueLabel: null,
  bulkQueueAction: 'block',
  queueRunHistory: []
};

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
  accounts: {},
  activeAccount: '_unassigned',
  detectedAccount: null,
  _migratedToAccounts: false
};

const RESERVED_PATH_SEGMENTS = new Set([
  'home', 'search', 'explore', 'notifications', 'messages', 'i', 'settings',
  'compose', 'login', 'logout', 'signup', 'intent', 'share', 'hashtag'
]);

function normalizeHandle(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim().replace(/^@/, '');
  const urlMatch = s.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)/i);
  if (urlMatch) s = urlMatch[1];
  if (!/^[A-Za-z0-9_]{1,15}$/.test(s)) return null;
  return s.toLowerCase();
}

function handleFromProfilePath(pathname) {
  const segment = (pathname || '').replace(/^\//, '').split('/')[0];
  if (!segment || RESERVED_PATH_SEGMENTS.has(segment.toLowerCase())) return null;
  return normalizeHandle(segment);
}

function handleFromHref(href) {
  if (!href || !href.startsWith('/')) return null;
  return handleFromProfilePath(href);
}

function findAuthenticatedHandleInObject(obj, depth, seen) {
  if (!obj || typeof obj !== 'object' || depth > 18) return null;
  if (seen.has(obj)) return null;
  seen.add(obj);

  const screenName = obj.screen_name || obj.screenName || obj.legacy?.screen_name;
  const hasId = obj.id_str || obj.rest_id || obj.id || obj.legacy?.id_str;

  if (screenName && hasId) {
    const handle = normalizeHandle(String(screenName));
    if (handle) return handle;
  }

  for (const key of ['viewer', 'user', 'session', 'account', 'authenticated_user']) {
    if (obj[key]) {
      const found = findAuthenticatedHandleInObject(obj[key], depth + 1, seen);
      if (found) return found;
    }
  }

  return null;
}

function detectHandleFromJsonScripts(doc) {
  const scripts = doc.querySelectorAll('script');
  for (const script of scripts) {
    const text = script.textContent;
    if (!text || text.length < 80 || !text.includes('screen_name')) continue;
    if (text.length > 3000000) continue;
    try {
      const data = JSON.parse(text);
      const handle = findAuthenticatedHandleInObject(data, 0, new WeakSet());
      if (handle) return handle;
    } catch (e) {
      // not JSON
    }
  }
  return null;
}

function detectHandleFromLocalStorage(win) {
  try {
    const storage = win.localStorage;
    for (let i = 0; i < storage.length; i++) {
      const val = storage.getItem(storage.key(i));
      if (!val || val.length < 20 || !val.includes('screen_name')) continue;
      try {
        const data = JSON.parse(val);
        const handle = findAuthenticatedHandleInObject(data, 0, new WeakSet());
        if (handle) return handle;
      } catch (e) {
        const match = val.match(/"screen_name":"([A-Za-z0-9_]+)"/);
        if (match) return normalizeHandle(match[1]);
      }
    }
  } catch (e) {
    // storage blocked
  }
  return null;
}

function detectHandleFromNavProfileLink(doc) {
  const navRoots = [
    doc.querySelector('nav[role="navigation"]'),
    doc.querySelector('[data-testid="primaryColumn"]')?.parentElement,
    doc.querySelector('header')
  ].filter(Boolean);

  for (const root of navRoots) {
    for (const link of root.querySelectorAll('a[href^="/"]')) {
      const href = link.getAttribute('href');
      if (!href || href.split('/').filter(Boolean).length !== 1) continue;
      const hasAvatar = link.querySelector('img[src*="profile_images"], img[alt*="profile" i]');
      const label = (link.getAttribute('aria-label') || '').toLowerCase();
      if (hasAvatar || label.includes('profile') || label.includes('account')) {
        const handle = handleFromHref(href);
        if (handle) return handle;
      }
    }
  }
  return null;
}

function detectHandleFromPage(doc) {
  if (!doc) return null;
  const win = doc.defaultView;

  if (doc.querySelector('[data-testid="editProfileButton"]')) {
    const fromPath = handleFromProfilePath(doc.location?.pathname);
    if (fromPath) return fromPath;
  }

  const fromStorage = detectHandleFromLocalStorage(win);
  if (fromStorage) return fromStorage;

  const fromJson = detectHandleFromJsonScripts(doc);
  if (fromJson) return fromJson;

  const switcher = doc.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  if (switcher) {
    const switcherHref =
      switcher.getAttribute('href') ||
      switcher.querySelector('a[href]')?.getAttribute('href');
    const fromSwitcherHref = handleFromHref(switcherHref);
    if (fromSwitcherHref) return fromSwitcherHref;

    const label = switcher.getAttribute('aria-label') || '';
    const labelAt = label.match(/@([A-Za-z0-9_]+)/);
    if (labelAt) return normalizeHandle(labelAt[1]);

    const text = switcher.innerText || switcher.textContent || '';
    const textAt = text.match(/@([A-Za-z0-9_]+)/);
    if (textAt) return normalizeHandle(textAt[1]);
  }

  const fromNav = detectHandleFromNavProfileLink(doc);
  if (fromNav) return fromNav;

  const profileSelectors = [
    'a[data-testid="AppTabBar_Profile_Link"]',
    'a[data-testid="DashboardProfileLink"]'
  ];
  for (const selector of profileSelectors) {
    const link = doc.querySelector(selector);
    const fromHref = handleFromHref(link?.getAttribute('href'));
    if (fromHref) return fromHref;
  }

  const html = doc.documentElement?.innerHTML || '';
  const viewerPatterns = [
    /"viewer":\{[^{}]*"legacy":\{[^{}]*"screen_name":"([A-Za-z0-9_]+)"/,
    /"screen_name":"([A-Za-z0-9_]+)"[^}]*"is_blue_verified"/,
    /"account":{"__typename":"User","legacy":{"screen_name":"([A-Za-z0-9_]+)"/
  ];
  for (const pattern of viewerPatterns) {
    const match = html.match(pattern);
    if (match) return normalizeHandle(match[1]);
  }

  return null;
}

function defaultAccountData() {
  return JSON.parse(JSON.stringify(DEFAULT_ACCOUNT_DATA));
}

function getAccount(settings, accountKey) {
  const key = accountKey || settings?.activeAccount;
  if (!key || !settings?.accounts?.[key]) {
    return defaultAccountData();
  }
  const account = settings.accounts[key];
  return {
    stats: {
      totalBlocks: account.stats?.totalBlocks || 0,
      totalMutes: account.stats?.totalMutes || 0,
      blockedUsers: account.stats?.blockedUsers || [],
      mutedUsers: account.stats?.mutedUsers || []
    },
    toBlockUsers: account.toBlockUsers || [],
    toBlockNotFoundUsers: account.toBlockNotFoundUsers || [],
    toBlockTryAgainUsers: account.toBlockTryAgainUsers || [],
    toBlockShowNotFound: account.toBlockShowNotFound !== false,
    toBlockStagedQueues: account.toBlockStagedQueues || [],
    toBlockActiveQueueId: account.toBlockActiveQueueId || null,
    toBlockActiveQueueLabel: account.toBlockActiveQueueLabel || null,
    bulkQueueAction: account.bulkQueueAction || 'block',
    queueRunHistory: account.queueRunHistory || []
  };
}

function setAccount(settings, accountKey, accountData) {
  if (!accountKey) return settings;
  settings.accounts = settings.accounts || {};
  settings.accounts[accountKey] = {
    stats: accountData.stats || defaultAccountData().stats,
    toBlockUsers: accountData.toBlockUsers || [],
    toBlockNotFoundUsers: accountData.toBlockNotFoundUsers || [],
    toBlockTryAgainUsers: accountData.toBlockTryAgainUsers || [],
    toBlockShowNotFound: accountData.toBlockShowNotFound !== false,
    toBlockStagedQueues: accountData.toBlockStagedQueues || [],
    toBlockActiveQueueId: accountData.toBlockActiveQueueId || null,
    toBlockActiveQueueLabel: accountData.toBlockActiveQueueLabel || null,
    bulkQueueAction: accountData.bulkQueueAction || 'block',
    queueRunHistory: accountData.queueRunHistory || []
  };
  settings.activeAccount = accountKey;
  return settings;
}

function accountHasListData(account) {
  if (!account) return false;
  return !!(
    account.stats?.blockedUsers?.length ||
    account.stats?.mutedUsers?.length ||
    account.toBlockUsers?.length
  );
}

function attachUnassignedToHandle(settings, handle) {
  if (!handle || !settings.accounts?._unassigned) return settings;
  const unassigned = getAccount(settings, '_unassigned');
  if (!accountHasListData(unassigned)) {
    delete settings.accounts._unassigned;
    return settings;
  }
  const existing = settings.accounts[handle]
    ? getAccount(settings, handle)
    : defaultAccountData();
  if (!accountHasListData(existing)) {
    settings.accounts[handle] = unassigned;
  }
  delete settings.accounts._unassigned;
  return settings;
}

function hasLegacyRootListData(settings) {
  if (!settings) return false;
  const stats = settings.stats;
  return !!(
    (stats?.blockedUsers?.length) ||
    (stats?.mutedUsers?.length)
  );
}

function stripLegacyRootListFields(settings) {
  delete settings.stats;
  delete settings.toBlockUsers;
  delete settings.toBlockNotFoundUsers;
  delete settings.toBlockRetryUsers;
  delete settings.toBlockShowNotFound;
  delete settings.bulkQueueAction;
  delete settings.toBlockQueueRunHistory;
}

function migrateSettings(settings, detectedHandle) {
  let migrated = settings ? { ...settings } : {};
  const handle = normalizeHandle(detectedHandle);
  migrated.accounts = migrated.accounts || {};

  if (hasLegacyRootListData(migrated)) {
    const targetKey = handle || migrated.activeAccount || '_unassigned';
    if (!migrated.accounts[targetKey]) {
      migrated.accounts[targetKey] = defaultAccountData();
    }
    const account = migrated.accounts[targetKey];
    if (migrated.stats) {
      account.stats = {
        totalBlocks: migrated.stats.totalBlocks || 0,
        totalMutes: migrated.stats.totalMutes || 0,
        blockedUsers: migrated.stats.blockedUsers || [],
        mutedUsers: migrated.stats.mutedUsers || []
      };
    }
    if (migrated.toBlockUsers?.length) {
      account.toBlockUsers = migrated.toBlockUsers;
    }
    if (migrated.bulkQueueAction) {
      account.bulkQueueAction = migrated.bulkQueueAction;
    }
    stripLegacyRootListFields(migrated);
    migrated.activeAccount = targetKey;
  }

  if (!migrated._migratedToAccounts) {
    migrated._migratedToAccounts = true;
  }

  if (handle) {
    migrated.detectedAccount = handle;
    if (!migrated.accounts[handle]) {
      migrated.accounts[handle] = defaultAccountData();
    }
    migrated = attachUnassignedToHandle(migrated, handle);
    migrated.activeAccount = handle;
  } else if (
    migrated.activeAccount === '_unassigned' &&
    migrated.detectedAccount
  ) {
    migrated = attachUnassignedToHandle(migrated, migrated.detectedAccount);
    migrated.activeAccount = migrated.detectedAccount;
  } else if (!migrated.activeAccount || migrated.activeAccount === '_unassigned') {
    const keys = Object.keys(migrated.accounts).filter((k) => k !== '_unassigned');
    if (keys.length === 1) {
      migrated.activeAccount = keys[0];
    } else if (!migrated.activeAccount) {
      migrated.activeAccount = keys[0] || '_unassigned';
      if (!migrated.accounts[migrated.activeAccount]) {
        migrated.accounts[migrated.activeAccount] = defaultAccountData();
      }
    }
  }

  return migrated;
}

function resolveForActiveAccount(settings) {
  const account = getAccount(settings, settings.activeAccount);
  return {
    ...settings,
    stats: account.stats,
    toBlockUsers: account.toBlockUsers,
    toBlockNotFoundUsers: account.toBlockNotFoundUsers,
    toBlockTryAgainUsers: account.toBlockTryAgainUsers,
    toBlockShowNotFound: account.toBlockShowNotFound,
    toBlockStagedQueues: account.toBlockStagedQueues,
    toBlockActiveQueueId: account.toBlockActiveQueueId,
    toBlockActiveQueueLabel: account.toBlockActiveQueueLabel,
    bulkQueueAction: account.bulkQueueAction,
    queueRunHistory: account.queueRunHistory
  };
}

function mergeUsernameLists(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const raw of list || []) {
      const key = listUsernameKey(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

function updateActiveAccountLists(settings, listsUpdate) {
  const key = settings.activeAccount;
  const account = getAccount(settings, key);
  if (listsUpdate.stats !== undefined) {
    account.stats = listsUpdate.stats;
  }
  if (listsUpdate.toBlockUsers !== undefined) {
    account.toBlockUsers = listsUpdate.toBlockUsers;
  }
  if (listsUpdate.toBlockNotFoundUsers !== undefined) {
    account.toBlockNotFoundUsers = listsUpdate.toBlockNotFoundUsers;
  }
  if (listsUpdate.toBlockTryAgainUsers !== undefined) {
    account.toBlockTryAgainUsers = listsUpdate.toBlockTryAgainUsers;
  }
  if (listsUpdate.toBlockShowNotFound !== undefined) {
    account.toBlockShowNotFound = listsUpdate.toBlockShowNotFound;
  }
  if (listsUpdate.toBlockStagedQueues !== undefined) {
    account.toBlockStagedQueues = listsUpdate.toBlockStagedQueues;
  }
  if (listsUpdate.toBlockActiveQueueId !== undefined) {
    account.toBlockActiveQueueId = listsUpdate.toBlockActiveQueueId;
  }
  if (listsUpdate.toBlockActiveQueueLabel !== undefined) {
    account.toBlockActiveQueueLabel = listsUpdate.toBlockActiveQueueLabel;
  }
  if (listsUpdate.bulkQueueAction !== undefined) {
    account.bulkQueueAction = listsUpdate.bulkQueueAction;
  }
  if (listsUpdate.queueRunHistory !== undefined) {
    account.queueRunHistory = listsUpdate.queueRunHistory;
  }
  return setAccount(settings, key, account);
}

function reassignAccountData(settings, newHandleRaw) {
  const newKey = normalizeHandle(newHandleRaw);
  if (!newKey) return { settings, error: 'Invalid handle' };

  const oldKey = settings.activeAccount;
  if (!oldKey || oldKey === newKey) {
    settings.accounts = settings.accounts || {};
    if (!settings.accounts[newKey]) {
      settings.accounts[newKey] = defaultAccountData();
    }
    settings.activeAccount = newKey;
    return { settings, error: null };
  }

  settings.accounts = settings.accounts || {};
  const oldData = getAccount(settings, oldKey);
  const existingNew = settings.accounts[newKey]
    ? getAccount(settings, newKey)
    : defaultAccountData();

  const mergeUsers = (a, b) => {
    const seen = new Set();
    const out = [];
    for (const u of [...a, ...b]) {
      const key = u.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(u);
      }
    }
    return out;
  };

  settings.accounts[newKey] = {
    stats: {
      totalBlocks: 0,
      totalMutes: 0,
      blockedUsers: mergeLedgerUsers(oldData.stats.blockedUsers, existingNew.stats.blockedUsers),
      mutedUsers: mergeLedgerUsers(oldData.stats.mutedUsers, existingNew.stats.mutedUsers)
    },
    toBlockUsers: mergeUsers(oldData.toBlockUsers, existingNew.toBlockUsers),
    toBlockNotFoundUsers: mergeUsers(oldData.toBlockNotFoundUsers, existingNew.toBlockNotFoundUsers),
    toBlockTryAgainUsers: mergeUsers(oldData.toBlockTryAgainUsers, existingNew.toBlockTryAgainUsers),
    toBlockShowNotFound: oldData.toBlockShowNotFound,
    bulkQueueAction: oldData.bulkQueueAction || existingNew.bulkQueueAction,
    queueRunHistory: [...(existingNew.queueRunHistory || []), ...(oldData.queueRunHistory || [])]
  };
  settings.accounts[newKey].stats.totalBlocks = settings.accounts[newKey].stats.blockedUsers.length;
  settings.accounts[newKey].stats.totalMutes = settings.accounts[newKey].stats.mutedUsers.length;

  if (oldKey !== newKey) {
    delete settings.accounts[oldKey];
  }
  settings.activeAccount = newKey;
  return { settings, error: null };
}

const ACCOUNT_LISTS_STORAGE_KEY = 'accountLists';

function extractAccountListsFromSettings(settings) {
  const accountLists = {};
  for (const key of Object.keys(settings.accounts || {})) {
    const account = settings.accounts[key];
    accountLists[key] = {
      stats: {
        totalBlocks: account.stats?.totalBlocks || 0,
        totalMutes: account.stats?.totalMutes || 0,
        blockedUsers: account.stats?.blockedUsers || [],
        mutedUsers: account.stats?.mutedUsers || []
      },
      toBlockUsers: account.toBlockUsers || [],
      toBlockNotFoundUsers: account.toBlockNotFoundUsers || [],
      toBlockTryAgainUsers: account.toBlockTryAgainUsers || [],
      toBlockShowNotFound: account.toBlockShowNotFound !== false,
      toBlockStagedQueues: account.toBlockStagedQueues || [],
      toBlockActiveQueueId: account.toBlockActiveQueueId || null,
      toBlockActiveQueueLabel: account.toBlockActiveQueueLabel || null,
      bulkQueueAction: account.bulkQueueAction || 'block',
      queueRunHistory: account.queueRunHistory || []
    };
  }
  return accountLists;
}

function slimAccountsForSync(settings) {
  const out = { ...settings, accounts: {} };
  for (const [key, account] of Object.entries(settings.accounts || {})) {
    const blockedUsers = account.stats?.blockedUsers || [];
    const mutedUsers = account.stats?.mutedUsers || [];
    out.accounts[key] = {
      stats: {
        totalBlocks: account.stats?.totalBlocks ?? blockedUsers.length,
        totalMutes: account.stats?.totalMutes ?? mutedUsers.length,
        blockedUsers: [],
        mutedUsers: []
      },
      toBlockUsers: [],
      bulkQueueAction: account.bulkQueueAction || 'block'
    };
  }
  return out;
}

function mergeAccountListsFromStorageRecord(account) {
  const stats = account?.stats || {};
  return {
    stats: {
      totalBlocks: stats.totalBlocks || 0,
      totalMutes: stats.totalMutes || 0,
      blockedUsers: stats.blockedUsers || [],
      mutedUsers: stats.mutedUsers || []
    },
    toBlockUsers: account.toBlockUsers || [],
    toBlockNotFoundUsers: account.toBlockNotFoundUsers || [],
    toBlockTryAgainUsers: account.toBlockTryAgainUsers || [],
    toBlockShowNotFound: account.toBlockShowNotFound !== false,
    toBlockStagedQueues: account.toBlockStagedQueues || [],
    toBlockActiveQueueId: account.toBlockActiveQueueId || null,
    toBlockActiveQueueLabel: account.toBlockActiveQueueLabel || null,
    bulkQueueAction: account.bulkQueueAction || 'block',
    queueRunHistory: account.queueRunHistory || []
  };
}

function mergeAccountListStorageRecords(existing, incoming) {
  const ex = mergeAccountListsFromStorageRecord(existing);
  const inc = mergeAccountListsFromStorageRecord(incoming);
  return {
    stats: {
      totalBlocks: Math.max(inc.stats.totalBlocks, ex.stats.totalBlocks),
      totalMutes: Math.max(inc.stats.totalMutes, ex.stats.totalMutes),
      blockedUsers:
        inc.stats.blockedUsers.length >= ex.stats.blockedUsers.length
          ? inc.stats.blockedUsers
          : ex.stats.blockedUsers,
      mutedUsers:
        inc.stats.mutedUsers.length >= ex.stats.mutedUsers.length
          ? inc.stats.mutedUsers
          : ex.stats.mutedUsers
    },
    toBlockUsers: inc.toBlockUsers,
    toBlockNotFoundUsers:
      inc.toBlockNotFoundUsers.length >= ex.toBlockNotFoundUsers.length
        ? inc.toBlockNotFoundUsers
        : ex.toBlockNotFoundUsers,
    toBlockTryAgainUsers:
      inc.toBlockTryAgainUsers.length >= ex.toBlockTryAgainUsers.length
        ? inc.toBlockTryAgainUsers
        : ex.toBlockTryAgainUsers,
    toBlockShowNotFound: inc.toBlockShowNotFound,
    toBlockStagedQueues: inc.toBlockStagedQueues,
    toBlockActiveQueueId: inc.toBlockActiveQueueId ?? ex.toBlockActiveQueueId,
    toBlockActiveQueueLabel: inc.toBlockActiveQueueLabel ?? ex.toBlockActiveQueueLabel,
    bulkQueueAction: inc.bulkQueueAction || ex.bulkQueueAction,
    queueRunHistory:
      inc.queueRunHistory.length >= ex.queueRunHistory.length
        ? inc.queueRunHistory
        : ex.queueRunHistory
  };
}

function mergeStoredAccountLists(existing, extracted) {
  const prev = existing || {};
  const next = extracted || {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const out = {};
  for (const key of keys) {
    out[key] = mergeAccountListStorageRecords(prev[key], next[key]);
  }
  return out;
}

function mergeAccountListsIntoSettings(settings, accountLists) {
  if (!accountLists) return settings;
  settings.accounts = settings.accounts || {};
  for (const key of Object.keys(accountLists)) {
    settings.accounts[key] = mergeAccountListsFromStorageRecord(accountLists[key]);
  }
  return settings;
}

function applySaveSafetyMerge(prev, merged) {
  const previous = prev || {};
  const out = { ...merged };
  for (const key of Object.keys(merged)) {
    const p = mergeAccountListsFromStorageRecord(previous[key]);
    const m = mergeAccountListsFromStorageRecord(merged[key]);
    let safe = m;
    if (p.stats.blockedUsers.length && !m.stats.blockedUsers.length) {
      safe = {
        ...safe,
        stats: {
          ...safe.stats,
          blockedUsers: p.stats.blockedUsers,
          totalBlocks: Math.max(safe.stats.totalBlocks, p.stats.totalBlocks)
        }
      };
    }
    if (p.stats.mutedUsers.length && !m.stats.mutedUsers.length) {
      safe = {
        ...safe,
        stats: {
          ...safe.stats,
          mutedUsers: p.stats.mutedUsers,
          totalMutes: Math.max(safe.stats.totalMutes, p.stats.totalMutes)
        }
      };
    }
    if (p.queueRunHistory.length && !m.queueRunHistory.length) {
      safe = { ...safe, queueRunHistory: p.queueRunHistory };
    }
    out[key] = safe;
  }
  return out;
}

async function readLocalAccountLists() {
  const localResult = await chrome.storage.local.get(ACCOUNT_LISTS_STORAGE_KEY);
  return localResult[ACCOUNT_LISTS_STORAGE_KEY] || {};
}

async function writeLocalAccountLists(accountLists) {
  await chrome.storage.local.set({ [ACCOUNT_LISTS_STORAGE_KEY]: accountLists });
}

async function patchLocalAccountList(accountKey, patch) {
  const key = normalizeHandle(accountKey);
  if (!key || !patch) return null;
  const accountLists = await readLocalAccountLists();
  const base = mergeAccountListsFromStorageRecord(accountLists[key]);
  const next = mergeAccountListsFromStorageRecord({ ...base, ...patch });
  if (patch.stats) {
    const inc = mergeAccountListsFromStorageRecord({ stats: patch.stats });
    next.stats = mergeAccountListStorageRecords({ stats: base.stats }, { stats: inc.stats }).stats;
  }
  accountLists[key] = next;
  await writeLocalAccountLists(accountLists);
  return next;
}

async function appendQueueRunHistoryLocal(accountKey, record, limit = 50) {
  const key = normalizeHandle(accountKey);
  if (!key || !record) return null;
  const accountLists = await readLocalAccountLists();
  const base = mergeAccountListsFromStorageRecord(accountLists[key]);
  const history = [record, ...(base.queueRunHistory || [])].slice(0, limit);
  accountLists[key] = { ...base, queueRunHistory: history };
  await writeLocalAccountLists(accountLists);
  return accountLists[key];
}

async function getLocalAccountRecord(accountKey) {
  const key = normalizeHandle(accountKey);
  if (!key) return null;
  const accountLists = await readLocalAccountLists();
  return mergeAccountListsFromStorageRecord(accountLists[key]);
}

function hasAnyListDataInAccounts(settings) {
  if (hasLegacyRootListData(settings)) return true;
  for (const account of Object.values(settings.accounts || {})) {
    if (
      account.stats?.blockedUsers?.length ||
      account.stats?.mutedUsers?.length ||
      account.toBlockUsers?.length
    ) {
      return true;
    }
  }
  return false;
}

async function loadFromChromeStorage(defaultSettings) {
  const syncResult = await chrome.storage.sync.get('settings');
  const localResult = await chrome.storage.local.get(ACCOUNT_LISTS_STORAGE_KEY);
  let settings = migrateSettings(syncResult.settings || defaultSettings, null);
  const accountLists = localResult[ACCOUNT_LISTS_STORAGE_KEY];
  if (accountLists && Object.keys(accountLists).length) {
    settings = mergeAccountListsIntoSettings(settings, accountLists);
  } else if (hasAnyListDataInAccounts(settings)) {
    const extracted = extractAccountListsFromSettings(settings);
    await chrome.storage.local.set({ [ACCOUNT_LISTS_STORAGE_KEY]: extracted });
    const slim = slimAccountsForSync(settings);
    await chrome.storage.sync.set({ settings: slim });
    settings = mergeAccountListsIntoSettings(slim, extracted);
  }
  return settings;
}

async function saveToChromeStorage(settings) {
  const extracted = extractAccountListsFromSettings(settings);
  const prev = await readLocalAccountLists();
  let accountLists = mergeStoredAccountLists(prev, extracted);
  accountLists = applySaveSafetyMerge(prev, accountLists);
  const slim = slimAccountsForSync(settings);
  await writeLocalAccountLists(accountLists);
  await chrome.storage.sync.set({ settings: slim });
}

function listUsernameKey(raw) {
  if (raw && typeof raw === 'object') {
    const fromEntry = normalizeHandle(raw.handle);
    if (fromEntry) return fromEntry;
    const s = String(raw.handle || '').trim().replace(/^@/, '').toLowerCase();
    return s || null;
  }
  const fromHandle = normalizeHandle(raw);
  if (fromHandle) return fromHandle;
  const s = String(raw).trim().replace(/^@/, '').toLowerCase();
  return s || null;
}

function listUserAt(raw) {
  if (raw && typeof raw === 'object' && typeof raw.at === 'number') return raw.at;
  return null;
}

function mergeLedgerUsers(a, b) {
  const byKey = new Map();
  const order = [];
  for (const u of [...(a || []), ...(b || [])]) {
    const key = listUsernameKey(u);
    if (!key) continue;
    if (!byKey.has(key)) order.push(key);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, u);
      continue;
    }
    const prevAt = listUserAt(prev);
    const nextAt = listUserAt(u);
    if (nextAt != null && (prevAt == null || nextAt >= prevAt)) {
      byKey.set(key, u);
    }
  }
  return order.map((key) => byKey.get(key));
}

function isOnBlockedOrMutedList(username, stats, queueAction = 'block') {
  const key = listUsernameKey(username);
  if (!key) return false;
  const blocked = stats?.blockedUsers || [];
  if (blocked.some((u) => listUsernameKey(u) === key)) return true;
  if (queueAction === 'mute') {
    const muted = stats?.mutedUsers || [];
    if (muted.some((u) => listUsernameKey(u) === key)) return true;
  }
  return false;
}

function filterToBlockQueue(queue, stats, queueAction = 'block') {
  if (!queue?.length) return [];
  return queue.filter((u) => !isOnBlockedOrMutedList(u, stats, queueAction));
}

function isToBlockNotFoundTagged(username, notFoundList) {
  const key = listUsernameKey(username);
  if (!key) return false;
  return (notFoundList || []).some((u) => listUsernameKey(u) === key);
}

function addToBlockNotFoundTag(notFoundList, username) {
  const key = listUsernameKey(username);
  if (!key) return notFoundList || [];
  const list = [...(notFoundList || [])];
  if (list.some((u) => listUsernameKey(u) === key)) return list;
  list.push(key);
  return list;
}

function removeToBlockNotFoundTag(notFoundList, username) {
  const key = listUsernameKey(username);
  if (!key) return notFoundList || [];
  return (notFoundList || []).filter((u) => listUsernameKey(u) !== key);
}

function addToBlockTryAgainTag(tryAgainList, username) {
  const key = listUsernameKey(username);
  if (!key) return tryAgainList || [];
  const list = [...(tryAgainList || [])];
  if (list.some((u) => listUsernameKey(u) === key)) return list;
  list.push(key);
  return list;
}

function removeToBlockTryAgainTag(tryAgainList, username) {
  const key = listUsernameKey(username);
  if (!key) return tryAgainList || [];
  return (tryAgainList || []).filter((u) => listUsernameKey(u) !== key);
}

function moveToBlockUserToQueueEnd(queue, username) {
  const key = listUsernameKey(username);
  if (!key) return queue || [];
  const match = (queue || []).find((u) => listUsernameKey(u) === key);
  const rest = (queue || []).filter((u) => listUsernameKey(u) !== key);
  if (!match) return queue || [];
  rest.push(match);
  return rest;
}

function filterUsernamesForToBlockQueue(usernames, stats, queueAction = 'block') {
  if (!usernames?.length) return [];
  const seen = new Set();
  const out = [];
  for (const u of usernames) {
    const key = String(u).toLowerCase();
    if (seen.has(key) || isOnBlockedOrMutedList(u, stats, queueAction)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

function switchActiveAccount(settings, handle) {
  const key = normalizeHandle(handle);
  if (!key) return settings;
  settings.detectedAccount = key;
  settings.activeAccount = key;
  settings.accounts = settings.accounts || {};
  if (!settings.accounts[key]) {
    settings.accounts[key] = defaultAccountData();
  }
  return attachUnassignedToHandle(settings, key);
}

const AccountData = {
  DEFAULT_ACCOUNT_DATA,
  DEFAULT_SETTINGS,
  normalizeHandle,
  detectHandleFromPage,
  defaultAccountData,
  getAccount,
  setAccount,
  migrateSettings,
  resolveForActiveAccount,
  updateActiveAccountLists,
  reassignAccountData,
  hasLegacyRootListData,
  attachUnassignedToHandle,
  accountHasListData,
  ACCOUNT_LISTS_STORAGE_KEY,
  loadFromChromeStorage,
  saveToChromeStorage,
  switchActiveAccount,
  filterToBlockQueue,
  filterUsernamesForToBlockQueue,
  isOnBlockedOrMutedList,
  listUsernameKey,
  listUserAt,
  mergeLedgerUsers,
  isToBlockNotFoundTagged,
  addToBlockNotFoundTag,
  removeToBlockNotFoundTag,
  addToBlockTryAgainTag,
  removeToBlockTryAgainTag,
  moveToBlockUserToQueueEnd,
  mergeUsernameLists,
  mergeStoredAccountLists,
  mergeAccountListStorageRecords,
  readLocalAccountLists,
  writeLocalAccountLists,
  patchLocalAccountList,
  appendQueueRunHistoryLocal,
  getLocalAccountRecord
};

if (typeof window !== 'undefined') {
  window.AccountData = AccountData;
}

if (typeof self !== 'undefined' && typeof importScripts === 'function') {
  self.AccountData = AccountData;
}

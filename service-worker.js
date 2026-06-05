importScripts('account-data.js');

// chrome.runtime.setUninstallURL('https://docs.google.com/forms/d/15hOeb2GIHZXcwa8HeiVIIEAqe8gntzGyYLZS5XXTZSE');

const QUEUE_STORAGE_KEYS = [
  'toBlockQueueRunning',
  'toBlockQueueAction',
  'toBlockQueueRunStats',
  'toBlockQueueRunTotal',
  'toBlockQueueCurrentHandle',
  'toBlockQueueCurrentTabId',
  'toBlockQueueCurrentRunId',
  'toBlockQueueRunStartedAt',
  'queueTabStartedAt'
];

const QUEUE_RUN_HISTORY_LIMIT = 50;
const QUEUE_TAB_TIMEOUT_MS = 10000;
const QUEUE_OPEN_NEXT_DELAY_MS = 1500;

function emptyQueueRunStats() {
  return { blocked: 0, muted: 0, notFound: 0, alreadyBlocked: 0, alreadyMuted: 0 };
}

async function clearQueueRuntimeState() {
  await chrome.storage.local.remove(QUEUE_STORAGE_KEYS);
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void clearQueueRuntimeState();
  }
});

chrome.runtime.onStartup.addListener(() => {
  void clearQueueRuntimeState();
});

async function resolveQueueAccountHandle(explicitHandle) {
  const normalized = AccountData.normalizeHandle(explicitHandle);
  if (normalized) return normalized;
  const { loggedInHandle } = await chrome.storage.local.get('loggedInHandle');
  return AccountData.normalizeHandle(loggedInHandle);
}

async function loadMigratedSettings(detectedHandle, persist = false) {
  const handle = await resolveQueueAccountHandle(detectedHandle);
  let settings = await AccountData.loadFromChromeStorage(AccountData.DEFAULT_SETTINGS);
  settings = AccountData.migrateSettings(settings, handle);
  if (handle) {
    settings = AccountData.switchActiveAccount(settings, handle);
  }
  if (persist) {
    await AccountData.saveToChromeStorage(settings);
  }
  return settings;
}

function getActiveAccountLists(settings) {
  return AccountData.getAccount(settings, settings.activeAccount);
}

async function loadActiveQueueAccount() {
  const handle = await resolveQueueAccountHandle();
  if (!handle) return { handle: null, account: null };
  const account = await AccountData.getLocalAccountRecord(handle);
  return { handle, account: account || AccountData.defaultAccountData() };
}

let isAdvancingQueue = false;
let queueGeneration = 0;
let pendingOpenNextTimeout = null;
let currentRunStats = null;
let queueTabTimeout = null;

function clearQueueTabTimeout() {
  if (queueTabTimeout) {
    clearTimeout(queueTabTimeout);
    queueTabTimeout = null;
  }
}

function scheduleQueueTabTimeout(expectedGen) {
  clearQueueTabTimeout();
  queueTabTimeout = setTimeout(() => {
    queueTabTimeout = null;
    void handleQueueTabStall(expectedGen);
  }, QUEUE_TAB_TIMEOUT_MS);
}

function clearPendingOpenNext() {
  if (pendingOpenNextTimeout) {
    clearTimeout(pendingOpenNextTimeout);
    pendingOpenNextTimeout = null;
  }
}

function scheduleOpenNext() {
  clearPendingOpenNext();
  const gen = queueGeneration;
  pendingOpenNextTimeout = setTimeout(() => {
    pendingOpenNextTimeout = null;
    void openNextInToBlockQueue(gen);
  }, QUEUE_OPEN_NEXT_DELAY_MS);
}

async function flushRunStatsNow() {
  if (currentRunStats) {
    await chrome.storage.local.set({ toBlockQueueRunStats: currentRunStats });
  }
}

function emitToBlockQueueEvent(eventType, username) {
  if (!eventType || !username) return;
  const normalized = AccountData.listUsernameKey(username) || username;
  chrome.runtime
    .sendMessage({
      type: 'to_block_queue_feedback',
      eventType,
      username: normalized
    })
    .catch(() => {});
}

async function isQueueRunningInStorage() {
  const { toBlockQueueRunning } = await chrome.storage.local.get('toBlockQueueRunning');
  return !!toBlockQueueRunning;
}

async function getQueueTabPointer() {
  const data = await chrome.storage.local.get([
    'toBlockQueueCurrentTabId',
    'toBlockQueueCurrentHandle'
  ]);
  return {
    tabId: data.toBlockQueueCurrentTabId ?? null,
    username: data.toBlockQueueCurrentHandle ?? null
  };
}

async function setQueueTabPointer(tabId, username) {
  const payload = {
    toBlockQueueCurrentTabId: tabId,
    toBlockQueueCurrentHandle: username,
    queueTabStartedAt: Date.now()
  };
  if (currentRunStats) {
    payload.toBlockQueueRunStats = currentRunStats;
  }
  await chrome.storage.local.set(payload);
  scheduleQueueTabTimeout(queueGeneration);
}

async function clearQueueTabPointer() {
  clearQueueTabTimeout();
  await chrome.storage.local.remove([
    'toBlockQueueCurrentTabId',
    'toBlockQueueCurrentHandle',
    'queueTabStartedAt'
  ]);
}

async function isQueueSenderTab(tabId) {
  if (!tabId) return false;
  const { tabId: storedTabId } = await getQueueTabPointer();
  return storedTabId === tabId;
}

async function getQueueRunSnapshot() {
  const data = await chrome.storage.local.get([
    'toBlockQueueRunStats',
    'toBlockQueueRunTotal',
    'toBlockQueueAction',
    'toBlockQueueRunStartedAt',
    'toBlockQueueCurrentRunId'
  ]);
  return {
    stats: currentRunStats
      ? { ...emptyQueueRunStats(), ...currentRunStats }
      : { ...emptyQueueRunStats(), ...(data.toBlockQueueRunStats || {}) },
    total: data.toBlockQueueRunTotal || 0,
    action: data.toBlockQueueAction || 'block',
    startedAt: data.toBlockQueueRunStartedAt || null,
    runId: data.toBlockQueueCurrentRunId || null
  };
}

async function resetQueueRunStats(total, queueAction) {
  const runId = String(Date.now());
  currentRunStats = emptyQueueRunStats();
  await chrome.storage.local.set({
    toBlockQueueRunStats: currentRunStats,
    toBlockQueueRunTotal: total || 0,
    toBlockQueueCurrentHandle: null,
    toBlockQueueAction: queueAction || 'block',
    toBlockQueueRunStartedAt: new Date().toISOString(),
    toBlockQueueCurrentRunId: runId
  });
}

async function clearQueueRunStats() {
  await chrome.storage.local.remove([
    'toBlockQueueRunStats',
    'toBlockQueueRunTotal',
    'toBlockQueueRunStartedAt',
    'toBlockQueueCurrentRunId'
  ]);
  await clearQueueTabPointer();
}

async function incrementQueueRunStat(field) {
  if (!currentRunStats) {
    const { toBlockQueueRunStats } = await chrome.storage.local.get('toBlockQueueRunStats');
    currentRunStats = { ...emptyQueueRunStats(), ...(toBlockQueueRunStats || {}) };
  }
  currentRunStats[field] = (currentRunStats[field] || 0) + 1;
  await flushRunStatsNow();
}

async function finalizeQueueRun(runStatus) {
  await flushRunStatsNow();
  const snap = await getQueueRunSnapshot();
  if (!snap.startedAt) return;

  const record = {
    id: snap.runId || String(Date.now()),
    action: snap.action,
    status: runStatus || 'completed',
    startedAt: snap.startedAt,
    stoppedAt: new Date().toISOString(),
    total: snap.total,
    blocked: snap.stats.blocked || 0,
    muted: snap.stats.muted || 0,
    notFound: snap.stats.notFound || 0,
    alreadyBlocked: snap.stats.alreadyBlocked || 0,
    alreadyMuted: snap.stats.alreadyMuted || 0
  };

  const handle = await resolveQueueAccountHandle();
  if (!handle) return;
  await AccountData.appendQueueRunHistoryLocal(handle, record, QUEUE_RUN_HISTORY_LIMIT);
}

async function getQueueRunBatchSet() {
  const { toBlockQueueRunBatch } = await chrome.storage.local.get('toBlockQueueRunBatch');
  if (!toBlockQueueRunBatch?.length) return null;
  return new Set(toBlockQueueRunBatch.map((u) => String(u).toLowerCase()));
}

async function clearQueueRunBatch() {
  await chrome.storage.local.remove('toBlockQueueRunBatch');
}

function findNextQueueUserForRun(account, batchSet) {
  const queue = account?.toBlockUsers || [];
  const notFound = account?.toBlockNotFoundUsers || [];
  for (const username of queue) {
    const key = (AccountData.listUsernameKey(username) || username).toLowerCase();
    if (batchSet && !batchSet.has(key)) continue;
    if (AccountData.isToBlockNotFoundTagged(username, notFound)) continue;
    return username;
  }
  return null;
}

async function setQueueRunning(running, queueAction, opts = {}) {
  if (!running) {
    queueGeneration++;
    clearQueueTabTimeout();
    clearPendingOpenNext();
    await clearQueueTabPointer();
    if (!opts.skipFinalize) {
      await finalizeQueueRun(opts.runStatus || 'completed');
    }
    await clearQueueRunBatch();
    await chrome.storage.local.remove('toBlockQueueHeldUsers');
    await chrome.storage.local.set({
      toBlockQueueRunning: false,
      toBlockQueueAction: null
    });
    await clearQueueRunStats();
    currentRunStats = null;
    return;
  }
  queueGeneration++;
  clearQueueTabTimeout();
  clearPendingOpenNext();
  await chrome.storage.local.set({
    toBlockQueueRunning: true,
    toBlockQueueAction: queueAction || 'block'
  });
}

async function requeueForTryAgain(username) {
  const { handle, account } = await loadActiveQueueAccount();
  if (!handle || !account) return;
  const queue = AccountData.moveToBlockUserToQueueEnd(account.toBlockUsers || [], username);
  await AccountData.patchLocalAccountList(handle, {
    toBlockUsers: queue,
    toBlockTryAgainUsers: AccountData.addToBlockTryAgainTag(
      account.toBlockTryAgainUsers,
      username
    ),
    toBlockNotFoundUsers: AccountData.removeToBlockNotFoundTag(
      account.toBlockNotFoundUsers,
      username
    )
  });
}

async function handleQueueTabStall(expectedGen) {
  if (expectedGen !== queueGeneration) return;
  if (!(await isQueueRunningInStorage())) return;
  if (isAdvancingQueue) return;

  const { tabId, username } = await getQueueTabPointer();
  if (!username) return;

  isAdvancingQueue = true;
  try {
    await requeueForTryAgain(username);
    await clearQueueTabPointer();
    if (tabId) {
      try {
        await chrome.tabs.remove(tabId);
      } catch (e) {
        // tab may already be closed
      }
    }
    if (!(await isQueueRunningInStorage())) return;
    scheduleOpenNext();
  } finally {
    isAdvancingQueue = false;
  }
}

function getBulkQueueAction(accountOrSettings) {
  return accountOrSettings?.bulkQueueAction === 'mute' ? 'mute' : 'block';
}

async function skipAlreadyActionedQueueHead() {
  const { handle, account: initial } = await loadActiveQueueAccount();
  if (!handle || !initial) return null;
  let account = initial;
  const queueAction = getBulkQueueAction(account);
  const batchSet = await getQueueRunBatchSet();
  const skipped = [];
  let next;
  while ((next = findNextQueueUserForRun(account, batchSet))) {
    if (!AccountData.isOnBlockedOrMutedList(next, account.stats, queueAction)) break;
    skipped.push(next);
    account = {
      ...account,
      toBlockUsers: (account.toBlockUsers || []).filter(
        (u) => u.toLowerCase() !== next.toLowerCase()
      ),
      toBlockNotFoundUsers: AccountData.removeToBlockNotFoundTag(
        account.toBlockNotFoundUsers,
        next
      )
    };
  }
  if (!skipped.length) return account;
  for (const user of skipped) {
    await incrementQueueRunStat(queueAction === 'mute' ? 'alreadyMuted' : 'alreadyBlocked');
    emitToBlockQueueEvent(
      queueAction === 'mute' ? 'already_muted' : 'already_blocked',
      user
    );
  }
  await AccountData.patchLocalAccountList(handle, {
    toBlockUsers: account.toBlockUsers,
    toBlockNotFoundUsers: account.toBlockNotFoundUsers
  });
  return account;
}

async function openNextInToBlockQueue(expectedGen) {
  if (expectedGen !== undefined && expectedGen !== queueGeneration) return;
  if (!(await isQueueRunningInStorage())) return;

  const account = await skipAlreadyActionedQueueHead();
  if (expectedGen !== undefined && expectedGen !== queueGeneration) return;
  if (!(await isQueueRunningInStorage())) return;

  const active = account || (await loadActiveQueueAccount()).account;
  if (!active) return;
  const queueAction = getBulkQueueAction(active);
  const batchSet = await getQueueRunBatchSet();
  const username = findNextQueueUserForRun(active, batchSet);
  if (!username) {
    await setQueueRunning(false, null, { runStatus: 'completed' });
    return;
  }

  if (expectedGen !== undefined && expectedGen !== queueGeneration) return;
  if (!(await isQueueRunningInStorage())) return;

  const url = `https://x.com/${username}?${queueAction}=true&queueblock=1`;
  const tab = await chrome.tabs.create({
    url,
    active: false,
  });
  await setQueueTabPointer(tab.id, username);
}

async function advanceToBlockQueue(completedUsername, options = {}) {
  if (isAdvancingQueue) return;
  isAdvancingQueue = true;
  try {
    if (!(await isQueueRunningInStorage())) return;

    if (options.notFound) {
      await incrementQueueRunStat('notFound');
      emitToBlockQueueEvent('not_found', completedUsername);
    } else if (options.alreadyBlocked) {
      await incrementQueueRunStat('alreadyBlocked');
      emitToBlockQueueEvent('already_blocked', completedUsername);
    } else if (options.alreadyMuted) {
      await incrementQueueRunStat('alreadyMuted');
      emitToBlockQueueEvent('already_muted', completedUsername);
    } else if (completedUsername && !options.keepInQueue) {
      const { account } = await loadActiveQueueAccount();
      const queueAction = getBulkQueueAction(account);
      await incrementQueueRunStat(queueAction === 'mute' ? 'muted' : 'blocked');
      emitToBlockQueueEvent(queueAction === 'mute' ? 'muted' : 'blocked', completedUsername);
    }

    if (completedUsername) {
      const { handle, account } = await loadActiveQueueAccount();
      if (!handle || !account) return;
      const listsUpdate = {};
      if (!options.keepInQueue) {
        listsUpdate.toBlockUsers = (account.toBlockUsers || []).filter(
          (u) => u.toLowerCase() !== completedUsername.toLowerCase()
        );
        listsUpdate.toBlockNotFoundUsers = AccountData.removeToBlockNotFoundTag(
          account.toBlockNotFoundUsers,
          completedUsername
        );
        listsUpdate.toBlockTryAgainUsers = AccountData.removeToBlockTryAgainTag(
          account.toBlockTryAgainUsers,
          completedUsername
        );
      } else if (options.notFound) {
        listsUpdate.toBlockNotFoundUsers = AccountData.addToBlockNotFoundTag(
          account.toBlockNotFoundUsers,
          completedUsername
        );
      }
      if (Object.keys(listsUpdate).length) {
        await AccountData.patchLocalAccountList(handle, listsUpdate);
      }
    }

    const { tabId } = await getQueueTabPointer();
    if (tabId) {
      try {
        await chrome.tabs.remove(tabId);
      } catch (e) {
        // tab may already be closed
      }
    }
    await clearQueueTabPointer();

    if (!(await isQueueRunningInStorage())) return;

    const { account } = await loadActiveQueueAccount();
    const batchSet = await getQueueRunBatchSet();
    if (!findNextQueueUserForRun(account, batchSet)) {
      await setQueueRunning(false, null, { runStatus: 'completed' });
      return;
    }

    scheduleOpenNext();
  } finally {
    isAdvancingQueue = false;
  }
}

async function startToBlockQueue() {
  const { account } = await loadActiveQueueAccount();
  const queue = account.toBlockUsers || [];
  if (!queue.length) return;

  const queueAction = getBulkQueueAction(account);
  const batchSet = await getQueueRunBatchSet();
  const pending = queue.filter((u) => {
    const key = (AccountData.listUsernameKey(u) || u).toLowerCase();
    if (batchSet && !batchSet.has(key)) return false;
    return !AccountData.isToBlockNotFoundTagged(u, account.toBlockNotFoundUsers);
  });
  await resetQueueRunStats(pending.length, queueAction);
  await setQueueRunning(true, queueAction);
  const { tabId } = await getQueueTabPointer();
  if (tabId) {
    try {
      await chrome.tabs.remove(tabId);
    } catch (e) {
      // ignore
    }
    await clearQueueTabPointer();
  }
  await openNextInToBlockQueue();
}

async function stopToBlockQueue() {
  clearQueueTabTimeout();
  const { tabId } = await getQueueTabPointer();
  await setQueueRunning(false, null, { runStatus: 'stopped' });
  if (tabId) {
    try {
      await chrome.tabs.remove(tabId);
    } catch (e) {
      // ignore
    }
  }
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'start_to_block_queue') {
    if (!message.selectedOnly) {
      await clearQueueRunBatch();
      await chrome.storage.local.remove('toBlockQueueHeldUsers');
    }
    await startToBlockQueue();
    return;
  }

  if (message.type === 'stop_to_block_queue') {
    await stopToBlockQueue();
    return;
  }

  if (message.type == 'feedback' && message.data) {
    if (message.data === 'something_went_wrong') {
      if (
        await isQueueRunningInStorage() &&
        await isQueueSenderTab(sender.tab?.id)
      ) {
        const { username } = await getQueueTabPointer();
        if (username) {
          await advanceToBlockQueue(username);
        }
      }

      closeTab(sender.tab.id);

      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: 'something_went_wrong' },
          function (response) {
            // console.log('something went wrong');
          }
        );
      });
    }

    if (
      message.data === 'account_not_found' ||
      message.data === 'already_actioned'
    ) {
      const username =
        message.username ||
        getActiveAccountLists(await loadMigratedSettings(null, false)).toBlockUsers?.[0];
      if (
        await isQueueRunningInStorage() &&
        await isQueueSenderTab(sender.tab?.id) &&
        username
      ) {
        await advanceToBlockQueue(username, {
          keepInQueue: message.data === 'account_not_found',
          notFound: message.data === 'account_not_found',
          alreadyBlocked: message.eventType === 'already_blocked',
          alreadyMuted: message.eventType === 'already_muted'
        });
      } else if (sender.tab?.id) {
        closeTab(sender.tab.id);
      }
      return;
    }

    if (message.data === 'block_button_clicked' || message.data === 'mute_button_clicked') {
      let username = message.username;
      let action = message.data === 'block_button_clicked' ? 'block' : 'mute';

      if (await isQueueRunningInStorage() && await isQueueSenderTab(sender.tab?.id)) {
        const account = getActiveAccountLists(await loadMigratedSettings(null, false));
        const queueAction = getBulkQueueAction(account);
        const completed =
          (queueAction === 'block' && message.data === 'block_button_clicked') ||
          (queueAction === 'mute' && message.data === 'mute_button_clicked');
        if (completed && username) {
          await advanceToBlockQueue(username);
        }
        return;
      }

      if (sender.tab?.id) {
        try {
          await chrome.tabs.remove(sender.tab.id);
        } catch (e) {
          // tab may already be closed
        }
      }
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs[0]?.id) return;
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            type: 'finished_' + action + 'ing',
            username: username,
            action: action
          }
        );
      });
      return;
    }
  }

  if (message.type == 'open_tab' && message.username !== undefined) {
    const action = message.mute ? 'mute' : 'block';
    const url = `https://x.com/${message.username}?${action}=true`;
    chrome.tabs.create({
      url,
      active: false,
    });
  }

  if (message.type === 'open_options') {
    chrome.runtime.openOptionsPage();
  }
});

function closeTab(tabId) {
  chrome.tabs.remove(tabId);
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (isAdvancingQueue) return;
  const pointer = await getQueueTabPointer();
  if (!pointer.tabId || tabId !== pointer.tabId) return;
  const username = pointer.username;
  const gen = queueGeneration;
  await clearQueueTabPointer();
  if (!(await isQueueRunningInStorage()) || gen !== queueGeneration) return;
  await advanceToBlockQueue(username);
});


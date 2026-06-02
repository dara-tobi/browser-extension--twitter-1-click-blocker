importScripts('account-data.js');

chrome.runtime.setUninstallURL('https://docs.google.com/forms/d/15hOeb2GIHZXcwa8HeiVIIEAqe8gntzGyYLZS5XXTZSE');

async function loadMigratedSettings(detectedHandle) {
  let settings = await AccountData.loadFromChromeStorage({});
  settings = AccountData.migrateSettings(settings, detectedHandle);
  await AccountData.saveToChromeStorage(settings);
  return settings;
}

function getActiveAccountLists(settings) {
  return AccountData.getAccount(settings, settings.activeAccount);
}

let isProcessingToBlockQueue = false;
let currentQueueTabId = null;
let currentQueueUsername = null;
let isAdvancingQueue = false;

async function syncQueueRunningFromStorage() {
  const { toBlockQueueRunning } = await chrome.storage.local.get('toBlockQueueRunning');
  isProcessingToBlockQueue = !!toBlockQueueRunning;
}

async function resetQueueRunStats() {
  await chrome.storage.local.set({
    toBlockQueueRunStats: { blocked: 0, muted: 0, notFound: 0 }
  });
}

async function clearQueueRunStats() {
  await chrome.storage.local.remove('toBlockQueueRunStats');
}

async function incrementQueueRunStat(field) {
  const { toBlockQueueRunStats } = await chrome.storage.local.get('toBlockQueueRunStats');
  const stats = toBlockQueueRunStats || { blocked: 0, muted: 0, notFound: 0 };
  stats[field] = (stats[field] || 0) + 1;
  await chrome.storage.local.set({ toBlockQueueRunStats: stats });
}

async function setQueueRunning(running, queueAction) {
  isProcessingToBlockQueue = running;
  await chrome.storage.local.set({
    toBlockQueueRunning: running,
    toBlockQueueAction: running ? (queueAction || 'block') : null
  });
  if (!running) {
    await clearQueueRunStats();
  }
}

function getBulkQueueAction(accountOrSettings) {
  return accountOrSettings?.bulkQueueAction === 'mute' ? 'mute' : 'block';
}

async function removeUsernameFromToBlockQueue(username) {
  let settings = await loadMigratedSettings(null);
  const account = getActiveAccountLists(settings);
  account.toBlockUsers = (account.toBlockUsers || []).filter(
    (u) => u.toLowerCase() !== username.toLowerCase()
  );
  account.toBlockNotFoundUsers = AccountData.removeToBlockNotFoundTag(
    account.toBlockNotFoundUsers,
    username
  );
  settings = AccountData.updateActiveAccountLists(settings, {
    toBlockUsers: account.toBlockUsers,
    toBlockNotFoundUsers: account.toBlockNotFoundUsers
  });
  await AccountData.saveToChromeStorage(settings);
  return account.toBlockUsers;
}

function emitToBlockQueueEvent(type, username) {
  const normalized = AccountData.listUsernameKey(username) || username;
  chrome.runtime.sendMessage({
    type: 'to_block_queue_feedback',
    eventType: type,
    username: normalized
  });
}

async function openNextInToBlockQueue() {
  await syncQueueRunningFromStorage();
  if (!isProcessingToBlockQueue) return;

  let settings = await loadMigratedSettings(null);
  let account = getActiveAccountLists(settings);
  const queueAction = getBulkQueueAction(account);

  while (account.toBlockUsers?.length) {
    const atFront = account.toBlockUsers[0];
    if (AccountData.isOnBlockedOrMutedList(atFront, account.stats, queueAction)) {
      await removeUsernameFromToBlockQueue(atFront);
      const eventType = queueAction === 'mute' ? 'already_muted' : 'already_blocked';
      await emitToBlockQueueEvent(eventType, atFront);
      settings = await loadMigratedSettings(null);
      account = getActiveAccountLists(settings);
      continue;
    }
    break;
  }

  const username = AccountData.findNextToBlockQueueUser(account);
  if (!username) {
    await setQueueRunning(false, null);
    currentQueueTabId = null;
    return;
  }

  const url = `https://x.com/${username}?${queueAction}=true`;
  const tab = await chrome.tabs.create({
    url,
    active: false,
  });
  currentQueueTabId = tab.id;
  currentQueueUsername = username;
}

async function advanceToBlockQueue(completedUsername, options = {}) {
  if (isAdvancingQueue) return;
  isAdvancingQueue = true;
  try {
    await syncQueueRunningFromStorage();
    if (options.notFound) {
      await incrementQueueRunStat('notFound');
    } else if (completedUsername && !options.keepInQueue) {
      const settings = await loadMigratedSettings(null);
      const queueAction = getBulkQueueAction(getActiveAccountLists(settings));
      await incrementQueueRunStat(queueAction === 'mute' ? 'muted' : 'blocked');
    }
    if (completedUsername && !options.keepInQueue) {
      await removeUsernameFromToBlockQueue(completedUsername);
    }

    if (currentQueueTabId) {
      try {
        await chrome.tabs.remove(currentQueueTabId);
      } catch (e) {
        // tab may already be closed
      }
      currentQueueTabId = null;
      currentQueueUsername = null;
    }

    if (!isProcessingToBlockQueue) return;

    const settings = await loadMigratedSettings(null);
    const account = getActiveAccountLists(settings);
    if (!AccountData.findNextToBlockQueueUser(account)) {
      await setQueueRunning(false, null);
      return;
    }

    setTimeout(() => openNextInToBlockQueue(), 500);
  } finally {
    isAdvancingQueue = false;
  }
}

async function startToBlockQueue() {
  const settings = await loadMigratedSettings(null);
  const account = getActiveAccountLists(settings);
  const queue = account.toBlockUsers || [];
  if (!queue.length) return;

  const queueAction = getBulkQueueAction(account);
  await resetQueueRunStats();
  await setQueueRunning(true, queueAction);
  if (currentQueueTabId) {
    try {
      await chrome.tabs.remove(currentQueueTabId);
    } catch (e) {
      // ignore
    }
    currentQueueTabId = null;
  }
  await openNextInToBlockQueue();
}

async function stopToBlockQueue() {
  await setQueueRunning(false, null);
  if (currentQueueTabId) {
    try {
      await chrome.tabs.remove(currentQueueTabId);
    } catch (e) {
      // ignore
    }
    currentQueueTabId = null;
  }
}

function isUsernameInToBlockQueue(username, queue) {
  return queue.some((u) => u.toLowerCase() === username.toLowerCase());
}

// Listen for messages from the foreground script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'start_to_block_queue') {
    await startToBlockQueue();
    return;
  }

  if (message.type === 'stop_to_block_queue') {
    await stopToBlockQueue();
    return;
  }

  // handle feedback messages from the content script
  if (message.type == "feedback" && message.data) {
    if (message.data === "something_went_wrong") {
      if (
        isProcessingToBlockQueue &&
        sender.tab?.id === currentQueueTabId
      ) {
        const settings = await loadMigratedSettings(null);
        const username = getActiveAccountLists(settings).toBlockUsers?.[0];
        if (username) {
          await advanceToBlockQueue(username);
        }
      }

      closeTab(sender.tab.id);

      // get active tab
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        // send something_went_wrong message to the active tab, so that it can display an error message
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: "something_went_wrong" },
          function (response) {
            // console.log('something went wrong');
          }
        );
      });
    }

    if (
      message.data === "account_not_found" ||
      message.data === "already_actioned"
    ) {
      const username =
        message.username ||
        getActiveAccountLists(await loadMigratedSettings(null)).toBlockUsers?.[0];
      if (
        isProcessingToBlockQueue &&
        sender.tab?.id === currentQueueTabId &&
        username
      ) {
        await advanceToBlockQueue(username, {
          keepInQueue: message.data === 'account_not_found',
          notFound: message.data === 'account_not_found'
        });
      } else if (sender.tab?.id) {
        closeTab(sender.tab.id);
      }
      return;
    }

    if (message.data === "block_button_clicked" || message.data === "mute_button_clicked") {
      let username = message.username;
      let action = message.data === "block_button_clicked" ? "block" : "mute";

      await syncQueueRunningFromStorage();
      if (isProcessingToBlockQueue && sender.tab?.id === currentQueueTabId) {
        const account = getActiveAccountLists(await loadMigratedSettings(null));
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
            type: "finished_" + action + "ing",
            username: username,
            action: action
          }
        );
      });
      return;
    }
  }

  // handle open_tab messages from the content script
  if (message.type == "open_tab" && message.username !== undefined) {
    const action = message.mute ? "mute" : "block";
    const url = `https://x.com/${message.username}?${action}=true`;
    chrome.tabs.create({
      url,
      active: false,
    });
  }

  // handle open_options messages from the content script
  if (message.type === "open_options") {
    chrome.runtime.openOptionsPage();
  }

  // sendResponse("Message " + message + " received in service worker!");
});

function closeTab(tabId) {
  chrome.tabs.remove(tabId);
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId !== currentQueueTabId || isAdvancingQueue) return;
  const username = currentQueueUsername;
  await syncQueueRunningFromStorage();
  if (!isProcessingToBlockQueue) {
    currentQueueTabId = null;
    currentQueueUsername = null;
    return;
  }
  await advanceToBlockQueue(username);
});

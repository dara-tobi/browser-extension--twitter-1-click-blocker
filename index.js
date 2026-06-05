const RESERVED_PROFILE_PATHS = new Set([
  'home', 'search', 'explore', 'notifications', 'messages', 'i', 'settings', 'compose'
]);

// Configuration
const CONFIG = {
  selectors: {
    userActions: '[data-testid="userActions"]',
    confirmButton: '[data-testid="confirmationSheetConfirm"]',
    menuCaret: '[data-testid="caret"]',
    userName: '[data-testid="User-Name"]',
    grokActions: '[aria-label="Grok actions"]',
    blockButton: '[data-testid="block"]',
    muteButton: '[data-testid="mute"]',
    profileUnblockButton: '[data-testid*="-unblock"]',
    profileUnmuteButton: '[data-testid="unmuteLink"]',
    confirmationDialog: '[data-testid="confirmationSheetDialog"]',
    userCell: '[data-testid="UserCell"]',
    cellInnerDiv: '[data-testid="cellInnerDiv"]',
    primaryColumn: '[data-testid="primaryColumn"]',
    placementTracking: '[data-testid="placementTracking"]',
    emptyStateHeader: '[data-testid="empty_state_header_text"]',
    followButton: '[data-testid*="-follow"]',
    tweet: '[data-testid="tweet"]',
    hoverCard: '[data-testid="HoverCard"]'
  },
  classes: {
    blockButton: 'sw-block-button',
    blockButtonWrapper: 'sw-block-button-wrapper',
    blockButtonBackground: 'sw-block-button-background',
    confirmationClicked: 'sw-block-confirmation-clicked',
    menu: 'sw-menu',
    blockIcon: 'sw-block-icon',
    tooltipText: 'sw-tooltip-block-text'
  },
  styles: {
    errorWrapper: {
      backgroundColor: "red",
      color: "white",
      textAlign: "center",
      padding: "10px",
      borderRadius: "5px",
      margin: "20px"
    }
  }
};

class TwitterBlocker {
  constructor() {
    this.isActionClicked = false;
    this.usernameToAction = null;
    this.lastSyncedHandle = null;
    this._didAttemptAutoBlock = false;
    this._skipProfileAutoBlock = false;
    this._profileMuteDoneThisSession = false;
    this._profileBlockDoneThisSession = false;
    this._queueProfileUsername = null;
    this._toBlockQueueHandled = null;
    this._queueRunAborted = false;
    this._queueStepComplete = false;
    const launchParams = new URLSearchParams(location.search);
    this._fromToBlockStandaloneSession =
      launchParams.get('toblock') === '1' &&
      !!(launchParams.get('block') || launchParams.get('mute'));

    // Initialize settings
    this.settingsManager = new window.OneClickBlockerSettings.SettingsManager();
    this.settingsUI = new window.OneClickBlockerSettings.SettingsUI(this.settingsManager);

    this.initMutationObserver();
    this.initNavigationListener();
    this.initMessageListener();
    this.initQueueRunAbortListener();
    this.startHandleDetection();
    void this.checkAutoBlockProfileTabState();
  }

  initQueueRunAbortListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.toBlockQueueRunning) return;
      if (!this.isToBlockQueueProfileTab()) return;
      if (
        changes.toBlockQueueRunning.oldValue === true &&
        changes.toBlockQueueRunning.newValue === false
      ) {
        this._queueRunAborted = true;
      }
    });
  }

  startHandleDetection() {
    this.syncLoggedInAccount();
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const handle = this.getOwnHandle();
      if (handle) {
        await this.syncLoggedInAccountIfNeeded(handle);
        clearInterval(interval);
      } else if (attempts >= 120) {
        clearInterval(interval);
      }
    }, 500);
  }

  async syncLoggedInAccountIfNeeded(handle) {
    if (!handle || handle === this.lastSyncedHandle) return;
    this.lastSyncedHandle = handle;
    await this.settingsManager.syncAccountFromPage(handle);
  }

  async syncLoggedInAccount() {
    const handle = this.getOwnHandle() || await this.detectOwnHandleWithRetry();
    await this.syncLoggedInAccountIfNeeded(handle);
  }

  initNavigationListener() {
    this.lastPath = location.pathname;

    const onNavigate = () => {
      if (location.pathname === this.lastPath) return;
      this.lastPath = location.pathname;
      void this.syncLoggedInAccount();
      this.cleanupOwnProfileBlockButtons();
    };

    window.addEventListener("popstate", onNavigate);
    const wrapHistory = (method) => {
      const original = history[method].bind(history);
      history[method] = (...args) => {
        const result = original(...args);
        onNavigate();
        return result;
      };
    };
    wrapHistory("pushState");
    wrapHistory("replaceState");
  }

  cleanupOwnProfileBlockButtons() {
    if (!this.getProfilePageInfo().isOwnProfilePage) return;
    this.removeProfileHeaderBlockButtons();
    setTimeout(() => {
      if (this.getProfilePageInfo().isOwnProfilePage) {
        this.removeProfileHeaderBlockButtons();
      }
    }, 500);
  }

  initMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
          void this.handleDOMMutation(mutation);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    });
  }

  async handleDOMMutation(mutation) {
    const handle = this.getOwnHandle();
    if (handle) {
      this.syncLoggedInAccountIfNeeded(handle);
    }
    if (this.getProfilePageInfo().isOwnProfilePage) {
      this.removeProfileHeaderBlockButtons();
      return;
    }
    if (this.isToBlockQueueProfileTab()) {
      if (this._queueRunAborted || this._queueStepComplete) return;
      const queueProfileHandled = await this.handleToBlockQueueProfilePage(mutation);
      if (queueProfileHandled) return;
      this.handleConfirmUserBlock(mutation);
      this.handleOptionsMenu(mutation);
      this.handleProfilePageBlockButton(mutation);
      void this.handleBlockCompletion(mutation);
      return;
    }
    if (this.isAutoBlockProfileTab()) {
      if (await this.handleStandaloneAutoBlockAlreadyActioned(mutation)) return;
      if (await this.handleStandaloneAutoBlockNotFound(mutation)) return;
    }
    this.handleConfirmUserBlock(mutation);
    this.handleOptionsMenu(mutation);
    this.addBlockButtonsToTimelines(mutation);
    this.handleThankYouMessage(mutation);
    this.handleProfilePageBlockButton(mutation);
    this.handleEngagementPages(mutation);
    void this.handleBlockCompletion(mutation);
    this.handleGrokButtonOverlap(mutation);
    this.addBlockButtonsToEngagementsPages(mutation);
  }

  initMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleChromeMessage(message);
    });
  }

  handleChromeMessage(message) {
    if (message.type === "finished_blocking" || message.type === "finished_muting") {
      this.removeBlockedUser(message.username);
    } else if (message.type === "something_went_wrong") {
      this.showError();
    }
  }

  handleConfirmUserBlock(mutation) {
    const confirmButton = mutation.target.querySelector(CONFIG.selectors.confirmButton);
    if (!confirmButton?.classList.contains(CONFIG.classes.confirmationClicked)) {
      this.processActionConfirmation(mutation, confirmButton);
    }
  }

  async processActionConfirmation(mutation, confirmButton) {
    if (!confirmButton) return;

    confirmButton.classList.add(CONFIG.classes.confirmationClicked);
    const dialog = mutation.target.querySelector(CONFIG.selectors.confirmationDialog);

    if (this.usernameToAction) {
      const containsUsername = dialog?.textContent?.toLowerCase()?.includes(this.usernameToAction.toLowerCase());
      if (containsUsername) {
        confirmButton.click();
      }
    }

    if (document.querySelector(CONFIG.selectors.userActions)) {
      confirmButton.click();
    }
  }

  handleOptionsMenu(mutation) {
    const menu = mutation.target.querySelector('[role="menu"]');
    if (menu && !menu.classList.contains(CONFIG.classes.menu)) {
      this.processMenuVisibility(menu);
    }
  }

  async processMenuVisibility(menu) {
    menu.classList.add(CONFIG.classes.menu);
    if (this.isActionClicked) {
      const action = await this.getCurrentAction();
      const actionButton = action === 'mute' ?
        this.getMuteButton() :
        document.querySelector(CONFIG.selectors.blockButton);

      menu.style.opacity = actionButton ? 0 : 1;
      if (!actionButton) menu.remove();
    } else {
      menu.style.opacity = 1;
    }
  }

  getMuteButton() {
    return document.querySelector(CONFIG.selectors.muteButton);
  }

  async triggerMenuOptionClick() {
    const action = await this.getCurrentAction();

    setTimeout(() => {
      if (this.hasProfileUnblockButton(action)) return;
      const actionButton = action === 'mute' ?
        this.getMuteButton() :
        document.querySelector(CONFIG.selectors.blockButton);

      this.isActionClicked = false;
      if (!actionButton) return;
      this._didAttemptAutoBlock = true;
      actionButton.click();
    }, 20);
  }

  async addBlockButtonsToTimelines(mutation) {
    if (this.getProfilePageInfo().isOwnProfilePage) return;
    if (!await this.shouldShowButtonOnPage('timeline')) return;
    const wrapper = this.detectTweetUsernameWrapper(mutation);
    if (wrapper) {
      const usernameDiv = wrapper.querySelector(CONFIG.selectors.userName);
      const menuButton = wrapper.querySelector(CONFIG.selectors.menuCaret);
      this.attachActionButton(usernameDiv, menuButton);
    }
  }

  detectTweetUsernameWrapper(mutation) {
  let nodeOfInterest = null;
    const mutationString = Array.from(mutation.addedNodes)
      .map(node => node.outerHTML)
      .join("");
    const hasMenuCaret = mutationString.includes('data-testid="caret"');

    if (hasMenuCaret) {
      mutation.addedNodes.forEach(node => {
        if (node.querySelector('[data-testid="caret"]') && node.closest("article")) {
          let parent = node.parentElement;
          while (!parent.querySelector('[data-testid="User-Name"]')) {
            if (parent.nodeName.toLowerCase() === "article") break;
            parent = parent.parentElement;
          }
          if (parent.querySelector('[data-testid="User-Name"]')) {
            nodeOfInterest = parent;
          }
        }
        if (node.getAttribute("data-testid") === "cellInnerDiv") {
        nodeOfInterest = node;
      }
    });
  }
  return nodeOfInterest;
  }

  handleThankYouMessage(mutation) {
    const mutationString = Array.from(mutation.addedNodes)
      .map(node => node.outerHTML)
      .join("");

    if (mutationString.includes("X will use this to make your timeline better.")) {
      const wrapper = mutation.target.closest(CONFIG.selectors.cellInnerDiv);
      // only hide it if wrapper.queryselectorall('button').length < 3
      // this is so that the confirmation dialog for "not interested" doesn't get hidden
      if (wrapper.querySelectorAll('button').length < 3) {
        this.hideElement(wrapper);
      }
    }
  }

  hideElement(element) {
    if (!element) return;
  element.style.height = "0px";
  element.style.visibility = "hidden";
  }

  async handleProfilePageBlockButton(mutation) {
    const pageInfo = this.getProfilePageInfo();
    if (!pageInfo.isProfilePage) {
      return;
    }

    if (pageInfo.isOwnProfilePage) {
      this.removeProfileHeaderBlockButtons();
      return;
    }

    // Check if we should show the button based on the current page type
    const pageType = this.getPageType();
    if (!this.isAutoBlockProfileTab() && !await this.shouldShowButtonOnPage(pageType)) {
      return;
    }

    const userActionsButton = this.getUserActionsButton(mutation);
    if (!userActionsButton || this.hasExistingBlockButton(mutation, userActionsButton)) return;

    this.addProfileBlockButton(userActionsButton);
  }

  getOwnHandle() {
    return AccountData.detectHandleFromPage(document);
  }

  async detectOwnHandleWithRetry() {
    for (let i = 0; i < 20; i++) {
      const handle = this.getOwnHandle();
      if (handle) return handle;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
  }

  getProfilePageInfo() {
    let isProfilePage = () => {
      return !!document.querySelector(CONFIG.selectors.userActions);
    };

    let isOwnProfilePage = () => {
      if (document.querySelector('[data-testid="editProfileButton"]')) {
        return true;
      }

      const ownUsername = this.getOwnHandle();
      const profileUsername = location.pathname.split("/")[1]?.toLowerCase();
      if (!ownUsername || !profileUsername || RESERVED_PROFILE_PATHS.has(profileUsername)) {
        return false;
      }
      return ownUsername === profileUsername;
    };

    return { isProfilePage: isProfilePage(), isOwnProfilePage: isOwnProfilePage() };
  }

  getUserActionsButton(mutation) {
    return mutation.target.querySelector(CONFIG.selectors.userActions);
  }

  removeProfileHeaderBlockButtons() {
    document.querySelectorAll(`.${CONFIG.classes.blockButton}`).forEach((btn) => btn.remove());
    document.querySelectorAll(`.${CONFIG.classes.blockButtonWrapper}`).forEach((wrapper) => wrapper.remove());

    const profileActions = document.querySelector(CONFIG.selectors.userActions);
    const editProfileButton = document.querySelector('[data-testid="editProfileButton"]');
    const anchors = [profileActions, editProfileButton].filter(Boolean);
    if (!anchors.length) return;

    const containers = new Set();
    anchors.forEach((anchor) => {
      const tracking = anchor.closest(CONFIG.selectors.placementTracking);
      if (tracking) containers.add(tracking);
      if (anchor.parentElement) containers.add(anchor.parentElement);
      let el = anchor.parentElement?.parentElement;
      while (el) {
        if (el.matches?.(CONFIG.selectors.primaryColumn) || el.matches?.("main")) {
          break;
        }
        containers.add(el);
        el = el.parentElement;
      }
    });

    containers.forEach((container) => {
      container.querySelectorAll(`.${CONFIG.classes.blockButton}`).forEach((btn) => {
        if (!btn.closest(`.${CONFIG.classes.blockButtonWrapper}`)) {
          btn.remove();
        }
      });
    });

    if (editProfileButton) {
      const editRect = editProfileButton.getBoundingClientRect();
      document.querySelectorAll(`.${CONFIG.classes.blockButton}`).forEach((btn) => {
        if (btn.closest(`.${CONFIG.classes.blockButtonWrapper}`)) return;
        const btnRect = btn.getBoundingClientRect();
        const sameRow = Math.abs(btnRect.top - editRect.top) < 50;
        const besideEditProfile =
          btnRect.left >= editRect.left - 120 && btnRect.right <= editRect.right + 20;
        if (sameRow && besideEditProfile) {
          btn.remove();
        }
      });
    }
  }

  hasExistingBlockButton(mutation, userActionsButton) {
    if (
      mutation.target.querySelector(`.${CONFIG.classes.blockButton}`) ||
      userActionsButton.parentElement.querySelector(`.${CONFIG.classes.blockButton}`)
    ) {
      return true;
    }

    let el = userActionsButton.parentElement;
    while (el) {
      if (el.matches?.(CONFIG.selectors.primaryColumn) || el.matches?.("main")) {
        return false;
      }
      if (el.querySelector(`.${CONFIG.classes.blockButton}`)) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  addProfileBlockButton(userActionsButton) {
    const { bgColor, iconColor } = getThemeColors(userActionsButton);
    const blockButton = new ProfileBlockButtonUI(bgColor, iconColor, this.settingsManager)
      .create();
    userActionsButton.parentElement.appendChild(blockButton);
    blockButton.classList.add(CONFIG.classes.blockButton);

    this.addProfileBlockButtonListeners(blockButton, userActionsButton);
    void this.runAutoBlockIfNeeded(blockButton);
  }

  addProfileBlockButtonListeners(blockButton, userActionsButton) {
    blockButton.addEventListener("click", () => {
      this.usernameToAction = location.pathname.split("/")[1];
      userActionsButton.click();
      this.triggerMenuOptionClick();
    });
  }

  isProfileActionDoneThisSession(action) {
    return action === 'mute'
      ? this._profileMuteDoneThisSession
      : this._profileBlockDoneThisSession;
  }

  markProfileActionDoneThisSession(action) {
    if (action === 'mute') {
      this._profileMuteDoneThisSession = true;
    } else {
      this._profileBlockDoneThisSession = true;
    }
  }

  isProfileUnblockButtonElement(el) {
    if (!el) return false;
    if (el.closest(CONFIG.selectors.tweet)) return false;
    if (el.closest('[role="menu"]')) return false;
    return true;
  }

  findProfileUnblockButton(action) {
    const selector =
      action === 'mute' ? CONFIG.selectors.profileUnmuteButton : CONFIG.selectors.profileUnblockButton;
    const roots = [
      document.querySelector(CONFIG.selectors.primaryColumn),
      document.querySelector(CONFIG.selectors.placementTracking)
    ].filter(Boolean);
    for (const root of roots) {
      const el = root.querySelector(selector);
      if (this.isProfileUnblockButtonElement(el)) return el;
    }
    const el = document.querySelector(selector);
    if (this.isProfileUnblockButtonElement(el)) return el;
    return null;
  }

  hasProfileUnblockButton(action) {
    return !!this.findProfileUnblockButton(action);
  }

  mutationHasProfileUnactionButton(mutation, action) {
    const selector =
      action === 'mute' ? CONFIG.selectors.profileUnmuteButton : CONFIG.selectors.profileUnblockButton;
    const nodeHasSelector = (node) => {
      if (!node || node.nodeType !== 1) return false;
      if (node.matches?.(selector)) return true;
      return !!node.querySelector?.(selector);
    };
    if (nodeHasSelector(mutation.target)) return true;
    for (const node of mutation.addedNodes) {
      if (nodeHasSelector(node)) return true;
    }
    return false;
  }

  async runAutoBlockIfNeeded(blockButton) {
    if (this._skipProfileAutoBlock) return;
    if (!this.isAutoBlockProfileTab()) return;

    if (this.checkForError()) {
      this.handleBlockError();
      return;
    }

    blockButton.click();
  }

  checkForError() {
    return document
      .querySelector(CONFIG.selectors.primaryColumn)
      ?.textContent.includes("Something went wrong");
  }

  handleBlockError() {
    chrome.runtime.sendMessage({
      type: 'feedback',
      data: 'something_went_wrong',
      username: this.getProfileTabUsername(),
      fromToBlock: this.isFromToBlockStandaloneSession()
    });
  }

  handleGrokButtonOverlap(mutation) {
    const grokButton = mutation.target.querySelector(CONFIG.selectors.grokActions);
    if (grokButton) {
      const blockButton = grokButton.closest("article")
        .querySelector(`.${CONFIG.classes.blockButtonWrapper}`);
      if (blockButton) {
        blockButton.style.right = "45px";
      }
    }
  }

  removeBlockedUser(username) {
    const userCell = document
      .querySelector(`[href="/${username}"]`)
      ?.closest(CONFIG.selectors.userCell);
    userCell?.remove();
  }

  showError() {
    const errorDiv = document.createElement("div");
    Object.assign(errorDiv.style, CONFIG.styles.errorWrapper);
    errorDiv.textContent = "Something went wrong. Please try again later.";
    document.body.appendChild(errorDiv);
  }

  async getCurrentAction() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("mute")) return 'mute';
    if (urlParams.get("block")) return 'block';
    await this.syncLoggedInAccount();
    const settings = this.settingsManager.getSettings();
    return settings.action || 'block';
  }

  getPageType() {
    const path = window.location.pathname;
    
    if (path.includes('/search')) {
      return 'search';
    }
    
    if (path.includes('/retweets') || path.includes('/likes') || path.includes('/quotes')) {
      return 'engagements';
    }
    // verified_followers
    if (path.includes('/followers') || path.includes('/verified_followers')) {
      return 'followers';
    }

    // hashtag
    if (path.includes('/hashtag')) {
      return 'hashtag';
    }

    //i/trending
    if (path.includes('/i/trending')) {
      return 'trending';
    }

    // notifications
    if (path.includes('/notifications')) {
      return 'notifications';
    }

    if (path.includes('/following')) {
      return 'following';
    }
    
    if (path.includes('/i/communities')) {
      return 'communities';
    }
    
    if (path === '/home' || path === '/') {
      return 'timeline';
    }
    
    // Check if it's a status/tweet page
    if (path.match(/\/status\/\d+/)) {
      return 'status';
    }

    // detect profile page without path
    if (document.querySelector(CONFIG.selectors.userActions)) {
      return 'profile';
    }

    if (path.includes('/explore')) {
      return 'explore';
    }
    
    return null;
  }

  async shouldShowButtonOnPage(pageType) {
    await this.syncLoggedInAccount();
    const settings = this.settingsManager.getSettings();
    const currentPageType = this.getPageType();
    
    // If we're on a specific page type, check if it's enabled
    if (currentPageType) {
      return settings.enabledPages?.[currentPageType] ?? true;
    }
    
    // Otherwise, check the requested page type
    return settings.enabledPages?.[pageType] ?? true;
  }

  async attachActionButton(userNameDiv, menuOptionsButton) {
    if (!userNameDiv) {
      return;
    }

    const tweetUsername = userNameDiv.querySelectorAll("[href]")?.[1]?.textContent;

    if (!this.shouldAddActionButton(tweetUsername)) {
      return;
    }

    const action = await this.getCurrentAction();
    const { bgColor, iconColor } = getThemeColors(menuOptionsButton);
    const blockButton = new BlockButtonUI(bgColor, iconColor)
      .create(tweetUsername, menuOptionsButton, action);
    
    this.addTweetActionButtonListeners(blockButton, menuOptionsButton);
    
    const menuOptionsWrapper = menuOptionsButton.parentElement;
    menuOptionsWrapper.insertBefore(blockButton, menuOptionsButton);

    const grokButton = menuOptionsWrapper.closest('article')
      .querySelector(CONFIG.selectors.grokActions);
    if (grokButton) {
      blockButton.style.right = '45px';
    }
  }

  shouldAddActionButton(tweetUsername) {
    const ownHandle = this.getOwnHandle();
    if (!ownHandle || !tweetUsername) return true;
    return tweetUsername.replace(/^@/, '').toLowerCase() !== ownHandle;
  }

  addTweetActionButtonListeners(actionButton, menuOptionsButton) {
    actionButton.addEventListener("click", async (e) => {
      this.usernameToAction = actionButton.dataset.username;
      e.stopPropagation();
      this.triggerMenuClick(menuOptionsButton);
      await this.triggerMenuOptionClick();
    });
  }

  triggerMenuClick(menuOptionsButton) {
    this.isActionClicked = true;
    menuOptionsButton.click();
  }

  async handleEngagementPages(mutation) {
    if (this.getProfilePageInfo().isOwnProfilePage) return;
    const pageType = this.getPageType();
    if (!await this.shouldShowButtonOnPage(pageType)) return;

    this.getElementsFromMutation(mutation, CONFIG.selectors.userCell).forEach((userCell) => {
      const userActions = userCell.querySelector(CONFIG.selectors.userActions);
      if (!userActions || userActions.parentElement.querySelector(`.${CONFIG.classes.blockButton}`)) return;

      const { bgColor, iconColor } = getThemeColors(userActions);
      const blockButton = new ProfileBlockButtonUI(bgColor, iconColor, this.settingsManager)
        .create('engagements-page');
      userActions.parentElement.appendChild(blockButton);
      blockButton.classList.add(CONFIG.classes.blockButton);

      blockButton.addEventListener('click', () => {
        const username = userCell.querySelector('a[href^="/"]')?.getAttribute('href')?.substring(1);
        if (username) {
          this.usernameToAction = username;
          userActions.click();
          this.triggerMenuOptionClick();
        }
      });
    });
  }

  async handleBlockCompletion(mutation) {
    const urlParams = new URLSearchParams(window.location.search);
    const fromAutoBlockTab = urlParams.get('block') || urlParams.get('mute');
    const autoBlockAction = urlParams.get('mute') ? 'mute' : 'block';
    if (
      this._skipProfileAutoBlock &&
      !(fromAutoBlockTab && this.isProfileActionDoneThisSession(autoBlockAction))
    ) {
      return;
    }

    const mutationString = Array.from(mutation.addedNodes)
      .map(node => node.outerHTML)
      .join("");

    // Check for block/mute completion message
    const isBlocked = mutationString.includes("blocked");
    const isMuted = mutationString.includes("muted");
    
    if (isBlocked || isMuted) {
      if (fromAutoBlockTab && !this._didAttemptAutoBlock) {
        return;
      }
      let username = this.usernameToAction;
      
      // If no username in class variable, try getting it from URL (for auto-block cases)
      if (!username) {
        const urlParams = new URLSearchParams(window.location.search);
        const isFromUrl = urlParams.get("block") || urlParams.get("mute");
        if (isFromUrl) {
          username = location.pathname.split("/")[1];
        }
      }

      if (username) {
        // remove the @ from the username if present
        username = username.replace("@", "");
        const completedAction = fromAutoBlockTab
          ? this.getProfileAutoBlockAction()
          : (isBlocked ? 'block' : 'mute');
        if (fromAutoBlockTab) {
          this.markProfileActionDoneThisSession(completedAction);
        }
        if (this.isToBlockQueueProfileTab()) {
          await this.saveQueueProfileStats(username, completedAction);
        } else {
          await this.saveUserToStorage(username, completedAction);
        }

        // Clear the username after saving
        this.usernameToAction = null;
        
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get("block") || urlParams.get("mute")) {
          if (this.isToBlockQueueProfileTab()) {
            this._queueStepComplete = true;
          }
          chrome.runtime.sendMessage({
            type: 'feedback',
            data: `${completedAction}_button_clicked`,
            username,
            fromToBlock: this.isFromToBlockStandaloneSession()
          });
          return;
        }
      }
    }

    this.informBackgroundScriptOfActionCompletion(mutation);
  }

  isProfileUnavailable() {
    if (document.querySelector(CONFIG.selectors.emptyStateHeader)) return true;
    if (!document.querySelector(CONFIG.selectors.userActions) && this.checkForError()) return true;
    return false;
  }

  isFromToBlockStandaloneSession() {
    return !!this._fromToBlockStandaloneSession;
  }

  isAutoBlockProfileTab() {
    const urlParams = new URLSearchParams(window.location.search);
    return !!(urlParams.get('block') || urlParams.get('mute'));
  }

  isToBlockQueueProfileTab() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('queueblock') === '1' && this.isAutoBlockProfileTab();
  }

  getProfileTabUsername() {
    const segment = location.pathname.split('/')[1];
    if (!segment) return null;
    if (RESERVED_PROFILE_PATHS.has(segment.toLowerCase())) return null;
    return segment.replace('@', '');
  }

  getProfileAutoBlockAction() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('mute') ? 'mute' : 'block';
  }

  getQueueProfileAction() {
    return this.getProfileAutoBlockAction();
  }

  markToBlockQueueHandled(username, reason) {
    const key = `${username.toLowerCase()}:${reason}`;
    if (this._toBlockQueueHandled === key) return false;
    this._toBlockQueueHandled = key;
    return true;
  }

  async handleQueueProfileSessionComplete(username, action) {
    if (!this.markToBlockQueueHandled(username, `completed_${action}`)) {
      return false;
    }
    this._skipProfileAutoBlock = true;
    await this.saveQueueProfileStats(username, action);
    this._queueStepComplete = true;
    chrome.runtime.sendMessage({
      type: 'feedback',
      data: `${action}_button_clicked`,
      username
    });
    return true;
  }

  async handleAlreadyBlockedOnProfile(username, action) {
    const alreadyMuted = this.hasProfileUnblockButton('mute');
    const eventType = alreadyMuted ? 'already_muted' : 'already_blocked';
    this._skipProfileAutoBlock = true;
    if (!this.markToBlockQueueHandled(username, eventType)) {
      return false;
    }
    this._queueStepComplete = true;
    chrome.runtime.sendMessage({
      type: 'feedback',
      data: 'already_actioned',
      username,
      action,
      eventType,
      fromToBlock: this.isFromToBlockStandaloneSession()
    });
    return true;
  }

  async handleStandaloneAutoBlockNotFound(mutation) {
    const username = this.getProfileTabUsername();
    if (!username) return false;

    if (
      this.isProfileUnavailable() &&
      !this.hasProfileUnblockButton('block') &&
      !document.querySelector(CONFIG.selectors.userActions)
    ) {
      if (!this.markToBlockQueueHandled(username, 'not_found')) return false;
      this._skipProfileAutoBlock = true;
      chrome.runtime.sendMessage({
        type: 'feedback',
        data: 'account_not_found',
        username,
        fromToBlock: this.isFromToBlockStandaloneSession()
      });
      return true;
    }
    return false;
  }

  async handleStandaloneAutoBlockAlreadyActioned(mutation) {
    const username = this.getProfileTabUsername();
    if (!username) return false;

    const action = this.getProfileAutoBlockAction();

    if (
      !this._didAttemptAutoBlock &&
      (this.hasProfileUnblockButton('block') || this.hasProfileUnblockButton('mute'))
    ) {
      return await this.handleAlreadyBlockedOnProfile(username, action);
    }
    return false;
  }

  async checkAutoBlockProfileTabState() {
    if (!this.isAutoBlockProfileTab()) return;
    const emptyMutation = { target: document.body, addedNodes: [] };
    for (let i = 0; i < 24; i++) {
      if (this._skipProfileAutoBlock || this._queueStepComplete) return;
      if (this.isToBlockQueueProfileTab()) {
        if (this._queueRunAborted) return;
        if (await this.handleToBlockQueueProfilePage(emptyMutation)) return;
      } else {
        if (await this.handleStandaloneAutoBlockAlreadyActioned(emptyMutation)) return;
        if (await this.handleStandaloneAutoBlockNotFound(emptyMutation)) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  async handleToBlockQueueProfilePage(mutation) {
    if (this._queueRunAborted || this._queueStepComplete) return false;
    const username = this.getProfileTabUsername();
    if (!username) return false;

    if (username !== this._queueProfileUsername) {
      this._queueProfileUsername = username;
      this._didAttemptAutoBlock = false;
      this._skipProfileAutoBlock = false;
      this._profileMuteDoneThisSession = false;
      this._profileBlockDoneThisSession = false;
      this._queueStepComplete = false;
      this._toBlockQueueHandled = null;
    }

    const action = this.getProfileAutoBlockAction();

    if (
      !this._didAttemptAutoBlock &&
      (this.hasProfileUnblockButton('block') || this.hasProfileUnblockButton('mute'))
    ) {
      await this.handleAlreadyBlockedOnProfile(username, action);
      return true;
    }

    if (
      this.hasProfileUnblockButton(action) &&
      (this.mutationHasProfileUnactionButton(mutation, action) || this._didAttemptAutoBlock)
    ) {
      await this.handleQueueProfileSessionComplete(username, action);
      return true;
    }

    if (this.isProfileActionDoneThisSession(action)) {
      if (this.hasProfileUnblockButton(action)) {
        this._skipProfileAutoBlock = true;
      }
      return false;
    }

    if (
      this.isProfileUnavailable() &&
      !this.hasProfileUnblockButton('block') &&
      !document.querySelector(CONFIG.selectors.userActions)
    ) {
      if (!this.markToBlockQueueHandled(username, 'not_found')) return false;
      this._skipProfileAutoBlock = true;
      this._queueStepComplete = true;
      chrome.runtime.sendMessage({
        type: 'feedback',
        data: 'account_not_found',
        username,
        fromToBlock: this.isFromToBlockStandaloneSession()
      });
      return true;
    }

    return false;
  }

  recordActionInStats(stats, username, action) {
    const s = stats || {
      totalBlocks: 0,
      totalMutes: 0,
      blockedUsers: [],
      mutedUsers: []
    };
    if (!s.blockedUsers) s.blockedUsers = [];
    if (!s.mutedUsers) s.mutedUsers = [];
    const key = AccountData.listUsernameKey(username);
    if (action === 'block') {
      if (!s.blockedUsers.some((u) => AccountData.listUsernameKey(u) === key)) {
        s.blockedUsers.push({ handle: key || username, at: Date.now() });
        s.totalBlocks = (s.totalBlocks || 0) + 1;
      }
    } else if (action === 'mute') {
      if (!s.mutedUsers.some((u) => AccountData.listUsernameKey(u) === key)) {
        s.mutedUsers.push({ handle: key || username, at: Date.now() });
        s.totalMutes = (s.totalMutes || 0) + 1;
      }
    }
    return s;
  }

  async resolveContentScriptAccountHandle() {
    const fromPage = this.getOwnHandle();
    if (fromPage) return fromPage;
    const { loggedInHandle } = await chrome.storage.local.get('loggedInHandle');
    return AccountData.normalizeHandle(loggedInHandle);
  }

  async saveQueueProfileStats(username, action) {
    try {
      const handle = await this.resolveContentScriptAccountHandle();
      if (!handle) return;
      await this.syncLoggedInAccount();
      const settings = await this.settingsManager.loadSettings(handle, { persist: false });
      const stats = this.recordActionInStats(settings.stats, username, action);
      await AccountData.patchLocalAccountList(handle, { stats });
    } catch (error) {
      console.error('Error saving queue profile stats:', error);
    }
  }

  async saveUserToStorage(username, action) {
    try {
      await this.syncLoggedInAccount();
      const settings = await this.settingsManager.loadSettings(this.getOwnHandle(), { persist: false });
      const stats = this.recordActionInStats(settings.stats, username, action);
      const queue = settings.toBlockUsers || [];
      const nextQueue = queue.filter(
        (u) => u.toLowerCase() !== username.toLowerCase()
      );
      const notFoundUsers = AccountData.removeToBlockNotFoundTag(
        settings.toBlockNotFoundUsers || [],
        username
      );

      await this.settingsManager.saveSettings({
        stats,
        toBlockUsers: nextQueue,
        toBlockNotFoundUsers: notFoundUsers
      }, this.getOwnHandle());
    } catch (error) {
      console.error('Error saving user to storage:', error);
    }
  }

  informBackgroundScriptOfActionCompletion(mutation) {
    const urlParams = new URLSearchParams(window.location.search);
    const isBlock = urlParams.get("block");
    const isMute = urlParams.get("mute");

    if (!isBlock && !isMute) {
      return;
    }

    const username = location.pathname.split("/")[1];
    const action = isBlock ? "block" : "mute";

    if (this._skipProfileAutoBlock) return;
    if (
      this.hasProfileUnblockButton(action) &&
      !this.isProfileActionDoneThisSession(action)
    ) {
      return;
    }

    let hasUnactionInMutation;
    if (action === 'mute') {
      hasUnactionInMutation =
        mutation.target.querySelector(CONFIG.selectors.profileUnmuteButton) ||
        mutation.target.querySelector(CONFIG.selectors.placementTracking)?.querySelector(
          CONFIG.selectors.profileUnmuteButton
        );
    } else {
      hasUnactionInMutation =
        mutation.target.querySelector(CONFIG.selectors.placementTracking)?.querySelector(
          '[data-testid*="-unblock"]'
        );
    }

    if (!hasUnactionInMutation) return;
    if (!this._didAttemptAutoBlock) return;

    chrome.runtime.sendMessage(
      { 
        type: "feedback", 
        data: `${action}_button_clicked`, 
        username 
      }
    );
  }

  sendBlockRequest(username) {
    chrome.runtime.sendMessage({ type: "open_tab", username, block: true });
  }

  getElementsFromMutation(mutation, selector) {
    const elements = new Set();
    const collect = (root) => {
      if (!root || root.nodeType !== 1) return;
      if (root.matches?.(selector)) {
        elements.add(root);
      }
      root.querySelectorAll?.(selector)?.forEach((el) => elements.add(el));
    };
    collect(mutation.target);
    mutation.addedNodes.forEach(collect);
    return elements;
  }

  isProfileHeaderFollowButton(followButton) {
    const pageInfo = this.getProfilePageInfo();
    if (!pageInfo.isProfilePage) return false;
    if (followButton.closest(CONFIG.selectors.userCell)) return false;

    const profileActions = document.querySelector(CONFIG.selectors.userActions);
    if (!profileActions) return false;

    const editProfileButton = document.querySelector('[data-testid="editProfileButton"]');
    if (pageInfo.isOwnProfilePage && editProfileButton) {
      const editRect = editProfileButton.getBoundingClientRect();
      const followRect = followButton.getBoundingClientRect();
      const sameRow = Math.abs(followRect.top - editRect.top) < 50;
      const besideEditProfile =
        followRect.left >= editRect.left - 120 && followRect.right <= editRect.right + 20;
      if (sameRow && besideEditProfile) return true;
    }

    const actionBar = profileActions.closest(CONFIG.selectors.placementTracking);
    if (actionBar?.contains(followButton)) return true;

    let el = profileActions.parentElement;
    while (el) {
      if (el.matches?.(CONFIG.selectors.primaryColumn) || el.matches?.("main")) {
        return false;
      }
      if (el.contains(followButton)) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  attachBlockButtonToFollowButton(followButton) {
    if (followButton.closest(CONFIG.selectors.hoverCard)) return;
    if (this.isProfileHeaderFollowButton(followButton)) return;
    if (followButton.parentElement.querySelector(`.${CONFIG.classes.blockButton}`)) return;

    const userCell = followButton.closest(CONFIG.selectors.userCell);
    const inTweet = followButton.closest(CONFIG.selectors.tweet);
    if (inTweet && inTweet.querySelector(CONFIG.selectors.menuCaret)) return;
    if (userCell?.querySelector(CONFIG.selectors.userActions)) return;

    const { bgColor, iconColor } = getThemeColors(followButton);
    const blockButton = new ProfileBlockButtonUI(bgColor, iconColor, this.settingsManager)
      .create("engagements-page");
    followButton.parentElement.appendChild(blockButton);
    followButton.parentElement.style.flexDirection = "row";
    blockButton.classList.add(CONFIG.classes.blockButton);

    blockButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const username =
        followButton?.getAttribute("aria-label")?.split("@")?.[1] ||
        userCell?.querySelector('a[href^="/"]')?.getAttribute("href")?.substring(1);
      if (username) {
        this.usernameToAction = username;
        this.sendBlockRequest(username);
      }
    });
  }

  async addBlockButtonsToEngagementsPages(mutation) {
    if (this.getProfilePageInfo().isOwnProfilePage) return;
    const pageType = this.getPageType();
    if (!await this.shouldShowButtonOnPage(pageType)) return;

    this.getElementsFromMutation(mutation, CONFIG.selectors.followButton).forEach((followButton) => {
      this.attachBlockButtonToFollowButton(followButton);
    });
  }
}

class BlockButtonUI {
  constructor(bgColor, color) {
    this.bgColor = bgColor;
    this.color = color;
  }

  create(tweetUsername, menuOptionsButton, action = 'block') {
    const wrapper = this.createWrapper(menuOptionsButton);
    const blockButton = this.createButton(action);
    const background = this.createBackground();

    wrapper.dataset.username = tweetUsername;
    wrapper.dataset.action = action;
    wrapper.appendChild(background);
    wrapper.appendChild(blockButton);

    this.addHoverEffects(blockButton, background, action);

    return wrapper;
  }

  createWrapper(menuOptionsButton) {
    const grokButton = menuOptionsButton.closest("article")
      .querySelector(CONFIG.selectors.grokActions);

    const wrapper = document.createElement("div");
    wrapper.classList.add(CONFIG.classes.blockButtonWrapper);
    Object.assign(wrapper.style, {
      display: "grid",
      position: "absolute",
      borderRadius: "100%",
      top: "-8px",
      right: grokButton ? "45px" : "15px",
      placeItems: "center",
      gridTemplateAreas: '"icon"',
      gridTemplateColumns: "1fr",
      marginRight: "15px"
    });

    return wrapper;
  }

  createButton(action = 'block') {
    const button = document.createElement("div");
    button.classList.add(CONFIG.classes.blockButton);
    Object.assign(button.style, {
      gridArea: "icon",
      cursor: "pointer",
      textAlign: "center",
      borderRadius: "100%",
      backgroundColor: this.bgColor,
      lineHeight: "10px",
      transition: "all 0.1s ease-in-out",
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      placeSelf: "center"
    });

    button.innerHTML = this.createSVGIcon(action);
    return button;
  }

  createBackground() {
    const background = document.createElement("div");
    background.classList.add(CONFIG.classes.blockButtonBackground);
    Object.assign(background.style, {
      gridArea: "icon",
      backgroundColor: this.bgColor,
      borderRadius: "100%",
      height: "33px",
      width: "33px",
      zIndex: "-1",
      transition: "all 0.1s ease-in-out",
      boxSizing: "border-box"
    });

    return background;
  }

  createSVGIcon(action = 'block') {
    return `<svg style="transition: all 0.1s ease-in-out" class="${CONFIG.classes.blockIcon}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="16" height="16" fill="${this.bgColor}">
      <circle cx="36" cy="36" r="29" stroke="${this.color}" stroke-width="7"/>
      <line x1="17" y1="17" x2="55" y2="55" stroke="${this.color}" stroke-width="7" />
    </svg>`;
  }

  addHoverEffects(button, background, action = 'block') {
    const handleEnter = () => {
      Object.assign(button.style, {
        backgroundColor: "rgba(255,0,64, 0.1)",
        transform: "rotate(270deg)"
      });
      Object.assign(background.style, {
        backgroundColor: "rgba(255,0,64, 0.1)"
      });

      const icon = button.querySelector(`.${CONFIG.classes.blockIcon}`);
      const [circle, line] = [icon.querySelector("circle"), icon.querySelector("line")];
      circle.style.stroke = "rgb(255,0,64)";
      line.style.stroke = "rgb(255,0,64)";
      icon.style.fill = "rgb(255,0,64, 0.1)";

      // Add tooltip
      const username = button.closest(`.${CONFIG.classes.blockButtonWrapper}`)?.dataset.username;
      if (username) {
        this.addBlockButtonHoverTitle(button, username, false, action);
      }
    };

    const handleLeave = () => {
      Object.assign(button.style, {
        backgroundColor: this.bgColor,
        transform: "rotate(0deg)"
      });
      Object.assign(background.style, {
        backgroundColor: this.bgColor
      });

      const icon = button.querySelector(`.${CONFIG.classes.blockIcon}`);
      const [circle, line] = [icon.querySelector("circle"), icon.querySelector("line")];
      circle.style.stroke = this.color;
      line.style.stroke = this.color;
      icon.style.fill = this.bgColor;

      // Remove tooltip
      const tooltip = document.querySelector(`#${CONFIG.classes.tooltipText}`);
      tooltip?.remove();
    };

    button.addEventListener("mouseenter", handleEnter);
    button.addEventListener("mouseleave", handleLeave);
    background.addEventListener("mouseenter", handleEnter);
    background.addEventListener("mouseleave", handleLeave);
  }

  addBlockButtonHoverTitle(button, username, isProfile = false, action = 'block') {
    let hasAddedBlockText = document.querySelector(`#${CONFIG.classes.tooltipText}`);
    if (hasAddedBlockText) {
      return;
    }
    
    const actionText = action.charAt(0).toUpperCase() + action.slice(1);
    
    let titleParent = document.createElement("div");
    titleParent.id = CONFIG.classes.tooltipText;
    titleParent.style.display = "flex";
    titleParent.style.paddingInline = "4px";
    titleParent.style.position = "fixed";
    titleParent.style.fontSize = "11px";
    titleParent.style.backgroundColor = "rgba(91, 112, 131)";
    titleParent.style.alignItems = "center";
    titleParent.style.justifyContent = "center";
    titleParent.style.pointerEvents = "none";
    titleParent.style.minHeight = "20px";
    titleParent.style.borderRadius = "2px";
    titleParent.innerHTML = `
      <div role="tooltip">
        <span dir="ltr" data-testid="HoverLabel" style="font-weight: 400; color: #fff; font-family: 'TwitterChirp', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <span>${actionText} ${username}</span>
        </span>
      </div>
    `;

    // Get position of block button
    let blockButtonPosition = button.getBoundingClientRect();
    titleParent.style.top = `${blockButtonPosition.top + 42}px`;

    // Left should be dynamic so that it's always centered regardless of title parent width
    if (isProfile) {
      titleParent.style.left = `calc(50% + ${blockButtonPosition.left}px - 50% + 20px)`;
    } else {
      titleParent.style.left = `calc(50% + ${blockButtonPosition.left}px - 50% + 15px)`;
    }

    titleParent.style.transform = "translateX(-50%)";
    document.body.appendChild(titleParent);
  }
}

class ProfileBlockButtonUI extends BlockButtonUI {
  constructor(bgColor, color, settingsManager) {
    super(bgColor, color);
    this.settingsManager = settingsManager;
  }

  create(page) {
    const button = document.createElement("div");
    Object.assign(button.style, {
      transition: "all 0.1s ease-in-out",
      cursor: "pointer",
      textAlign: "center",
      borderRadius: "100%",
      position: "relative",
      backgroundColor: this.bgColor,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      placeSelf: "center",
      marginLeft: "5px",
      width: "40px",
      height: "40px"
    });

    if (page !== "engagements-page") {
      button.style.marginBottom = "6px";
    }

    button.innerHTML = this.createSVGIcon();
    this.addHoverEffects(button);

    return button;
  }

  addHoverEffects(button) {
    button.addEventListener("mouseenter", async () => {
      Object.assign(button.style, {
        backgroundColor: "rgba(255,0,64, 0.1)",
        transform: "rotate(270deg)"
      });

      const icon = button.querySelector(`.${CONFIG.classes.blockIcon}`);
      const [circle, line] = [icon.querySelector("circle"), icon.querySelector("line")];
      circle.style.stroke = "rgb(255,0,64)";
      line.style.stroke = "rgb(255,0,64)";
      icon.style.fill = "rgb(255,0,64, 0.1)";

      // Add tooltip for profile
      let username;
      const parentDiv = button.closest('[data-testid="cellInnerDiv"]');
      if (parentDiv) {
        // For engagement pages, get username from href
        const userLink = parentDiv.querySelector('a[href^="/"]');
        if (userLink) {
          username = userLink.getAttribute('href').substring(1); // Remove leading '/'
        }
      } else {
        // For profile pages, get username from URL
        username = location.pathname.split("/")[1];
      }

      if (username) {
        const action = await this.settingsManager?.loadSettings().then(settings => settings.action || 'block');
        this.addBlockButtonHoverTitle(button, "@" + username, !parentDiv, action);
      }
    });

    button.addEventListener("mouseleave", () => {
      Object.assign(button.style, {
        backgroundColor: this.bgColor,
        transform: "rotate(0deg)"
      });

      const icon = button.querySelector(`.${CONFIG.classes.blockIcon}`);
      const [circle, line] = [icon.querySelector("circle"), icon.querySelector("line")];
      circle.style.stroke = this.color;
      line.style.stroke = this.color;
      icon.style.fill = this.bgColor;

      const tooltip = document.querySelector(`#${CONFIG.classes.tooltipText}`);
      tooltip?.remove();
    });
  }
}

// Initialize the app
const twitterBlocker = new TwitterBlocker();
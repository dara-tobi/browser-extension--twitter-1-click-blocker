// Configuration
const CONFIG = {
  colors: {
  "#000000": "rgb(113, 118, 123)",
  "#15202B": "rgb(139, 152, 165)",
  "#FFFFFF": "rgb(83, 100, 113)",
  },
  selectors: {
    username: '[data-testid="SideNav_AccountSwitcher_Button"]',
    userActions: '[data-testid="userActions"]',
    confirmButton: '[data-testid="confirmationSheetConfirm"]',
    menuCaret: '[data-testid="caret"]',
    userName: '[data-testid="User-Name"]',
    grokActions: '[aria-label="Grok actions"]',
    blockButton: '[data-testid="block"]',
    confirmationDialog: '[data-testid="confirmationSheetDialog"]',
    userCell: '[data-testid="UserCell"]',
    cellInnerDiv: '[data-testid="cellInnerDiv"]',
    primaryColumn: '[data-testid="primaryColumn"]',
    placementTracking: '[data-testid="placementTracking"]',
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
    this.ownUsername = null;
    this.somethingWentWrong = false;
    this.usernameToAction = null;
    const { bgColor, iconColor } = getThemeColors();
    this.blockerBgColor = bgColor;
    this.blockerColor = iconColor;

    // Initialize settings
    this.settingsManager = new window.OneClickBlockerSettings.SettingsManager();
    this.settingsUI = new window.OneClickBlockerSettings.SettingsUI(this.settingsManager);
    this.settingsUI.mount();

    this.initMutationObserver();
    this.initNavigationListener();
    this.initMessageListener();
  }

  initNavigationListener() {
    this.lastPath = location.pathname;

    const onNavigate = () => {
      if (location.pathname === this.lastPath) return;
      this.lastPath = location.pathname;
      this.ownUsername = null;
      this.setUsername();
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
    [100, 500, 1500].forEach((ms) => {
      setTimeout(() => {
        if (this.getProfilePageInfo().isOwnProfilePage) {
          this.removeProfileHeaderBlockButtons();
        }
      }, ms);
    });
  }

  initMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
          this.handleDOMMutation(mutation);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    });
  }

  handleDOMMutation(mutation) {
    this.setUsername();
    if (this.getProfilePageInfo().isOwnProfilePage) {
      this.removeProfileHeaderBlockButtons();
    }
    this.handleConfirmUserBlock(mutation);
    this.handleOptionsMenu(mutation);
    this.addBlockButtonsToTimelines(mutation);
    this.handleThankYouMessage(mutation);
    this.handleProfilePageBlockButton(mutation);
    this.handleEngagementPages(mutation);
    this.handleBlockCompletion(mutation);
    this.handleGrokButtonOverlap(mutation);
    this.addBlockButtonsToEngagementsPages(mutation);
    // this.addBlockAllButtonToEngagementsPages(mutation);
    if (this.getProfilePageInfo().isOwnProfilePage) {
      this.removeProfileHeaderBlockButtons();
    }
  }

  initMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleChromeMessage(message);
    });
  }

  handleChromeMessage(message) {
    if (message.type === "finished_blocking") {
      this.removeBlockedUser(message.username);
    } else if (message.type === "something_went_wrong") {
      this.showError();
    }
  }

  setUsername() {
    if (!this.ownUsername) {
      this.ownUsername = document
        .querySelector(CONFIG.selectors.username)
        ?.querySelector("[tabindex]")?.textContent;
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
    const blockButton = document.querySelector(CONFIG.selectors.blockButton);
    if (!blockButton) return null;
    
    const isStatusPage = location.pathname.includes('/status/');

    const muteButton = isStatusPage ? 
      blockButton.previousElementSibling?.previousElementSibling : 
      blockButton.previousElementSibling;
    
    if (muteButton?.textContent?.toLowerCase().includes('@')) {
      return muteButton;
    }
    return null;
  }

  async triggerMenuOptionClick() {
    chrome.runtime.sendMessage(
      { type: "feedback", data: "trying to click action button" }
    );

    const action = await this.getCurrentAction();
    setTimeout(() => {
      const actionButton = action === 'mute' ? 
        this.getMuteButton() : 
        document.querySelector(CONFIG.selectors.blockButton);
      
      this.isActionClicked = false;
      if (!actionButton) return;
      actionButton.click();
    }, 20);
  }

  async sendActionRequest(username) {
    const action = await this.getCurrentAction();
    chrome.runtime.sendMessage(
      { 
        type: "open_tab", 
        username, 
        action,
        [action]: true 
      }
    );
  }

  async addBlockButtonsToTimelines(mutation) {
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
    if (!await this.shouldShowButtonOnPage(pageType)) {
      return;
    }

    const userActionsButton = this.getUserActionsButton(mutation);
    if (!userActionsButton || this.hasExistingBlockButton(mutation, userActionsButton)) return;

    this.addProfileBlockButton(userActionsButton);
  }

  getOwnHandle() {
    const text = document
      .querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')
      ?.querySelector("[tabindex]")?.textContent;
    if (!text) return null;
    const match = text.match(/@([A-Za-z0-9_]+)/);
    return match?.[1]?.toLowerCase() || null;
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
      const reservedPaths = ["home", "search", "explore", "notifications", "messages", "i", "settings", "compose"];
      if (!ownUsername || !profileUsername || reservedPaths.includes(profileUsername)) {
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
    this.handleAutoBlock(blockButton);
  }

  addProfileBlockButtonListeners(blockButton, userActionsButton) {
    blockButton.addEventListener("click", () => {
      this.usernameToAction = location.pathname.split("/")[1];
      userActionsButton.click();
      this.triggerMenuOptionClick();
    });
  }

  handleAutoBlock(blockButton) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("block")) {
      if (this.checkForError()) {
        this.handleBlockError();
        return;
      }
      blockButton.click();
    }
  }

  checkForError() {
    return document
      .querySelector(CONFIG.selectors.primaryColumn)
      ?.textContent.includes("Something went wrong");
  }

  handleBlockError() {
    this.somethingWentWrong = true;
        chrome.runtime.sendMessage(
      { type: "feedback", data: "something_went_wrong" }
    );
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
    const settings = await this.settingsManager.loadSettings();
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
    const settings = await this.settingsManager.loadSettings();
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
    return tweetUsername !== this.ownUsername;
  }

  addTweetActionButtonListeners(actionButton, menuOptionsButton) {
    actionButton.addEventListener("click", async (e) => {
      this.usernameToAction = actionButton.dataset.username;
      e.stopPropagation();
      this.triggerMenuClick(menuOptionsButton);
      this.hideTweetDiv(menuOptionsButton);
      await this.triggerMenuOptionClick();
    });
  }

  triggerMenuClick(menuOptionsButton) {
    this.isActionClicked = true;
    menuOptionsButton.click();
  }

  hideTweetDiv(menuOptionsButton) {
    const tweetDiv = menuOptionsButton.closest("article");
    // this.hideElement(tweetDiv);
  }

  async handleEngagementPages(mutation) {
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

  handleBlockCompletion(mutation) {
    const mutationString = Array.from(mutation.addedNodes)
      .map(node => node.outerHTML)
      .join("");

    // Check for block/mute completion message
    const isBlocked = mutationString.includes("blocked");
    const isMuted = mutationString.includes("muted");
    
    if (isBlocked || isMuted) {
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
        this.saveUserToStorage(username, isBlocked ? 'block' : 'mute');
        
        // Clear the username after saving
        this.usernameToAction = null;
        
        // Close window if this was from URL
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get("block") || urlParams.get("mute")) {
          window.close();
        }
      }
    }

    this.informBackgroundScriptOfActionCompletion(mutation);
  }

  async saveUserToStorage(username, action) {
    try {
      const settings = await this.settingsManager.loadSettings();
      
      // Initialize stats if they don't exist
      if (!settings.stats) {
        settings.stats = {
          totalBlocks: 0,
          totalMutes: 0,
          blockedUsers: [],
          mutedUsers: []
        };
      }

      // Ensure arrays exist
      if (!settings.stats.blockedUsers) settings.stats.blockedUsers = [];
      if (!settings.stats.mutedUsers) settings.stats.mutedUsers = [];
      
      if (action === 'block') {
        if (!settings.stats.blockedUsers.includes(username)) {
          settings.stats.blockedUsers.push(username);
          settings.stats.totalBlocks = (settings.stats.totalBlocks || 0) + 1;
        }
      } else if (action === 'mute') {
        if (!settings.stats.mutedUsers.includes(username)) {
          settings.stats.mutedUsers.push(username);
          settings.stats.totalMutes = (settings.stats.totalMutes || 0) + 1;
        }
      }
      
      await this.settingsManager.saveSettings(settings);
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

    if (
      mutation.target
        .querySelector(CONFIG.selectors.placementTracking)
        ?.querySelector(`[data-testid*="un${action}"]`)
    ) {
      chrome.runtime.sendMessage(
        { 
          type: "feedback", 
          data: `${action}_button_clicked`, 
          username 
        }
      );
    }
  }

  autoBlockUserFromProfilePageParam(mutation) {
    const urlParams = new URLSearchParams(window.location.search);
    const block = urlParams.get("block");
    const mute = urlParams.get("mute");
    const action = block ? "block" : "mute";

    if (!block && !mute) return;

    if (
      document
        .querySelector(CONFIG.selectors.primaryColumn)
        .textContent.includes("Something went wrong")
    ) {
      this.somethingWentWrong = true;
      chrome.runtime.sendMessage(
        { type: "feedback", data: "something_went_wrong" }
      );
      return;
    }

    const actionButton = document.querySelector(".sw-profile-block-button");
    if (actionButton) {
      actionButton.click();
      chrome.runtime.sendMessage({
        type: "feedback",
        data: "sending message to background script after receiving one"
      });
    }
  }

  autoBlockUserFromStatusPageParam() {
    const username = location.pathname.split("/")[1];
    const statusId = location.pathname.split("/").pop();
    const urlParams = new URLSearchParams(window.location.search);
    const block = urlParams.get("block");

    if (!block) return;

    const blockButtons = document.querySelectorAll(".sw-block-button");
    for (const blockButton of blockButtons) {
      if (
        blockButton.closest("article").querySelector(`a[href*="${statusId}"]`)
      ) {
        blockButton.click();
        chrome.runtime.sendMessage(
          { type: "feedback", data: "block_button_clicked", username }
        );
        break;
      }
    }
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
    const pageType = this.getPageType();
    if (!await this.shouldShowButtonOnPage(pageType)) return;

    this.getElementsFromMutation(mutation, CONFIG.selectors.followButton).forEach((followButton) => {
      this.attachBlockButtonToFollowButton(followButton);
    });
  }

  createBlockAllButton() {
    const blockAllButton = document.createElement("button");
    blockAllButton.textContent = "Block All";
    blockAllButton.id = "block-all-button";
    Object.assign(blockAllButton.style, {
      backgroundColor: this.blockerBgColor,
      border: "none",
      padding: "10px",
      cursor: "pointer",
      borderRadius: "5px",
      marginRight: "20px",
      fontSize: "1em",
      transition: "all 0.1s ease-in-out",
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      placeSelf: "center",
      height: "35px",
      width: "120px",
      color: "firebrick",
      marginTop: "5px",
      marginBottom: "5px"
    });

    blockAllButton.addEventListener("mouseenter", () => {
      Object.assign(blockAllButton.style, {
        backgroundColor: "peachpuff",
        color: "crimson",
        fontSize: "1.1em"
      });
    });

    blockAllButton.addEventListener("mouseleave", () => {
      Object.assign(blockAllButton.style, {
        backgroundColor: this.blockerBgColor,
        color: "firebrick",
        fontSize: "1em"
      });
    });

    return blockAllButton;
  }

  async waitForUsernamesRemoved(usernames) {
    let allRemoved = false;
    let waitDuration = 1000;
    
    while (!allRemoved) {
      await new Promise((resolve) => setTimeout(resolve, waitDuration));

      if (this.somethingWentWrong) {
        console.log("something went wrong, waiting for 60 seconds");
        waitDuration = 60000;
      }

      allRemoved = usernames.every(
        (username) => !document.querySelector(`[href="/${username}"]`)
      );
    }
  }

  addBlockAllButtonToEngagementsPages(mutation) {
    const nav = mutation.target.querySelector("[href*=retweets]")?.closest("nav");
    if (!nav || document.querySelector("#block-all-button")) return;

    const blockAllButton = this.createBlockAllButton();
    nav.parentElement.insertBefore(blockAllButton, nav.nextSibling);

    blockAllButton.addEventListener("click", async () => {
      while (true) {
        const followButtons = Array.from(
          document.querySelectorAll(CONFIG.selectors.followButton)
        );
        if (followButtons.length === 0) break;

        const batch = followButtons.slice(0, 5);
        const usernames = batch.map((followButton) => {
          const username = followButton?.getAttribute("aria-label")?.split("@")?.[1];
          this.sendBlockRequest(username);
          return username;
        });

        await this.waitForUsernamesRemoved(usernames);
      }
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
    const actionText = action.charAt(0).toUpperCase() + action.slice(1);
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
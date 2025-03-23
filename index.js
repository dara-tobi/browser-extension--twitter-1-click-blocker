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
    this.blockerBgColor = document.querySelector("meta[name=theme-color]")?.content;
    this.blockerColor = CONFIG.colors[this.blockerBgColor];

    // Initialize settings
    this.settingsManager = new window.OneClickBlockerSettings.SettingsManager();
    this.settingsUI = new window.OneClickBlockerSettings.SettingsUI(this.settingsManager);
    this.settingsUI.mount();

    this.initMutationObserver();
    this.initMessageListener();
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
        this.usernameToAction = null;
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
    
    // Use the same profile page detection as elsewhere in the code
    const isProfilePage = document.querySelector(CONFIG.selectors.userActions);
    
    // On profile page, mute button is directly before block button
    // On timeline, mute button is two elements before block button
    const muteButton = isProfilePage ? 
      blockButton.previousElementSibling : 
      blockButton.previousElementSibling?.previousElementSibling;
    
    if (muteButton?.textContent?.toLowerCase().includes('@') && !muteButton.textContent.toLowerCase().includes('conversation')) {
      console.log('🔊 Found mute button:', muteButton);
      return muteButton;
    }
    console.log('blockButton', blockButton);
    console.log('blockButton.previousElementSibling', blockButton.previousElementSibling);
    console.log('blockButton.previousElementSibling?.previousElementSibling', blockButton.previousElementSibling?.previousElementSibling);
    console.log('❌ No mute button found', muteButton, 'isProfilePage', isProfilePage);
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
    
    console.log('🔍 Checking for tweet to add action button to...');
    const wrapper = this.detectTweetUsernameWrapper(mutation);
    console.log('📦 Found wrapper:', wrapper);
    if (wrapper) {
      const usernameDiv = wrapper.querySelector(CONFIG.selectors.userName);
      const menuButton = wrapper.querySelector(CONFIG.selectors.menuCaret);
      console.log('🎯 Found elements:', { 
        usernameDiv: !!usernameDiv, 
        menuButton: !!menuButton,
        usernameDivContent: usernameDiv?.innerHTML
      });
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
      this.hideElement(wrapper);
    }
  }

  hideElement(element) {
    if (!element) return;
  element.style.height = "0px";
  element.style.visibility = "hidden";
  }

  handleProfilePageBlockButton(mutation) {
    const pageInfo = this.getProfilePageInfo();
    if (!pageInfo.isProfilePage || pageInfo.isOwnProfilePage) {
      return;
    }

    const userActionsButton = this.getUserActionsButton(mutation);
    if (!userActionsButton || this.hasExistingBlockButton(mutation, userActionsButton)) return;

    this.addProfileBlockButton(userActionsButton);
  }

  getProfilePageInfo() {
    const currentUsername = location.pathname.split("/")[1];
    let isProfilePage = () => {
      return !!document.querySelector(CONFIG.selectors.userActions);
    };
    
    let isOwnProfilePage = () => {
      return (
        document
          .querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')
          ?.querySelector("[tabindex]")
          ?.textContent?.split("@")?.[1] ==
        location.pathname.split("/")[location.pathname.split("/").length - 1]
      );
    };

    return { isProfilePage: isProfilePage(), isOwnProfilePage: isOwnProfilePage() };
  }

  getUserActionsButton(mutation) {
    return mutation.target.querySelector(CONFIG.selectors.userActions);
  }

  hasExistingBlockButton(mutation, userActionsButton) {
    return (
      mutation.target.querySelector(`.${CONFIG.classes.blockButton}`) ||
      userActionsButton.parentElement.querySelector(`.${CONFIG.classes.blockButton}`)
    );
  }

  addProfileBlockButton(userActionsButton) {
    const blockButton = new ProfileBlockButtonUI(this.blockerBgColor, this.blockerColor, this.settingsManager)
      .create();
    userActionsButton.parentElement.appendChild(blockButton);
    blockButton.classList.add(CONFIG.classes.blockButton);

    this.addProfileBlockButtonListeners(blockButton, userActionsButton);
    this.handleAutoBlock(blockButton);
  }

  addProfileBlockButtonListeners(blockButton, userActionsButton) {
    blockButton.addEventListener("click", () => {
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

  async shouldShowButtonOnPage(pageType) {
    const settings = await this.settingsManager.loadSettings();
    return settings.enabledPages?.[pageType] ?? true;
  }

  async attachActionButton(userNameDiv, menuOptionsButton) {
    console.log('🎨 Attempting to attach action button...');
    if (!userNameDiv) {
      console.log('❌ No username div found');
      return;
    }

    const tweetUsername = userNameDiv.querySelectorAll("[href]")?.[1]?.textContent;
    console.log('👤 Tweet username:', tweetUsername);
    
    if (!this.shouldAddActionButton(tweetUsername)) {
      console.log('⏭️ Skipping action button - own tweet or invalid username');
      return;
    }

    const action = await this.getCurrentAction();
    const blockButton = new BlockButtonUI(this.blockerBgColor, this.blockerColor)
      .create(tweetUsername, menuOptionsButton, action);
    
    this.addTweetActionButtonListeners(blockButton, menuOptionsButton);
    
    const menuOptionsWrapper = menuOptionsButton.parentElement;
    console.log('📎 Inserting action button before menu options');
    menuOptionsWrapper.insertBefore(blockButton, menuOptionsButton);

    const grokButton = menuOptionsWrapper.closest('article')
      .querySelector(CONFIG.selectors.grokActions);
    if (grokButton) {
      console.log('🤖 Adjusting position for Grok button');
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
    if (!await this.shouldShowButtonOnPage('engagements')) return;

    const userCell = mutation.target.querySelector(CONFIG.selectors.userCell);
    if (!userCell) return;

    const userActions = userCell.querySelector(CONFIG.selectors.userActions);
    if (!userActions || userActions.parentElement.querySelector(`.${CONFIG.classes.blockButton}`)) return;

    const blockButton = new ProfileBlockButtonUI(this.blockerBgColor, this.blockerColor, this.settingsManager)
      .create('engagements-page');
    userActions.parentElement.appendChild(blockButton);
    blockButton.classList.add(CONFIG.classes.blockButton);

    blockButton.addEventListener('click', () => {
      userActions.click();
      this.triggerMenuOptionClick();
    });
  }

  handleBlockCompletion(mutation) {
    const mutationString = Array.from(mutation.addedNodes)
      .map(node => node.outerHTML)
      .join("");

    // Check for block completion message
    if (mutationString.includes("blocked") || mutationString.includes("muted")) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("block")) {
        window.close();
      }
    }

    this.informBackgroundScriptOfBlockCompletion(mutation);
  }

  informBackgroundScriptOfBlockCompletion(mutation) {
    if (!location.href.includes("block=true")) {
      return;
    }

    if (
      mutation.target
        .querySelector(CONFIG.selectors.placementTracking)
        ?.querySelector('[data-testid*="unblock"]')
    ) {
      const username = location.pathname.split("/")[1];
      chrome.runtime.sendMessage(
        { type: "feedback", data: "block_button_clicked", username }
      );
    }
  }

  autoBlockUserFromProfilePageParam(mutation) {
    const urlParams = new URLSearchParams(window.location.search);
    const block = urlParams.get("block");

    if (!block) return;

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

    const blockButton = document.querySelector(".sw-profile-block-button");
    if (blockButton) {
      blockButton.click();
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

  addBlockButtonsToEngagementsPages(mutation) {    
    if (
      !mutation.target.querySelector(CONFIG.selectors.cellInnerDiv) ||
      !mutation.target.querySelector(CONFIG.selectors.cellInnerDiv).textContent
    ) {
      return;
    }

    const followButtons = mutation.target.querySelectorAll(CONFIG.selectors.followButton);

    followButtons.forEach((followButton) => {
      if (followButton.closest(CONFIG.selectors.hoverCard)) return;

      if (
        followButton &&
        !followButton.parentElement.querySelector(".sw-block-button")
      ) {
        const followButtonParentTweet = followButton.closest(CONFIG.selectors.tweet);
        if (followButtonParentTweet) return;

        const blockButton = new ProfileBlockButtonUI(this.blockerBgColor, this.blockerColor, this.settingsManager)
          .create("engagements-page");
        followButton.parentElement.appendChild(blockButton);
        followButton.parentElement.style.flexDirection = "row";
        blockButton.classList.add("sw-block-button");
        
        blockButton.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const username = followButton?.getAttribute("aria-label")?.split("@")?.[1];
          this.sendBlockRequest(username);
        });
      }
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
      console.log('🔍 Username:', username);
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
    console.log('inner 🔍 Username:', username);
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
      const username = location.pathname.split("/")[1];
      console.log('outer 🔍 Username:', username);
      if (username) {
        const action = await this.settingsManager?.loadSettings().then(settings => settings.action || 'block');
        this.addBlockButtonHoverTitle(button, "@" + username, true, action);
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
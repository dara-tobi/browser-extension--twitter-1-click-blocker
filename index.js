let isBlockClicked = false;
let ownUsername = null;

// click the confirm button on the block confirmation modal
let clickConfirmUserBlock = (mutation) => {
  if (
    !mutation.target
      .querySelector('[data-testid="confirmationSheetConfirm"]')
      ?.classList?.contains("sw-block-button")
  ) {
    // add a custom class to prevent this from being clicked twice
    mutation.target
      .querySelector('[data-testid="confirmationSheetConfirm"]')
      ?.classList?.add("sw-block-button");
    // click the confirm block button
    mutation.target
      .querySelector('[data-testid="confirmationSheetConfirm"]')
      ?.click();
  }
};

// set username so we can know not to add block button to the user's own tweets
let setUsername = () => {
  if (!ownUsername) {
    ownUsername = document
      .querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')
      ?.querySelector("[tabindex]")?.textContent;
  }
};

// detect the div that contains the username and caret, so we can attach the block button and event listeners
let detectTweetUsernameWrapper = (mutation) => {
  let nodeOfInterest = null;
  let mutationString =
    ("mutation",
    Array.from(mutation.addedNodes)
      .map((node) => node.outerHTML)
      .join(""));
  if (mutationString.includes('data-testid="caret"')) {
    mutation.addedNodes.forEach((node) => {
      if (
        node.querySelector('[data-testid="caret"]') &&
        node.closest("article")
      ) {
        let parentElement = node.parentElement;
        while (!parentElement.querySelector('[data-testid="User-Name"]')) {
          if (parentElement.nodeName.toLowerCase() == "article") {
            break;
          }
          parentElement = parentElement.parentElement;
        }
        let userNameDiv = parentElement.querySelector(
          '[data-testid="User-Name"]'
        );
        if (userNameDiv) {
          nodeOfInterest = parentElement;
          return;
        }
      }

      if (node.getAttribute("data-testid") == "cellInnerDiv") {
        nodeOfInterest = node;
      }
    });
  }
  return nodeOfInterest;
};

// get the tweet wrapper and attach the block button
let addBlockButtonsToTimelines = (mutation) => {
  let usernameDivWrapper = detectTweetUsernameWrapper(mutation);
  if (usernameDivWrapper) {
    let usernameDiv = usernameDivWrapper.querySelector(
      '[data-testid="User-Name"]'
    );
    let caret = usernameDivWrapper.querySelector('[data-testid="caret"]');
    attachBlockButton(usernameDiv, caret);
  }
};

// hide the menu that pops up when you click the caret
let hideCaretMenu = (mutation) => {
  if (
    mutation.target.querySelector('[role="menu"]') &&
    !mutation.target
      .querySelector('[role="menu"]')
      .classList.contains("sw-menu")
  ) {
    mutation.target.querySelector('[role="menu"]').classList.add("sw-menu");
    if (isBlockClicked) {
      let blockButton = document.querySelector('[data-testid="block"]');
      if (blockButton) {
        mutation.target.querySelector('[role="menu"]').style.opacity = 0;
      } else {
        // if, for some reason, the block button doesn't exist, remove the tweet menu
        mutation.target.querySelector('[role="menu"]').remove();
      }
    } else {
      // unhide the tweet menu
      mutation.target.querySelector('[role="menu"]').style.opacity = 1;
    }
  }
};

// hide an element with CSS
let hideElement = (element) => {
  if (!element) {
    return;
  }
  element.style.height = "0px";
  element.style.visibility = "hidden";
};

// hide the thank you message that pops up after you block a user
let temporarilyHideTwitterThankYouMessage = (mutation) => {
  // get the string of the mutation
  let mutationString =
    ("mutation",
    Array.from(mutation.addedNodes)
      .map((node) => node.outerHTML)
      .join(""));
  // if the mutation contains the thank you message, hide it
  if (
    mutationString.includes("X will use this to make your timeline better.")
  ) {
    let tweetWrapper = mutation.target.closest('[data-testid="cellInnerDiv"]');
    hideElement(tweetWrapper);
  }
};

let addBlockButtonToProfilePage = (mutation) => {
  let isProfilePage = null;
  let isOwnProfilePage = null;
  let userActionsButton = null;
  if (
    !!document.querySelector(
      `[data-testid="UserAvatar-Container-${location.pathname.split("/")[1]}"]`
    )
  ) {
    isProfilePage = true;
  }

  if (
    document
      .querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')
      ?.querySelector("[tabindex]")
      ?.textContent?.split("@")?.[1] == location.pathname.split("/")[1]
  ) {
    isOwnProfilePage = true;
  }

  if (isOwnProfilePage) {
    // when we navigate to our own profile page, from another profile page where there's a block button
    // Twitter retains the button appended on that user's profile page, remove the block button from our own profile page
    if (mutation.target.querySelector(".sw-block-button")) {
      mutation.target.querySelector(".sw-block-button").remove();
    }
  }

  if (isProfilePage && !isOwnProfilePage) {
    userActionsButton = mutation.target.querySelector(
      '[data-testid="userActions"]'
    );
  } else {
    return null;
  }

  // check if this is the user actions button
  if (mutation.target.querySelector('[data-testid="userActions"]')) {
    userActionsButton = mutation.target.querySelector(
      '[data-testid="userActions"]'
    );
  }

  if (!userActionsButton) {
    return null;
  }

  if (userActionsButton) {
    if (mutation.target.querySelector(".sw-block-button")) {
      return null;
    }

    let blockButton = createProfileBlockButton();
    let userActionsButtonContainer = userActionsButton.parentElement;
    userActionsButtonContainer.appendChild(blockButton);
    // add class to block button so we can detect it later
    blockButton.classList.add("sw-block-button");

    blockButton.addEventListener("click", () => {
      userActionsButton.click();
      triggerBlockMenuOptionClick();
    });

    let urlParams = new URLSearchParams(window.location.search);
    let block = urlParams.get("block");

    if (block) {
      blockButton.click();
      triggerBlockMenuOptionClick();
     
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // message received from background script
        chrome.runtime.sendMessage(
          {
            type: "feedback",
            data: "sending message to background script after receving one",
          },
          (response) => {
            // console.log("response", response);
          }
        );
      });
    }
  }
};

let sendBlockRequest = (username) => {
  chrome.runtime.sendMessage(
    { type: "open_tab", username, block: true },
    (response) => {
      // console.log("response", response);
    }
  );
};

let addBlockButtonsToEngagementsPages = (mutation) => {
  // if we're not on the likes or retweets or followers or following or verified followers or followers you follow page, return
  if (
    !window.location.pathname.includes("/likes") &&
    !window.location.pathname.includes("/retweets") &&
    !window.location.pathname.includes("/followers") &&
    !window.location.pathname.includes("/following") &&
    !window.location.pathname.includes("/verified_followers") &&
    !window.location.pathname.includes("/followers_you_follow") &&
    !window.location.pathname.includes("/status")
  ) {
    return;
  }

  let followButtons = mutation.target.querySelectorAll(
    '[data-testid*="-follow"]'
  );

  followButtons.forEach((followButton) => {
    if (followButton.closest('[data-testid="HoverCard"]')) {
      return;
    }

    if (
      followButton &&
      !followButton.parentElement.querySelector(".sw-block-button")
    ) {
      let blockButton = createProfileBlockButton("engagements-page");
      followButton.parentElement.appendChild(blockButton);
      followButton.parentElement.style.flexDirection = "row";
      blockButton.classList.add("sw-block-button");
      blockButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        let username = followButton
          ?.getAttribute("aria-label")
          ?.split("@")?.[1];

        sendBlockRequest(username);
      });
    }
  });
};

let informBackgroundScriptOfBlockCompletion = (mutation) => {
  if (!location.href.includes("block=true")) {
    return;
  }

  if (
    mutation.target.querySelector('[data-testid="placementTracking"]')
      ?.textContent == "Blocked"
  ) {
    let username = location.pathname.split("/")[1];
    chrome.runtime.sendMessage(
      { type: "feedback", data: "block_button_clicked", username },
      (response) => {
        // console.log("response", response);
      }
    );
  }
};
// create mutation observer to detect when new nodes are added to the DOM
let initAndCreateMutationObserver = () => {
  let mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        setUsername();
        clickConfirmUserBlock(mutation);
        hideCaretMenu(mutation);
        addBlockButtonsToTimelines(mutation);
        temporarilyHideTwitterThankYouMessage(mutation);
        addBlockButtonToProfilePage(mutation);
        addBlockButtonsToEngagementsPages(mutation);
        informBackgroundScriptOfBlockCompletion(mutation);
      }
    });
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
  });
};

// create block button
let createBlockButton = () => {
  let blockButton = document.createElement("div");
  blockButton.style.cursor = "pointer";
  blockButton.style.textAlign = "center";
  blockButton.style.borderRadius = "5px";
  blockButton.style.marginRight = "20px";
  blockButton.addEventListener("mouseenter", () => {
    blockButton.style.fontSize = ".9em";
  });
  blockButton.addEventListener("mouseleave", () => {
    blockButton.style.fontSize = "0.6em";
  });
  blockButton.style.backgroundColor = "mistyrose";
  blockButton.style.lineHeight = "10px";
  blockButton.style.width = "12px";
  blockButton.style.fontSize = "0.6em";
  blockButton.textContent = "🚫";
  blockButton.style.transition = "font-size 0.2s ease-in";
  blockButton.style.boxSizing = "border-box";
  blockButton.style.display = "flex";
  blockButton.style.alignItems = "center";
  blockButton.style.justifyContent = "center";
  blockButton.style.placeSelf = "center";
  blockButton.style.height = "25px";
  blockButton.style.width = "40px";

  return blockButton;
};

let createProfileBlockButton = (page) => {
  let blockButton = document.createElement("div");

  blockButton.style.cursor = "pointer";
  blockButton.style.textAlign = "center";
  blockButton.style.borderRadius = "5px";
  blockButton.addEventListener("mouseenter", () => {
    blockButton.style.fontSize = "0.9em";
  });
  blockButton.addEventListener("mouseleave", () => {
    blockButton.style.fontSize = "0.6em";
  });
  blockButton.style.fontSize = "0.6em";
  blockButton.style.backgroundColor = "mistyrose";
  blockButton.style.transition = "font-size 0.2s ease-in";

  blockButton.style.boxSizing = "border-box";
  blockButton.style.display = "flex";
 
  blockButton.style.alignItems = "center";
  blockButton.style.justifyContent = "center";
  blockButton.style.placeSelf = "center";
  blockButton.textContent = "🚫";
  blockButton.style.marginLeft = "5px";

  if (page !== "engagements-page") {
    blockButton.style.marginBottom = "12px";
  }
  blockButton.style.width = "40px";
  blockButton.style.height = "25px";

  return blockButton;
};
// check if we should add the block button to the tweet
let shouldAddBlockButton = (userNameDiv) => {
  if (!userNameDiv) {
    return false;
  }
  let tweetUsername = userNameDiv.querySelectorAll("[href]")?.[1]?.textContent;
  // don't add block buttons to the user's own tweets; don't add block buttons to the home page
  if (
    tweetUsername !== ownUsername &&
    !window.location.pathname.includes("/home")
  ) {
    return true;
  }
};

// trigger the click event on the caret
let triggerMenuclick = (caret) => {
  // set isBlockClicked to true so that we know this feature is currently active
  isBlockClicked = true;
  caret.click();
};

// trigger the click event on the block menu option
let triggerBlockMenuOptionClick = () => {
  chrome.runtime.sendMessage(
    { type: "feedback", data: "trying to click block button" },
    (response) => {
      // console.log("response", response);
    }
  );
  setTimeout(() => {
    let blockButton = document.querySelector('[data-testid="block"]');
    // set isBlockClicked to false so that this feature is no longer active and doesn't interfere with other features
    isBlockClicked = false;
    if (!blockButton) {
      return;
    }
    blockButton?.click();
  }, 20);
};

let hideTweetDiv = (caret) => {
  let tweetDiv = caret.closest("article");
  hideElement(tweetDiv);
};

// add event listeners to the block button
let addBlockButtonEventListeners = (blockButton, caret) => {
  blockButton.addEventListener("click", (e) => {
    e.stopPropagation();
    triggerMenuclick(caret);
    hideTweetDiv(caret);
    triggerBlockMenuOptionClick(caret);
  });
};

// attach the block button to the tweet
let attachBlockButton = (userNameDiv, caret) => {
  if (shouldAddBlockButton(userNameDiv)) {
    let blockButton = createBlockButton();
    addBlockButtonEventListeners(blockButton, caret);
    let caretWrapper = caret.parentElement;
    caretWrapper.insertBefore(blockButton, caret);
  }
};

// initialize the app; create mutation observer
initAndCreateMutationObserver();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // message received from background script
  if (message.type == "finished_blocking") {
    // get the username of the user that was blocked
    let username = message.username;
    let blockedUserWrapper = document.querySelector(`[href="/${username}"]`).closest('[data-testid="cellInnerDiv"]');
    blockedUserWrapper.remove();
  }
});
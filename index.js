let isBlockClicked = false;
let ownUsername = null;
let somethingWentWrong = false;

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
    
    let blockConfirmationButton = mutation.target.querySelector('[data-testid="confirmationSheetConfirm"]');
    if (blockConfirmationButton && blockConfirmationButton.textContent.toLowerCase() == "block") {
      // click the confirm block button
      blockConfirmationButton.click();
    }
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
      ?.textContent?.split("@")?.[1] == location.pathname.split("/")[location.pathname.split("/").length - 1]
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
    if (mutation.target.querySelector(".sw-block-button") || userActionsButton.parentElement.querySelector(".sw-block-button")) {
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
      if (document.querySelector('[data-testid="primaryColumn"]').textContent.includes('Something went wrong')) {
        somethingWentWrong = true;

        // close the tab
        chrome.runtime.sendMessage(
          { type: "feedback", data: "something_went_wrong" },
          (response) => {
            // console.log("response", response);
          }
        );
        return;
      }

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
  let isAUserProfilePage = document.querySelector('[data-testid="userActions"]');
  // if there's no tweets on the page, return. Else, the extension crashes
  if (
    !mutation.target.querySelector('[data-testid="cellInnerDiv"]') ||
    !mutation.target.querySelector('[data-testid="cellInnerDiv"]').textContent
    || isAUserProfilePage
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

let createBlockAllButton = () => {
  let blockAllButton = document.createElement("button");
  blockAllButton.textContent = "Block All";
  blockAllButton.id = "block-all-button";
  blockAllButton.style.backgroundColor = "mistyrose";
  blockAllButton.style.border = "none";
  blockAllButton.style.padding = "10px";
  blockAllButton.style.cursor = "pointer";
  blockAllButton.style.borderRadius = "5px";
  blockAllButton.style.marginRight = "20px";
  blockAllButton.style.fontSize = "1em";
  blockAllButton.style.transition = "all 0.2s ease-in";
  blockAllButton.style.boxSizing = "border-box";
  blockAllButton.style.display = "flex";
  blockAllButton.style.alignItems = "center";
  blockAllButton.style.justifyContent = "center";
  blockAllButton.style.placeSelf = "center";
  blockAllButton.style.height = "35px";
  blockAllButton.style.width = "120px";
  blockAllButton.style.color = "firebrick";
  blockAllButton.style.marginTop = "5px";
  blockAllButton.style.marginBottom = "5px";

  // darken the button when hovered
  blockAllButton.addEventListener("mouseenter", () => {
    blockAllButton.style.backgroundColor = "peachpuff";
    blockAllButton.style.color = "crimson";
    blockAllButton.style.fontSize = "1.1em";
  });

  // lighten the button when not hovered
  blockAllButton.addEventListener("mouseleave", () => {
    blockAllButton.style.backgroundColor = "mistyrose";
    blockAllButton.style.color = "firebrick";
    blockAllButton.style.fontSize = "1em";
  });

  return blockAllButton;
};

let addBlockAllButtonToEngagementsPages = (mutation) => {
  // let nav = document.querySelector('[href*=retweets]').closest('nav');
  let nav = mutation.target.querySelector("[href*=retweets]")?.closest("nav");
  if (!nav || document.querySelector("#block-all-button")) {
    return;
  } else {
    console.log("we are on the engagements page");
    console.log(
      "engagement page = ",
      location.pathname.split("/")[location.pathname.split("/").length - 1]
    );
    // insert block all button after nav
    let blockAllButton = createBlockAllButton();
    nav.parentElement.insertBefore(blockAllButton, nav.nextSibling);

    blockAllButton.addEventListener("click", async () => {
      while (true) {
        let followButtons = Array.from(
          document.querySelectorAll('[data-testid*="-follow"]')
        );
        if (followButtons.length === 0) break;

        let batch = followButtons.slice(0, 5);
        let usernames = batch.map((followButton) => {
          let username = followButton
            ?.getAttribute("aria-label")
            ?.split("@")?.[1];
          console.log("username block request being sent", username);
          sendBlockRequest(username);
          return username;
        });
        console.log("usernames", usernames);
        console.log("waiting for usernames to be removed");
        await waitForUsernamesRemoved(usernames);
        console.log("usernames removed");
      }
    });

    async function waitForUsernamesRemoved(usernames) {
      let allRemoved = false;
      let waitDuration = 1000;
      while (!allRemoved) {
        await new Promise((resolve) => setTimeout(resolve, waitDuration)); // check every second

        if (somethingWentWrong) {
          console.log("something went wrong, waiting for 60 seconds");
          waitDuration = 60000;
        }

        allRemoved = usernames.every(
          (username) => !document.querySelector(`[href="/${username}"]`)
        );

        console.log("allRemoved", allRemoved ? "true" : "false");
      }
    }
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
        // addBlockAllButtonToEngagementsPages(mutation); // not yet ready for release
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
  // don't add block buttons to the user's own tweets
  if (
    tweetUsername !== ownUsername
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
    let blockedUserWrapper = document
      .querySelector(`[href="/${username}"]`)
      ?.closest('[data-testid="UserCell"]');
    blockedUserWrapper?.remove();
  }

  if (message.type == "something_went_wrong") {
    let errorWrapper = document.createElement("div");
    errorWrapper.style.backgroundColor = "red";
    errorWrapper.style.color = "white";
    errorWrapper.style.textAlign = "center";
    errorWrapper.style.padding = "10px";
    errorWrapper.style.borderRadius = "5px";
    errorWrapper.style.margin = "20px";
    errorWrapper.textContent = "Something went wrong. Please try again later.";
    document.body.appendChild(errorWrapper);
  }
});

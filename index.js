let isBlockClicked = false;
let ownUsername = null;
let somethingWentWrong = false;
let usernameToBlock = null;
let blockerBgColor = document.querySelector("meta[name=theme-color]")?.content;
let blockerColor = {
  "#000000": "rgb(113, 118, 123)",
  "#15202B": "rgb(139, 152, 165)",
  "#FFFFFF": "rgb(83, 100, 113)",
}[blockerBgColor];

let checkIfTweetIsSpam = (mutation) => {
  // location.href.includes('https://x.com/search?q=')
  if (!location.href.includes("https://x.com/search?q=")) {
    // not on search page, so no need to check for spam... return
    return;
  }

  // check if mutation is a tweet

  let tweet = mutation.target.closest('[data-testid="tweet"]');
  if (!tweet) {
    return;
  }

  if (tweet.textContent.includes("Replying to")) {
    // console.log("tweet is a reply, returning", tweet.textContent);
    return;
  }

  let tweetText = tweet.querySelector('[data-testid="tweetText"]');

  if (!tweetText || tweetText.getAttribute("data-spam-checked")) {
    return;
  }

  let time = tweet.querySelector("time");
  console.log("time", time.getAttribute("datetime"));
  let statusId = time?.closest("a")?.getAttribute("href")?.split("/")?.pop();
  console.log("statusId", statusId);

  // add attribute to tweet so we know it's been checked
  tweetText.setAttribute("data-spam-checked", "true");

  let tweetTextContent = tweetText.textContent;
  // console.log("tweet", tweet.querySelector('[data-testid="tweetText"]')?.textContent);

  // send tweet to background script to check if it's spam
  chrome.runtime.sendMessage(
    { type: "check_spam", tweetTextContent },
    (response) => {
      console.log("response from service worker spam checker", response);
      if (response.is_spam?.is_spam && response.is_spam?.is_spam === true) {
        tweetText.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
      }
    }
  );
};
// click the confirm button on the block confirmation modal
let clickConfirmUserBlock = (mutation) => {
  if (
    !mutation.target
      .querySelector('[data-testid="confirmationSheetConfirm"]')
      ?.classList?.contains("sw-block-confirmation-clicked")
  ) {
    // add a custom class to prevent this from being clicked twice
    mutation.target
      .querySelector('[data-testid="confirmationSheetConfirm"]')
      ?.classList?.add("sw-block-confirmation-clicked");

    let blockConfirmationBlockButton = mutation.target.querySelector(
      '[data-testid="confirmationSheetConfirm"]'
    );
    let confirmationSheetDialog = mutation.target.querySelector(
      '[data-testid="confirmationSheetDialog"]'
    );

    // confirmation dialog is present and contains confirmation button
    if (blockConfirmationBlockButton) {
      // we're blocking from the block button attached to a tweet
      if (usernameToBlock) {
        let doesConfirmationDialogContainUsernameToBlock =
          confirmationSheetDialog?.textContent
            ?.toLowerCase()
            ?.includes(usernameToBlock.toLowerCase());

        if (doesConfirmationDialogContainUsernameToBlock) {
          blockConfirmationBlockButton.click();
          usernameToBlock = null;
        }
      }

      // we're blocking from the block button attached to a profile page
      if (document.querySelector('[data-testid="userActions"]')) {
        blockConfirmationBlockButton.click();
      }
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

let isProfilePage = () => {
  return !!document.querySelector(
    `[data-testid="UserAvatar-Container-${location.pathname.split("/")[1]}"]`
  );
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

let addBlockButtonToProfilePage = (mutation) => {
  let userActionsButton = null;

  if (isOwnProfilePage()) {
    // when we navigate to our own profile page, from another profile page where there's a block button
    // Twitter retains the button appended on that user's profile page, remove the block button from our own profile page
    if (mutation.target.querySelector(".sw-block-button")) {
      mutation.target.querySelector(".sw-block-button").remove();
    }
  }

  if (isProfilePage() && !isOwnProfilePage()) {
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
    if (
      mutation.target.querySelector(".sw-block-button") ||
      userActionsButton.parentElement.querySelector(".sw-block-button")
    ) {
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

    // trigger custom event to let us know the block button has been added
    document.dispatchEvent(new Event("profileBlockButtonAdded"));
  }
};

let autoBlockUserFromProfilePageParam = (mutation) => {
  let urlParams = new URLSearchParams(window.location.search);
  let block = urlParams.get("block");

  // if there's no block param, then we don't need to block the user, return
  if (!block) {
    return;
  }

  if (block) {
    if (
      document
        .querySelector('[data-testid="primaryColumn"]')
        .textContent.includes("Something went wrong")
    ) {
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

    let blockButton = document.querySelector(".sw-profile-block-button");

    blockButton.click();

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
};

let autoBlockUserFromStatusPageParam = () => {
  let username = location.pathname.split("/")[1];
  let statusId = location.pathname.split("/").pop();
  let urlParams = new URLSearchParams(window.location.search);
  let block = urlParams.get("block");

  // if there's no block param, then we don't need to block the user, return
  if (!block) {
    return;
  }

  let blockButtons = document.querySelectorAll(".sw-block-button");
  for (let blockButton of blockButtons) {
    if (
      blockButton.closest("article").querySelector(`a[href*="${statusId}"]`)
    ) {
      // dispatch event to let us know the block button has been added
      blockButton.click();

      chrome.runtime.sendMessage(
        { type: "feedback", data: "block_button_clicked", username },
        (response) => {
          // console.log("response", response);
        }
      );

      break;
    }
  


  }
}

let sendBlockRequest = (username) => {
  chrome.runtime.sendMessage(
    { type: "open_tab", username, block: true },
    (response) => {
      // console.log("response", response);
    }
  );
};

let addBlockButtonsToEngagementsPages = (mutation) => {
  let isAUserProfilePage = document.querySelector(
    '[data-testid="userActions"]'
  );
  // if there's no tweets on the page, return. Else, the extension crashes
  if (
    !mutation.target.querySelector('[data-testid="cellInnerDiv"]') ||
    !mutation.target.querySelector('[data-testid="cellInnerDiv"]')
      .textContent ||
    isAUserProfilePage
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
      let followButtonParentTweet = followButton.closest(
        '[data-testid="tweet"]'
      );
      if (followButtonParentTweet) {
        // This follow button is inside a tweet. This happens when viewing a conversation within bookmarks.
        // Tweets already have their block buttons. No need for an additional block button attached to a follow button that is in a tweet
        return;
      }

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
    mutation.target
      .querySelector('[data-testid="placementTracking"]')
      ?.querySelector('[data-testid*="unblock"]')
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
  blockAllButton.style.backgroundColor = blockerBgColor;
  blockAllButton.style.border = "none";
  blockAllButton.style.padding = "10px";
  blockAllButton.style.cursor = "pointer";
  blockAllButton.style.borderRadius = "5px";
  blockAllButton.style.marginRight = "20px";
  blockAllButton.style.fontSize = "1em";
  blockAllButton.style.transition = "all 0.1s ease-in-out";
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
    blockAllButton.style.backgroundColor = blockerBgColor;
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

// create block button
let createBlockButton = (tweetUsername) => {
  let wrapper = document.createElement("div");
  wrapper.classList.add("sw-block-button-wrapper");
  wrapper.style.display = "grid";
  wrapper.style.position = "absolute";
  wrapper.style.borderRadius = "100%";

  wrapper.style.top = "-8px";
  wrapper.style.right = "15px";
  wrapper.style.placeItems = "center";
  // put icon and background in the same template area
  wrapper.style.gridTemplateAreas = `"icon"`;
  wrapper.style.gridTemplateColumns = "1fr";

  let blockButton = document.createElement("div");
  blockButton.style.gridArea = "icon";
  blockButton.classList.add("sw-block-button");
  let blockButtonBackground = document.createElement("div");
  blockButtonBackground.style.gridArea = "icon";
  blockButtonBackground.classList.add("sw-block-button-background");
  blockButtonBackground.style.backgroundColor = blockerBgColor;
  blockButtonBackground.style.borderRadius = "100%";

  blockButtonBackground.style.height = "33px";
  blockButtonBackground.style.width = "33px";
  blockButtonBackground.style.zIndex = "-1";
  blockButtonBackground.style.transition = "all 0.1s ease-in-out";
  blockButtonBackground.style.boxSizing = "border-box";
  // top , left
  // blockButtonBackground.style.top = "-11px";
  // blockButtonBackground.style.left = "-14px";

  wrapper.style.cursor = "pointer";
  blockButton.style.textAlign = "center";
  blockButton.style.borderRadius = "100%";

  wrapper.style.marginRight = "15px";
  blockButton.style.backgroundColor = blockerBgColor;
  blockButton.style.lineHeight = "10px";

  blockButton.innerHTML = `<svg style="transition: all 0.1s ease-in-out" class="sw-block-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="16" height="16" fill="${blockerBgColor}">
  <circle cx="36" cy="36" r="29" stroke="${blockerColor}" stroke-width="7"/>
  <line x1="17" y1="17" x2="55" y2="55" stroke="${blockerColor}" stroke-width="7" />
</svg>`;

  blockButton.style.transition = "all 0.1s ease-in-out";
  blockButton.style.boxSizing = "border-box";
  blockButton.style.display = "flex";
  blockButton.style.alignItems = "center";
  blockButton.style.justifyContent = "center";
  blockButton.style.placeSelf = "center";

  // add username to the block button so we can use it later
  wrapper.dataset.username = tweetUsername;
  wrapper.appendChild(blockButtonBackground);
  wrapper.appendChild(blockButton);

  return wrapper;
};

let createProfileBlockButton = (page) => {
  let blockButton = document.createElement("div");
  blockButton.classList.add("sw-profile-block-button");
  blockButton.style.cursor = "pointer";
  blockButton.style.textAlign = "center";
  blockButton.style.borderRadius = "100%";
  blockButton.style.position = "relative";
  blockButton.addEventListener("mouseenter", () => {
    // blockButton.style.fontSize = "0.9em";
    blockButton.style.backgroundColor = "rgba(255,0,64, 0.1)";

    blockButton
      .querySelector(".sw-block-icon")
      .querySelector("circle").style.stroke = "rgb(255,0,64)";
    blockButton
      .querySelector(".sw-block-icon")
      .querySelector("line").style.stroke = "rgb(255,0,64)";

    blockButton.querySelector(".sw-block-icon").style.fill =
      "rgb(255,0,64, 0.1)";

    // add a tiny block of text that says "Block User"
    addBlockButtonHoverTitle(blockButton, true);
  });

  blockButton.addEventListener("mouseleave", () => {
    blockButton.style.backgroundColor = blockerBgColor;
    blockButton.querySelector(".sw-block-icon").style.fill = blockerBgColor;
    blockButton
      .querySelector(".sw-block-icon")
      .querySelector("circle").style.stroke = blockerColor;
    blockButton
      .querySelector(".sw-block-icon")
      .querySelector("line").style.stroke = blockerColor;

    let blockText = document.querySelector("#sw-tooltip-block-text");
    if (blockText) {
      blockText.remove();
    }
  });

  blockButton.style.backgroundColor = blockerBgColor;
  blockButton.style.transition = "all 0.1s ease-in-out";

  blockButton.style.boxSizing = "border-box";
  blockButton.style.display = "flex";

  blockButton.style.alignItems = "center";
  blockButton.style.justifyContent = "center";
  blockButton.style.placeSelf = "center";
  blockButton.innerHTML = `<svg title="Block User" class="sw-block-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="16" height="16" fill="${blockerBgColor}">
  <circle cx="36" cy="36" r="29" stroke="${blockerColor}" stroke-width="7"/>
  <line x1="17" y1="17" x2="55" y2="55" stroke="${blockerColor}" stroke-width="7"/>
</svg>`;
  blockButton.style.marginLeft = "5px";

  if (page !== "engagements-page") {
    blockButton.style.marginBottom = "6px";
  }
  blockButton.style.width = "40px";
  blockButton.style.height = "40px";

  return blockButton;
};
// check if we should add the block button to the tweet
let shouldAddBlockButton = (tweetUsername) => {
  // don't add block buttons to the user's own tweets
  if (tweetUsername !== ownUsername) {
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
    let blockMenuOptionsBlockOption = document.querySelector(
      '[data-testid="block"]'
    );
    // set isBlockClicked to false so that this feature is no longer active and doesn't interfere with other features
    isBlockClicked = false;
    if (!blockMenuOptionsBlockOption) {
      return;
    }
    blockMenuOptionsBlockOption?.click();
  }, 20);
};

let hideTweetDiv = (caret) => {
  let tweetDiv = caret.closest("article");
  hideElement(tweetDiv);
};

// add event listeners to the block button
let addBlockButtonEventListeners = (blockButton, caret) => {
  let blockButtonWrapper = blockButton;

  let blockButtonBackground = blockButton.querySelector(
    ".sw-block-button-background"
  );

  blockButtonWrapper.addEventListener("click", (e) => {
    usernameToBlock = blockButtonWrapper.dataset.username;
    e.stopPropagation();
    triggerMenuclick(caret);
    hideTweetDiv(caret);
    triggerBlockMenuOptionClick(caret);
  });

  blockButtonWrapper.addEventListener("mouseenter", () => {
    blockButtonWrapper.style.transition = "all 0.1s ease-in-out";
    // blockButton.style.backgroundColor = "rgba(255,0,64, 0.1)";
    blockButton.style.backgroundColor = "rgba(255,0,64, 0.1)";
    blockButton.style.color = "rgb(255,0,64)";

    blockButton
      .querySelector(".sw-block-icon")
      .querySelector("circle").style.stroke = "rgb(255,0,64)";
    blockButton
      .querySelector(".sw-block-icon")
      .querySelector("line").style.stroke = "rgb(255,0,64)";

    blockButtonWrapper.style.transform = "rotate(270deg)";

    blockButton.querySelector(".sw-block-icon").style.fill =
      "rgb(255,0,64, 0.1)";

    // blockButton.querySelector(".sw-block-icon").style.backgroundColor =
    //   "rgba(255,0,64, 0.1)";

    blockButtonBackground.style.backgroundColor = "rgba(255,0,64, 0.1)";

    // add a tiny block of text that says "Block User"

    addBlockButtonHoverTitle(blockButton);
  });

  blockButtonWrapper.addEventListener("mouseleave", () => {
    blockButton.style.backgroundColor = blockerBgColor;
    blockButton.style.color = blockerColor;

    blockButton
      .querySelector(".sw-block-icon")
      .querySelector("circle").style.stroke = blockerColor;
    blockButton
      .querySelector(".sw-block-icon")
      .querySelector("line").style.stroke = blockerColor;

    blockButtonWrapper.style.transform = "rotate(0deg)";

    blockButton.querySelector(".sw-block-icon").style.fill = blockerBgColor;

    // blockButton.querySelector(".sw-block-icon").style.backgroundColor =
    //   blockerBgColor;

    // wrapper
    blockButton.style.backgroundColor = blockerBgColor;
    blockButtonBackground.style.backgroundColor = blockerBgColor;

    let blockText = document.querySelector("#sw-tooltip-block-text");

    if (blockText) {
      blockText.remove();
    }
  });
};
let addBlockButtonHoverTitle = (blockButton, isProfile = false) => {
  let username = blockButton.dataset.username || "User";

  let hasAddedBlockText = document.querySelector("#sw-tooltip-block-text");
  if (hasAddedBlockText) {
    return;
  }
  let titleParent = document.createElement("div");
  titleParent.id = "sw-tooltip-block-text";
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
      <div role="tooltip" >
        <span dir="ltr" data-testid="HoverLabel" style="font-weight: 400; color: #fff; font-family: 'TwitterChirp', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <span>Block ${username}</span>
        </span>
      </div>
    `;

  // get position of block button
  let blockButtonPosition = blockButton.getBoundingClientRect();

  titleParent.style.top = `${blockButtonPosition.top + 42}px`;

  // left should be dynamic so that it's always centered regadless of title parent width
  titleParent.style.left = `calc(50% + ${blockButtonPosition.left}px - 50% + 15px)`;

  if (isProfile) {
    titleParent.style.left = `calc(50% + ${blockButtonPosition.left}px - 50% + 20px)`;
  } else {
    titleParent.style.left = `calc(50% + ${blockButtonPosition.left}px - 50% + 15px)`;
  }

  titleParent.style.transform = "translateX(-50%)";

  document.body.appendChild(titleParent);
};

// attach the block button to the tweet
let attachBlockButton = (userNameDiv, caret) => {
  if (!userNameDiv) {
    return;
  }

  let tweetUsername = userNameDiv.querySelectorAll("[href]")?.[1]?.textContent;
  if (shouldAddBlockButton(tweetUsername)) {
    let blockButton = createBlockButton(tweetUsername);
    addBlockButtonEventListeners(blockButton, caret);
    let caretWrapper = caret.parentElement;
    caretWrapper.insertBefore(blockButton, caret);

    if (
      caretWrapper
        .closest("article")
        .querySelector('[data-testid$="subscribe"]')
    ) {
      blockButton.style.right = "110px";
    }

    if (location.href.includes("status")) {
      let statusId = location.pathname.split("/").pop();


      let blockButtonParentArticle = caretWrapper.closest("article");
      if (blockButtonParentArticle.querySelector(`a[href*="${statusId}"]`)) {
        // dispatch event to let us know the block button has been added
        document.dispatchEvent(new Event("statusPageBlockButtonAdded"));
      }
    }
  }
};

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
        checkIfTweetIsSpam(mutation);

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

// initialize the app; create mutation observer
initAndCreateMutationObserver();
document.addEventListener("profileBlockButtonAdded", () => {
  console.log("block button added");
  autoBlockUserFromProfilePageParam();
});

document.addEventListener("statusPageBlockButtonAdded", () => {
  console.log("block button added to status page");
  autoBlockUserFromStatusPageParam()
});

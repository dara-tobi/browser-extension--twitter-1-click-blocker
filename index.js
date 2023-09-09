let isBlockClicked = false;
let ownUsername = null;

// click the confirm button on the block confirmation modal
let clickConfirmUserBlock = mutation => {
  if (!mutation.target.querySelector('[data-testid="confirmationSheetConfirm"]')?.classList?.contains('sw-block-button')) {
    // add a custom class to prevent this from being clicked twice
    mutation.target.querySelector('[data-testid="confirmationSheetConfirm"]')?.classList?.add('sw-block-button');
    // click the confirm block button
    mutation.target.querySelector('[data-testid="confirmationSheetConfirm"]')?.click();
  }
}

// set username so we can know not to add block button to the user's own tweets
let setUsername = () => {
  if (!ownUsername) {
    ownUsername = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')?.querySelector('[tabindex]')?.textContent;
  }
}

// detect the div that contains the username and caret, so we can attach the block button and event listeners
let detectTweetUsernameWrapper = mutation => {
  let nodeOfInterest = null;
  let mutationString = ('mutation', Array.from(mutation.addedNodes).map(node => node.outerHTML).join(''));
  if (mutationString.includes('data-testid="caret"')) {
    mutation.addedNodes.forEach(node => {
      if (node.querySelector('[data-testid="caret"]') && node.closest('article')) {
        let parentElement = node.parentElement;
        while (!parentElement.querySelector('[data-testid="User-Name"]')) {
          if (parentElement.nodeName.toLowerCase() == 'article') {
            break;
          }
          parentElement = parentElement.parentElement;
        }
        let userNameDiv = parentElement.querySelector('[data-testid="User-Name"]')
        if (userNameDiv) {
          nodeOfInterest = parentElement;
          return;
        }
      }

      if (node.getAttribute('data-testid') == 'cellInnerDiv') {
        nodeOfInterest = node;
      }
    })
  }
  return nodeOfInterest;
}

// get the tweet wrapper and attach the block button
let getTweetWrapperAndAttachBlockButton = mutation => {
  let usernameDivWrapper = detectTweetUsernameWrapper(mutation);
  if (usernameDivWrapper) {
    let usernameDiv = usernameDivWrapper.querySelector('[data-testid="User-Name"]');
    let caret = usernameDivWrapper.querySelector('[data-testid="caret"]');
    attachBlockButton(usernameDiv, caret);
  }
}

// hide the menu that pops up when you click the caret
let hideCaretMenu = mutation => {
  if (mutation.target.querySelector('[role="menu"]') && !mutation.target.querySelector('[role="menu"]').classList.contains('sw-menu')) {
    mutation.target.querySelector('[role="menu"]').classList.add('sw-menu');
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
}

// hide an element with CSS
let hideElement = element => {
  if (!element) {
    return;
  }
  element.style.height = '0px';
  element.style.visibility = 'hidden';
}

// hide the thank you message that pops up after you block a user
let temporarilyHideTwitterThankYouMessage = mutation => {
  // get the string of the mutation
  let mutationString = ('mutation', Array.from(mutation.addedNodes).map(node => node.outerHTML).join(''));
  // if the mutation contains the thank you message, hide it
  if (mutationString.includes('X will use this to make your timeline better.')) {
    let tweetWrapper = mutation.target.closest('[data-testid="cellInnerDiv"]');
    hideElement(tweetWrapper);
  }
}

// create mutation observer to detect when new nodes are added to the DOM
let initAndCreateMutationObserver = () => {
  let mutationObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        setUsername();
        clickConfirmUserBlock(mutation);
        hideCaretMenu(mutation);
        getTweetWrapperAndAttachBlockButton(mutation);
        temporarilyHideTwitterThankYouMessage(mutation);
      }
    });
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false
  });
}

// create block button
let createBlockButton = () => {
  let blockButton = document.createElement('div');
  blockButton.style.padding = '7px 14px';
  blockButton.style.cursor = 'pointer';
  blockButton.style.textAlign = 'center';
  blockButton.style.borderRadius = '5px';
  blockButton.style.marginRight = '20px';
  blockButton.addEventListener('mouseenter', () => {
    blockButton.style.fontSize = '.9em';
  });
  blockButton.addEventListener('mouseleave', () => {
    blockButton.style.fontSize = '0.6em';
  });
  blockButton.style.backgroundColor = 'mistyrose';
  blockButton.style.lineHeight = '10px';
  blockButton.style.width = '12px';
  blockButton.style.fontSize = '0.6em';
  blockButton.textContent = '🚫';
  blockButton.style.transition = 'font-size 0.2s ease-in';
  return blockButton;
}

// check if we should add the block button to the tweet
let shouldAddBlockButton = userNameDiv => {
  if (!userNameDiv) {
    return false;
  }
  let tweetUsername = userNameDiv.querySelectorAll('[href]')?.[1]?.textContent;
  // don't add block buttons to the user's own tweets; don't add block buttons to the home page
  if (tweetUsername !== ownUsername && !window.location.pathname.includes('/home')) {
    return true;
  }
}

// trigger the click event on the caret
let triggerMenuclick = caret => {
  // set isBlockClicked to true so that we know this feature is currently active
  isBlockClicked = true;
  caret.click();
}

// trigger the click event on the block menu option
let triggerBlockMenuOptionClick = () => {
  setTimeout(() => {
    let blockButton = document.querySelector('[data-testid="block"]');
    // set isBlockClicked to false so that this feature is no longer active and doesn't interfere with other features
    isBlockClicked = false;
    if (!blockButton) {
      return;
    }
    blockButton?.click();
  }, 20);
}

let hideTweetDiv = caret => {
  let tweetDiv = caret.closest('article');
  hideElement(tweetDiv);
}

// add event listeners to the block button
let addBlockButtonEventListeners = (blockButton, caret) => {
  blockButton.addEventListener('click', e => {
    e.stopPropagation();
    triggerMenuclick(caret);
    hideTweetDiv(caret);
    triggerBlockMenuOptionClick(caret)
  });
}

// attach the block button to the tweet
let attachBlockButton = (userNameDiv, caret) => {
  if (shouldAddBlockButton(userNameDiv)) {
    let blockButton = createBlockButton();
    addBlockButtonEventListeners(blockButton, caret);
    let caretWrapper = caret.parentElement;
    caretWrapper.insertBefore(blockButton, caret);
  }
}

// initialize the app; create mutation observer
initAndCreateMutationObserver();
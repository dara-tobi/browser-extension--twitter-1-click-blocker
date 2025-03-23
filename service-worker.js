chrome.runtime.setUninstallURL('https://docs.google.com/forms/d/15hOeb2GIHZXcwa8HeiVIIEAqe8gntzGyYLZS5XXTZSE');

// Listen for messages from the foreground script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  // handle feedback messages from the content script
  if (message.type == "feedback" && message.data) {
    if (message.data === "something_went_wrong") {
      // console.log("Something went wrong");
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

    if (message.data === "block_button_clicked" || message.data === "mute_button_clicked") {
      let username = message.username;
      let action = message.data === "block_button_clicked" ? "block" : "mute";

      await chrome.tabs.remove(sender.tab.id);
      // get active tab
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        // send finished_action message to the active tab
        chrome.tabs.sendMessage(
          tabs[0].id,
          { 
            type: "finished_" + action + "ing", 
            username: username,
            action: action 
          },
          function (response) {
            // console.log('action completed');
          }
        );
      });
    }
  }

  // handle open_tab messages from the content script
  if (message.type == "open_tab" && message.username !== undefined) {
    const action = message.mute ? "mute" : "block";
    chrome.tabs.create({
      url: `https://x.com/${message.username}?${action}=true`,
      active: false,
    });
  }

  // handle open_options messages from the content script
  if (message.type === "open_options") {
    chrome.runtime.openOptionsPage();
  }

  // sendResponse("Message " + message + " received in service worker!");
});

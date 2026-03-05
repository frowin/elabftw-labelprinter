// Clicking the extension icon toggles the label printer panel on the current page
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle-panel' });
  } catch {
    // Content script not loaded on this page
  }
});

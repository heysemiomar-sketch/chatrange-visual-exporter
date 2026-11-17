const SUPPORTED_HOSTS = new Set(['chatgpt.com', 'chat.openai.com']);

function isSupportedUrl(urlString: string | undefined): boolean {
  if (!urlString) {
    return false;
  }

  try {
    const url = new URL(urlString);
    return SUPPORTED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.info('ChatRange Visual Exporter installed.');
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined || !isSupportedUrl(tab.url)) {
    console.warn('ChatRange: open a supported ChatGPT conversation first.');
    return;
  }

  void chrome.scripting
    .executeScript({
      target: {
        tabId: tab.id,
      },
      files: ['assets/content.js'],
    })
    .catch((error: unknown) => {
      console.error('ChatRange: failed to inject the content script.', error);
    });
});

import type {
  CaptureFailure,
  CaptureResult,
  ProcessVisibleCaptureSuccess,
} from '../core/capture-messages';

import { isCaptureVisibleRangeRequest } from '../core/capture-messages';

const SUPPORTED_HOSTS = new Set(['chatgpt.com', 'chat.openai.com']);

const PREVIEW_STORAGE_KEY = 'chatrange-preview-capture';

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

function createFailure(
  requestId: string,
  code: CaptureFailure['code'],
  message: string,
): CaptureFailure {
  return {
    type: 'capture-failure',
    requestId,
    code,
    message,
  };
}

async function handleVisibleCapture(requestId: string, windowId: number): Promise<CaptureResult> {
  try {
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: 'png',
    });

    const result: ProcessVisibleCaptureSuccess = {
      type: 'process-visible-capture-success',
      requestId,
      pngDataUrl: screenshotDataUrl,
      width: 0,
      height: 0,
    };

    await chrome.storage.local.set({
      [PREVIEW_STORAGE_KEY]: result,
    });

    await chrome.tabs.create({
      url: chrome.runtime.getURL('preview.html'),
    });

    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown capture failure.';

    return createFailure(requestId, 'CAPTURE_FAILED', message);
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

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isCaptureVisibleRangeRequest(message)) {
    return false;
  }

  const windowId = sender.tab?.windowId;

  if (windowId === undefined) {
    sendResponse(
      createFailure(
        message.requestId,
        'CAPTURE_FAILED',
        'The sender tab does not have a window ID.',
      ),
    );

    return false;
  }

  void handleVisibleCapture(message.requestId, windowId).then(sendResponse);

  return true;
});

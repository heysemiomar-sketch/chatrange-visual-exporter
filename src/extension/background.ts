import type {
  CaptureFailure,
  CaptureResult,
  CaptureVisibleRangeRequest,
  ProcessVisibleCaptureRequest,
  ProcessVisibleCaptureSuccess,
} from '../core/capture-messages';

import { isCaptureVisibleRangeRequest } from '../core/capture-messages';

const SUPPORTED_HOSTS = new Set(['chatgpt.com', 'chat.openai.com']);

const PREVIEW_STORAGE_KEY = 'chatrange-preview-capture';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

let creatingOffscreenDocument: Promise<void> | null = null;

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

function isCaptureSuccess(result: CaptureResult): result is ProcessVisibleCaptureSuccess {
  return result.type === 'process-visible-capture-success';
}

async function hasOffscreenDocument(): Promise<boolean> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);

  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl],
  });

  return contexts.length > 0;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.BLOBS],
        justification: 'Crop a visible-tab screenshot into the selected conversation range.',
      })
      .finally(() => {
        creatingOffscreenDocument = null;
      });
  }

  await creatingOffscreenDocument;
}

async function processScreenshot(
  request: CaptureVisibleRangeRequest,
  screenshotDataUrl: string,
): Promise<CaptureResult> {
  await ensureOffscreenDocument();

  const processRequest: ProcessVisibleCaptureRequest = {
    type: 'process-visible-capture',
    requestId: request.requestId,
    screenshotDataUrl,
    crop: request.crop,
    viewport: request.viewport,
  };

  return (await chrome.runtime.sendMessage(processRequest)) as CaptureResult;
}

async function storeAndOpenPreview(result: ProcessVisibleCaptureSuccess): Promise<void> {
  await chrome.storage.local.set({
    [PREVIEW_STORAGE_KEY]: result,
  });

  await chrome.tabs.create({
    url: chrome.runtime.getURL('preview.html'),
  });
}

async function handleVisibleCapture(
  request: CaptureVisibleRangeRequest,
  windowId: number,
): Promise<CaptureResult> {
  try {
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: 'png',
    });

    const result = await processScreenshot(request, screenshotDataUrl);

    if (isCaptureSuccess(result)) {
      await storeAndOpenPreview(result);
    }

    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown capture failure.';

    console.error('ChatRange: visible capture failed.', {
      requestId: request.requestId,
      message,
    });

    return createFailure(request.requestId, 'CAPTURE_FAILED', message);
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

  void handleVisibleCapture(message, windowId)
    .then(sendResponse)
    .catch((error: unknown) => {
      const failureMessage =
        error instanceof Error ? error.message : 'Unexpected background capture failure.';

      sendResponse(createFailure(message.requestId, 'CAPTURE_FAILED', failureMessage));
    });

  return true;
});

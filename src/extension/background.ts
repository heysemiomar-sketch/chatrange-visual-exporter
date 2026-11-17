import type {
  CaptureFailure,
  CaptureResult,
  CaptureVisibleRangeRequest,
  CaptureVisibleSegmentRequest,
  CaptureVisibleSegmentSuccess,
  ProcessVisibleCaptureRequest,
  ProcessVisibleCaptureSuccess,
} from '../core/capture-messages';

import {
  isCaptureVisibleRangeRequest,
  isCaptureVisibleSegmentRequest,
  isProcessVisibleCaptureSuccess,
} from '../core/capture-messages';

const SUPPORTED_HOSTS = new Set(['chatgpt.com', 'chat.openai.com']);

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
        justification: 'Crop and store visible-tab screenshots as PNG Blobs.',
      })
      .finally(() => {
        creatingOffscreenDocument = null;
      });
  }

  await creatingOffscreenDocument;
}

async function captureVisibleTab(windowId: number): Promise<string> {
  return await chrome.tabs.captureVisibleTab(windowId, {
    format: 'png',
  });
}

async function readImageDimensions(screenshotDataUrl: string): Promise<{
  width: number;
  height: number;
}> {
  const response = await fetch(screenshotDataUrl);

  if (!response.ok) {
    throw new Error('The visible-tab screenshot could not be decoded.');
  }

  const blob = await response.blob();

  const imageBitmap = await createImageBitmap(blob);

  try {
    return {
      width: imageBitmap.width,
      height: imageBitmap.height,
    };
  } finally {
    imageBitmap.close();
  }
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

async function openPreview(result: ProcessVisibleCaptureSuccess): Promise<void> {
  const previewUrl = new URL(chrome.runtime.getURL('preview.html'));

  previewUrl.searchParams.set('captureId', result.captureId);

  await chrome.tabs.create({
    url: previewUrl.toString(),
  });
}

async function handleVisibleRangeCapture(
  request: CaptureVisibleRangeRequest,
  windowId: number,
): Promise<CaptureResult> {
  try {
    const screenshotDataUrl = await captureVisibleTab(windowId);

    const result = await processScreenshot(request, screenshotDataUrl);

    if (isProcessVisibleCaptureSuccess(result)) {
      await openPreview(result);
    }

    return result;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown visible-range capture failure.';

    console.error('ChatRange: visible-range capture failed.', {
      requestId: request.requestId,
      message,
    });

    return createFailure(request.requestId, 'CAPTURE_FAILED', message);
  }
}

async function handleVisibleSegmentCapture(
  request: CaptureVisibleSegmentRequest,
  windowId: number,
): Promise<CaptureVisibleSegmentSuccess | CaptureFailure> {
  try {
    const screenshotDataUrl = await captureVisibleTab(windowId);

    const dimensions = await readImageDimensions(screenshotDataUrl);

    return {
      type: 'capture-visible-segment-success',
      requestId: request.requestId,
      sessionId: request.sessionId,
      segmentIndex: request.segmentIndex,
      scrollTopCssPx: request.scrollTopCssPx,
      overlapWithPreviousCssPx: request.overlapWithPreviousCssPx,
      screenshotDataUrl,
      imageWidthPhysicalPx: dimensions.width,
      imageHeightPhysicalPx: dimensions.height,
      capturedAt: Date.now(),
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown viewport-segment capture failure.';

    console.error('ChatRange: viewport-segment capture failed.', {
      requestId: request.requestId,
      sessionId: request.sessionId,
      segmentIndex: request.segmentIndex,
      message,
    });

    return createFailure(request.requestId, 'SEGMENT_CAPTURE_FAILED', message);
  }
}

function getSenderWindowId(sender: chrome.runtime.MessageSender): number | undefined {
  return sender.tab?.windowId;
}

function sendMissingWindowFailure(
  requestId: string,
  sendResponse: (response?: unknown) => void,
): void {
  sendResponse(
    createFailure(requestId, 'CAPTURE_FAILED', 'The sender tab does not have a window ID.'),
  );
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
  const windowId = getSenderWindowId(sender);

  if (isCaptureVisibleRangeRequest(message)) {
    if (windowId === undefined) {
      sendMissingWindowFailure(message.requestId, sendResponse);

      return false;
    }

    void handleVisibleRangeCapture(message, windowId)
      .then(sendResponse)
      .catch((error: unknown) => {
        const failureMessage =
          error instanceof Error ? error.message : 'Unexpected visible-range capture failure.';

        sendResponse(createFailure(message.requestId, 'CAPTURE_FAILED', failureMessage));
      });

    return true;
  }

  if (isCaptureVisibleSegmentRequest(message)) {
    if (windowId === undefined) {
      sendMissingWindowFailure(message.requestId, sendResponse);

      return false;
    }

    void handleVisibleSegmentCapture(message, windowId)
      .then(sendResponse)
      .catch((error: unknown) => {
        const failureMessage =
          error instanceof Error ? error.message : 'Unexpected viewport-segment capture failure.';

        sendResponse(createFailure(message.requestId, 'SEGMENT_CAPTURE_FAILED', failureMessage));
      });

    return true;
  }

  return false;
});

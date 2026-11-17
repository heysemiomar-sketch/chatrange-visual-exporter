import type {
  CaptureFailure,
  CaptureResult,
  CaptureVisibleRangeRequest,
  CaptureVisibleSegmentRequest,
  CaptureVisibleSegmentSuccess,
  ComposeMultiViewportCaptureRequest,
  ProcessVisibleCaptureRequest,
} from '../core/capture-messages';

import {
  isCaptureVisibleRangeRequest,
  isCaptureVisibleSegmentRequest,
  isComposeMultiViewportCaptureRequest,
  isComposeMultiViewportCaptureSuccess,
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
        justification: 'Crop, compose, and store conversation screenshots as PNG Blobs.',
      })
      .finally(() => {
        creatingOffscreenDocument = null;
      });
  }

  await creatingOffscreenDocument;
}

const CAPTURE_INTERVAL_MILLISECONDS = 1_100;

const CAPTURE_QUOTA_RETRY_MILLISECONDS = 2_000;

const MAXIMUM_CAPTURE_ATTEMPTS = 4;

let captureQueue: Promise<void> = Promise.resolve();

let lastCaptureStartedAt = 0;

function delay(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isCaptureQuotaError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')
  );
}

async function waitForCaptureSlot(): Promise<void> {
  const elapsedMilliseconds = Date.now() - lastCaptureStartedAt;

  const remainingDelay = CAPTURE_INTERVAL_MILLISECONDS - elapsedMilliseconds;

  if (remainingDelay > 0) {
    await delay(remainingDelay);
  }
}

async function captureVisibleTabWithRetry(windowId: number): Promise<string> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAXIMUM_CAPTURE_ATTEMPTS; attempt += 1) {
    await waitForCaptureSlot();

    lastCaptureStartedAt = Date.now();

    try {
      return await chrome.tabs.captureVisibleTab(windowId, {
        format: 'png',
      });
    } catch (error: unknown) {
      lastError = error;

      const canRetry = isCaptureQuotaError(error) && attempt < MAXIMUM_CAPTURE_ATTEMPTS;

      if (!canRetry) {
        throw error;
      }

      const retryDelay = CAPTURE_QUOTA_RETRY_MILLISECONDS * attempt;

      console.warn('ChatRange: capture quota reached; retrying after backoff.', {
        attempt,
        maximumAttempts: MAXIMUM_CAPTURE_ATTEMPTS,
        retryAfterMilliseconds: retryDelay,
      });

      await delay(retryDelay);

      lastCaptureStartedAt = 0;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Visible-tab capture exhausted all retry attempts.');
}

async function captureVisibleTab(windowId: number): Promise<string> {
  const previousCapture = captureQueue;

  let releaseQueue: (() => void) | undefined;

  captureQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previousCapture.catch(() => undefined);

  try {
    return await captureVisibleTabWithRetry(windowId);
  } finally {
    releaseQueue?.();
  }
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

async function openPreview(captureId: string): Promise<void> {
  const previewUrl = new URL(chrome.runtime.getURL('preview.html'));

  previewUrl.searchParams.set('captureId', captureId);

  await chrome.tabs.create({
    url: previewUrl.toString(),
  });
}

async function processVisibleScreenshot(
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

async function handleVisibleRangeCapture(
  request: CaptureVisibleRangeRequest,
  windowId: number,
): Promise<CaptureResult> {
  try {
    const screenshotDataUrl = await captureVisibleTab(windowId);

    const result = await processVisibleScreenshot(request, screenshotDataUrl);

    if (isProcessVisibleCaptureSuccess(result)) {
      await openPreview(result.captureId);
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

async function handleComposition(
  request: ComposeMultiViewportCaptureRequest,
): Promise<CaptureResult> {
  try {
    await ensureOffscreenDocument();

    const result = (await chrome.runtime.sendMessage(request)) as CaptureResult;

    if (isComposeMultiViewportCaptureSuccess(result)) {
      await openPreview(result.captureId);
    }

    return result;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown multi-viewport composition failure.';

    console.error('ChatRange: multi-viewport composition forwarding failed.', {
      requestId: request.requestId,
      sessionId: request.sessionId,
      segmentCount: request.segments.length,
      message,
    });

    return createFailure(request.requestId, 'COMPOSITION_FAILED', message);
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

    void handleVisibleRangeCapture(message, windowId).then(sendResponse);

    return true;
  }

  if (isCaptureVisibleSegmentRequest(message)) {
    if (windowId === undefined) {
      sendMissingWindowFailure(message.requestId, sendResponse);

      return false;
    }

    void handleVisibleSegmentCapture(message, windowId).then(sendResponse);

    return true;
  }

  if (isComposeMultiViewportCaptureRequest(message)) {
    /*
     * Ignore the forwarded runtime message.
     * Only the original request from a tab
     * should be forwarded to the offscreen
     * document.
     */
    if (sender.tab === undefined) {
      return false;
    }

    void handleComposition(message).then(sendResponse);

    return true;
  }

  return false;
});

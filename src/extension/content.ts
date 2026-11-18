import type { ChatAdapter } from '../adapters/base';

import { findSupportedChatAdapter } from '../adapters/registry';

import {
  createCaptureCancellationSession,
  isCaptureCancelledError,
  throwIfCaptureCancelled,
} from '../core/capture-cancellation';

import type {
  CaptureFailure,
  CaptureResult,
  CaptureVisibleRangeRequest,
  ProcessVisibleCaptureSuccess,
} from '../core/capture-messages';

import { composeMultiViewportCapture } from './multi-viewport-compose';

import { captureMultiViewportSegments } from './multi-viewport-segment-capture';

import type { RangePickerSession, SelectedRange } from './range-picker';

import { startRangePicker } from './range-picker';

const STATUS_ID = 'chatrange-status';

const CAPTURE_UI_ATTRIBUTES = [
  'data-chatrange-highlighted',
  'data-chatrange-picker-hover',
  'data-chatrange-picker-start',
  'data-chatrange-picker-end',
  'data-chatrange-picker-range',
];

let captureInProgress = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCaptureFailure(value: unknown): value is CaptureFailure {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.type === 'capture-failure' &&
    typeof value.requestId === 'string' &&
    typeof value.code === 'string' &&
    typeof value.message === 'string'
  );
}

function isCaptureSuccess(value: unknown): value is ProcessVisibleCaptureSuccess {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.type === 'process-visible-capture-success' &&
    typeof value.requestId === 'string' &&
    typeof value.captureId === 'string' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    value.mimeType === 'image/png' &&
    typeof value.createdAt === 'number' &&
    typeof value.expiresAt === 'number'
  );
}

function showStatus(message: string, type: 'info' | 'success' | 'error'): void {
  document.getElementById(STATUS_ID)?.remove();

  const status = document.createElement('div');

  status.id = STATUS_ID;
  status.textContent = message;

  const backgroundColors = {
    info: '#1d4ed8',
    success: '#047857',
    error: '#b91c1c',
  };

  Object.assign(status.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '2147483647',
    maxWidth: '480px',
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: backgroundColors[type],
    color: '#ffffff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    lineHeight: '1.5',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
    pointerEvents: 'none',
  });

  document.documentElement.appendChild(status);

  if (type !== 'info') {
    window.setTimeout(() => {
      status.remove();
    }, 7000);
  }
}

function describeSelectionState(session: RangePickerSession): void {
  switch (session.state) {
    case 'selecting-start':
      showStatus('ChatRange: select the start message. Press Escape to cancel.', 'info');
      break;

    case 'selecting-end':
      showStatus('ChatRange: start selected. Now select the end message.', 'info');
      break;

    case 'cancelled':
      showStatus('ChatRange: range selection cancelled.', 'error');
      break;

    case 'range-ready':
    case 'idle':
      break;
  }
}

function createRequestId(): string {
  return crypto.randomUUID();
}

function getRangeRectangle(range: SelectedRange): DOMRect {
  const rectangles = range.turns.map((turn) => turn.element.getBoundingClientRect());

  const left = Math.min(...rectangles.map((rectangle) => rectangle.left));

  const top = Math.min(...rectangles.map((rectangle) => rectangle.top));

  const right = Math.max(...rectangles.map((rectangle) => rectangle.right));

  const bottom = Math.max(...rectangles.map((rectangle) => rectangle.bottom));

  return new DOMRect(left, top, right - left, bottom - top);
}

function isRangeFullyVisible(rectangle: DOMRect): boolean {
  return (
    rectangle.left >= 0 &&
    rectangle.top >= 0 &&
    rectangle.right <= window.innerWidth &&
    rectangle.bottom <= window.innerHeight
  );
}

function clearCaptureUi(): void {
  document.getElementById(STATUS_ID)?.remove();

  document.documentElement.removeAttribute('data-chatrange-picker-active');

  for (const attribute of CAPTURE_UI_ATTRIBUTES) {
    const elements = document.querySelectorAll<HTMLElement>(`[${attribute}]`);

    for (const element of elements) {
      element.removeAttribute(attribute);

      element.style.removeProperty('outline');

      element.style.removeProperty('outline-offset');

      element.style.removeProperty('box-shadow');

      element.style.removeProperty('background-color');
    }
  }
}

function waitForCleanPaint(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

async function captureVisibleRange(range: SelectedRange, rectangle: DOMRect): Promise<void> {
  clearCaptureUi();

  await waitForCleanPaint();

  const request: CaptureVisibleRangeRequest = {
    type: 'capture-visible-range',
    requestId: createRequestId(),
    crop: {
      left: rectangle.left,
      top: rectangle.top,
      width: rectangle.width,
      height: rectangle.height,
    },
    viewport: {
      cssWidth: window.innerWidth,
      cssHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
  };

  const result = (await chrome.runtime.sendMessage(request)) as CaptureResult;

  if (isCaptureFailure(result)) {
    throw new Error(result.message);
  }

  if (isCaptureSuccess(result)) {
    console.info('ChatRange: selected range stored.', {
      requestId: result.requestId,
      captureId: result.captureId,
      selectedTurnCount: range.turns.length,
      width: result.width,
      height: result.height,
      expiresAt: result.expiresAt,
    });
  }
}

async function captureAndComposeLongRange(range: SelectedRange): Promise<void> {
  const cancellation = createCaptureCancellationSession();

  let segmentCapture: Awaited<ReturnType<typeof captureMultiViewportSegments>> | null = null;

  try {
    clearCaptureUi();
    await waitForCleanPaint();

    throwIfCaptureCancelled(cancellation.signal);

    showStatus('ChatRange: capturing multi-viewport segments. Press Escape to cancel.', 'info');

    segmentCapture = await captureMultiViewportSegments(range.turns, cancellation.signal, {
      onProgress(completedSegments, totalSegments): void {
        showStatus(
          `ChatRange: captured segment ` +
            `${completedSegments} of ` +
            `${totalSegments}. ` +
            `Press Escape to cancel.`,
          'info',
        );
      },
    });

    throwIfCaptureCancelled(cancellation.signal);

    showStatus(
      `ChatRange: composing ` +
        `${segmentCapture.capturedSegmentCount} ` +
        `segment(s). Press Escape to cancel.`,
      'info',
    );

    const composition = await composeMultiViewportCapture(segmentCapture, cancellation.signal);

    throwIfCaptureCancelled(cancellation.signal);

    console.info('ChatRange: multi-viewport capture composed.', {
      sessionId: composition.sessionId,
      captureId: composition.captureId,
      segmentCount: composition.segmentCount,
      width: composition.width,
      height: composition.height,
      expiresAt: composition.expiresAt,
      originalScrollTopCssPx: segmentCapture.originalScrollTopCssPx,
      restoredScrollTopCssPx: segmentCapture.restoredScrollTopCssPx,
    });

    showStatus(
      `ChatRange: composed ` +
        `${composition.segmentCount} ` +
        `segment(s) into a ` +
        `${composition.width} × ` +
        `${composition.height} PNG.`,
      'success',
    );
  } catch (error: unknown) {
    if (isCaptureCancelledError(error)) {
      console.info('ChatRange: capture cancelled.');

      showStatus('ChatRange: capture cancelled.', 'error');

      return;
    }

    throw error;
  } finally {
    if (segmentCapture) {
      segmentCapture.segments.length = 0;
    }

    cancellation.dispose();
  }
}

async function processReadyRange(range: SelectedRange): Promise<void> {
  if (captureInProgress) {
    showStatus('ChatRange: a capture is already in progress.', 'error');

    return;
  }

  captureInProgress = true;

  try {
    const rectangle = getRangeRectangle(range);

    if (isRangeFullyVisible(rectangle)) {
      showStatus(
        `ChatRange: capturing ` + `${range.turns.length} ` + `visible turn(s).`,
        'success',
      );

      await captureVisibleRange(range, rectangle);

      return;
    }

    await captureAndComposeLongRange(range);
  } finally {
    captureInProgress = false;
  }
}

function handleReadyRange(range: SelectedRange): void {
  void processReadyRange(range).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown capture failure.';

    console.error('ChatRange: range processing failed.', error);

    showStatus(`ChatRange: ${message}`, 'error');
  });
}

function runWithAdapter(adapter: ChatAdapter): void {
  const initialTurns = adapter.findConversationTurns();

  if (initialTurns.length === 0) {
    showStatus(
      `ChatRange: no mounted conversation turns ` + `found for ${adapter.displayName}.`,
      'error',
    );

    return;
  }

  console.info('ChatRange: active adapter selected.', {
    adapterId: adapter.id,
    displayName: adapter.displayName,
    hostname: window.location.hostname,
    initialTurnCount: initialTurns.length,
  });

  startRangePicker(() => adapter.findConversationTurns(), {
    onStateChange: describeSelectionState,
    onRangeReady: handleReadyRange,
    onCancel(): void {
      console.info('ChatRange: picker cancelled.', {
        adapterId: adapter.id,
      });
    },
  });
}

function run(): void {
  const adapter = findSupportedChatAdapter();

  if (!adapter) {
    showStatus('ChatRange: unsupported page.', 'error');

    return;
  }

  runWithAdapter(adapter);
}

run();

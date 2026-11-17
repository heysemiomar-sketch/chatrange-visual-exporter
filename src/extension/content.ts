import { chatGptAdapter } from '../adapters/chatgpt';

import type {
  CaptureFailure,
  CaptureResult,
  CaptureVisibleRangeRequest,
  ProcessVisibleCaptureSuccess,
} from '../core/capture-messages';

import type { RangePickerSession, SelectedRange } from './range-picker';

import { startRangePicker } from './range-picker';

const STATUS_ID = 'chatrange-status';

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
    maxWidth: '420px',
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
    }, 5000);
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

  const attributes = [
    'data-chatrange-picker-hover',
    'data-chatrange-picker-start',
    'data-chatrange-picker-end',
    'data-chatrange-picker-range',
  ];

  for (const attribute of attributes) {
    const elements = document.querySelectorAll<HTMLElement>(`[${attribute}]`);

    for (const element of elements) {
      element.removeAttribute(attribute);
    }
  }
}

function isCaptureFailure(result: CaptureResult): result is CaptureFailure {
  return result.type === 'capture-failure';
}

function isCaptureSuccess(result: CaptureResult): result is ProcessVisibleCaptureSuccess {
  return result.type === 'process-visible-capture-success';
}

async function captureRange(range: SelectedRange): Promise<void> {
  const rectangle = getRangeRectangle(range);

  if (!isRangeFullyVisible(rectangle)) {
    showStatus(
      'ChatRange: the selected range must be fully visible for this capture milestone.',
      'error',
    );

    return;
  }

  clearCaptureUi();

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

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
    showStatus(`ChatRange: ${result.message}`, 'error');

    return;
  }

  if (isCaptureSuccess(result)) {
    console.info('ChatRange: full viewport captured.', {
      requestId: result.requestId,
    });
  }
}

function handleReadyRange(range: SelectedRange): void {
  showStatus(`ChatRange: capturing ${range.turns.length} mounted turn(s).`, 'success');

  void captureRange(range).catch((error: unknown) => {
    console.error('ChatRange: capture request failed.', error);

    showStatus('ChatRange: capture request failed.', 'error');
  });
}

function run(): void {
  if (!chatGptAdapter.isSupportedPage()) {
    showStatus('ChatRange: unsupported page.', 'error');
    return;
  }

  const initialTurns = chatGptAdapter.findConversationTurns();

  if (initialTurns.length === 0) {
    showStatus('ChatRange: no mounted conversation turns found.', 'error');
    return;
  }

  startRangePicker(() => chatGptAdapter.findConversationTurns(), {
    onStateChange: describeSelectionState,

    onRangeReady: handleReadyRange,

    onCancel(): void {
      console.info('ChatRange: picker cancelled.');
    },
  });
}

run();

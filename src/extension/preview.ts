import type { ProcessVisibleCaptureSuccess } from '../core/capture-messages';

const PREVIEW_STORAGE_KEY = 'chatrange-preview-capture';

const statusElement = document.querySelector<HTMLParagraphElement>('#status');

const imageElement = document.querySelector<HTMLImageElement>('#capture');

function isStoredCapture(value: unknown): value is ProcessVisibleCaptureSuccess {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<ProcessVisibleCaptureSuccess>;

  return (
    candidate.type === 'process-visible-capture-success' &&
    typeof candidate.requestId === 'string' &&
    typeof candidate.pngDataUrl === 'string'
  );
}

async function loadCapture(): Promise<void> {
  const stored = await chrome.storage.local.get(PREVIEW_STORAGE_KEY);

  const capture = stored[PREVIEW_STORAGE_KEY];

  if (!isStoredCapture(capture)) {
    if (statusElement) {
      statusElement.textContent = 'No capture is available.';
    }

    return;
  }

  if (!statusElement || !imageElement) {
    return;
  }

  imageElement.src = capture.pngDataUrl;

  imageElement.hidden = false;

  statusElement.textContent = 'Showing the latest visible-tab capture.';
}

void loadCapture().catch((error: unknown) => {
  console.error('ChatRange: failed to load the preview.', error);

  if (statusElement) {
    statusElement.textContent = 'The capture preview could not be loaded.';
  }
});

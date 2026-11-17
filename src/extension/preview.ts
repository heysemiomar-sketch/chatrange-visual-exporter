import type { ProcessVisibleCaptureSuccess } from '../core/capture-messages';

const PREVIEW_STORAGE_KEY = 'chatrange-preview-capture';

const statusElement = document.querySelector<HTMLParagraphElement>('#status');

const metadataElement = document.querySelector<HTMLParagraphElement>('#metadata');

const imageElement = document.querySelector<HTMLImageElement>('#capture');

const downloadButton = document.querySelector<HTMLButtonElement>('#download');

function isStoredCapture(value: unknown): value is ProcessVisibleCaptureSuccess {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<ProcessVisibleCaptureSuccess>;

  return (
    candidate.type === 'process-visible-capture-success' &&
    typeof candidate.requestId === 'string' &&
    typeof candidate.pngDataUrl === 'string' &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number'
  );
}

function createDownloadFilename(requestId: string): string {
  const shortRequestId = requestId.slice(0, 8);

  return `chatrange-${shortRequestId}.png`;
}

function configureDownload(capture: ProcessVisibleCaptureSuccess): void {
  if (!downloadButton) {
    return;
  }

  downloadButton.disabled = false;

  downloadButton.addEventListener(
    'click',
    () => {
      const link = document.createElement('a');

      link.href = capture.pngDataUrl;

      link.download = createDownloadFilename(capture.requestId);

      link.click();
    },
    {
      once: true,
    },
  );
}

async function loadCapture(): Promise<void> {
  const stored = await chrome.storage.local.get(PREVIEW_STORAGE_KEY);

  const capture = stored[PREVIEW_STORAGE_KEY];

  if (!isStoredCapture(capture)) {
    if (statusElement) {
      statusElement.textContent = 'No cropped capture is available.';
    }

    return;
  }

  if (!statusElement || !imageElement) {
    return;
  }

  imageElement.src = capture.pngDataUrl;

  imageElement.hidden = false;

  statusElement.textContent = 'Showing the latest cropped conversation-range capture.';

  if (metadataElement) {
    metadataElement.textContent = `${capture.width} × ${capture.height} physical pixels`;

    metadataElement.hidden = false;
  }

  configureDownload(capture);
}

void loadCapture().catch((error: unknown) => {
  console.error('ChatRange: failed to load the preview.', error);

  if (statusElement) {
    statusElement.textContent = 'The cropped capture preview could not be loaded.';
  }
});

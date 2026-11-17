import { deleteCapture, deleteExpiredCaptures, getCapture } from '../core/capture-storage';

import type { StoredCapture } from '../core/capture-storage';

const statusElement = document.querySelector<HTMLParagraphElement>('#status');

const metadataElement = document.querySelector<HTMLParagraphElement>('#metadata');

const imageElement = document.querySelector<HTMLImageElement>('#capture');

const downloadButton = document.querySelector<HTMLButtonElement>('#download');

const deleteButton = document.querySelector<HTMLButtonElement>('#delete-capture');

let currentObjectUrl: string | null = null;

function getCaptureId(): string | null {
  const parameters = new URLSearchParams(window.location.search);

  return parameters.get('captureId');
}

function revokeCurrentObjectUrl(): void {
  if (!currentObjectUrl) {
    return;
  }

  URL.revokeObjectURL(currentObjectUrl);

  currentObjectUrl = null;
}

function createDownloadFilename(captureId: string): string {
  const shortId = captureId.slice(0, 8);

  return `chatrange-${shortId}.png`;
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(timestamp));
}

function setUnavailableState(message: string): void {
  revokeCurrentObjectUrl();

  if (statusElement) {
    statusElement.textContent = message;
  }

  if (metadataElement) {
    metadataElement.hidden = true;
  }

  if (imageElement) {
    imageElement.hidden = true;
    imageElement.removeAttribute('src');
  }

  if (downloadButton) {
    downloadButton.disabled = true;
  }

  if (deleteButton) {
    deleteButton.disabled = true;
  }
}

function configureDownload(capture: StoredCapture): void {
  if (!downloadButton || !currentObjectUrl) {
    return;
  }

  downloadButton.disabled = false;

  downloadButton.addEventListener('click', () => {
    if (!currentObjectUrl) {
      return;
    }

    const link = document.createElement('a');

    link.href = currentObjectUrl;

    link.download = createDownloadFilename(capture.captureId);

    link.click();
  });
}

function configureDelete(capture: StoredCapture): void {
  if (!deleteButton) {
    return;
  }

  deleteButton.disabled = false;

  deleteButton.addEventListener(
    'click',
    () => {
      void deleteCapture(capture.captureId)
        .then(() => {
          setUnavailableState('The capture was deleted.');
        })
        .catch((error: unknown) => {
          console.error('ChatRange: failed to delete the capture.', error);

          if (statusElement) {
            statusElement.textContent = 'The capture could not be deleted.';
          }
        });
    },
    {
      once: true,
    },
  );
}

function displayCapture(capture: StoredCapture): void {
  if (!statusElement || !imageElement) {
    return;
  }

  revokeCurrentObjectUrl();

  currentObjectUrl = URL.createObjectURL(capture.blob);

  imageElement.src = currentObjectUrl;

  imageElement.hidden = false;

  statusElement.textContent = 'Showing a cropped conversation-range capture stored in IndexedDB.';

  if (metadataElement) {
    metadataElement.textContent =
      `${capture.width} × ${capture.height} physical pixels · ` +
      `Created ${formatTimestamp(capture.createdAt)} · ` +
      `Expires ${formatTimestamp(capture.expiresAt)}`;

    metadataElement.hidden = false;
  }

  configureDownload(capture);
  configureDelete(capture);
}

async function loadCapture(): Promise<void> {
  const captureId = getCaptureId();

  if (!captureId) {
    setUnavailableState('The preview URL does not contain a capture ID.');

    return;
  }

  await deleteExpiredCaptures();

  const capture = await getCapture(captureId);

  if (!capture) {
    setUnavailableState('The requested capture was not found or has expired.');

    return;
  }

  displayCapture(capture);
}

window.addEventListener('beforeunload', revokeCurrentObjectUrl);

void loadCapture().catch((error: unknown) => {
  console.error('ChatRange: failed to load the IndexedDB capture.', error);

  setUnavailableState('The capture preview could not be loaded.');
});

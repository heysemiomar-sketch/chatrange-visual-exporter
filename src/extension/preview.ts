import { deleteCapture, deleteExpiredCaptures, getCapture } from '../core/capture-storage';

import type { StoredCapture } from '../core/capture-storage';

const statusElement = document.querySelector<HTMLParagraphElement>('#status');

const metadataElement = document.querySelector<HTMLParagraphElement>('#metadata');

const imageElement = document.querySelector<HTMLImageElement>('#capture');

const downloadButton = document.querySelector<HTMLButtonElement>('#download');

const copyButton = document.querySelector<HTMLButtonElement>('#copy-capture');

const deleteButton = document.querySelector<HTMLButtonElement>('#delete-capture');

let currentObjectUrl: string | null = null;

let currentCapture: StoredCapture | null = null;

let copyButtonResetTimer: number | null = null;

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

function clearCopyButtonResetTimer(): void {
  if (copyButtonResetTimer === null) {
    return;
  }

  window.clearTimeout(copyButtonResetTimer);

  copyButtonResetTimer = null;
}

function resetCopyButton(): void {
  clearCopyButtonResetTimer();

  if (!copyButton) {
    return;
  }

  copyButton.textContent = 'Copy PNG';

  copyButton.classList.remove('copy-success', 'copy-error');
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

function setStatus(message: string): void {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

function setCopyButtonFeedback(message: string, result: 'success' | 'error'): void {
  if (!copyButton) {
    return;
  }

  clearCopyButtonResetTimer();

  copyButton.textContent = message;

  copyButton.classList.toggle('copy-success', result === 'success');

  copyButton.classList.toggle('copy-error', result === 'error');

  copyButtonResetTimer = window.setTimeout(() => {
    resetCopyButton();
  }, 2500);
}

function setUnavailableState(message: string): void {
  revokeCurrentObjectUrl();
  clearCopyButtonResetTimer();

  currentCapture = null;

  setStatus(message);

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

  if (copyButton) {
    copyButton.disabled = true;

    copyButton.textContent = 'Copy PNG';

    copyButton.classList.remove('copy-success', 'copy-error');
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

  downloadButton.onclick = () => {
    if (!currentObjectUrl) {
      return;
    }

    const link = document.createElement('a');

    link.href = currentObjectUrl;

    link.download = createDownloadFilename(capture.captureId);

    link.click();
  };
}

function supportsImageClipboard(): boolean {
  return (
    window.isSecureContext &&
    typeof ClipboardItem !== 'undefined' &&
    Boolean(navigator.clipboard) &&
    typeof navigator.clipboard.write === 'function'
  );
}

async function copyCaptureToClipboard(): Promise<void> {
  if (!copyButton || !currentCapture) {
    return;
  }

  if (!supportsImageClipboard()) {
    setStatus('This browser does not allow PNG image copying from the preview page.');

    setCopyButtonFeedback('Copy unavailable', 'error');

    return;
  }

  copyButton.disabled = true;
  copyButton.textContent = 'Copying…';

  try {
    /*
     * ClipboardItem needs a PNG Blob. Stored
     * captures are already encoded as image/png,
     * so no canvas re-encoding is required.
     */
    const pngBlob =
      currentCapture.blob.type === 'image/png'
        ? currentCapture.blob
        : new Blob([await currentCapture.blob.arrayBuffer()], {
            type: 'image/png',
          });

    const clipboardItem = new ClipboardItem({
      'image/png': pngBlob,
    });

    await navigator.clipboard.write([clipboardItem]);

    setStatus('The PNG image was copied to the clipboard.');

    setCopyButtonFeedback('Copied!', 'success');

    console.info('ChatRange: capture copied to clipboard.', {
      captureId: currentCapture.captureId,

      mimeType: pngBlob.type,

      byteSize: pngBlob.size,

      width: currentCapture.width,

      height: currentCapture.height,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    console.error('ChatRange: failed to copy the capture.', {
      captureId: currentCapture.captureId,

      message,
    });

    setStatus(
      'The PNG could not be copied. Keep the preview tab active, allow clipboard access, and try again.',
    );

    setCopyButtonFeedback('Copy failed', 'error');
  } finally {
    if (copyButton) {
      copyButton.disabled = currentCapture === null;
    }
  }
}

function configureCopy(capture: StoredCapture): void {
  if (!copyButton) {
    return;
  }

  currentCapture = capture;

  resetCopyButton();

  copyButton.disabled = false;

  copyButton.onclick = () => {
    void copyCaptureToClipboard();
  };
}

function configureDelete(capture: StoredCapture): void {
  if (!deleteButton) {
    return;
  }

  deleteButton.disabled = false;

  deleteButton.onclick = () => {
    deleteButton.disabled = true;

    if (copyButton) {
      copyButton.disabled = true;
    }

    if (downloadButton) {
      downloadButton.disabled = true;
    }

    void deleteCapture(capture.captureId)
      .then(() => {
        setUnavailableState('The capture was deleted.');
      })
      .catch((error: unknown) => {
        console.error('ChatRange: failed to delete the capture.', error);

        setStatus('The capture could not be deleted.');

        deleteButton.disabled = false;

        if (currentCapture) {
          if (copyButton) {
            copyButton.disabled = false;
          }

          if (downloadButton) {
            downloadButton.disabled = false;
          }
        }
      });
  };
}

function displayCapture(capture: StoredCapture): void {
  if (!statusElement || !imageElement) {
    return;
  }

  revokeCurrentObjectUrl();

  currentCapture = capture;

  currentObjectUrl = URL.createObjectURL(capture.blob);

  imageElement.src = currentObjectUrl;

  imageElement.hidden = false;

  setStatus('Showing a cropped conversation-range capture stored in IndexedDB.');

  if (metadataElement) {
    metadataElement.textContent =
      `${capture.width} × ` +
      `${capture.height} physical pixels · ` +
      `Created ${formatTimestamp(capture.createdAt)} · ` +
      `Expires ${formatTimestamp(capture.expiresAt)}`;

    metadataElement.hidden = false;
  }

  configureDownload(capture);
  configureCopy(capture);
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

function cleanUpPreview(): void {
  clearCopyButtonResetTimer();
  revokeCurrentObjectUrl();

  currentCapture = null;
}

window.addEventListener('beforeunload', cleanUpPreview);

void loadCapture().catch((error: unknown) => {
  console.error('ChatRange: failed to load the IndexedDB capture.', error);

  setUnavailableState('The capture preview could not be loaded.');
});

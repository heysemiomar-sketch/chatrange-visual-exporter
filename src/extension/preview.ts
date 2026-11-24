import { deleteCapture, deleteExpiredCaptures, getCapture } from '../core/capture-storage';

import type { StoredCapture } from '../core/capture-storage';

/*
 * Conservative single-image limits for clipboard
 * destinations such as Miro.
 */
const MAXIMUM_COPY_WIDTH_PX = 4096;

const MAXIMUM_COPY_HEIGHT_PX = 4096;

const MAXIMUM_COPY_PIXELS = 16_000_000;

const MAXIMUM_COPY_BYTES = 28 * 1024 * 1024;

const MAXIMUM_RESIZE_ATTEMPTS = 8;

const MINIMUM_DIMENSION_PX = 64;

interface ClipboardImage {
  blob: Blob;
  width: number;
  height: number;
  scale: number;
  wasResized: boolean;
}

const statusElement = document.querySelector<HTMLParagraphElement>('#status');

const metadataElement = document.querySelector<HTMLParagraphElement>('#metadata');

const imageElement = document.querySelector<HTMLImageElement>('#capture');

const downloadButton = document.querySelector<HTMLButtonElement>('#download');

const copyButton = document.querySelector<HTMLButtonElement>('#copy-capture');

const deleteButton = document.querySelector<HTMLButtonElement>('#delete-capture');

let currentObjectUrl: string | null = null;

let currentCapture: StoredCapture | null = null;

let preparedClipboardImage: ClipboardImage | null = null;

let preparationPromise: Promise<ClipboardImage> | null = null;

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

function setCopyButtonFeedback(label: string, type: 'success' | 'error'): void {
  if (!copyButton) {
    return;
  }

  clearCopyButtonResetTimer();

  copyButton.textContent = label;

  copyButton.classList.toggle('copy-success', type === 'success');

  copyButton.classList.toggle('copy-error', type === 'error');

  copyButtonResetTimer = window.setTimeout(resetCopyButton, 3000);
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

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  }

  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function setStatus(message: string): void {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

function supportsImageClipboard(): boolean {
  return (
    window.isSecureContext &&
    typeof ClipboardItem !== 'undefined' &&
    Boolean(navigator.clipboard) &&
    typeof navigator.clipboard.write === 'function'
  );
}

function isCaptureAlreadySafe(capture: StoredCapture): boolean {
  return (
    capture.width <= MAXIMUM_COPY_WIDTH_PX &&
    capture.height <= MAXIMUM_COPY_HEIGHT_PX &&
    capture.width * capture.height <= MAXIMUM_COPY_PIXELS &&
    capture.blob.size <= MAXIMUM_COPY_BYTES &&
    capture.blob.type === 'image/png'
  );
}

function calculateInitialScale(width: number, height: number): number {
  const pixelCount = width * height;

  return Math.min(
    1,

    MAXIMUM_COPY_WIDTH_PX / width,

    MAXIMUM_COPY_HEIGHT_PX / height,

    Math.sqrt(MAXIMUM_COPY_PIXELS / pixelCount),
  );
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('The optimized PNG could not be encoded.'));

          return;
        }

        resolve(blob);
      },

      'image/png',
    );
  });
}

async function renderScaledPng(bitmap: ImageBitmap, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', {
    alpha: false,
  });

  if (!context) {
    throw new Error('A canvas context could not be created for clipboard optimization.');
  }

  context.imageSmoothingEnabled = true;

  context.imageSmoothingQuality = 'high';

  context.drawImage(
    bitmap,

    0,
    0,
    bitmap.width,
    bitmap.height,

    0,
    0,
    width,
    height,
  );

  return canvasToPngBlob(canvas);
}

async function createClipboardImage(capture: StoredCapture): Promise<ClipboardImage> {
  if (isCaptureAlreadySafe(capture)) {
    return {
      blob: capture.blob,

      width: capture.width,

      height: capture.height,

      scale: 1,

      wasResized: false,
    };
  }

  const bitmap = await createImageBitmap(capture.blob);

  try {
    let scale = calculateInitialScale(capture.width, capture.height);

    for (let attempt = 1; attempt <= MAXIMUM_RESIZE_ATTEMPTS; attempt += 1) {
      const width = Math.max(
        MINIMUM_DIMENSION_PX,

        Math.floor(capture.width * scale),
      );

      const height = Math.max(
        MINIMUM_DIMENSION_PX,

        Math.floor(capture.height * scale),
      );

      const blob = await renderScaledPng(bitmap, width, height);

      const withinLimits =
        width <= MAXIMUM_COPY_WIDTH_PX &&
        height <= MAXIMUM_COPY_HEIGHT_PX &&
        width * height <= MAXIMUM_COPY_PIXELS &&
        blob.size <= MAXIMUM_COPY_BYTES;

      if (withinLimits) {
        return {
          blob,
          width,
          height,
          scale,
          wasResized: true,
        };
      }

      const sizeScale =
        blob.size > MAXIMUM_COPY_BYTES ? Math.sqrt(MAXIMUM_COPY_BYTES / blob.size) * 0.9 : 0.9;

      scale *= Math.min(0.9, sizeScale);
    }

    throw new Error('The image could not be reduced below the clipboard safety limits.');
  } finally {
    bitmap.close();
  }
}

async function prepareClipboardImage(): Promise<ClipboardImage> {
  if (preparedClipboardImage) {
    return preparedClipboardImage;
  }

  if (!currentCapture) {
    throw new Error('No capture is available.');
  }

  if (!preparationPromise) {
    preparationPromise = createClipboardImage(currentCapture);
  }

  try {
    preparedClipboardImage = await preparationPromise;

    return preparedClipboardImage;
  } finally {
    preparationPromise = null;
  }
}

async function copyCaptureToClipboard(): Promise<void> {
  if (!copyButton || !currentCapture) {
    return;
  }

  if (!supportsImageClipboard()) {
    setStatus('This browser does not allow PNG copying from the preview page.');

    setCopyButtonFeedback('Copy unavailable', 'error');

    return;
  }

  copyButton.disabled = true;
  copyButton.textContent = 'Optimizing…';

  try {
    const clipboardImage = await prepareClipboardImage();

    copyButton.textContent = 'Copying…';

    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': clipboardImage.blob,
      }),
    ]);

    if (clipboardImage.wasResized) {
      const scalePercentage = Math.round(clipboardImage.scale * 100);

      setStatus(
        `Copied as one optimized PNG: ` +
          `${clipboardImage.width} × ` +
          `${clipboardImage.height} pixels · ` +
          `${formatFileSize(clipboardImage.blob.size)} · ` +
          `${scalePercentage}% of original dimensions.`,
      );
    } else {
      setStatus(
        `Copied the original PNG: ` +
          `${clipboardImage.width} × ` +
          `${clipboardImage.height} pixels · ` +
          `${formatFileSize(clipboardImage.blob.size)}.`,
      );
    }

    setCopyButtonFeedback('Copied!', 'success');

    console.info('ChatRange: single clipboard-safe image copied.', {
      captureId: currentCapture.captureId,

      originalWidth: currentCapture.width,

      originalHeight: currentCapture.height,

      copiedWidth: clipboardImage.width,

      copiedHeight: clipboardImage.height,

      copiedByteSize: clipboardImage.blob.size,

      scale: clipboardImage.scale,

      wasResized: clipboardImage.wasResized,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    console.error('ChatRange: failed to copy the optimized capture.', {
      captureId: currentCapture.captureId,

      message,
    });

    setStatus(
      'The PNG could not be copied. Keep the Preview tab active, allow clipboard access, and try again.',
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

  preparedClipboardImage = null;

  preparationPromise = null;

  resetCopyButton();

  copyButton.disabled = false;

  copyButton.onclick = () => {
    void copyCaptureToClipboard();
  };
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

function setUnavailableState(message: string): void {
  cleanUpPreview();

  setStatus(message);

  if (metadataElement) {
    metadataElement.hidden = true;
  }

  if (imageElement) {
    imageElement.hidden = true;

    imageElement.removeAttribute('src');
  }

  if (copyButton) {
    copyButton.disabled = true;
  }

  if (downloadButton) {
    downloadButton.disabled = true;
  }

  if (deleteButton) {
    deleteButton.disabled = true;
  }
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

  cleanUpPreview();

  currentCapture = capture;

  currentObjectUrl = URL.createObjectURL(capture.blob);

  imageElement.src = currentObjectUrl;

  imageElement.hidden = false;

  setStatus('Capture ready. Copy PNG automatically creates one clipboard-safe image.');

  if (metadataElement) {
    metadataElement.textContent =
      `${capture.width} × ` +
      `${capture.height} physical pixels · ` +
      `${formatFileSize(capture.blob.size)} · ` +
      `Created ${formatTimestamp(capture.createdAt)} · ` +
      `Expires ${formatTimestamp(capture.expiresAt)}`;

    metadataElement.hidden = false;
  }

  configureCopy(capture);
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

function cleanUpPreview(): void {
  clearCopyButtonResetTimer();
  revokeCurrentObjectUrl();

  currentCapture = null;

  preparedClipboardImage = null;

  preparationPromise = null;
}

window.addEventListener('beforeunload', cleanUpPreview);

void loadCapture().catch((error: unknown) => {
  console.error('ChatRange: failed to load the IndexedDB capture.', error);

  setUnavailableState('The capture preview could not be loaded.');
});

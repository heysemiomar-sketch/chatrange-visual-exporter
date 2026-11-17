import type {
  CaptureFailure,
  CaptureRectangle,
  CaptureResult,
  ProcessVisibleCaptureRequest,
  ProcessVisibleCaptureSuccess,
} from '../core/capture-messages';

import { isProcessVisibleCaptureRequest } from '../core/capture-messages';

interface PhysicalCropRectangle {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
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

function calculatePhysicalCrop(
  crop: CaptureRectangle,
  viewportCssWidth: number,
  viewportCssHeight: number,
  imageWidth: number,
  imageHeight: number,
): PhysicalCropRectangle {
  if (
    viewportCssWidth <= 0 ||
    viewportCssHeight <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    crop.width <= 0 ||
    crop.height <= 0
  ) {
    throw new Error('The capture or crop dimensions are invalid.');
  }

  const scaleX = imageWidth / viewportCssWidth;

  const scaleY = imageHeight / viewportCssHeight;

  const rawLeft = crop.left * scaleX;

  const rawTop = crop.top * scaleY;

  const rawRight = (crop.left + crop.width) * scaleX;

  const rawBottom = (crop.top + crop.height) * scaleY;

  const sourceX = Math.max(0, Math.floor(rawLeft));

  const sourceY = Math.max(0, Math.floor(rawTop));

  const sourceRight = Math.min(imageWidth, Math.ceil(rawRight));

  const sourceBottom = Math.min(imageHeight, Math.ceil(rawBottom));

  const sourceWidth = sourceRight - sourceX;

  const sourceHeight = sourceBottom - sourceY;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('The selected range is outside the captured image.');
  }

  return {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
  };
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas PNG encoding returned no data.'));

        return;
      }

      resolve(blob);
    }, 'image/png');
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('The encoded PNG could not be converted to a Data URL.'));
    });

    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('The PNG Data URL conversion failed.'));
    });

    reader.readAsDataURL(blob);
  });
}

async function cropScreenshot(
  request: ProcessVisibleCaptureRequest,
): Promise<ProcessVisibleCaptureSuccess> {
  const screenshotResponse = await fetch(request.screenshotDataUrl);

  const screenshotBlob = await screenshotResponse.blob();

  const imageBitmap = await createImageBitmap(screenshotBlob);

  try {
    const crop = calculatePhysicalCrop(
      request.crop,
      request.viewport.cssWidth,
      request.viewport.cssHeight,
      imageBitmap.width,
      imageBitmap.height,
    );

    const canvas = document.createElement('canvas');

    canvas.width = crop.sourceWidth;

    canvas.height = crop.sourceHeight;

    const context = canvas.getContext('2d', {
      alpha: false,
    });

    if (!context) {
      throw new Error('A 2D canvas context could not be created.');
    }

    context.drawImage(
      imageBitmap,
      crop.sourceX,
      crop.sourceY,
      crop.sourceWidth,
      crop.sourceHeight,
      0,
      0,
      crop.sourceWidth,
      crop.sourceHeight,
    );

    const pngBlob = await canvasToPngBlob(canvas);

    const pngDataUrl = await blobToDataUrl(pngBlob);

    return {
      type: 'process-visible-capture-success',
      requestId: request.requestId,
      pngDataUrl,
      width: crop.sourceWidth,
      height: crop.sourceHeight,
    };
  } finally {
    imageBitmap.close();
  }
}

async function processRequest(request: ProcessVisibleCaptureRequest): Promise<CaptureResult> {
  try {
    return await cropScreenshot(request);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown offscreen processing failure.';

    return createFailure(request.requestId, 'OFFSCREEN_FAILED', message);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isProcessVisibleCaptureRequest(message)) {
    return false;
  }

  void processRequest(message).then(sendResponse);

  return true;
});

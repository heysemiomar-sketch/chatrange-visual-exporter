import type {
  CaptureFailure,
  CaptureRectangle,
  CaptureResult,
  ComposeMultiViewportCaptureRequest,
  ComposeMultiViewportCaptureSuccess,
  ComposeViewportSegment,
  ProcessVisibleCaptureRequest,
  ProcessVisibleCaptureSuccess,
} from '../core/capture-messages';

import {
  isComposeMultiViewportCaptureRequest,
  isProcessVisibleCaptureRequest,
} from '../core/capture-messages';

import { deleteExpiredCaptures, saveCapture } from '../core/capture-storage';

import {
  MAXIMUM_COMPOSED_HEIGHT_PHYSICAL_PX,
  MAXIMUM_VIEWPORT_SEGMENTS,
} from '../core/multi-viewport-capture';

interface PhysicalCropRectangle {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
}

interface DecodedCompositionSegment {
  segment: ComposeViewportSegment;
  imageBitmap: ImageBitmap;
  crop: PhysicalCropRectangle;
  overlapPhysicalPx: number;
  uniqueHeightPhysicalPx: number;
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

function calculatePhysicalOverlap(
  segment: ComposeViewportSegment,
  crop: PhysicalCropRectangle,
): number {
  if (segment.segmentIndex === 0 || segment.overlapWithPreviousCssPx <= 0) {
    return 0;
  }

  const scaleY = segment.imageHeightPhysicalPx / segment.viewport.cssHeight;

  const overlapPhysicalPx = Math.round(segment.overlapWithPreviousCssPx * scaleY);

  return Math.min(crop.sourceHeight - 1, Math.max(0, overlapPhysicalPx));
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

async function decodeScreenshot(screenshotDataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(screenshotDataUrl);

  if (!response.ok) {
    throw new Error('A viewport screenshot could not be decoded.');
  }

  const blob = await response.blob();

  return await createImageBitmap(blob);
}

function validateCompositionSegments(segments: ComposeViewportSegment[]): void {
  if (segments.length === 0) {
    throw new Error('At least one viewport segment is required.');
  }

  if (segments.length > MAXIMUM_VIEWPORT_SEGMENTS) {
    throw new Error(`The composition exceeds the limit of ${MAXIMUM_VIEWPORT_SEGMENTS} segments.`);
  }

  const sortedIndices = segments
    .map((segment) => segment.segmentIndex)
    .sort((first, second) => first - second);

  for (let expectedIndex = 0; expectedIndex < sortedIndices.length; expectedIndex += 1) {
    if (sortedIndices[expectedIndex] !== expectedIndex) {
      throw new Error('Viewport segment indices must be contiguous and start at zero.');
    }
  }
}

async function decodeCompositionSegments(
  segments: ComposeViewportSegment[],
): Promise<DecodedCompositionSegment[]> {
  const orderedSegments = [...segments].sort(
    (first, second) => first.segmentIndex - second.segmentIndex,
  );

  const decodedSegments: DecodedCompositionSegment[] = [];

  try {
    for (const segment of orderedSegments) {
      const imageBitmap = await decodeScreenshot(segment.screenshotDataUrl);

      const crop = calculatePhysicalCrop(
        segment.crop,
        segment.viewport.cssWidth,
        segment.viewport.cssHeight,
        imageBitmap.width,
        imageBitmap.height,
      );

      const overlapPhysicalPx = calculatePhysicalOverlap(segment, crop);

      const uniqueHeightPhysicalPx = crop.sourceHeight - overlapPhysicalPx;

      if (uniqueHeightPhysicalPx <= 0) {
        imageBitmap.close();

        throw new Error(
          `Segment ${segment.segmentIndex} contains no unique vertical pixels after overlap removal.`,
        );
      }

      decodedSegments.push({
        segment,
        imageBitmap,
        crop,
        overlapPhysicalPx,
        uniqueHeightPhysicalPx,
      });
    }

    return decodedSegments;
  } catch (error: unknown) {
    for (const decodedSegment of decodedSegments) {
      decodedSegment.imageBitmap.close();
    }

    throw error;
  }
}

function validateCompositionWidths(segments: DecodedCompositionSegment[]): number {
  const firstSegment = segments[0];

  if (!firstSegment) {
    throw new Error('No decoded viewport segment is available.');
  }

  const width = firstSegment.crop.sourceWidth;

  for (const segment of segments) {
    if (segment.crop.sourceWidth !== width) {
      throw new Error(
        `Segment ${segment.segment.segmentIndex} has a cropped width of ` +
          `${segment.crop.sourceWidth}px, but the expected width is ${width}px.`,
      );
    }
  }

  return width;
}

function calculateComposedHeight(segments: DecodedCompositionSegment[]): number {
  const height = segments.reduce(
    (totalHeight, segment) => totalHeight + segment.uniqueHeightPhysicalPx,
    0,
  );

  if (height <= 0) {
    throw new Error('The composed image has no height.');
  }

  if (height > MAXIMUM_COMPOSED_HEIGHT_PHYSICAL_PX) {
    throw new Error(
      `The composed image height of ${height}px exceeds the limit of ` +
        `${MAXIMUM_COMPOSED_HEIGHT_PHYSICAL_PX}px.`,
    );
  }

  return height;
}

function drawComposition(
  segments: DecodedCompositionSegment[],
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', {
    alpha: false,
  });

  if (!context) {
    throw new Error('A 2D canvas context could not be created for composition.');
  }

  let destinationY = 0;

  for (const segment of segments) {
    const sourceY = segment.crop.sourceY + segment.overlapPhysicalPx;

    context.drawImage(
      segment.imageBitmap,
      segment.crop.sourceX,
      sourceY,
      segment.crop.sourceWidth,
      segment.uniqueHeightPhysicalPx,
      0,
      destinationY,
      segment.crop.sourceWidth,
      segment.uniqueHeightPhysicalPx,
    );

    destinationY += segment.uniqueHeightPhysicalPx;
  }

  return canvas;
}

async function cropAndStoreScreenshot(
  request: ProcessVisibleCaptureRequest,
): Promise<ProcessVisibleCaptureSuccess> {
  const imageBitmap = await decodeScreenshot(request.screenshotDataUrl);

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

    await deleteExpiredCaptures();

    const storedCapture = await saveCapture({
      captureId: request.requestId,
      width: crop.sourceWidth,
      height: crop.sourceHeight,
      blob: pngBlob,
    });

    return {
      type: 'process-visible-capture-success',
      requestId: request.requestId,
      captureId: storedCapture.captureId,
      width: storedCapture.width,
      height: storedCapture.height,
      mimeType: storedCapture.mimeType,
      createdAt: storedCapture.createdAt,
      expiresAt: storedCapture.expiresAt,
    };
  } finally {
    imageBitmap.close();
  }
}

async function composeAndStoreSegments(
  request: ComposeMultiViewportCaptureRequest,
): Promise<ComposeMultiViewportCaptureSuccess> {
  validateCompositionSegments(request.segments);

  const decodedSegments = await decodeCompositionSegments(request.segments);

  try {
    const width = validateCompositionWidths(decodedSegments);

    const height = calculateComposedHeight(decodedSegments);

    const canvas = drawComposition(decodedSegments, width, height);

    const pngBlob = await canvasToPngBlob(canvas);

    await deleteExpiredCaptures();

    const storedCapture = await saveCapture({
      captureId: request.requestId,
      width,
      height,
      blob: pngBlob,
    });

    return {
      type: 'compose-multi-viewport-capture-success',
      requestId: request.requestId,
      sessionId: request.sessionId,
      captureId: storedCapture.captureId,
      segmentCount: decodedSegments.length,
      width: storedCapture.width,
      height: storedCapture.height,
      mimeType: storedCapture.mimeType,
      createdAt: storedCapture.createdAt,
      expiresAt: storedCapture.expiresAt,
    };
  } finally {
    for (const segment of decodedSegments) {
      segment.imageBitmap.close();
    }
  }
}

async function processVisibleRequest(
  request: ProcessVisibleCaptureRequest,
): Promise<CaptureResult> {
  try {
    return await cropAndStoreScreenshot(request);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown offscreen processing failure.';

    console.error('ChatRange: offscreen capture processing failed.', {
      requestId: request.requestId,
      message,
    });

    return createFailure(request.requestId, 'OFFSCREEN_FAILED', message);
  }
}

async function processCompositionRequest(
  request: ComposeMultiViewportCaptureRequest,
): Promise<CaptureResult> {
  try {
    return await composeAndStoreSegments(request);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown multi-viewport composition failure.';

    console.error('ChatRange: multi-viewport composition failed.', {
      requestId: request.requestId,
      sessionId: request.sessionId,
      segmentCount: request.segments.length,
      message,
    });

    return createFailure(request.requestId, 'COMPOSITION_FAILED', message);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isProcessVisibleCaptureRequest(message)) {
    void processVisibleRequest(message).then(sendResponse);

    return true;
  }

  if (isComposeMultiViewportCaptureRequest(message)) {
    void processCompositionRequest(message).then(sendResponse);

    return true;
  }

  return false;
});

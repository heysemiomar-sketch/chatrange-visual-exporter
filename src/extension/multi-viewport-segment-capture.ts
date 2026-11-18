import type { ConversationTurn } from '../adapters/base';

import { throwIfCaptureCancelled } from '../core/capture-cancellation';

import type {
  CaptureFailure,
  CaptureRectangle,
  CaptureViewport,
  CaptureVisibleSegmentRequest,
  CaptureVisibleSegmentSuccess,
} from '../core/capture-messages';

import { suppressCaptureUi } from './capture-ui-suppression';

import { createMultiViewportScrollPlan, scrollToPosition } from './multi-viewport-scroll';

const MAXIMUM_VIEWPORT_SEGMENTS = 20;

interface RangeBoundsInContainer {
  topCssPx: number;
  bottomCssPx: number;
}

interface VisibleRangeCropOptions {
  isFinalSegment: boolean;
  safeBottomInsetCssPx: number;
}

function calculatePhysicalOverlap(
  overlapCssPx: number,
  viewportCssHeight: number,
  imageHeightPhysicalPx: number,
): number {
  if (overlapCssPx <= 0 || viewportCssHeight <= 0 || imageHeightPhysicalPx <= 0) {
    return 0;
  }

  const scaleY = imageHeightPhysicalPx / viewportCssHeight;

  return Math.max(0, Math.round(overlapCssPx * scaleY));
}

export interface CapturedViewportSegment {
  segmentIndex: number;
  requestedScrollTopCssPx: number;
  actualScrollTopCssPx: number;
  overlapWithPreviousCssPx: number;
  overlapWithPreviousPhysicalPx: number;
  safeBottomInsetCssPx: number;
  crop: CaptureRectangle;
  viewport: CaptureViewport;
  screenshotDataUrl: string;
  imageWidthPhysicalPx: number;
  imageHeightPhysicalPx: number;
  capturedAt: number;
}

export interface MultiViewportSegmentCaptureResult {
  sessionId: string;
  originalScrollTopCssPx: number;
  restoredScrollTopCssPx: number;
  targetOverlapCssPx: number;
  safeBottomInsetCssPx: number;
  effectiveCaptureHeightCssPx: number;
  stepCssPx: number;
  plannedSegmentCount: number;
  capturedSegmentCount: number;
  segments: CapturedViewportSegment[];
}

export interface MultiViewportSegmentCaptureCallbacks {
  onProgress?(completedSegments: number, totalSegments: number): void;
}

export class MultiViewportSegmentCaptureError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'MultiViewportSegmentCaptureError';
  }
}

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

function isSegmentCaptureSuccess(value: unknown): value is CaptureVisibleSegmentSuccess {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.type === 'capture-visible-segment-success' &&
    typeof value.requestId === 'string' &&
    typeof value.sessionId === 'string' &&
    typeof value.segmentIndex === 'number' &&
    Number.isInteger(value.segmentIndex) &&
    value.segmentIndex >= 0 &&
    typeof value.scrollTopCssPx === 'number' &&
    typeof value.overlapWithPreviousCssPx === 'number' &&
    typeof value.screenshotDataUrl === 'string' &&
    value.screenshotDataUrl.startsWith('data:image/png') &&
    typeof value.imageWidthPhysicalPx === 'number' &&
    value.imageWidthPhysicalPx > 0 &&
    typeof value.imageHeightPhysicalPx === 'number' &&
    value.imageHeightPhysicalPx > 0 &&
    typeof value.capturedAt === 'number'
  );
}

function createRequestId(): string {
  return crypto.randomUUID();
}

function waitForCleanPaint(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function measureRangeBoundsInContainer(
  turns: ConversationTurn[],
  container: HTMLElement,
): RangeBoundsInContainer {
  if (turns.length === 0) {
    throw new MultiViewportSegmentCaptureError(
      'The selected conversation range contains no turns.',
    );
  }

  const containerRectangle = container.getBoundingClientRect();

  const offsets = turns.map((turn) => {
    const rectangle = turn.element.getBoundingClientRect();

    const topCssPx = rectangle.top - containerRectangle.top + container.scrollTop;

    return {
      topCssPx,
      bottomCssPx: topCssPx + rectangle.height,
    };
  });

  const topCssPx = Math.min(...offsets.map((offset) => offset.topCssPx));

  const bottomCssPx = Math.max(...offsets.map((offset) => offset.bottomCssPx));

  if (!Number.isFinite(topCssPx) || !Number.isFinite(bottomCssPx) || bottomCssPx <= topCssPx) {
    throw new MultiViewportSegmentCaptureError(
      'The selected conversation range could not be measured.',
    );
  }

  return {
    topCssPx,
    bottomCssPx,
  };
}

function getVisibleRangeCrop(
  container: HTMLElement,
  rangeBounds: RangeBoundsInContainer,
  actualScrollTopCssPx: number,
  options: VisibleRangeCropOptions,
): CaptureRectangle {
  const containerRectangle = container.getBoundingClientRect();

  const visibleContainerLeft = Math.max(0, containerRectangle.left);

  const visibleContainerTop = Math.max(0, containerRectangle.top);

  const visibleContainerRight = Math.min(window.innerWidth, containerRectangle.right);

  const rawVisibleContainerBottom = Math.min(window.innerHeight, containerRectangle.bottom);

  /*
   * Exclude the lower viewport band from all
   * intermediate segments. ChatGPT can draw
   * fading, composer overlays, scroll controls,
   * or custom scrollbar elements in this area.
   *
   * The last segment keeps the full visible
   * container so the selected range endpoint
   * cannot be cropped.
   */
  const safeBottomInsetCssPx = options.isFinalSegment
    ? 0
    : Math.max(0, options.safeBottomInsetCssPx);

  const visibleContainerBottom = Math.max(
    visibleContainerTop,
    rawVisibleContainerBottom - safeBottomInsetCssPx,
  );

  const visibleContentTopCssPx = actualScrollTopCssPx;

  const visibleCaptureHeightCssPx = Math.max(0, visibleContainerBottom - containerRectangle.top);

  const visibleContentBottomCssPx = actualScrollTopCssPx + visibleCaptureHeightCssPx;

  const intersectedTopCssPx = Math.max(rangeBounds.topCssPx, visibleContentTopCssPx);

  const intersectedBottomCssPx = Math.min(rangeBounds.bottomCssPx, visibleContentBottomCssPx);

  const topInsideContainerCssPx = intersectedTopCssPx - actualScrollTopCssPx;

  const bottomInsideContainerCssPx = intersectedBottomCssPx - actualScrollTopCssPx;

  const rangeViewportTop = containerRectangle.top + topInsideContainerCssPx;

  const rangeViewportBottom = containerRectangle.top + bottomInsideContainerCssPx;

  const left = visibleContainerLeft;

  const top = Math.max(visibleContainerTop, rangeViewportTop);

  const right = visibleContainerRight;

  const bottom = Math.min(visibleContainerBottom, rangeViewportBottom);

  const width = right - left;

  const height = bottom - top;

  if (width <= 0 || height <= 0) {
    throw new MultiViewportSegmentCaptureError(
      'The selected range does not intersect the safe viewport capture band.',
    );
  }

  return {
    left,
    top,
    width,
    height,
  };
}

function getViewport(): CaptureViewport {
  return {
    cssWidth: window.innerWidth,
    cssHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  };
}

async function requestSegmentCapture(
  request: CaptureVisibleSegmentRequest,
  signal: AbortSignal,
): Promise<CaptureVisibleSegmentSuccess> {
  throwIfCaptureCancelled(signal);

  const response = (await chrome.runtime.sendMessage(request)) as unknown;

  throwIfCaptureCancelled(signal);

  if (isCaptureFailure(response)) {
    throw new MultiViewportSegmentCaptureError(
      `Segment ${request.segmentIndex} failed: ` + `${response.message}`,
    );
  }

  if (!isSegmentCaptureSuccess(response)) {
    throw new MultiViewportSegmentCaptureError(
      `Segment ${request.segmentIndex} ` + `returned an invalid response.`,
    );
  }

  if (response.requestId !== request.requestId) {
    throw new MultiViewportSegmentCaptureError(
      `Segment ${request.segmentIndex} ` + `returned a mismatched request ID.`,
    );
  }

  if (response.sessionId !== request.sessionId) {
    throw new MultiViewportSegmentCaptureError(
      `Segment ${request.segmentIndex} ` + `returned a mismatched session ID.`,
    );
  }

  if (response.segmentIndex !== request.segmentIndex) {
    throw new MultiViewportSegmentCaptureError(
      `Expected segment ${request.segmentIndex}, ` +
        `but received segment ` +
        `${response.segmentIndex}.`,
    );
  }

  return response;
}

function assertConsistentDimensions(
  segments: CapturedViewportSegment[],
  candidate: CaptureVisibleSegmentSuccess,
): void {
  const firstSegment = segments[0];

  if (!firstSegment) {
    return;
  }

  if (
    candidate.imageWidthPhysicalPx !== firstSegment.imageWidthPhysicalPx ||
    candidate.imageHeightPhysicalPx !== firstSegment.imageHeightPhysicalPx
  ) {
    throw new MultiViewportSegmentCaptureError(
      `Segment ${candidate.segmentIndex} has dimensions ` +
        `${candidate.imageWidthPhysicalPx} × ` +
        `${candidate.imageHeightPhysicalPx}, ` +
        `but segment 0 has dimensions ` +
        `${firstSegment.imageWidthPhysicalPx} × ` +
        `${firstSegment.imageHeightPhysicalPx}.`,
    );
  }
}

function calculateActualOverlapCssPx(
  previousSegment: CapturedViewportSegment | undefined,
  currentScrollTopCssPx: number,
  fallbackOverlapCssPx: number,
): number {
  if (!previousSegment) {
    return 0;
  }

  const previousVisibleBottomCssPx =
    previousSegment.actualScrollTopCssPx + previousSegment.crop.height;

  const measuredOverlapCssPx = previousVisibleBottomCssPx - currentScrollTopCssPx;

  if (!Number.isFinite(measuredOverlapCssPx)) {
    return fallbackOverlapCssPx;
  }

  return Math.max(0, Math.min(previousSegment.crop.height - 1, measuredOverlapCssPx));
}

export async function captureMultiViewportSegments(
  turns: ConversationTurn[],
  signal: AbortSignal,
  callbacks: MultiViewportSegmentCaptureCallbacks = {},
): Promise<MultiViewportSegmentCaptureResult> {
  throwIfCaptureCancelled(signal);

  const plan = createMultiViewportScrollPlan({
    turns,
  });

  if (plan.positionsCssPx.length > MAXIMUM_VIEWPORT_SEGMENTS) {
    throw new MultiViewportSegmentCaptureError(
      `The plan exceeds the limit of ` + `${MAXIMUM_VIEWPORT_SEGMENTS} segments.`,
    );
  }

  const container = plan.container.element;

  const sessionId = crypto.randomUUID();

  const originalScrollTopCssPx = container.scrollTop;

  const rangeBounds = measureRangeBoundsInContainer(turns, container);

  const segments: CapturedViewportSegment[] = [];

  const uiSuppression = suppressCaptureUi();

  try {
    await waitForCleanPaint();

    throwIfCaptureCancelled(signal);

    for (let segmentIndex = 0; segmentIndex < plan.positionsCssPx.length; segmentIndex += 1) {
      throwIfCaptureCancelled(signal);

      const requestedScrollTopCssPx = plan.positionsCssPx[segmentIndex];

      if (requestedScrollTopCssPx === undefined) {
        throw new MultiViewportSegmentCaptureError(
          `Planned scroll position ` + `${segmentIndex} is missing.`,
        );
      }

      const actualScrollTopCssPx = await scrollToPosition(container, requestedScrollTopCssPx);

      throwIfCaptureCancelled(signal);

      await waitForCleanPaint();

      throwIfCaptureCancelled(signal);

      const isFinalSegment = segmentIndex === plan.positionsCssPx.length - 1;

      const appliedSafeBottomInsetCssPx = isFinalSegment ? 0 : plan.safeBottomInsetCssPx;

      const crop = getVisibleRangeCrop(container, rangeBounds, actualScrollTopCssPx, {
        isFinalSegment,
        safeBottomInsetCssPx: appliedSafeBottomInsetCssPx,
      });

      const viewport = getViewport();

      const previousSegment = segments.at(-1);

      const overlapWithPreviousCssPx = calculateActualOverlapCssPx(
        previousSegment,
        actualScrollTopCssPx,
        segmentIndex === 0 ? 0 : plan.targetOverlapCssPx,
      );

      console.info('ChatRange: safe viewport segment prepared.', {
        sessionId,
        segmentIndex,
        isFinalSegment,
        requestedScrollTopCssPx,
        actualScrollTopCssPx,
        safeBottomInsetCssPx: appliedSafeBottomInsetCssPx,
        cropTopCssPx: crop.top,
        cropHeightCssPx: crop.height,
        overlapWithPreviousCssPx,
        targetOverlapCssPx: plan.targetOverlapCssPx,
        stepCssPx: plan.stepCssPx,
        effectiveCaptureHeightCssPx: plan.effectiveCaptureHeightCssPx,
      });

      const request: CaptureVisibleSegmentRequest = {
        type: 'capture-visible-segment',
        requestId: createRequestId(),
        sessionId,
        segmentIndex,
        scrollTopCssPx: actualScrollTopCssPx,
        overlapWithPreviousCssPx,
        crop,
        viewport,
      };

      const response = await requestSegmentCapture(request, signal);

      throwIfCaptureCancelled(signal);

      assertConsistentDimensions(segments, response);

      const overlapWithPreviousPhysicalPx = calculatePhysicalOverlap(
        overlapWithPreviousCssPx,
        viewport.cssHeight,
        response.imageHeightPhysicalPx,
      );

      segments.push({
        segmentIndex,
        requestedScrollTopCssPx,
        actualScrollTopCssPx,
        overlapWithPreviousCssPx,
        overlapWithPreviousPhysicalPx,
        safeBottomInsetCssPx: appliedSafeBottomInsetCssPx,
        crop,
        viewport,
        screenshotDataUrl: response.screenshotDataUrl,
        imageWidthPhysicalPx: response.imageWidthPhysicalPx,
        imageHeightPhysicalPx: response.imageHeightPhysicalPx,
        capturedAt: response.capturedAt,
      });

      callbacks.onProgress?.(segmentIndex + 1, plan.positionsCssPx.length);
    }

    throwIfCaptureCancelled(signal);
  } catch (error: unknown) {
    /*
     * Explicitly release large Data URL references
     * when capture fails or is cancelled.
     */
    segments.length = 0;

    throw error;
  } finally {
    try {
      await scrollToPosition(container, originalScrollTopCssPx);
    } finally {
      uiSuppression.restore();
    }
  }

  return {
    sessionId,
    originalScrollTopCssPx,
    restoredScrollTopCssPx: container.scrollTop,
    targetOverlapCssPx: plan.targetOverlapCssPx,
    safeBottomInsetCssPx: plan.safeBottomInsetCssPx,
    effectiveCaptureHeightCssPx: plan.effectiveCaptureHeightCssPx,
    stepCssPx: plan.stepCssPx,
    plannedSegmentCount: plan.positionsCssPx.length,
    capturedSegmentCount: segments.length,
    segments,
  };
}

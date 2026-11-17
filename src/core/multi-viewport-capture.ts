import type { CaptureRectangle, CaptureViewport } from './capture-messages';

export const DEFAULT_TARGET_OVERLAP_CSS_PX = 120;
export const MINIMUM_SCROLL_MOVEMENT_CSS_PX = 8;
export const MAXIMUM_REPEATED_SCROLL_POSITIONS = 3;
export const MAXIMUM_VIEWPORT_SEGMENTS = 20;
export const MAXIMUM_COMPOSED_HEIGHT_PHYSICAL_PX = 32_000;

export type MultiViewportCaptureState =
  'idle' | 'preparing' | 'capturing' | 'composing' | 'completed' | 'cancelled' | 'failed';

export type MultiViewportCaptureFailureCode =
  | 'INVALID_RANGE'
  | 'NO_SCROLL_CONTAINER'
  | 'SCROLL_STALLED'
  | 'REPEATED_SCROLL_POSITION'
  | 'SEGMENT_LIMIT_EXCEEDED'
  | 'COMPOSED_HEIGHT_LIMIT_EXCEEDED'
  | 'CAPTURE_FAILED'
  | 'COMPOSITION_FAILED'
  | 'CANCELLED';

export interface TurnCaptureFingerprint {
  role: 'user' | 'assistant';
  normalizedTextPrefix: string;
  approximateLogicalIndex: number;
}

export interface ViewportCaptureSegment {
  segmentIndex: number;
  capturedAt: number;
  scrollTopCssPx: number;
  viewport: CaptureViewport;
  crop: CaptureRectangle;
  screenshotDataUrl: string;
  imageWidthPhysicalPx: number;
  imageHeightPhysicalPx: number;
  overlapWithPreviousCssPx: number;
  overlapWithPreviousPhysicalPx: number;
}

export interface MultiViewportCaptureLimits {
  targetOverlapCssPx: number;
  minimumScrollMovementCssPx: number;
  maximumRepeatedScrollPositions: number;
  maximumSegments: number;
  maximumComposedHeightPhysicalPx: number;
}

export interface MultiViewportCaptureProgress {
  state: MultiViewportCaptureState;
  capturedSegmentCount: number;
  maximumSegmentCount: number;
  currentScrollTopCssPx: number;
  estimatedProgress: number;
}

export interface MultiViewportCaptureFailure {
  code: MultiViewportCaptureFailureCode;
  message: string;
}

export interface MultiViewportCaptureSession {
  sessionId: string;
  state: MultiViewportCaptureState;
  createdAt: number;
  updatedAt: number;
  startFingerprint: TurnCaptureFingerprint;
  endFingerprint: TurnCaptureFingerprint;
  limits: MultiViewportCaptureLimits;
  segments: ViewportCaptureSegment[];
  visitedScrollPositionsCssPx: number[];
  repeatedScrollPositionCount: number;
  failure: MultiViewportCaptureFailure | null;
}

export interface CreateMultiViewportCaptureSessionInput {
  sessionId: string;
  startFingerprint: TurnCaptureFingerprint;
  endFingerprint: TurnCaptureFingerprint;
  limits?: Partial<MultiViewportCaptureLimits>;
}

export interface RegisterSegmentInput {
  capturedAt?: number;
  scrollTopCssPx: number;
  viewport: CaptureViewport;
  crop: CaptureRectangle;
  screenshotDataUrl: string;
  imageWidthPhysicalPx: number;
  imageHeightPhysicalPx: number;
  overlapWithPreviousCssPx: number;
}

export interface ScrollValidationResult {
  valid: boolean;
  repeatedPosition: boolean;
  movementCssPx: number;
  failure: MultiViewportCaptureFailure | null;
}

export function createDefaultMultiViewportCaptureLimits(): MultiViewportCaptureLimits {
  return {
    targetOverlapCssPx: DEFAULT_TARGET_OVERLAP_CSS_PX,
    minimumScrollMovementCssPx: MINIMUM_SCROLL_MOVEMENT_CSS_PX,
    maximumRepeatedScrollPositions: MAXIMUM_REPEATED_SCROLL_POSITIONS,
    maximumSegments: MAXIMUM_VIEWPORT_SEGMENTS,
    maximumComposedHeightPhysicalPx: MAXIMUM_COMPOSED_HEIGHT_PHYSICAL_PX,
  };
}

export function createMultiViewportCaptureSession(
  input: CreateMultiViewportCaptureSessionInput,
): MultiViewportCaptureSession {
  const now = Date.now();

  return {
    sessionId: input.sessionId,
    state: 'preparing',
    createdAt: now,
    updatedAt: now,
    startFingerprint: input.startFingerprint,
    endFingerprint: input.endFingerprint,
    limits: {
      ...createDefaultMultiViewportCaptureLimits(),
      ...input.limits,
    },
    segments: [],
    visitedScrollPositionsCssPx: [],
    repeatedScrollPositionCount: 0,
    failure: null,
  };
}

export function updateMultiViewportCaptureState(
  session: MultiViewportCaptureSession,
  state: MultiViewportCaptureState,
): MultiViewportCaptureSession {
  return {
    ...session,
    state,
    updatedAt: Date.now(),
  };
}

export function failMultiViewportCapture(
  session: MultiViewportCaptureSession,
  code: MultiViewportCaptureFailureCode,
  message: string,
): MultiViewportCaptureSession {
  return {
    ...session,
    state: code === 'CANCELLED' ? 'cancelled' : 'failed',
    updatedAt: Date.now(),
    failure: {
      code,
      message,
    },
  };
}

export function calculatePhysicalOverlap(
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

export function registerCaptureSegment(
  session: MultiViewportCaptureSession,
  input: RegisterSegmentInput,
): MultiViewportCaptureSession {
  if (session.segments.length >= session.limits.maximumSegments) {
    return failMultiViewportCapture(
      session,
      'SEGMENT_LIMIT_EXCEEDED',
      `The capture exceeded the limit of ${session.limits.maximumSegments} viewport segments.`,
    );
  }

  const overlapWithPreviousPhysicalPx = calculatePhysicalOverlap(
    input.overlapWithPreviousCssPx,
    input.viewport.cssHeight,
    input.imageHeightPhysicalPx,
  );

  const segment: ViewportCaptureSegment = {
    segmentIndex: session.segments.length,
    capturedAt: input.capturedAt ?? Date.now(),
    scrollTopCssPx: input.scrollTopCssPx,
    viewport: input.viewport,
    crop: input.crop,
    screenshotDataUrl: input.screenshotDataUrl,
    imageWidthPhysicalPx: input.imageWidthPhysicalPx,
    imageHeightPhysicalPx: input.imageHeightPhysicalPx,
    overlapWithPreviousCssPx: Math.max(0, input.overlapWithPreviousCssPx),
    overlapWithPreviousPhysicalPx,
  };

  const segments = [...session.segments, segment];

  const composedHeight = estimateComposedHeightPhysicalPx(segments);

  if (composedHeight > session.limits.maximumComposedHeightPhysicalPx) {
    return failMultiViewportCapture(
      session,
      'COMPOSED_HEIGHT_LIMIT_EXCEEDED',
      `The composed image would exceed ${session.limits.maximumComposedHeightPhysicalPx} physical pixels in height.`,
    );
  }

  return {
    ...session,
    state: 'capturing',
    updatedAt: Date.now(),
    segments,
    visitedScrollPositionsCssPx: [...session.visitedScrollPositionsCssPx, input.scrollTopCssPx],
    failure: null,
  };
}

export function estimateComposedHeightPhysicalPx(segments: ViewportCaptureSegment[]): number {
  return segments.reduce((totalHeight, segment) => {
    const uniqueHeight = segment.imageHeightPhysicalPx - segment.overlapWithPreviousPhysicalPx;

    return totalHeight + Math.max(0, uniqueHeight);
  }, 0);
}

export function validateNextScrollPosition(
  session: MultiViewportCaptureSession,
  nextScrollTopCssPx: number,
): ScrollValidationResult {
  const previousScrollTop = session.visitedScrollPositionsCssPx.at(-1);

  if (previousScrollTop === undefined) {
    return {
      valid: true,
      repeatedPosition: false,
      movementCssPx: 0,
      failure: null,
    };
  }

  const movementCssPx = Math.abs(nextScrollTopCssPx - previousScrollTop);

  const repeatedPosition = session.visitedScrollPositionsCssPx.some(
    (position) =>
      Math.abs(position - nextScrollTopCssPx) < session.limits.minimumScrollMovementCssPx,
  );

  if (movementCssPx < session.limits.minimumScrollMovementCssPx) {
    return {
      valid: false,
      repeatedPosition,
      movementCssPx,
      failure: {
        code: 'SCROLL_STALLED',
        message:
          `Scroll movement was ${movementCssPx.toFixed(1)} CSS pixels, ` +
          `below the minimum of ${session.limits.minimumScrollMovementCssPx}.`,
      },
    };
  }

  const repeatedCount = repeatedPosition ? session.repeatedScrollPositionCount + 1 : 0;

  if (repeatedCount >= session.limits.maximumRepeatedScrollPositions) {
    return {
      valid: false,
      repeatedPosition: true,
      movementCssPx,
      failure: {
        code: 'REPEATED_SCROLL_POSITION',
        message: `The capture reached a repeated scroll position ` + `${repeatedCount} times.`,
      },
    };
  }

  return {
    valid: true,
    repeatedPosition,
    movementCssPx,
    failure: null,
  };
}

export function recordScrollValidation(
  session: MultiViewportCaptureSession,
  validation: ScrollValidationResult,
): MultiViewportCaptureSession {
  if (validation.failure) {
    return failMultiViewportCapture(session, validation.failure.code, validation.failure.message);
  }

  return {
    ...session,
    updatedAt: Date.now(),
    repeatedScrollPositionCount: validation.repeatedPosition
      ? session.repeatedScrollPositionCount + 1
      : 0,
  };
}

export function calculateCaptureProgress(
  session: MultiViewportCaptureSession,
  startScrollTopCssPx: number,
  endScrollTopCssPx: number,
  currentScrollTopCssPx: number,
): MultiViewportCaptureProgress {
  const totalDistance = Math.abs(endScrollTopCssPx - startScrollTopCssPx);

  const travelledDistance = Math.abs(currentScrollTopCssPx - startScrollTopCssPx);

  const estimatedProgress = totalDistance <= 0 ? 1 : Math.min(1, travelledDistance / totalDistance);

  return {
    state: session.state,
    capturedSegmentCount: session.segments.length,
    maximumSegmentCount: session.limits.maximumSegments,
    currentScrollTopCssPx,
    estimatedProgress,
  };
}

export function hasReachedSegmentLimit(session: MultiViewportCaptureSession): boolean {
  return session.segments.length >= session.limits.maximumSegments;
}

export function canComposeSession(session: MultiViewportCaptureSession): boolean {
  return (
    session.state !== 'failed' &&
    session.state !== 'cancelled' &&
    session.segments.length > 0 &&
    estimateComposedHeightPhysicalPx(session.segments) <=
      session.limits.maximumComposedHeightPhysicalPx
  );
}

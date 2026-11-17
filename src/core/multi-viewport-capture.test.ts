import { describe, expect, it } from 'vitest';

import type { MultiViewportCaptureSession, ViewportCaptureSegment } from './multi-viewport-capture';

import {
  calculateCaptureProgress,
  calculatePhysicalOverlap,
  canComposeSession,
  createMultiViewportCaptureSession,
  estimateComposedHeightPhysicalPx,
  failMultiViewportCapture,
  hasReachedSegmentLimit,
  recordScrollValidation,
  registerCaptureSegment,
  updateMultiViewportCaptureState,
  validateNextScrollPosition,
} from './multi-viewport-capture';

function createSession(
  overrides: Partial<MultiViewportCaptureSession> = {},
): MultiViewportCaptureSession {
  return {
    ...createMultiViewportCaptureSession({
      sessionId: 'session-1',
      startFingerprint: {
        role: 'user',
        normalizedTextPrefix: 'start',
        approximateLogicalIndex: 0,
      },
      endFingerprint: {
        role: 'assistant',
        normalizedTextPrefix: 'end',
        approximateLogicalIndex: 5,
      },
    }),
    ...overrides,
  };
}

function createSegment(
  segmentIndex: number,
  imageHeightPhysicalPx: number,
  overlapWithPreviousPhysicalPx: number,
): ViewportCaptureSegment {
  return {
    segmentIndex,
    capturedAt: 1_700_000_000_000,
    scrollTopCssPx: segmentIndex * 800,
    viewport: {
      cssWidth: 1280,
      cssHeight: 1000,
      devicePixelRatio: 2,
    },
    crop: {
      left: 100,
      top: 0,
      width: 800,
      height: 1000,
    },
    screenshotDataUrl: 'data:image/png;base64,test',
    imageWidthPhysicalPx: 2560,
    imageHeightPhysicalPx,
    overlapWithPreviousCssPx: segmentIndex === 0 ? 0 : 120,
    overlapWithPreviousPhysicalPx,
  };
}

function registerTestSegment(
  session: MultiViewportCaptureSession,
  scrollTopCssPx: number,
  overlapWithPreviousCssPx = 0,
): MultiViewportCaptureSession {
  return registerCaptureSegment(session, {
    capturedAt: 1_700_000_000_000,
    scrollTopCssPx,
    viewport: {
      cssWidth: 1280,
      cssHeight: 1000,
      devicePixelRatio: 2,
    },
    crop: {
      left: 100,
      top: 0,
      width: 800,
      height: 1000,
    },
    screenshotDataUrl: 'data:image/png;base64,test',
    imageWidthPhysicalPx: 2560,
    imageHeightPhysicalPx: 2000,
    overlapWithPreviousCssPx,
  });
}

describe('multi-viewport capture model', () => {
  it('creates a preparing session with default limits', () => {
    const session = createSession();

    expect(session.state).toBe('preparing');

    expect(session.segments).toEqual([]);

    expect(session.limits.maximumSegments).toBe(20);

    expect(session.limits.maximumComposedHeightPhysicalPx).toBe(32_000);

    expect(session.limits.targetOverlapCssPx).toBe(120);

    expect(session.limits.minimumScrollMovementCssPx).toBe(8);
  });

  it('converts CSS overlap to physical pixels', () => {
    expect(calculatePhysicalOverlap(120, 1000, 2000)).toBe(240);
  });

  it('returns zero for invalid overlap dimensions', () => {
    expect(calculatePhysicalOverlap(0, 1000, 2000)).toBe(0);

    expect(calculatePhysicalOverlap(120, 0, 2000)).toBe(0);

    expect(calculatePhysicalOverlap(120, 1000, 0)).toBe(0);
  });

  it('subtracts overlap from composed height', () => {
    const segments = [
      createSegment(0, 2000, 0),
      createSegment(1, 2000, 240),
      createSegment(2, 2000, 240),
    ];

    expect(estimateComposedHeightPhysicalPx(segments)).toBe(5520);
  });

  it('registers a capture segment and moves to capturing', () => {
    const captured = registerTestSegment(createSession(), 100);

    expect(captured.state).toBe('capturing');

    expect(captured.segments).toHaveLength(1);

    expect(captured.visitedScrollPositionsCssPx).toEqual([100]);

    expect(captured.failure).toBeNull();
  });

  it('rejects a stalled scroll position', () => {
    const captured = registerTestSegment(createSession(), 100);

    const validation = validateNextScrollPosition(captured, 104);

    expect(validation.valid).toBe(false);

    expect(validation.movementCssPx).toBe(4);

    expect(validation.failure?.code).toBe('SCROLL_STALLED');
  });

  it('fails after repeated scroll positions reach the configured limit', () => {
    const session = createSession({
      repeatedScrollPositionCount: 1,
      visitedScrollPositionsCssPx: [0, 800],
      limits: {
        ...createSession().limits,
        maximumRepeatedScrollPositions: 2,
      },
    });

    const validation = validateNextScrollPosition(session, 0);

    expect(validation.valid).toBe(false);

    expect(validation.repeatedPosition).toBe(true);

    expect(validation.failure?.code).toBe('REPEATED_SCROLL_POSITION');

    const failed = recordScrollValidation(session, validation);

    expect(failed.state).toBe('failed');

    expect(failed.failure?.code).toBe('REPEATED_SCROLL_POSITION');
  });

  it('fails when the segment limit is exceeded', () => {
    const session = createSession({
      limits: {
        ...createSession().limits,
        maximumSegments: 1,
      },
    });

    const first = registerTestSegment(session, 0);

    expect(hasReachedSegmentLimit(first)).toBe(true);

    const second = registerTestSegment(first, 800, 120);

    expect(second.state).toBe('failed');

    expect(second.failure?.code).toBe('SEGMENT_LIMIT_EXCEEDED');

    expect(second.segments).toHaveLength(1);
  });

  it('fails when the composed height limit is exceeded', () => {
    const session = createSession({
      limits: {
        ...createSession().limits,
        maximumComposedHeightPhysicalPx: 3000,
      },
    });

    const first = registerTestSegment(session, 0);

    const second = registerTestSegment(first, 800, 120);

    expect(second.state).toBe('failed');

    expect(second.failure?.code).toBe('COMPOSED_HEIGHT_LIMIT_EXCEEDED');

    expect(second.segments).toHaveLength(1);
  });

  it('allows composition for a valid captured session', () => {
    const captured = registerTestSegment(createSession(), 0);

    expect(canComposeSession(captured)).toBe(true);
  });

  it('prevents composition for cancelled and failed sessions', () => {
    const captured = registerTestSegment(createSession(), 0);

    const cancelled = failMultiViewportCapture(captured, 'CANCELLED', 'Cancelled by the user.');

    const failed = failMultiViewportCapture(captured, 'CAPTURE_FAILED', 'Screenshot failed.');

    expect(cancelled.state).toBe('cancelled');

    expect(canComposeSession(cancelled)).toBe(false);

    expect(failed.state).toBe('failed');

    expect(canComposeSession(failed)).toBe(false);
  });

  it('updates the capture state while preserving the session', () => {
    const session = createSession();

    const composing = updateMultiViewportCaptureState(session, 'composing');

    expect(composing.state).toBe('composing');

    expect(composing.sessionId).toBe(session.sessionId);

    expect(composing.startFingerprint).toEqual(session.startFingerprint);
  });

  it('calculates progress between zero and one', () => {
    const captured = registerTestSegment(createSession(), 500);

    const middle = calculateCaptureProgress(captured, 0, 1000, 500);

    const beyondEnd = calculateCaptureProgress(captured, 0, 1000, 1400);

    expect(middle.estimatedProgress).toBe(0.5);

    expect(middle.capturedSegmentCount).toBe(1);

    expect(beyondEnd.estimatedProgress).toBe(1);
  });

  it('reports complete progress for a zero-distance range', () => {
    const progress = calculateCaptureProgress(createSession(), 500, 500, 500);

    expect(progress.estimatedProgress).toBe(1);
  });
});

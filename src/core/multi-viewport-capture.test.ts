import { describe, expect, it } from 'vitest';

import type { ViewportCaptureSegment } from './multi-viewport-capture';

import {
  calculatePhysicalOverlap,
  canComposeSession,
  createMultiViewportCaptureSession,
  estimateComposedHeightPhysicalPx,
  registerCaptureSegment,
  validateNextScrollPosition,
} from './multi-viewport-capture';

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

describe('multi-viewport capture model', () => {
  it('converts CSS overlap to physical pixels', () => {
    expect(calculatePhysicalOverlap(120, 1000, 2000)).toBe(240);
  });

  it('returns zero for invalid overlap dimensions', () => {
    expect(calculatePhysicalOverlap(0, 1000, 2000)).toBe(0);

    expect(calculatePhysicalOverlap(120, 0, 2000)).toBe(0);
  });

  it('subtracts overlap from composed height', () => {
    const segments = [
      createSegment(0, 2000, 0),
      createSegment(1, 2000, 240),
      createSegment(2, 2000, 240),
    ];

    expect(estimateComposedHeightPhysicalPx(segments)).toBe(5520);
  });

  it('rejects a stalled scroll position', () => {
    const session = createMultiViewportCaptureSession({
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
    });

    const captured = registerCaptureSegment(session, {
      scrollTopCssPx: 100,
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
      overlapWithPreviousCssPx: 0,
    });

    const validation = validateNextScrollPosition(captured, 104);

    expect(validation.valid).toBe(false);

    expect(validation.failure?.code).toBe('SCROLL_STALLED');
  });

  it('allows composition for a valid captured session', () => {
    const session = createMultiViewportCaptureSession({
      sessionId: 'session-2',
      startFingerprint: {
        role: 'user',
        normalizedTextPrefix: 'start',
        approximateLogicalIndex: 0,
      },
      endFingerprint: {
        role: 'assistant',
        normalizedTextPrefix: 'end',
        approximateLogicalIndex: 3,
      },
    });

    const captured = registerCaptureSegment(session, {
      scrollTopCssPx: 0,
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
      overlapWithPreviousCssPx: 0,
    });

    expect(canComposeSession(captured)).toBe(true);
  });
});

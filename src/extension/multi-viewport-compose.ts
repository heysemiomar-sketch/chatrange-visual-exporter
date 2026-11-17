import type {
  CaptureFailure,
  ComposeMultiViewportCaptureRequest,
  ComposeMultiViewportCaptureSuccess,
  ComposeViewportSegment,
} from '../core/capture-messages';

import type { MultiViewportSegmentCaptureResult } from './multi-viewport-segment-capture';

export class MultiViewportCompositionError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'MultiViewportCompositionError';
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

function isCompositionSuccess(value: unknown): value is ComposeMultiViewportCaptureSuccess {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.type === 'compose-multi-viewport-capture-success' &&
    typeof value.requestId === 'string' &&
    typeof value.sessionId === 'string' &&
    typeof value.captureId === 'string' &&
    typeof value.segmentCount === 'number' &&
    Number.isInteger(value.segmentCount) &&
    value.segmentCount > 0 &&
    typeof value.width === 'number' &&
    value.width > 0 &&
    typeof value.height === 'number' &&
    value.height > 0 &&
    value.mimeType === 'image/png' &&
    typeof value.createdAt === 'number' &&
    typeof value.expiresAt === 'number'
  );
}

function createRequestId(): string {
  return crypto.randomUUID();
}

function createCompositionSegments(
  capture: MultiViewportSegmentCaptureResult,
): ComposeViewportSegment[] {
  return capture.segments.map((segment) => ({
    segmentIndex: segment.segmentIndex,
    scrollTopCssPx: segment.actualScrollTopCssPx,
    overlapWithPreviousCssPx: segment.overlapWithPreviousCssPx,
    screenshotDataUrl: segment.screenshotDataUrl,
    crop: segment.crop,
    viewport: segment.viewport,
    imageWidthPhysicalPx: segment.imageWidthPhysicalPx,
    imageHeightPhysicalPx: segment.imageHeightPhysicalPx,
  }));
}

export async function composeMultiViewportCapture(
  capture: MultiViewportSegmentCaptureResult,
): Promise<ComposeMultiViewportCaptureSuccess> {
  if (capture.capturedSegmentCount === 0) {
    throw new MultiViewportCompositionError('No viewport segment is available for composition.');
  }

  if (capture.capturedSegmentCount !== capture.plannedSegmentCount) {
    throw new MultiViewportCompositionError(
      `Expected ${capture.plannedSegmentCount} segments, ` +
        `but only ${capture.capturedSegmentCount} were captured.`,
    );
  }

  const request: ComposeMultiViewportCaptureRequest = {
    type: 'compose-multi-viewport-capture',
    requestId: createRequestId(),
    sessionId: capture.sessionId,
    segments: createCompositionSegments(capture),
  };

  const response = (await chrome.runtime.sendMessage(request)) as unknown;

  if (isCaptureFailure(response)) {
    throw new MultiViewportCompositionError(response.message);
  }

  if (!isCompositionSuccess(response)) {
    throw new MultiViewportCompositionError(
      'The offscreen document returned an invalid composition response.',
    );
  }

  if (response.requestId !== request.requestId) {
    throw new MultiViewportCompositionError(
      'The composition response returned a mismatched request ID.',
    );
  }

  if (response.sessionId !== request.sessionId) {
    throw new MultiViewportCompositionError(
      'The composition response returned a mismatched session ID.',
    );
  }

  if (response.segmentCount !== capture.capturedSegmentCount) {
    throw new MultiViewportCompositionError(
      `The composition used ${response.segmentCount} segments, ` +
        `but ${capture.capturedSegmentCount} were captured.`,
    );
  }

  return response;
}

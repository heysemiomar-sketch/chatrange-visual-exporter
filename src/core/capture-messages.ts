export interface CaptureRectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CaptureViewport {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
}

export interface CaptureVisibleRangeRequest {
  type: 'capture-visible-range';
  requestId: string;
  crop: CaptureRectangle;
  viewport: CaptureViewport;
}

export interface CaptureVisibleSegmentRequest {
  type: 'capture-visible-segment';
  requestId: string;
  sessionId: string;
  segmentIndex: number;
  scrollTopCssPx: number;
  overlapWithPreviousCssPx: number;
  crop: CaptureRectangle;
  viewport: CaptureViewport;
}

export interface CaptureVisibleSegmentSuccess {
  type: 'capture-visible-segment-success';
  requestId: string;
  sessionId: string;
  segmentIndex: number;
  scrollTopCssPx: number;
  overlapWithPreviousCssPx: number;
  screenshotDataUrl: string;
  imageWidthPhysicalPx: number;
  imageHeightPhysicalPx: number;
  capturedAt: number;
}

export interface ComposeViewportSegment {
  segmentIndex: number;
  scrollTopCssPx: number;
  overlapWithPreviousCssPx: number;
  screenshotDataUrl: string;
  crop: CaptureRectangle;
  viewport: CaptureViewport;
  imageWidthPhysicalPx: number;
  imageHeightPhysicalPx: number;
}

export interface ComposeMultiViewportCaptureRequest {
  type: 'compose-multi-viewport-capture';
  requestId: string;
  sessionId: string;
  segments: ComposeViewportSegment[];
}

export interface ProcessVisibleCaptureRequest {
  type: 'process-visible-capture';
  requestId: string;
  screenshotDataUrl: string;
  crop: CaptureRectangle;
  viewport: CaptureViewport;
}

export interface ProcessVisibleCaptureSuccess {
  type: 'process-visible-capture-success';
  requestId: string;
  captureId: string;
  width: number;
  height: number;
  mimeType: 'image/png';
  createdAt: number;
  expiresAt: number;
}

export interface ComposeMultiViewportCaptureSuccess {
  type: 'compose-multi-viewport-capture-success';
  requestId: string;
  sessionId: string;
  captureId: string;
  segmentCount: number;
  width: number;
  height: number;
  mimeType: 'image/png';
  createdAt: number;
  expiresAt: number;
}

export interface CaptureFailure {
  type: 'capture-failure';
  requestId: string;
  code:
    | 'RANGE_NOT_VISIBLE'
    | 'CAPTURE_FAILED'
    | 'OFFSCREEN_FAILED'
    | 'INVALID_CROP'
    | 'STORAGE_FAILED'
    | 'CAPTURE_NOT_FOUND'
    | 'SEGMENT_CAPTURE_FAILED'
    | 'SEGMENT_LIMIT_EXCEEDED'
    | 'SCROLL_STALLED'
    | 'COMPOSITION_FAILED';
  message: string;
}

export type CaptureRequest =
  | CaptureVisibleRangeRequest
  | CaptureVisibleSegmentRequest
  | ProcessVisibleCaptureRequest
  | ComposeMultiViewportCaptureRequest;

export type CaptureResult =
  | CaptureVisibleSegmentSuccess
  | ProcessVisibleCaptureSuccess
  | ComposeMultiViewportCaptureSuccess
  | CaptureFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function isCaptureRectangle(value: unknown): value is CaptureRectangle {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFiniteNumber(value.left) &&
    isFiniteNumber(value.top) &&
    isFiniteNumber(value.width) &&
    value.width > 0 &&
    isFiniteNumber(value.height) &&
    value.height > 0
  );
}

function isCaptureViewport(value: unknown): value is CaptureViewport {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFiniteNumber(value.cssWidth) &&
    value.cssWidth > 0 &&
    isFiniteNumber(value.cssHeight) &&
    value.cssHeight > 0 &&
    isFiniteNumber(value.devicePixelRatio) &&
    value.devicePixelRatio > 0
  );
}

function isComposeViewportSegment(value: unknown): value is ComposeViewportSegment {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonNegativeInteger(value.segmentIndex) &&
    isFiniteNumber(value.scrollTopCssPx) &&
    isFiniteNumber(value.overlapWithPreviousCssPx) &&
    value.overlapWithPreviousCssPx >= 0 &&
    typeof value.screenshotDataUrl === 'string' &&
    value.screenshotDataUrl.startsWith('data:image/png') &&
    isCaptureRectangle(value.crop) &&
    isCaptureViewport(value.viewport) &&
    isFiniteNumber(value.imageWidthPhysicalPx) &&
    value.imageWidthPhysicalPx > 0 &&
    isFiniteNumber(value.imageHeightPhysicalPx) &&
    value.imageHeightPhysicalPx > 0
  );
}

export function isCaptureVisibleRangeRequest(
  message: unknown,
): message is CaptureVisibleRangeRequest {
  if (!isRecord(message)) {
    return false;
  }

  return (
    message.type === 'capture-visible-range' &&
    typeof message.requestId === 'string' &&
    isCaptureRectangle(message.crop) &&
    isCaptureViewport(message.viewport)
  );
}

export function isCaptureVisibleSegmentRequest(
  message: unknown,
): message is CaptureVisibleSegmentRequest {
  if (!isRecord(message)) {
    return false;
  }

  return (
    message.type === 'capture-visible-segment' &&
    typeof message.requestId === 'string' &&
    typeof message.sessionId === 'string' &&
    isNonNegativeInteger(message.segmentIndex) &&
    isFiniteNumber(message.scrollTopCssPx) &&
    isFiniteNumber(message.overlapWithPreviousCssPx) &&
    message.overlapWithPreviousCssPx >= 0 &&
    isCaptureRectangle(message.crop) &&
    isCaptureViewport(message.viewport)
  );
}

export function isCaptureVisibleSegmentSuccess(
  message: unknown,
): message is CaptureVisibleSegmentSuccess {
  if (!isRecord(message)) {
    return false;
  }

  return (
    message.type === 'capture-visible-segment-success' &&
    typeof message.requestId === 'string' &&
    typeof message.sessionId === 'string' &&
    isNonNegativeInteger(message.segmentIndex) &&
    isFiniteNumber(message.scrollTopCssPx) &&
    isFiniteNumber(message.overlapWithPreviousCssPx) &&
    typeof message.screenshotDataUrl === 'string' &&
    message.screenshotDataUrl.startsWith('data:image/png') &&
    isFiniteNumber(message.imageWidthPhysicalPx) &&
    message.imageWidthPhysicalPx > 0 &&
    isFiniteNumber(message.imageHeightPhysicalPx) &&
    message.imageHeightPhysicalPx > 0 &&
    isFiniteNumber(message.capturedAt)
  );
}

export function isComposeMultiViewportCaptureRequest(
  message: unknown,
): message is ComposeMultiViewportCaptureRequest {
  if (!isRecord(message)) {
    return false;
  }

  return (
    message.type === 'compose-multi-viewport-capture' &&
    typeof message.requestId === 'string' &&
    typeof message.sessionId === 'string' &&
    Array.isArray(message.segments) &&
    message.segments.length > 0 &&
    message.segments.every(isComposeViewportSegment)
  );
}

export function isProcessVisibleCaptureRequest(
  message: unknown,
): message is ProcessVisibleCaptureRequest {
  if (!isRecord(message)) {
    return false;
  }

  return (
    message.type === 'process-visible-capture' &&
    typeof message.requestId === 'string' &&
    typeof message.screenshotDataUrl === 'string' &&
    isCaptureRectangle(message.crop) &&
    isCaptureViewport(message.viewport)
  );
}

export function isProcessVisibleCaptureSuccess(
  message: unknown,
): message is ProcessVisibleCaptureSuccess {
  if (!isRecord(message)) {
    return false;
  }

  return (
    message.type === 'process-visible-capture-success' &&
    typeof message.requestId === 'string' &&
    typeof message.captureId === 'string' &&
    isFiniteNumber(message.width) &&
    message.width > 0 &&
    isFiniteNumber(message.height) &&
    message.height > 0 &&
    message.mimeType === 'image/png' &&
    isFiniteNumber(message.createdAt) &&
    isFiniteNumber(message.expiresAt)
  );
}

export function isComposeMultiViewportCaptureSuccess(
  message: unknown,
): message is ComposeMultiViewportCaptureSuccess {
  if (!isRecord(message)) {
    return false;
  }

  return (
    message.type === 'compose-multi-viewport-capture-success' &&
    typeof message.requestId === 'string' &&
    typeof message.sessionId === 'string' &&
    typeof message.captureId === 'string' &&
    isNonNegativeInteger(message.segmentCount) &&
    message.segmentCount > 0 &&
    isFiniteNumber(message.width) &&
    message.width > 0 &&
    isFiniteNumber(message.height) &&
    message.height > 0 &&
    message.mimeType === 'image/png' &&
    isFiniteNumber(message.createdAt) &&
    isFiniteNumber(message.expiresAt)
  );
}

export function isCaptureFailure(message: unknown): message is CaptureFailure {
  if (!isRecord(message)) {
    return false;
  }

  return (
    message.type === 'capture-failure' &&
    typeof message.requestId === 'string' &&
    typeof message.code === 'string' &&
    typeof message.message === 'string'
  );
}

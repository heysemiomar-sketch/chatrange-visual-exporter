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
  CaptureVisibleRangeRequest | CaptureVisibleSegmentRequest | ProcessVisibleCaptureRequest;

export type CaptureResult =
  CaptureVisibleSegmentSuccess | ProcessVisibleCaptureSuccess | CaptureFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCaptureRectangle(value: unknown): value is CaptureRectangle {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.left === 'number' &&
    Number.isFinite(value.left) &&
    typeof value.top === 'number' &&
    Number.isFinite(value.top) &&
    typeof value.width === 'number' &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    typeof value.height === 'number' &&
    Number.isFinite(value.height) &&
    value.height > 0
  );
}

function isCaptureViewport(value: unknown): value is CaptureViewport {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.cssWidth === 'number' &&
    Number.isFinite(value.cssWidth) &&
    value.cssWidth > 0 &&
    typeof value.cssHeight === 'number' &&
    Number.isFinite(value.cssHeight) &&
    value.cssHeight > 0 &&
    typeof value.devicePixelRatio === 'number' &&
    Number.isFinite(value.devicePixelRatio) &&
    value.devicePixelRatio > 0
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
    typeof message.segmentIndex === 'number' &&
    Number.isInteger(message.segmentIndex) &&
    message.segmentIndex >= 0 &&
    typeof message.scrollTopCssPx === 'number' &&
    Number.isFinite(message.scrollTopCssPx) &&
    typeof message.overlapWithPreviousCssPx === 'number' &&
    Number.isFinite(message.overlapWithPreviousCssPx) &&
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
    typeof message.segmentIndex === 'number' &&
    Number.isInteger(message.segmentIndex) &&
    message.segmentIndex >= 0 &&
    typeof message.scrollTopCssPx === 'number' &&
    typeof message.overlapWithPreviousCssPx === 'number' &&
    typeof message.screenshotDataUrl === 'string' &&
    message.screenshotDataUrl.startsWith('data:image/png') &&
    typeof message.imageWidthPhysicalPx === 'number' &&
    message.imageWidthPhysicalPx > 0 &&
    typeof message.imageHeightPhysicalPx === 'number' &&
    message.imageHeightPhysicalPx > 0 &&
    typeof message.capturedAt === 'number'
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
    typeof message.width === 'number' &&
    message.width > 0 &&
    typeof message.height === 'number' &&
    message.height > 0 &&
    message.mimeType === 'image/png' &&
    typeof message.createdAt === 'number' &&
    typeof message.expiresAt === 'number'
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

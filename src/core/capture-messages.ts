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
    | 'CAPTURE_NOT_FOUND';
  message: string;
}

export type CaptureRequest = CaptureVisibleRangeRequest | ProcessVisibleCaptureRequest;

export type CaptureResult = ProcessVisibleCaptureSuccess | CaptureFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCaptureRectangle(value: unknown): value is CaptureRectangle {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.left === 'number' &&
    typeof value.top === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  );
}

function isCaptureViewport(value: unknown): value is CaptureViewport {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.cssWidth === 'number' &&
    typeof value.cssHeight === 'number' &&
    typeof value.devicePixelRatio === 'number'
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
    typeof message.height === 'number' &&
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

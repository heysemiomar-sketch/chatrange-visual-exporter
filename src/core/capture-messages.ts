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
  pngDataUrl: string;
  width: number;
  height: number;
}

export interface CaptureFailure {
  type: 'capture-failure';
  requestId: string;
  code: 'RANGE_NOT_VISIBLE' | 'CAPTURE_FAILED' | 'OFFSCREEN_FAILED' | 'INVALID_CROP';
  message: string;
}

export type CaptureRequest = CaptureVisibleRangeRequest | ProcessVisibleCaptureRequest;

export type CaptureResult = ProcessVisibleCaptureSuccess | CaptureFailure;

export function isCaptureVisibleRangeRequest(
  message: unknown,
): message is CaptureVisibleRangeRequest {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as Partial<CaptureVisibleRangeRequest>;

  return (
    candidate.type === 'capture-visible-range' &&
    typeof candidate.requestId === 'string' &&
    candidate.crop !== undefined &&
    candidate.viewport !== undefined
  );
}

export function isProcessVisibleCaptureRequest(
  message: unknown,
): message is ProcessVisibleCaptureRequest {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as Partial<ProcessVisibleCaptureRequest>;

  return (
    candidate.type === 'process-visible-capture' &&
    typeof candidate.requestId === 'string' &&
    typeof candidate.screenshotDataUrl === 'string' &&
    candidate.crop !== undefined &&
    candidate.viewport !== undefined
  );
}

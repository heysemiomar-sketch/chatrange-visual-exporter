import { describe, expect, it } from 'vitest';

import {
  CaptureCancelledError,
  isCaptureCancelledError,
  throwIfCaptureCancelled,
} from './capture-cancellation';

describe('capture cancellation', () => {
  it('does not throw while capture remains active', () => {
    const controller = new AbortController();

    expect(() => {
      throwIfCaptureCancelled(controller.signal);
    }).not.toThrow();
  });

  it('throws after the capture is aborted', () => {
    const controller = new AbortController();

    controller.abort();

    expect(() => {
      throwIfCaptureCancelled(controller.signal);
    }).toThrow(CaptureCancelledError);
  });

  it('recognizes capture cancellation errors', () => {
    expect(isCaptureCancelledError(new CaptureCancelledError())).toBe(true);

    expect(isCaptureCancelledError(new Error('Different failure'))).toBe(false);
  });
});

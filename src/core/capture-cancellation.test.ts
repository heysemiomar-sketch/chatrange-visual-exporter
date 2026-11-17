import { describe, expect, it, vi } from 'vitest';

import {
  CaptureCancelledError,
  createCaptureCancellationSession,
  isCaptureCancelledError,
  throwIfCaptureCancelled,
} from './capture-cancellation';

class FakeCancellationTarget {
  private keydownListener: EventListener | null = null;

  addEventListener = vi.fn((type: string, listener: EventListener): void => {
    if (type === 'keydown') {
      this.keydownListener = listener;
    }
  });

  removeEventListener = vi.fn((type: string, listener: EventListener): void => {
    if (type === 'keydown' && this.keydownListener === listener) {
      this.keydownListener = null;
    }
  });

  dispatchKeyDown(event: Event): void {
    this.keydownListener?.(event);
  }
}

function createKeyboardEvent(key: string): KeyboardEvent {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

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

  it('cancels the session programmatically', () => {
    const target = new FakeCancellationTarget();

    const session = createCaptureCancellationSession(target);

    session.cancel();

    expect(session.signal.aborted).toBe(true);
  });

  it('cancels when Escape is pressed', () => {
    const target = new FakeCancellationTarget();

    const session = createCaptureCancellationSession(target);

    const event = createKeyboardEvent('Escape');

    target.dispatchKeyDown(event);

    expect(session.signal.aborted).toBe(true);

    expect(event.preventDefault).toHaveBeenCalledOnce();

    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it('ignores keys other than Escape', () => {
    const target = new FakeCancellationTarget();

    const session = createCaptureCancellationSession(target);

    target.dispatchKeyDown(createKeyboardEvent('Enter'));

    expect(session.signal.aborted).toBe(false);
  });

  it('removes the keyboard listener when disposed', () => {
    const target = new FakeCancellationTarget();

    const session = createCaptureCancellationSession(target);

    session.dispose();

    target.dispatchKeyDown(createKeyboardEvent('Escape'));

    expect(session.signal.aborted).toBe(false);

    expect(target.removeEventListener).toHaveBeenCalledOnce();
  });
});

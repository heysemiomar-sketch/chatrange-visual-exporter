export class CaptureCancelledError extends Error {
  constructor(message = 'The capture was cancelled.') {
    super(message);

    this.name = 'CaptureCancelledError';
  }
}

export function throwIfCaptureCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new CaptureCancelledError();
  }
}

export function isCaptureCancelledError(error: unknown): error is CaptureCancelledError {
  return (
    error instanceof CaptureCancelledError ||
    (error instanceof Error && error.name === 'CaptureCancelledError')
  );
}

export interface CaptureCancellationSession {
  signal: AbortSignal;
  cancel(): void;
  dispose(): void;
}

export function createCaptureCancellationSession(
  target: Window = window,
): CaptureCancellationSession {
  const controller = new AbortController();

  function cancel(): void {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    cancel();
  }

  target.addEventListener('keydown', handleKeyDown, {
    capture: true,
  });

  return {
    signal: controller.signal,

    cancel,

    dispose(): void {
      target.removeEventListener('keydown', handleKeyDown, {
        capture: true,
      });
    },
  };
}

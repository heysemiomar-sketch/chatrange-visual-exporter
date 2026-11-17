import type { ConversationTurn } from '../adapters/base';

import { MINIMUM_SCROLL_MOVEMENT_CSS_PX } from '../core/multi-viewport-capture';

import { createMultiViewportScrollPlan, scrollToPosition } from './multi-viewport-scroll';

export interface MultiViewportDryRunStep {
  stepIndex: number;
  requestedScrollTopCssPx: number;
  actualScrollTopCssPx: number;
  movementCssPx: number;
}

export interface MultiViewportDryRunResult {
  originalScrollTopCssPx: number;
  restoredScrollTopCssPx: number;
  targetOverlapCssPx: number;
  stepCssPx: number;
  plannedPositionCount: number;
  completedPositionCount: number;
  steps: MultiViewportDryRunStep[];
}

export interface MultiViewportDryRunCallbacks {
  onProgress?(completedSteps: number, totalSteps: number): void;
}

export class MultiViewportDryRunError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'MultiViewportDryRunError';
  }
}

async function restoreOriginalPosition(
  container: HTMLElement,
  originalScrollTopCssPx: number,
): Promise<number> {
  return await scrollToPosition(container, originalScrollTopCssPx);
}

export async function runMultiViewportDryRun(
  turns: ConversationTurn[],
  callbacks: MultiViewportDryRunCallbacks = {},
): Promise<MultiViewportDryRunResult> {
  const plan = createMultiViewportScrollPlan({
    turns,
  });

  const container = plan.container.element;

  const originalScrollTopCssPx = container.scrollTop;

  const steps: MultiViewportDryRunStep[] = [];

  let previousActualScrollTopCssPx = originalScrollTopCssPx;

  try {
    for (let stepIndex = 0; stepIndex < plan.positionsCssPx.length; stepIndex += 1) {
      const requestedScrollTopCssPx = plan.positionsCssPx[stepIndex];

      if (requestedScrollTopCssPx === undefined) {
        throw new MultiViewportDryRunError(`Scroll position ${stepIndex} is missing.`);
      }

      const actualScrollTopCssPx = await scrollToPosition(container, requestedScrollTopCssPx);

      const movementCssPx = Math.abs(actualScrollTopCssPx - previousActualScrollTopCssPx);

      const isFirstStep = stepIndex === 0;

      if (!isFirstStep && movementCssPx < MINIMUM_SCROLL_MOVEMENT_CSS_PX) {
        throw new MultiViewportDryRunError(
          `Scroll step ${stepIndex} moved only ` +
            `${movementCssPx.toFixed(1)} CSS pixels. ` +
            `The required minimum is ` +
            `${MINIMUM_SCROLL_MOVEMENT_CSS_PX}.`,
        );
      }

      steps.push({
        stepIndex,
        requestedScrollTopCssPx,
        actualScrollTopCssPx,
        movementCssPx,
      });

      previousActualScrollTopCssPx = actualScrollTopCssPx;

      callbacks.onProgress?.(stepIndex + 1, plan.positionsCssPx.length);
    }
  } finally {
    await restoreOriginalPosition(container, originalScrollTopCssPx);
  }

  return {
    originalScrollTopCssPx,
    restoredScrollTopCssPx: container.scrollTop,
    targetOverlapCssPx: plan.targetOverlapCssPx,
    stepCssPx: plan.stepCssPx,
    plannedPositionCount: plan.positionsCssPx.length,
    completedPositionCount: steps.length,
    steps,
  };
}

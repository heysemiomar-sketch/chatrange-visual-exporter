import type { ConversationTurn } from '../adapters/base';

export const DEFAULT_TARGET_OVERLAP_CSS_PX = 120;

export const DEFAULT_SAFE_BOTTOM_INSET_CSS_PX = 96;

export const MINIMUM_SCROLL_MOVEMENT_CSS_PX = 8;

export const MAXIMUM_VIEWPORT_SEGMENTS = 20;

export interface ScrollContainerMetrics {
  element: HTMLElement;
  scrollTopCssPx: number;
  scrollHeightCssPx: number;
  clientHeightCssPx: number;
  maximumScrollTopCssPx: number;
}

export interface MultiViewportScrollPlan {
  container: ScrollContainerMetrics;
  startScrollTopCssPx: number;
  endScrollTopCssPx: number;
  stepCssPx: number;
  targetOverlapCssPx: number;
  safeBottomInsetCssPx: number;
  effectiveCaptureHeightCssPx: number;
  positionsCssPx: number[];
}

export interface CreateScrollPlanInput {
  turns: ConversationTurn[];
  targetOverlapCssPx?: number;
  safeBottomInsetCssPx?: number;
  maximumSegments?: number;
  minimumMovementCssPx?: number;
}

export type ScrollPlanFailureCode =
  | 'NO_TURNS'
  | 'NO_SCROLL_CONTAINER'
  | 'INVALID_VIEWPORT_HEIGHT'
  | 'INVALID_SAFE_CAPTURE_HEIGHT'
  | 'RANGE_OUTSIDE_SCROLL_CONTAINER'
  | 'MOVEMENT_TOO_SMALL'
  | 'SEGMENT_LIMIT_EXCEEDED';

export class ScrollPlanError extends Error {
  readonly code: ScrollPlanFailureCode;

  constructor(code: ScrollPlanFailureCode, message: string) {
    super(message);

    this.name = 'ScrollPlanError';

    this.code = code;
  }
}

function isScrollableOverflow(value: string): boolean {
  return value === 'auto' || value === 'scroll' || value === 'overlay';
}

function canElementScroll(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);

  const hasScrollableOverflow = isScrollableOverflow(style.overflowY);

  const hasScrollableContent = element.scrollHeight > element.clientHeight + 1;

  return hasScrollableOverflow && hasScrollableContent;
}

function getElementAncestors(element: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];

  let current: HTMLElement | null = element;

  while (current) {
    ancestors.push(current);
    current = current.parentElement;
  }

  return ancestors;
}

function findCommonScrollableAncestor(turns: ConversationTurn[]): HTMLElement | null {
  const firstTurn = turns[0];

  if (!firstTurn) {
    return null;
  }

  const firstAncestors = getElementAncestors(firstTurn.element);

  return (
    firstAncestors.find(
      (candidate) =>
        canElementScroll(candidate) && turns.every((turn) => candidate.contains(turn.element)),
    ) ?? null
  );
}

function getScrollingElementFallback(): HTMLElement | null {
  const scrollingElement = document.scrollingElement;

  if (scrollingElement instanceof HTMLElement) {
    return scrollingElement;
  }

  if (document.documentElement instanceof HTMLElement) {
    return document.documentElement;
  }

  return null;
}

function containsAllTurns(container: HTMLElement, turns: ConversationTurn[]): boolean {
  return turns.every((turn) => container.contains(turn.element));
}

export function findConversationScrollContainer(turns: ConversationTurn[]): HTMLElement | null {
  if (turns.length === 0) {
    return null;
  }

  const commonScrollableAncestor = findCommonScrollableAncestor(turns);

  if (commonScrollableAncestor) {
    return commonScrollableAncestor;
  }

  const fallback = getScrollingElementFallback();

  if (fallback && containsAllTurns(fallback, turns)) {
    return fallback;
  }

  return null;
}

export function measureScrollContainer(element: HTMLElement): ScrollContainerMetrics {
  const maximumScrollTopCssPx = Math.max(0, element.scrollHeight - element.clientHeight);

  return {
    element,
    scrollTopCssPx: element.scrollTop,
    scrollHeightCssPx: element.scrollHeight,
    clientHeightCssPx: element.clientHeight,
    maximumScrollTopCssPx,
  };
}

function getTurnOffsetInContainer(
  turn: ConversationTurn,
  container: HTMLElement,
): {
  topCssPx: number;
  bottomCssPx: number;
} {
  const turnRectangle = turn.element.getBoundingClientRect();

  const containerRectangle = container.getBoundingClientRect();

  const topCssPx = turnRectangle.top - containerRectangle.top + container.scrollTop;

  return {
    topCssPx,
    bottomCssPx: topCssPx + turnRectangle.height,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function appendUniquePosition(
  positions: number[],
  position: number,
  minimumMovementCssPx: number,
): void {
  const previous = positions.at(-1);

  if (previous === undefined || Math.abs(position - previous) >= minimumMovementCssPx) {
    positions.push(position);
  }
}

function createScrollPositions(
  startScrollTopCssPx: number,
  endScrollTopCssPx: number,
  stepCssPx: number,
  maximumSegments: number,
  minimumMovementCssPx: number,
): number[] {
  const positions: number[] = [];

  appendUniquePosition(positions, startScrollTopCssPx, minimumMovementCssPx);

  let current = startScrollTopCssPx;

  while (current < endScrollTopCssPx) {
    if (positions.length >= maximumSegments) {
      throw new ScrollPlanError(
        'SEGMENT_LIMIT_EXCEEDED',
        `The scroll plan requires more than ` + `${maximumSegments} viewport segments.`,
      );
    }

    const next = Math.min(endScrollTopCssPx, current + stepCssPx);

    appendUniquePosition(positions, next, minimumMovementCssPx);

    if (Math.abs(next - current) < minimumMovementCssPx) {
      break;
    }

    current = next;
  }

  const finalPosition = positions.at(-1);

  if (
    finalPosition === undefined ||
    Math.abs(finalPosition - endScrollTopCssPx) >= minimumMovementCssPx
  ) {
    if (positions.length >= maximumSegments) {
      throw new ScrollPlanError(
        'SEGMENT_LIMIT_EXCEEDED',
        `The scroll plan requires more than ` + `${maximumSegments} viewport segments.`,
      );
    }

    positions.push(endScrollTopCssPx);
  }

  return positions;
}

export function createMultiViewportScrollPlan(
  input: CreateScrollPlanInput,
): MultiViewportScrollPlan {
  if (input.turns.length === 0) {
    throw new ScrollPlanError(
      'NO_TURNS',
      'A multi-viewport scroll plan requires at least one conversation turn.',
    );
  }

  const containerElement = findConversationScrollContainer(input.turns);

  if (!containerElement) {
    throw new ScrollPlanError(
      'NO_SCROLL_CONTAINER',
      'A scroll container containing all selected conversation turns could not be found.',
    );
  }

  const container = measureScrollContainer(containerElement);

  if (container.clientHeightCssPx <= 0) {
    throw new ScrollPlanError(
      'INVALID_VIEWPORT_HEIGHT',
      'The conversation scroll container has no visible height.',
    );
  }

  const minimumMovementCssPx = input.minimumMovementCssPx ?? MINIMUM_SCROLL_MOVEMENT_CSS_PX;

  const maximumSafeBottomInsetCssPx = Math.max(
    0,
    container.clientHeightCssPx - minimumMovementCssPx * 2,
  );

  const safeBottomInsetCssPx = clamp(
    input.safeBottomInsetCssPx ?? DEFAULT_SAFE_BOTTOM_INSET_CSS_PX,
    0,
    maximumSafeBottomInsetCssPx,
  );

  const effectiveCaptureHeightCssPx = container.clientHeightCssPx - safeBottomInsetCssPx;

  if (effectiveCaptureHeightCssPx <= minimumMovementCssPx) {
    throw new ScrollPlanError(
      'INVALID_SAFE_CAPTURE_HEIGHT',
      `The safe capture height is only ` + `${effectiveCaptureHeightCssPx.toFixed(1)} CSS pixels.`,
    );
  }

  const maximumOverlapCssPx = Math.max(0, effectiveCaptureHeightCssPx - minimumMovementCssPx);

  const targetOverlapCssPx = clamp(
    input.targetOverlapCssPx ?? DEFAULT_TARGET_OVERLAP_CSS_PX,
    0,
    maximumOverlapCssPx,
  );

  /*
   * Intermediate captures exclude the unsafe
   * lower viewport band. Reduce the scroll step
   * by the same amount so the remaining safe
   * capture bands still overlap continuously.
   */
  const stepCssPx = effectiveCaptureHeightCssPx - targetOverlapCssPx;

  if (stepCssPx < minimumMovementCssPx) {
    throw new ScrollPlanError(
      'MOVEMENT_TOO_SMALL',
      `The calculated scroll step is ` +
        `${stepCssPx.toFixed(1)} CSS pixels, ` +
        `below the required minimum of ` +
        `${minimumMovementCssPx}.`,
    );
  }

  const turnOffsets = input.turns.map((turn) => getTurnOffsetInContainer(turn, containerElement));

  const rangeTopCssPx = Math.min(...turnOffsets.map((offset) => offset.topCssPx));

  const rangeBottomCssPx = Math.max(...turnOffsets.map((offset) => offset.bottomCssPx));

  if (!Number.isFinite(rangeTopCssPx) || !Number.isFinite(rangeBottomCssPx)) {
    throw new ScrollPlanError(
      'RANGE_OUTSIDE_SCROLL_CONTAINER',
      'The selected conversation range could not be measured inside the scroll container.',
    );
  }

  const startScrollTopCssPx = clamp(rangeTopCssPx, 0, container.maximumScrollTopCssPx);

  /*
   * Keep the selected range bottom above the unsafe
   * lower viewport band, including in the final
   * segment.
   *
   * Chat interfaces such as Microsoft Copilot can
   * render a fade, footer, composer overlay, or
   * scroll control across the lower viewport area.
   * Using the effective capture height moves the
   * final selected line into the clear region before
   * the screenshot is cropped.
   */
  const desiredEndScrollTopCssPx = rangeBottomCssPx - effectiveCaptureHeightCssPx;

  const endScrollTopCssPx = clamp(
    Math.max(startScrollTopCssPx, desiredEndScrollTopCssPx),
    0,
    container.maximumScrollTopCssPx,
  );

  const maximumSegments = input.maximumSegments ?? MAXIMUM_VIEWPORT_SEGMENTS;

  const positionsCssPx = createScrollPositions(
    startScrollTopCssPx,
    endScrollTopCssPx,
    stepCssPx,
    maximumSegments,
    minimumMovementCssPx,
  );

  return {
    container,
    startScrollTopCssPx,
    endScrollTopCssPx,
    stepCssPx,
    targetOverlapCssPx,
    safeBottomInsetCssPx,
    effectiveCaptureHeightCssPx,
    positionsCssPx,
  };
}

export async function scrollToPosition(
  container: HTMLElement,
  targetScrollTopCssPx: number,
): Promise<number> {
  container.scrollTo({
    top: targetScrollTopCssPx,
    behavior: 'instant',
  });

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

  return container.scrollTop;
}

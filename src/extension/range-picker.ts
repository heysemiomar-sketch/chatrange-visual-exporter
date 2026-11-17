import type { ConversationTurn, MessageRole } from '../adapters/base';

export type RangePickerState =
  'idle' | 'selecting-start' | 'selecting-end' | 'range-ready' | 'cancelled';

export interface SelectedRange {
  start: ConversationTurn;
  end: ConversationTurn;
  turns: ConversationTurn[];
}

export interface RangePickerSession {
  state: RangePickerState;
  turns: ConversationTurn[];
  startTurn: ConversationTurn | null;
  endTurn: ConversationTurn | null;
}

export interface RangePickerCallbacks {
  onStateChange(session: RangePickerSession): void;

  onRangeReady(range: SelectedRange): void;

  onCancel(): void;
}

export type ConversationTurnProvider = () => ConversationTurn[];

interface TurnFingerprint {
  role: MessageRole;
  normalizedTextPrefix: string;
  originalLogicalIndex: number;
}

const STYLE_ID = 'chatrange-picker-styles';

const HOVER_ATTRIBUTE = 'data-chatrange-picker-hover';

const START_ATTRIBUTE = 'data-chatrange-picker-start';

const END_ATTRIBUTE = 'data-chatrange-picker-end';

const RANGE_ATTRIBUTE = 'data-chatrange-picker-range';

const PICKER_ACTIVE_ATTRIBUTE = 'data-chatrange-picker-active';

const CANCEL_EVENT = 'chatrange:cancel-active-picker';

const FINGERPRINT_PREFIX_LENGTH = 160;

export function createRangePickerSession(turns: ConversationTurn[]): RangePickerSession {
  return {
    state: 'selecting-start',
    turns,
    startTurn: null,
    endTurn: null,
  };
}

export function normalizeRange(
  first: ConversationTurn,
  second: ConversationTurn,
  turns: ConversationTurn[],
): SelectedRange {
  const start = first.logicalIndex <= second.logicalIndex ? first : second;

  const end = first.logicalIndex <= second.logicalIndex ? second : first;

  const selectedTurns = turns.filter(
    (turn) => turn.logicalIndex >= start.logicalIndex && turn.logicalIndex <= end.logicalIndex,
  );

  return {
    start,
    end,
    turns: selectedTurns,
  };
}

function normalizeText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, FINGERPRINT_PREFIX_LENGTH);
}

function createTurnFingerprint(turn: ConversationTurn): TurnFingerprint {
  return {
    role: turn.role,
    normalizedTextPrefix: normalizeText(turn.element.textContent ?? ''),
    originalLogicalIndex: turn.logicalIndex,
  };
}

function calculateIndexDistance(turn: ConversationTurn, fingerprint: TurnFingerprint): number {
  return Math.abs(turn.logicalIndex - fingerprint.originalLogicalIndex);
}

function resolveTurnFingerprint(
  fingerprint: TurnFingerprint,
  turns: ConversationTurn[],
): ConversationTurn | undefined {
  const sameRoleTurns = turns.filter((turn) => turn.role === fingerprint.role);

  const exactTextMatch = sameRoleTurns.find(
    (turn) => normalizeText(turn.element.textContent ?? '') === fingerprint.normalizedTextPrefix,
  );

  if (exactTextMatch) {
    return exactTextMatch;
  }

  const prefixMatch = sameRoleTurns.find((turn) => {
    const currentText = normalizeText(turn.element.textContent ?? '');

    return (
      currentText.startsWith(fingerprint.normalizedTextPrefix) ||
      fingerprint.normalizedTextPrefix.startsWith(currentText)
    );
  });

  if (prefixMatch) {
    return prefixMatch;
  }

  return [...sameRoleTurns].sort(
    (first, second) =>
      calculateIndexDistance(first, fingerprint) - calculateIndexDistance(second, fingerprint),
  )[0];
}

function injectPickerStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');

  style.id = STYLE_ID;

  style.textContent = `
    html[${PICKER_ACTIVE_ATTRIBUTE}="true"] {
      user-select: none !important;
    }

    [${HOVER_ATTRIBUTE}="true"] {
      outline: 4px dashed #f59e0b !important;
      outline-offset: 5px !important;
      cursor: pointer !important;
    }

    [${START_ATTRIBUTE}="true"] {
      outline: 5px solid #2563eb !important;
      outline-offset: 5px !important;
    }

    [${END_ATTRIBUTE}="true"] {
      outline: 5px solid #7c3aed !important;
      outline-offset: 5px !important;
    }

    [${RANGE_ATTRIBUTE}="true"] {
      box-shadow:
        0 0 0 4px rgba(6, 182, 212, 0.55)
        !important;
    }
  `;

  document.documentElement.appendChild(style);
}

function removeAttributeFromAll(attribute: string): void {
  const elements = document.querySelectorAll<HTMLElement>(`[${attribute}]`);

  for (const element of elements) {
    element.removeAttribute(attribute);
  }
}

function removeHover(): void {
  removeAttributeFromAll(HOVER_ATTRIBUTE);
}

function clearPickerMarks(): void {
  removeHover();

  removeAttributeFromAll(START_ATTRIBUTE);

  removeAttributeFromAll(END_ATTRIBUTE);

  removeAttributeFromAll(RANGE_ATTRIBUTE);
}

function findTurnFromEvent(event: Event, turns: ConversationTurn[]): ConversationTurn | undefined {
  const eventPath = event.composedPath();

  return turns.find((turn) =>
    eventPath.some(
      (pathItem) =>
        pathItem === turn.element || (pathItem instanceof Node && turn.element.contains(pathItem)),
    ),
  );
}

function markStartTurn(turn: ConversationTurn): void {
  removeAttributeFromAll(START_ATTRIBUTE);

  turn.element.setAttribute(START_ATTRIBUTE, 'true');
}

function markRange(range: SelectedRange): void {
  clearPickerMarks();

  for (const turn of range.turns) {
    turn.element.setAttribute(RANGE_ATTRIBUTE, 'true');
  }

  range.start.element.setAttribute(START_ATTRIBUTE, 'true');

  range.end.element.setAttribute(END_ATTRIBUTE, 'true');
}

export function startRangePicker(
  getTurns: ConversationTurnProvider,
  callbacks: RangePickerCallbacks,
): () => void {
  window.dispatchEvent(new CustomEvent(CANCEL_EVENT));

  injectPickerStyles();
  clearPickerMarks();

  document.documentElement.setAttribute(PICKER_ACTIVE_ATTRIBUTE, 'true');

  const initialTurns = getTurns();

  const session = createRangePickerSession(initialTurns);

  const controller = new AbortController();

  let finished = false;

  let startFingerprint: TurnFingerprint | null = null;

  function refreshTurns(): ConversationTurn[] {
    const refreshedTurns = getTurns();

    session.turns = refreshedTurns;

    if (startFingerprint && session.state === 'selecting-end') {
      const resolvedStart = resolveTurnFingerprint(startFingerprint, refreshedTurns);

      if (resolvedStart) {
        session.startTurn = resolvedStart;

        markStartTurn(resolvedStart);
      }
    }

    return refreshedTurns;
  }

  function finishSession(): void {
    controller.abort();

    document.documentElement.removeAttribute(PICKER_ACTIVE_ATTRIBUTE);

    removeHover();
  }

  function cancelSession(): void {
    if (finished) {
      return;
    }

    finished = true;
    session.state = 'cancelled';

    clearPickerMarks();
    finishSession();

    callbacks.onStateChange(session);

    callbacks.onCancel();
  }

  function handleMouseOver(event: MouseEvent): void {
    if (finished) {
      return;
    }

    const currentTurns = refreshTurns();

    const turn = findTurnFromEvent(event, currentTurns);

    removeHover();

    if (!turn) {
      return;
    }

    turn.element.setAttribute(HOVER_ATTRIBUTE, 'true');
  }

  function handlePointerDown(event: PointerEvent): void {
    if (finished || event.button !== 0) {
      return;
    }

    const currentTurns = refreshTurns();

    const turn = findTurnFromEvent(event, currentTurns);

    console.info('ChatRange: picker pointer event.', {
      state: session.state,
      mountedTurnCount: currentTurns.length,
      matchedTurn: turn
        ? {
            role: turn.role,
            logicalIndex: turn.logicalIndex,
          }
        : null,
      startResolved: session.startTurn
        ? {
            role: session.startTurn.role,
            logicalIndex: session.startTurn.logicalIndex,
          }
        : null,
      target:
        event.target instanceof Element
          ? {
              tag: event.target.tagName,
              className: event.target.className,
            }
          : null,
    });

    if (!turn) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    removeHover();

    if (session.state === 'selecting-start') {
      session.startTurn = turn;

      startFingerprint = createTurnFingerprint(turn);

      session.state = 'selecting-end';

      clearPickerMarks();
      markStartTurn(turn);

      callbacks.onStateChange(session);

      return;
    }

    if (session.state !== 'selecting-end' || !session.startTurn) {
      return;
    }

    session.endTurn = turn;

    const range = normalizeRange(session.startTurn, turn, currentTurns);

    session.startTurn = range.start;

    session.endTurn = range.end;

    session.state = 'range-ready';

    markRange(range);

    finished = true;
    finishSession();

    callbacks.onStateChange(session);

    callbacks.onRangeReady(range);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    cancelSession();
  }

  window.addEventListener(CANCEL_EVENT, cancelSession, {
    signal: controller.signal,
  });

  document.addEventListener('mouseover', handleMouseOver, {
    capture: true,
    signal: controller.signal,
  });

  document.addEventListener('pointerdown', handlePointerDown, {
    capture: true,
    signal: controller.signal,
  });

  document.addEventListener('keydown', handleKeyDown, {
    capture: true,
    signal: controller.signal,
  });

  callbacks.onStateChange(session);

  return cancelSession;
}

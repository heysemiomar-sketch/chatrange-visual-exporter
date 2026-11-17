import type { ConversationTurn } from '../adapters/base';

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

import { chatGptAdapter } from '../adapters/chatgpt';

import type { RangePickerSession, SelectedRange } from './range-picker';

import { startRangePicker } from './range-picker';

const STATUS_ID = 'chatrange-status';

function showStatus(message: string, type: 'info' | 'success' | 'error'): void {
  document.getElementById(STATUS_ID)?.remove();

  const status = document.createElement('div');

  status.id = STATUS_ID;
  status.textContent = message;

  const backgroundColors = {
    info: '#1d4ed8',
    success: '#047857',
    error: '#b91c1c',
  };

  Object.assign(status.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '2147483647',
    maxWidth: '420px',
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: backgroundColors[type],
    color: '#ffffff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    lineHeight: '1.5',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
    pointerEvents: 'none',
  });

  document.documentElement.appendChild(status);

  if (type !== 'info') {
    window.setTimeout(() => {
      status.remove();
    }, 5000);
  }
}

function describeSelectionState(session: RangePickerSession): void {
  switch (session.state) {
    case 'selecting-start':
      showStatus('ChatRange: select the start message. Press Escape to cancel.', 'info');
      break;

    case 'selecting-end':
      showStatus('ChatRange: start selected. Now select the end message.', 'info');
      break;

    case 'cancelled':
      showStatus('ChatRange: range selection cancelled.', 'error');
      break;

    case 'range-ready':
    case 'idle':
      break;
  }
}

function describeReadyRange(range: SelectedRange): void {
  showStatus(
    `ChatRange: range ready. ` +
      `${range.turns.length} mounted turn(s) selected. ` +
      `Start #${range.start.logicalIndex}, ` +
      `end #${range.end.logicalIndex}.`,
    'success',
  );

  console.info('ChatRange: selected range.', {
    startRole: range.start.role,
    startLogicalIndex: range.start.logicalIndex,
    endRole: range.end.role,
    endLogicalIndex: range.end.logicalIndex,
    selectedTurnCount: range.turns.length,
  });
}

function run(): void {
  if (!chatGptAdapter.isSupportedPage()) {
    showStatus('ChatRange: unsupported page.', 'error');

    return;
  }

  const initialTurns = chatGptAdapter.findConversationTurns();

  if (initialTurns.length === 0) {
    showStatus('ChatRange: no mounted conversation turns found.', 'error');

    return;
  }

  console.info('ChatRange: starting range picker.', {
    mountedTurnCount: initialTurns.length,
  });

  startRangePicker(() => chatGptAdapter.findConversationTurns(), {
    onStateChange: describeSelectionState,

    onRangeReady: describeReadyRange,

    onCancel(): void {
      console.info('ChatRange: picker cancelled.');
    },
  });
}

run();

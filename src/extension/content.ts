import type { ConversationTurn, MessageRole } from '../adapters/base';
import { chatGptAdapter } from '../adapters/chatgpt';

const HIGHLIGHT_ATTRIBUTE = 'data-chatrange-highlighted';

const STATUS_ID = 'chatrange-status';

const ROLE_COLORS: Record<MessageRole, string> = {
  user: '#3b82f6',
  assistant: '#10a37f',
};

function showStatus(message: string, type: 'success' | 'error'): void {
  document.getElementById(STATUS_ID)?.remove();

  const status = document.createElement('div');

  status.id = STATUS_ID;
  status.textContent = message;

  Object.assign(status.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '2147483647',
    maxWidth: '400px',
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: type === 'success' ? '#047857' : '#b91c1c',
    color: '#ffffff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
  });

  document.documentElement.appendChild(status);

  window.setTimeout(() => {
    status.remove();
  }, 4000);
}

function clearPreviousHighlight(): void {
  const highlightedElements = document.querySelectorAll<HTMLElement>(
    `[${HIGHLIGHT_ATTRIBUTE}="true"]`,
  );

  for (const element of highlightedElements) {
    element.style.removeProperty('outline');
    element.style.removeProperty('outline-offset');
    element.removeAttribute(HIGHLIGHT_ATTRIBUTE);
  }
}

function intersectsViewport(turn: ConversationTurn): boolean {
  const rectangle = turn.element.getBoundingClientRect();

  return (
    rectangle.width > 0 &&
    rectangle.height > 0 &&
    rectangle.bottom > 0 &&
    rectangle.top < window.innerHeight
  );
}

function distanceFromViewportCenter(turn: ConversationTurn): number {
  const rectangle = turn.element.getBoundingClientRect();

  const elementCenter = rectangle.top + rectangle.height / 2;

  const viewportCenter = window.innerHeight / 2;

  return Math.abs(elementCenter - viewportCenter);
}

function selectVisibleTurn(turns: ConversationTurn[]): ConversationTurn | undefined {
  return turns
    .filter(intersectsViewport)
    .sort(
      (first, second) => distanceFromViewportCenter(first) - distanceFromViewportCenter(second),
    )[0];
}

function highlightTurn(turn: ConversationTurn): void {
  const color = ROLE_COLORS[turn.role];

  turn.element.setAttribute(HIGHLIGHT_ATTRIBUTE, 'true');

  turn.element.style.setProperty('outline', `5px solid ${color}`, 'important');

  turn.element.style.setProperty('outline-offset', '5px', 'important');

  turn.element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
}

function countRole(turns: ConversationTurn[], role: MessageRole): number {
  return turns.filter((turn) => turn.role === role).length;
}

function run(): void {
  clearPreviousHighlight();

  if (!chatGptAdapter.isSupportedPage()) {
    showStatus('ChatRange: unsupported page.', 'error');
    return;
  }

  const turns = chatGptAdapter.findConversationTurns();

  const target = selectVisibleTurn(turns) ?? turns[0];

  if (!target) {
    showStatus('ChatRange: no mounted conversation turns found.', 'error');
    return;
  }

  highlightTurn(target);

  const userCount = countRole(turns, 'user');

  const assistantCount = countRole(turns, 'assistant');

  showStatus(
    `ChatRange: ${turns.length} mounted turns ` +
      `(${userCount} user, ` +
      `${assistantCount} assistant). ` +
      `Selected ${target.role} ` +
      `#${target.logicalIndex}.`,
    'success',
  );

  console.info('ChatRange: selected conversation turn.', {
    role: target.role,
    logicalIndex: target.logicalIndex,
    mountedTurnCount: turns.length,
    userCount,
    assistantCount,
    element: target.element,
  });
}

run();

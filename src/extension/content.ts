import { chatGptAdapter } from '../adapters/chatgpt';

const HIGHLIGHT_ATTRIBUTE = 'data-chatrange-highlighted';
const STATUS_ID = 'chatrange-status';

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
    maxWidth: '360px',
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
    element.style.removeProperty('background-color');
    element.removeAttribute(HIGHLIGHT_ATTRIBUTE);
  }
}

function intersectsViewport(element: HTMLElement): boolean {
  const rectangle = element.getBoundingClientRect();

  return (
    rectangle.width > 0 &&
    rectangle.height > 0 &&
    rectangle.bottom > 0 &&
    rectangle.top < window.innerHeight
  );
}

function distanceFromViewportCenter(element: HTMLElement): number {
  const rectangle = element.getBoundingClientRect();
  const elementCenter = rectangle.top + rectangle.height / 2;
  const viewportCenter = window.innerHeight / 2;

  return Math.abs(elementCenter - viewportCenter);
}

function selectVisibleTurn(turns: HTMLElement[]): HTMLElement | undefined {
  return turns
    .filter(intersectsViewport)
    .sort(
      (first, second) => distanceFromViewportCenter(first) - distanceFromViewportCenter(second),
    )[0];
}

function highlightConversationTurn(): void {
  console.info('ChatRange content script loaded.');

  clearPreviousHighlight();

  if (!chatGptAdapter.isSupportedPage()) {
    showStatus('ChatRange: unsupported page.', 'error');
    return;
  }

  const turns = chatGptAdapter.findConversationTurns();
  const target = selectVisibleTurn(turns) ?? turns[0];

  if (!target) {
    showStatus('ChatRange: no message blocks were found.', 'error');
    return;
  }

  target.setAttribute(HIGHLIGHT_ATTRIBUTE, 'true');
  target.style.setProperty('outline', '5px solid #10a37f', 'important');
  target.style.setProperty('outline-offset', '5px', 'important');
  target.style.setProperty('background-color', 'rgba(16, 163, 127, 0.08)', 'important');

  target.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });

  showStatus(`ChatRange: detected ${turns.length} assistant message block(s).`, 'success');

  console.info('ChatRange: highlighted assistant message.', target);
}

highlightConversationTurn();

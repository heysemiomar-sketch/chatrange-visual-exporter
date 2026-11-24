import type { ChatAdapter, ConversationTurn, MessageRole } from './base';

const SUPPORTED_HOSTNAME = 'gemini.google.com';

const USER_TURN_SELECTOR = 'user-query';

const ASSISTANT_TURN_SELECTOR = 'model-response';

const SCROLL_CONTAINER_SELECTOR = 'infinite-scroller.chat-history';

type UnindexedConversationTurn = Omit<ConversationTurn, 'logicalIndex'>;

function isHTMLElement(element: Element): element is HTMLElement {
  return element instanceof HTMLElement;
}

function isUsableElement(element: HTMLElement): boolean {
  const rectangle = element.getBoundingClientRect();

  const textLength = element.textContent?.trim().length ?? 0;

  const style = window.getComputedStyle(element);

  return (
    rectangle.width > 0 &&
    rectangle.height > 0 &&
    textLength > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden'
  );
}

function queryUsableElements(selector: string): HTMLElement[] {
  return Array.from(document.querySelectorAll(selector))
    .filter(isHTMLElement)
    .filter(isUsableElement);
}

function removeDuplicateElements(elements: HTMLElement[]): HTMLElement[] {
  return [...new Set(elements)];
}

function compareDocumentOrder(first: HTMLElement, second: HTMLElement): number {
  if (first === second) {
    return 0;
  }

  const position = first.compareDocumentPosition(second);

  if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
    return -1;
  }

  if (position & Node.DOCUMENT_POSITION_PRECEDING) {
    return 1;
  }

  return 0;
}

function createTurns(elements: HTMLElement[], role: MessageRole): UnindexedConversationTurn[] {
  return elements.map((element) => ({
    role,
    element,
  }));
}

function removeDuplicateTurns(turns: UnindexedConversationTurn[]): UnindexedConversationTurn[] {
  const seen = new Set<HTMLElement>();

  return turns.filter((turn) => {
    if (seen.has(turn.element)) {
      return false;
    }

    seen.add(turn.element);

    return true;
  });
}

export const geminiAdapter: ChatAdapter = {
  id: 'google-gemini',

  displayName: 'Google Gemini',

  isSupportedPage(): boolean {
    return window.location.hostname === SUPPORTED_HOSTNAME;
  },

  findConversationTurns(): ConversationTurn[] {
    const userElements = removeDuplicateElements(queryUsableElements(USER_TURN_SELECTOR));

    const assistantElements = removeDuplicateElements(queryUsableElements(ASSISTANT_TURN_SELECTOR));

    const unorderedTurns = [
      ...createTurns(userElements, 'user'),

      ...createTurns(assistantElements, 'assistant'),
    ];

    const orderedTurns = removeDuplicateTurns(unorderedTurns).sort((first, second) =>
      compareDocumentOrder(first.element, second.element),
    );

    const turns = orderedTurns.map((turn, logicalIndex) => ({
      ...turn,
      logicalIndex,
    }));

    const scrollContainer = document.querySelector<HTMLElement>(SCROLL_CONTAINER_SELECTOR);

    console.info('ChatRange: Google Gemini adapter detection.', {
      adapterId: geminiAdapter.id,

      hostname: window.location.hostname,

      userSelector: USER_TURN_SELECTOR,

      userCount: userElements.length,

      assistantSelector: ASSISTANT_TURN_SELECTOR,

      assistantCount: assistantElements.length,

      mountedTurnCount: turns.length,

      scrollContainerSelector: SCROLL_CONTAINER_SELECTOR,

      scrollContainerFound: Boolean(scrollContainer),

      scrollContainerClientHeight: scrollContainer?.clientHeight ?? null,

      scrollContainerScrollHeight: scrollContainer?.scrollHeight ?? null,
    });

    return turns;
  },
};

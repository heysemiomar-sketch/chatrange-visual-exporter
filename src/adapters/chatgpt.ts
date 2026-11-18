import type { ChatAdapter, ConversationTurn, MessageRole } from './base';

const ASSISTANT_SELECTORS = [
  '[data-markdown-text-style="assistant-message"]',
  '[data-message-author-role="assistant"]',
  'article[data-testid^="conversation-turn-"]',
];

const USER_SELECTORS = [
  '[data-user-message-bubble="true"]',
  '[data-message-author-role="user"]',
  'div.bg-user-message.text-user-message',
];

const ASSISTANT_FALLBACK_SELECTORS = [
  'div[class^="MarkdownRoot-"]',
  'div[class*=" MarkdownRoot-"]',
];

interface SelectorResult {
  selector: string | null;
  elements: HTMLElement[];
}

type UnindexedConversationTurn = Omit<ConversationTurn, 'logicalIndex'>;

function isHTMLElement(element: Element): element is HTMLElement {
  return element instanceof HTMLElement;
}

function isUsableElement(element: HTMLElement): boolean {
  const rectangle = element.getBoundingClientRect();

  const textLength = element.textContent?.trim().length ?? 0;

  return rectangle.width > 0 && rectangle.height > 0 && textLength > 0;
}

function removeNestedDuplicates(elements: HTMLElement[]): HTMLElement[] {
  const uniqueElements = [...new Set(elements)];

  return uniqueElements.filter(
    (element) =>
      !uniqueElements.some((candidate) => candidate !== element && candidate.contains(element)),
  );
}

function queryUsableElements(selector: string): HTMLElement[] {
  return removeNestedDuplicates(
    Array.from(document.querySelectorAll(selector)).filter(isHTMLElement).filter(isUsableElement),
  );
}

function findFirstMatchingGroup(selectors: string[]): SelectorResult {
  for (const selector of selectors) {
    const elements = queryUsableElements(selector);

    if (elements.length > 0) {
      return {
        selector,
        elements,
      };
    }
  }

  return {
    selector: null,
    elements: [],
  };
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

export const chatGptAdapter: ChatAdapter = {
  id: 'chatgpt',

  displayName: 'ChatGPT',

  isSupportedPage(): boolean {
    return (
      window.location.hostname === 'chatgpt.com' || window.location.hostname === 'chat.openai.com'
    );
  },

  findConversationTurns(): ConversationTurn[] {
    const assistantResult = findFirstMatchingGroup(ASSISTANT_SELECTORS);

    const effectiveAssistantResult =
      assistantResult.elements.length > 0
        ? assistantResult
        : findFirstMatchingGroup(ASSISTANT_FALLBACK_SELECTORS);

    const userResult = findFirstMatchingGroup(USER_SELECTORS);

    const unorderedTurns = [
      ...createTurns(effectiveAssistantResult.elements, 'assistant'),
      ...createTurns(userResult.elements, 'user'),
    ];

    const orderedTurns = unorderedTurns.sort((first, second) =>
      compareDocumentOrder(first.element, second.element),
    );

    const turns = orderedTurns.map((turn, logicalIndex) => ({
      ...turn,
      logicalIndex,
    }));

    console.info('ChatRange: ChatGPT adapter detection.', {
      adapterId: chatGptAdapter.id,
      assistantSelector: effectiveAssistantResult.selector,
      assistantCount: effectiveAssistantResult.elements.length,
      userSelector: userResult.selector,
      userCount: userResult.elements.length,
      mountedTurnCount: turns.length,
    });

    return turns;
  },
};

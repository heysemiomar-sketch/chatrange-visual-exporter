import type { ChatAdapter, ConversationTurn, MessageRole } from './base';

const SUPPORTED_HOSTNAMES = new Set(['copilot.cloud.microsoft', 'copilot.microsoft.com']);

const USER_CONTENT_SELECTOR = '[data-testid="chatOutput"]';

const USER_TURN_SELECTOR = '[data-testid="chatQuestion"]';

const USER_ARTICLE_SELECTOR = '[role="article"]';

const ASSISTANT_CONTENT_SELECTOR = '[data-testid="markdown-reply"]';

const ASSISTANT_TURN_SELECTOR = '[data-testid="copilot-message-div"]';

const CONVERSATION_FEED_SELECTOR = '[role="feed"][aria-label="Chat conversation"]';

type UnindexedConversationTurn = Omit<ConversationTurn, 'logicalIndex'>;

function isHTMLElement(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement;
}

function isUsableElement(element: HTMLElement): boolean {
  const rectangle = element.getBoundingClientRect();

  const textLength = element.textContent?.trim().length ?? 0;

  return rectangle.width > 0 && rectangle.height > 0 && textLength > 0;
}

function isInsideConversationFeed(element: HTMLElement): boolean {
  return Boolean(element.closest(CONVERSATION_FEED_SELECTOR));
}

function findUserTurnRoot(contentElement: HTMLElement): HTMLElement {
  const questionRoot = contentElement.closest<HTMLElement>(USER_TURN_SELECTOR);

  if (questionRoot) {
    const article = questionRoot.querySelector<HTMLElement>(USER_ARTICLE_SELECTOR);

    if (article && article.contains(contentElement) && isUsableElement(article)) {
      return article;
    }

    return questionRoot;
  }

  const article = contentElement.closest<HTMLElement>(USER_ARTICLE_SELECTOR);

  return article ?? contentElement;
}

function findAssistantTurnRoot(contentElement: HTMLElement): HTMLElement {
  const assistantRoot = contentElement.closest<HTMLElement>(ASSISTANT_TURN_SELECTOR);

  return assistantRoot ?? contentElement;
}

function removeDuplicateRoots(elements: HTMLElement[]): HTMLElement[] {
  return [...new Set(elements)].filter(
    (element) => isUsableElement(element) && isInsideConversationFeed(element),
  );
}

function createTurns(elements: HTMLElement[], role: MessageRole): UnindexedConversationTurn[] {
  return elements.map((element) => ({
    role,
    element,
  }));
}

function findUserTurns(): UnindexedConversationTurn[] {
  const contentElements = Array.from(document.querySelectorAll(USER_CONTENT_SELECTOR)).filter(
    isHTMLElement,
  );

  const roots = removeDuplicateRoots(contentElements.map(findUserTurnRoot));

  return createTurns(roots, 'user');
}

function findAssistantTurns(): UnindexedConversationTurn[] {
  const contentElements = Array.from(document.querySelectorAll(ASSISTANT_CONTENT_SELECTOR)).filter(
    isHTMLElement,
  );

  const roots = removeDuplicateRoots(contentElements.map(findAssistantTurnRoot));

  return createTurns(roots, 'assistant');
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

export const copilotAdapter: ChatAdapter = {
  id: 'microsoft-copilot',

  displayName: 'Microsoft Copilot',

  isSupportedPage(): boolean {
    return SUPPORTED_HOSTNAMES.has(window.location.hostname);
  },

  findConversationTurns(): ConversationTurn[] {
    const userTurns = findUserTurns();

    const assistantTurns = findAssistantTurns();

    const orderedTurns = removeDuplicateTurns([...userTurns, ...assistantTurns]).sort(
      (first, second) => compareDocumentOrder(first.element, second.element),
    );

    const turns = orderedTurns.map((turn, logicalIndex) => ({
      ...turn,
      logicalIndex,
    }));

    const feed = document.querySelector<HTMLElement>(CONVERSATION_FEED_SELECTOR);

    console.info('ChatRange: Microsoft Copilot adapter detection.', {
      adapterId: copilotAdapter.id,
      hostname: window.location.hostname,
      userContentSelector: USER_CONTENT_SELECTOR,
      userTurnSelector: USER_TURN_SELECTOR,
      userCount: userTurns.length,
      assistantContentSelector: ASSISTANT_CONTENT_SELECTOR,
      assistantTurnSelector: ASSISTANT_TURN_SELECTOR,
      assistantCount: assistantTurns.length,
      mountedTurnCount: turns.length,
      conversationFeedFound: Boolean(feed),
      feedClientHeight: feed?.clientHeight ?? null,
      feedScrollHeight: feed?.scrollHeight ?? null,
    });

    return turns;
  },
};

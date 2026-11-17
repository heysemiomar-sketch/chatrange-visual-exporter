import type { ChatAdapter } from './base';

const SEMANTIC_TURN_SELECTORS = [
  '[data-markdown-text-style="assistant-message"]',
  'article[data-testid^="conversation-turn-"]',
  '[data-testid^="conversation-turn-"]',
  '[data-message-author-role]',
  '[data-message-id]',
];

const STRUCTURAL_FALLBACK_SELECTORS = [
  'div[class^="MarkdownRoot-"]',
  'div[class*=" MarkdownRoot-"]',
  'p[class^="Paragraph-"]',
  'p[class*=" Paragraph-"]',
];

function isHTMLElement(element: Element): element is HTMLElement {
  return element instanceof HTMLElement;
}

function isUsableElement(element: HTMLElement): boolean {
  const rectangle = element.getBoundingClientRect();
  const textLength = element.textContent?.trim().length ?? 0;

  return rectangle.width > 0 && rectangle.height > 20 && textLength > 0;
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

function findFirstMatchingGroup(selectors: string[]): HTMLElement[] {
  for (const selector of selectors) {
    const matches = queryUsableElements(selector);

    if (matches.length > 0) {
      console.info('ChatRange: matched ChatGPT selector.', {
        selector,
        count: matches.length,
      });

      return matches;
    }
  }

  return [];
}

export const chatGptAdapter: ChatAdapter = {
  isSupportedPage(): boolean {
    return (
      window.location.hostname === 'chatgpt.com' || window.location.hostname === 'chat.openai.com'
    );
  },

  findConversationTurns(): HTMLElement[] {
    const semanticMatches = findFirstMatchingGroup(SEMANTIC_TURN_SELECTORS);

    if (semanticMatches.length > 0) {
      return semanticMatches;
    }

    const fallbackMatches = findFirstMatchingGroup(STRUCTURAL_FALLBACK_SELECTORS);

    if (fallbackMatches.length > 0) {
      console.warn('ChatRange: using a structural fallback selector.');

      return fallbackMatches;
    }

    console.warn('ChatRange: no supported message structure was found.');

    return [];
  },
};

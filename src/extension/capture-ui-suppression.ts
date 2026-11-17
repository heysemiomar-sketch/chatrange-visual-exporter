const CAPTURE_MODE_ATTRIBUTE = 'data-chatrange-capture-mode';

const SUPPRESSED_ATTRIBUTE = 'data-chatrange-capture-suppressed';

const STYLE_ID = 'chatrange-capture-suppression-style';

const OVERLAY_SELECTORS = [
  'form[data-type="unified-composer"]',
  '[data-testid="composer"]',
  '[data-testid="composer-footer"]',
  '[data-testid="scroll-to-bottom-button"]',
  '[data-testid*="scroll-to-bottom"]',
  'button[aria-label="Scroll to bottom"]',
  'button[aria-label="scroll to bottom"]',
  'button[aria-label*="Scroll to bottom"]',
  'button[aria-label*="scroll to bottom"]',
];

const INPUT_SELECTORS = [
  '#prompt-textarea',
  'textarea[placeholder*="Ask ChatGPT"]',
  'textarea[placeholder*="Ask"]',
  '[contenteditable="true"][data-placeholder*="Ask"]',
  '[contenteditable="true"][aria-label*="Ask"]',
];

export interface CaptureUiSuppression {
  suppressedElementCount: number;
  restore(): void;
}

function installSuppressionStyle(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');

  style.id = STYLE_ID;

  style.textContent = `
    [${SUPPRESSED_ATTRIBUTE}="true"] {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    html[${CAPTURE_MODE_ATTRIBUTE}="true"]
      form[data-type="unified-composer"],

    html[${CAPTURE_MODE_ATTRIBUTE}="true"]
      [data-testid="composer"],

    html[${CAPTURE_MODE_ATTRIBUTE}="true"]
      [data-testid="composer-footer"],

    html[${CAPTURE_MODE_ATTRIBUTE}="true"]
      [data-testid="scroll-to-bottom-button"],

    html[${CAPTURE_MODE_ATTRIBUTE}="true"]
      [data-testid*="scroll-to-bottom"],

    html[${CAPTURE_MODE_ATTRIBUTE}="true"]
      button[aria-label*="Scroll to bottom"],

    html[${CAPTURE_MODE_ATTRIBUTE}="true"]
      button[aria-label*="scroll to bottom"],

    html[${CAPTURE_MODE_ATTRIBUTE}="true"]
      #prompt-textarea,

    html[${CAPTURE_MODE_ATTRIBUTE}="true"]
      textarea[placeholder*="Ask"],

    html[${CAPTURE_MODE_ATTRIBUTE}="true"]
      [contenteditable="true"][data-placeholder*="Ask"],

    html[${CAPTURE_MODE_ATTRIBUTE}="true"]
      [contenteditable="true"][aria-label*="Ask"] {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;

  document.documentElement.appendChild(style);
}

function isSafeElement(element: HTMLElement): boolean {
  return element !== document.body && element !== document.documentElement;
}

function findComposerRoot(input: HTMLElement): HTMLElement {
  const root = input.closest<HTMLElement>(
    'form[data-type="unified-composer"], ' +
      '[data-testid="composer"], ' +
      '[data-testid="composer-footer"], ' +
      'form',
  );

  return root ?? input;
}

function suppressElement(element: HTMLElement, markedElements: Set<HTMLElement>): void {
  if (!isSafeElement(element) || element.hasAttribute(SUPPRESSED_ATTRIBUTE)) {
    return;
  }

  element.setAttribute(SUPPRESSED_ATTRIBUTE, 'true');

  markedElements.add(element);
}

function suppressMatchingElements(root: ParentNode, markedElements: Set<HTMLElement>): void {
  for (const selector of OVERLAY_SELECTORS) {
    let elements: NodeListOf<HTMLElement>;

    try {
      elements = root.querySelectorAll<HTMLElement>(selector);
    } catch {
      continue;
    }

    for (const element of elements) {
      suppressElement(element, markedElements);
    }
  }

  for (const selector of INPUT_SELECTORS) {
    let inputs: NodeListOf<HTMLElement>;

    try {
      inputs = root.querySelectorAll<HTMLElement>(selector);
    } catch {
      continue;
    }

    for (const input of inputs) {
      suppressElement(findComposerRoot(input), markedElements);
    }
  }

  if (root instanceof HTMLElement) {
    for (const selector of OVERLAY_SELECTORS) {
      try {
        if (root.matches(selector)) {
          suppressElement(root, markedElements);
        }
      } catch {
        continue;
      }
    }

    for (const selector of INPUT_SELECTORS) {
      try {
        if (root.matches(selector)) {
          suppressElement(findComposerRoot(root), markedElements);
        }
      } catch {
        continue;
      }
    }
  }
}

function clearPickerUi(): void {
  document.getElementById('chatrange-status')?.remove();

  const pickerAttributes = [
    'data-chatrange-picker-hover',
    'data-chatrange-picker-start',
    'data-chatrange-picker-end',
    'data-chatrange-picker-range',
    'data-chatrange-highlighted',
  ];

  for (const attribute of pickerAttributes) {
    const elements = document.querySelectorAll<HTMLElement>(`[${attribute}]`);

    for (const element of elements) {
      element.removeAttribute(attribute);

      element.style.removeProperty('outline');

      element.style.removeProperty('outline-offset');

      element.style.removeProperty('box-shadow');

      element.style.removeProperty('background-color');
    }
  }

  document.documentElement.removeAttribute('data-chatrange-picker-active');
}

function describeElements(elements: Set<HTMLElement>): Array<Record<string, unknown>> {
  return [...elements].map((element) => {
    const rectangle = element.getBoundingClientRect();

    return {
      tag: element.tagName,
      id: element.id || null,
      testId: element.getAttribute('data-testid'),
      dataType: element.getAttribute('data-type'),
      ariaLabel: element.getAttribute('aria-label'),
      width: Math.round(rectangle.width),
      height: Math.round(rectangle.height),
    };
  });
}

export function suppressCaptureUi(): CaptureUiSuppression {
  installSuppressionStyle();
  clearPickerUi();

  const markedElements = new Set<HTMLElement>();

  document.documentElement.setAttribute(CAPTURE_MODE_ATTRIBUTE, 'true');

  suppressMatchingElements(document, markedElements);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const addedNode of mutation.addedNodes) {
        if (addedNode instanceof HTMLElement) {
          suppressMatchingElements(addedNode, markedElements);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  console.info('ChatRange: capture UI suppressed.', {
    captureModeActive: document.documentElement.getAttribute(CAPTURE_MODE_ATTRIBUTE),
    suppressedElementCount: markedElements.size,
    suppressedElements: describeElements(markedElements),
  });

  return {
    suppressedElementCount: markedElements.size,

    restore(): void {
      observer.disconnect();

      const restoredElementCount = markedElements.size;

      document.documentElement.removeAttribute(CAPTURE_MODE_ATTRIBUTE);

      for (const element of markedElements) {
        element.removeAttribute(SUPPRESSED_ATTRIBUTE);
      }

      markedElements.clear();

      console.info('ChatRange: capture UI restored.', {
        captureModeActive: document.documentElement.hasAttribute(CAPTURE_MODE_ATTRIBUTE),
        restoredElementCount,
      });
    },
  };
}

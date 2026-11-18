export type MessageRole = 'user' | 'assistant';

export interface ConversationTurn {
  role: MessageRole;
  element: HTMLElement;

  /**
   * Position among the conversation turns currently mounted in the DOM.
   *
   * This is not guaranteed to be the global conversation index because
   * supported chat sites may virtualize and remount conversation content.
   */
  logicalIndex: number;
}

export interface ChatAdapter {
  readonly id: string;
  readonly displayName: string;

  isSupportedPage(): boolean;

  findConversationTurns(): ConversationTurn[];
}

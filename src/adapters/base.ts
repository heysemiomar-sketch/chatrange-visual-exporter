export interface ChatAdapter {
  isSupportedPage(): boolean;
  findConversationTurns(): HTMLElement[];
}

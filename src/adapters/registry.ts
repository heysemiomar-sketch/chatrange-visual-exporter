import type { ChatAdapter } from './base';

import { chatGptAdapter } from './chatgpt';

import { copilotAdapter } from './copilot';

const ADAPTERS: ChatAdapter[] = [copilotAdapter, chatGptAdapter];

export function findSupportedChatAdapter(): ChatAdapter | null {
  return ADAPTERS.find((adapter) => adapter.isSupportedPage()) ?? null;
}

export function getRegisteredChatAdapters(): readonly ChatAdapter[] {
  return ADAPTERS;
}

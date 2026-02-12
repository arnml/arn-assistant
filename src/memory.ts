export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_MESSAGES = 20;

class ConversationMemory {
  private conversations = new Map<string, Message[]>();

  /** Add a message to a conversation's history. */
  addMessage(jid: string, role: Message['role'], content: string): void {
    if (!this.conversations.has(jid)) {
      this.conversations.set(jid, []);
    }

    const history = this.conversations.get(jid)!;
    history.push({ role, content });

    // FIFO: drop oldest when exceeding max
    while (history.length > MAX_MESSAGES) {
      history.shift();
    }
  }

  /** Get conversation history for a JID (returns empty array if none). */
  getHistory(jid: string): Message[] {
    return this.conversations.get(jid) ?? [];
  }

  /** Clear a specific conversation. */
  clear(jid: string): void {
    this.conversations.delete(jid);
  }

  /** Clear all conversations. */
  clearAll(): void {
    this.conversations.clear();
  }
}

export default ConversationMemory;

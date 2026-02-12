import fs from 'fs';
import path from 'path';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_MESSAGES = 30;
const KEEP_RECENT = 4;          // Messages to keep intact during compaction
const COMPACT_THRESHOLD = 20_000; // Compact if total chars exceed this
const DATA_FILE = path.resolve('data', 'conversations.json');

class ConversationMemory {
  private conversations = new Map<string, Message[]>();

  constructor() {
    this.loadFromDisk();
  }

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

    this.saveToDisk();
  }

  /** Get conversation history for a JID (returns empty array if none). */
  getHistory(jid: string): Message[] {
    return this.conversations.get(jid) ?? [];
  }

  /** Clear a specific conversation. */
  clear(jid: string): void {
    this.conversations.delete(jid);
    this.saveToDisk();
  }

  /** Clear all conversations. */
  clearAll(): void {
    this.conversations.clear();
    this.saveToDisk();
  }

  /** Estimate total character count for a conversation. */
  estimateSize(jid: string): number {
    const history = this.conversations.get(jid);
    if (!history) return 0;
    return history.reduce((sum, m) => sum + m.content.length, 0);
  }

  /** Check if conversation should be compacted. */
  needsCompaction(jid: string): boolean {
    return this.estimateSize(jid) > COMPACT_THRESHOLD;
  }

  /**
   * Compact conversation history: summarize old messages, keep recent ones.
   * No API call — just condenses message text into a summary.
   * Returns true if compaction happened.
   */
  compact(jid: string): boolean {
    const history = this.conversations.get(jid);
    if (!history || history.length <= KEEP_RECENT) return false;

    const oldMessages = history.slice(0, -KEEP_RECENT);
    const recentMessages = history.slice(-KEEP_RECENT);

    // Build a condensed summary of old messages
    const summary = oldMessages
      .map((m) => {
        const prefix = m.role === 'user' ? 'User' : 'Assistant';
        const text = m.content.length > 200
          ? m.content.substring(0, 200) + '...'
          : m.content;
        return `${prefix}: ${text}`;
      })
      .join('\n');

    const compactedMessage: Message = {
      role: 'user',
      content: `[Previous conversation summary]\n${summary}\n[End of summary — continue from here]`,
    };

    // Replace history with compacted summary + recent messages
    this.conversations.set(jid, [compactedMessage, ...recentMessages]);

    const oldSize = oldMessages.reduce((s, m) => s + m.content.length, 0);
    const newSize = compactedMessage.content.length;
    console.log(`[Memory] Compacted ${oldMessages.length} messages: ${oldSize} → ${newSize} chars`);

    this.saveToDisk();
    return true;
  }

  /** Save conversations to disk. */
  private saveToDisk(): void {
    try {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const data: Record<string, Message[]> = {};
      for (const [jid, messages] of this.conversations) {
        data[jid] = messages;
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[Memory] Failed to save:', (err as Error).message);
    }
  }

  /** Load conversations from disk on startup. */
  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(DATA_FILE)) return;

      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw) as Record<string, Message[]>;

      for (const [jid, messages] of Object.entries(data)) {
        this.conversations.set(jid, messages);
      }

      const count = this.conversations.size;
      console.log(`[Memory] Loaded ${count} conversation(s) from disk`);
    } catch (err) {
      console.error('[Memory] Failed to load:', (err as Error).message);
    }
  }
}

export default ConversationMemory;

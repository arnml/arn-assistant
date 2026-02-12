import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '@/memory';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
const SYSTEM_PROMPT = `You are a collaborative research assistant on WhatsApp.
Keep responses concise and conversational — this is a chat app, not an essay.
Use short paragraphs. Avoid markdown formatting since WhatsApp has limited support.
Be technical when appropriate. If you don't know something, say so honestly.`;

class ClaudeClient {
  private client: Anthropic;

  constructor() {
    // Anthropic constructor auto-reads ANTHROPIC_API_KEY from process.env
    this.client = new Anthropic();
  }

  /** Send conversation history to Claude and get a reply. */
  async chat(messages: Message[]): Promise<string> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages,
    });

    const text = response.content[0]?.type === 'text'
      ? response.content[0].text
      : '';

    console.log(`[Claude] ${response.usage.input_tokens} in / ${response.usage.output_tokens} out tokens`);

    return text;
  }
}

export default ClaudeClient;

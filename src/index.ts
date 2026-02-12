import 'dotenv/config';
import WhatsAppClient from '@/whatsapp';
import ClaudeClient from '@/claude';
import ConversationMemory from '@/memory';

const wa = new WhatsAppClient();
const claude = new ClaudeClient();
const memory = new ConversationMemory();

async function handleMessage(jid: string, text: string): Promise<void> {
  try {
    // Store user message
    memory.addMessage(jid, 'user', text);

    // Send conversation history to Claude
    const history = memory.getHistory(jid);
    console.log(`[Main] Sending ${history.length} messages to Claude...`);

    const result = await claude.chat(history);

    // Store assistant reply
    memory.addMessage(jid, 'assistant', result.text);

    // Send screenshots to WhatsApp first (visual context before text)
    for (const screenshot of result.screenshots) {
      await wa.sendImage(jid, screenshot);
    }

    // Send text reply
    if (result.text) {
      await wa.sendMessage(jid, result.text);
    }
  } catch (err) {
    console.error(`[Main] Error:`, (err as Error).message);
    try {
      await wa.sendMessage(jid, 'Sorry, something went wrong. Try again.');
    } catch {
      // If we can't even send the error message, just log it
    }
  }
}

console.log('[Main] Starting WhatsApp AI Assistant...');
await wa.connect(handleMessage);

process.on('SIGINT', () => {
  console.log('\n[Main] Shutting down...');
  process.exit(0);
});

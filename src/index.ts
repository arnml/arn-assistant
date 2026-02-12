import 'dotenv/config';
import WhatsAppClient from '@/whatsapp';
import ClaudeClient from '@/claude';
import ConversationMemory from '@/memory';

const wa = new WhatsAppClient();
const claude = new ClaudeClient();
const memory = new ConversationMemory();

/** Check if an error is a rate limit (429) error. */
function isRateLimitError(err: unknown): boolean {
  const msg = (err as Error).message ?? '';
  return msg.includes('429') || msg.includes('rate_limit');
}

async function handleMessage(jid: string, text: string): Promise<void> {
  try {
    // Store user message
    memory.addMessage(jid, 'user', text);

    // Proactive compaction: if history is getting large, compact before sending
    if (memory.needsCompaction(jid)) {
      console.log(`[Main] History too large (${memory.estimateSize(jid)} chars), compacting...`);
      memory.compact(jid);
    }

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
    // On rate limit: compact history and retry once after a short wait
    if (isRateLimitError(err)) {
      console.log('[Main] Rate limit hit — compacting and retrying...');
      memory.compact(jid);

      try {
        // Wait 10s for rate limit to cool down
        await new Promise((r) => setTimeout(r, 10_000));

        const history = memory.getHistory(jid);
        console.log(`[Main] Retry with ${history.length} messages (${memory.estimateSize(jid)} chars)...`);
        const result = await claude.chat(history);

        memory.addMessage(jid, 'assistant', result.text);
        for (const screenshot of result.screenshots) {
          await wa.sendImage(jid, screenshot);
        }
        if (result.text) {
          await wa.sendMessage(jid, result.text);
        }
        return;
      } catch (retryErr) {
        console.error('[Main] Retry also failed:', (retryErr as Error).message);
      }
    }

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

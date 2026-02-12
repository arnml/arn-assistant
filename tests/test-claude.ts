import 'dotenv/config';
import ClaudeClient from '@/claude';

const claude = new ClaudeClient();

console.log('[Test] Sending test message to Claude...');

const reply = await claude.chat([
  { role: 'user', content: 'What is 2 + 2? Reply in one word.' }
]);

console.log(`[Test] Claude replied: "${reply}"`);

if (reply.length > 0) {
  console.log('[Test] Claude test PASSED');
} else {
  console.error('[Test] Claude test FAILED: empty reply');
  process.exit(1);
}

import 'dotenv/config';
import ClaudeClient from '@/claude';

const claude = new ClaudeClient();

// Test 1: Shell tool (list files)
console.log('[Test] Asking Claude to list files via shell tool...\n');

const result = await claude.chat([
  { role: 'user', content: 'List the files in c:\\code\\assistant\\src using the shell tool. Just show me the file names.' }
]);

console.log(`\n[Result] Text: "${result.text}"`);
console.log(`[Result] Screenshots: ${result.screenshots.length}`);

if (result.text.length > 0) {
  console.log('[Test] Tool loop test PASSED');
} else {
  console.error('[Test] Tool loop test FAILED: empty reply');
  process.exit(1);
}

import 'dotenv/config';
import { executeTool, TOOL_DEFINITIONS } from '@/tools';
import fs from 'fs/promises';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string): void {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.error(`  FAIL: ${name}`);
    failed++;
  }
}

console.log('[Test] Research tools tests\n');

// Test 1: Tool definitions include research tools
console.log('1. Tool definitions');
const toolNames = TOOL_DEFINITIONS.map((t) => t.name);
assert(toolNames.includes('plan'), 'has plan tool');
assert(toolNames.includes('web_search'), 'has web_search tool');
assert(toolNames.includes('read_file'), 'has read_file tool');
assert(toolNames.includes('write_file'), 'has write_file tool');
assert(TOOL_DEFINITIONS.length === 7, `has 7 total tools (got ${TOOL_DEFINITIONS.length})`);

// Test 2: write_file — write to C:\research\test\
console.log('2. write_file');
const writeResult = await executeTool('write_file', {
  path: 'test/test-output.md',
  content: '# Test\nHello from research tools test.',
});
assert(typeof writeResult.content === 'string', 'returns a string');
assert((writeResult.content as string).includes('written'), 'reports file written');
assert((writeResult.content as string).includes('C:\\research\\test\\test-output.md'), 'resolved to C:\\research');

// Test 3: read_file — read back what we wrote
console.log('3. read_file');
const readResult = await executeTool('read_file', { path: 'test/test-output.md' });
assert(typeof readResult.content === 'string', 'returns a string');
assert((readResult.content as string).includes('Hello from research tools test'), 'content matches');

// Test 4: write_file append
console.log('4. write_file append');
const appendResult = await executeTool('write_file', {
  path: 'test/test-output.md',
  content: '\nAppended line.',
  append: true,
});
assert((appendResult.content as string).includes('appended'), 'reports file appended');

const readAfterAppend = await executeTool('read_file', { path: 'test/test-output.md' });
assert((readAfterAppend.content as string).includes('Appended line'), 'appended content is present');
assert((readAfterAppend.content as string).includes('Hello from research tools test'), 'original content preserved');

// Test 5: read_file — nonexistent file
console.log('5. read_file error handling');
const readErr = await executeTool('read_file', { path: 'nonexistent/file.txt' });
assert((readErr.content as string).includes('Error reading file'), 'reports read error');

// Test 6: web_search (requires BRAVE_SEARCH_API_KEY)
console.log('6. web_search');
if (process.env.BRAVE_SEARCH_API_KEY) {
  const searchResult = await executeTool('web_search', { query: 'transformer architecture attention mechanism', count: 3 });
  assert(typeof searchResult.content === 'string', 'returns a string');
  assert((searchResult.content as string).length > 50, 'has substantial content');
  assert(!(searchResult.content as string).includes('Error'), 'no error');
  console.log(`   Search result preview: ${(searchResult.content as string).substring(0, 120)}...`);
} else {
  const noKeyResult = await executeTool('web_search', { query: 'test' });
  assert((noKeyResult.content as string).includes('BRAVE_SEARCH_API_KEY not set'), 'reports missing API key');
  console.log('   (skipped live search — no BRAVE_SEARCH_API_KEY set)');
}

// Cleanup test files
await fs.rm('C:\\research\\test', { recursive: true, force: true });
console.log('   Cleaned up C:\\research\\test');

// Summary
console.log(`\n[Test] Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

import { executeTool, TOOL_DEFINITIONS } from '@/tools';

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

console.log('[Test] Tools module tests\n');

// Test 1: Tool definitions
console.log('1. Tool definitions');
assert(TOOL_DEFINITIONS.length === 7, 'has 7 tool definitions');
assert(TOOL_DEFINITIONS[0].name === 'screenshot', 'first tool is screenshot');
assert(TOOL_DEFINITIONS[1].name === 'shell', 'second tool is shell');
assert(TOOL_DEFINITIONS[2].name === 'open_path', 'third tool is open_path');

// Test 2: Screenshot
console.log('2. Screenshot');
const ssResult = await executeTool('screenshot', {});
assert(ssResult.screenshotBuffer instanceof Buffer, 'returns a Buffer');
assert(ssResult.screenshotBuffer!.length > 0, 'buffer is not empty');
assert(Array.isArray(ssResult.content), 'content is an array (image blocks)');
console.log(`   Screenshot size: ${ssResult.screenshotBuffer!.length} bytes`);

// Test 3: Shell - basic command
console.log('3. Shell - basic command');
const shellResult = await executeTool('shell', { command: 'Get-Date -Format "yyyy-MM-dd"' });
assert(typeof shellResult.content === 'string', 'returns a string');
assert((shellResult.content as string).includes('2026') || (shellResult.content as string).includes('202'), 'output contains year');
console.log(`   Output: ${(shellResult.content as string).trim()}`);

// Test 4: Shell - list directory
console.log('4. Shell - list directory');
const lsResult = await executeTool('shell', { command: 'Get-ChildItem -Name c:\\code\\assistant\\src' });
assert(typeof lsResult.content === 'string', 'returns a string');
assert((lsResult.content as string).includes('index.ts'), 'lists index.ts');
assert((lsResult.content as string).includes('tools.ts'), 'lists tools.ts');

// Test 5: Shell - error handling
console.log('5. Shell - error handling');
const errResult = await executeTool('shell', { command: 'Get-Content nonexistent-file-xyz.txt' });
assert(typeof errResult.content === 'string', 'returns a string on error');
assert((errResult.content as string).toLowerCase().includes('error') || (errResult.content as string).includes('Cannot find'), 'contains error info');

// Test 6: Unknown tool
console.log('6. Unknown tool');
const unknownResult = await executeTool('nonexistent', {});
assert(typeof unknownResult.content === 'string', 'returns a string');
assert((unknownResult.content as string).includes('Unknown tool'), 'reports unknown tool');

// Summary
console.log(`\n[Test] Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

import ConversationMemory from '@/memory';

const memory = new ConversationMemory();
const jid = '1234567890@s.whatsapp.net';
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

console.log('[Test] Memory module tests\n');

// Test 1: Empty history
console.log('1. Empty state');
assert(memory.getHistory(jid).length === 0, 'new JID returns empty array');

// Test 2: Add and retrieve messages
console.log('2. Add messages');
memory.addMessage(jid, 'user', 'Hello');
memory.addMessage(jid, 'assistant', 'Hi there!');
assert(memory.getHistory(jid).length === 2, 'history has 2 messages');
assert(memory.getHistory(jid)[0].role === 'user', 'first message is user');
assert(memory.getHistory(jid)[1].content === 'Hi there!', 'second message content matches');

// Test 3: FIFO eviction at 30 messages
console.log('3. FIFO eviction');
memory.clear(jid);
for (let i = 0; i < 35; i++) {
  memory.addMessage(jid, 'user', `msg-${i}`);
}
assert(memory.getHistory(jid).length === 30, `caps at 30 (got ${memory.getHistory(jid).length})`);
assert(memory.getHistory(jid)[0].content === 'msg-5', 'oldest messages dropped (first is msg-5)');
assert(memory.getHistory(jid)[29].content === 'msg-34', 'newest message is last');

// Test 4: Separate conversations (phone JID + LID JID)
console.log('4. Separate conversations');
const jidA = 'aaa@s.whatsapp.net';
const jidB = 'bbb@lid';
memory.addMessage(jidA, 'user', 'Message A');
memory.addMessage(jidB, 'user', 'Message B');
assert(memory.getHistory(jidA).length === 1, 'JID A has 1 message');
assert(memory.getHistory(jidB).length === 1, 'JID B has 1 message');
assert(memory.getHistory(jidA)[0].content === 'Message A', 'JID A content correct');

// Test 5: Clear single conversation
console.log('5. Clear single');
memory.clear(jidA);
assert(memory.getHistory(jidA).length === 0, 'JID A cleared');
assert(memory.getHistory(jidB).length === 1, 'JID B untouched');

// Test 6: Clear all
console.log('6. Clear all');
memory.clearAll();
assert(memory.getHistory(jid).length === 0, 'all conversations cleared');
assert(memory.getHistory(jidB).length === 0, 'all conversations cleared (B)');

// Summary
console.log(`\n[Test] Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

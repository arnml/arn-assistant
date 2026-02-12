import 'dotenv/config';
import WhatsAppClient from './whatsapp.js';

// === TEMPORARY ECHO MODE - for testing WhatsApp connection ===
// Will be replaced with full orchestrator in Step 5

const wa = new WhatsAppClient();

console.log('[Main] Starting WhatsApp echo test...');
console.log('[Main] Scan the QR code with your phone to connect.');
console.log('[Main] Send a message to test - it will echo back.');
console.log('[Main] Press Ctrl+C to stop.\n');

await wa.connect(async (jid: string, text: string) => {
  console.log(`[Echo] Processing: "${text}" from ${jid}`);
  await wa.sendMessage(jid, `Echo: ${text}`);
});

process.on('SIGINT', () => {
  console.log('\n[Main] Shutting down...');
  process.exit(0);
});

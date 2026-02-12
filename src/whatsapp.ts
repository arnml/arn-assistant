import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
} from '@whiskeysockets/baileys';
import fs from 'fs/promises';
import path from 'path';
import qrcode from 'qrcode-terminal';

const AUTH_DIR = path.resolve('data', 'auth');

// Suppress Baileys' verbose pino JSON logs - only show errors as readable text
const logger = {
  level: 'silent',
  child: () => logger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: (...args: any[]) => console.error('[Baileys]', ...args),
  fatal: (...args: any[]) => console.error('[Baileys]', ...args),
} as any;

// Callback type for incoming messages
type MessageHandler = (jid: string, text: string) => Promise<void>;

class WhatsAppClient {
  private sock: WASocket | null = null;
  private onMessage: MessageHandler | null = null;

  /**
   * Start the WhatsApp connection.
   * Pass a callback that will be called for each incoming text message.
   */
  async connect(onMessage: MessageHandler): Promise<void> {
    this.onMessage = onMessage;
    await this.startSocket();
  }

  /**
   * Create the Baileys socket and register event handlers.
   * Called on initial connect and on reconnect.
   */
  private async startSocket(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    this.sock = makeWASocket({
      auth: state,
      logger,
    });

    // Persist credentials whenever they update (signal protocol sessions)
    this.sock.ev.on('creds.update', saveCreds);

    // Handle connection lifecycle
    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('[WhatsApp] Scan QR code with your phone:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'connecting') {
        console.log('[WhatsApp] Connecting...');
      }

      if (connection === 'open') {
        const botJid = this.sock?.user?.id ?? 'unknown';
        console.log(`[WhatsApp] Connected as ${botJid}`);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(
          `[WhatsApp] Disconnected (code: ${statusCode}).`,
          shouldReconnect ? 'Reconnecting...' : 'Logged out.'
        );

        if (shouldReconnect) {
          this.startSocket();
        } else {
          // Device was unlinked - clear stale auth so next restart gets fresh QR
          await fs.rm(AUTH_DIR, { recursive: true, force: true });
          console.log('[WhatsApp] Auth cleared. Restart to scan a new QR code.');
        }
      }
    });

    // Handle incoming messages
    this.sock.ev.on('messages.upsert', async ({ type, messages }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        await this.handleMessage(msg);
      }
    });
  }

  /**
   * Filter and process a single incoming message.
   */
  private async handleMessage(msg: any): Promise<void> {
    // Skip messages sent by the bot itself
    if (msg.key.fromMe) return;

    // Extract the sender's JID (WhatsApp ID)
    const jid: string | undefined = msg.key.remoteJid;
    if (!jid) return;

    // Skip group messages - only process DMs
    // Accept both @s.whatsapp.net (phone-based) and @lid (linked identity) JIDs
    if (jid.endsWith('@g.us') || jid.endsWith('@broadcast')) return;

    // Filter: only respond to the allowed number (from .env)
    // Note: ALLOWED_NUMBER only works with @s.whatsapp.net JIDs, not @lid
    const allowedNumber = process.env.ALLOWED_NUMBER?.replace('+', '');
    if (allowedNumber && jid.endsWith('@s.whatsapp.net')) {
      const senderNumber = jid.replace('@s.whatsapp.net', '').split(':')[0];
      if (senderNumber !== allowedNumber) {
        console.log(`[WhatsApp] Ignored message from ${senderNumber} (not in ALLOWED_NUMBER)`);
        return;
      }
    }

    // Extract text content (handles plain text and quoted/extended text)
    const text =
      msg.message?.conversation ??
      msg.message?.extendedTextMessage?.text ??
      null;

    if (!text) return; // Silently skip non-text (media, stickers, protocol messages)

    console.log(`[WhatsApp] Message from ${jid}: "${text}"`);

    // Mark message as read (blue check marks)
    await this.sock?.readMessages([msg.key]);

    // Call the message handler
    if (this.onMessage) {
      await this.onMessage(jid, text);
    }
  }

  /**
   * Send a text message to a WhatsApp JID.
   */
  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.sock) {
      console.error('[WhatsApp] Cannot send - not connected');
      return;
    }

    await this.sock.sendMessage(jid, { text });
    const preview = text.length > 80 ? text.substring(0, 80) + '...' : text;
    console.log(`[WhatsApp] Sent to ${jid}: "${preview}"`);
  }

  /**
   * Send an image to a WhatsApp JID.
   */
  async sendImage(jid: string, image: Buffer, caption?: string): Promise<void> {
    if (!this.sock) {
      console.error('[WhatsApp] Cannot send image - not connected');
      return;
    }

    await this.sock.sendMessage(jid, { image, caption });
    console.log(`[WhatsApp] Sent image to ${jid} (${image.length} bytes)`);
  }
}

export default WhatsAppClient;

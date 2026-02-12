# Source Modules

## Data Flow
```
WhatsApp message in
  -> whatsapp.ts filters (DM? authorized? text?)
  -> calls onMessage(jid, text) callback
  -> index.ts orchestrates:
      1. memory.addMessage(jid, 'user', text)
      2. claude.chat(memory.getHistory(jid))
      3. memory.addMessage(jid, 'assistant', reply)
      4. whatsapp.sendMessage(jid, reply)
  -> WhatsApp message out
```

## Module Contracts

### whatsapp.ts
- `WhatsAppClient` class
- `connect(onMessage: (jid: string, text: string) => Promise<void>): Promise<void>`
- `sendMessage(jid: string, text: string): Promise<void>`
- Filters: fromMe=false, DMs only (rejects @g.us and @broadcast), text only
- Accepts both @s.whatsapp.net and @lid JIDs
- ALLOWED_NUMBER filter applies only to @s.whatsapp.net JIDs (LIDs are opaque)

### memory.ts
- `ConversationMemory` class
- `addMessage(jid: string, role: 'user' | 'assistant', content: string): void`
- `getHistory(jid: string): Message[]`
- Max 20 messages per conversation, FIFO eviction

### claude.ts
- `ClaudeClient` class
- `chat(messages: Message[]): Promise<string>`
- Model: claude-haiku-4-5-20251001
- Logs token usage

### index.ts
- Loads dotenv, creates module instances
- Wires onMessage callback: memory -> claude -> reply
- Handles errors, graceful shutdown (Ctrl+C)

## Conventions
- All modules export a default class
- Console logs use `[ModuleName]` prefix: `[WhatsApp]`, `[Claude]`, `[Memory]`, `[Main]`
- Errors propagate to index.ts which handles them
- Custom types go in `src/types/` as `.d.ts` files

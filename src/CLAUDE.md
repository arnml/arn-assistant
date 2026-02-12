# Source Modules

## Data Flow
```
WhatsApp message in
  -> whatsapp.ts filters (DM? authorized? text?) + sends read receipt
  -> calls onMessage(jid, text) callback
  -> index.ts orchestrates:
      1. memory.addMessage(jid, 'user', text)
      2. claude.chat(history) — may loop through tool calls internally
      3. memory.addMessage(jid, 'assistant', result.text)
      4. wa.sendImage(jid, screenshot) for each screenshot
      5. wa.sendMessage(jid, result.text)
  -> WhatsApp message + images out
```

## Module Contracts

### whatsapp.ts
- `WhatsAppClient` class
- `connect(onMessage): Promise<void>`
- `sendMessage(jid, text): Promise<void>`
- `sendImage(jid, image: Buffer, caption?): Promise<void>`
- Sends read receipts (blue checks) on incoming messages
- Filters: fromMe=false, DMs only, text only
- Accepts both @s.whatsapp.net and @lid JIDs

### memory.ts
- `ConversationMemory` class
- `addMessage(jid, role, content): void` / `getHistory(jid): Message[]`
- Max 20 messages per conversation, FIFO eviction
- Stores only final text (tool loop internals are ephemeral)

### claude.ts
- `ClaudeClient` class
- `chat(messages: Message[]): Promise<ChatResult>` — `{ text, screenshots: Buffer[] }`
- Tool use agent loop: calls tools, collects results, max 10 iterations
- Model: claude-haiku-4-5-20251001, max 4096 tokens

### tools.ts
- `TOOL_DEFINITIONS`: tool schemas for Claude API
- `executeTool(name, input): Promise<ToolResult>`
- Tools: `screenshot` (PowerShell + .NET), `shell` (PowerShell), `open_path` (start command)
- Screenshot: DPI-aware, multi-monitor via VirtualScreen

### index.ts
- Loads dotenv, creates module instances
- Wires onMessage: memory -> claude (with tools) -> screenshots -> reply
- Handles errors, graceful shutdown (Ctrl+C)

## Conventions
- All modules export a default class (except tools.ts: named exports)
- Console logs use `[ModuleName]` prefix
- Errors propagate to index.ts which handles them
- Custom types go in `src/types/` as `.d.ts` files

# Source Modules

## Data Flow
```
WhatsApp message in
  -> whatsapp.ts filters (DM? authorized? text?) + sends read receipt
  -> calls onMessage(jid, text) callback
  -> index.ts orchestrates:
      1. memory.addMessage(jid, 'user', text)
      2. proactive compaction if history > 20K chars
      3. claude.chat(history) — agent loop with tools (up to 35 iterations)
      4. memory.addMessage(jid, 'assistant', result.text)
      5. wa.sendImage(jid, screenshot) for each screenshot
      6. wa.sendMessage(jid, result.text)
      on 429: compact history, wait 10s, retry once
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
- `addMessage(jid, role, content)` / `getHistory(jid)` / `clear(jid)` / `clearAll()`
- `compact(jid)`: summarize old messages, keep last 4 intact
- `needsCompaction(jid)` / `estimateSize(jid)`: proactive size checks
- Max 30 messages per conversation, FIFO eviction
- Persists to `data/conversations.json` (auto-load on startup, auto-save on change)
- Stores only final text (tool loop internals are ephemeral)

### claude.ts
- `ClaudeClient` class
- `chat(messages): Promise<ChatResult>` — `{ text, screenshots: Buffer[] }`
- Tool use agent loop: max 35 iterations, passes `ToolContext` to tools
- Model: claude-haiku-4-5-20251001, max 16384 tokens

### tools.ts
- `TOOL_DEFINITIONS`: 7 tool schemas (3 computer + 4 research)
- `executeTool(name, input, context?): Promise<ToolResult>`
- `ToolContext`: `{ anthropicClient, conversationMessages }` — passed to research tools
- Computer tools: `screenshot`, `shell`, `open_path`
- Research tools delegated to research-tools.ts

### research-tools.ts
- `RESEARCH_TOOL_DEFINITIONS`: 4 tool schemas
- `executeResearchTool(name, input, context?): Promise<ToolResult | null>`
- `plan(task)`: escalates to Opus 4.6 for strategic planning (separate API call)
- `web_search(query, count?)`: Brave Search API, env `BRAVE_SEARCH_API_KEY`
- `read_file(path)` / `write_file(path, content, append?)`: paths relative to `C:\research`
- Screenshot: DPI-aware, multi-monitor via VirtualScreen (in tools.ts)

### index.ts
- Loads dotenv, creates module instances
- Wires onMessage: memory -> compaction check -> claude -> screenshots -> reply
- Rate limit (429): compact + wait 10s + retry once
- Handles errors, graceful shutdown (Ctrl+C)

## Conventions
- All modules export a default class (except tools.ts, research-tools.ts: named exports)
- Console logs use `[ModuleName]` prefix
- Errors propagate to index.ts which handles them
- Custom types go in `src/types/` as `.d.ts` files
- Absolute imports: `@/` alias maps to `src/`

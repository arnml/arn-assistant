# WhatsApp AI Assistant

## What is this?
A minimal WhatsApp bot that connects via Baileys (QR code), sends messages to Claude API, and replies on WhatsApp.

## Tech Stack
- **TypeScript** with **tsx** (no build step)
- **pnpm** package manager
- **ESM** (`"type": "module"` - Baileys requires it)
- **@whiskeysockets/baileys** v7 RC - WhatsApp Web protocol
- **@anthropic-ai/sdk** - Claude API client
- **dotenv** - Environment variable loading

## How to Run
```bash
pnpm start          # Start the bot (tsx src/index.ts)
pnpm test:memory    # Run memory module tests
pnpm test:claude    # Run Claude API test
```

## Project Structure
```
src/
  index.ts              - Main entry, wires modules together
  whatsapp.ts           - Baileys connection, message filtering, send/receive
  claude.ts             - Claude API wrapper
  memory.ts             - In-memory conversation history
  types/
    qrcode-terminal.d.ts - Type declarations for qrcode-terminal
tests/                  - Module tests
data/auth/              - WhatsApp session files (gitignored, auto-created)
```

## Environment Variables (.env)
- `ANTHROPIC_API_KEY` - Claude API key
- `ALLOWED_NUMBER` - (optional) Phone number allowed to message the bot (digits only, with country code). If unset, all DMs are accepted.

## Key Discoveries
- Baileys v7 uses **LID (Linked Identity)** JIDs (`number@lid`) alongside phone-based JIDs (`number@s.whatsapp.net`). Both must be accepted for DMs.
- `printQRInTerminal` is deprecated in v7. Use `connection.update` event + `qrcode-terminal` package instead.
- Baileys' pino logger is very verbose. We use a custom silent logger, showing only errors.

## Design Principles
- Module-by-module: each component is independent and testable
- Callback decoupling: whatsapp.ts doesn't know about Claude
- TypeScript strict mode for type safety
- Console logging with `[ModuleName]` prefixes for visibility
- **Absolute imports**: Use `@/` alias for all project imports (maps to `src/`). Example: `import X from '@/memory'`

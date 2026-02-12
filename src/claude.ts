import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '@/memory';
import { TOOL_DEFINITIONS, executeTool, type ToolResult } from '@/tools';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 4096;
const MAX_TOOL_ITERATIONS = 10;

const SYSTEM_PROMPT = `You are an AI assistant on WhatsApp that can control a Windows 11 computer.
Keep responses concise and conversational — this is a chat app, not an essay.
Use short paragraphs. Avoid markdown formatting since WhatsApp has limited support.

You have tools to:
- Take screenshots to see what's on the screen
- Run PowerShell commands (file operations, system info, window management, anything)
- Open files or directories with their default application

When asked to do something on the computer, use your tools. If you need to see the screen first, take a screenshot.
If you don't know something, say so honestly.`;

/** Result from a chat turn — may include text and screenshots. */
export interface ChatResult {
  text: string;
  screenshots: Buffer[];
}

class ClaudeClient {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  /** Send conversation history to Claude, handle tool calls, return final reply. */
  async chat(messages: Message[]): Promise<ChatResult> {
    const screenshots: Buffer[] = [];

    // Convert simple Message[] to Anthropic format for the API
    const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: apiMessages,
        tools: TOOL_DEFINITIONS,
      });

      console.log(
        `[Claude] Step ${i + 1}: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out, stop=${response.stop_reason}`,
      );

      // If Claude is done (no more tool calls), extract text and return
      if (response.stop_reason !== 'tool_use') {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n');

        return { text, screenshots };
      }

      // Claude wants to use tools — add its response to the conversation
      apiMessages.push({ role: 'assistant', content: response.content });

      // Execute each tool call and build results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        console.log(`[Claude] Tool: ${block.name}(${JSON.stringify(block.input)})`);

        const result: ToolResult = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
        );

        // Collect screenshot buffers for WhatsApp
        if (result.screenshotBuffer) {
          screenshots.push(result.screenshotBuffer);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
        });
      }

      // Add tool results as a user message (Claude API requires this format)
      apiMessages.push({ role: 'user', content: toolResults });
    }

    // Safety: hit iteration limit
    console.log('[Claude] WARNING: Hit max tool iterations');
    return {
      text: 'I reached the maximum number of steps for this task.',
      screenshots,
    };
  }
}

export default ClaudeClient;

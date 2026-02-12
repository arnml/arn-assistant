import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '@/memory';
import { TOOL_DEFINITIONS, executeTool, type ToolResult, type ToolContext } from '@/tools';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 16384;
const MAX_TOOL_ITERATIONS = 35;

const SYSTEM_PROMPT = `You are a research assistant on WhatsApp that can search the web, analyze information, and organize findings. You also control a Windows 11 computer.

Keep responses concise and conversational — this is WhatsApp, not an essay. Short paragraphs. Avoid heavy markdown.

YOUR TOOLS:
- web_search: Search the web (Brave API) for papers, articles, information
- read_file / write_file: Read and write files in C:\\research
- plan: Escalate to a stronger model (Opus) for strategic planning or complex analysis
- shell: Run PowerShell commands (system ops, curl, anything)
- screenshot: See what's on screen
- open_path: Open files/directories with default app

WHEN TO USE PLAN:
- Starting a complex multi-step research task
- Synthesizing findings from multiple sources
- When the user explicitly asks you to "plan" or "think carefully"
- When you're unsure how to approach a problem
- Do NOT use plan for simple questions or quick searches

SCREENSHOT USAGE:
- Only use screenshot() when you NEED to see the screen to answer the user's question
- Do NOT screenshot if you're about to use shell or other tools that don't require visual confirmation
- Do NOT screenshot multiple times in one response
- If the user asks "check the opening processes" or similar, then use screenshot
- For most research tasks, use read_file/write_file/shell instead

RESEARCH WORKFLOW:
- Simple questions: search and answer directly
- Complex research: use plan first, then follow it systematically
- Save important findings to C:\\research with clear file names
- Use descriptive folders (e.g., C:\\research\\topic-name\\notes.md)
- Create a README.md in each project folder

Be curious and thorough. When you find something interesting, dig deeper. If stuck, use plan.`;

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
      const toolContext: ToolContext = {
        anthropicClient: this.client,
        conversationMessages: apiMessages,
      };
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        console.log(`[Claude] Tool: ${block.name}(${JSON.stringify(block.input)})`);

        const result: ToolResult = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          toolContext,
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

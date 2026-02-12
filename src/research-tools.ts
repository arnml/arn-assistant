import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import type { ToolResult, ToolContext } from '@/tools';

const RESEARCH_DIR = 'C:\\research';
const OPUS_MODEL = 'claude-opus-4-6-20250527';
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const MAX_FILE_READ_LENGTH = 50_000;
const MAX_SEARCH_RESULTS = 8;

/** Tool definitions for research capabilities. */
export const RESEARCH_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'plan',
    description:
      'Escalate to a stronger reasoning model (Opus) for strategic planning, complex analysis, or important decisions. Use this when starting a complex research task, synthesizing findings from multiple sources, or when the user explicitly asks you to plan. Returns a detailed plan you should follow.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task: {
          type: 'string',
          description:
            'What you need planned or analyzed. Be specific about the research question, what you have found so far, and what decisions you need help with.',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'web_search',
    description:
      'Search the web using Brave Search. Returns titles, URLs, and snippets for top results. Use for finding papers, articles, documentation, and any web research.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query. Use specific academic terms when searching for papers.',
        },
        count: {
          type: 'number',
          description: `Number of results (1-20, default ${MAX_SEARCH_RESULTS}).`,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_file',
    description:
      'Read a file. Paths are relative to C:\\research unless absolute. Use to review research notes, read papers, or check existing work.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'File path (relative to C:\\research, or absolute).',
        },
        max_length: {
          type: 'number',
          description: 'Maximum characters to read (default 50000).',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Write content to a file. Paths are relative to C:\\research unless absolute. Creates directories automatically. Use to save research notes, literature maps, and analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'File path (relative to C:\\research, or absolute).',
        },
        content: {
          type: 'string',
          description: 'The content to write.',
        },
        append: {
          type: 'boolean',
          description: 'If true, append instead of overwrite (default: false).',
        },
      },
      required: ['path', 'content'],
    },
  },
];

/** Resolve a path — relative paths use C:\research as base. */
function resolvePath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(RESEARCH_DIR, filePath);
}

/** Execute a research tool. Returns null if the tool name is not recognized. */
export async function executeResearchTool(
  name: string,
  input: Record<string, unknown>,
  context?: ToolContext,
): Promise<ToolResult | null> {
  switch (name) {
    case 'plan':
      return executePlan(input.task as string, context);
    case 'web_search':
      return executeWebSearch(input.query as string, input.count as number | undefined);
    case 'read_file':
      return executeReadFile(input.path as string, input.max_length as number | undefined);
    case 'write_file':
      return executeWriteFile(input.path as string, input.content as string, input.append as boolean | undefined);
    default:
      return null;
  }
}

/** Escalate to Opus 4.6 for planning. */
async function executePlan(task: string, context?: ToolContext): Promise<ToolResult> {
  if (!context?.anthropicClient) {
    return { content: 'Error: Plan tool requires API client context.' };
  }

  console.log('[Research] Escalating to Opus for planning...');

  const planSystemPrompt = `You are a senior research strategist. A research assistant (Haiku) needs help planning or analyzing something complex.

Review the conversation context and the specific task, then provide a clear, actionable plan.

Be specific about:
- What searches to perform and what terms to use
- What to look for in results
- How to organize findings
- What files to create and their structure in C:\\research
- The order of operations

The assistant has these tools: web_search (Brave API), read_file, write_file (C:\\research), shell (PowerShell), screenshot, open_path.

Give concrete search queries, file names, and structure. No vague advice.`;

  try {
    const planMessages: Anthropic.MessageParam[] = [];

    // Include recent conversation context so Opus knows what's happening
    if (context.conversationMessages?.length) {
      const recent = context.conversationMessages.slice(-20);
      planMessages.push(...recent);
    }

    planMessages.push({
      role: 'user',
      content: `Create a plan for the following task:\n\n${task}`,
    });

    const response = await context.anthropicClient.messages.create({
      model: OPUS_MODEL,
      max_tokens: 4096,
      system: planSystemPrompt,
      messages: planMessages,
    });

    const planText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    console.log(
      `[Research] Opus plan received (${response.usage.input_tokens} in / ${response.usage.output_tokens} out)`,
    );

    return { content: `[OPUS PLAN]\n\n${planText}` };
  } catch (err) {
    const msg = `Plan failed: ${(err as Error).message}`;
    console.error(`[Research] ${msg}`);
    return { content: msg };
  }
}

/** Search the web using Brave Search API. */
async function executeWebSearch(query: string, count?: number): Promise<ToolResult> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    return { content: 'Error: BRAVE_SEARCH_API_KEY not set in environment.' };
  }

  const numResults = Math.min(Math.max(count ?? MAX_SEARCH_RESULTS, 1), 20);
  const url = `${BRAVE_SEARCH_URL}?q=${encodeURIComponent(query)}&count=${numResults}`;

  console.log(`[Research] Web search: "${query}" (${numResults} results)`);

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      return { content: `Search API error: ${response.status} ${response.statusText}` };
    }

    const data = (await response.json()) as {
      web?: { results?: Array<{ title: string; url: string; description: string }> };
    };

    const results = data.web?.results ?? [];
    if (results.length === 0) {
      return { content: `No results found for: "${query}"` };
    }

    const formatted = results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`)
      .join('\n\n');

    console.log(`[Research] Found ${results.length} results`);
    return { content: formatted };
  } catch (err) {
    const msg = `Search failed: ${(err as Error).message}`;
    console.error(`[Research] ${msg}`);
    return { content: msg };
  }
}

/** Read a file from disk. */
async function executeReadFile(filePath: string, maxLength?: number): Promise<ToolResult> {
  const resolved = resolvePath(filePath);
  const limit = maxLength ?? MAX_FILE_READ_LENGTH;

  console.log(`[Research] Reading: ${resolved}`);

  try {
    const content = await fs.readFile(resolved, 'utf-8');

    if (content.length > limit) {
      return {
        content: content.substring(0, limit) + `\n\n...(truncated at ${limit} chars, total ${content.length})`,
      };
    }

    return { content: content || '(empty file)' };
  } catch (err) {
    return { content: `Error reading file: ${(err as Error).message}` };
  }
}

/** Write content to a file, creating directories as needed. */
async function executeWriteFile(filePath: string, content: string, append?: boolean): Promise<ToolResult> {
  const resolved = resolvePath(filePath);

  console.log(`[Research] ${append ? 'Appending to' : 'Writing'}: ${resolved}`);

  try {
    await fs.mkdir(path.dirname(resolved), { recursive: true });

    if (append) {
      await fs.appendFile(resolved, content, 'utf-8');
    } else {
      await fs.writeFile(resolved, content, 'utf-8');
    }

    return { content: `File ${append ? 'appended' : 'written'}: ${resolved} (${content.length} chars)` };
  } catch (err) {
    return { content: `Error writing file: ${(err as Error).message}` };
  }
}

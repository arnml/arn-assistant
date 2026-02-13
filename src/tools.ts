import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import type Anthropic from '@anthropic-ai/sdk';
import { RESEARCH_TOOL_DEFINITIONS, executeResearchTool } from '@/research-tools';
import BrowserClient from '@/browser';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

/** Singleton browser client — lazy-initialized on first browse_url call. */
export const browserClient = new BrowserClient();

// Shell command timeout (30 seconds)
const SHELL_TIMEOUT = 30_000;

// Max output length returned to Claude (avoid blowing up context)
const MAX_OUTPUT_LENGTH = 10_000;

/** Result from executing a tool. */
export interface ToolResult {
  /** Content to send back to Claude as tool_result. String for text, array for images. */
  content: string | Anthropic.ToolResultBlockParam['content'];
  /** If this tool captured a screenshot, the raw PNG buffer (for sending to WhatsApp). */
  screenshotBuffer?: Buffer;
}

/** Context passed to tools that need access to the API client (e.g. plan tool). */
export interface ToolContext {
  anthropicClient: Anthropic;
  conversationMessages: Anthropic.MessageParam[];
}

/** Tool definitions for the Claude API (computer control + research). */
export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'screenshot',
    description:
      'Take a screenshot of the entire Windows screen. Returns the screenshot as an image so you can see what is currently displayed.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'shell',
    description:
      'Run a PowerShell command on the Windows machine and return its output. Use this for file operations, system commands, window management, and anything else PowerShell can do.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'The PowerShell command to execute.',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'open_path',
    description:
      'Open a file or directory using the Windows default application. Directories open in Explorer. Files open with their associated program.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the file or directory to open.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'browse_url',
    description:
      'Navigate to a URL using a real browser (Playwright) and extract the page text content. Use this when you need to read a web page, article, or any URL. Optionally take a screenshot of the page.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to.',
        },
        screenshot: {
          type: 'boolean',
          description: 'Whether to capture a screenshot of the page (default: false).',
        },
      },
      required: ['url'],
    },
  },
  ...RESEARCH_TOOL_DEFINITIONS,
];

/** Execute a tool by name and return the result. */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context?: ToolContext,
): Promise<ToolResult> {
  // Try research tools first (plan, web_search, read_file, write_file)
  const researchResult = await executeResearchTool(name, input, context);
  if (researchResult !== null) return researchResult;

  // Computer control tools
  switch (name) {
    case 'screenshot':
      return takeScreenshot();
    case 'shell':
      return runShell(input.command as string);
    case 'open_path':
      return openPath(input.path as string);
    case 'browse_url':
      return browseUrl(input.url as string, input.screenshot as boolean | undefined);
    default:
      return { content: `Unknown tool: ${name}` };
  }
}

// PowerShell script that captures the entire virtual desktop (all monitors).
// Uses VirtualScreen bounds for multi-monitor + SetProcessDPIAware for 125%/150% scaling.
const SCREENSHOT_PS = `
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class DPI { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }'
[void][DPI]::SetProcessDPIAware()
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap($vs.Width, $vs.Height)
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.CopyFromScreen($vs.Left, $vs.Top, 0, 0, $vs.Size)
$tempFile = Join-Path ([System.IO.Path]::GetTempPath()) 'wa-screenshot.png'
$bitmap.Save($tempFile, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bitmap.Dispose()
Write-Output $tempFile
`.trim();

/** Capture the full screen using PowerShell and return as base64 PNG. */
async function takeScreenshot(): Promise<ToolResult> {
  try {
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', SCREENSHOT_PS],
      { timeout: SHELL_TIMEOUT },
    );

    const tempFile = stdout.trim();
    const buffer = await fs.readFile(tempFile);

    // Clean up temp file (don't await — fire and forget)
    fs.unlink(tempFile).catch(() => {});

    const base64 = buffer.toString('base64');
    console.log(`[Tools] Screenshot captured (${buffer.length} bytes)`);

    return {
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: base64,
          },
        },
      ],
      screenshotBuffer: buffer,
    };
  } catch (err) {
    const msg = `Screenshot failed: ${(err as Error).message}`;
    console.error(`[Tools] ${msg}`);
    return { content: msg };
  }
}

/** Run a PowerShell command and return stdout/stderr. */
async function runShell(command: string): Promise<ToolResult> {
  try {
    console.log(`[Tools] Shell: ${command}`);

    const { stdout, stderr } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { timeout: SHELL_TIMEOUT },
    );

    let output = stdout || stderr || '(no output)';

    // Truncate if too long
    if (output.length > MAX_OUTPUT_LENGTH) {
      output = output.substring(0, MAX_OUTPUT_LENGTH) + '\n...(truncated)';
    }

    console.log(`[Tools] Shell output: ${output.length} chars`);
    return { content: output };
  } catch (err) {
    const error = err as Error & { stderr?: string; code?: number };
    const msg = error.stderr || error.message || 'Command failed';
    console.error(`[Tools] Shell error: ${msg.substring(0, 200)}`);
    return { content: `Error: ${msg}` };
  }
}

/** Open a file or directory with the system default application. */
async function openPath(filePath: string): Promise<ToolResult> {
  try {
    console.log(`[Tools] Opening: ${filePath}`);

    // Check if path exists
    await fs.access(filePath);

    // Use 'start' command on Windows to open with default app
    await execAsync(`start "" "${filePath}"`);

    return { content: `Opened: ${filePath}` };
  } catch (err) {
    const msg = `Failed to open path: ${(err as Error).message}`;
    console.error(`[Tools] ${msg}`);
    return { content: msg };
  }
}

/** Browse a URL with Playwright and return page content + optional screenshot. */
async function browseUrl(url: string, screenshot?: boolean): Promise<ToolResult> {
  try {
    const result = await browserClient.browse(url, screenshot ?? false);

    const header = `Title: ${result.title}\nURL: ${result.url}\n\n`;
    const text = header + result.content;

    if (result.screenshotBuffer) {
      const base64 = result.screenshotBuffer.toString('base64');
      return {
        content: [
          { type: 'text', text },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64,
            },
          },
        ],
        screenshotBuffer: result.screenshotBuffer,
      };
    }

    return { content: text };
  } catch (err) {
    const msg = `Browse failed: ${(err as Error).message}`;
    console.error(`[Tools] ${msg}`);
    return { content: msg };
  }
}

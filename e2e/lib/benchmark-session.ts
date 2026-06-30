/**
 * Deterministic benchmark session generator.
 *
 * Produces a large, diverse, deliberately-messy session (400+ entries) that
 * mirrors the messy mix a real long session accumulates: tool calls with
 * results, thinking blocks, model switches, thinking-level changes,
 * renames/auto-titles, labels, CRLF line endings, unicode, long lines, etc.
 *
 * All entry JSON shapes are sourced from the real fixtures in
 * e2e/fixtures/sessions/ and internal/sessions/session.go.
 */

// ---------------------------------------------------------------------------
// Types (mirrors real shapes — no TypeScript interfaces, just plain objects)
// ---------------------------------------------------------------------------

const BASE_TS = Date.parse("2026-05-10T08:00:00.000Z");

function ts(offsetMs: number): string {
  return new Date(BASE_TS + offsetMs).toISOString();
}

function msgTs(offsetMs: number): number {
  return BASE_TS + offsetMs;
}

let idCounter = 0;
function nextId(): string {
  return `b${String(idCounter++).padStart(8, "0")}`;
}

// ---------------------------------------------------------------------------
// Entry builders — each returns a plain object matching the real JSONL shape
// ---------------------------------------------------------------------------

function sessionHeader(cwd: string): unknown {
  return {
    type: "session",
    version: 3,
    id: "019e0000-0000-7000-8000-benchmark00000",
    timestamp: ts(0),
    cwd,
  };
}

function modelChangeEntry(
  parentId: string | null,
  offsetMs: number,
  provider: string,
  modelId: string,
  implicit = false,
): unknown {
  const entry: Record<string, unknown> = {
    type: "model_change",
    id: nextId(),
    parentId,
    timestamp: ts(offsetMs),
    provider,
    modelId,
  };
  if (implicit) {
    entry.implicit = true;
  }
  return entry;
}

function thinkingLevelChangeEntry(
  parentId: string,
  offsetMs: number,
  level: string,
): unknown {
  return {
    type: "thinking_level_change",
    id: nextId(),
    parentId,
    timestamp: ts(offsetMs),
    thinkingLevel: level,
  };
}

function userMessageEntry(
  parentId: string,
  offsetMs: number,
  text: string,
): unknown {
  return {
    type: "message",
    id: nextId(),
    parentId,
    timestamp: ts(offsetMs),
    message: {
      role: "user",
      content: [{ type: "text", text }],
      timestamp: msgTs(offsetMs),
    },
  };
}

function assistantTextEntry(
  parentId: string,
  offsetMs: number,
  text: string,
): unknown {
  return {
    type: "message",
    id: nextId(),
    parentId,
    timestamp: ts(offsetMs),
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      timestamp: msgTs(offsetMs),
    },
  };
}

/**
 * Assistant message with thinking + toolCall blocks.
 * Shape sourced from demo.jsonl line 6 (first assistant with tool use).
 */
function assistantToolEntry(
  parentId: string,
  offsetMs: number,
  thinkingText: string,
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
  stopReason = "toolUse",
): unknown {
  const content: unknown[] = [
    {
      type: "thinking",
      thinking: thinkingText,
      thinkingSignature: "reasoning_content",
    },
  ];
  for (const call of toolCalls) {
    content.push({ type: "toolCall", ...call });
  }
  return {
    type: "message",
    id: nextId(),
    parentId,
    timestamp: ts(offsetMs),
    message: {
      role: "assistant",
      content,
      api: "openai-completions",
      provider: "deepseek",
      model: "deepseek-v4-pro",
      usage: {
        input: 100,
        output: 200,
        cacheRead: 4096,
        cacheWrite: 0,
        totalTokens: 4396,
        cost: { input: 0.0001, output: 0.0002, cacheRead: 0.00001, cacheWrite: 0, total: 0.00031 },
      },
      stopReason,
      timestamp: msgTs(offsetMs),
      responseId: `bench-resp-${nextId()}`,
    },
  };
}

/**
 * Tool result message. Shape sourced from demo.jsonl line 9 (toolResult for bash).
 */
function toolResultEntry(
  parentId: string,
  offsetMs: number,
  toolCallId: string,
  toolName: string,
  text: string,
  isError = false,
): unknown {
  const entry: Record<string, unknown> = {
    type: "message",
    id: nextId(),
    parentId,
    timestamp: ts(offsetMs),
    message: {
      role: "toolResult",
      toolCallId,
      toolName,
      content: [{ type: "text", text }],
      isError,
      timestamp: msgTs(offsetMs),
    },
  };
  if (isError) {
    (entry.message as Record<string, unknown>).details = {};
  }
  return entry;
}

/**
 * Tool result with diff (for edit tool). Shape from real fixture edit results.
 */
function toolResultWithDiffEntry(
  parentId: string,
  offsetMs: number,
  toolCallId: string,
  toolName: string,
  text: string,
  diff: string,
): unknown {
  return {
    type: "message",
    id: nextId(),
    parentId,
    timestamp: ts(offsetMs),
    message: {
      role: "toolResult",
      toolCallId,
      toolName,
      content: [{ type: "text", text }],
      details: { diff },
      isError: false,
      timestamp: msgTs(offsetMs),
    },
  };
}

/**
 * session_info rename. Shape from internal/sessions/session_test.go line 364.
 */
function sessionInfoRenameEntry(offsetMs: number, name: string): unknown {
  return {
    type: "session_info",
    timestamp: ts(offsetMs),
    name,
  };
}

/**
 * session_info auto-title. Shape from internal/sessions/session.go appendSessionName.
 */
function sessionInfoAutoTitleEntry(offsetMs: number, name: string): unknown {
  return {
    type: "session_info",
    timestamp: ts(offsetMs),
    name,
    autoTitle: true,
  };
}

/**
 * Label entry. Shape from internal/sessions/session.go SetLabel.
 */
function labelEntry(
  parentId: string,
  offsetMs: number,
  targetId: string,
  label: string,
): unknown {
  return {
    type: "label",
    id: nextId(),
    parentId,
    timestamp: ts(offsetMs),
    targetId,
    label,
  };
}

/**
 * Archive entry. Shape from internal/sessions/session.go ArchiveSession.
 */
function archiveEntry(offsetMs: number, archived: boolean): unknown {
  return {
    type: "archive",
    timestamp: ts(offsetMs),
    archived,
  };
}

// ---------------------------------------------------------------------------
// Content templates — deliberately messy
// ---------------------------------------------------------------------------

const CRLF_TEXT = "This line has CRLF endings.\r\nSecond line with CRLF.\r\nThird line.";

const UNICODE_TEXT =
  "Unicode test: 🚀 Hello 世界 مرحبا بالعالم 🎉\nEmoji in code: const emoji = '🔥';\nSpecial chars: <>&\"'";

const LONG_LINE = "x".repeat(2000) + " end";

const CODE_BLOCK = `Here's a long fenced code block:

\`\`\`typescript
// A realistic TypeScript file
import { createComponent } from 'svelte';
import type { Component } from './types';

interface Props {
  title: string;
  count: number;
  enabled?: boolean;
}

export const MyComponent = createComponent<Props>({
  name: 'MyComponent',
  render({ title, count, enabled = true }) {
    if (!enabled) return null;
    return {
      type: 'div',
      props: { class: 'my-component' },
      children: [
        { type: 'h2', children: [title] },
        { type: 'span', children: [\`Count: \${count}\`] },
      ],
    };
  },
});

export default MyComponent;
\`\`\`

That was a code block.`;

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

interface BenchmarkOpts {
  /** Number of conversation turns (user+assistant pairs). Default produces 400+ entries. */
  turnCount?: number;
}

/**
 * Build a benchmark session with 400+ entries.
 *
 * Entry-type distribution (approximate, for turnCount=200):
 * - session header: 1
 * - model_change: 3 (2 explicit + 1 implicit)
 * - thinking_level_change: 1
 * - session_info: 2 (1 rename + 1 auto-title)
 * - label: 1
 * - archive: 1
 * - user messages: ~200
 * - assistant text: ~100
 * - assistant with thinking+tools: ~40
 * - tool results: ~80
 * - Total: ~430
 */
export function buildBenchmarkSession(opts: BenchmarkOpts = {}): unknown[] {
  const { turnCount = 200 } = opts;
  const entries: unknown[] = [];

  // Reset ID counter for determinism
  idCounter = 0;

  const cwd = "/home/user/benchmark-project";

  // ---- Header ----
  entries.push(sessionHeader(cwd));

  // ---- Model + thinking setup ----
  let offsetMs = 100;
  const modelId1 = nextId();
  const model1Entry = modelChangeEntry(null, offsetMs, "anthropic", "claude-opus-4-7");
  entries.push(model1Entry);
  offsetMs += 100;

  const thinkLevelId = nextId();
  const thinkLevelEntry = thinkingLevelChangeEntry(
    (model1Entry as Record<string, unknown>).id as string,
    offsetMs,
    "medium",
  );
  entries.push(thinkLevelEntry);
  offsetMs += 100;

  let parentId = (thinkLevelEntry as Record<string, unknown>).id as string;

  // ---- Earliest marker ----
  const earliestUserEntry = userMessageEntry(
    parentId,
    offsetMs,
    "BENCH_EARLIEST_MARKER: Start of benchmark session. Let's build something interesting.",
  );
  entries.push(earliestUserEntry);
  offsetMs += 2000;
  parentId = (earliestUserEntry as Record<string, unknown>).id as string;

  const earliestReply = assistantTextEntry(
    parentId,
    offsetMs,
    "BENCH_EARLIEST_MARKER_REPLY: I'm ready! Let's get started on this benchmark session.",
  );
  entries.push(earliestReply);
  offsetMs += 2000;
  parentId = (earliestReply as Record<string, unknown>).id as string;

  // ---- Main conversation loop ----
  let toolCallCounter = 0;
  let labelTargetId = ""; // will capture a message id for the label entry

  for (let turn = 0; turn < turnCount; turn++) {
    // ---- User message ----
    let userText: string;
    const turnCategory = turn % 20;

    if (turnCategory === 0) {
      // CRLF test
      userText = CRLF_TEXT;
    } else if (turnCategory === 1) {
      // Unicode test
      userText = UNICODE_TEXT;
    } else if (turnCategory === 2) {
      // Long line test
      userText = `Here's a very long line: ${LONG_LINE}`;
    } else if (turnCategory === 3) {
      // Code block request
      userText = CODE_BLOCK;
    } else if (turnCategory === 4) {
      // Request that triggers tool use
      userText = `Turn ${turn}: Please read the file src/index.ts and check if it exists.`;
    } else if (turnCategory === 5) {
      // Request that triggers bash
      userText = `Turn ${turn}: Run \`ls -la\` to see what files are in the current directory.`;
    } else if (turnCategory === 6) {
      // Request that triggers edit
      userText = `Turn ${turn}: Edit the file config.json to change the port from 3000 to 8080.`;
    } else if (turnCategory === 7) {
      // Request that triggers write
      userText = `Turn ${turn}: Write a new file README.md with a project description.`;
    } else {
      // Normal conversation
      userText = `Turn ${turn}: This is a regular conversation turn. Can you help me with something?`;
    }

    const userEntry = userMessageEntry(parentId, offsetMs, userText);
    entries.push(userEntry);
    offsetMs += 1000;
    const userId = (userEntry as Record<string, unknown>).id as string;
    parentId = userId;

    // Remember a target for the label
    if (!labelTargetId && turn === 10) {
      labelTargetId = userId;
    }

    // ---- Assistant response ----
    const isToolTurn = turnCategory >= 4 && turnCategory <= 7;
    const hasThinking = turn % 3 === 0; // ~1/3 of turns have thinking

    if (isToolTurn) {
      // ---- Tool use turn ----
      toolCallCounter++;
      const callId = `call_bench_${String(toolCallCounter).padStart(4, "0")}`;
      let toolName: string;
      let toolArgs: Record<string, unknown>;
      let resultText: string;
      let useDiff = false;
      let diffText = "";

      switch (turnCategory) {
        case 4:
          toolName = "read";
          toolArgs = { path: "/home/user/benchmark-project/src/index.ts", offset: 1, limit: 50 };
          resultText = `// index.ts\nexport const main = () => {\n  console.log("Hello");\n};\n`;
          break;
        case 5:
          toolName = "bash";
          toolArgs = { command: "ls -la" };
          resultText = `total 128\ndrwxr-xr-x  5 user  4096 May 10 08:00 .\ndrwxr-xr-x 10 user  4096 May 10 07:55 ..\n-rw-r--r--  1 user   220 May 10 08:00 .gitignore\n-rw-r--r--  1 user  1013 May 10 08:00 LICENSE\n-rw-r--r--  1 user   672 May 10 08:00 README.md\ndrwxr-xr-x  8 user  4096 May 10 08:00 node_modules\n-rw-r--r--  1 user  1234 May 10 08:00 package.json\ndrwxr-xr-x  4 user  4096 May 10 08:00 src\n`;
          break;
        case 6:
          toolName = "edit";
          toolArgs = {
            path: "/home/user/benchmark-project/config.json",
            edits: [
              {
                oldText: '"port": 3000',
                newText: '"port": 8080',
              },
            ],
          };
          resultText = "File edited successfully.";
          useDiff = true;
          diffText = `--- config.json\n+++ config.json\n@@ -1,4 +1,4 @@\n {\n-  "port": 3000,\n+  "port": 8080,\n   "host": "localhost"\n }\n`;
          break;
        case 7:
          toolName = "write";
          toolArgs = {
            path: "/home/user/benchmark-project/README.md",
            content: "# Benchmark Project\n\nThis is a benchmark project for testing.\n",
          };
          resultText = "File written successfully.";
          break;
        default:
          toolName = "bash";
          toolArgs = { command: "echo done" };
          resultText = "done\n";
      }

      const thinkingContent = hasThinking
        ? `Thinking about turn ${turn}. I need to use the ${toolName} tool to help the user. BENCH_THINKING_MARKER turn ${turn}.`
        : `Brief thought about turn ${turn}.`;

      const toolEntry = assistantToolEntry(
        parentId,
        offsetMs,
        thinkingContent,
        [{ id: callId, name: toolName, arguments: toolArgs }],
        "toolUse",
      );
      entries.push(toolEntry);
      offsetMs += 500;
      const toolEntryId = (toolEntry as Record<string, unknown>).id as string;
      parentId = toolEntryId;

      // Tool result
      let resultEntry: unknown;
      if (useDiff) {
        resultEntry = toolResultWithDiffEntry(
          parentId,
          offsetMs,
          callId,
          toolName,
          resultText,
          diffText,
        );
      } else {
        resultEntry = toolResultEntry(parentId, offsetMs, callId, toolName, resultText);
      }
      entries.push(resultEntry);
      offsetMs += 500;
      parentId = (resultEntry as Record<string, unknown>).id as string;

      // Follow-up assistant text after tool result
      const followUp = assistantTextEntry(
        parentId,
        offsetMs,
        `I used the ${toolName} toolBENCH_TOOLCALL_MARKER. The result was: ${resultText.substring(0, 100)}.`,
      );
      entries.push(followUp);
      offsetMs += 2000;
      parentId = (followUp as Record<string, unknown>).id as string;
    } else if (hasThinking) {
      // ---- Thinking + text turn (no tools) ----
      const thinkingOnlyEntry = assistantToolEntry(
        parentId,
        offsetMs,
        `BENCH_THINKING_MARKER: Deep reasoning for turn ${turn}. Let me think through this carefully before responding to the user.`,
        [],
        "endTurn",
      );
      entries.push(thinkingOnlyEntry);
      offsetMs += 500;
      parentId = (thinkingOnlyEntry as Record<string, unknown>).id as string;

      const reply = assistantTextEntry(
        parentId,
        offsetMs,
        `After thinking through turn ${turn}, here's my response. I've considered the implications carefully.`,
      );
      entries.push(reply);
      offsetMs += 2000;
      parentId = (reply as Record<string, unknown>).id as string;
    } else {
      // ---- Plain text reply ----
      const reply = assistantTextEntry(
        parentId,
        offsetMs,
        `Response for turn ${turn}. This is a straightforward text response without tools or extended thinking.`,
      );
      entries.push(reply);
      offsetMs += 2000;
      parentId = (reply as Record<string, unknown>).id as string;
    }
  }

  // ---- Model change #2 (mid-session switch) ----
  const model2Entry = modelChangeEntry(parentId, offsetMs, "deepseek", "deepseek-v4-pro");
  entries.push(model2Entry);
  offsetMs += 200;
  parentId = (model2Entry as Record<string, unknown>).id as string;

  // ---- Thinking level change ----
  const thinkLevel2Entry = thinkingLevelChangeEntry(parentId, offsetMs, "high");
  entries.push(thinkLevel2Entry);
  offsetMs += 200;
  parentId = (thinkLevel2Entry as Record<string, unknown>).id as string;

  // ---- Model change #3 (implicit) ----
  const model3Entry = modelChangeEntry(parentId, offsetMs, "anthropic", "claude-sonnet-4-20250514", true);
  entries.push(model3Entry);
  offsetMs += 200;
  parentId = (model3Entry as Record<string, unknown>).id as string;

  // ---- session_info rename ----
  entries.push(sessionInfoRenameEntry(offsetMs, "Benchmark Session - Renamed"));
  offsetMs += 200;

  // ---- session_info auto-title ----
  entries.push(sessionInfoAutoTitleEntry(offsetMs, "Benchmark Session - Auto-titled"));
  offsetMs += 200;

  // ---- Label entry ----
  entries.push(labelEntry(parentId, offsetMs, labelTargetId, "Important"));
  offsetMs += 200;

  // ---- Archive entry ----
  entries.push(archiveEntry(offsetMs, false));
  offsetMs += 200;

  // ---- Final turns with latest marker ----
  const finalUser = userMessageEntry(
    parentId,
    offsetMs,
    "BENCH_LATEST_MARKER: This is the final user message in the benchmark session.",
  );
  entries.push(finalUser);
  offsetMs += 2000;
  parentId = (finalUser as Record<string, unknown>).id as string;

  const finalReply = assistantTextEntry(
    parentId,
    offsetMs,
    "BENCH_LATEST_MARKER_REPLY: This is the final assistant response. Benchmark session complete!",
  );
  entries.push(finalReply);

  return entries;
}

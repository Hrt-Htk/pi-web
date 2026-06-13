import { test, expect, isMobileLayout, collapseScratchpad } from '../lib/test';
import { buildSession, realWorkingDir, uniqueSessionName, writeSession } from '../lib/sessions';

// Issue #13: a long tool output cycles through three states on click —
// collapsed (1 line) -> preview (N lines) -> expanded (full) -> collapsed.
// The bash tool path renders the plain ToolOutput with maxLines=5, so a
// 12-line result is expandable and the three states have distinct heights.

function h(box: { height: number } | null): number {
  return box ? Math.round(box.height) : 0;
}

async function openToolOutput(page: any, sessionsDir: string, testInfo: any) {
  const cwd = realWorkingDir();
  const { entries, lastId } = buildSession({ cwd });
  const lines = Array.from({ length: 12 }, (_, i) => `output line ${i + 1}`).join('\n');
  const callId = 'tc-issue13';
  const toolMsgId = 'e2e-toolcall-issue13';
  const resultMsgId = 'e2e-toolresult-issue13';
  entries.push({
    type: 'message',
    id: toolMsgId,
    parentId: lastId,
    timestamp: new Date().toISOString(),
    message: {
      role: 'assistant',
      content: [{ type: 'toolCall', id: callId, name: 'bash', arguments: { command: 'seq 1 12' } }],
      stopReason: 'toolUse',
      timestamp: Date.now(),
    },
  });
  entries.push({
    type: 'message',
    id: resultMsgId,
    parentId: toolMsgId,
    timestamp: new Date().toISOString(),
    message: {
      role: 'toolResult',
      toolCallId: callId,
      toolName: 'bash',
      content: [{ type: 'text', text: lines }],
      isError: false,
      timestamp: Date.now(),
    },
  });
  const name = uniqueSessionName(testInfo, 'tool13');
  const id = writeSession(sessionsDir, name, entries);
  await collapseScratchpad(page);
  await page.goto(`/session?id=${encodeURIComponent(id)}`);
  await expect(page.locator('#pi-chat-composer')).toHaveAttribute('data-chat-available', 'true');
  // Tool calls now render inside a collapsed <details class="actions-group">
  // (PR #28). Expand it so the nested tool output is visible.
  await page.locator('.actions-group > summary').first().click();
  return page.locator('.tool-output.expandable');
}

test.describe('tri-state tool output (issue #13)', () => {
  test('cycles collapsed -> preview -> expanded -> collapsed', async ({ page, sessionsDir }, testInfo) => {
    const output = await openToolOutput(page, sessionsDir, testInfo);
    await expect(output).toBeVisible();
    const mobile = await isMobileLayout(page);
    const tag = mobile ? 'mobile' : 'desktop';
    const shot = (n: string) => output.screenshot({ path: `.shots/issue13-${tag}-${n}.png` });

    // Collapsed (default): 1 line.
    await expect(output).toHaveAttribute('data-state', 'collapsed');
    const collapsedH = h(await output.boundingBox());
    await shot('1-collapsed');

    // Click -> preview (N lines), taller than collapsed.
    await output.click();
    await expect(output).toHaveAttribute('data-state', 'preview');
    const previewH = h(await output.boundingBox());
    await shot('2-preview');
    expect(previewH).toBeGreaterThan(collapsedH);

    // Click -> expanded (full), taller than preview.
    await output.click();
    await expect(output).toHaveAttribute('data-state', 'expanded');
    const expandedH = h(await output.boundingBox());
    await shot('3-expanded');
    expect(expandedH).toBeGreaterThan(previewH);

    // Click -> back to collapsed (1 line again).
    await output.click();
    await expect(output).toHaveAttribute('data-state', 'collapsed');
    expect(h(await output.boundingBox())).toBeLessThanOrEqual(collapsedH + 2);
  });
});

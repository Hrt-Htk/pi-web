import { test, expect, isMobileLayout, collapseScratchpad } from '../lib/test';
import { buildSession, realWorkingDir, uniqueSessionName, writeSession } from '../lib/sessions';

// Issue #70: inline tool-call groups are replaced by compact action chips that
// open a bottom-sheet overlay. Each chip groups a thinking block + its tools,
// shows a verb summary (and a diffstat for edits), and a status indicator.
// The overlay shows full tool output (scrollable) and can be dragged to resize.

function buildChipSession(cwd: string) {
  const { entries, lastId } = buildSession({ cwd });
  const a1 = 'e2e-i70-a1';
  entries.push({
    type: 'message',
    id: a1,
    parentId: lastId,
    timestamp: new Date().toISOString(),
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Read the file, then apply the edit and run a check.' },
        { type: 'toolCall', id: 'i70-c1', name: 'read', arguments: { file_path: 'web/src/Composer.svelte' } },
        { type: 'toolCall', id: 'i70-c2', name: 'edit', arguments: { file_path: 'web/src/Composer.svelte' } },
        { type: 'toolCall', id: 'i70-c3', name: 'bash', arguments: { command: 'seq 1 30' } },
      ],
      stopReason: 'toolUse',
      timestamp: Date.now(),
    },
  });
  entries.push({
    type: 'message', id: 'i70-r1', parentId: a1, timestamp: new Date().toISOString(),
    message: { role: 'toolResult', toolCallId: 'i70-c1', toolName: 'read', content: [{ type: 'text', text: '45 lines' }], isError: false, timestamp: Date.now() },
  });
  const diff = ['--- a', '+++ b', '@@', '-old one', '-old two', '+new one', '+new two', '+new three'].join('\n');
  entries.push({
    type: 'message', id: 'i70-r2', parentId: 'i70-r1', timestamp: new Date().toISOString(),
    message: { role: 'toolResult', toolCallId: 'i70-c2', toolName: 'edit', content: [{ type: 'text', text: 'edited' }], details: { diff }, isError: false, timestamp: Date.now() },
  });
  const longOut = Array.from({ length: 30 }, (_, i) => `output line ${i + 1}`).join('\n');
  entries.push({
    type: 'message', id: 'i70-r3', parentId: 'i70-r2', timestamp: new Date().toISOString(),
    message: { role: 'toolResult', toolCallId: 'i70-c3', toolName: 'bash', content: [{ type: 'text', text: longOut }], isError: false, timestamp: Date.now() },
  });
  const a2 = 'e2e-i70-a2';
  entries.push({
    type: 'message', id: a2, parentId: 'i70-r3', timestamp: new Date().toISOString(),
    message: { role: 'assistant', content: [{ type: 'text', text: 'Done — alignment fixed.' }], timestamp: Date.now() },
  });
  return entries;
}

test.describe('action chips + bottom-sheet overlay (issue #70)', () => {
  test('chip summarizes the group with a diffstat and opens a full-output overlay', async ({ page, sessionsDir }, testInfo) => {
    const id = writeSession(sessionsDir, uniqueSessionName(testInfo, 'i70'), buildChipSession(realWorkingDir()));
    await collapseScratchpad(page);
    await page.goto(`/session?id=${encodeURIComponent(id)}`);

    const chip = page.locator('.tool-chip').first();
    await chip.waitFor();
    // Verb summary aggregates the group; edit contributes a colored diffstat.
    await expect(chip.locator('.tool-chip-label')).toContainText('Edited 1 file');
    await expect(chip.locator('.diff-stat-added')).toHaveText('+3');
    await expect(chip.locator('.diff-stat-removed')).toHaveText('-2');

    const tag = (await isMobileLayout(page)) ? 'mobile' : 'desktop';
    await page.screenshot({ path: `.shots/issue70-${tag}-chatview.png` });

    // Tapping the chip opens the overlay.
    await chip.click();
    const sheet = page.locator('.tool-sheet');
    await sheet.waitFor();
    await expect(page.locator('.tool-sheet-row')).toHaveCount(4); // thinking + 3 tools

    // Expand the bash row: full output shows immediately (no tri-state cycling).
    const bashRow = page.locator('.tool-sheet-row').last();
    await bashRow.locator('.tool-sheet-row-summary').click();
    await expect(bashRow).toHaveAttribute('open', '');
    const output = bashRow.locator('.tool-output');
    await expect(output).toBeVisible();
    await expect(output).not.toHaveClass(/expandable/); // full mode, not click-to-cycle
    await expect(output).toContainText('output line 30');
    await page.screenshot({ path: `.shots/issue70-${tag}-overlay.png` });
  });

  test('the sheet can be dragged up from anywhere to cover more screen', async ({ page, sessionsDir }, testInfo) => {
    const id = writeSession(sessionsDir, uniqueSessionName(testInfo, 'i70drag'), buildChipSession(realWorkingDir()));
    await collapseScratchpad(page);
    await page.goto(`/session?id=${encodeURIComponent(id)}`);
    await page.locator('.tool-chip').first().click();
    const sheet = page.locator('.tool-sheet');
    await sheet.waitFor();
    await page.waitForTimeout(350);
    const before = (await sheet.boundingBox())!.height;

    // Drag from the title area (not the small handle) — drag works from anywhere.
    const title = page.locator('.tool-sheet-title');
    const tb = (await title.boundingBox())!;
    await page.mouse.move(tb.x + 20, tb.y + tb.height / 2);
    await page.mouse.down();
    await page.mouse.move(tb.x + 20, tb.y - 220, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const after = (await sheet.boundingBox())!.height;
    expect(after).toBeGreaterThan(before + 100);

    // A plain tap (no movement) still toggles a row.
    const row = page.locator('.tool-sheet-row').nth(1);
    await row.locator('.tool-sheet-row-summary').click();
    await expect(row).toHaveAttribute('open', '');
  });
});

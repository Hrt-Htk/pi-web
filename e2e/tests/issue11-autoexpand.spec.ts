import { test, expect, isMobileLayout, collapseScratchpad } from '../lib/test';
import { buildSession, realWorkingDir, uniqueSessionName, writeSession } from '../lib/sessions';

// Issue #11: composer starts ~1 line, grows as the user types (capped ~200px),
// exposes a manual collapse chevron once grown, collapses back to 1 line on
// chevron click and on blur-when-empty. Legacy `.expanded` full-height mode
// must still work.

async function openComposer(page: any, sessionsDir: string, testInfo: any) {
  const cwd = realWorkingDir();
  const { entries } = buildSession({ cwd });
  const name = uniqueSessionName(testInfo, 'auto');
  const id = writeSession(sessionsDir, name, entries);
  await collapseScratchpad(page);
  await page.goto(`/session?id=${encodeURIComponent(id)}`);
  const composer = page.locator('#pi-chat-composer');
  await expect(composer).toHaveAttribute('data-chat-available', 'true');
  return page.locator('#pi-chat-message');
}

function h(box: { height: number } | null): number {
  return box ? Math.round(box.height) : 0;
}

test.describe('auto-expanding composer (issue #11)', () => {
  test('grows, collapses via chevron and blur', async ({ page, sessionsDir }, testInfo) => {
    const textarea = await openComposer(page, sessionsDir, testInfo);
    await expect(textarea).toBeVisible();
    const collapse = page.locator('#pi-chat-collapse-input');
    const mobile = await isMobileLayout(page);
    const tag = mobile ? 'mobile' : 'desktop';
    const shot = (n: string) => page.locator('#pi-chat-composer').screenshot({ path: `.shots/${tag}-${n}.png` });

    // Empty: ~1 line.
    const emptyH = h(await textarea.boundingBox());
    await shot('1-empty');
    expect(emptyH).toBeLessThanOrEqual(56);
    await expect(collapse).toBeHidden(); // chevron hidden on empty single-line input

    // Grows with multi-line content.
    await textarea.click();
    await textarea.fill('line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8');
    const grownH = h(await textarea.boundingBox());
    await shot('2-grown');
    expect(grownH).toBeGreaterThan(emptyH + 20);
    expect(grownH).toBeLessThanOrEqual(210);

    // Collapse chevron visible once grown; click collapses while keeping text.
    await expect(collapse).toBeVisible();
    await collapse.click();
    const collapsedH = h(await textarea.boundingBox());
    await shot('3-collapsed');
    expect(collapsedH).toBeLessThanOrEqual(emptyH + 4);
    expect(await textarea.inputValue()).toContain('line 8');

    // Clearing + blur keeps it at single line.
    await textarea.fill('');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await expect.poll(async () => h(await textarea.boundingBox())).toBeLessThanOrEqual(emptyH + 4);
  });

  test('legacy expand mode still works', async ({ page, sessionsDir }, testInfo) => {
    const textarea = await openComposer(page, sessionsDir, testInfo);
    await expect(textarea).toBeVisible();
    const mobile = await isMobileLayout(page);
    const tag = mobile ? 'mobile' : 'desktop';
    const before = h(await textarea.boundingBox());
    await page.locator('#pi-chat-expand').click();
    await expect(page.locator('.pi-chat-shell')).toHaveClass(/expanded/);
    await page.locator('#pi-chat-composer').screenshot({ path: `.shots/${tag}-4-expanded.png` });
    const expanded = h(await textarea.boundingBox());
    expect(expanded).toBeGreaterThan(before + 100);
  });
});

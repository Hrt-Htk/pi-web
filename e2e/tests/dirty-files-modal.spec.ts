import { test, expect, isMobileLayout, collapseScratchpad } from '../lib/test';
import { buildSession, uniqueSessionName, writeSession } from '../lib/sessions';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The pi-web repo itself is a git repo; while developing it has a dirty working
// tree. Pointing a session's cwd at the repo root makes the real /api/git/info
// report dirty and /api/git/dirty-files return the actual changed files, so this
// exercises the GitFooter -> DirtyFilesModal flow against the real server with no
// stubbing.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test.describe('git dirty-files modal', () => {
  test('clicking the dirty branch opens a modal listing changed files', async ({
    page,
    sessionsDir,
  }, testInfo) => {
    const { entries } = buildSession({ cwd: REPO_ROOT });
    const name = uniqueSessionName(testInfo, 'dirty');
    const id = writeSession(sessionsDir, name, entries);
    await collapseScratchpad(page);
    await page.goto(`/session?id=${encodeURIComponent(id)}`);

    const branch = page.locator('#pi-git-branch');
    await expect(branch).toBeVisible();
    // Real dirty working tree -> the dirty badge is shown.
    await expect(page.locator('.pi-git-status-modified')).toBeVisible();

    const mobile = await isMobileLayout(page);
    const tag = mobile ? 'mobile' : 'desktop';
    await page.locator('#pi-git-bar').screenshot({ path: `.shots/git-${tag}-footer.png` });

    await branch.click();

    const panel = page.locator('.pi-sheet-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Changed files');
    // At least one real changed file is listed (this spec file is itself dirty).
    await expect(panel.locator('.dirty-files-item').first()).toBeVisible();
    await panel.screenshot({ path: `.shots/git-${tag}-modal.png` });

    // The list scrolls (content overflows and scrollTop can move) rather than clipping.
    const scroll = page.locator('.dirty-files-content');
    const moved = await scroll.evaluate((el) => {
      el.scrollTop = 9999;
      return el.scrollTop > 0 && el.scrollHeight > el.clientHeight + 1;
    });
    expect(moved).toBe(true);
    // At least one status group header is shown.
    await expect(panel.locator('.dirty-files-group-title').first()).toBeVisible();

    // Escape closes the sheet.
    await page.keyboard.press('Escape');
    await expect(page.locator('.pi-sheet-panel')).toHaveCount(0);
  });
});

import { test, expect, isMobileLayout, collapseScratchpad } from '../lib/test';
import { buildSession, uniqueSessionName, writeSession } from '../lib/sessions';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Build a throwaway git repo with a deterministic dirty state so the footer
// badges, status groups and scroll behaviour are reproducible on any machine
// (a clean CI checkout has no dirty files, so we cannot rely on the repo root).
// 30 modified + 2 new + 1 deleted: enough rows to overflow the modal and to
// populate all three status groups.
function createDirtyRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pi-web-dirty-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: dir,
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
    });
  git('init', '-q');
  mkdirSync(join(dir, 'src'), { recursive: true });
  for (let i = 0; i < 30; i++) writeFileSync(join(dir, 'src', `mod${i}.txt`), 'orig\n');
  writeFileSync(join(dir, 'gone.txt'), 'bye\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  // Dirty it: modify all 30 tracked files, delete one, add two untracked.
  for (let i = 0; i < 30; i++) writeFileSync(join(dir, 'src', `mod${i}.txt`), 'changed\n');
  rmSync(join(dir, 'gone.txt'));
  writeFileSync(join(dir, 'new1.txt'), 'n\n');
  writeFileSync(join(dir, 'new2.txt'), 'n\n');
  return dir;
}

test.describe('git dirty-files modal', () => {
  test('clicking the dirty branch opens a modal listing changed files', async ({
    page,
    sessionsDir,
  }, testInfo) => {
    const repo = createDirtyRepo();
    try {
      const { entries } = buildSession({ cwd: repo });
      const name = uniqueSessionName(testInfo, 'dirty');
      const id = writeSession(sessionsDir, name, entries);
      await collapseScratchpad(page);
      await page.goto(`/session?id=${encodeURIComponent(id)}`);

      const branch = page.locator('#pi-git-branch');
      await expect(branch).toBeVisible();
      // Modified working-tree files -> the modified badge is shown.
      await expect(page.locator('.pi-git-status-modified')).toBeVisible();

      const mobile = await isMobileLayout(page);
      const tag = mobile ? 'mobile' : 'desktop';
      await page.locator('#pi-git-bar').screenshot({ path: `.shots/git-${tag}-footer.png` });

      await branch.click();

      const panel = page.locator('.pi-sheet-panel');
      await expect(panel).toBeVisible();
      await expect(panel).toContainText('Changed files');
      await expect(panel.locator('.dirty-files-item').first()).toBeVisible();
      // All three status groups are present (modified / new / deleted).
      await expect(panel.locator('.dirty-files-group-title')).toHaveCount(3);
      await panel.screenshot({ path: `.shots/git-${tag}-modal.png` });

      // The list scrolls (content overflows and scrollTop can move) rather than clipping.
      const scroll = page.locator('.dirty-files-content');
      const moved = await scroll.evaluate((el) => {
        el.scrollTop = 9999;
        return el.scrollTop > 0 && el.scrollHeight > el.clientHeight + 1;
      });
      expect(moved).toBe(true);

      // Escape closes the sheet.
      await page.keyboard.press('Escape');
      await expect(page.locator('.pi-sheet-panel')).toHaveCount(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

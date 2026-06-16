import { test, expect, isMobileLayout } from '../lib/test';
import { buildSession, uniqueSessionName, writeSession } from '../lib/sessions';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function createDirtyRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pi-web-git-'));
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
  for (let i = 0; i < 30; i++) writeFileSync(join(dir, 'src', `mod${i}.txt`), 'changed\n');
  rmSync(join(dir, 'gone.txt'));
  writeFileSync(join(dir, 'new1.txt'), 'n\n');
  writeFileSync(join(dir, 'new2.txt'), 'n\n');
  return dir;
}

test.describe('git status in project header', () => {
  test('shows branch and dirty badges in project group header', async ({ page, sessionsDir }, testInfo) => {
    const repo = createDirtyRepo();
    try {
      const { entries } = buildSession({ cwd: repo });
      const name = uniqueSessionName(testInfo, 'git-header');
      const id = writeSession(sessionsDir, name, entries);

      await page.goto('/');

      // Switch to projects layout (default is timeline which has no project groups)
      await page.click('[data-layout-btn="projects"]');

      // Wait for project groups to render
      await page.waitForSelector('[data-project]', { timeout: 10000 });

      // Find the project group for our repo (path may differ in case)
      const repoShort = repo.split(/[\\/]/).pop()!; // e.g. "pi-web-git-SQSkMu"
      const projectGroup = page.locator('[data-project]', { hasText: new RegExp(repoShort, 'i') });
      await expect(projectGroup.first()).toBeVisible();

      // Wait for git badges to load (fetched asynchronously per project)
      await projectGroup.locator('.pi-git-status-modified').waitFor({ state: 'visible', timeout: 10000 });

      // Assert dirty badges are visible
      await expect(projectGroup.locator('.pi-git-status-modified')).toBeVisible();
      await expect(projectGroup.locator('.pi-git-status-added')).toBeVisible();
      await expect(projectGroup.locator('.pi-git-status-deleted')).toBeVisible();

      // Screenshot
      const mobile = await isMobileLayout(page);
      const tag = mobile ? 'mobile' : 'desktop';
      await projectGroup.first().screenshot({ path: `.shots/git-${tag}-project-header.png` });
    } finally {
      try {
        rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        // Windows may hold git file handles — best-effort cleanup
      }
    }
  });
});

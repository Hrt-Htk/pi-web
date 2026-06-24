import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const htmlFile = 'file:///H:/Software/pi-web/.pi/tasks/tool-grouping-prototype.html';
const outDir = 'H:/Software/pi-web/.pi/tasks/screenshots';
const viewport = { width: 420, height: 900 };

mkdirSync(outDir, { recursive: true });

const shots = [
  { name: '01-conversation.png', sheetId: null, scrollY: 100, clip: null },
  { name: '02-sheet-read-full.png', sheetId: 'sheet-read', scrollY: 0, clipSheet: true },
  { name: '03-sheet-edited-full.png', sheetId: 'sheet-edited', scrollY: 0, clipSheet: true },
  { name: '04-sheet-bash-full.png', sheetId: 'sheet-bash', scrollY: 0, clipSheet: true },
  { name: '05-sheet-thought-edited-full.png', sheetId: 'sheet-thought-edited', scrollY: 0, clipSheet: true },
];

const browser = await chromium.launch();
for (const shot of shots) {
  const page = await browser.newPage();
  await page.setViewportSize(viewport);
  await page.goto(htmlFile);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(200);

  if (shot.scrollY && !shot.sheetId) {
    await page.evaluate((y) => window.scrollTo(0, y), shot.scrollY);
    await page.waitForTimeout(200);
  }

  if (shot.sheetId) {
    const backdropId = 'backdrop-' + shot.sheetId.replace('sheet-', '');
    await page.evaluate(({ sheetId, backdropId }) => {
      document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.sheet-backdrop').forEach(b => b.classList.remove('active'));
      document.getElementById(sheetId)?.classList.add('active');
      document.getElementById(backdropId)?.classList.add('active');
    }, { sheetId: shot.sheetId, backdropId });
    await page.waitForTimeout(400);

    if (shot.clipSheet) {
      // Capture just the sheet element
      const sheet = await page.$(`#${shot.sheetId}`);
      if (sheet) {
        await sheet.screenshot({ path: `${outDir}/${shot.name}` });
        console.log(`✓ ${shot.name} (clipped)`);
        await page.close();
        continue;
      }
    }
  }

  await page.screenshot({ path: `${outDir}/${shot.name}`, fullPage: false });
  console.log(`✓ ${shot.name}`);
  await page.close();
}
await browser.close();
console.log(`Done — ${shots.length} screenshots in ${outDir}`);

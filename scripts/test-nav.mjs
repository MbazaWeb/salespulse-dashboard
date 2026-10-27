// Checks the sidebar: desktop collapse/expand and mobile slide-out menu (open, scrim, Escape, nav click).
// Start the app first (npm run dev), then run: npm run test:nav
// Optional: BASE_URL=http://localhost:5173 npm run test:nav
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
let failures = 0;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
try {
  // ---------- Desktop ----------
  const desk = await browser.newPage({ viewport: { width: 1366, height: 820 } });
  await desk.goto(BASE, { waitUntil: 'networkidle' });
  await desk.evaluate(() => localStorage.removeItem('sp-nav-collapsed'));
  await desk.reload({ waitUntil: 'networkidle' });
  await wait(1300); // skeleton finishes

  const sideW = async () => (await desk.locator('[data-testid=sidebar]').boundingBox()).width;
  const menuVisible = await desk.locator('[data-testid=nav-toggle-mobile]').isVisible();
  const collapseVisible = await desk.locator('[data-testid=nav-collapse]').isVisible();

  check('desktop: sidebar starts expanded', (await sideW()) > 200, `${Math.round(await sideW())}px`);
  check('desktop: mobile menu button hidden', !menuVisible);
  check('desktop: collapse button visible', collapseVisible);

  await desk.click('[data-testid=nav-collapse]');
  await wait(400);
  check('desktop: collapse hides labels (rail ≈ 84px)', (await sideW()) < 100, `${Math.round(await sideW())}px`);
  check('desktop: nav text is hidden when collapsed',
    !(await desk.locator('[data-testid=nav-overview] .nav-text').isVisible()));
  check('desktop: icons still visible when collapsed',
    await desk.locator('[data-testid=nav-overview] svg').isVisible());
  check('desktop: collapsed state sets is-collapsed class',
    await desk.locator('.app.is-collapsed').count() === 1);

  await desk.click('[data-testid=nav-reports]');
  await wait(600);
  check('desktop: navigation still works while collapsed',
    (await desk.locator('.crumb b').innerText()) === 'Reports');

  await desk.click('[data-testid=nav-collapse]');
  await wait(400);
  check('desktop: expand restores full sidebar', (await sideW()) > 200, `${Math.round(await sideW())}px`);
  check('desktop: nav labels visible again', await desk.locator('[data-testid=nav-overview] .nav-text').isVisible());

  await desk.reload({ waitUntil: 'networkidle' });
  await desk.click('[data-testid=nav-collapse]');
  await desk.reload({ waitUntil: 'networkidle' });
  await wait(300);
  check('desktop: collapsed state persists across reload', await desk.locator('.app.is-collapsed').count() === 1);
  await desk.evaluate(() => localStorage.removeItem('sp-nav-collapsed'));
  await desk.close();

  // ---------- Mobile ----------
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mob.goto(BASE, { waitUntil: 'networkidle' });
  await wait(1300);
  const sideX = async () => (await mob.locator('[data-testid=sidebar]').boundingBox()).x;

  check('mobile: menu button visible', await mob.locator('[data-testid=nav-toggle-mobile]').isVisible());
  check('mobile: collapse button hidden', !(await mob.locator('[data-testid=nav-collapse]').isVisible()));
  check('mobile: sidebar starts off-screen', (await sideX()) < -200, `x=${Math.round(await sideX())}`);

  await mob.click('[data-testid=nav-toggle-mobile]');
  await wait(500);
  check('mobile: menu button opens sidebar', (await sideX()) > -5, `x=${Math.round(await sideX())}`);
  check('mobile: sidebar has open class', await mob.locator('[data-testid=sidebar].open').count() === 1);
  check('mobile: scrim is shown', await mob.locator('[data-testid=nav-scrim]').isVisible());
  check('mobile: menu button reports aria-expanded=true',
    (await mob.getAttribute('[data-testid=nav-toggle-mobile]', 'aria-expanded')) === 'true');

  await mob.click('[data-testid=nav-scrim]', { position: { x: 360, y: 400 } });
  await wait(500);
  check('mobile: tapping scrim closes the menu', (await sideX()) < -200);

  await mob.click('[data-testid=nav-toggle-mobile]');
  await wait(400);
  await mob.keyboard.press('Escape');
  await wait(500);
  check('mobile: Escape closes the menu', (await sideX()) < -200);

  await mob.click('[data-testid=nav-toggle-mobile]');
  await wait(400);
  await mob.click('[data-testid=nav-territories]');
  await wait(600);
  check('mobile: choosing a page navigates', (await mob.locator('.crumb b').innerText()) === 'Territories');
  check('mobile: choosing a page closes the menu', (await sideX()) < -200);
  await mob.close();
} finally {
  await browser.close();
}

console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);

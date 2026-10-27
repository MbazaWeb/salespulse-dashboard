// Browser smoke test for a deployed SalesPulse site. No uploads or user data are changed.
// Usage: BASE_URL=https://salespulse-dashboard-kappa.vercel.app node scripts/smoke-production.mjs
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'https://salespulse-dashboard-kappa.vercel.app';
const base = new URL(BASE_URL);
if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) {
  throw new Error('BASE_URL must be HTTPS, except for localhost.');
}
const failures = [];
const browser = await chromium.launch({ headless: true });
const check = (name, condition) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (!condition) failures.push(name);
};
async function visit(page, label) {
  const errors = [];
  page.on('pageerror', error => errors.push(`Uncaught: ${error.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`Console: ${msg.text()}`);
  });
  page.on('response', response => {
    if (response.status() >= 500 && new URL(response.url()).origin === base.origin) {
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  const response = await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  check(`${label}: HTTP 200`, response?.status() === 200);
  await page.locator('[data-testid="sidebar"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-testid="nav-overview"]').waitFor({ state: 'visible' });
  await page.waitForTimeout(1400); // allow initial skeleton transition
  check(`${label}: overview rendered`, await page.locator('.kpi-grid').count() > 0);
  return errors;
}
try {
  const desktop = await browser.newPage({ viewport: { width: 1366, height: 820 } });
  const desktopErrors = await visit(desktop, 'desktop');
  for (const [id, expected] of [
    ['regions', 'Regions'],
    ['territories', 'Territories'],
    ['team', 'Team'],
    ['telesales', 'Telesales'],
    ['reports', 'Reports'],
    ['settings', 'Settings'],
    ['overview', 'Overview'],
  ]) {
    await desktop.locator(`[data-testid="nav-${id}"]`).click();
    await desktop.waitForTimeout(800);
    const crumb = (await desktop.locator('.crumb b').innerText()).trim();
    check(`desktop: ${expected} navigation`, crumb === expected);
  }
  check('desktop: no browser errors', desktopErrors.length === 0);
  if (desktopErrors.length) console.error(desktopErrors.join('\n'));
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobileErrors = await visit(mobile, 'mobile');
  check('mobile: menu toggle visible', await mobile.locator('[data-testid="nav-toggle-mobile"]').isVisible());
  await mobile.locator('[data-testid="nav-toggle-mobile"]').click();
  check('mobile: sidebar opens', await mobile.locator('[data-testid="sidebar"].open').count() === 1);
  await mobile.locator('[data-testid="nav-reports"]').click();
  await mobile.waitForTimeout(800);
  check('mobile: Reports navigation', (await mobile.locator('.crumb b').innerText()).trim() === 'Reports');
  check('mobile: sidebar closes after navigation', await mobile.locator('[data-testid="sidebar"].open').count() === 0);
  check('mobile: no horizontal overflow', await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check('mobile: no browser errors', mobileErrors.length === 0);
  if (mobileErrors.length) console.error(mobileErrors.join('\n'));
  await mobile.close();
} catch (error) {
  failures.push('Unexpected browser test failure');
  console.error(error);
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`\n${failures.length} smoke checks failed: ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('\nAll production smoke checks passed.');
}

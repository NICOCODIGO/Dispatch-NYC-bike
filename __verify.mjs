import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT =
  'C:/Users/iivaz/AppData/Local/Temp/claude/c--Users-iivaz-OneDrive-Documents-GitHub-CITY-bike-2-0/7a1648a6-c12a-4d1b-be50-5e4e0248244b/scratchpad';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
  defaultViewport: { width: 1200, height: 1000, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle2' });
await page.waitForFunction(() => !document.body.innerText.includes('Reading the live feed'), {
  timeout: 45000,
});
console.log('first poll recorded; waiting for the second (65s)...');
await new Promise((r) => setTimeout(r, 65000));

await page.evaluate(() => {
  document.querySelector('a[href="/verify"]').click();
});
await new Promise((r) => setTimeout(r, 1500));

await page.screenshot({ path: `${OUT}/verify.png` });
console.log('--- summary line ---');
console.log(
  await page.evaluate(() => {
    const p = document.querySelector('p.font-semibold');
    return p ? p.innerText : 'missing';
  }),
);

// Outcome definitions popover
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    x.textContent.trim().startsWith('Outcome'),
  );
  b?.click();
});
await new Promise((r) => setTimeout(r, 400));
const defs = await page.evaluate(() => {
  const dl = document.querySelector('th dl');
  return dl ? dl.innerText.replace(/\n/g, ' | ') : 'missing';
});
console.log('\n--- outcome definitions popover ---\n' + defs);
await page.screenshot({ path: `${OUT}/verify-defs.png` });

// Click a summary count to filter
await page.keyboard.press('Escape');
const beforeRows = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    /still failing/i.test(x.textContent),
  );
  b?.click();
});
await new Promise((r) => setTimeout(r, 500));
const afterRows = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
console.log(`\nfilter by "still failing": ${beforeRows} rows -> ${afterRows} rows`);

// Row opens the panel with history
await page.evaluate(() => {
  document.querySelector('tbody tr button')?.click();
});
await new Promise((r) => setTimeout(r, 700));
const panel = await page.evaluate(() => {
  const d = document.querySelector('.drawer');
  if (!d) return null;
  return {
    hasHistoryTable: !!d.querySelector('table'),
    headings: [...d.querySelectorAll('h3')].map((h) => h.textContent),
    readings: d.querySelectorAll('tbody tr').length,
  };
});
console.log('\npanel from Verify:', JSON.stringify(panel));
await page.screenshot({ path: `${OUT}/verify-panel.png` });

console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
await browser.close();

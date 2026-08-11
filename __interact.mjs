import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT =
  'C:/Users/iivaz/AppData/Local/Temp/claude/c--Users-iivaz-OneDrive-Documents-GitHub-CITY-bike-2-0/7a1648a6-c12a-4d1b-be50-5e4e0248244b/scratchpad';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle2' });
await page.waitForFunction(() => !document.body.innerText.includes('Reading the live feed'), {
  timeout: 45000,
});
await new Promise((r) => setTimeout(r, 600));

// --- Measure the readout block (eyebrow -> bottom of status strip) ---
const block = await page.evaluate(() => {
  const eyebrow = document.querySelector('.eyebrow-mono');
  const strip = document.querySelector('.status-strip');
  if (!eyebrow || !strip) return null;
  const a = eyebrow.getBoundingClientRect();
  const b = strip.getBoundingClientRect();
  const table = document.querySelector('.queue-table');
  return {
    readoutHeight: Math.round(b.bottom - a.top),
    firstRowTop: table ? Math.round(table.getBoundingClientRect().top) : -1,
    rowsAboveFold: [...document.querySelectorAll('.queue-row')].filter(
      (r) => r.getBoundingClientRect().bottom <= 900,
    ).length,
  };
});
console.log('readout block height:', block.readoutHeight, 'px (budget ~180)');
console.log('table top:', block.firstRowTop, '| rows fully visible at 900px:', block.rowsAboveFold);

// --- §4: open the detail panel from a row ---
await page.evaluate(() => {
  document.querySelector('.queue-row .cell-name a').click();
});
await new Promise((r) => setTimeout(r, 700));
let panel = await page.evaluate(() => {
  const d = document.querySelector('.drawer');
  return d
    ? {
        width: Math.round(d.getBoundingClientRect().width),
        heading: d.querySelector('h2')?.textContent,
        position: d.querySelector('.num')?.textContent?.trim(),
        queueStillVisible: !!document.querySelector('.queue-row'),
        url: location.pathname,
        focusInside: d.contains(document.activeElement),
      }
    : null;
});
console.log('panel opened:', JSON.stringify(panel));
await page.screenshot({ path: `${OUT}/panel.png` });

// --- arrow-key navigation through the queue ---
const names = [];
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('ArrowDown');
  await new Promise((r) => setTimeout(r, 250));
  names.push(
    await page.evaluate(() => document.querySelector('.drawer h2')?.textContent),
  );
}
console.log('arrow-down walked to:', names.join(' -> '));

// --- Esc closes and restores focus ---
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 500));
const afterEsc = await page.evaluate(() => ({
  panelGone: !document.querySelector('.drawer'),
  url: location.pathname,
  focused: document.activeElement?.textContent?.trim().slice(0, 40),
  focusedTag: document.activeElement?.tagName,
}));
console.log('after Esc:', JSON.stringify(afterEsc));

// --- §1: mechanic + unverified sections are collapsed disclosures ---
const sections = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('section[id] button[aria-expanded]')];
  return btns.map((b) => ({
    id: b.closest('section').id,
    expanded: b.getAttribute('aria-expanded'),
    text: b.textContent.trim().replace(/\s+/g, ' ').slice(0, 70),
  }));
});
console.log('lane sections:', JSON.stringify(sections, null, 1));

// --- deep link renders queue + panel ---
const deep = await page.evaluate(() => {
  const link = document.querySelector('.queue-row .cell-name a');
  return link.getAttribute('href');
});
await page.goto('http://localhost:4173' + deep, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => !document.body.innerText.includes('Reading the live feed'), {
  timeout: 45000,
});
await new Promise((r) => setTimeout(r, 900));
console.log(
  'deep link:',
  await page.evaluate(() => ({
    hasPanel: !!document.querySelector('.drawer'),
    hasQueue: !!document.querySelector('.queue-row'),
  })),
);

console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
await browser.close();

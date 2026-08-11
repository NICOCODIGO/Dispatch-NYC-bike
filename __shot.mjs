import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT =
  'C:/Users/iivaz/AppData/Local/Temp/claude/c--Users-iivaz-OneDrive-Documents-GitHub-CITY-bike-2-0/7a1648a6-c12a-4d1b-be50-5e4e0248244b/scratchpad';

const [, , name = 'q', widthArg = '1440', heightArg = '900', path = '/'] = process.argv;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
  defaultViewport: {
    width: Number(widthArg),
    height: Number(heightArg),
    deviceScaleFactor: 2,
  },
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url()));

await page.goto('http://localhost:4173' + path, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !document.body.innerText.includes('Reading the live feed'), {
  timeout: 45000,
});

if (process.env.CLICK) {
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll('a,button,summary')].find(
      (n) => n.textContent.trim().startsWith(t),
    );
    if (el) el.click();
  }, process.env.CLICK);
  await new Promise((r) => setTimeout(r, 900));
}
if (process.env.SCROLL) {
  await page.evaluate((y) => window.scrollTo(0, Number(y)), process.env.SCROLL);
}

await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${OUT}/${name}.png` });

const info = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.queue-row')];
  const firstRow = rows[0];
  const table = document.querySelector('.queue-table');
  return {
    rank1: firstRow ? firstRow.innerText.replace(/\n+/g, ' | ').slice(0, 130) : 'none',
    rowCount: rows.length,
    // Where does the first data row sit relative to the fold?
    firstRowTop: table ? Math.round(table.getBoundingClientRect().top) : -1,
    text: document.body.innerText.slice(0, 900),
  };
});
console.log('rank #1:', info.rank1);
console.log('rows:', info.rowCount, '| table top y:', info.firstRowTop);
console.log('---\n' + info.text);
console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no errors)');

await browser.close();

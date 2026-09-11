// Pulls the real UI vocabulary off every screen, so the narration can quote
// labels as they actually read rather than as anyone remembers them.
//
// Redaction is installed here too. The employee detail screen titles itself
// with the person's name, so without it this file would quietly become a list
// of real staff — the one place in the folder still holding them.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { buildMap, harvestRoster, initScript } from './redact.mjs';

const BASE = process.env.BASE || 'http://localhost:5299';
const OUT = 'D:/Mobosafe/employee-manual';
const STATE = OUT + '/.auth.json';

const ROUTES = JSON.parse(fs.readFileSync(OUT + '/tour-manifest.json', 'utf8')).map((r) => ({
  id: r.id,
  name: r.name,
  url: r.url,
}));

const browser = await chromium.launch({ headless: true });
const VIEW = { width: 1440, height: 900 };

// One unredacted page to learn the roster, then throw it away.
const seed = await browser.newContext({ viewport: VIEW, storageState: STATE });
const seedPage = await seed.newPage();
await seedPage.goto(BASE + '/employee', { waitUntil: 'domcontentloaded' });
await seedPage.waitForTimeout(1500);
if (/\/login/.test(seedPage.url())) {
  console.error('the saved session has expired - re-run tour.mjs');
  await browser.close();
  process.exit(2);
}
const map = buildMap(await harvestRoster(seedPage, BASE));
await seed.close();

const ctx = await browser.newContext({ viewport: VIEW, storageState: STATE });
await ctx.addInitScript({ content: initScript(map) });
const page = await ctx.newPage();
const out = {};

for (const r of ROUTES) {
  await page.goto(BASE + r.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  out[r.id] = await page.evaluate(() => {
    const txt = (el) => (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 90);
    const uniq = (a) => [...new Set(a.filter((s) => s && s.length > 1))];
    const main = document.querySelector('main') || document.body;
    const pick = (sel) => uniq([...main.querySelectorAll(sel)].map(txt));
    return {
      h1: pick('h1'),
      h2: pick('h2'),
      h3: pick('h3'),
      buttons: pick('button').filter((b) => !/MoboBuddy|Ask AI|Notifications/.test(b)).slice(0, 26),
      tabs: pick('[role="tab"]'),
      ths: pick('th').slice(0, 16),
      labels: pick('label').slice(0, 22),
      statusPills: uniq(
        [...main.querySelectorAll('span,div')]
          .map(txt)
          .filter((t) => /^(PENDING|APPROVED|REJECTED|PAID|DRAFT|SUBMITTED|DEDUCTED|ACTIVE|CLOSED|CANCELLED|Pending|Approved|Paid|Draft)$/.test(t)),
      ).slice(0, 10),
    };
  });
  console.log(r.id, r.name, '->', (out[r.id].h1[0] || '(no h1)'));
}

await browser.close();
fs.writeFileSync(OUT + '/labels.json', JSON.stringify(out, null, 2));
console.log('\nwrote labels.json');

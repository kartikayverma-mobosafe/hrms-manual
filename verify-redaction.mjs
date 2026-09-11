// Proves the redacted output carries no personal data. Loads every chapter route
// with redaction active and reports anything still name- or identifier-shaped.
//
// It checks the same units the scrub rewrites: individual text nodes and the
// title/aria-label attributes. Reading innerText instead joins table cells with
// tabs and rows with newlines, and a name regex spanning those boundaries calls
// "SR NO / PHOTO / CODE" a person — noise that buries the one real leak.
//
// Two independent checks, because either alone can be fooled:
//   1. structural — anything still shaped like a name, an id or a phone number;
//   2. known-name — any real name from the map that survived anywhere on the
//      page, which catches the single-word names no shape rule will match.
//
// Findings are written to redaction-report.json for a person to read. Nothing
// personal is printed: the console summary is counts only.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { auditPage, buildMap, harvestRoster, initScript } from './redact.mjs';

const BASE = process.env.BASE || 'http://localhost:5299';
const OUT = 'D:/Mobosafe/employee-manual';
const STATE = OUT + '/.auth.json';
const EMAIL = process.env.MS_EMAIL;
const PASS = process.env.MS_PASS;
const VIEW = { width: 1440, height: 900 };

// The tour leaves a signed-in session behind; reuse it so verifying does not
// need the password again. MS_EMAIL / MS_PASS still work if it has expired.
const HAVE_STATE = fs.existsSync(STATE);
if (!HAVE_STATE && (!EMAIL || !PASS)) {
  console.error(`no ${STATE} and no MS_EMAIL / MS_PASS — run tour.mjs first, or set both`);
  process.exit(2);
}

const ROUTES = JSON.parse(fs.readFileSync(OUT + '/tour-manifest.json', 'utf8'))
  .map((r) => ({ id: r.id, url: r.url }));

const browser = await chromium.launch({ headless: true });

// Open an UNREDACTED session to grab the roster, exactly as the tour does.
const l = await browser.newContext(
  HAVE_STATE ? { viewport: VIEW, storageState: STATE } : { viewport: VIEW });
const lp = await l.newPage();
if (HAVE_STATE) {
  await lp.goto(BASE + '/employee', { waitUntil: 'domcontentloaded' });
  await lp.waitForTimeout(1500);
  if (/\/login/.test(lp.url())) {
    console.error('the saved session has expired — re-run tour.mjs, or set MS_EMAIL / MS_PASS');
    await browser.close();
    process.exit(2);
  }
} else {
  await lp.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await lp.getByRole('textbox', { name: 'you@company.com' }).fill(EMAIL);
  await lp.getByRole('textbox', { name: 'Enter your password' }).fill(PASS);
  await lp.getByRole('button', { name: /Sign In/ }).click();
  await lp.waitForURL(/module-selection|employee/, { timeout: 30000 });
  if (lp.url().includes('module-selection')) {
    await lp.getByRole('button', { name: 'Employee Management' }).click();
    await lp.waitForURL(/\/employee/, { timeout: 30000 });
  }
}
try { await lp.getByRole('button', { name: 'Hide MoboBuddy AI' }).click({ timeout: 4000 }); } catch { /* hidden */ }
await lp.waitForTimeout(1000);
const state = await l.storageState();
// The same harvest the tour uses — a map built any other way would verify
// something the capture never did.
const names = await harvestRoster(lp, BASE);
await l.close();
const map = buildMap(names);

const ctx = await browser.newContext({ viewport: VIEW, storageState: state });
await ctx.addInitScript({ content: initScript(map) });
const page = await ctx.newPage();

let leaks = 0;
let reviews = 0;
const report = {};
for (const r of ROUTES) {
  await page.goto(BASE + r.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3200);
  const a = await auditPage(page, Object.keys(map));
  if (a.leaks || a.singles.length) {
    report[r.id] = {
      leaks: { names: a.names, ids: a.ids, phones: a.phones, realNamesSurviving: a.survived },
      review: { singleWords: a.singles },
    };
  }
  leaks += a.leaks;
  reviews += a.singles.length;
  console.log(`${a.leaks ? 'LEAK ' : 'clean'} ${r.id.padEnd(7)} names:${a.names.length} `
    + `ids:${a.ids.length} phones:${a.phones.length} `
    + `realSurviving:${a.survived.length} review:${a.singles.length}`);
}
await browser.close();
fs.writeFileSync(OUT + '/redaction-report.json', JSON.stringify(report, null, 2));
console.log(`\n${leaks === 0
  ? 'CLEAN - no names, identifiers or phone numbers remain'
  : `${leaks} LEAKS across ${Object.keys(report).length} pages`}`);
console.log(`${reviews} single all-caps words listed for review in redaction-report.json`);
process.exit(leaks === 0 ? 0 : 1);

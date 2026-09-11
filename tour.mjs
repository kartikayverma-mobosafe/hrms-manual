import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { auditPage, buildMap, harvestRoster, initScript } from './redact.mjs';

const BASE  = process.env.BASE  || 'http://localhost:5299';
const EMAIL = process.env.MS_EMAIL;
const PASS  = process.env.MS_PASS;
const OUT   = 'D:/Mobosafe/employee-manual';
const SHOTS = path.join(OUT, 'shots');
const VIDEO = path.join(OUT, 'video');
const STATE = path.join(OUT, '.auth.json');
const VIEW  = { width: 1440, height: 900 };

// A previous run leaves a signed-in session behind; reuse it so re-capturing
// after a UI change does not need the password again.
const HAVE_STATE = fs.existsSync(STATE);
if (!HAVE_STATE && (!EMAIL || !PASS)) {
  console.error(`no ${STATE} and no MS_EMAIL / MS_PASS — set both for the first run`);
  process.exit(2);
}
for (const d of [SHOTS, VIDEO]) fs.mkdirSync(d, { recursive: true });

// `wait` is text that proves the screen actually rendered before we shoot it.
const CHAPTERS = [
  { id: 'em-01',  name: 'workspace',        url: '/employee',                     wait: 'Go to' },
  { id: 'em-02',  name: 'departments',      url: '/employee/masters/departments', wait: 'Departments' },
  { id: 'em-03',  name: 'employee-codes',   url: '/employee/masters/codes',       wait: 'Masters' },
  { id: 'em-04',  name: 'basic-master',     url: '/employee/masters/basic',       wait: 'Masters' },
  { id: 'em-05',  name: 'leave-types',      url: '/employee/masters/leave-types', wait: 'Masters' },
  { id: 'em-05b', name: 'holidays',         url: '/employee/masters/holidays',    wait: 'Masters' },
  { id: 'em-06',  name: 'payroll-settings', url: '/employee/salary-setup',        wait: 'Payroll Settings' },
  { id: 'em-07',  name: 'face-match',       url: '/employee/masters/face-match',  wait: 'Masters' },
  { id: 'em-08',  name: 'employee-list',    url: '/employee/employees',           wait: 'Employees' },
  { id: 'em-09',  name: 'employee-new',     url: '/employee/employees/new',       wait: 'Save' },
  { id: 'em-10',  name: 'employee-detail',  url: '/employee/employees/53',        wait: 'Profile' },
  { id: 'em-12',  name: 'employee-master',  url: '/employee/masters/employees',   wait: 'Masters' },
  { id: 'em-13',  name: 'attendance',       url: '/employee/attendance',          wait: 'Attendance' },
  { id: 'em-14',  name: 'muster',           url: '/employee/muster',              wait: 'Muster' },
  { id: 'em-15',  name: 'leave',            url: '/employee/leave',               wait: 'Leave' },
  { id: 'em-16',  name: 'deductions',       url: '/employee/deductions',          wait: 'Penalties' },
  { id: 'em-17',  name: 'expenses',         url: '/employee/expenses',            wait: 'Expenses' },
  { id: 'em-18',  name: 'contract-workers', url: '/employee/contractors',         wait: 'Contract Workers' },
  { id: 'em-19',  name: 'payroll',          url: '/employee/payroll',             wait: 'Payroll' },
  { id: 'em-19b', name: 'payroll-run',      url: '/employee/payroll/4',           wait: 'Payroll' },
  { id: 'em-20',  name: 'performance',      url: '/employee/performance',         wait: 'Performance' },
  { id: 'em-21',  name: 'reports',          url: '/employee/reports',             wait: 'Reports' },
  { id: 'em-22',  name: 'my-hr',            url: '/employee/me',                  wait: 'My HR' },
];

// The app scrolls an inner container, so window-level fullPage misses content.
async function scrollInfo(page) {
  return page.evaluate(() => {
    const cands = [...document.querySelectorAll('div,main,section')].filter(
      (e) => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY),
    );
    const t = cands.sort((a, b) => b.clientHeight - a.clientHeight)[0];
    if (!t) return { has: false, max: 0 };
    t.setAttribute('data-tour-scroll', '1');
    return { has: true, max: t.scrollHeight - t.clientHeight };
  });
}

async function scrollTo(page, top) {
  await page.evaluate((t) => {
    const el = document.querySelector('[data-tour-scroll="1"]');
    if (el) el.scrollTop = t;
    else window.scrollTo(0, t);
  }, top);
}

async function hideBuddy(page, timeout) {
  try {
    await page.getByRole('button', { name: 'Hide MoboBuddy AI' }).click({ timeout });
  } catch {
    /* already hidden */
  }
}

async function login(browser) {
  const ctx = await browser.newContext(
    HAVE_STATE ? { viewport: VIEW, storageState: STATE } : { viewport: VIEW });
  const page = await ctx.newPage();
  if (HAVE_STATE) {
    await page.goto(BASE + '/employee', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    if (/\/login/.test(page.url())) {
      throw new Error('the saved session has expired — set MS_EMAIL and MS_PASS');
    }
  } else {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: 'you@company.com' }).fill(EMAIL);
    await page.getByRole('textbox', { name: 'Enter your password' }).fill(PASS);
    await page.getByRole('button', { name: /Sign In/ }).click();
    await page.waitForURL(/module-selection|employee/, { timeout: 30000 });
    if (page.url().includes('module-selection')) {
      await page.getByRole('button', { name: 'Employee Management' }).click();
      await page.waitForURL(/\/employee/, { timeout: 30000 });
    }
  }
  await hideBuddy(page, 5000);
  await page.waitForTimeout(1200);
  await ctx.storageState({ path: STATE });

  // Pull the real roster once, while nothing is redacting, so replacement can be
  // exact rather than pattern-guessed.
  const names = await harvestRoster(page, BASE);
  await ctx.close();
  const map = buildMap(names);
  fs.writeFileSync(path.join(OUT, 'redaction-map.json'), JSON.stringify(map, null, 2));
  console.log(`${Object.keys(map).length} aliases`);
  return map;
}

/** One verdict for a chapter, over every scroll position it was shot at. */
function mergeAudits(list) {
  const union = (key) => [...new Set(list.flatMap((a) => a[key]))];
  const out = {
    names: union('names'),
    ids: union('ids'),
    phones: union('phones'),
    survived: union('survived'),
    singles: union('singles'),
  };
  out.leaks = out.names.length + out.ids.length + out.phones.length + out.survived.length;
  return out;
}

async function capture(browser, ch, map, realNames) {
  const ctx = await browser.newContext({
    viewport: VIEW,
    storageState: STATE,
    recordVideo: { dir: VIDEO, size: VIEW },
  });
  await ctx.addInitScript({ content: initScript(map) });
  const page = await ctx.newPage();
  const shots = [];
  try {
    await page.goto(BASE + ch.url, { waitUntil: 'domcontentloaded' });
    await hideBuddy(page, 2500);
    if (ch.wait) {
      try {
        await page.getByText(ch.wait, { exact: false }).first().waitFor({ state: 'visible', timeout: 12000 });
      } catch {
        console.log(`\n    ! wait text "${ch.wait}" never appeared`);
      }
    }
    await page.waitForTimeout(2600); // tables and figures settle

    // Checked here, not in a later pass: a separate run is a different page
    // load, and the only frames that matter are the ones actually taken.
    const audits = [await auditPage(page, realNames)];

    const a = path.join(SHOTS, `${ch.id}-${ch.name}.png`);
    await page.screenshot({ path: a, scale: 'css' });
    shots.push(path.basename(a));

    const info = await scrollInfo(page);
    if (info.has && info.max > 120) {
      await scrollTo(page, info.max);
      await page.waitForTimeout(1100);
      // The foot of a long table is where the rest of the roster is, so the
      // scrolled view has to be judged on its own, not on what was above it.
      audits.push(await auditPage(page, realNames));
      const b = path.join(SHOTS, `${ch.id}-${ch.name}-lower.png`);
      await page.screenshot({ path: b, scale: 'css' });
      shots.push(path.basename(b));
      await scrollTo(page, 0);
      await page.waitForTimeout(600);
    }

    await page.waitForTimeout(900); // tail padding so the video does not cut dead
    const vpath = await page.video().path();
    await ctx.close();
    const dest = path.join(VIDEO, `${ch.id}-${ch.name}.webm`);
    fs.renameSync(vpath, dest);
    return { ...ch, ok: true, shots, video: path.basename(dest), audit: mergeAudits(audits) };
  } catch (e) {
    try { await ctx.close(); } catch { /* ignore */ }
    return { ...ch, ok: false, shots, error: String(e).split('\n')[0] };
  }
}

const browser = await chromium.launch({ headless: true });
console.log('logging in...');
const map = await login(browser);
console.log('logged in, redaction map built\n');

const results = [];
for (const ch of CHAPTERS) {
  process.stdout.write(`${ch.id.padEnd(7)} ${ch.name.padEnd(18)}`);
  const r = await capture(browser, ch, map, Object.keys(map));
  results.push(r);
  if (!r.ok) {
    console.log(`FAIL ${r.error}`);
  } else {
    console.log(`ok   ${r.shots.length} shot(s)`
      + (r.audit.leaks ? `   *** ${r.audit.leaks} PERSONAL ITEM(S) ON SCREEN ***` : '   clean'));
  }
}
await browser.close();

fs.writeFileSync(path.join(OUT, 'tour-manifest.json'), JSON.stringify(results, null, 2));
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${results.length} chapters captured`);
for (const r of results.filter((r) => !r.ok)) console.log(`  FAILED ${r.id}: ${r.error}`);

// The capture-time verdict, so shipping a dirty frame takes ignoring a warning.
const dirty = results.filter((r) => r.audit && r.audit.leaks);
if (dirty.length) {
  console.log(`\n*** ${dirty.map((r) => r.id).join(', ')} had personal data on screen when shot.`);
  console.log('*** Do NOT run mux.mjs on these. The audit block in tour-manifest.json says what.');
  process.exitCode = 1;
} else if (ok) {
  console.log('\nevery captured frame was audited as it was taken: no names, ids or phone numbers');
}

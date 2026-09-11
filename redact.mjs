// Builds the in-page redaction script. Injected with addInitScript so it is
// installed before the app boots, and kept alive by a MutationObserver —
// React re-renders would otherwise restore the real names within a frame.

export const FIRST = [
  'Aarav', 'Vivaan', 'Aditya', 'Rohit', 'Karan', 'Manish', 'Suresh', 'Rajesh', 'Vikram', 'Deepak',
  'Sandeep', 'Ramesh', 'Anil', 'Prakash', 'Naveen', 'Sunil', 'Ravi', 'Mahesh', 'Arjun', 'Nikhil',
  'Pankaj', 'Gaurav', 'Ashish', 'Vinod', 'Rakesh', 'Satish', 'Mukesh', 'Dinesh', 'Yogesh', 'Hemant',
  'Kabir', 'Ishaan', 'Reyansh', 'Atharv', 'Shaurya', 'Dhruv', 'Om', 'Yash', 'Tarun', 'Varun',
  'Priya', 'Anita', 'Sunita', 'Kavita', 'Meena', 'Pooja', 'Rekha', 'Seema', 'Nisha', 'Asha',
];
export const LAST = [
  'Sharma', 'Verma', 'Gupta', 'Yadav', 'Kumar', 'Singh', 'Patel', 'Reddy', 'Nair', 'Mehta',
  'Joshi', 'Desai', 'Chauhan', 'Pandey', 'Mishra', 'Tiwari', 'Shukla', 'Rathore', 'Bhosale', 'Kulkarni',
];

/** Stable fake name per index, so one person stays one person across chapters. */
export function fakeNameFor(i) {
  const f = FIRST[i % FIRST.length];
  const l = LAST[Math.floor(i / FIRST.length) % LAST.length];
  return `${f} ${l}`.toUpperCase();
}

export function buildMap(realNames) {
  const uniq = [...new Set(realNames.filter((n) => n && n.trim().length > 2))].sort();
  const map = {};
  uniq.forEach((n, i) => {
    map[n] = fakeNameFor(i);
  });
  return map;
}

/**
 * Every name the manual can put on screen. `/api/hrms/employees` answers with a
 * fixed 50 rows however it is asked, and the module has 85 people — so the API
 * alone leaves a name the camera can see that the map has never heard of, which
 * is exactly the leak this engine exists to prevent. The reports table renders
 * the whole roster, so it is the honest source; the column is found by its
 * heading rather than its position, because that report gains columns.
 *
 * Single-word names matter most here: the structural rule needs two capitalised
 * words to recognise a person, so anyone recorded under a single name is
 * invisible to it, and can only be caught by being in the map.
 *
 * Must be called on an UNREDACTED page, before the init script is installed.
 */
export async function harvestRoster(page, base) {
  const api = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/hrms/employees');
      const j = await r.json();
      return (j.rows || j || []).map((x) => x.name).filter(Boolean);
    } catch { return []; }
  });

  let table = [];
  try {
    await page.goto(`${base}/employee/reports`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3200);
    table = await page.evaluate(() => {
      for (const t of document.querySelectorAll('table')) {
        const head = t.querySelector('thead tr');
        if (!head) continue;
        const at = [...head.children].findIndex(
          (c) => (c.textContent || '').trim().toLowerCase() === 'name');
        if (at < 0) continue;
        return [...t.querySelectorAll('tbody tr')]
          .map((r) => (r.children[at]?.textContent || '').trim())
          .filter(Boolean);
      }
      return [];
    });
  } catch { /* reports unreachable; the API list still stands */ }

  const all = [...new Set([...api, ...table])];
  console.log(`roster: ${api.length} from the API + ${table.length} from the report -> ${all.length} names`);
  if (!table.length) {
    console.warn('  ! the report table gave nothing — single-word names may go unaliased');
  }
  return all;
}

// Every all-caps UI string that is NOT a person. Anything all-caps and
// multi-word that is not in here is treated as a name and aliased.
export const NOT_NAMES = [
  'SR NO', 'PRESENT DAY', 'TOTAL PAID', 'DEDUCTION MONTH', 'MONTHLY SALARY', 'NET PAY',
  'EMPLOYER COST', 'RUN TYPE', 'EMPLOYER CONTRIBUTIONS', 'OT HOURS', 'NH OT', 'SUN OT',
  'SUNDAY OT HRS', 'NH OT HRS', 'PAID DAYS', 'DATE OF JOINING', 'WAGE CATEGORY', 'PAY CATEGORY',
  'ESIC NO', 'UAN NO', 'PF NO', 'ON ROSTER', 'MARK ALL PRESENT', 'NEW PAYROLL RUN',
  'FORM II', 'FORM-II', 'EXPORT EXCEL', 'ALL DEPARTMENTS', 'ALL CATEGORIES', 'ALL STATUSES',
  'BLOOD GROUP', 'MARITAL STATUS', 'DATE OF BIRTH', 'FULL NAME', 'FATHER NAME', "FATHER'S NAME",
  'EMPLOYEE CODE', 'PHONE NUMBER', 'EMAIL ADDRESS', 'EMERGENCY CONTACT NAME', 'EMERGENCY PHONE',
  'RESIDENTIAL ADDRESS', 'PIN CODE', 'SHORT CODE', 'NEXT CODE', 'BASIC MASTER', 'EMPLOYEE MASTER',
  'MD MOVERS', 'MOBO SAFE', 'MOBOSAFE', 'ASK AI', 'SWITCH MODULE', 'MY HR', 'W OFF', 'W.OFF',
  'HALF DAY', 'WEEKLY OFF', 'NATIONAL HOLIDAY', 'OFF DAY PRESENT', 'PAID LEAVE', 'UNPAID LEAVE',
  'ANNUAL QUOTA', 'CARRY FORWARD', 'BASIC DAY', 'DA DAY', 'PER MONTH', 'DEARNESS ALLOWANCE',
  'HOUSE RENT ALLOWANCE', 'CONVEYANCE ALLOWANCE', 'MOBILE ALLOWANCE', 'PROVIDENT FUND',
  'BELOW AVERAGE', 'FULLY MARKED', 'VIEW AS BRANCH', 'ZONE', 'TENURE MONTHS',
];

export function initScript(map) {
  return `(() => {
  const MAP = ${JSON.stringify(map)};
  const NOT_NAMES = new Set(${JSON.stringify(NOT_NAMES)});
  const FIRST = ${JSON.stringify(FIRST)};
  const LAST = ${JSON.stringify(LAST)};
  const keys = Object.keys(MAP).sort((a, b) => b.length - a.length);
  const esc = (s) => s.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
  // Case-insensitive: the list screens upper-case names in CSS, so a text node
  // can hold a name in title case while the pixels read it upper. Matching only
  // the stored spelling would leave that one on screen.
  const NAME_RE = keys.length ? new RegExp(keys.map(esc).join('|'), 'gi') : null;
  const BY_LOWER = {};
  for (const k of keys) BY_LOWER[k.toLowerCase()] = MAP[k];

  // Deterministic alias for a name we were never handed: same input always
  // yields the same person, so the manual stays internally consistent.
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h);
  }
  function alias(s) {
    const h = hash(s);
    return (FIRST[h % FIRST.length] + ' ' + LAST[(h >>> 7) % LAST.length]).toUpperCase();
  }
  // Every name we could possibly emit. The scrub runs repeatedly (observer +
  // interval), so an already-aliased name must never be aliased again.
  const ALIASES = new Set();
  for (const f of FIRST) for (const l of LAST) ALIASES.add((f + ' ' + l).toUpperCase());
  // 2+ all-caps words, letters/dots only — the shape every person's name takes here.
  const CAPS_RE = /\\b[A-Z][A-Z.']{1,}(?:\\s+[A-Z][A-Z.']{1,}){1,3}\\b/g;
  function normalise(s) { return s.replace(/[.']/g, '').replace(/\\s+/g, ' ').trim(); }

  // Long bare digit runs are identifiers (UAN, ESIC, PF). Money always renders
  // with commas or a decimal, so it never forms a 9+ digit run.
  const ID_RE   = /\\b\\d{9,}\\b/g;
  const PHONE_RE = /\\b[6-9]\\d{9}\\b|\\b[6-9]\\d{4}\\s\\d{5}\\b/g;

  function scrub(s) {
    let out = s;
    if (NAME_RE) out = out.replace(NAME_RE, (m) => BY_LOWER[m.toLowerCase()] || MAP[m] || m);
    // Anything still all-caps and name-shaped is a person we were not given.
    out = out.replace(CAPS_RE, (m) => {
      const n = normalise(m);
      if (ALIASES.has(n) || NOT_NAMES.has(n) || n.length < 6) return m;
      return alias(n);
    });
    out = out.replace(PHONE_RE, '9\\u2022\\u2022\\u2022\\u2022 \\u2022\\u2022\\u2022\\u2022\\u2022');
    out = out.replace(ID_RE, (m) => m.slice(0, 3) + '\\u2022'.repeat(Math.min(9, m.length - 3)));
    return out;
  }

  function walk(root) {
    if (!root) return;
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const todo = [];
    while (it.nextNode()) {
      const v = it.currentNode.nodeValue;
      if (v && v.trim().length > 1) todo.push(it.currentNode);
    }
    for (const n of todo) {
      const v = scrub(n.nodeValue);
      if (v !== n.nodeValue) n.nodeValue = v;
    }
    // title/aria-label carry names too (the workspace lists use title={name}).
    for (const el of root.querySelectorAll ? root.querySelectorAll('[title],[aria-label]') : []) {
      for (const a of ['title', 'aria-label']) {
        const v = el.getAttribute(a);
        if (v) { const s = scrub(v); if (s !== v) el.setAttribute(a, s); }
      }
    }
  }

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; walk(document.body); });
  }

  function start() {
    walk(document.body);
    new MutationObserver(schedule).observe(document.body, {
      childList: true, subtree: true, characterData: true,
    });
    // Safety net for anything that slips past the observer (canvas-free, cheap).
    setInterval(() => walk(document.body), 400);
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();`;
}

/**
 * What is still personal on the page as it stands right now. Shared by the tour
 * and the verifier so they can never disagree about what "clean" means, and
 * called by the tour immediately before each shot — a separate verification run
 * is a different page load, and the only frames that matter are the ones the
 * camera actually took.
 *
 * It reads the units the scrub rewrites — one text node, one attribute value —
 * rather than innerText, which joins table cells with tabs and rows with
 * newlines; a name pattern spanning those boundaries calls "SR NO / PHOTO /
 * CODE" a person and buries the one finding that matters.
 */
export async function auditPage(page, realNames) {
  const raw = await page.evaluate((real) => {
    const chunks = [];
    const it = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    while (it.nextNode()) {
      const v = it.currentNode.nodeValue;
      if (v && v.trim().length > 1) chunks.push(v);
    }
    for (const el of document.querySelectorAll('[title],[aria-label]')) {
      for (const a of ['title', 'aria-label']) {
        const v = el.getAttribute(a);
        if (v) chunks.push(v);
      }
    }
    const caps = new Set();
    const ids = new Set();
    const phones = new Set();
    const singles = new Set();
    for (const c of chunks) {
      // Spaces only, never \s — \s steps across a cell or a row boundary.
      for (const m of c.match(/\b[A-Z][A-Z.']{1,}(?:[ \u00a0]+[A-Z][A-Z.']{1,}){1,3}\b/g) || []) caps.add(m);
      for (const m of c.match(/\b\d{9,}\b/g) || []) ids.add(m);
      for (const m of c.match(/\b[6-9]\d{9}\b|\b[6-9]\d{4}\s\d{5}\b/g) || []) phones.add(m);
      for (const m of c.match(/\b[A-Z][A-Z.']{4,}\b/g) || []) singles.add(m);
    }
    const hay = (document.body.innerText || '').toUpperCase();
    return {
      caps: [...caps],
      ids: [...ids],
      phones: [...phones],
      singles: [...singles],
      survived: real.filter((n) => hay.includes(n.toUpperCase())),
    };
  }, realNames);

  const aliasPairs = new Set();
  for (const f of FIRST) for (const l of LAST) aliasPairs.add(`${f} ${l}`.toUpperCase());
  const aliasWords = new Set([...FIRST, ...LAST].map((w) => w.toUpperCase()));
  const skip = new Set(NOT_NAMES.map((s) => s.replace(/[.']/g, '')));
  const tidy = (s) => s.replace(/[.']/g, '').replace(/\s+/g, ' ').trim();

  const names = raw.caps.filter((c) => {
    const n = tidy(c);
    return !aliasPairs.has(n) && !skip.has(n) && n.length >= 6;
  });
  // A single all-caps word cannot be told from a branch or a status by shape
  // alone, so it is listed for a person to glance at, never called a leak.
  const singles = raw.singles.filter((c) => {
    const n = tidy(c);
    if (/^[0-9A-F]{6}$/.test(n)) return false; // a bare hex colour, never a person
    return !skip.has(n) && !aliasPairs.has(n) && !aliasWords.has(n);
  });

  const leaks = names.length + raw.ids.length + raw.phones.length + raw.survived.length;
  return { names, ids: raw.ids, phones: raw.phones, survived: raw.survived, singles, leaks };
}

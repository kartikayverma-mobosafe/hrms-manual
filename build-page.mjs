// Builds the handbook: one page carrying both languages, switched in the
// browser. Nothing is fetched at runtime — a reader on a phone in a yard with
// one bar should get the whole thing in one request, so both languages ship
// inline and the toggle only changes which of them is displayed.
//
// Screen and button names stay in English in the Hindi text. The interface is
// in English; a translated label would send somebody hunting for a control
// that is not there.
//
// Sources: narration{,.hi}.json for chapters, roles{,.hi}.json for the ladder,
// lang.json for everything else. Never edit the HTML.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const OUT = 'D:/Mobosafe/employee-manual';
const read = (f) => JSON.parse(fs.readFileSync(`${OUT}/${f}`, 'utf8'));

const L = read('lang.json');
const man = read('tour-manifest.json').filter((r) => r.ok);
const NAR = { en: read('narration.json'), hi: read('narration.hi.json') };
const ROLES = { en: read('roles.json'), hi: read('roles.hi.json') };
const LANGS = ['en', 'hi'];
const DIR = { en: 'mp4', hi: 'mp4-hi' };

const byId = Object.fromEntries(man.map((r) => [r.id, r]));

const dur = (f) => {
  try {
    return parseFloat(execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${OUT}/${f}"`).toString().trim());
  } catch {
    return 0;
  }
};
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Wrap literal UI labels in mono so "press Create Employee" reads as a control.
// The list is English because the labels are English in both narrations.
const LABELS = [
  'Mark all present', 'Create Employee', 'New payroll run', 'Save Code Format', 'Save Face Match Settings',
  'Record new terms', 'Download Template', 'Apply for leave', 'New Department', 'New Employee', 'New Penalty',
  'New Holiday', 'New Claim', 'New Type', 'New Rate', 'Save settings', 'Export Excel', 'FORM-II', 'Payslips',
  'Columns', 'Refresh', 'Roster', 'Changes', 'Balances', 'Categories', 'Advances', 'Download', 'Run', 'Clear',
  'Edit', 'Upload', 'Suspend', 'Deactivate', 'Approve', 'Reject', 'Audit',
];
function mono(s) {
  let out = esc(s);
  for (const l of LABELS.sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`(?<!<code>)\\b${l.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&')}\\b`, 'g'),
      `<code>${l}</code>`);
  }
  return out;
}

/**
 * One element per language, marked so the page can show one and hide the other.
 * `pick` receives the language code and returns that language's inner HTML.
 */
const both = (tag, cls, pick) => LANGS
  .map((code) => `<${tag} class="${cls ? cls + ' ' : ''}lx lx-${code}" lang="${L[code].htmlLang}">${pick(code)}</${tag}>`)
  .join('');

// --- chapter data, per language -------------------------------------------
const chapters = {};   // chapters[lang][id]
const totals = {};     // totals[lang] in seconds
for (const code of LANGS) {
  chapters[code] = {};
  totals[code] = 0;
  for (const c of NAR[code]) {
    const r = byId[c.id];
    if (!r) continue;
    const mp4 = `${DIR[code]}/${c.id}.mp4`;
    const d = dur(mp4);
    totals[code] += d;
    chapters[code][c.id] = { ...c, mp4, secs: d, shots: r.shots, route: r.url };
  }
}
const ids = Object.keys(chapters.en);

const files = {};
for (const code of LANGS) {
  for (const c of Object.values(chapters[code])) {
    files[c.mp4] = c.mp4;
    for (const s of c.shots) files[`shots/${s}`] = `shots/${s}`;
  }
}

// --- contents --------------------------------------------------------------
const contents = L.parts.map((p) => {
  const rows = (code) => p.ids.filter((id) => chapters[code][id]).map((id) => {
    const c = chapters[code][id];
    return `<li><a href="#${id}"><span class="slate">${id.toUpperCase()}</span> ${esc(c.title)}`
      + `<span class="toc-time num">${mmss(c.secs)}</span></a></li>`;
  }).join('');
  if (!p.ids.some((id) => chapters.en[id])) return '';
  return `
  <div class="toc-part">
    <div class="toc-head">
      ${both('span', 'toc-n', (code) => esc(p[code].n))}
      ${both('span', 'toc-role', (code) => esc(p[code].role))}
    </div>
    ${both('ol', 'toc-list', rows)}
  </div>`;
}).join('\n');

// --- the chapters themselves ----------------------------------------------
const body = L.parts.map((p) => {
  const present = p.ids.filter((id) => chapters.en[id]);
  if (!present.length) return '';
  const articles = present.map((id) => {
    const en = chapters.en[id];
    const lower = en.shots.find((s) => s.includes('-lower'));
    // One video per language: same screen, different voice over it. preload
    // is off, so the hidden one costs nothing until somebody switches to it.
    const video = LANGS.map((code) => `
        <video class="lx lx-${code}" controls preload="none" playsinline poster="shots/${esc(en.shots[0])}">
          <source src="${chapters[code][id].mp4}" type="video/mp4">
        </video>`).join('');
    return `
  <article class="chapter" id="${id}">
    <header class="ch-head">
      <span class="slate">${id.toUpperCase()}</span>
      ${both('h3', null, (code) => esc(chapters[code][id].title))}
      ${both('span', 'ch-time num', (code) => mmss(chapters[code][id].secs))}
      <code class="route">${esc(en.route)}</code>
    </header>
    <figure class="media">${video}
    </figure>
    <div class="ch-body">
      <div class="do">
        ${both('h4', null, (code) => esc(L[code].doThis))}
        ${both('ol', null, (code) => chapters[code][id].steps.map((s) => `<li>${mono(s)}</li>`).join(''))}
      </div>
      <div class="said">
        ${both('h4', null, (code) => esc(L[code].voiceover))}
        ${both('p', null, (code) => esc(chapters[code][id].say))}
      </div>
    </div>
    ${lower ? `<figure class="media lower">
      <img src="shots/${esc(lower)}" alt="${esc(en.title)} — ${esc(L.en.lowerAlt)}" loading="lazy">
      ${both('figcaption', null, (code) => esc(L[code].lowerCaption))}
    </figure>` : ''}
  </article>`;
  }).join('\n');
  return `
<section class="part">
  <div class="part-rule">
    ${both('h2', null, (code) => esc(p[code].n))}
    ${both('span', 'part-role', (code) => esc(p[code].role))}
  </div>
  ${articles}
</section>`;
}).join('\n');

// --- the role ladder -------------------------------------------------------
// What a role cannot do is the half people get wrong, so it carries the same
// weight on the page as what it can.
const ladder = ROLES.en.roles.map((r, i) => {
  const at = (code) => ROLES[code].roles[i] || r;
  return `
    <li class="role">
      <div class="role-head">
        <code class="role-name">${esc(r.name)}</code>
        ${both('span', 'role-count num', (code) => (code === 'hi'
    ? `${r.count} ${r.count === 1 ? 'अनुमति' : 'अनुमतियाँ'}`
    : `${r.count} permission${r.count === 1 ? '' : 's'}`))}
      </div>
      ${both('p', 'role-what', (code) => esc(at(code).what))}
      <div class="role-grid">
        <div class="role-can">
          ${both('h4', null, (code) => esc(L[code].can))}
          ${both('ul', null, (code) => at(code).can.map((c) => `<li>${mono(c)}</li>`).join(''))}
        </div>
        <div class="role-cannot">
          ${both('h4', null, (code) => esc(L[code].cannot))}
          ${both('ul', null, (code) => at(code).cannot.map((c) => `<li>${mono(c)}</li>`).join(''))}
        </div>
      </div>${r.watch ? `
      ${both('p', 'role-watch', (code) => `<b>${esc(L[code].watchOut)}</b> ${mono(at(code).watch)}`)}` : ''}
    </li>`;
}).join('');

const roleRules = (code) => ROLES[code].rules
  .map((r) => `<li><b>${esc(r.title)}.</b> ${mono(r.body)}</li>`).join('');

// --- page ------------------------------------------------------------------
const metaRow = (key, pick) => `<div>
        ${both('dt', null, (code) => esc(L[code].meta[key]))}
        ${both('dd', null, pick)}
      </div>`;

const page = `<script>
  // Runs before anything paints, so the page never shows both languages.
  // ?lang= wins, then a remembered choice, then the browser's own preference.
  (function () {
    var a = (location.search.match(/[?&]lang=(en|hi)/) || [])[1];
    var s = null;
    try { s = localStorage.getItem('manual-lang'); } catch (e) { /* private window */ }
    var n = (navigator.language || '').slice(0, 2) === 'hi' ? 'hi' : 'en';
    var code = a || s || n;
    document.documentElement.setAttribute('data-lang', code === 'hi' ? 'hi' : 'en');
  })();
</script>
<title>${esc(L.en.docTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Literata:opsz,wght@7..72,400;7..72,500&family=Noto+Sans+Devanagari:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  :root {
    --paper:#F3F6F7; --card:#FFFFFF; --sunk:#E8EEEF;
    --ink:#101619; --ink-2:#47565C; --ink-3:#78888E;
    --rule:#D2DBDE; --rule-2:#E5EBED;
    --accent:#0E6E69; --accent-soft:#E0EFEE;
    --warn:#8E5504; --warn-bg:#FAF0DB; --warn-rule:#DFB872;
    --display:'Archivo','Noto Sans Devanagari','Helvetica Neue',system-ui,sans-serif;
    --prose:'Literata','Noto Sans Devanagari',Georgia,serif;
    --mono:'JetBrains Mono','Noto Sans Devanagari',ui-monospace,Consolas,monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper:#0D1316; --card:#151D20; --sunk:#1B2427;
      --ink:#E5ECEE; --ink-2:#9CADB2; --ink-3:#76878C;
      --rule:#243033; --rule-2:#1E282B;
      --accent:#4FB5AD; --accent-soft:#12272A;
      --warn:#DCA03A; --warn-bg:#241C10; --warn-rule:#5A4520;
    }
  }
  :root[data-theme="dark"] {
    --paper:#0D1316; --card:#151D20; --sunk:#1B2427;
    --ink:#E5ECEE; --ink-2:#9CADB2; --ink-3:#76878C;
    --rule:#243033; --rule-2:#1E282B;
    --accent:#4FB5AD; --accent-soft:#12272A;
    --warn:#DCA03A; --warn-bg:#241C10; --warn-rule:#5A4520;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:var(--prose); font-size:16px; line-height:1.6; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:64rem; margin:0 auto; padding-inline:20px; padding-block:44px 76px; display:flex; flex-direction:column; gap:44px; }
  .num { font-variant-numeric:tabular-nums; }
  code { font-family:var(--mono); font-size:.84em; background:var(--sunk); border:1px solid var(--rule-2); border-radius:3px; padding:.1em .34em; color:var(--ink); }

  /* Both languages ship inline. Only the one not in use is hidden, so every
     element keeps whatever display its own rule gives it. */
  :root[data-lang="en"] .lx-hi, :root[data-lang="hi"] .lx-en { display:none; }
  /* Devanagari sits lower and needs more room between lines than Literata. */
  :root[data-lang="hi"] body, [lang="hi-IN"] { line-height:1.75; }
  [lang="hi-IN"] code { font-size:.92em; }
  /* The small-caps label treatment is a Latin idea: Devanagari has no upper
     case, and letter-spacing pulls its conjuncts apart. */
  [lang="hi-IN"], [lang="hi-IN"] * { letter-spacing:normal; text-transform:none; }

  .langbar { display:flex; align-items:center; gap:8px; }
  .langbar .who { font-family:var(--display); font-weight:600; font-size:.62rem; letter-spacing:.13em; text-transform:uppercase; color:var(--ink-3); margin-right:2px; }
  .langbtn { font-family:var(--display); font-weight:600; font-size:.8rem; padding:5px 13px; border:1px solid var(--rule); background:var(--card); color:var(--ink-2); border-radius:999px; cursor:pointer; line-height:1.3; }
  .langbtn:hover { border-color:var(--accent); color:var(--accent); }
  .langbtn[aria-pressed="true"] { background:var(--accent); border-color:var(--accent); color:var(--paper); }

  .eyebrow { font-family:var(--display); font-weight:600; font-size:.7rem; letter-spacing:.16em; text-transform:uppercase; color:var(--accent); }
  h1 { font-family:var(--display); font-weight:700; font-size:clamp(2rem,6.5vw,2.9rem); line-height:1.05; letter-spacing:-.015em; margin:.2em 0 0; text-wrap:balance; }
  h2 { font-family:var(--display); font-weight:700; font-size:1.35rem; margin:0; }
  h3 { font-family:var(--display); font-weight:600; font-size:1.16rem; margin:0; }
  h4 { font-family:var(--display); font-weight:600; font-size:.68rem; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-3); margin:0 0 8px; }
  header.masthead { border-top:3px solid var(--accent); padding-top:18px; }
  .masthead-top { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; }
  header.masthead .lede { margin:14px 0 0; max-width:46ch; font-size:1.07rem; color:var(--ink-2); }
  .privacy { margin:10px 0 0; font-size:.82rem; color:var(--ink-3); }
  .meta { margin-top:26px; display:grid; grid-template-columns:repeat(auto-fit,minmax(9rem,1fr)); border:1px solid var(--rule); border-radius:3px; background:var(--card); overflow:hidden; }
  .meta > div { padding:11px 14px; border-right:1px solid var(--rule-2); border-bottom:1px solid var(--rule-2); }
  .meta dt { font-family:var(--display); font-weight:600; font-size:.62rem; letter-spacing:.13em; text-transform:uppercase; color:var(--ink-3); }
  .meta dd { margin:3px 0 0; font-family:var(--mono); font-size:.85rem; font-variant-numeric:tabular-nums; }
  .toc { display:flex; flex-direction:column; gap:18px; }
  .toc-part { display:flex; flex-direction:column; gap:6px; }
  .toc-head { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; border-bottom:1px solid var(--rule); padding-bottom:4px; }
  .toc-n { font-family:var(--display); font-weight:700; font-size:.95rem; }
  .toc-role { font-family:var(--mono); font-size:.68rem; color:var(--ink-3); }
  ol.toc-list { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(auto-fit,minmax(17rem,1fr)); gap:1px 18px; }
  ol.toc-list a { display:flex; align-items:baseline; gap:9px; padding:4px 0; text-decoration:none; color:var(--ink-2); }
  ol.toc-list a:hover { color:var(--accent); }
  .toc-time { margin-left:auto; font-family:var(--mono); font-size:.72rem; color:var(--ink-3); }
  .slate { font-family:var(--mono); font-weight:500; font-size:.72rem; color:var(--accent); letter-spacing:.02em; }
  .part { display:flex; flex-direction:column; gap:26px; }
  .part-rule { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; border-bottom:2px solid var(--accent); padding-bottom:7px; }
  .part-rule h2 { flex:1 1 12rem; }
  .part-role { font-family:var(--mono); font-size:.7rem; color:var(--ink-3); }
  .chapter { display:flex; flex-direction:column; gap:14px; padding-bottom:26px; border-bottom:1px solid var(--rule-2); scroll-margin-top:20px; }
  .ch-head { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
  .ch-head h3 { flex:0 1 auto; }
  .ch-time { font-family:var(--mono); font-size:.76rem; color:var(--ink-3); }
  .route { flex-basis:100%; font-size:.76rem; color:var(--accent); background:var(--accent-soft); border-color:transparent; align-self:flex-start; }
  figure.media { margin:0; }
  figure.media video, figure.media img { display:block; width:100%; max-width:100%; height:auto; border:1px solid var(--rule); border-radius:4px; background:var(--sunk); }
  figure.media.lower { margin-top:4px; }
  figure.media figcaption { margin-top:6px; font-size:.8rem; color:var(--ink-3); font-family:var(--display); }
  .ch-body { display:grid; grid-template-columns:1fr 1fr; gap:22px; }
  .do ol { margin:0; padding-left:1.25rem; display:flex; flex-direction:column; gap:6px; }
  .do li { color:var(--ink-2); }
  .said p { margin:0; color:var(--ink-2); font-style:italic; border-left:2px solid var(--accent); padding-left:13px; }
  [lang="hi-IN"].said p, .said p[lang="hi-IN"] { font-style:normal; }
  .roles { display:flex; flex-direction:column; gap:20px; }
  .roles-lede { margin:0; max-width:60ch; color:var(--ink-2); }
  ol.ladder { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:1px; background:var(--rule-2); border:1px solid var(--rule); border-radius:3px; overflow:hidden; }
  .role { background:var(--card); padding:16px 18px; display:flex; flex-direction:column; gap:10px; }
  .role-head { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
  .role-name { font-size:.8rem; font-weight:500; background:var(--accent-soft); border-color:transparent; color:var(--accent); }
  .role-count { margin-left:auto; font-family:var(--mono); font-size:.7rem; color:var(--ink-3); }
  .role-what { margin:0; color:var(--ink); font-size:.97rem; }
  .role-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .role-grid ul { margin:0; padding-left:1.05rem; display:flex; flex-direction:column; gap:5px; }
  .role-grid li { color:var(--ink-2); font-size:.92rem; }
  .role-cannot li::marker { color:var(--warn); }
  .role-watch { margin:0; font-size:.88rem; color:var(--ink-2); background:var(--warn-bg); border-left:2px solid var(--warn-rule); padding:9px 12px; border-radius:0 3px 3px 0; }
  .role-watch b { font-family:var(--display); color:var(--warn); }
  .platform { margin:0; font-size:.9rem; color:var(--ink-2); border-left:2px solid var(--rule); padding-left:13px; }
  .warn { background:var(--warn-bg); border:1px solid var(--warn-rule); border-radius:3px; padding:18px 20px; display:flex; flex-direction:column; gap:12px; }
  .warn h2 { font-size:1.15rem; }
  .warn ul, ul.role-rules { margin:0; padding-left:1.1rem; display:flex; flex-direction:column; gap:10px; }
  .warn li { color:var(--ink-2); }
  .warn b, ul.role-rules b { font-family:var(--display); font-weight:700; color:var(--ink); }
  ul.role-rules li { color:var(--ink-2); font-size:.93rem; }
  footer.colophon { border-top:1px solid var(--rule); padding-top:16px; font-family:var(--mono); font-size:.73rem; color:var(--ink-3); display:flex; flex-wrap:wrap; gap:4px 18px; }
  @media (max-width:46rem) { .ch-body, .role-grid { grid-template-columns:1fr; gap:16px; } }
  @media (prefers-reduced-motion:reduce) { * { transition:none!important; animation:none!important; } }
</style>

<div class="wrap">
  <header class="masthead">
    <div class="masthead-top">
      ${both('div', 'eyebrow', (code) => esc(L[code].eyebrow))}
      <div class="langbar">
        <span class="who">Language</span>
        <button class="langbtn" type="button" data-set="en" aria-pressed="true">English</button>
        <button class="langbtn" type="button" data-set="hi" aria-pressed="false" lang="hi-IN">हिन्दी</button>
      </div>
    </div>
    ${both('h1', null, (code) => esc(L[code].h1))}
    ${both('p', 'lede', (code) => esc(L[code].lede))}
    ${both('p', 'privacy', (code) => esc(L[code].privacy))}
    <dl class="meta">
      ${metaRow('chapters', () => ids.length)}
      ${metaRow('runtime', (code) => mmss(totals[code]))}
      ${metaRow('module', () => '/employee')}
      ${metaRow('voice', (code) => esc(L[code].voiceName))}
      ${metaRow('captured', (code) => esc(L[code].capturedValue))}
      ${metaRow('period', (code) => esc(L[code].periodValue))}
    </dl>
  </header>

  <nav class="toc">
    ${both('h2', null, (code) => esc(L[code].contents))}
    <div class="toc-part">
      <div class="toc-head">
        ${both('span', 'toc-n', (code) => esc(L[code].rolesNav))}
        ${both('span', 'toc-role', (code) => `${ROLES[code].roles.length} ${code === 'hi' ? 'भूमिकाएँ' : 'roles'}`)}
      </div>
      ${both('ol', 'toc-list', (code) => `<li><a href="#roles"><span class="slate">ROLES</span>`
        + `<span>${esc(L[code].rolesNavSub)}</span></a></li>`)}
    </div>
${contents}
  </nav>

  <section class="roles" id="roles">
    <div class="part-rule">
      ${both('h2', null, (code) => esc(L[code].rolesHeading))}
      ${both('span', 'part-role', (code) => `${ROLES[code].roles.length} ${esc(L[code].rolesCount)}`)}
    </div>
    ${both('p', 'roles-lede', (code) => esc(ROLES[code].note))}
    <ol class="ladder">${ladder}
    </ol>
    ${both('p', 'platform', (code) => `<b>SUPER_ADMIN</b> ${code === 'hi' ? 'और' : 'and'} <b>FLEET_ADMIN</b> `
      + `${esc(L[code].platformLead)} ${esc(ROLES[code].platform.what)}`)}
    ${both('ul', 'role-rules', roleRules)}
  </section>

${body}

  <section class="warn">
    ${both('h2', null, (code) => esc(L[code].warnHeading))}
    ${both('ul', null, (code) => L[code].warnings.map((w) => `<li>${w}</li>`).join(''))}
  </section>

  <footer class="colophon">
    ${both('span', null, (code) => `${esc(L[code].colophonLeft)} &middot; ${ids.length} `
      + `${esc(L[code].colophonChapters)} &middot; ${mmss(totals[code])}`)}
    ${both('span', null, (code) => esc(L[code].colophonRight))}
  </footer>
</div>

<script>
  // The toggle. Remembers the choice, and keeps the document's own lang
  // attribute honest so a screen reader switches voice with the page.
  (function () {
    var root = document.documentElement;
    var LANG = { en: 'en-IN', hi: 'hi-IN' };
    var TITLE = ${JSON.stringify({ en: L.en.docTitle, hi: L.hi.docTitle })};
    function set(code, remember) {
      if (!LANG[code]) code = 'en';
      root.setAttribute('data-lang', code);
      root.setAttribute('lang', LANG[code]);
      document.title = TITLE[code];
      var btns = document.querySelectorAll('.langbtn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].setAttribute('aria-pressed', String(btns[i].dataset.set === code));
      }
      if (remember) { try { localStorage.setItem('manual-lang', code); } catch (e) { /* private window */ } }
    }
    // The early script already chose; this only syncs title and buttons.
    set(root.getAttribute('data-lang') || 'en', false);
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.langbtn') : null;
      if (!b) return;
      // A video mid-play should not keep talking from behind the hidden copy.
      var vids = document.querySelectorAll('video');
      for (var i = 0; i < vids.length; i++) { if (!vids[i].paused) vids[i].pause(); }
      set(b.dataset.set, true);
    });
  })();
</script>
`;

fs.writeFileSync(OUT + '/handbook.html', page);
// GitHub Pages serves the repository root, so the handbook is also written as
// index.html. Same bytes, two names: one people know, one the web server wants.
fs.writeFileSync(OUT + '/index.html', page);
fs.writeFileSync(OUT + '/handbook-files.json', JSON.stringify(files, null, 2));
console.log(`handbook.html + index.html — ${ids.length} chapters`);
for (const code of LANGS) console.log(`  ${code}: ${mmss(totals[code])}`);
console.log(`supporting files: ${Object.keys(files).length}`);

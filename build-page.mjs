import fs from 'node:fs';
import { execSync } from 'node:child_process';

const OUT = 'D:/Mobosafe/employee-manual';
const nar = JSON.parse(fs.readFileSync(OUT + '/narration.json', 'utf8'));
const man = JSON.parse(fs.readFileSync(OUT + '/tour-manifest.json', 'utf8')).filter((r) => r.ok);
const roles = JSON.parse(fs.readFileSync(OUT + '/roles.json', 'utf8'));
const byId = Object.fromEntries(man.map((r) => [r.id, r]));

const PARTS = [
  { n: 'Start here', role: 'Any HR role', ids: ['em-01'] },
  { n: 'Set up the org', role: 'HR_ADMIN', ids: ['em-02', 'em-03', 'em-04', 'em-05', 'em-05b', 'em-06', 'em-07'] },
  { n: 'Put people on the system', role: 'HR_MANAGER', ids: ['em-08', 'em-09', 'em-10', 'em-12'] },
  { n: 'Run the month', role: 'ATTENDANCE_TAKER → BRANCH_SUPERVISOR', ids: ['em-13', 'em-14', 'em-15', 'em-16', 'em-17', 'em-18'] },
  { n: 'Close the month', role: 'HR_HEAD', ids: ['em-19', 'em-19b', 'em-20', 'em-21'] },
  { n: 'What the employee sees', role: 'EMPLOYEE', ids: ['em-22'] },
];

const dur = (f) => {
  try {
    return parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${OUT}/${f}"`).toString().trim());
  } catch {
    return 0;
  }
};
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Wrap literal UI labels in mono so "press Create Employee" reads as a control.
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
    out = out.replace(new RegExp(`(?<!<code>)\\b${l.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&')}\\b`, 'g'), `<code>${l}</code>`);
  }
  return out;
}

let totalSecs = 0;
const chapters = {};
for (const c of nar) {
  const r = byId[c.id];
  if (!r) continue;
  const mp4 = `mp4/${c.id}.mp4`;
  const d = dur(mp4);
  totalSecs += d;
  chapters[c.id] = { ...c, mp4, secs: d, shots: r.shots, route: r.url };
}

const files = {};
for (const c of Object.values(chapters)) {
  files[c.mp4] = c.mp4;
  for (const s of c.shots) files[`shots/${s}`] = `shots/${s}`;
}

const contents = PARTS.map(
  (p) => `
  <div class="toc-part">
    <div class="toc-head"><span class="toc-n">${esc(p.n)}</span><span class="toc-role">${esc(p.role)}</span></div>
    <ol class="toc-list">
      ${p.ids
        .filter((id) => chapters[id])
        .map((id) => `<li><a href="#${id}"><span class="slate">${id.toUpperCase()}</span> ${esc(chapters[id].title)}<span class="toc-time num">${mmss(chapters[id].secs)}</span></a></li>`)
        .join('\n      ')}
    </ol>
  </div>`,
).join('\n');

const body = PARTS.map((p) => {
  const chs = p.ids.filter((id) => chapters[id]).map((id) => chapters[id]);
  if (!chs.length) return '';
  return `
<section class="part">
  <div class="part-rule">
    <h2>${esc(p.n)}</h2>
    <span class="part-role">${esc(p.role)}</span>
  </div>
  ${chs
    .map((c) => {
      const lower = c.shots.find((s) => s.includes('-lower'));
      return `
  <article class="chapter" id="${c.id}">
    <header class="ch-head">
      <span class="slate">${c.id.toUpperCase()}</span>
      <h3>${esc(c.title)}</h3>
      <span class="ch-time num">${mmss(c.secs)}</span>
      <code class="route">${esc(c.route)}</code>
    </header>
    <figure class="media">
      <video controls preload="none" playsinline poster="shots/${esc(c.shots[0])}">
        <source src="${c.mp4}" type="video/mp4">
      </video>
    </figure>
    <div class="ch-body">
      <div class="do">
        <h4>Do this</h4>
        <ol>${c.steps.map((s) => `<li>${mono(s)}</li>`).join('')}</ol>
      </div>
      <div class="said">
        <h4>What the voiceover says</h4>
        <p>${esc(c.say)}</p>
      </div>
    </div>
    ${lower ? `<figure class="media lower"><img src="shots/${esc(lower)}" alt="${esc(c.title)} — lower part of the screen" loading="lazy"><figcaption>Further down the same screen</figcaption></figure>` : ''}
  </article>`;
    })
    .join('\n')}
</section>`;
}).join('\n');

// The ladder, lowest rung first. What a role cannot do is the half people get
// wrong, so it is given the same weight on the page as what it can.
const ladder = roles.roles.map((r) => `
    <li class="role">
      <div class="role-head">
        <code class="role-name">${esc(r.name)}</code>
        <span class="role-count num">${r.count} permission${r.count === 1 ? '' : 's'}</span>
      </div>
      <p class="role-what">${esc(r.what)}</p>
      <div class="role-grid">
        <div class="role-can">
          <h4>Can</h4>
          <ul>${r.can.map((c) => `<li>${mono(c)}</li>`).join('')}</ul>
        </div>
        <div class="role-cannot">
          <h4>Cannot</h4>
          <ul>${r.cannot.map((c) => `<li>${mono(c)}</li>`).join('')}</ul>
        </div>
      </div>${r.watch ? `
      <p class="role-watch"><b>Watch out:</b> ${mono(r.watch)}</p>` : ''}
    </li>`).join('');

const roleRules = roles.rules.map((r) => `
        <li><b>${esc(r.title)}.</b> ${mono(r.body)}</li>`).join('');

const page = `<title>Employee Module Handbook</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Literata:opsz,wght@7..72,400;7..72,500&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  :root {
    --paper:#F3F6F7; --card:#FFFFFF; --sunk:#E8EEEF;
    --ink:#101619; --ink-2:#47565C; --ink-3:#78888E;
    --rule:#D2DBDE; --rule-2:#E5EBED;
    --accent:#0E6E69; --accent-soft:#E0EFEE;
    --warn:#8E5504; --warn-bg:#FAF0DB; --warn-rule:#DFB872;
    --display:'Archivo','Helvetica Neue',system-ui,sans-serif;
    --prose:'Literata',Georgia,serif;
    --mono:'JetBrains Mono',ui-monospace,Consolas,monospace;
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
  .eyebrow { font-family:var(--display); font-weight:600; font-size:.7rem; letter-spacing:.16em; text-transform:uppercase; color:var(--accent); }
  h1 { font-family:var(--display); font-weight:700; font-size:clamp(2rem,6.5vw,2.9rem); line-height:1.05; letter-spacing:-.015em; margin:.2em 0 0; text-wrap:balance; }
  h2 { font-family:var(--display); font-weight:700; font-size:1.35rem; margin:0; }
  h3 { font-family:var(--display); font-weight:600; font-size:1.16rem; margin:0; }
  h4 { font-family:var(--display); font-weight:600; font-size:.68rem; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-3); margin:0 0 8px; }
  header.masthead { border-top:3px solid var(--accent); padding-top:18px; }
  header.masthead .lede { margin:14px 0 0; max-width:46ch; font-size:1.07rem; color:var(--ink-2); }
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
  ul.role-rules li { color:var(--ink-2); font-size:.93rem; }
  ul.role-rules b { font-family:var(--display); font-weight:700; color:var(--ink); }
  .warn li { color:var(--ink-2); }
  .warn b { font-family:var(--display); font-weight:700; color:var(--ink); }
  footer.colophon { border-top:1px solid var(--rule); padding-top:16px; font-family:var(--mono); font-size:.73rem; color:var(--ink-3); display:flex; flex-wrap:wrap; gap:4px 18px; }
  @media (max-width:46rem) { .ch-body, .role-grid { grid-template-columns:1fr; gap:16px; } }
  @media (prefers-reduced-motion:reduce) { * { transition:none!important; animation:none!important; } }
</style>

<div class="wrap">
  <header class="masthead">
    <div class="eyebrow">Operating manual</div>
    <h1>Employee Module Handbook</h1>
    <p class="lede">Every screen in Employee Management, in the order you would actually use them &mdash; set the org up, put people on, run the month, close it. Each chapter has the real screen on video with narration, and the steps in writing.</p>
    <dl class="meta">
      <div><dt>Chapters</dt><dd>${Object.keys(chapters).length}</dd></div>
      <div><dt>Runtime</dt><dd>${mmss(totalSecs)}</dd></div>
      <div><dt>Module</dt><dd>/employee</dd></div>
      <div><dt>Voice</dt><dd>Neerja en-IN</dd></div>
      <div><dt>Captured</dt><dd>85 staff</dd></div>
      <div><dt>Period</dt><dd>Sep 2026</dd></div>
    </dl>
  </header>

  <nav class="toc">
    <h2>Contents</h2>
    <div class="toc-part">
      <div class="toc-head"><span class="toc-n">Who can do what</span>
        <span class="toc-role">${roles.roles.length} roles</span></div>
      <ol class="toc-list"><li><a href="#roles">
        <span class="slate">ROLES</span><span>The ladder, and what each rung cannot do</span></a></li></ol>
    </div>
${contents}
  </nav>

  <section class="roles" id="roles">
    <div class="part-rule">
      <h2>Who can do what</h2>
      <span class="part-role">${roles.roles.length} roles &middot; lowest rung first</span>
    </div>
    <p class="roles-lede">${esc(roles.note)}</p>
    <ol class="ladder">${ladder}
    </ol>
    <p class="platform"><b>SUPER_ADMIN</b> and <b>FLEET_ADMIN</b> sit outside the ladder. ${esc(roles.platform.what)}</p>
    <ul class="role-rules">${roleRules}
    </ul>
  </section>

${body}

  <section class="warn">
    <h2>Things that will trip you up</h2>
    <ul>
      <li><b>Payroll runs and pay revisions need two approvals.</b> L1 then L2. There is no different-person rule, so the same login can clear both &mdash; but both must happen before payslips are final.</li>
      <li><b>A penalty needs only one approver.</b> Do not wait for a second signature. The two-person rule belongs to payments in the Accounting module, not here.</li>
      <li><b>Payroll settings fall back key by key.</b> A branch value overrides the organisation for that one key and nothing else. Set the organisation first, then override only what genuinely differs.</li>
      <li><b>Set the employee-code prefixes before you add anybody.</b> The code is built from the organisation prefix plus the branch short code. Miss a segment and it silently reverts to the old plain format.</li>
      <li><b>Check the muster before the payroll run, not after.</b> The totals on the right of the Muster Roll are what everybody is paid against.</li>
      <li><b>An employee login reaches My HR and nothing else.</b> Their own payslips, attendance, leave and details. No other employee, no payroll, no settings.</li>
    </ul>
  </section>

  <footer class="colophon">
    <span>Employee Management &middot; ${Object.keys(chapters).length} chapters &middot; ${mmss(totalSecs)}</span>
    <span>Captured from the running module</span>
  </footer>
</div>
`;

fs.writeFileSync(OUT + '/handbook.html', page);
// GitHub Pages serves the repository root, so the handbook is also written as
// index.html. Same bytes, two names: one people know, one the web server wants.
fs.writeFileSync(OUT + '/index.html', page);
fs.writeFileSync(OUT + '/handbook-files.json', JSON.stringify(files, null, 2));
console.log(`handbook.html written — ${Object.keys(chapters).length} chapters, ${mmss(totalSecs)}`);
console.log(`supporting files: ${Object.keys(files).length}`);

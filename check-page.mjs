// Loads the built handbook and proves the language toggle actually works:
// one language visible at a time, the right video behind each, the choice
// remembered, and no sideways scroll on a phone.
import { chromium } from 'playwright';

const URL = 'file:///D:/Mobosafe/employee-manual/index.html';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
let bad = 0;
const ok = (cond, label, extra = '') => {
  if (!cond) bad++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
};

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);

const state = () => page.evaluate(() => {
  const vis = (el) => el.offsetParent !== null || getComputedStyle(el).display !== 'none';
  const en = [...document.querySelectorAll('.lx-en')];
  const hi = [...document.querySelectorAll('.lx-hi')];
  const video = [...document.querySelectorAll('figure.media video')].filter(vis);
  return {
    lang: document.documentElement.getAttribute('data-lang'),
    htmlLang: document.documentElement.getAttribute('lang'),
    title: document.title,
    enVisible: en.filter(vis).length,
    hiVisible: hi.filter(vis).length,
    enTotal: en.length,
    hiTotal: hi.length,
    visibleVideos: video.length,
    firstVideoSrc: video[0] ? video[0].querySelector('source').getAttribute('src') : null,
    h1: (document.querySelector('h1.lx-en, h1.lx-hi') && [...document.querySelectorAll('h1')]
      .filter(vis).map((e) => e.textContent.trim())[0]) || null,
    pressed: [...document.querySelectorAll('.langbtn')]
      .map((b) => `${b.dataset.set}:${b.getAttribute('aria-pressed')}`).join(' '),
  };
});

const a = await state();
console.log('\n--- default ---');
ok(a.lang === 'en', 'defaults to English', a.lang);
ok(a.enVisible === a.enTotal, 'every English element shown', `${a.enVisible}/${a.enTotal}`);
ok(a.hiVisible === 0, 'no Hindi element shown', `${a.hiVisible} visible`);
ok(a.visibleVideos === 23, 'one video per chapter visible', String(a.visibleVideos));
ok((a.firstVideoSrc || '').startsWith('mp4/'), 'English video behind chapter 1', a.firstVideoSrc);
ok(a.pressed === 'en:true hi:false', 'toggle reflects state', a.pressed);

await page.click('.langbtn[data-set="hi"]');
await page.waitForTimeout(300);
const b = await state();
console.log('\n--- after switching to Hindi ---');
ok(b.lang === 'hi', 'switches to Hindi', b.lang);
ok(b.htmlLang === 'hi-IN', 'document lang follows', b.htmlLang);
ok(b.hiVisible === b.hiTotal, 'every Hindi element shown', `${b.hiVisible}/${b.hiTotal}`);
ok(b.enVisible === 0, 'no English element shown', `${b.enVisible} visible`);
ok(b.visibleVideos === 23, 'still one video per chapter', String(b.visibleVideos));
ok((b.firstVideoSrc || '').startsWith('mp4-hi/'), 'Hindi video behind chapter 1', b.firstVideoSrc);
ok(/[\u0900-\u097F]/.test(b.h1 || ''), 'heading is in Devanagari', b.h1);
ok(b.title !== a.title, 'tab title changed too', b.title);

// remembered across a reload
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);
const c = await state();
console.log('\n--- after reload ---');
ok(c.lang === 'hi', 'choice remembered', c.lang);

// ?lang= wins over the remembered choice
await page.goto(URL + '?lang=en', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);
const d = await state();
ok(d.lang === 'en', '?lang=en overrides the remembered choice', d.lang);

// phone width, in both languages
console.log('\n--- 400px wide ---');
await page.setViewportSize({ width: 400, height: 800 });
for (const code of ['en', 'hi']) {
  await page.goto(URL + '?lang=' + code, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const over = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  ok(over.doc <= over.win + 1, `${code}: no sideways scroll`, `${over.doc} vs ${over.win}`);
}

await browser.close();
console.log(`\n${bad === 0 ? 'ALL CHECKS PASSED' : bad + ' CHECK(S) FAILED'}`);
process.exit(bad === 0 ? 0 : 1);

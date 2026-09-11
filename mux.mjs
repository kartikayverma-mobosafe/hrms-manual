// Turns the silent screen captures and the narration into the deliverable:
// one narrated mp4 per chapter per language, then the whole manual with
// chapter markers.
//
// The screen capture is shared between languages — the same recording of the
// same English interface, with a different voice over it. Only the audio and
// the timings differ, which is why there is one video/ folder and two mp4 ones.
//
// A chapter lasts as long as its narration plus a short tail. The capture is
// almost always shorter than the words — a screen takes ten seconds to show and
// forty to explain — so the last frame is held for the remainder rather than the
// clip being sped up or the audio cut off. Hindi runs longer than English for
// the same chapter, so it simply holds the frame a little longer.
//
// Run this after voice.mjs, and only once verify-redaction.mjs reports CLEAN:
// these files are what leaves the building, and re-muxing is the only thing
// that gets a redacted capture into them.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = 'D:/Mobosafe/employee-manual';
const TAIL = 1.2; // seconds of held frame after the narration stops

const LANGS = [
  {
    code: 'en',
    voiceSuffix: '',
    dir: 'mp4',
    narration: 'narration.json',
    concat: 'concat.txt',
    chapters: 'chapters.txt',
    full: 'employee-management-manual.mp4',
  },
  {
    code: 'hi',
    voiceSuffix: '.hi',
    dir: 'mp4-hi',
    narration: 'narration.hi.json',
    concat: 'concat.hi.txt',
    chapters: 'chapters.hi.txt',
    full: 'employee-management-manual-hi.mp4',
  },
];

const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'tour-manifest.json'), 'utf8'));

const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' });
const seconds = (file) => Number(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());

const only = process.argv[2]; // optional: "hi" or "en"

for (const lang of LANGS) {
  if (only && only !== lang.code) continue;
  const narrationPath = path.join(OUT, lang.narration);
  if (!fs.existsSync(narrationPath)) {
    console.log(`skip ${lang.code}: no ${lang.narration}`);
    continue;
  }
  const narration = JSON.parse(fs.readFileSync(narrationPath, 'utf8'));
  const titleOf = Object.fromEntries(narration.map((n) => [n.id, n.title]));
  fs.mkdirSync(path.join(OUT, lang.dir), { recursive: true });
  console.log(`\n${lang.code} -> ${lang.dir}/`);

  const made = [];
  for (const ch of manifest) {
    if (!ch.ok || !ch.video) {
      console.log(`  skip  ${ch.id} (not captured)`);
      continue;
    }
    const webm = path.join(OUT, 'video', ch.video);
    const mp3 = path.join(OUT, 'voice', `${ch.id}${lang.voiceSuffix}.mp3`);
    const mp4 = path.join(OUT, lang.dir, `${ch.id}.mp4`);
    if (!fs.existsSync(webm) || !fs.existsSync(mp3)) {
      console.log(`  skip  ${ch.id} (missing ${fs.existsSync(webm) ? 'voice' : 'video'})`);
      continue;
    }
    const vd = seconds(webm);
    const ad = seconds(mp3);
    const total = ad + TAIL;
    const hold = Math.max(0, total - vd);
    ff([
      '-i', webm, '-i', mp3,
      '-filter_complex',
      `[0:v]fps=30,tpad=stop_mode=clone:stop_duration=${hold.toFixed(3)},format=yuv420p[v]`,
      '-map', '[v]', '-map', '1:a',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '128k',
      '-t', total.toFixed(3), '-movflags', '+faststart',
      mp4,
    ]);
    const got = seconds(mp4);
    made.push({ id: ch.id, mp4, seconds: got });
    console.log(`  ok    ${ch.id.padEnd(7)} screen ${vd.toFixed(1)}s + voice ${ad.toFixed(1)}s -> ${got.toFixed(1)}s`);
  }

  if (!made.length) {
    console.error(`nothing to mux for ${lang.code}`);
    continue;
  }

  fs.writeFileSync(path.join(OUT, lang.concat),
    made.map((m) => `file '${lang.dir}/${path.basename(m.mp4)}'`).join('\n') + '\n');

  let at = 0;
  const meta = [';FFMETADATA1'];
  for (const m of made) {
    const start = Math.round(at * 1000);
    at += m.seconds;
    const end = Math.round(at * 1000);
    meta.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${start}`, `END=${end}`,
      `title=${m.id.toUpperCase()} \u2014 ${titleOf[m.id] || m.id}`);
  }
  fs.writeFileSync(path.join(OUT, lang.chapters), meta.join('\n') + '\n');

  // Every chapter came out of the same encoder, so the join is a stream copy.
  const full = path.join(OUT, lang.full);
  ff(['-f', 'concat', '-safe', '0', '-i', path.join(OUT, lang.concat),
    '-i', path.join(OUT, lang.chapters), '-map_metadata', '1',
    '-c', 'copy', '-movflags', '+faststart', full]);

  const mins = Math.floor(at / 60);
  console.log(`  ${made.length} chapters -> ${lang.full} `
    + `(${mins}m${String(Math.round(at - mins * 60)).padStart(2, '0')}s, chapter markers written)`);
}

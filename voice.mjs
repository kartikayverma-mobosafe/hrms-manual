// Renders the narration to speech, one mp3 per chapter per language.
//
// English is Neerja, Hindi is Swara — both Indian, both female, so switching
// language changes the words and not the person. The .txt beside each mp3 is
// exactly what was spoken, so a clip can be checked without listening to it.
//
// The Hindi script deliberately keeps screen and button names in English:
// the interface is in English, and a viewer hunting for a translated label
// would be looking for something that is not on screen.
//
// Run after editing narration.json or narration.hi.json, then re-run mux.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = 'D:/Mobosafe/employee-manual';
const PY = path.join(OUT, 'tts-venv/Scripts/python.exe');

const LANGS = [
  { code: 'en', file: 'narration.json', voice: 'en-IN-NeerjaNeural', suffix: '' },
  { code: 'hi', file: 'narration.hi.json', voice: 'hi-IN-SwaraNeural', suffix: '.hi' },
];

const only = process.argv[2]; // optional: "hi" or "en"
fs.mkdirSync(path.join(OUT, 'voice'), { recursive: true });

for (const lang of LANGS) {
  if (only && only !== lang.code) continue;
  const src = path.join(OUT, lang.file);
  if (!fs.existsSync(src)) {
    console.log(`skip ${lang.code}: no ${lang.file}`);
    continue;
  }
  const chapters = JSON.parse(fs.readFileSync(src, 'utf8'));
  console.log(`\n${lang.code} — ${lang.voice} — ${chapters.length} chapters`);

  for (const c of chapters) {
    const mp3 = path.join(OUT, 'voice', `${c.id}${lang.suffix}.mp3`);
    const txt = path.join(OUT, 'voice', `${c.id}${lang.suffix}.txt`);
    fs.writeFileSync(txt, c.say + '\n');
    // edge-tts is a Python library; the text goes via the file to keep it off
    // the command line, where quoting would mangle Devanagari.
    execFileSync(PY, ['-c', `
import asyncio, edge_tts, io, sys
text = io.open(sys.argv[1], encoding='utf-8').read()
asyncio.run(edge_tts.Communicate(text, sys.argv[2]).save(sys.argv[3]))
`, txt, lang.voice, mp3], { stdio: 'inherit' });
    const secs = Number(execFileSync('ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3],
      { encoding: 'utf8' }).trim());
    console.log(`  ${c.id.padEnd(7)} ${secs.toFixed(1)}s`);
  }
}
console.log('\ndone — now run mux.mjs');

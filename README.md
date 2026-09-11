# Employee Management — manual

Generated against the **local** stack (dev server proxied to `localhost:8082`),
so nothing here touched production.

**Every name, phone number, UAN, ESIC and PF number on screen is fake.** Real
staff data is replaced in the page before anything is photographed, and every
frame is checked as it is taken. See *Redaction* below for what that guarantees.

## What to hand over

| File | What it is |
|---|---|
| `employee-management-manual.mp4` | The whole manual in English. 23 chapters, with chapter markers. |
| `employee-management-manual-hi.mp4` | The same manual in Hindi. |
| `handbook.html` | Written handbook, both languages in one page with a toggle — open it in a browser; each chapter plays its own clip inline. Also written as `index.html`, which is what GitHub Pages serves. |
| `mp4/em-*.mp4` | One narrated English clip per chapter, if you want to send just one screen. |
| `mp4-hi/em-*.mp4` | The same chapters in Hindi. |
| `shots/em-*.png` | 1440x900 screenshots, `-lower` = further down the same screen. |
| `voice/em-*.mp3` | English narration only (Neerja, en-IN). Drop these on a Recordly timeline as audio regions. |
| `voice/em-*.hi.mp3` | Hindi narration only (Swara, hi-IN). |
| `video/em-*.webm` | Raw silent screen capture, shared by both languages. Import these into Recordly to add zooms and annotations. |

`shots/00-login.png`, `shots/01-module-selection.png`, `shots/em-02-masters-index.png`
and the `console-*.log` / `page-*.yml` files are debris from setting the tour up.
They predate redaction, nothing references them, and they are not part of the
handover — delete them if the folder is going anywhere.

## Two languages

Everything ships in English and Hindi: the narration, the written steps, the
role ladder and every heading and warning on the page. The handbook carries
both inline and switches in the browser — no request, no reload — so the
toggle at the top of the page works offline and on a phone. The choice is
remembered, and `?lang=hi` opens the page straight into Hindi.

The screen recordings are shared. There is one capture of one English
interface, with a different voice over it, which is why there is one `video/`
folder and two `mp4` ones. **Screen and button names stay in English in the
Hindi text on purpose** — the interface is in English, and a translated label
sends somebody hunting for a control that is not there.

Sources: `narration.json` / `narration.hi.json` for the chapters,
`roles.json` / `roles.hi.json` for the ladder, and `lang.json` for every other
string on the page. Edit those, never the HTML.

Hindi runs about 15% longer than English for the same chapter, so each
language has its own chapter timings and its own full-length file.

## Who can do what

The handbook opens with the role ladder — seven rungs from `HRMS_EMPLOYEE_SELF`
up to `HEAD_OFFICE`, what each one can do and, more usefully, what it cannot.
`roles.json` is the source; it tracks `schema/changelog-24.55.0-hrms-role-set.xml`
in the backend, and the permission counts were checked against the live grants.
Edit `roles.json` and re-run `build-page.mjs`, never the HTML.

The short version: a payroll run and a pay revision each need two approvals,
L1 then L2, which is why `HR_MANAGER` (computes), `HR_ADMIN` (signs first) and
`HR_HEAD` (releases) are separate rungs. There is no different-person rule —
one login holding two of those roles can clear both levels, and the run records
who signed each. A penalty, by contrast, needs only one approver.

## Redaction

`redact.mjs` runs inside the page, installed before the app boots and kept alive
by a MutationObserver, so a React re-render cannot put a real name back.

- **Named** — every real name is swapped for a stable fake one, so one person
  stays one person across all 23 chapters. The roster comes from `harvestRoster`:
  `/api/hrms/employees` answers with a fixed 50 rows however it is asked, and
  there are 85 people, so the reports table is read as well. That is what catches
  single-word names — the shape rule needs two capitalised words to see a person,
  so someone called only by one name is invisible to it and can only be caught by
  being in the map.
- **Shaped** — anything still name-shaped that the map never heard of is aliased
  deterministically. Phone numbers and 9+ digit identifiers (UAN, ESIC, PF) are
  masked. `NOT_NAMES` holds the all-caps UI strings that are not people.
- **Checked at capture time** — `tour.mjs` audits the page immediately before
  each shot, at both scroll positions, and refuses to call the run clean
  otherwise. A later verification pass is a different page load; these are the
  frames that actually exist.
- **Checked again** — `verify-redaction.mjs` reloads all 23 routes and reports
  two independent things: anything still name-, id- or phone-shaped, and whether
  any real name from the map survived anywhere on the page.

Both read the same units the scrub rewrites — one text node, one attribute
value — never `innerText`, which joins table cells with tabs and rows with
newlines; a name pattern spanning those boundaries reports "SR NO / PHOTO /
CODE" as a person and buries the one finding that matters.

Single all-caps words are listed under `review` in `redaction-report.json` rather
than counted as leaks: shape alone cannot tell a one-word name from a branch or
a status. The list is currently ACTIVE, REGULAR, TOTAL, BELLARY, JAJPUR and
JAMSHEDPUR — statuses and branches, which belong in the manual. **Glance at that
list after every run**; a name appearing in it is a leak the shape rules cannot
see for you.

## To polish in Recordly

1. **Import Media or Recordly Project** — bring in `video/em-13-attendance.webm`.
2. Drop `voice/em-13.mp3` on as an extra audio region.
3. **Add Zoom** / **Suggest Zooms from Cursor**, **Add Annotation** for the labels.
4. **Save Recordly Project** as one `.recordly` per chapter, then **Export**.

## To re-run after a UI change

```bash
# dev server MUST have the local proxy or it writes to production
cd D:/Mobosafe/mobosafe-live-main/mobosafe-live-main-backup
VITE_PROXY_TARGET=http://localhost:8082 npx vite --port 5299 --strictPort

cd D:/Mobosafe/employee-manual
node tour.mjs              # re-capture screens + video, redacted and audited
node labels.mjs            # re-extract the real UI labels
node verify-redaction.mjs  # must print CLEAN before anything below
node voice.mjs             # render narration to speech, both languages
node mux.mjs               # chapters + full manuals + chapter markers
node build-page.mjs        # regenerate handbook.html and index.html
```

`voice.mjs` and `mux.mjs` both take an optional language: `node voice.mjs hi`
re-renders only the Hindi audio, `node mux.mjs hi` only the Hindi clips. Useful
after a wording change on one side.

`tour.mjs` and `verify-redaction.mjs` reuse the signed-in session in `.auth.json`;
set `MS_EMAIL` and `MS_PASS` for the first run or once it expires.

**Run `mux.mjs` only after `verify-redaction.mjs` prints CLEAN.** Muxing is the
only step that puts a capture into the files that leave the building, and it
copies whatever is in `video/` without looking at it.

Editing narration means re-running `voice.mjs` and then `mux.mjs`; the chapter
lasts as long as its narration plus 1.2s, with the last frame held for the
difference. Change the English and you must change `narration.hi.json` to match,
or the two languages drift apart.

## Known notes

- Chapter EM-11 (issuing logins in bulk) was skipped deliberately: the flow
  publishes credentials, which redaction does not make safe to film.
- The attendance screen shows "the face service is not responding" because the
  face-match engine is not running locally. The 55% threshold rule shown is real.
- `em-19b` uses the existing September 2026 run; no new payroll run was raised.
- EM-09's "Save" wait times out — the new-employee form labels its button
  differently. The shots are still correct; only the readiness check misses.

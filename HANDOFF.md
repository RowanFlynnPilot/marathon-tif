# HANDOFF — marathon-tif finishing session

Read CLAUDE.md first. It documents the data pipeline, the JSON contract, and
every DOR data landmine already discovered. Do not rediscover them.

## Current state (verified, do not re-verify)

- Live at https://rowanflynnpilot.github.io/marathon-tif/ via GitHub Pages
  (Actions build source). Push to `main` = deploy.
- Data is fresh and correct: 47 districts, 314 annual reports, generated
  2026-07-04. Toplines cross-checked against independent analysis:
  $1.25B increment, $24.1M taxes collected (2025), 11 of 40 short.
- `npm run build` passes. Rendering verified by screenshot at 920px,
  drilldown open, and 380px mobile.
- **Do not run `fetch_tif_data.py` this session.** It makes ~320 requests to
  DOR for data that changes a few times a year. The monthly cron owns it.

## Mission

Take this from deployed to published-in-a-WPR-story. Work the punch list in
order. Each task is small; do not expand scope. Heavy-metal football:
win the ball high, move fast, no sideways passing.

## Punch list

### P0-1: Iframe auto-resize
The drilldown rows change page height; a fixed-height iframe clips or leaves
dead space in WordPress.

- In the widget: if `window.parent !== window`, post the document height to
  the parent via `postMessage` on load and on every expand/collapse (a
  `ResizeObserver` on `document.documentElement` is the one correct
  mechanism — no polling, no scroll-event hacks). Payload:
  `{ source: "marathon-tif", height: <number> }`, targetOrigin `"*"`
  (a height integer is not sensitive).
- Add the WordPress-side listener snippet to README.md: validates
  `event.origin === "https://rowanflynnpilot.github.io"` and
  `data.source === "marathon-tif"`, then sets the iframe height.
- Accept: embed test page (a local HTML file with the iframe) grows and
  shrinks with drilldowns, no scrollbar inside the iframe.

### P0-2: Editorial annotations
DOR identifies districts only by number and statutory type. Readers know
places, not TID numbers.

- New file `src/annotations.json`: `{ "<district id>": { "name": "...",
  "note": "..." } }`. `name` is a short place label (e.g. "Downtown /
  Wausau Center site"), `note` is one plain sentence of context.
- Render: `name` appears beside the municipality line in the row; `note`
  leads the drilldown blurb. **A district with no entry renders exactly as
  today — no placeholder, no fallback text.**
- Seed only Wausau 37291-003 (downtown/former mall district) and mark the
  file header `// DRAFT — every entry requires Shereen's sign-off before
  publication`. Do not guess annotations for districts you don't know.
- Accept: annotated row shows the name, unannotated rows unchanged.

### P0-3: README.md
Public repo, currently headless. Short: what it is, live URL, data sources
(link the two DOR endpoints from CLAUDE.md), the iframe embed snippet with
the resize listener, `npm run dev` / `npm run build`, and a line that data
updates monthly via Actions. No badges, no table of contents.

### P1-1: Deep links
Reporters need to link a specific district from a story.

- On load, read `?district=<id>`; if it matches, expand that drilldown and
  `scrollIntoView`. Unknown id = ignore silently (it's a reader-supplied
  URL, not a precondition).
- Do not write to the URL on expand/collapse. Read-only.
- Accept: `/?district=37291-003` opens Wausau TID 3 expanded and scrolled to.

### P1-2: Share metadata
The standalone page will get passed around.

- OG + Twitter card tags in index.html: title "The TIF Scorecard", the dek
  sentence as description. Static OG image: build one 1200×630 PNG into
  `public/og.png` — cream field, Fraunces title, teal accent, the three
  ledger figures. Generate it once with a small throwaway script or by
  screenshotting a temporary HTML file; do not add a build-time image
  pipeline.
- Favicon: simple teal square with a white increment-bar glyph, SVG.
- Accept: tags present in built dist/index.html, image under 200KB.

### P1-3: QA sweep
- Keyboard: tab through sort pills → checkbox → rows; Enter toggles
  drilldown; focus ring visible on all (it should be — verify, don't assume).
- Contrast-check the two chips (teal-on-teal-tint, brick-on-brick-tint)
  against WCAG AA at their rendered size; darken the text color token if
  either fails. Change the token, not per-element overrides.
- "Show closed districts" on: confirm Wausau TID 5 & 6 render sanely
  (terminated, no outlook bar) and 37106-001 (no value rows at all) doesn't
  break the drilldown. These are the known edge districts.
- Accept: note pass/fail per item in the session summary; fixes are
  surgical.

## Out of scope this session — do not touch

- `fetch_tif_data.py` merge logic and the JSON contract (frozen; any change
  requires a full re-ingest to validate).
- School-district share ingestion (`tifsch.xlsx`) — future story, not now.
- Chart libraries, routers, state managers, CSS frameworks. The hand-rolled
  SVG and single stylesheet are deliberate.
- The verdict vocabulary (Ahead / Short / Closing / Closed) and the
  methodology copy. Locked — it quotes municipalities' own filings and any
  wording change is an editorial decision, not an engineering one.

## Definition of done

`npm run build` clean; every P0 shipped; P1 as far as the session allows in
order; one commit per punch-list item with the item number in the message;
push to `main` and confirm the Pages run goes green. Finish with a short
summary: what shipped, what didn't, any new landmine discovered (append
those to CLAUDE.md's gotchas — that file is the team's institutional
memory).

## Editorial note (for Rowan, not for code)

Spencer TID 3 files $0 projected future revenue against $4.0M remaining
costs. Before publication, someone should call the village: genuine
projection or sloppy form? Either answer is a paragraph in the story.

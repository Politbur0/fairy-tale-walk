# Fairy Tale Walk

An **offline-first PWA** for a self-guided choose-your-own-adventure walk along the
**Hilltop Enchanted Forest** trail. A guest scans one QR at the trailhead, the whole
app loads and caches, and from then on it works with **no cell signal**. At each trail
post the guest scans a QR (or types the post number) to unlock that waypoint's scene.
Choices are remembered and change later scenes and the ending.

Two stories share one engine: **Crown of the Mushroom King** (dark) and
*The Apprentice's Potion* (merry — to be added). Crown is built first.

## The golden rule: story is DATA, not code
All narration, choices, flags, collectibles, and endings live in
[`data/story.json`](data/story.json). `app.js` is a thin engine that reads that JSON
and renders it. **Revising the story means editing JSON — never the engine.**

### Per-waypoint render order
`text → seasonalIntro(matching season) → textCont → variant(variants) → endingVariant(endingVariants) → textAfter`,
then the choice buttons (if any), then the advance prompt.

### Condition language (for `variants` / `endingVariants`)
Evaluated top-down; first entry whose `when` matches wins, else the `default` entry.
- `allTrue: [flags]` — every listed flag is set
- `allFalse: [flags]` — every listed flag is unset
- `anyTrue` / `anyFalse` — at least one is set / unset

## What's built (steps 1–2 of the build spec)
- Full text engine: story select → `wp1…wp7` → meadow, with choices, flags,
  collectible caps (with a "2 of 3" indicator), the seasonal pond, the **Post 4
  wayfinding banner**, and flag-gated pond endings + meadow coda.
- Progress is persisted to `localStorage`, so a screen-lock or accidental reload
  mid-walk doesn't reset anything. A **Start over** control is in the top bar.
- **Service worker + manifest**: installable, full-screen, and fully offline after
  the first load.

## Not yet built (later steps)
- **Audio** (step 3): `text` blocks become MP3s via the ElevenLabs API using the
  `voice` mapping in `story.json`, written to `audio/crown/…` matching the filenames
  already referenced. The app shows an audio player per scene automatically once the
  files exist (until then the player hides itself).
- **Illustrations** (step 4): drop one image per waypoint into `img/crown/…` matching
  the `image` slots. Absent images simply don't render.
- **Apprentice** story (step 5): add a second entry under `stories` — same shape.

## Routing (QR format)
Waypoint QRs never hit the network — they only carry the id in the URL hash:

```
https://<deploy-url>/#crown/wp4      (or  #crown/4 ,  or  ?s=crown&wp=4)
```

Print each post with its number too; the in-app "enter post number" box is the
fallback when a camera won't focus. **Place each next QR only on the correct path** —
at Post 4 (the fork) that means the right-hand path only, so a wrong turn leaves
nothing to scan.

## Run locally
Any static server works (a service worker needs `http(s)://`, not `file://`):

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Quick links while testing: `#crown` (select), `#crown/wp1` … `#crown/wp7`, `#crown/meadow`.

## Regenerate the app icons
```bash
python3 icons/make_icons.py
```

## Deploy
Static site, repo root is the web root. On Netlify: connect the repo, leave the
publish directory as the root (`netlify.toml` sets it). Confirm the service worker
registers over HTTPS and the manifest installs. Generate the QR codes last, pointing
at the live URL with each waypoint id; print with the post number and laminate.

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

### Per-scene render order
`text → choice result → seasonalIntro(matching season) → textCont → variant(variants) → endingVariant(endingVariants, only after choices settle) → textAfter`,
then the choice buttons (if any), then the advance prompt or ending screen.

### Condition language (for `when` on `scenes` / `variants` / `endingVariants`)
Evaluated top-down; first entry whose `when` matches wins, else the `default` entry.
- `allTrue: [flags]` / `allFalse: [flags]` — every listed flag is set / unset
- `anyTrue` / `anyFalse` — at least one is set / unset
- `equals: { flag: value }` / `notEquals: { flag: value }` — for non-boolean flags
  like `road` (`hero`/`pawn`) and `route` (`home`/`loop`/`deep`)

### v2 structure — two roads (Crown branch blueprint)
- **`scenes`**: a waypoint may hold an array of sub-scenes picked by `when` (e.g.
  `equals road`). Each scene carries its **own** `text`/`prompt`/`choices`/`next`/
  `wayfinding`, so the same physical post tells a different story per road. The
  chosen scene is **pinned per waypoint on first entry** — a choice that flips a
  scene-selecting flag won't swap the scene out mid-visit.
- **Endings / bad-ending screen**: a scene, a chosen choice, or a picked
  `endingVariant` may carry `ending: { tone, note, exits: [...] }`. Each exit is a
  button; an exit may `commit` (dismiss a soft bad ending and walk on — the Post 2
  gate), `next` (bounce to a waypoint), or `reveal` terminal text (the flee/accept
  screens). This guarantees **no dead-end strands a walker** — feet always get out.
- The trunk splits at **Post 3** (`road = hero/pawn`); the two roads never rejoin.
  Endings are leaf nodes keyed to full state (route + allies + redemption).

## What's built
- **Hero's Road, end to end** (the trail-tested spine): Post 1 → 2 (commitment
  gate, soft-bad bounce) → 3 (trunk split) → 4 (clever/fooled) → 5 (brave/timid) →
  6 → 7 (pond routes: home/loop/deep) → five flag-gated endings (Crown Reborn,
  Gentle Dawn, Quiet Healing, Pyrrhic Crown, Long Watch).
- **Pawn's Road, drafted scaffold** (full structure, draft prose to revise):
  Post 4 recruitment (refuse/accept the mark) → 5 redemption hinge (burn the mark /
  fall) → 7 endings (Scarred, Hollow, Defiant Dusk; and the 🩸 Herald / Dark
  Coronation bad endings with flee/accept bounces).
- Collectible caps with a "2 of 3" indicator, the seasonal pond, the **Post 4
  wayfinding banner** (holds on both roads).
- Progress persisted to `localStorage` (screen-lock / reload safe); **Start over**
  in the top bar. **Service worker + manifest**: installable and fully offline.

> **DRAFT PROSE.** Every new v2 scene (the Post 2 gate, all of Pawn's Road, the
> pond routes and endings) is first-draft narration meant to be revised in
> `story.json`. Hero's Road adapts the trail-tested v1 prose.

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

Quick links while testing: `#crown` (select), `#crown/wp1` … `#crown/wp7`. The road
(and thus the Post 4/5/7 scenes) is set by your Post 3 choice; the pond ending is set
by your route choice there.

## Regenerate the app icons
```bash
python3 icons/make_icons.py
```

## Deploy
Static site, repo root is the web root. On Netlify: connect the repo, leave the
publish directory as the root (`netlify.toml` sets it). Confirm the service worker
registers over HTTPS and the manifest installs. Generate the QR codes last, pointing
at the live URL with each waypoint id; print with the post number and laminate.

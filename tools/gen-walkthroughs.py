# -*- coding: utf-8 -*-
"""Generate story-walkthroughs.txt — each major path of the Crown story rendered
start-to-finish as a walker would read it, in plain text.

Simulates the app's engine rules against data/story.json (scene pick, variant
pick, flag effects, ending gates), so the walkthroughs cannot drift from the app.
Re-run after any story edit:  python3 tools/gen-walkthroughs.py
"""
import json

D = json.load(open('data/story.json', encoding='utf-8'))
CROWN = D['stories']['crown']
WP = CROWN['waypoints']
CAPS = CROWN.get('capLabels', {})
SEASON = 'wet'   # walkthroughs use the spring/early-summer (pond full) text

# ---------- engine replicas ----------
def cond_met(flags, when):
    if not when: return False
    if when.get('default'): return True
    ok = True
    for f in when.get('allTrue', []):  ok = ok and bool(flags.get(f))
    for f in when.get('allFalse', []): ok = ok and not flags.get(f)
    for f in when.get('anyTrue', []):  ok = ok and any(bool(flags.get(x)) for x in when['anyTrue'])
    for f in when.get('anyFalse', []): ok = ok and any(not flags.get(x) for x in when['anyFalse'])
    for k, v in (when.get('equals') or {}).items():    ok = ok and flags.get(k) == v
    for k, v in (when.get('notEquals') or {}).items(): ok = ok and flags.get(k) != v
    return ok

def pick_variant(flags, lst):
    if not lst: return None
    default = None
    for v in lst:
        if v.get('default'):
            if default is None: default = v
            continue
        if cond_met(flags, v.get('when')): return v
    return default

def resolve_scene(flags, node):
    if 'scenes' not in node: return dict(node)
    chosen = None
    default = None
    for sc in node['scenes']:
        if sc.get('default'):
            if default is None: default = sc
            continue
        if cond_met(flags, sc.get('when')):
            chosen = sc; break
    sc = chosen or default
    if sc is None: raise RuntimeError('no scene matches at this waypoint for these flags')
    merged = {k: v for k, v in node.items() if k != 'scenes'}
    merged.update({k: v for k, v in sc.items() if k not in ('when', 'default')})
    return merged

def apply_effects(flags, collected, o):
    for k, v in (o.get('setFlags') or {}).items(): flags[k] = v
    c = o.get('collect')
    if c and c not in collected: collected.append(c)

# ---------- rendering ----------
OUT = []
def w(s=''): OUT.append(s)

def header(sc, wid):
    n = sc.get('n'); tag = sc.get('tag'); title = sc.get('title', '')
    if n:    return 'POST %s — %s' % (n, title.upper())
    if tag:  return '%s — %s' % (tag.upper(), title.upper())
    return title.upper()

def paras(text, indent=''):
    for p in (text or '').split('\n\n'):
        p = p.strip()
        if p: w(indent + p); w()

def emit_setup(flags, sc):
    paras(sc.get('text'))
    si = sc.get('seasonalIntro')
    if si:
        v = next((x for x in si if x.get('when') == SEASON), si[0])
        paras(v.get('text'))
    paras(sc.get('textCont'))
    v = pick_variant(flags, sc.get('variants'))
    if v: paras(v.get('text'))

def emit_ending(flags, ending, collected):
    note = ending.get('note', 'The End')
    w('    ═══ ENDING: %s ═══' % note)
    w()
    exits = ending.get('exits') or []
    for ex in exits:
        if ex.get('reveal'):
            w('    IF YOU CHOOSE — "%s":' % ex.get('label', ''))
            w()
            paras(ex['reveal'], '    ')
        elif ex.get('commit'):
            w('    ("%s" — the walk resumes.)' % ex.get('label', ''))
            w()

def run_walk(name, blurb, picks):
    """picks: list of (kind, label) — ('choose', label) | ('wrong', label)."""
    flags, collected = {}, []
    queue = list(picks)
    w('=' * 72)
    w('WALK — %s' % name.upper())
    w(blurb)
    w('=' * 72)
    w()
    cur = 'wp1'
    while cur:
        node = WP[cur]
        sc = resolve_scene(flags, node)
        apply_effects(flags, collected, sc)
        w('· · · %s · · ·' % header(sc, cur))
        w()
        emit_setup(flags, sc)
        choices = sc.get('choices') or []
        chosen = None
        if choices:
            # consume WRONG attempts (retry choices) first
            while queue and queue[0][0] == 'wrong':
                _, lbl = queue.pop(0)
                c = next(x for x in choices if x['label'] == lbl)
                apply_effects(flags, collected, c)
                w('  >> YOU GUESS: "%s" — wrong.' % lbl)
                w()
                hint = (c.get('hints') or [c.get('text', '')])[0]
                paras(hint, '     ')
            kind, lbl = queue.pop(0)
            assert kind == 'choose', 'expected a choose at %s' % cur
            chosen = next((x for x in choices if x['label'] == lbl), None)
            assert chosen, 'label %r not found at %s (have: %s)' % (lbl, cur, [c['label'] for c in choices])
            before = list(collected)
            apply_effects(flags, collected, chosen)
            w('  >> YOU CHOOSE: "%s"' % lbl)
            w()
            paras(chosen.get('text'))
            for c in collected:
                if c not in before:
                    w('     * You gather the %s. *' % CAPS.get(c, c)); w()
            if chosen.get('advanceLabel') and chosen.get('danger') and not chosen.get('next'):
                # a safe-bounce screen: the walker is turned around, then continues
                w('     [You are pulled back — "%s"]' % chosen['advanceLabel']); w()
            if chosen.get('ending'):
                emit_ending(flags, chosen['ending'], collected)
                w(); return
        else:
            for c in collected:
                pass
        settled_end = not (chosen and chosen.get('next'))
        if settled_end and sc.get('endingVariants'):
            ev = pick_variant(flags, sc['endingVariants'])
            if ev:
                paras(ev.get('text'))
                if ev.get('ending'):
                    emit_ending(flags, ev['ending'], collected)
                    w(); return
        paras(sc.get('textAfter'))
        if sc.get('ending'):
            emit_ending(flags, sc['ending'], collected)
            w(); return
        cur = (chosen.get('next') if chosen else None) or sc.get('next')
    w()

# ---------- the walks ----------
C = lambda l: ('choose', l)
X = lambda l: ('wrong', l)

GENTLE_TO_RAGGETH = [C('Keep the caps, and go end Raggeth forever')]
ROAD_CLEAN = [C('Rest a moment, then walk on'), C('Stay on the red markers'), C('Leave the hatch shut'),
              C('Five'), C('Four'), C('Seven')]

WALKS = [
 ("1 · The Bright Road Home",
  "Give the cake · gentle path · light the candle · mend the crown at the pond.\nEnding: ✦ The Gentle Dawn (the fox at your side, the wood singing).",
  [C('Go on into the dark'), C('Give the honey-cake'), C('Take the gentle path (right)'),
   C('Light the candle'), C('Set the caps in the crown — your task is done')]),

 ("2 · The Knight's Crusade",
  "Give the cake · gentle path · light the candle · refuse to stop at the pond —\ncarry the caps to Raggeth with the dead captain at your shoulder, and count true.\nEnding: ★ The Crown Reborn (the captain's watch ends).",
  [C('Go on into the dark'), C('Give the honey-cake'), C('Take the gentle path (right)'),
   C('Light the candle')] + GENTLE_TO_RAGGETH + ROAD_CLEAN),

 ("3 · The Fairy's Seven",
  "Give the cake · the rugged road (scout the fox, take a stick, ask the fairy for\nher NUMBER, ask the grove to keep watch) · to Raggeth · name the count clean.\nEnding: ★ The Crown Reborn (her gift returns at the very end).",
  [C('Go on into the dark'), C('Give the honey-cake'), C('Take the rugged path (straight ahead)'),
   C('Send him ahead to scout'), C('Take a stick'), C('Ask for a number to remember'),
   C('Ask the grove to keep watch at your back'), C('Dig in and climb hard')]
  + GENTLE_TO_RAGGETH + ROAD_CLEAN),

 ("4 · The Hard-Won Crown",
  "Give the cake · the rugged road the stumbling way (keep the fox close, travel\nlight, take the fairy's STRENGTH, nearly turn back on the hill) · fall for the\ncut-across and the hatch · miss a count once.\nEnding: ✦ The Pyrrhic Crown (you won — the hard way).",
  [C('Go on into the dark'), C('Give the honey-cake'), C('Take the rugged path (straight ahead)'),
   C('Keep him close'), C('Travel light'), C('Ask for a blessing of strength'),
   C('Ask the grove for strength on the road'), C('Nearly turn back, then climb anyway'),
   C('Keep the caps, and go end Raggeth forever'),
   C('March straight through'), C('Cut across toward the hut'), C('Open the hatch'),
   X('Six'), C('Five'), C('Four'), C('Seven')]),

 ("5 · The Quiet Save",
  "Give the cake · gentle path · tiptoe past the dead · mend the crown and go home.\nEnding: ✦ The Long Watch (saved him — but you flinched when it counted).",
  [C('Go on into the dark'), C('Give the honey-cake'), C('Take the gentle path (right)'),
   C('Tiptoe quietly past'), C('Set the caps in the crown — your task is done')]),

 ("6 · The Cold Hero",
  "KEEP the cake (the fox dies) · take the rugged road alone · earn all three caps\nanyway · mend the crown and walk home.\nEnding: ✦ The Gentle Dawn — alone (a stone you cannot set down).",
  [C('Go on into the dark'), C('Keep it for yourself'), C('Take the rugged path (straight ahead)'),
   C('Take a breath at the marker'), C('Take a stick'), C('Ask for a number to remember'),
   C('Ask the grove for strength on the road'), C('Rest, then climb'),
   C('Set the caps in the crown — your task is done')]),

 ("7 · The Scarred Hero",
  "KEEP the cake · gentle path · the dead see the mark on you — LIGHT the candle\nand face what you did · mend the crown.\nEnding: ✦ The Gentle Dawn — redeemed (a promise kept late).",
  [C('Go on into the dark'), C('Keep it for yourself'), C('Take the gentle path (right)'),
   C('Light the candle — face what you did'), C('Set the caps in the crown — your task is done')]),

 ("8 · The Pawn's Bargain",
  "KEEP the cake · gentle path · LEAVE THE CANDLE DARK — the road to the pond turns\neasy, the king does not beg, and you carry his gold to Raggeth to name your price.\nEnding: 🩸 The Enslavement (both exits shown — accept the dark, or tear free).",
  [C('Go on into the dark'), C('Keep it for yourself'), C('Take the gentle path (right)'),
   C('Leave it dark — keep the cold'), C('Carry the gold to Raggeth — strike your bargain'),
   C('Stay on the red markers'), C('Leave the hatch shut')]),

 ("9 · The Cold Walk Home",
  "KEEP the cake · leave the candle dark · then serve no one — pocket the gold and\nwalk out on the king and the dark alike.\nEnding: ❄ The Cold Walk Home (you're fine — exactly as fine as you were).",
  [C('Go on into the dark'), C('Keep it for yourself'), C('Take the gentle path (right)'),
   C('Leave it dark — keep the cold'), C('Take what you have and go home — leave them all to it')]),
]

# ---------- file header ----------
w('THE CROWN OF THE MUSHROOM KING')
w('THE WALKTHROUGHS — every major road, readable start to finish')
w()
w('Generated from data/story.json (story version %s) by tools/gen-walkthroughs.py.' % D['meta'].get('version'))
w('Each walk below is exactly what one walker reads, in order. The pond is shown')
w('in its SPRING (full-water) version. ">> YOU CHOOSE" marks the taps.')
w()
w('THE SHAPE OF THE STORY')
w('----------------------')
w('POST 1  The Entrance         the moth, the dying king, the honey-cake')
w('POST 2  Into the Forest      the flies, the face-trees, the warnings — commit, or turn back (soft ending)')
w('POST 3  The Great Old Tree   GIVE the cake (the fox lives) ... or KEEP it (the fox dies; you are marked)')
w('POST 4  The Fork             GENTLE right (level, quicker) ... or RUGGED straight (steep, longer, gifts)')
w('  gentle -> POST 5 The Cemetery:')
w('     unmarked: light the candle (a knight joins you) / tiptoe past (timid)')
w('     marked:   light the candle (redeemed)          / leave it dark (PAWN — no courage cap)')
w('  rugged -> R1 Marker Tree -> R2 Bottom of the Hill (stick?) -> R3 Fairy Spring')
w('            (her NUMBER or her STRENGTH) -> R4 Tree-Face Grove (strength or watch)')
w('            -> R5 the Steep Incline (Cap of Courage) — fox alive or dead shapes throughout')
w('POST 6  The Way to the Pond  (hero climb / the pawn\'s easy walk)')
w('POST 7  THE POND — the last QR post:')
w('  HERO: set the caps (home endings) ... or keep them and go end Raggeth forever')
w('  PAWN: carry the gold to Raggeth ... or abandon everyone and go home')
w('THE ROAD TO RAGGETH (in-app, no posts): deep wood -> wildflower meadow (count the')
w('  BENCHES — 5, from the pond onward only) -> picnic place (count the TABLES — 4)')
w('  -> fallen-tree faces (count the FACES — 7) -> the lair -> the hut & hatch ->')
w('  name the three numbers to unmake him.')
w()
w('THE ENDINGS')
w('-----------')
w('  ✦ The Gentle Dawn      hero, home (three shapes: fox alive / fox dead / redeemed)')
w('  ✦ The Long Watch       hero, home, but you flinched at the graves')
w('  ★ The Crown Reborn     named the count true — Raggeth unmade, the crown whole forever')
w('  ✦ The Pyrrhic Crown    won the count the hard way (fumbled along the road)')
w('  ❄ The Cold Walk Home   the pawn who abandons everyone (bleak, safe)')
w('  🩸 The Enslavement      the pawn who serves — accept the dark, or flee with an ember')
w('  (and the Post 2 refusal — a soft ending that offers to turn you around)')
w()
w('THE REFUSAL (Post 2) — for completeness')
w('---------------------------------------')
_turnback = WP['wp2']['choices'][1]
paras(_turnback['text'])
w('    ═══ ENDING: %s ═══' % _turnback['ending'].get('note'))
w('    ("%s" — and the walk resumes.)' % _turnback['ending']['exits'][0]['label'])
w()
w()

for name, blurb, picks in WALKS:
    run_walk(name, blurb, picks)

open('story-walkthroughs.txt', 'w', encoding='utf-8').write('\n'.join(OUT) + '\n')
print('wrote story-walkthroughs.txt (%d lines)' % len(OUT))

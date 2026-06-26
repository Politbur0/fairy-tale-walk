/* Fairy Tale Walk — engine.
 *
 * The story is DATA (data/story.json). This file renders it and rarely changes.
 * Routing is by URL hash so waypoint QR codes work fully offline:
 *   #crown/wp4   (also  #crown/4 ,  or  ?s=crown&wp=4)
 *
 * v2 capabilities (Crown branch blueprint):
 *  - condition ops: allTrue / allFalse / anyTrue / anyFalse / equals / notEquals
 *  - scenes: a waypoint can hold road-specific sub-scenes, each with its OWN
 *    text/prompt/choices/wayfinding/next — picked by `when` (e.g. equals road).
 *  - endings: a scene, a chosen choice, or a picked endingVariant may carry an
 *    `ending` { tone, note, exits[] }. Exits render as a flee/accept/commit
 *    screen so a "bad ending" never strands a walker — feet always get out.
 */
(function () {
  'use strict';

  var STORY_URL = './data/story.json';
  var LS_KEY = 'ftw_state';
  var SCHEMA = 3;   // bump when the story/state shape changes -> old saves are discarded

  var DATA = null;
  var states = {};
  var app = document.getElementById('app');
  var capBar = document.getElementById('capbar');

  // ---------- persistence ----------
  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(LS_KEY));
      // discard progress saved against an older story/state shape
      if (saved && saved.schema === SCHEMA && saved.states) states = saved.states;
      else states = {};
    } catch (e) { states = {}; }
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ schema: SCHEMA, states: states })); } catch (e) {}
  }
  function freshState(storyId) {
    return { storyId: storyId, flags: {}, collected: [], applied: {}, resolved: {}, committed: {}, scene: {}, attempts: {}, currentWp: null };
  }
  function stateFor(storyId) {
    if (!states[storyId]) states[storyId] = freshState(storyId);
    var s = states[storyId];
    s.applied = s.applied || {}; s.resolved = s.resolved || {}; s.committed = s.committed || {};
    s.scene = s.scene || {}; s.attempts = s.attempts || {};
    return s;
  }

  // ---------- routing ----------
  function normWp(w) { return !w ? null : (/^\d+$/.test(w) ? 'wp' + w : w); }
  function parseRoute() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    if (h) { var p = h.split('/'); return { storyId: p[0] || null, wp: normWp(p[1]) }; }
    var q = new URLSearchParams(location.search);
    if (q.get('s')) return { storyId: q.get('s'), wp: normWp(q.get('wp')) };
    return { storyId: null, wp: null };
  }
  function go(storyId, wpId) { location.hash = '#' + storyId + (wpId ? '/' + wpId : ''); }

  // ---------- season ----------
  function season() {
    var dry = (DATA.config && DATA.config.dryMonths) || [7, 8, 9];
    return dry.indexOf(new Date().getMonth() + 1) !== -1 ? 'dry' : 'wet';
  }

  // ---------- condition evaluation ----------
  function flagOn(state, name) { return !!state.flags[name]; }
  function condMet(state, when) {
    if (!when) return false;
    if (when.default) return true;
    var f = state.flags, ok = true;
    if (when.allTrue) ok = ok && when.allTrue.every(function (n) { return !!f[n]; });
    if (when.allFalse) ok = ok && when.allFalse.every(function (n) { return !f[n]; });
    if (when.anyTrue) ok = ok && when.anyTrue.some(function (n) { return !!f[n]; });
    if (when.anyFalse) ok = ok && when.anyFalse.some(function (n) { return !f[n]; });
    if (when.equals) ok = ok && Object.keys(when.equals).every(function (k) { return f[k] === when.equals[k]; });
    if (when.notEquals) ok = ok && Object.keys(when.notEquals).every(function (k) { return f[k] !== when.notEquals[k]; });
    return ok;
  }
  // top-down: first entry whose `when` matches wins; else the `default` entry.
  function pickVariant(state, list) {
    if (!list) return null;
    var def = null;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (v.default) { if (!def) def = v; continue; }
      if (condMet(state, v.when)) return v;
    }
    return def;
  }

  // ---------- scene resolution (road branching) ----------
  // first-match index (or the default's index, else -1)
  function pickSceneIndex(state, list) {
    var def = -1;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (v.default) { if (def < 0) def = i; continue; }
      if (condMet(state, v.when)) return i;
    }
    return def;
  }
  // Merge the matching sub-scene over the waypoint's shared fields. The chosen
  // scene is PINNED per waypoint on first entry, so a choice that changes a
  // scene-selecting flag (e.g. burning off `marked_dark`) doesn't swap the
  // scene — and its choices — out from under the walker on re-render/reload.
  function resolveScene(state, wp, wpId) {
    if (!wp.scenes) return wp;
    var idx = state.scene[wpId];
    if (idx == null) { idx = pickSceneIndex(state, wp.scenes); if (idx >= 0) state.scene[wpId] = idx; }
    if (idx < 0) return null;   // no scene matches yet (e.g. the road isn't set — walker is out of order)
    var sc = wp.scenes[idx] || {};
    var merged = {}, k;
    for (k in wp) if (k !== 'scenes') merged[k] = wp[k];
    for (k in sc) if (k !== 'when' && k !== 'default') merged[k] = sc[k];
    return merged;
  }

  // ---------- effects ----------
  function applyEffects(state, o) {
    if (!o) return;
    if (o.setFlags) for (var k in o.setFlags) state.flags[k] = o.setFlags[k];
    if (o.collect && state.collected.indexOf(o.collect) === -1) state.collected.push(o.collect);
  }

  // ---------- DOM helpers ----------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function paragraphs(parent, text) {
    if (!text) return;
    text.split(/\n\n+/).forEach(function (p) { parent.appendChild(el('p', 'prose', p)); });
  }
  function mediaAudio(src) {
    if (!src) return null;
    var a = document.createElement('audio');
    a.className = 'scene-audio'; a.controls = true; a.preload = 'none';
    a.src = './audio/' + src;
    a.addEventListener('error', function () { a.remove(); });
    return a;
  }
  function mediaImage(src, alt) {
    if (!src) return null;
    var im = document.createElement('img');
    im.className = 'scene-img'; im.loading = 'lazy'; im.alt = alt || '';
    im.src = './img/' + src;
    im.addEventListener('error', function () { im.remove(); });
    return im;
  }

  // ---------- cap counter ----------
  function renderCapBar(state) {
    capBar.innerHTML = '';
    var all = state ? ((DATA.collectibles && DATA.collectibles[state.storyId]) || []) : [];
    if (!state || !all.length) { capBar.hidden = true; return; }
    capBar.hidden = false;
    var story = DATA.stories[state.storyId];
    capBar.appendChild(el('span', 'cap-count', 'Caps: ' + state.collected.length + ' of ' + all.length));
    var dots = el('span', 'cap-dots');
    all.forEach(function (id) {
      var d = el('span', 'cap-dot' + (state.collected.indexOf(id) !== -1 ? ' got' : ''));
      d.title = (story.capLabels && story.capLabels[id]) || id;
      dots.appendChild(d);
    });
    capBar.appendChild(dots);
    var over = el('button', 'link-btn', 'Start over');
    over.addEventListener('click', startOver);
    capBar.appendChild(over);
  }

  function clear() { app.innerHTML = ''; }

  // ---------- story select ----------
  function showStorySelect() {
    clear(); renderCapBar(null);
    var wrap = el('section', 'screen select');
    wrap.appendChild(el('p', 'eyebrow', 'Hilltop Enchanted Forest'));
    wrap.appendChild(el('h1', 'title', 'Choose your tale'));
    wrap.appendChild(el('p', 'lede', 'A self-guided walk. At each post along the trail, scan its code (or type its number) to unlock the next part of the story. Your choices are remembered and shape how it ends.'));
    Object.keys(DATA.stories).forEach(function (id) {
      var s = DATA.stories[id], st = states[id];
      var card = el('button', 'story-card tone-' + (s.tone || 'dark'));
      card.appendChild(el('span', 'story-title', s.title));
      if (s.blurb) card.appendChild(el('span', 'story-blurb', s.blurb));
      if (st && st.currentWp) card.appendChild(el('span', 'story-resume', 'Continue where you left off'));
      card.addEventListener('click', function () { go(id, (st && st.currentWp) ? st.currentWp : s.start); });
      wrap.appendChild(card);
    });
    app.appendChild(wrap);
  }

  function showUnknown(storyId, wpId) {
    clear();
    var wrap = el('section', 'screen notice');
    wrap.appendChild(el('h1', 'title', 'No post here'));
    wrap.appendChild(el('p', 'lede', 'There’s no waypoint “' + (wpId || '?') + '” in this tale. If you just took a fork, you may have gone the wrong way — head back to the last post and follow the marked path. Or enter a post number below.'));
    wrap.appendChild(numberEntry(storyId));
    var back = el('button', 'btn ghost', 'Back to start');
    back.addEventListener('click', function () { go(storyId, DATA.stories[storyId].start); });
    wrap.appendChild(back);
    app.appendChild(wrap);
  }

  // A road-branched post reached before the path was chosen (out of order / stale).
  function showNeedTrunk(storyId, wp) {
    clear(); renderCapBar(stateFor(storyId));
    var w = el('section', 'screen notice');
    if (wp && wp.n) w.appendChild(el('p', 'post-no', 'Post ' + wp.n));
    w.appendChild(el('h1', 'title', 'Not yet'));
    w.appendChild(el('p', 'lede', 'This part of the tale changes with the path you chose earlier — and that choice hasn’t been made yet. Walk the posts in order from the start and this one will make sense when you reach it.'));
    var b = el('button', 'btn', 'Go to the beginning');
    b.addEventListener('click', function () { go(storyId, DATA.stories[storyId].start); });
    w.appendChild(b);
    w.appendChild(el('p', 'advance-sub', 'Or jump to a post number:'));
    w.appendChild(numberEntry(storyId));
    app.appendChild(w);
  }

  function numberEntry(storyId) {
    var form = el('form', 'num-entry');
    var input = el('input', 'num-input');
    input.type = 'text'; input.inputMode = 'text'; input.autocapitalize = 'characters'; input.autocomplete = 'off';
    input.placeholder = 'Post code'; input.setAttribute('aria-label', 'Enter the post code shown on the sign');
    var btn = el('button', 'btn small', 'Go'); btn.type = 'submit';
    form.appendChild(input); form.appendChild(btn);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = (input.value || '').trim().toUpperCase(), m;
      if (/^\d+$/.test(v)) go(storyId, 'wp' + v);                       // shared / gentle posts: 1..7
      else if ((m = v.match(/^R\s*0*(\d+)$/))) go(storyId, 'r' + m[1]); // rugged posts: R1..R5
    });
    return form;
  }

  // ---------- the waypoint screen ----------
  function showWaypoint(storyId, wpId) {
    var story = DATA.stories[storyId];
    var base = story.waypoints[wpId];
    if (!base) { showUnknown(storyId, wpId); return; }

    var state = stateFor(storyId);
    state.currentWp = wpId;
    var sc = resolveScene(state, base, wpId);
    if (!sc) { showNeedTrunk(storyId, base); return; }   // road-branched post reached out of order

    if (!state.applied[wpId]) { applyEffects(state, sc); state.applied[wpId] = true; }

    var committed = !!state.committed[wpId];
    var hasChoice = !committed && !!(sc.choices && sc.choices.length);
    var resolvedIdx = committed ? null : state.resolved[wpId];
    var resolved = (resolvedIdx != null) ? sc.choices[resolvedIdx] : null;
    var settled = !hasChoice || resolved;   // choices done (or none) -> endings may show

    clear(); renderCapBar(state);
    var scene = el('section', 'screen scene');

    var head = el('div', 'scene-head');
    if (sc.n) head.appendChild(el('span', 'post-no', 'Post ' + sc.n));
    else if (sc.tag) head.appendChild(el('span', 'post-no', sc.tag));
    head.appendChild(el('h1', 'scene-title', sc.title || ''));
    if (sc.voice && DATA.voices && DATA.voices[sc.voice]) head.appendChild(el('span', 'voice', DATA.voices[sc.voice]));
    scene.appendChild(head);

    var img = mediaImage(sc.image, sc.title);
    if (img) scene.appendChild(img);

    // One screen = one beat. BEFORE a choice: the setup (lead-in + prompt +
    // buttons). AFTER a choice: only the result beat — the setup is cleared so
    // the reader's eye lands on fresh text, not a re-read from the top.
    var body = el('div', 'scene-body'), audios = [];
    var showSetup = !resolved;   // a linear waypoint (no choice) also shows its setup

    if (showSetup) {
      paragraphs(body, sc.text);
      if (sc.audio) audios.push(sc.audio);
      if (sc.seasonalIntro) {
        var sIntro = sc.seasonalIntro.filter(function (x) { return x.when === season(); })[0] || sc.seasonalIntro[0];
        if (sIntro) { paragraphs(body, sIntro.text); if (sIntro.audio) audios.push(sIntro.audio); }
      }
      paragraphs(body, sc.textCont);
      if (sc.variants) {
        var variant = pickVariant(state, sc.variants);
        if (variant) { paragraphs(body, variant.text); if (variant.audio) audios.push(variant.audio); }
      }
    } else {
      paragraphs(body, resolved.text);
      if (resolved.audio) audios.push(resolved.audio);
    }

    // A resolved choice that carries `next` ADVANCES (it's not an ending), so its
    // endingVariants must not fire. Only an ending-bearing settle shows them.
    var settledEnding = settled && !(resolved && resolved.next);
    var pickedEnding = null;
    if (settledEnding && sc.endingVariants) {
      pickedEnding = pickVariant(state, sc.endingVariants);
      if (pickedEnding) { paragraphs(body, pickedEnding.text); if (pickedEnding.audio) audios.push(pickedEnding.audio); }
    }
    if (settled) paragraphs(body, sc.textAfter);
    scene.appendChild(body);
    audios.forEach(function (a) { var node = mediaAudio(a); if (node) scene.appendChild(node); });

    // collectible gained
    var gained = resolved && resolved.collect ? resolved.collect : (!hasChoice && sc.collect ? sc.collect : null);
    if (gained) scene.appendChild(capToast(story, gained));

    // footer: ending screen, choices, or advance
    var endInfo = (resolved && resolved.ending) || (pickedEnding && pickedEnding.ending) ||
                  (!committed && sc.ending) || (sc.end ? { note: sc.endNote || 'The End' } : null);

    if (endInfo) {
      scene.appendChild(renderEnding(storyId, wpId, endInfo));
    } else if (hasChoice && !resolved) {
      if (sc.prompt) scene.appendChild(el('p', 'choice-prompt', sc.prompt));
      var feedback = el('div', 'feedback');   // for retry flares/hints (puzzle)
      scene.appendChild(feedback);
      var choices = el('div', 'choices');
      sc.choices.forEach(function (c, i) {
        var b = el('button', 'btn choice' + (c.danger ? ' danger' : ''), c.label);
        b.addEventListener('click', function () {
          // a wrong/incomplete puzzle attempt: flare + (escalating) hint, never a dead end
          if (c.retry) {
            var n = (state.attempts[wpId] = (state.attempts[wpId] || 0) + 1);
            var hint = c.hints ? c.hints[Math.min(n - 1, c.hints.length - 1)] : c.text;
            var flare = el('div', 'cauldron-flare');
            paragraphs(flare, hint);
            feedback.appendChild(flare);
            save();
            flare.scrollIntoView ? flare.scrollIntoView() : window.scrollTo(0, 0);
            return;
          }
          applyEffects(state, c);
          state.resolved[wpId] = i; save();
          showWaypoint(storyId, wpId); window.scrollTo(0, 0);
        });
        choices.appendChild(b);
      });
      scene.appendChild(choices);
    } else {
      var nextId = (resolved && resolved.next) || sc.next;
      var advLabel = (resolved && resolved.advanceLabel) || sc.advanceLabel;
      var advPrompt = (resolved && resolved.advancePrompt) || sc.advancePrompt;
      scene.appendChild(advance(story, storyId, sc, nextId, advLabel, advPrompt));
    }

    if (sc.wayfinding) scene.appendChild(wayBanner(sc.wayfinding));

    app.appendChild(scene);
    window.scrollTo(0, 0);   // every beat starts the reader's eye at the top
    save();
  }

  function capToast(story, capId) {
    var t = el('div', 'cap-toast');
    t.appendChild(el('span', 'cap-toast-icon', '✦'));
    t.appendChild(el('span', null, 'You gather the ' + ((story.capLabels && story.capLabels[capId]) || capId) + '.'));
    return t;
  }

  // ---------- ending / bad-ending screen ----------
  function renderEnding(storyId, wpId, info) {
    var box = el('div', 'advance ending tone-' + (info.tone || 'good'));
    if (info.note) box.appendChild(el('p', 'the-end', info.note));
    var reveal = el('div', 'ending-reveal');
    box.appendChild(reveal);
    var exits = info.exits || [];
    if (!exits.length) { box.appendChild(startOverButton()); return box; }

    var btns = el('div', 'choices');
    exits.forEach(function (ex) {
      var b = el('button', 'btn' + (ex.danger ? ' danger' : ' choice'), ex.label);
      b.addEventListener('click', function () {
        if (ex.commit) { commitWaypoint(storyId, wpId); return; }
        if (ex.next) { go(storyId, ex.next); window.scrollTo(0, 0); return; }
        if (ex.reveal) paragraphs(reveal, ex.reveal);   // terminal flee/accept
        btns.remove();
        reveal.appendChild(startOverButton());
        window.scrollTo(0, document.body.scrollHeight);
      });
      btns.appendChild(b);
    });
    box.appendChild(btns);
    return box;
  }

  function startOverButton() {
    var again = el('button', 'btn', 'Walk it again');
    again.addEventListener('click', startOver);
    return again;
  }

  // Relenting on a soft bad ending = taking the "go on" beat: resolve this
  // waypoint to its first non-terminal choice so the reader turns to a fresh
  // page (the go-on result), not back to the setup they already read.
  function commitWaypoint(storyId, wpId) {
    var st = stateFor(storyId);
    var wp = resolveScene(st, DATA.stories[storyId].waypoints[wpId], wpId);
    var idx = 0;
    if (wp.choices) for (var i = 0; i < wp.choices.length; i++) { if (!wp.choices[i].ending) { idx = i; break; } }
    applyEffects(st, wp.choices && wp.choices[idx]);
    st.resolved[wpId] = idx; save();
    showWaypoint(storyId, wpId); window.scrollTo(0, 0);
  }

  function advance(story, storyId, sc, nextId, advLabel, advPrompt) {
    nextId = nextId || sc.next;
    var box = el('div', 'advance');
    var next = nextId ? story.waypoints[nextId] : null;
    if (next && next.gateless) {   // tap-through beat (no QR): the Road to Raggeth
      var on = el('button', 'btn', advLabel || 'Walk on ▸');
      on.addEventListener('click', function () { go(storyId, nextId); window.scrollTo(0, 0); });
      box.appendChild(on);
      return box;
    }
    if (next) {
      // path-relative prompt when supplied (the fork + rugged arm); else fall back
      // to the post number for the shared / gentle spine.
      var hint = advPrompt;
      if (!hint) {
        var label = next.n ? ('Post ' + next.n) : 'the next post';
        hint = 'Now find ' + label + ' on the trail and scan its code to continue.';
      }
      box.appendChild(el('p', 'advance-hint', hint));
      box.appendChild(el('p', 'advance-sub', 'Camera won’t focus? Enter the post’s code (shown on the sign):'));
      box.appendChild(numberEntry(storyId));
    }
    return box;
  }

  function wayBanner(text) {
    var b = el('div', 'wayfinding');
    b.appendChild(el('span', 'way-arrow', '➜'));
    b.appendChild(el('span', 'way-text', text));
    return b;
  }

  function startOver() {
    var route = parseRoute(), id = route.storyId;
    if (id && states[id]) { delete states[id]; save(); }
    if (id) go(id, DATA.stories[id].start); else showStorySelect();
    render(); window.scrollTo(0, 0);
  }

  function render() {
    var route = parseRoute();
    if (!route.storyId || !DATA.stories[route.storyId]) { showStorySelect(); return; }
    showWaypoint(route.storyId, route.wp || DATA.stories[route.storyId].start);
  }

  function boot() {
    load();
    fetch(STORY_URL).then(function (r) {
      if (!r.ok) throw new Error('story ' + r.status);
      return r.json();
    }).then(function (json) {
      DATA = json;
      window.addEventListener('hashchange', render);
      render();
    }).catch(function (err) {
      app.innerHTML = '';
      var w = el('section', 'screen notice');
      w.appendChild(el('h1', 'title', 'Couldn’t load the tale'));
      w.appendChild(el('p', 'lede', 'The story file failed to load. If you’re offline and this is your first visit, reconnect once at the trailhead so the walk can save itself to your phone, then try again.'));
      app.appendChild(w);
      console.error(err);
    });
  }

  boot();
})();

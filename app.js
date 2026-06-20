/* Fairy Tale Walk — engine.
 *
 * The story is DATA (data/story.json). This file renders it and never needs to
 * change when the story is revised. Routing is by URL hash so waypoint QR codes
 * work fully offline: e.g.  #crown/wp4  or  #crown/4  (also ?s=crown&wp=4).
 */
(function () {
  'use strict';

  var STORY_URL = './data/story.json';
  var LS_KEY = 'ftw_v1';

  var DATA = null;            // the whole story file
  var states = {};            // { storyId: state } — progress per story, persisted
  var app = document.getElementById('app');
  var capBar = document.getElementById('capbar');

  // ---------- persistence ----------
  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(LS_KEY));
      if (saved && saved.states) states = saved.states;
    } catch (e) { states = {}; }
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, states: states })); } catch (e) {}
  }
  function freshState(storyId) {
    return { storyId: storyId, flags: {}, collected: [], applied: {}, resolved: {}, currentWp: null };
  }
  function stateFor(storyId) {
    if (!states[storyId]) states[storyId] = freshState(storyId);
    return states[storyId];
  }

  // ---------- routing ----------
  function normWp(w) {
    if (!w) return null;
    return /^\d+$/.test(w) ? 'wp' + w : w;
  }
  function parseRoute() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    if (h) {
      var parts = h.split('/');
      return { storyId: parts[0] || null, wp: normWp(parts[1]) };
    }
    var q = new URLSearchParams(location.search);
    if (q.get('s')) return { storyId: q.get('s'), wp: normWp(q.get('wp')) };
    return { storyId: null, wp: null };
  }
  function go(storyId, wpId) {
    location.hash = '#' + storyId + (wpId ? '/' + wpId : '');
  }

  // ---------- season ----------
  function season() {
    var dry = (DATA.config && DATA.config.dryMonths) || [7, 8, 9];
    var m = new Date().getMonth() + 1;
    return dry.indexOf(m) !== -1 ? 'dry' : 'wet';
  }

  // ---------- condition evaluation ----------
  function flagOn(state, name) { return !!state.flags[name]; }
  function condMet(state, when) {
    if (!when) return false;
    if (when.default) return true;
    var ok = true;
    if (when.allTrue) ok = ok && when.allTrue.every(function (f) { return flagOn(state, f); });
    if (when.allFalse) ok = ok && when.allFalse.every(function (f) { return !flagOn(state, f); });
    if (when.anyTrue) ok = ok && when.anyTrue.some(function (f) { return flagOn(state, f); });
    if (when.anyFalse) ok = ok && when.anyFalse.some(function (f) { return !flagOn(state, f); });
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

  // ---------- effects ----------
  function applyEffects(state, o) {
    if (!o) return;
    if (o.setFlags) for (var k in o.setFlags) state.flags[k] = o.setFlags[k];
    if (o.collect && state.collected.indexOf(o.collect) === -1) state.collected.push(o.collect);
  }

  // ---------- small DOM helpers ----------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function paragraphs(parent, text) {
    if (!text) return;
    text.split(/\n\n+/).forEach(function (p) {
      parent.appendChild(el('p', 'prose', p));
    });
  }
  // <audio> / <img> that simply remove themselves if the asset isn't bundled yet
  function mediaAudio(src) {
    if (!src) return null;
    var a = document.createElement('audio');
    a.className = 'scene-audio';
    a.controls = true;
    a.preload = 'none';
    a.src = './audio/' + src;
    a.addEventListener('error', function () { a.remove(); });
    return a;
  }
  function mediaImage(src, alt) {
    if (!src) return null;
    var im = document.createElement('img');
    im.className = 'scene-img';
    im.loading = 'lazy';
    im.alt = alt || '';
    im.src = './img/' + src;
    im.addEventListener('error', function () { im.remove(); });
    return im;
  }

  // ---------- chrome (cap counter) ----------
  function renderCapBar(state) {
    capBar.innerHTML = '';
    if (!state) { capBar.hidden = true; return; }
    var story = DATA.stories[state.storyId];
    var all = (DATA.collectibles && DATA.collectibles[state.storyId]) || [];
    if (!all.length) { capBar.hidden = true; return; }
    capBar.hidden = false;
    var label = el('span', 'cap-count', 'Caps: ' + state.collected.length + ' of ' + all.length);
    capBar.appendChild(label);
    var dots = el('span', 'cap-dots');
    all.forEach(function (id) {
      var got = state.collected.indexOf(id) !== -1;
      var d = el('span', 'cap-dot' + (got ? ' got' : ''));
      d.title = (story.capLabels && story.capLabels[id]) || id;
      dots.appendChild(d);
    });
    capBar.appendChild(dots);
    var over = el('button', 'link-btn', 'Start over');
    over.addEventListener('click', startOver);
    capBar.appendChild(over);
  }

  // ---------- screens ----------
  function clear() { app.innerHTML = ''; }

  function showStorySelect() {
    clear();
    renderCapBar(null);
    var wrap = el('section', 'screen select');
    wrap.appendChild(el('p', 'eyebrow', 'Hilltop Enchanted Forest'));
    wrap.appendChild(el('h1', 'title', 'Choose your tale'));
    wrap.appendChild(el('p', 'lede', 'A self-guided walk. At each post along the trail, scan its code (or type its number) to unlock the next part of the story. Your choices are remembered and shape how it ends.'));

    var ids = Object.keys(DATA.stories);
    ids.forEach(function (id) {
      var s = DATA.stories[id];
      var card = el('button', 'story-card tone-' + (s.tone || 'dark'));
      card.appendChild(el('span', 'story-title', s.title));
      if (s.blurb) card.appendChild(el('span', 'story-blurb', s.blurb));
      var st = states[id];
      if (st && st.currentWp) card.appendChild(el('span', 'story-resume', 'Continue where you left off'));
      card.addEventListener('click', function () {
        var start = (st && st.currentWp) ? st.currentWp : s.start;
        go(id, start);
      });
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

  // manual "enter post number" fallback for when a camera won't focus
  function numberEntry(storyId) {
    var form = el('form', 'num-entry');
    var input = el('input', 'num-input');
    input.type = 'number'; input.min = '1'; input.inputMode = 'numeric';
    input.placeholder = 'Post #';
    input.setAttribute('aria-label', 'Enter post number');
    var btn = el('button', 'btn small', 'Go');
    btn.type = 'submit';
    form.appendChild(input); form.appendChild(btn);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = (input.value || '').trim();
      if (/^\d+$/.test(v)) go(storyId, 'wp' + v);
    });
    return form;
  }

  function showWaypoint(storyId, wpId) {
    var story = DATA.stories[storyId];
    var wp = story.waypoints[wpId];
    if (!wp) { showUnknown(storyId, wpId); return; }

    var state = stateFor(storyId);
    state.currentWp = wpId;

    // entry-level effects (e.g. wp1 grants the honey-cake) — once per waypoint
    if (!state.applied[wpId]) { applyEffects(state, wp); state.applied[wpId] = true; }

    var hasChoice = !!(wp.choices && wp.choices.length);
    var resolvedIdx = state.resolved[wpId];
    var resolved = resolvedIdx != null ? wp.choices[resolvedIdx] : null;

    clear();
    renderCapBar(state);
    var scene = el('section', 'screen scene');

    // header
    var head = el('div', 'scene-head');
    if (wp.n) head.appendChild(el('span', 'post-no', 'Post ' + wp.n));
    head.appendChild(el('h1', 'scene-title', wp.title || ''));
    if (wp.voice && DATA.voices && DATA.voices[wp.voice]) {
      head.appendChild(el('span', 'voice', DATA.voices[wp.voice]));
    }
    scene.appendChild(head);

    // optional image
    var img = mediaImage(wp.image, wp.title);
    if (img) scene.appendChild(img);

    // narration assembly: text -> seasonalIntro -> textCont -> variant -> ending -> textAfter
    var body = el('div', 'scene-body');
    var audios = [];

    paragraphs(body, wp.text);

    // the result narration of a choice already made (shown on re-render / reload)
    if (resolved) { paragraphs(body, resolved.text); if (resolved.audio) audios.push(resolved.audio); }

    if (wp.seasonalIntro) {
      var s = season();
      var intro = wp.seasonalIntro.filter(function (x) { return x.when === s; })[0] || wp.seasonalIntro[0];
      if (intro) { paragraphs(body, intro.text); if (intro.audio) audios.push(intro.audio); }
    }
    paragraphs(body, wp.textCont);

    if (wp.variants) {
      var variant = pickVariant(state, wp.variants);
      if (variant) { paragraphs(body, variant.text); if (variant.audio) audios.push(variant.audio); }
    }
    if (wp.endingVariants) {
      var ending = pickVariant(state, wp.endingVariants);
      if (ending) { paragraphs(body, ending.text); if (ending.audio) audios.push(ending.audio); }
    }
    paragraphs(body, wp.textAfter);

    if (wp.audio) audios.unshift(wp.audio);
    scene.appendChild(body);

    // audio players (hide themselves until the mp3s are bundled)
    audios.forEach(function (a) { var node = mediaAudio(a); if (node) scene.appendChild(node); });

    // collectible just gained
    if (resolved && resolved.collect) {
      scene.appendChild(capToast(story, resolved.collect));
    } else if (!hasChoice && wp.collect) {
      scene.appendChild(capToast(story, wp.collect));
    }

    // choices, or result + advance
    if (hasChoice && !resolved) {
      if (wp.prompt) scene.appendChild(el('p', 'choice-prompt', wp.prompt));
      var choices = el('div', 'choices');
      wp.choices.forEach(function (c, i) {
        var b = el('button', 'btn choice');
        b.textContent = c.label;
        b.addEventListener('click', function () {
          applyEffects(state, c);
          state.resolved[wpId] = i;
          save();
          showWaypoint(storyId, wpId); // re-render with the chosen result
          window.scrollTo(0, 0);
        });
        choices.appendChild(b);
      });
      scene.appendChild(choices);
    } else {
      scene.appendChild(advance(story, storyId, wp));
    }

    // wayfinding banner (fixed, unmissable) — present whenever the data declares it
    if (wp.wayfinding) scene.appendChild(wayBanner(wp.wayfinding));

    app.appendChild(scene);
    save();
  }

  function capToast(story, capId) {
    var label = (story.capLabels && story.capLabels[capId]) || capId;
    var t = el('div', 'cap-toast');
    t.appendChild(el('span', 'cap-toast-icon', '✦'));
    t.appendChild(el('span', null, 'You gather the ' + label + '.'));
    return t;
  }

  function advance(story, storyId, wp) {
    var box = el('div', 'advance');
    if (wp.end) {
      box.appendChild(el('p', 'the-end', wp.endNote || 'The End'));
      var again = el('button', 'btn', 'Walk it again');
      again.addEventListener('click', startOver);
      box.appendChild(again);
      return box;
    }
    var next = wp.next ? story.waypoints[wp.next] : null;
    if (next && next.gateless) {
      // reached on foot, no post to scan (e.g. the meadow coda)
      var on = el('button', 'btn', 'Walk on ▸');
      on.addEventListener('click', function () { go(storyId, wp.next); window.scrollTo(0, 0); });
      box.appendChild(on);
      return box;
    }
    if (next) {
      var n = next.n ? ('Post ' + next.n) : 'the next post';
      box.appendChild(el('p', 'advance-hint', 'Now find ' + n + ' on the trail and scan its code to continue.'));
      box.appendChild(el('p', 'advance-sub', 'Camera won’t focus? Enter the post number:'));
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
    var route = parseRoute();
    var id = route.storyId;
    if (id && states[id]) { delete states[id]; save(); }
    if (id) go(id, DATA.stories[id].start); else showStorySelect();
    // if hash didn't change (already at start), force a re-render
    route = parseRoute();
    render();
    window.scrollTo(0, 0);
  }

  // ---------- top-level render ----------
  function render() {
    var route = parseRoute();
    if (!route.storyId || !DATA.stories[route.storyId]) { showStorySelect(); return; }
    var story = DATA.stories[route.storyId];
    var wp = route.wp || story.start;
    showWaypoint(route.storyId, wp);
  }

  // ---------- boot ----------
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

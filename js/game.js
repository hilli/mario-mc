/* Mario MC — game shell: menus, input, loop. */
(function () {
  'use strict';
  const M = window.MMC;
  const R = window.MMCRender;
  const audio = window.MMCAudio;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  const STORAGE_KEY = 'mario-mc-settings-v1';
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const DEFAULT_NAMES = ['Mario', 'Luna'];

  /* --------------------------------------------------------------- settings */
  function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { s = {}; }
    const players = Array.isArray(s.players) ? s.players : [];
    return {
      numPlayers: s.numPlayers === 2 ? 2 : 1,
      difficulty: M.DIFFICULTY[s.difficulty] ? s.difficulty : 'normal',
      laps: [1, 3, 5].includes(s.laps) ? s.laps : 3,
      trackId: M.TRACKS.some((t) => t.id === s.trackId) ? s.trackId : M.TRACKS[0].id,
      autoGas: typeof s.autoGas === 'boolean' ? s.autoGas : isTouch,
      muted: !!s.muted,
      players: [0, 1].map((i) => ({
        name: sanitizeName((players[i] && players[i].name) || DEFAULT_NAMES[i]) || DEFAULT_NAMES[i],
        bikeId: M.getBike((players[i] && players[i].bikeId) || M.BIKES[i === 0 ? 1 : 4].id).id,
      })),
    };
  }
  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
  }
  function sanitizeName(n) {
    return String(n || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 14);
  }

  const settings = loadSettings();

  /* ----------------------------------------------------------------- screens */
  let screen = 'title';
  function show(id) {
    screen = id;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + id));
    const racing = id === 'race';
    $('#hud-buttons').classList.toggle('hidden', !racing);
    $('#touch-controls').classList.toggle('hidden', !(racing && isTouch));
    $('#btn-mute').classList.toggle('hidden', racing);
    if (id === 'setup') startPreviews(); else stopPreviews();
  }

  /* ------------------------------------------------------------- setup UI */
  const previews = [];
  let previewRaf = null;

  function statBars(bike) {
    const rows = [['Top speed', bike.stats.speed], ['Accel', bike.stats.accel], ['Handling', bike.stats.handling], ['Off-road', bike.stats.offroad]];
    return rows.map(([k, v]) => '<span>' + k + '</span><div class="bar"><i style="width:' + v * 10 + '%"></i></div>').join('') +
      '<span>Weight</span><span style="color:#fff">' + bike.weight + ' kg</span>';
  }

  function buildSetup() {
    const panels = $('#player-panels');
    panels.textContent = '';
    previews.length = 0;
    for (let i = 0; i < settings.numPlayers; i++) {
      const p = settings.players[i];
      const el = document.createElement('div');
      el.className = 'player-panel p' + (i + 1);
      el.style.setProperty('--glow', i ? 'rgba(63,210,255,0.2)' : 'rgba(255,210,63,0.2)');
      const keys = settings.numPlayers === 1 ? (isTouch ? 'Joystick' : 'Arrows / WASD') : i ? 'Arrows · Enter · R-Shift' : 'WASD · Space · L-Shift';
      el.innerHTML =
        '<span class="tag">PLAYER ' + (i + 1) + '</span><span class="keys"></span>' +
        '<label class="name-field"><span>Rider name</span><input maxlength="14" autocomplete="off" spellcheck="false"></label>' +
        '<div class="bike-stage"><button class="arrow" type="button" data-dir="-1" aria-label="Previous bike">‹</button>' +
        '<canvas width="420" height="250"></canvas>' +
        '<button class="arrow" type="button" data-dir="1" aria-label="Next bike">›</button></div>' +
        '<h3 class="bike-name"></h3><p class="bike-tagline"></p><div class="stats"></div><div class="bike-grid"></div>';
      $('.keys', el).textContent = keys;
      const input = $('input', el);
      input.value = p.name;
      input.addEventListener('input', () => { p.name = sanitizeName(input.value); saveSettings(); });
      input.addEventListener('keydown', (e) => e.stopPropagation());
      const grid = $('.bike-grid', el);
      M.BIKES.forEach((b) => {
        const t = document.createElement('button');
        t.type = 'button';
        t.className = 'bike-thumb';
        t.dataset.id = b.id;
        t.title = b.name;
        const c = document.createElement('canvas');
        c.width = 168; c.height = 100;
        R.drawBikeSide(c.getContext('2d'), b, 168, 100, 0);
        const label = document.createElement('div');
        label.textContent = b.make + ' ' + b.model;
        t.append(c, label);
        t.addEventListener('click', () => selectBike(i, b.id));
        grid.appendChild(t);
      });
      $$('.arrow', el).forEach((a) => a.addEventListener('click', () => {
        const idx = M.BIKES.findIndex((b) => b.id === p.bikeId);
        selectBike(i, M.BIKES[M.wrap(idx + Number(a.dataset.dir), M.BIKES.length)].id);
      }));
      panels.appendChild(el);
      previews.push({ el, canvas: $('canvas', el), player: i });
      refreshPanel(i);
    }
    $$('#opt-players button').forEach((b) => b.classList.toggle('on', Number(b.dataset.value) === settings.numPlayers));
    $$('#opt-difficulty button').forEach((b) => b.classList.toggle('on', b.dataset.value === settings.difficulty));
    $$('#opt-laps button').forEach((b) => b.classList.toggle('on', Number(b.dataset.value) === settings.laps));
    $('#opt-autogas').checked = settings.autoGas;
    buildTracks();
  }

  function selectBike(i, id) {
    settings.players[i].bikeId = id;
    saveSettings();
    audio.play('click');
    refreshPanel(i);
  }

  function refreshPanel(i) {
    const pv = previews.find((p) => p.player === i);
    if (!pv) return;
    const bike = M.getBike(settings.players[i].bikeId);
    $('.bike-name', pv.el).innerHTML = '<small></small><span></span>';
    $('.bike-name small', pv.el).textContent = bike.make;
    $('.bike-name span', pv.el).textContent = bike.model;
    $('.bike-tagline', pv.el).textContent = bike.tagline;
    $('.stats', pv.el).innerHTML = statBars(bike);
    $$('.bike-thumb', pv.el).forEach((t) => t.classList.toggle('on', t.dataset.id === bike.id));
  }

  const layouts = {};
  function layoutFor(def) {
    if (!layouts[def.id]) layouts[def.id] = M.trackLayout(M.buildTrack(def));
    return layouts[def.id];
  }

  function buildTracks() {
    const list = $('#track-list');
    list.textContent = '';
    M.TRACKS.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'track-card' + (t.id === settings.trackId ? ' on' : '');
      const c = document.createElement('canvas');
      c.width = 168; c.height = 168;
      const th = R.THEMES[t.theme];
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, 168);
      grad.addColorStop(0, th.sky[0]); grad.addColorStop(1, th.grass[0]);
      g.fillStyle = grad; g.fillRect(0, 0, 168, 168);
      const tmp = document.createElement('canvas'); tmp.width = 168; tmp.height = 168;
      R.drawMinimapPreview(tmp.getContext('2d'), layoutFor(t), 168, 168, '#fff');
      g.drawImage(tmp, 0, 0);
      const txt = document.createElement('div');
      const name = document.createElement('b'); name.textContent = t.name;
      const sub = document.createElement('span'); sub.textContent = t.subtitle;
      txt.append(name, sub);
      b.append(c, txt);
      b.addEventListener('click', () => { settings.trackId = t.id; saveSettings(); audio.play('click'); buildTracks(); });
      list.appendChild(b);
    });
  }

  function startPreviews() {
    if (previewRaf) return;
    const loop = (ts) => {
      previews.forEach((p) => {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const cw = Math.round(p.canvas.clientWidth * ratio);
        const ch = Math.round(p.canvas.clientHeight * ratio);
        if (cw > 0 && ch > 0 && (p.canvas.width !== cw || p.canvas.height !== ch)) { p.canvas.width = cw; p.canvas.height = ch; }
        const g = p.canvas.getContext('2d');
        g.clearRect(0, 0, p.canvas.width, p.canvas.height);
        R.drawBikeSide(g, M.getBike(settings.players[p.player].bikeId), p.canvas.width, p.canvas.height, ts / 1000);
      });
      previewRaf = requestAnimationFrame(loop);
    };
    previewRaf = requestAnimationFrame(loop);
  }
  function stopPreviews() {
    if (previewRaf) cancelAnimationFrame(previewRaf);
    previewRaf = null;
  }

  function bindSeg(id, key, parse) {
    $$('#' + id + ' button').forEach((b) => b.addEventListener('click', () => {
      settings[key] = parse(b.dataset.value);
      saveSettings();
      audio.play('click');
      buildSetup();
    }));
  }
  bindSeg('opt-players', 'numPlayers', Number);
  bindSeg('opt-difficulty', 'difficulty', String);
  bindSeg('opt-laps', 'laps', Number);
  $('#opt-autogas').addEventListener('change', (e) => { settings.autoGas = e.target.checked; saveSettings(); });

  /* ------------------------------------------------------------------ input */
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys.add(e.code);
    if (screen === 'race' && (e.code === 'Escape' || e.code === 'KeyP')) { pause(); e.preventDefault(); return; }
    if (screen === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) { resume(); e.preventDefault(); return; }
    if (screen === 'title' && (e.code === 'Enter' || e.code === 'Space')) { goSetup(); e.preventDefault(); return; }
    if (screen === 'race' && /^(Arrow|Space)/.test(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const k = (...codes) => (codes.some((c) => keys.has(c)) ? 1 : 0);
  const KEYMAPS = {
    wasd: () => ({ throttle: k('KeyW'), brake: k('KeyS'), steer: k('KeyD') - k('KeyA'), item: !!k('Space', 'KeyE'), drift: !!k('ShiftLeft') }),
    arrows: () => ({ throttle: k('ArrowUp'), brake: k('ArrowDown'), steer: k('ArrowRight') - k('ArrowLeft'), item: !!k('Enter', 'NumpadEnter', 'Slash'), drift: !!k('ShiftRight') }),
    solo: () => ({
      throttle: k('ArrowUp', 'KeyW'), brake: k('ArrowDown', 'KeyS'), steer: k('ArrowRight', 'KeyD') - k('ArrowLeft', 'KeyA'),
      item: !!k('Space', 'KeyE', 'Enter', 'KeyX'), drift: !!k('ShiftLeft', 'ShiftRight', 'KeyZ'),
    }),
  };

  function gamepadInput(index) {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    const p = pads[index];
    if (!p) return null;
    const b = (i) => (p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0);
    let steer = Math.abs(p.axes[0] || 0) > 0.15 ? p.axes[0] : 0;
    steer += b(15) - b(14);
    if (b(9) && screen === 'race' && !gamepadPauseHeld) { gamepadPauseHeld = true; pause(); }
    if (!b(9)) gamepadPauseHeld = false;
    return { throttle: Math.max(b(0), b(7), b(12)), brake: Math.max(b(1), b(6), b(13)), steer, item: b(2) > 0.5 || b(3) > 0.5, drift: b(5) > 0.5 || b(4) > 0.5 };
  }
  let gamepadPauseHeld = false;

  // Touch joystick: x steers, pushing up is throttle, pulling down brakes.
  const touch = { x: 0, y: 0, active: false, item: false, drift: false };
  (function setupJoystick() {
    const base = $('#joystick');
    const knob = $('#joystick-knob');
    let id = null;
    const move = (e) => {
      const r = base.getBoundingClientRect();
      const max = r.width / 2;
      let dx = e.clientX - (r.left + max);
      let dy = e.clientY - (r.top + max);
      const d = Math.hypot(dx, dy);
      if (d > max) { dx *= max / d; dy *= max / d; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      touch.x = dx / max;
      touch.y = dy / max;
    };
    base.addEventListener('pointerdown', (e) => { id = e.pointerId; try { base.setPointerCapture(id); } catch (_) { /* pointer already gone */ } touch.active = true; move(e); e.preventDefault(); });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; touch.active = false; touch.x = 0; touch.y = 0;
      knob.style.transform = '';
    };
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
    [['#btn-item', 'item'], ['#btn-drift', 'drift']].forEach(([sel, key]) => {
      const btn = $(sel);
      const on = (e) => { touch[key] = true; btn.classList.add('pressed'); e.preventDefault(); };
      const off = () => { touch[key] = false; btn.classList.remove('pressed'); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    });
  })();

  function touchInput() {
    if (!isTouch) return null;
    const dead = (v) => (Math.abs(v) < 0.12 ? 0 : v);
    const x = dead(touch.x);
    const y = dead(touch.y);
    let throttle = y < -0.1 ? Math.min(1, -y * 1.6) : 0;
    if (settings.autoGas && y < 0.35) throttle = 1;
    return { throttle, brake: y > 0.35 ? Math.min(1, (y - 0.2) * 1.6) : 0, steer: M.clamp(x * 1.25, -1, 1), item: touch.item, drift: touch.drift };
  }

  function playerInput(i) {
    if (settings.numPlayers === 1) return M.combineInputs(KEYMAPS.solo(), gamepadInput(0), touchInput());
    return i === 0 ? M.combineInputs(KEYMAPS.wasd(), gamepadInput(0), touchInput()) : M.combineInputs(KEYMAPS.arrows(), gamepadInput(1));
  }

  /* ------------------------------------------------------------------- race */
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  let race = null;
  let assets = null;
  let views = [];
  let raf = null;
  let last = 0;
  let acc = 0;
  let resultsShown = false;
  const sprites = R.buildSprites();
  const backgrounds = {};

  function goSetup() {
    audio.init();
    audio.setMuted(settings.muted);
    buildSetup();
    show('setup');
  }

  function startRace() {
    audio.init();
    const def = M.TRACKS.find((t) => t.id === settings.trackId);
    const humans = [];
    for (let i = 0; i < settings.numPlayers; i++) {
      const p = settings.players[i];
      humans.push({ name: sanitizeName(p.name) || DEFAULT_NAMES[i], bike: M.getBike(p.bikeId) });
    }
    race = new M.Race({ trackDef: def, bikes: M.BIKES, humans, laps: settings.laps, difficulty: settings.difficulty, seed: (Date.now() & 0xffff) + 1 });
    const theme = R.THEMES[def.theme];
    if (!backgrounds[def.theme]) backgrounds[def.theme] = R.buildBackground(theme);
    assets = { theme, bg: backgrounds[def.theme], sprites, layout: layoutFor(def) };
    views = race.humans().map((r) => ({
      racer: r, bg: 0, particles: [], shake: 0, banner: '', bannerTime: 0, bannerColor: '#fff', dt: 0, braking: false,
      name: settings.numPlayers > 1 ? r.name : '',
      touch: isTouch && settings.numPlayers === 1,
      itemKey: isTouch && r.playerIndex === 0 ? '' : settings.numPlayers === 1 ? 'SPACE' : r.playerIndex === 0 ? 'SPACE' : 'ENTER',
    }));
    resultsShown = false;
    show('race');
    audio.setEngines(views.length);
    audio.startMusic();
    last = performance.now();
    acc = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function stopRace() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    audio.stopEngines();
    audio.stopMusic();
  }

  function pause() {
    if (screen !== 'race') return;
    show('pause');
    audio.stopEngines();
  }
  function resume() {
    show('race');
    audio.setEngines(views.length);
    last = performance.now();
  }

  // Fill each segment's dynamic-object bucket so the renderer can depth-sort.
  let dirty = [];
  function fillBuckets() {
    dirty.forEach((s) => { s.dyn.length = 0; });
    dirty = [];
    const add = (o) => {
      const seg = M.findSegment(race.track, o.z);
      if (!seg.dyn.length) dirty.push(seg);
      seg.dyn.push(o);
    };
    race.track.itemBoxes.forEach((b) => { if (b.respawn <= 0) add({ kind: 'box', z: b.z, x: b.x }); });
    race.hazards.forEach((h) => add({ kind: 'oil', z: h.z, x: h.x }));
    race.projectiles.forEach((p) => add({ kind: 'rocket', z: p.z, x: p.x }));
    race.racers.forEach((r) => add({ kind: 'racer', z: r.z, x: r.x, ref: r }));
  }

  function banner(view, text, color, time) {
    view.banner = text;
    view.bannerColor = color || '#fff';
    view.bannerTime = time || 1.6;
  }

  function handleEvents() {
    for (const e of race.events) {
      const view = e.racer && views.find((v) => v.racer === e.racer);
      const global = !e.racer;
      if (global) { audio.play(e.type); continue; }
      if (!view) continue;
      if (e.type.startsWith('item:')) { audio.play(e.type.slice(5)); continue; }
      audio.play(e.type);
      switch (e.type) {
        case 'spin': view.shake = 0.6; banner(view, e.cause === 'rocket' ? 'BOOM!' : e.cause === 'star' ? 'STAR HIT!' : 'SPIN OUT!', '#ff5a5a'); break;
        case 'crash': view.shake = 0.4; break;
        case 'bump': view.shake = Math.max(view.shake, 0.15); break;
        case 'finallap': banner(view, 'FINAL LAP!', '#ffd23f', 2.2); break;
        case 'lap': banner(view, 'LAP ' + e.racer.lap + ' · ' + M.formatTime(e.racer.lastLap), '#fff', 2); break;
        case 'miniturbo': banner(view, 'MINI-TURBO!', '#3fd2ff', 0.9); break;
        case 'rocketstart': banner(view, 'ROCKET START!', '#3dff6e', 1.4); break;
        case 'finish': banner(view, '', '#fff', 0); break;
        default: break;
      }
    }
    race.events.length = 0;
  }

  function viewports() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    if (views.length === 1) return [{ x: 0, y: 0, w, h }];
    return [{ x: 0, y: 0, w, h: Math.floor(h / 2) - 2 }, { x: 0, y: Math.floor(h / 2) + 2, w, h: h - Math.floor(h / 2) - 2 }];
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    if (screen === 'race') {
      const inputs = views.map((v) => playerInput(v.racer.playerIndex));
      const byPlayer = [];
      views.forEach((v, i) => { byPlayer[v.racer.playerIndex] = inputs[i]; });
      acc += dt;
      const step = 1 / 60;
      while (acc >= step) {
        race.update(step, byPlayer);
        acc -= step;
      }
      handleEvents();
      views.forEach((v, i) => {
        const r = v.racer;
        const seg = M.findSegment(race.track, r.z);
        v.bg += seg.curve * (r.speed / M.BASE_MAX_SPEED) * dt * 0.02;
        v.shake = Math.max(0, v.shake - dt);
        v.bannerTime = Math.max(0, v.bannerTime - dt);
        v.braking = inputs[i].brake > 0 && !r.finished;
        audio.updateEngine(i, r.speed / M.BASE_MAX_SPEED, r.finished ? 0.3 : inputs[i].throttle, views.length > 1 ? 0.7 : 1);
      });
      if (race.phase === 'finished' && !resultsShown) showResults();
    }
    if (race && (screen === 'race' || screen === 'pause' || screen === 'results')) draw(screen === 'race' ? dt : 0, ts / 1000);
  }

  function draw(dt, t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fillBuckets();
    const vps = viewports();
    views.forEach((v, i) => {
      v.dt = dt;
      R.renderView(ctx, vps[i], race, v.racer, v, assets, t);
    });
    if (views.length > 1) {
      ctx.fillStyle = '#0b1026';
      ctx.fillRect(0, vps[0].h, vps[0].w, vps[1].y - vps[0].h);
    }
  }

  /* --------------------------------------------------------------- results */
  function showResults() {
    resultsShown = true;
    audio.stopEngines();
    const res = race.results();
    const best = res.find((r) => r.human);
    $('#results-title').textContent = best && best.place === 1 ? (settings.numPlayers > 1 ? best.name + ' wins!' : 'Victory!') : 'Results';
    const podium = $('#podium');
    podium.textContent = '';
    res.slice(0, 3).forEach((r) => {
      const el = document.createElement('div');
      el.className = 'step s' + r.place;
      const c = document.createElement('canvas');
      c.width = 200; c.height = 120;
      R.drawBikeSide(c.getContext('2d'), r.bike, 200, 120, 0);
      const p = document.createElement('div'); p.className = 'p'; p.textContent = M.ordinal(r.place);
      const n = document.createElement('div'); n.className = 'n'; n.textContent = r.name;
      const b = document.createElement('div'); b.className = 'b'; b.textContent = r.bike.name;
      el.append(c, p, n, b);
      podium.appendChild(el);
    });
    const body = $('#results-body');
    body.textContent = '';
    res.forEach((r) => {
      const tr = document.createElement('tr');
      if (r.human) tr.className = 'human';
      const cells = [M.ordinal(r.place), r.name, r.bike.name, M.formatTime(r.time), isFinite(r.bestLap) ? M.formatTime(r.bestLap) : '—'];
      cells.forEach((txt, i) => {
        const td = document.createElement('td');
        td.textContent = txt;
        if (i === 3 && r.estimated) {
          const s = document.createElement('span');
          s.className = 'est';
          s.textContent = ' (est.)';
          td.appendChild(s);
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    show('results');
  }

  /* --------------------------------------------------------------- actions */
  function updateMuteUi() {
    $('#btn-mute').textContent = settings.muted ? '🔇' : '🔊';
    $$('.mute-label').forEach((el) => { el.textContent = 'Sound: ' + (settings.muted ? 'off' : 'on'); });
  }

  const actions = {
    'to-setup': goSetup,
    'to-title': () => show('title'),
    race: () => { stopRace(); startRace(); },
    resume,
    restart: () => { stopRace(); startRace(); },
    quit: () => { stopRace(); race = null; goSetup(); },
    'toggle-mute': () => { audio.init(); settings.muted = !settings.muted; audio.setMuted(settings.muted); saveSettings(); updateMuteUi(); },
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action]();
  });
  $('#btn-pause').addEventListener('click', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'race') pause(); });

  updateMuteUi();
  show('title');
})();

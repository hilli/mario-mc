/* Mario MC — core game logic.
 * Pure and DOM-free so it runs both in the browser and under `node --test`.
 * Road model: a list of segments (pseudo-3D "OutRun" style). Each racer has
 * a position `z` along the track and a lateral offset `x` where -1..1 is the
 * tarmac and anything beyond is off-road.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MMC = Object.assign(root.MMC || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SEGMENT_LENGTH = 200;
  const RUMBLE_LENGTH = 3;
  const ROAD_WIDTH = 2000;
  const LANES = 3;
  const BASE_MAX_SPEED = SEGMENT_LENGTH * 60;
  const CENTRIFUGAL = 0.2;
  const ROAD_EDGE = 1;
  const WALL = 2.4;
  const KMH_AT_BASE = 220;
  const ITEMS = ['turbo', 'oil', 'rocket', 'star'];

  // World widths of scenery sprites (in world units; ROAD_WIDTH is half the road).
  const SPRITES = {
    pine: { w: 1000, solid: true }, tree: { w: 1300, solid: true }, rock: { w: 900, solid: true },
    cactus: { w: 700, solid: true }, palm: { w: 1300, solid: true }, bush: { w: 900, solid: false },
    chevronL: { w: 700, solid: true }, chevronR: { w: 700, solid: true },
    billboard: { w: 2400, solid: true }, gantry: { w: ROAD_WIDTH * 2.7, solid: false },
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIn = (a, b, t) => a + (b - a) * t * t;
  const easeInOut = (a, b, t) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);
  const wrap = (v, max) => ((v % max) + max) % max;
  const wrapSigned = (d, max) => wrap(d + max / 2, max) - max / 2;
  const percentRemaining = (n, total) => wrap(n, total) / total;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const ms = Math.floor(seconds * 1000);
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const r = ms % 1000;
    return m + ':' + String(s).padStart(2, '0') + '.' + String(r).padStart(3, '0');
  }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function bikePhysics(bike) {
    const s = bike.stats;
    return {
      maxSpeed: BASE_MAX_SPEED * (0.9 + 0.02 * s.speed),
      accel: BASE_MAX_SPEED * (0.14 + 0.012 * s.accel),
      steer: 0.75 + 0.05 * s.handling,
      offroadLimit: BASE_MAX_SPEED * (0.3 + 0.05 * s.offroad),
      weight: bike.weight || 220,
    };
  }

  /* ------------------------------------------------------------------ tracks */
  // Section tuple: [enter, hold, leave, curve, hill]. Curves: + = right.
  const TRACKS = [
    {
      id: 'alpine', name: 'Alpine Pass', subtitle: 'Hairpins, snow peaks & pine forests', theme: 'alpine', seed: 11,
      sections: [
        [50, 50, 50, 0, 0], [50, 100, 50, -2, 20], [50, 50, 50, 0, 40], [50, 100, 50, 4, 0],
        [25, 50, 25, -6, -20], [25, 50, 25, 6, -20], [100, 100, 100, 0, -40], [50, 100, 50, -4, 30],
        [50, 50, 50, 2, 0], [50, 50, 50, 0, -20], [100, 100, 100, 3, 0], [50, 50, 50, -2, 0],
      ],
      scenery: [['pine', 6], ['tree', 2], ['rock', 1], ['bush', 1]], density: 0.55,
      boosts: [[0.36, 0], [0.62, -0.5], [0.88, 0.5]], itemRows: [0.1, 0.42, 0.72],
    },
    {
      id: 'desert', name: 'Desert Rally', subtitle: 'Dunes, jumps & endless sand', theme: 'desert', seed: 23,
      sections: [
        [50, 50, 50, 0, 0], [25, 25, 25, 0, 30], [25, 25, 25, 0, -30], [25, 25, 25, 0, 30], [25, 25, 25, 0, -30],
        [100, 100, 100, -3, 0], [50, 50, 50, 0, 40], [50, 100, 50, 5, -40], [25, 50, 25, -5, 0],
        [100, 150, 100, 0, 0], [50, 100, 50, 3, 20], [25, 25, 25, 0, -30], [25, 25, 25, 0, 30],
        [50, 100, 50, -4, -20], [50, 50, 50, 2, 0],
      ],
      scenery: [['cactus', 5], ['rock', 4], ['bush', 2]], density: 0.4,
      boosts: [[0.3, 0], [0.55, 0.5], [0.8, -0.5]], itemRows: [0.14, 0.46, 0.7],
    },
    {
      id: 'coast', name: 'Sunset Coast', subtitle: 'Flowing seaside sweepers at dusk', theme: 'coast', seed: 37,
      sections: [
        [50, 50, 50, 0, 0], [100, 100, 100, 3, 10], [100, 100, 100, -3, -10], [50, 50, 50, 0, 0],
        [50, 100, 50, 6, 0], [50, 50, 50, 0, 20], [50, 100, 50, -5, -20], [25, 50, 25, 4, 0],
        [25, 50, 25, -4, 0], [100, 100, 100, 2, 0], [50, 50, 50, 0, 0],
      ],
      scenery: [['palm', 6], ['bush', 2], ['rock', 1]], density: 0.5,
      boosts: [[0.25, 0], [0.5, -0.5], [0.83, 0]], itemRows: [0.12, 0.38, 0.66],
    },
  ];

  const BILLBOARD_TEXTS = ['MARIO MC', 'FULL THROTTLE', 'RIDE ON!', 'ADVENTURE', 'GO GO GO', 'TWISTIES AHEAD', 'GRAND PRIX'];

  function buildTrack(def) {
    const segments = [];
    const lastY = () => (segments.length ? segments[segments.length - 1].p2.world.y : 0);
    function addSegment(curve, y) {
      const n = segments.length;
      segments.push({
        index: n, curve, sprites: [], dyn: [], boost: null, checker: false, clip: 0, looped: false, fog: 1,
        p1: { world: { y: lastY(), z: n * SEGMENT_LENGTH }, camera: {}, screen: {} },
        p2: { world: { y, z: (n + 1) * SEGMENT_LENGTH }, camera: {}, screen: {} },
      });
    }
    function addRoad(enter, hold, leave, curve, hill) {
      const startY = lastY();
      const endY = startY + hill * SEGMENT_LENGTH;
      const total = enter + hold + leave;
      for (let n = 0; n < enter; n++) addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, (n + 1) / total));
      for (let n = 0; n < hold; n++) addSegment(curve, easeInOut(startY, endY, (enter + n + 1) / total));
      for (let n = 0; n < leave; n++) addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n + 1) / total));
    }
    def.sections.forEach((s) => addRoad(s[0], s[1], s[2], s[3], s[4]));
    addRoad(50, 25, 50, 0, -lastY() / SEGMENT_LENGTH);
    const n = segments.length;
    const length = n * SEGMENT_LENGTH;
    const at = (f) => Math.floor(f * n);

    for (let i = 0; i < 3; i++) segments[i].checker = true;
    segments[2].sprites.push({ type: 'gantry', offset: 0 });

    def.boosts.forEach(([f, x]) => { for (let i = 0; i < 4; i++) segments[at(f) + i].boost = x; });

    const itemBoxes = [];
    def.itemRows.forEach((f) => {
      const seg = segments[at(f)];
      seg.itemRow = true;
      [-0.6, 0, 0.6].forEach((x) => itemBoxes.push({ seg: seg.index, x, z: seg.index * SEGMENT_LENGTH + SEGMENT_LENGTH / 2, respawn: 0 }));
    });

    // Scenery (seeded so every race on a track looks identical).
    const rng = mulberry32(def.seed);
    const weights = def.scenery.reduce((a, s) => a + s[1], 0);
    const pick = () => {
      let r = rng() * weights;
      for (const s of def.scenery) { if ((r -= s[1]) < 0) return s[0]; }
      return def.scenery[0][0];
    };
    let bb = 0;
    for (let i = 8; i < n; i += 3) {
      const seg = segments[i];
      if (Math.abs(seg.curve) >= 4 && i % 9 === 0) {
        seg.sprites.push({ type: seg.curve > 0 ? 'chevronR' : 'chevronL', offset: seg.curve > 0 ? -1.25 : 1.25 });
        continue;
      }
      if (i % 120 === 60) {
        seg.sprites.push({ type: 'billboard', offset: (bb % 2 ? 1 : -1) * 1.9, text: BILLBOARD_TEXTS[bb % BILLBOARD_TEXTS.length] });
        bb++;
        continue;
      }
      for (const side of [-1, 1]) {
        if (rng() < def.density) seg.sprites.push({ type: pick(), offset: side * (1.35 + rng() * 2.6) });
      }
    }
    return { id: def.id, name: def.name, theme: def.theme, segments, length, itemBoxes };
  }

  function findSegment(track, z) {
    const segs = track.segments;
    return segs[Math.floor(wrap(z, track.length) / SEGMENT_LENGTH) % segs.length];
  }

  // 2D outline for the minimap, normalised to the unit square.
  function trackLayout(track, step) {
    step = step || 4;
    const segs = track.segments;
    const n = segs.length;
    const total = segs.reduce((a, s) => a + s.curve, 0);
    const k = 0.0045;
    const target = (total >= 0 ? 1 : -1) * Math.PI * 2;
    let angle = 0;
    let x = 0;
    let y = 0;
    const pts = [];
    for (let i = 0; i < n; i++) {
      angle += segs[i].curve * k + (target - total * k) / n;
      x += Math.sin(angle);
      y -= Math.cos(angle);
      if (i % step === 0) pts.push({ x, y, i });
    }
    const ex = x;
    const ey = y;
    pts.forEach((p) => { p.x -= ex * p.i / n; p.y -= ey * p.i / n; });
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const size = Math.max(maxX - minX, maxY - minY) || 1;
    const ox = (size - (maxX - minX)) / 2;
    const oy = (size - (maxY - minY)) / 2;
    return pts.map((p) => ({ x: (p.x - minX + ox) / size, y: (p.y - minY + oy) / size, i: p.i }));
  }

  /* ----------------------------------------------------------------- input */
  function combineInputs(...inputs) {
    const out = { throttle: 0, brake: 0, steer: 0, drift: false, item: false };
    inputs.forEach((i) => {
      if (!i) return;
      out.throttle = Math.max(out.throttle, i.throttle || 0);
      out.brake = Math.max(out.brake, i.brake || 0);
      out.steer += i.steer || 0;
      out.drift = out.drift || !!i.drift;
      out.item = out.item || !!i.item;
    });
    out.steer = clamp(out.steer, -1, 1);
    return out;
  }

  /* --------------------------------------------------------------- physics */
  function createRacer(o) {
    return {
      id: o.id, name: o.name, bike: o.bike, phys: bikePhysics(o.bike), human: !!o.human, playerIndex: o.playerIndex,
      z: o.z || 0, x: o.x || 0, speed: 0, lap: 0, finished: false, finishTime: null, place: 0,
      item: null, itemRoll: 0, itemHeld: false, boostTime: 0, starTime: 0, spinTime: 0, crashCool: 0,
      drifting: false, driftDir: 0, driftCharge: 0, lean: 0, offroad: false,
      lapStart: 0, bestLap: Infinity, lastLap: 0, throttleSince: null,
      ai: { lane: o.aiLane || 0, skill: o.aiSkill || 1, itemDelay: 0 },
    };
  }

  // Advances one racer. Returns an array of event names.
  function updateRacer(r, input, track, dt, speedMul) {
    const events = [];
    const p = r.phys;
    const seg = findSegment(track, r.z);
    const spinning = r.spinTime > 0;
    const throttle = spinning ? 0 : clamp(input.throttle || 0, 0, 1);
    const brake = spinning ? 0 : clamp(input.brake || 0, 0, 1);
    let steer = spinning ? 0 : clamp(input.steer || 0, -1, 1);
    let maxSpeed = p.maxSpeed * (speedMul || 1);
    if (r.boostTime > 0) maxSpeed *= 1.28;
    if (r.starTime > 0) maxSpeed *= 1.12;

    const wantDrift = !!input.drift && !spinning && Math.abs(steer) > 0.2 && r.speed > p.maxSpeed * 0.4;
    if (wantDrift) {
      if (!r.drifting) { r.drifting = true; r.driftDir = Math.sign(steer); r.driftCharge = 0; events.push('drift'); }
      r.driftCharge += dt;
    } else if (r.drifting) {
      r.drifting = false;
      if (r.driftCharge > 0.8) { r.boostTime = Math.max(r.boostTime, Math.min(1.6, 0.4 + r.driftCharge * 0.4)); events.push('miniturbo'); }
      r.driftCharge = 0;
    }

    if (spinning) r.speed -= BASE_MAX_SPEED * 1.4 * dt;
    else if (r.boostTime > 0) r.speed += p.accel * 2.5 * dt;
    else if (brake > 0) r.speed -= BASE_MAX_SPEED * 1.2 * brake * dt;
    else if (throttle > 0) r.speed += p.accel * throttle * dt;
    else r.speed -= BASE_MAX_SPEED * 0.2 * dt;

    r.offroad = Math.abs(r.x) > ROAD_EDGE;
    if (r.offroad && r.starTime <= 0 && r.speed > p.offroadLimit) {
      r.speed = Math.max(p.offroadLimit, r.speed - BASE_MAX_SPEED * 1.1 * dt);
    }
    if (r.drifting) r.speed -= BASE_MAX_SPEED * 0.04 * dt;
    if (r.speed > maxSpeed) r.speed = Math.max(maxSpeed, r.speed - BASE_MAX_SPEED * 0.6 * dt);
    r.speed = clamp(r.speed, 0, BASE_MAX_SPEED * 1.6);

    const sp = r.speed / BASE_MAX_SPEED;
    // Keep some steering authority at low speed so riders can always recover.
    const dx = dt * 2 * Math.max(Math.min(sp, 1.2), r.speed > 0 || throttle > 0 ? 0.35 : 0);
    let steerPower = p.steer;
    if (r.drifting) { steer = clamp(steer + r.driftDir * 0.4, -1.4, 1.4); steerPower *= 1.3; }
    r.x += dx * steer * steerPower;
    r.x -= dx * sp * seg.curve * CENTRIFUGAL;
    if (spinning) r.x += Math.sin(r.spinTime * 14) * dt * 0.4;
    if (Math.abs(r.x) > WALL) { r.x = Math.sign(r.x) * WALL; r.speed *= 1 - dt * 2; }

    if (seg.boost !== null && Math.abs(r.x - seg.boost) < 0.3 && r.boostTime < 0.9) {
      r.boostTime = 1.1;
      events.push('boostpad');
    }

    r.crashCool = Math.max(0, (r.crashCool || 0) - dt);
    if (Math.abs(r.x) > 1.2 && r.starTime <= 0 && r.crashCool <= 0) {
      for (const s of seg.sprites) {
        const def = SPRITES[s.type];
        if (!def || !def.solid) continue;
        const half = (def.w / ROAD_WIDTH) * 0.3;
        if (Math.abs(r.x - s.offset) < half + 0.08 && r.speed > BASE_MAX_SPEED * 0.1) {
          r.speed *= 0.35;
          r.x -= Math.sign(r.x) * 0.2; // bounce back towards the road
          r.crashCool = 0.8;
          events.push('crash');
          break;
        }
      }
    }

    r.z += r.speed * dt;
    while (r.z >= track.length) { r.z -= track.length; r.lap++; events.push('lapcross'); }

    r.boostTime = Math.max(0, r.boostTime - dt);
    r.starTime = Math.max(0, r.starTime - dt);
    r.spinTime = Math.max(0, r.spinTime - dt);
    const targetLean = spinning ? 0 : clamp(steer, -1.3, 1.3) * 0.5 * Math.min(1, sp * 1.3);
    r.lean = lerp(r.lean, targetLean, Math.min(1, dt * 8));
    return events;
  }

  function rollItem(place, total, rnd) {
    const t = total > 1 ? (place - 1) / (total - 1) : 0;
    const w = { turbo: 3 + 2 * t, oil: 4 * (1 - t) + 1, rocket: 1 + 3 * t, star: 0.2 + 2.5 * t * t };
    let r = rnd() * (w.turbo + w.oil + w.rocket + w.star);
    for (const k of ITEMS) { if ((r -= w[k]) < 0) return k; }
    return 'turbo';
  }

  function progressOf(r, trackLength) {
    return (r.lap - 1) * trackLength + r.z;
  }

  function computeStandings(racers, trackLength) {
    const sorted = racers.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return progressOf(b, trackLength) - progressOf(a, trackLength);
    });
    sorted.forEach((r, i) => { r.place = i + 1; });
    return sorted;
  }

  /* ------------------------------------------------------------------ race */
  const DIFFICULTY = { easy: 0.86, normal: 0.94, hard: 1.0 };
  const AI_NAMES = ['Jens', 'Anthony', 'Rabbit', 'Norbert', 'Tom', 'Rajoslav', 'Radek', 'Player 1', 'Tenere Guy'];

  class Race {
    constructor(opts) {
      this.trackDef = opts.trackDef;
      this.track = buildTrack(opts.trackDef);
      this.laps = opts.laps || 3;
      this.difficulty = DIFFICULTY[opts.difficulty] ? opts.difficulty : 'normal';
      this.rng = mulberry32(opts.seed || 1);
      this.time = 0;
      this.phase = 'countdown';
      this.countdown = opts.countdown === undefined ? 3 : opts.countdown;
      this.events = [];
      this.hazards = [];
      this.projectiles = [];
      this.finishedCount = 0;
      this.endTimer = null;
      this.racers = [];

      const bikes = opts.bikes;
      const humans = opts.humans || [];
      const used = new Set(humans.map((h) => h.bike.id));
      const aiBikes = bikes.filter((b) => !used.has(b.id));
      const total = opts.racerCount || 8;
      const names = AI_NAMES.slice().sort(() => this.rng() - 0.5);
      const entrants = [];
      for (let i = 0; entrants.length < total - humans.length; i++) {
        entrants.push({ name: names[i % names.length], bike: aiBikes[i % aiBikes.length] || bikes[i % bikes.length], human: false });
      }
      humans.forEach((h, i) => entrants.push({ name: h.name, bike: h.bike, human: true, playerIndex: i }));
      const L = this.track.length;
      entrants.forEach((e, i) => {
        const row = Math.floor(i / 2);
        this.racers.push(createRacer({
          id: i, name: e.name, bike: e.bike, human: e.human, playerIndex: e.playerIndex,
          z: L - SEGMENT_LENGTH * (2 + row * 4), x: i % 2 ? 0.45 : -0.45,
          aiLane: (this.rng() - 0.5) * 1.2, aiSkill: 0.97 + this.rng() * 0.05,
        }));
      });
      computeStandings(this.racers, L);
    }

    emit(type, racer, extra) { this.events.push(Object.assign({ type, racer }, extra)); }

    humans() { return this.racers.filter((r) => r.human); }

    racerAhead(r) {
      return this.racers.find((o) => o.place === r.place - 1) || null;
    }

    useItem(r) {
      if (!r.item || r.itemRoll > 0) return;
      const item = r.item;
      r.item = null;
      const L = this.track.length;
      if (item === 'turbo') r.boostTime = Math.max(r.boostTime, 1.8);
      else if (item === 'star') r.starTime = 6;
      else if (item === 'oil') this.hazards.push({ x: r.x, z: wrap(r.z - SEGMENT_LENGTH * 2, L), ttl: 30, owner: r });
      else if (item === 'rocket') {
        this.projectiles.push({
          x: r.x, z: wrap(r.z + SEGMENT_LENGTH, L), speed: Math.max(r.speed, BASE_MAX_SPEED) + BASE_MAX_SPEED * 0.7,
          target: this.racerAhead(r), owner: r, ttl: 6,
        });
      }
      this.emit('item:' + item, r);
    }

    spin(r, cause) {
      if (r.starTime > 0) return false;
      r.spinTime = 1.3;
      r.boostTime = 0;
      r.drifting = false;
      this.emit('spin', r, { cause });
      return true;
    }

    aiInput(r) {
      const segs = this.track.segments;
      const n = segs.length;
      const L = this.track.length;
      const si = findSegment(this.track, r.z).index;
      let curveAhead = 0;
      for (let i = 2; i < 30; i++) curveAhead += segs[(si + i) % n].curve * (1 - i / 30);
      let target = clamp(curveAhead / 50, -0.7, 0.7) + r.ai.lane * 0.3;
      for (let i = 3; i < 24; i++) {
        const seg = segs[(si + i) % n];
        if (seg.boost !== null) { target = seg.boost; break; }
        if (seg.itemRow && !r.item) {
          const boxes = this.track.itemBoxes.filter((b) => b.seg === seg.index && b.respawn <= 0);
          if (boxes.length) {
            target = boxes.reduce((a, b) => (Math.abs(b.x - r.x) < Math.abs(a.x - r.x) ? b : a)).x;
            break;
          }
        }
      }
      for (const h of this.hazards) {
        const d = wrapSigned(h.z - r.z, L);
        if (d > 0 && d < SEGMENT_LENGTH * 18 && Math.abs(h.x - target) < 0.35) target += h.x > target ? -0.5 : 0.5;
      }
      for (const o of this.racers) {
        if (o === r) continue;
        const d = wrapSigned(o.z - r.z, L);
        if (d > 0 && d < SEGMENT_LENGTH * 6 && Math.abs(o.x - r.x) < 0.3 && o.speed < r.speed) target = o.x + (o.x > 0 ? -0.5 : 0.5);
      }
      target = clamp(target, -0.85, 0.85);
      const steer = clamp((target - r.x) * 2.5, -1, 1);
      const sp = r.speed / BASE_MAX_SPEED;
      const curveNow = Math.abs(segs[(si + 4) % n].curve);
      const throttle = curveNow * CENTRIFUGAL * sp > r.phys.steer * 1.05 && Math.abs(r.x) > 0.6 ? 0.4 : 1;

      let item = false;
      if (r.item && r.itemRoll <= 0) {
        r.ai.itemDelay -= 1;
        if (r.ai.itemDelay <= 0) {
          if (r.item === 'turbo') item = curveNow < 2;
          else if (r.item === 'star') item = true;
          else if (r.item === 'oil') item = this.racers.some((o) => o !== r && wrapSigned(r.z - o.z, L) > 0 && wrapSigned(r.z - o.z, L) < SEGMENT_LENGTH * 10);
          else if (r.item === 'rocket') {
            const a = this.racerAhead(r);
            item = !!a && wrapSigned(a.z - r.z, L) < SEGMENT_LENGTH * 40;
          }
        }
      }
      return { throttle, brake: 0, steer, drift: false, item };
    }

    aiSpeedMul(r) {
      const L = this.track.length;
      const humans = this.humans().filter((h) => !h.finished);
      let mul = DIFFICULTY[this.difficulty] * r.ai.skill;
      if (humans.length) {
        const best = Math.max(...humans.map((h) => progressOf(h, L)));
        const diff = (progressOf(r, L) - best) / L;
        mul *= clamp(1 - diff * 0.5, 0.9, 1.08);
      }
      return mul;
    }

    update(dt, humanInputs) {
      humanInputs = humanInputs || [];
      const L = this.track.length;
      if (this.phase === 'countdown') {
        const before = this.countdown;
        this.countdown -= dt;
        this.racers.forEach((r) => {
          if (!r.human) return;
          const pressed = (humanInputs[r.playerIndex] || {}).throttle > 0;
          if (pressed && r.throttleSince === null) r.throttleSince = this.countdown;
          if (!pressed) r.throttleSince = null;
        });
        if (Math.ceil(before) !== Math.ceil(this.countdown) && this.countdown > 0) this.emit('countdown', null, { n: Math.ceil(this.countdown) });
        if (this.countdown <= 0) {
          this.phase = 'racing';
          this.emit('go', null);
          this.racers.forEach((r) => {
            if (r.human && r.throttleSince !== null && r.throttleSince < 0.9) {
              r.boostTime = 1.2;
              this.emit('rocketstart', r);
            }
          });
        }
        return;
      }
      if (this.phase === 'finished') return;
      this.time += dt;

      for (const r of this.racers) {
        const auto = !r.human || r.finished;
        const input = auto ? this.aiInput(r) : (humanInputs[r.playerIndex] || {});
        const mul = auto ? (r.human ? 0.95 : this.aiSpeedMul(r)) : 1;
        if (input.item && !r.itemHeld) this.useItem(r);
        r.itemHeld = !!input.item && !auto;
        if (r.itemRoll > 0) r.itemRoll = Math.max(0, r.itemRoll - dt);
        const evs = updateRacer(r, input, this.track, dt, mul);
        for (const e of evs) {
          if (e !== 'lapcross') { this.emit(e, r); continue; }
          if (r.lap <= 1) { r.lapStart = this.time; continue; }
          const lapTime = this.time - r.lapStart;
          r.lastLap = lapTime;
          r.bestLap = Math.min(r.bestLap, lapTime);
          r.lapStart = this.time;
          if (r.lap > this.laps && !r.finished) {
            r.finished = true;
            r.finishTime = this.time;
            this.finishedCount++;
            r.finishPlace = this.finishedCount;
            this.emit('finish', r, { place: this.finishedCount });
          } else if (!r.finished) {
            this.emit(r.lap === this.laps ? 'finallap' : 'lap', r);
          }
        }
      }

      this.updateItems(dt);
      this.collide();
      computeStandings(this.racers, L);

      const humans = this.humans();
      const done = humans.length ? humans.every((h) => h.finished) : this.racers.every((r) => r.finished);
      if (done && this.endTimer === null) this.endTimer = humans.length ? 3 : 0;
      if (this.endTimer !== null) {
        this.endTimer -= dt;
        if (this.endTimer <= 0) { this.phase = 'finished'; this.emit('raceover', null); }
      }
    }

    updateItems(dt) {
      const L = this.track.length;
      for (const b of this.track.itemBoxes) {
        if (b.respawn > 0) { b.respawn -= dt; continue; }
        for (const r of this.racers) {
          if (Math.abs(wrapSigned(r.z - b.z, L)) < SEGMENT_LENGTH * 0.7 && Math.abs(r.x - b.x) < 0.22) {
            b.respawn = 3;
            if (!r.item) {
              r.item = rollItem(r.place, this.racers.length, this.rng);
              r.itemRoll = r.human ? 1.2 : 0;
              r.ai.itemDelay = 30 + Math.floor(this.rng() * 120);
            }
            this.emit('itembox', r);
            break;
          }
        }
      }
      this.hazards = this.hazards.filter((h) => {
        h.ttl -= dt;
        if (h.ttl <= 0) return false;
        for (const r of this.racers) {
          if (Math.abs(wrapSigned(r.z - h.z, L)) < SEGMENT_LENGTH * 0.6 && Math.abs(r.x - h.x) < 0.22) {
            this.spin(r, 'oil');
            return false;
          }
        }
        return true;
      });
      this.projectiles = this.projectiles.filter((p) => {
        p.ttl -= dt;
        if (p.ttl <= 0) return false;
        p.z = wrap(p.z + p.speed * dt, L);
        if (p.target) p.x = lerp(p.x, p.target.x, Math.min(1, dt * 4));
        for (const r of this.racers) {
          if (r === p.owner) continue;
          if (Math.abs(wrapSigned(r.z - p.z, L)) < SEGMENT_LENGTH * 0.9 && Math.abs(r.x - p.x) < 0.3) {
            if (this.spin(r, 'rocket')) this.emit('explode', r);
            return false;
          }
        }
        return true;
      });
    }

    collide() {
      const L = this.track.length;
      const rs = this.racers;
      for (let i = 0; i < rs.length; i++) {
        for (let j = i + 1; j < rs.length; j++) {
          const a = rs[i];
          const b = rs[j];
          const dz = wrapSigned(b.z - a.z, L);
          if (Math.abs(dz) > SEGMENT_LENGTH * 0.7 || Math.abs(a.x - b.x) > 0.22) continue;
          if (a.starTime > 0 && b.starTime <= 0) { this.spin(b, 'star'); continue; }
          if (b.starTime > 0 && a.starTime <= 0) { this.spin(a, 'star'); continue; }
          const dir = Math.sign(a.x - b.x) || 1;
          const tw = a.phys.weight + b.phys.weight;
          a.x += dir * 0.12 * (b.phys.weight / tw);
          b.x -= dir * 0.12 * (a.phys.weight / tw);
          const behind = dz > 0 ? a : b;
          const ahead = dz > 0 ? b : a;
          behind.speed = Math.min(behind.speed, ahead.speed * 0.95);
          if (a.human || b.human) this.emit('bump', a.human ? a : b);
        }
      }
    }

    // Final classification; racers still on track get an extrapolated time.
    results() {
      const L = this.track.length;
      const total = this.laps * L;
      const list = this.racers.map((r) => {
        let time = r.finishTime;
        let estimated = false;
        if (!r.finished) {
          const remaining = Math.max(0, total - progressOf(r, L));
          const avg = Math.max(BASE_MAX_SPEED * 0.5, progressOf(r, L) / Math.max(this.time, 1));
          time = this.time + remaining / avg;
          estimated = true;
        }
        return { name: r.name, bike: r.bike, human: r.human, playerIndex: r.playerIndex, time, estimated, bestLap: r.bestLap };
      });
      list.sort((a, b) => a.time - b.time);
      list.forEach((e, i) => { e.place = i + 1; });
      return list;
    }
  }

  return {
    SEGMENT_LENGTH, RUMBLE_LENGTH, ROAD_WIDTH, LANES, BASE_MAX_SPEED, CENTRIFUGAL, ROAD_EDGE, WALL, KMH_AT_BASE,
    ITEMS, SPRITES, TRACKS, DIFFICULTY,
    clamp, lerp, wrap, wrapSigned, percentRemaining, mulberry32, formatTime, ordinal,
    bikePhysics, buildTrack, findSegment, trackLayout, combineInputs,
    createRacer, updateRacer, rollItem, progressOf, computeStandings, Race,
  };
});

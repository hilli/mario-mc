'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = Object.assign({}, require('../js/core.js'), require('../js/bikes.js'));

const input = (o) => Object.assign({ throttle: 0, brake: 0, steer: 0, drift: false, item: false }, o);
const straightTrack = () => M.buildTrack(M.TRACKS[0]);

function drive(r, track, seconds, inp, dt = 1 / 60) {
  const events = [];
  for (let t = 0; t < seconds; t += dt) events.push(...M.updateRacer(r, inp, track, dt, 1));
  return events;
}

test('offers exactly the eight requested motorcycles', () => {
  assert.deepEqual(M.BIKES.map((b) => b.name), [
    'BMW R 1300 GS Adventure',
    'BMW R 1300 GS',
    'BMW F 900 GS',
    'BMW F 900 S',
    'KTM 1390 Super Adventure',
    'Triumph 900',
    'Ducati DesertX Gen 2',
    'Ducati Multistrada V4 S',
  ]);
  assert.equal(new Set(M.BIKES.map((b) => b.id)).size, 8);
});

test('bikes are balanced: every stat line sums to the same budget', () => {
  for (const b of M.BIKES) {
    const s = b.stats;
    assert.equal(s.speed + s.accel + s.handling + s.offroad, 29, b.name);
  }
});

test('formatTime and ordinal', () => {
  assert.equal(M.formatTime(83.456), '1:23.456');
  assert.equal(M.formatTime(5), '0:05.000');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(M.ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
});

test('every track is a closed loop with item boxes and boost pads', () => {
  for (const def of M.TRACKS) {
    const t = M.buildTrack(def);
    const segs = t.segments;
    assert.equal(t.length, segs.length * M.SEGMENT_LENGTH, def.name);
    assert.ok(Math.abs(segs[segs.length - 1].p2.world.y) < 1e-6, `${def.name} must end at height 0`);
    assert.ok(t.itemBoxes.length > 0, `${def.name} item boxes`);
    assert.ok(segs.some((s) => s.boost !== null), `${def.name} boost pads`);
  }
});

test('throttle accelerates and the bike tops out near its max speed', () => {
  const track = straightTrack();
  const r = M.createRacer({ id: 0, name: 'T', bike: M.BIKES[0] });
  drive(r, track, 0.5, input({ throttle: 1 }));
  assert.ok(r.speed > 0 && r.z > 0);
  drive(r, track, 12, input({ throttle: 1 }));
  assert.ok(r.speed <= r.phys.maxSpeed * 1.01);
  assert.ok(r.speed > r.phys.maxSpeed * 0.5);
});

test('off-road grip depends on the off-road stat', () => {
  const track = straightTrack();
  const offSpeed = (bike) => {
    const r = M.createRacer({ id: 0, name: 'T', bike });
    r.speed = M.BASE_MAX_SPEED; r.x = 1.15; // on the grass, clear of scenery
    drive(r, track, 2, input({ throttle: 1 }));
    return r.speed;
  };
  const desertX = M.getBike('desertx');
  const f900s = M.getBike('f900s');
  assert.ok(desertX.stats.offroad > f900s.stats.offroad);
  assert.ok(offSpeed(desertX) > offSpeed(f900s));
  assert.ok(offSpeed(f900s) < M.BASE_MAX_SPEED * 0.7);
});

test('crossing the start line counts a lap', () => {
  const track = straightTrack();
  const r = M.createRacer({ id: 0, name: 'T', bike: M.BIKES[0] });
  r.z = track.length - 50; r.speed = M.BASE_MAX_SPEED; r.lap = 1;
  const events = drive(r, track, 0.1, input({ throttle: 1 }));
  assert.ok(events.includes('lapcross'));
  assert.equal(r.lap, 2);
});

test('a rider pinned against the wall gets back onto the road within 3 seconds', () => {
  const heaviest = M.BIKES.reduce((a, b) => (b.stats.handling < a.stats.handling ? b : a));
  for (const def of M.TRACKS) {
    const track = M.buildTrack(def);
    for (const side of [-1, 1]) {
      for (let start = 0; start < track.length; start += track.length / 40) {
        const r = M.createRacer({ id: 0, name: 'T', bike: heaviest, z: start });
        r.x = side * M.WALL;
        let t = 0;
        while (Math.abs(r.x) >= 1 && t < 3) { M.updateRacer(r, input({ throttle: 1, steer: -side }), track, 1 / 60, 1); t += 1 / 60; }
        assert.ok(Math.abs(r.x) < 1, `${def.name} side ${side} z ${Math.round(start)}: stuck at x=${r.x.toFixed(2)}`);
      }
    }
  }
});

test('standings order by finish time, then by progress', () => {
  const L = 1000;
  const a = { lap: 2, z: 100, finished: false };
  const b = { lap: 2, z: 500, finished: false };
  const done = [95, 80, 110, 90, 85].map((finishTime) => ({ lap: 4, z: 0, finished: true, finishTime }));
  const sorted = M.computeStandings([a, ...done, b], L);
  assert.deepEqual(sorted.map((r) => r.finishTime || r.z), [80, 85, 90, 95, 110, 500, 100]);
  assert.deepEqual(sorted.map((r) => r.place), [1, 2, 3, 4, 5, 6, 7]);
});

test('rollItem always returns a known item, and leaders never get many stars', () => {
  const rnd = M.mulberry32(42);
  let leaderStars = 0;
  for (let i = 0; i < 2000; i++) {
    const item = M.rollItem(1 + (i % 8), 8, rnd);
    assert.ok(M.ITEMS.includes(item));
    if (i % 8 === 0 && item === 'star') leaderStars++;
  }
  assert.ok(leaderStars < 10);
});

test('combineInputs merges keyboard, gamepad and touch and ignores missing devices', () => {
  const out = M.combineInputs(input({ throttle: 1, steer: 0.8 }), null, input({ steer: 0.7, item: true }), undefined);
  assert.equal(out.throttle, 1);
  assert.equal(out.steer, 1);
  assert.equal(out.item, true);
  assert.equal(out.drift, false);
});

test('a full race with eight riders reaches the finish on every track', () => {
  for (const def of M.TRACKS) {
    const race = new M.Race({ trackDef: def, bikes: M.BIKES, humans: [{ name: 'Hilli', bike: M.BIKES[6] }], laps: 2, difficulty: 'normal', seed: 7 });
    let t = 0;
    while (race.phase !== 'finished' && t < 600) {
      const inputs = race.humans().map((h) => race.aiInput(h));
      race.update(1 / 30, inputs);
      t += 1 / 30;
    }
    assert.equal(race.phase, 'finished', def.name);
    const res = race.results();
    assert.equal(res.length, 8);
    assert.deepEqual(res.map((e) => e.place), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.ok(res.some((e) => e.human && e.name === 'Hilli'));
  }
});

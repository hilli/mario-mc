/* Mario MC — rendering: pseudo-3D road, procedural art and HUD. */
(function () {
  'use strict';
  const M = window.MMC;
  const { SEGMENT_LENGTH: SEG, ROAD_WIDTH, RUMBLE_LENGTH, LANES, SPRITES, BASE_MAX_SPEED, KMH_AT_BASE } = M;

  const FIELD_OF_VIEW = 100;
  const CAMERA_HEIGHT = 1000;
  const CAMERA_DEPTH = 1 / Math.tan((FIELD_OF_VIEW / 2) * Math.PI / 180);
  const PLAYER_Z = CAMERA_HEIGHT * CAMERA_DEPTH;
  const DRAW_DISTANCE = 260;
  const BIKE_WORLD_W = 420;

  const THEMES = {
    alpine: {
      sky: ['#2f7fd8', '#8cc8f5', '#e6f5ff'], fog: '#cfe6f3', fogDensity: 4,
      grass: ['#46a23f', '#3d9137'], rumble: ['#f2f2f2', '#d0312d'], road: ['#5f636b', '#5a5e66'], lane: '#f4f4f4',
      far: { top: '#8ea6c8', bottom: '#5b7398', snow: true, height: 0.75 }, near: { top: '#2f7d3b', bottom: '#1f5a2a', height: 0.35, trees: '#1d4d27' },
      clouds: 'rgba(255,255,255,0.9)', sun: null,
    },
    desert: {
      sky: ['#f07c35', '#f8b965', '#fde7b5'], fog: '#f6d9a4', fogDensity: 3,
      grass: ['#e7bd6f', '#dcb062'], rumble: ['#ffffff', '#d35400'], road: ['#8c7862', '#86725c'], lane: '#fff1cc',
      far: { top: '#c2703f', bottom: '#97502b', snow: false, height: 0.6, mesa: true }, near: { top: '#d99a55', bottom: '#c07f3f', height: 0.25 },
      clouds: 'rgba(255,240,220,0.6)', sun: { color: '#fff4c2', x: 0.7, y: 0.25, r: 0.08 },
    },
    coast: {
      sky: ['#2a0f55', '#c5306d', '#ffb066'], fog: '#e6a090', fogDensity: 3.5,
      grass: ['#3c9a5f', '#358a55'], rumble: ['#ffffff', '#2b6fd6'], road: ['#4b4f5c', '#474b57'], lane: '#ffe9a8',
      far: { top: '#6b3a78', bottom: '#3e2152', snow: false, height: 0.45 }, near: { sea: true, top: '#1f4f8f', bottom: '#0e2c5a', height: 0.2 },
      clouds: 'rgba(255,190,200,0.55)', sun: { color: '#ffd36b', x: 0.5, y: 0.62, r: 0.12 },
    },
  };

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function poly(ctx, pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
    return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }

  /* ------------------------------------------------------------ scenery art */
  function buildSprites() {
    const S = {};
    let c, g;

    c = makeCanvas(120, 230); g = c.getContext('2d');
    g.fillStyle = '#5a3a1e'; g.fillRect(52, 190, 16, 40);
    for (let i = 0; i < 4; i++) {
      const y = 10 + i * 45;
      const w = 34 + i * 14;
      poly(g, [60, y, 60 + w, y + 75, 60 - w, y + 75], i % 2 ? '#1f6b34' : '#237a3b');
      poly(g, [60, y, 60 + w, y + 75, 60, y + 75], 'rgba(0,0,0,0.18)');
    }
    poly(g, [60, 6, 72, 30, 48, 30], '#ffffff');
    S.pine = c;

    c = makeCanvas(170, 200); g = c.getContext('2d');
    g.fillStyle = '#6b4423'; g.fillRect(76, 110, 18, 90);
    [[85, 70, 60, '#2f8f3a'], [50, 95, 42, '#2a8034'], [122, 95, 42, '#2a8034'], [85, 45, 45, '#3aa046'], [70, 60, 25, '#4cb558']].forEach(([x, y, r, col]) => {
      g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    });
    S.tree = c;

    c = makeCanvas(150, 95); g = c.getContext('2d');
    poly(g, [10, 95, 25, 40, 60, 12, 105, 20, 140, 55, 148, 95], '#8b8f96');
    poly(g, [60, 12, 105, 20, 140, 55, 148, 95, 80, 95], '#6d7179');
    poly(g, [25, 40, 60, 12, 70, 50, 30, 70], '#a9adb4');
    S.rock = c;

    c = makeCanvas(100, 180); g = c.getContext('2d');
    g.fillStyle = '#2e8b3e';
    rr(g, 38, 10, 24, 170, 12); g.fill();
    rr(g, 8, 60, 18, 60, 9); g.fill(); rr(g, 8, 104, 40, 16, 8); g.fill();
    rr(g, 74, 40, 18, 55, 9); g.fill(); rr(g, 52, 82, 40, 16, 8); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(44, 18, 4, 150);
    S.cactus = c;

    c = makeCanvas(170, 250); g = c.getContext('2d');
    g.strokeStyle = '#8a5a2b'; g.lineWidth = 14; g.lineCap = 'round';
    g.beginPath(); g.moveTo(90, 250); g.quadraticCurveTo(70, 140, 95, 50); g.stroke();
    for (let a = 0; a < 7; a++) {
      const ang = -Math.PI / 2 + (a - 3) * 0.5;
      g.strokeStyle = a % 2 ? '#2f9a4a' : '#257d3c'; g.lineWidth = 12;
      g.beginPath(); g.moveTo(95, 50);
      g.quadraticCurveTo(95 + Math.cos(ang) * 50, 50 + Math.sin(ang) * 40 - 10, 95 + Math.cos(ang) * 80, 50 + Math.sin(ang) * 20 + 40);
      g.stroke();
    }
    S.palm = c;

    c = makeCanvas(130, 70); g = c.getContext('2d');
    [[30, 45, 28], [65, 35, 34], [100, 45, 28]].forEach(([x, y, r]) => { g.fillStyle = '#3d8f36'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = '#56ad4c'; g.beginPath(); g.arc(58, 28, 14, 0, Math.PI * 2); g.fill();
    S.bush = c;

    ['L', 'R'].forEach((d) => {
      c = makeCanvas(110, 120); g = c.getContext('2d');
      g.fillStyle = '#444'; g.fillRect(50, 60, 10, 60);
      rr(g, 4, 4, 102, 62, 8); g.fillStyle = '#ffd400'; g.fill();
      g.lineWidth = 4; g.strokeStyle = '#222'; g.stroke();
      g.fillStyle = '#111';
      for (let i = 0; i < 3; i++) {
        const x = 20 + i * 28;
        if (d === 'R') poly(g, [x, 14, x + 16, 35, x, 56, x + 8, 56, x + 24, 35, x + 8, 14], '#111');
        else poly(g, [x + 24, 14, x + 8, 35, x + 24, 56, x + 16, 56, x, 35, x + 16, 14], '#111');
      }
      S['chevron' + d] = c;
    });

    c = makeCanvas(700, 260); g = c.getContext('2d');
    g.fillStyle = '#d9dde3'; g.fillRect(20, 30, 26, 230); g.fillRect(654, 30, 26, 230);
    g.fillStyle = '#9aa1ab'; g.fillRect(40, 30, 6, 230); g.fillRect(674, 30, 6, 230);
    rr(g, 10, 20, 680, 80, 10); g.fillStyle = '#111'; g.fill();
    for (let i = 0; i < 34; i++) for (let j = 0; j < 2; j++) { if ((i + j) % 2) { g.fillStyle = '#fff'; g.fillRect(20 + i * 19.4, 28 + j * 32, 19.4, 32); } }
    rr(g, 200, 32, 300, 56, 8); g.fillStyle = '#e4002b'; g.fill();
    g.fillStyle = '#fff'; g.font = 'italic 900 38px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('START  ·  FINISH', 350, 62);
    S.gantry = c;

    S.billboards = {};
    return S;
  }

  function billboardImage(S, text) {
    if (S.billboards[text]) return S.billboards[text];
    const c = makeCanvas(320, 180);
    const g = c.getContext('2d');
    g.fillStyle = '#555'; g.fillRect(60, 110, 14, 70); g.fillRect(246, 110, 14, 70);
    const grad = g.createLinearGradient(0, 0, 320, 120);
    const hue = (text.length * 47) % 360;
    grad.addColorStop(0, 'hsl(' + hue + ',85%,55%)');
    grad.addColorStop(1, 'hsl(' + ((hue + 60) % 360) + ',85%,45%)');
    rr(g, 6, 6, 308, 112, 12); g.fillStyle = grad; g.fill();
    g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 900 ' + (text.length > 10 ? 34 : 44) + 'px "Arial Black", Impact, sans-serif';
    g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowOffsetY = 3;
    g.fillText(text, 160, 62);
    S.billboards[text] = c;
    return c;
  }

  /* -------------------------------------------------------------- backdrop */
  // Sums of integer-frequency sines tile seamlessly across the layer width.
  function ridge(seed, W, x, amps) {
    let v = 0;
    amps.forEach((a, i) => { v += a * Math.sin((x / W) * Math.PI * 2 * (i + 1) * (i + 2) + seed * (i + 1)); });
    return v;
  }

  function buildBackground(theme) {
    const W = 2048;
    const H = 512;
    const far = makeCanvas(W, H);
    let g = far.getContext('2d');
    const f = theme.far;
    const top = (x) => H * (1 - f.height) + H * 0.25 * (f.mesa ? Math.round(ridge(3, W, x, [0.6, 0.3, 0.1]) * 2) / 2 : ridge(1.7, W, x, [0.5, 0.3, 0.15, 0.08]));
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) g.lineTo(x, top(x));
    g.lineTo(W, H); g.closePath();
    let grad = g.createLinearGradient(0, H * (1 - f.height) - H * 0.25, 0, H);
    grad.addColorStop(0, f.top); grad.addColorStop(1, f.bottom);
    g.fillStyle = grad; g.fill();
    if (f.snow) {
      g.save(); g.clip();
      g.beginPath(); g.moveTo(0, 0);
      for (let x = 0; x <= W; x += 4) g.lineTo(x, H * 0.42 + ridge(5, W, x, [0, 0, 0, 0, 0.04]) * H);
      g.lineTo(W, 0); g.closePath(); g.fillStyle = 'rgba(255,255,255,0.92)'; g.fill();
      g.restore();
    }

    const near = makeCanvas(W, H);
    g = near.getContext('2d');
    const nr = theme.near;
    if (nr.sea) {
      grad = g.createLinearGradient(0, H * (1 - nr.height), 0, H);
      grad.addColorStop(0, nr.top); grad.addColorStop(1, nr.bottom);
      g.fillStyle = grad; g.fillRect(0, H * (1 - nr.height), W, H * nr.height);
      g.fillStyle = 'rgba(255,220,150,0.5)';
      const rng = M.mulberry32(9);
      for (let i = 0; i < 220; i++) g.fillRect(rng() * W, H * (1 - nr.height) + rng() * H * nr.height, 6 + rng() * 30, 2);
    } else {
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 4) g.lineTo(x, H * (1 - nr.height) + H * 0.08 * ridge(4.2, W, x, [0.6, 0.4, 0.2]));
      g.lineTo(W, H); g.closePath();
      grad = g.createLinearGradient(0, H * (1 - nr.height) - 40, 0, H);
      grad.addColorStop(0, nr.top); grad.addColorStop(1, nr.bottom);
      g.fillStyle = grad; g.fill();
      if (nr.trees) {
        g.fillStyle = nr.trees;
        for (let x = 0; x < W; x += 9) {
          const y = H * (1 - nr.height) + H * 0.08 * ridge(4.2, W, x, [0.6, 0.4, 0.2]) + 6;
          const h = 14 + (Math.sin(x * 12.9898) * 0.5 + 0.5) * 18;
          poly(g, [x, y - h, x + 7, y + 4, x - 7, y + 4]);
          g.fill();
        }
      }
    }

    const clouds = makeCanvas(W, H);
    g = clouds.getContext('2d');
    g.fillStyle = theme.clouds;
    const rng = M.mulberry32(3);
    for (let i = 0; i < 9; i++) {
      const cx = (i / 9) * W + rng() * 100;
      const cy = 40 + rng() * 140;
      const s = 30 + rng() * 30;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.ellipse(cx + (k - 2) * s * 0.8, cy + Math.abs(k - 2) * s * 0.15, s * (1.1 - Math.abs(k - 2) * 0.2), s * 0.6, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    return { far, near, clouds };
  }

  function drawLayer(ctx, img, width, height, offset, bottom, layerH) {
    const s = layerH / img.height;
    const tileW = img.width * s;
    let x = -M.wrap(offset * tileW, tileW);
    for (; x < width; x += tileW) ctx.drawImage(img, x, bottom - layerH, tileW, layerH);
  }

  /* ------------------------------------------------------------- bike art */
  // Rear view of rider + bike in unit space: width ~1, origin at tyre contact.
  function drawBikeRear(ctx, bike, cx, cy, size, lean, o) {
    o = o || {};
    const c = bike.colors;
    const t = o.time || 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(size, size);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 0, 0.38, 0.06, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(lean);
    if (o.star) {
      const gr = ctx.createRadialGradient(0, -0.6, 0.1, 0, -0.6, 0.75);
      gr.addColorStop(0, 'hsla(' + ((t * 400) % 360) + ',100%,70%,0.8)');
      gr.addColorStop(1, 'hsla(' + ((t * 400 + 120) % 360) + ',100%,60%,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, -0.6, 0.75, 0, Math.PI * 2); ctx.fill();
    }
    // tyre
    rr(ctx, -0.085, -0.34, 0.17, 0.35, 0.06); ctx.fillStyle = '#141414'; ctx.fill();
    ctx.fillStyle = '#2a2a2a';
    for (let i = 0; i < 5; i++) ctx.fillRect(-0.05, -0.31 + ((i * 0.07 + t * 3) % 0.33), 0.1, 0.02);
    // boxer cylinders
    if (bike.engine === 'boxer') {
      [-1, 1].forEach((s) => {
        rr(ctx, s > 0 ? 0.2 : -0.44, -0.44, 0.24, 0.12, 0.05);
        ctx.fillStyle = '#9aa0a8'; ctx.fill();
        ctx.fillStyle = '#5d636b'; ctx.fillRect(s > 0 ? 0.36 : -0.42, -0.43, 0.04, 0.1);
      });
    }
    // panniers
    if (bike.panniers) {
      [-1, 1].forEach((s) => {
        rr(ctx, s > 0 ? 0.2 : -0.48, -0.74, 0.28, 0.34, 0.03);
        ctx.fillStyle = c.accent; ctx.fill();
        ctx.lineWidth = 0.015; ctx.strokeStyle = '#555'; ctx.stroke();
        ctx.fillStyle = '#333'; ctx.fillRect(s > 0 ? 0.2 : -0.48, -0.64, 0.28, 0.02);
      });
    }
    // exhaust
    rr(ctx, 0.11, -0.47, 0.13, 0.13, 0.06); ctx.fillStyle = '#b8bdc4'; ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0.175, -0.405, 0.04, 0, Math.PI * 2); ctx.fill();
    if (o.boost) {
      const fl = 0.07 + Math.random() * 0.05;
      const gr = ctx.createRadialGradient(0.175, -0.405, 0.01, 0.175, -0.405, fl * 1.6);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, '#8fd8ff'); gr.addColorStop(0.6, 'rgba(255,140,0,0.9)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0.175, -0.405, fl * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    // plate + tail light
    ctx.fillStyle = '#f2f2f2'; ctx.fillRect(-0.07, -0.47, 0.14, 0.08);
    ctx.fillStyle = '#333'; ctx.font = 'bold 0.05px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('MC ' + (M.BIKES.indexOf(bike) + 1 || 1), 0, -0.43);
    if (o.braking) { ctx.fillStyle = 'rgba(255,40,40,0.5)'; ctx.beginPath(); ctx.arc(0, -0.53, 0.12, 0, Math.PI * 2); ctx.fill(); }
    rr(ctx, -0.08, -0.56, 0.16, 0.05, 0.02); ctx.fillStyle = o.braking ? '#ff3030' : '#a01010'; ctx.fill();
    // tail + seat
    poly(ctx, [-0.12, -0.56, 0.12, -0.56, 0.16, -0.7, -0.16, -0.7], c.primary);
    poly(ctx, [-0.12, -0.7, 0.12, -0.7, 0.1, -0.76, -0.1, -0.76], c.seat);
    // bodywork wings
    poly(ctx, [-0.16, -0.58, -0.33, -0.82, -0.3, -0.92, -0.14, -0.76], c.primary);
    poly(ctx, [0.16, -0.58, 0.33, -0.82, 0.3, -0.92, 0.14, -0.76], c.primary);
    poly(ctx, [-0.2, -0.66, -0.31, -0.82, -0.29, -0.86, -0.18, -0.71], c.secondary);
    poly(ctx, [0.2, -0.66, 0.31, -0.82, 0.29, -0.86, 0.18, -0.71], c.secondary);
    // legs & boots
    ctx.fillStyle = '#23252b';
    poly(ctx, [-0.13, -0.8, -0.24, -0.62, -0.25, -0.42, -0.18, -0.42, -0.17, -0.6, -0.06, -0.76]); ctx.fill();
    poly(ctx, [0.13, -0.8, 0.24, -0.62, 0.25, -0.42, 0.18, -0.42, 0.17, -0.6, 0.06, -0.76]); ctx.fill();
    ctx.fillStyle = '#0d0d0d'; ctx.fillRect(-0.27, -0.43, 0.1, 0.07); ctx.fillRect(0.17, -0.43, 0.1, 0.07);
    // windscreen tip
    if (bike.tallScreen) poly(ctx, [-0.15, -1.08, 0.15, -1.08, 0.12, -1.24, -0.12, -1.24], 'rgba(170,200,230,0.55)');
    // arms + mirrors
    ctx.strokeStyle = '#222'; ctx.lineWidth = 0.02;
    ctx.beginPath(); ctx.moveTo(-0.36, -0.98); ctx.lineTo(-0.44, -1.08); ctx.moveTo(0.36, -0.98); ctx.lineTo(0.44, -1.08); ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.ellipse(-0.46, -1.1, 0.06, 0.035, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0.46, -1.1, 0.06, 0.035, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c.rider; ctx.lineWidth = 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-0.17, -1.04); ctx.lineTo(-0.36, -0.96); ctx.moveTo(0.17, -1.04); ctx.lineTo(0.36, -0.96); ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(-0.37, -0.96, 0.04, 0, Math.PI * 2); ctx.arc(0.37, -0.96, 0.04, 0, Math.PI * 2); ctx.fill();
    // torso
    poly(ctx, [-0.15, -0.76, 0.15, -0.76, 0.2, -1.04, 0.12, -1.1, -0.12, -1.1, -0.2, -1.04], c.rider);
    poly(ctx, [-0.03, -0.77, 0.03, -0.77, 0.03, -1.08, -0.03, -1.08], shade(c.rider.length === 7 ? c.rider : '#333333', -0.15));
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-0.15, -0.9, 0.3, 0.025);
    // helmet
    ctx.fillStyle = c.helmet; ctx.beginPath(); ctx.arc(0, -1.19, 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.secondary; ctx.fillRect(-0.025, -1.3, 0.05, 0.2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(-0.04, -1.23, 0.04, 0, Math.PI * 2); ctx.fill();
    if (bike.beak || bike.tallScreen) poly(ctx, [-0.1, -1.27, 0.1, -1.27, 0.13, -1.31, -0.13, -1.31], shade(c.helmet, -0.25));
    ctx.restore();
  }

  // Side profile for the bike picker.
  function drawBikeSide(ctx, bike, w, h, t) {
    const c = bike.colors;
    const s = Math.min(w / 420, h / 250);
    ctx.save();
    ctx.translate(w / 2 - 210 * s, h / 2 - 125 * s + Math.sin(t * 2) * 2 * s);
    ctx.scale(s, s);
    const fr = bike.frontWheel === 21 ? 58 : bike.frontWheel === 17 ? 50 : 54;
    const rear = { x: 100, y: 180, r: 52 };
    const front = { x: 320, y: 180 + (54 - fr) * 0.2, r: fr };
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(210, 236, 180, 10, 0, 0, Math.PI * 2); ctx.fill();
    // swingarm & fork
    ctx.strokeStyle = '#3a3d44'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(rear.x, rear.y); ctx.lineTo(190, 150); ctx.stroke();
    ctx.strokeStyle = '#c7a43a'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(front.x, front.y); ctx.lineTo(285, 70); ctx.stroke();
    // wheels
    [rear, front].forEach((wh) => {
      ctx.fillStyle = '#151515'; ctx.beginPath(); ctx.arc(wh.x, wh.y, wh.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 4; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 60;
      ctx.beginPath(); ctx.arc(wh.x, wh.y, wh.r - 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      const ir = wh.r - 11;
      ctx.strokeStyle = bike.spokes ? '#cfd3d8' : c.secondary === '#1a1a1a' ? '#555' : '#2a2a2a';
      ctx.lineWidth = bike.spokes ? 1.5 : 7;
      const n = bike.spokes ? 18 : 5;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + t * 3;
        ctx.beginPath(); ctx.moveTo(wh.x + Math.cos(a) * 9, wh.y + Math.sin(a) * 9); ctx.lineTo(wh.x + Math.cos(a) * ir, wh.y + Math.sin(a) * ir); ctx.stroke();
      }
      ctx.strokeStyle = bike.spokes ? (bike.id === 'r1300gsa' ? '#d4a017' : '#9aa0a8') : '#333';
      ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(wh.x, wh.y, ir, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(wh.x, wh.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#bbb'; ctx.beginPath(); ctx.arc(wh.x, wh.y, 22, 0, Math.PI * 2); ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
    });
    // engine
    ctx.fillStyle = '#4a4f57'; rr(ctx, 150, 120, 95, 60, 12); ctx.fill();
    if (bike.engine === 'boxer') {
      ctx.fillStyle = '#a9afb7'; rr(ctx, 205, 135, 70, 34, 10); ctx.fill();
      ctx.fillStyle = '#6b7079'; for (let i = 0; i < 5; i++) ctx.fillRect(215 + i * 11, 137, 4, 30);
    } else {
      ctx.fillStyle = '#6b7079'; for (let i = 0; i < 4; i++) ctx.fillRect(160 + i * 20, 112, 12, 40);
    }
    // exhaust
    ctx.fillStyle = '#b8bdc4'; rr(ctx, 40, 118, 80, 26, 13); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(42, 131, 5, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(115, 135); ctx.quadraticCurveTo(170, 190, 230, 175); ctx.stroke();
    // panniers
    if (bike.panniers) {
      ctx.fillStyle = c.accent; rr(ctx, 30, 70, 90, 62, 6); ctx.fill();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#333'; ctx.fillRect(30, 88, 90, 4);
    }
    // tail & seat
    poly(ctx, [60, 82, 150, 88, 180, 112, 120, 112], c.primary);
    poly(ctx, [80, 78, 200, 76, 215, 88, 150, 90], c.seat);
    // tank
    poly(ctx, [190, 72, 260, 52, 300, 70, 290, 118, 210, 118], c.primary);
    poly(ctx, [205, 95, 288, 82, 285, 98, 210, 110], c.secondary);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; poly(ctx, [200, 74, 258, 57, 270, 62, 210, 80]); ctx.fill();
    // front: beak, headlight, screen
    if (bike.beak) poly(ctx, [300, 90, 352, 112, 344, 120, 296, 104], c.primary);
    poly(ctx, [282, 50, 318, 62, 322, 100, 296, 98], shade(c.primary.length === 7 ? c.primary : '#888888', -0.1));
    ctx.fillStyle = '#eaf6ff'; ctx.beginPath(); ctx.ellipse(318, 80, 7, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(180,210,240,0.6)';
    poly(ctx, bike.tallScreen ? [282, 52, 300, 52, 290, 2, 276, 6] : [284, 52, 300, 52, 296, 24, 284, 26]); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(270, 50); ctx.lineTo(250, 42); ctx.stroke();
    // front mudguard
    ctx.strokeStyle = bike.engine === 'v' && bike.id === 'desertx' ? c.primary : '#1a1a1a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(front.x, front.y, front.r + 8, Math.PI * 1.1, Math.PI * 1.55); ctx.stroke();
    ctx.fillStyle = c.accent; ctx.font = 'italic 900 15px "Arial Black", Impact, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(bike.make.toUpperCase(), 160, 104);
    ctx.restore();
  }

  function drawItemIcon(ctx, item, cx, cy, size, t) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(size / 100, size / 100);
    if (item === 'turbo') {
      const g = ctx.createLinearGradient(0, -40, 0, 40); g.addColorStop(0, '#fff36b'); g.addColorStop(1, '#ff7b00');
      poly(ctx, [-30, 35, -5, -40, 5, -5, 30, -10, 5, 40, -5, 5], null); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = '#7a2e00'; ctx.stroke();
    } else if (item === 'oil') {
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(0, 15, 40, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b2b2b'; rr(ctx, -16, -40, 32, 50, 6); ctx.fill();
      ctx.fillStyle = '#ffcc00'; ctx.fillRect(-16, -25, 32, 14);
      const g = ctx.createLinearGradient(-30, 0, 30, 30); g.addColorStop(0, 'rgba(120,80,255,.6)'); g.addColorStop(1, 'rgba(0,255,200,.4)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(-8, 18, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
    } else if (item === 'rocket') {
      ctx.rotate(-0.6);
      ctx.fillStyle = '#e8e8e8'; rr(ctx, -12, -30, 24, 56, 12); ctx.fill();
      ctx.fillStyle = '#e4002b'; poly(ctx, [-12, -22, 0, -46, 12, -22]); ctx.fill();
      poly(ctx, [-12, 14, -24, 30, -12, 26]); ctx.fill(); poly(ctx, [12, 14, 24, 30, 12, 26]); ctx.fill();
      ctx.fillStyle = '#ff9d00'; poly(ctx, [-8, 28, 0, 28 + 16 + Math.sin((t || 0) * 40) * 6, 8, 28]); ctx.fill();
    } else if (item === 'star') {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 18 : 42;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = 'hsl(' + (((t || 0) * 300) % 360) + ',100%,60%)'; ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    ctx.restore();
  }

  function drawItemBox(ctx, x, y, size, t) {
    const bob = Math.sin(t * 4 + x) * size * 0.08;
    const sq = Math.abs(Math.cos(t * 2)) * 0.3 + 0.7;
    ctx.save();
    ctx.translate(x, y - size * 0.75 + bob);
    ctx.scale(sq, 1);
    const g = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
    const h = (t * 120) % 360;
    g.addColorStop(0, 'hsla(' + h + ',100%,65%,0.85)');
    g.addColorStop(0.5, 'hsla(' + ((h + 120) % 360) + ',100%,65%,0.85)');
    g.addColorStop(1, 'hsla(' + ((h + 240) % 360) + ',100%,65%,0.85)');
    rr(ctx, -size / 2, -size / 2, size, size, size * 0.18);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.06); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '900 ' + Math.round(size * 0.7) + 'px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, size * 0.04);
    ctx.restore();
  }

  /* ------------------------------------------------------------ road view */
  function project(p, camX, camY, camZ, width, height) {
    p.camera.x = -camX;
    p.camera.y = p.world.y - camY;
    p.camera.z = p.world.z - camZ;
    p.screen.scale = CAMERA_DEPTH / p.camera.z;
    p.screen.x = Math.round(width / 2 + p.screen.scale * p.camera.x * width / 2);
    p.screen.y = Math.round(height / 2 - p.screen.scale * p.camera.y * height / 2);
    p.screen.w = Math.round(p.screen.scale * ROAD_WIDTH * width / 2);
  }

  function renderSegment(ctx, width, seg, x1, y1, w1, x2, y2, w2, theme, alt, time) {
    const r1 = w1 / Math.max(6, 2 * LANES);
    const r2 = w2 / Math.max(6, 2 * LANES);
    // Segments are drawn front-to-back, so overlap each one a pixel into the
    // (not yet drawn) farther segment to hide anti-aliasing seams.
    const yo = y2 - 1;
    const h = y1 - yo;
    ctx.fillStyle = theme.grass[alt]; ctx.fillRect(0, yo, width, h);
    poly(ctx, [x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, yo, x2 - w2 - r2, yo], theme.rumble[alt]);
    poly(ctx, [x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, yo, x2 + w2 + r2, yo], theme.rumble[alt]);
    poly(ctx, [x1 - w1, y1, x1 + w1, y1, x2 + w2, yo, x2 - w2, yo], theme.road[alt]);
    if (seg.checker) {
      const cols = 10;
      for (let i = 0; i < cols; i++) {
        if ((i + seg.index) % 2) continue;
        const a1 = x1 - w1 + (2 * w1 * i) / cols;
        const b1 = a1 + (2 * w1) / cols;
        const a2 = x2 - w2 + (2 * w2 * i) / cols;
        const b2 = a2 + (2 * w2) / cols;
        poly(ctx, [a1, y1, b1, y1, b2, y2, a2, y2], '#f5f5f5');
      }
    } else if (alt) {
      const l1 = w1 / Math.max(32, 8 * LANES);
      const l2 = w2 / Math.max(32, 8 * LANES);
      const lw1 = (w1 * 2) / LANES;
      const lw2 = (w2 * 2) / LANES;
      let lx1 = x1 - w1 + lw1;
      let lx2 = x2 - w2 + lw2;
      for (let lane = 1; lane < LANES; lane++, lx1 += lw1, lx2 += lw2) {
        poly(ctx, [lx1 - l1 / 2, y1, lx1 + l1 / 2, y1, lx2 + l2 / 2, y2, lx2 - l2 / 2, y2], theme.lane);
      }
    }
    if (seg.boost !== null) {
      const bx1 = x1 + seg.boost * w1;
      const bx2 = x2 + seg.boost * w2;
      const pw1 = w1 * 0.22;
      const pw2 = w2 * 0.22;
      const on = (seg.index + Math.floor(time * 16)) % 2;
      poly(ctx, [bx1 - pw1, y1, bx1 + pw1, y1, bx2 + pw2, y2, bx2 - pw2, y2], on ? '#ffe600' : '#ff7a00');
    }
    if (seg.fog < 1) {
      ctx.globalAlpha = 1 - seg.fog;
      ctx.fillStyle = theme.fog; ctx.fillRect(0, yo, width, h);
      ctx.globalAlpha = 1;
    }
  }

  function drawImageSprite(ctx, img, worldW, scale, x, y, clipY, width) {
    const destW = worldW * scale * width / 2;
    const destH = destW * img.height / img.width;
    const destX = x - destW / 2;
    const destY = y - destH;
    if (destW < 1 || destX > width || destX + destW < 0) return;
    const clipH = clipY ? Math.max(0, destY + destH - clipY) : 0;
    if (clipH >= destH) return;
    ctx.drawImage(img, 0, 0, img.width, img.height - (img.height * clipH) / destH, destX, destY, destW, destH - clipH);
  }

  function withClip(ctx, width, clipY, fn) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, -10000, width, clipY + 10000); ctx.clip();
    fn();
    ctx.restore();
  }

  function renderView(ctx, vp, race, viewer, view, A, time) {
    const width = vp.w;
    const height = vp.h;
    const track = race.track;
    const segs = track.segments;
    const L = track.length;
    const theme = A.theme;
    ctx.save();
    ctx.beginPath(); ctx.rect(vp.x, vp.y, width, height); ctx.clip();
    ctx.translate(vp.x, vp.y);
    if (view.shake > 0) ctx.translate((Math.random() - 0.5) * view.shake * 14, (Math.random() - 0.5) * view.shake * 14);

    const position = M.wrap(viewer.z - PLAYER_Z, L);
    const baseSegment = M.findSegment(track, position);
    const basePercent = M.percentRemaining(position, SEG);
    const playerSegment = M.findSegment(track, viewer.z);
    const playerPercent = M.percentRemaining(viewer.z, SEG);
    const playerY = M.lerp(playerSegment.p1.world.y, playerSegment.p2.world.y, playerPercent);

    // sky + parallax
    const sky = ctx.createLinearGradient(0, 0, 0, height * 0.6);
    sky.addColorStop(0, theme.sky[0]); sky.addColorStop(0.6, theme.sky[1]); sky.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    if (theme.sun) {
      const sx = width * theme.sun.x;
      const sy = height * theme.sun.y * 0.8;
      const sr = Math.max(width, height) * theme.sun.r;
      const g = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 2.5);
      g.addColorStop(0, theme.sun.color); g.addColorStop(0.25, theme.sun.color); g.addColorStop(0.3, 'rgba(255,220,150,0.5)'); g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
    }
    const horizon = height * 0.5;
    const lift = Math.min(height * 0.08, Math.max(-height * 0.08, -playerY / 120));
    drawLayer(ctx, A.bg.clouds, width, height, view.bg * 0.3 + time * 0.004, height * 0.45, height * 0.45);
    drawLayer(ctx, A.bg.far, width, height, view.bg * 0.6, horizon + height * 0.06 + lift * 0.3, height * 0.42);
    drawLayer(ctx, A.bg.near, width, height, view.bg, horizon + height * 0.08 + lift * 0.6, height * 0.36);

    // road
    let maxy = height;
    let x = 0;
    let dx = -(baseSegment.curve * basePercent);
    const camX = viewer.x * ROAD_WIDTH;
    const fogDensity = theme.fogDensity;
    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const seg = segs[(baseSegment.index + n) % segs.length];
      seg.looped = seg.index < baseSegment.index;
      seg.fog = 1 / Math.pow(Math.E, Math.pow(n / DRAW_DISTANCE, 2) * fogDensity);
      seg.clip = maxy;
      const camZ = position - (seg.looped ? L : 0);
      project(seg.p1, camX - x, playerY + CAMERA_HEIGHT, camZ, width, height);
      project(seg.p2, camX - x - dx, playerY + CAMERA_HEIGHT, camZ, width, height);
      x += dx;
      dx += seg.curve;
      if (seg.p1.camera.z <= CAMERA_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
      renderSegment(ctx, width, seg, seg.p1.screen.x, seg.p1.screen.y, seg.p1.screen.w, seg.p2.screen.x, seg.p2.screen.y, seg.p2.screen.w,
        theme, Math.floor(seg.index / RUMBLE_LENGTH) % 2, time);
      maxy = seg.p1.screen.y;
    }

    // sprites back-to-front
    for (let n = DRAW_DISTANCE - 1; n > 0; n--) {
      const seg = segs[(baseSegment.index + n) % segs.length];
      if (seg.p1.camera.z <= CAMERA_DEPTH) continue;
      for (const s of seg.sprites) {
        const def = SPRITES[s.type];
        const img = s.type === 'billboard' ? billboardImage(A.sprites, s.text) : A.sprites[s.type];
        const scale = seg.p1.screen.scale;
        const sx = seg.p1.screen.x + scale * s.offset * ROAD_WIDTH * width / 2;
        drawImageSprite(ctx, img, def.w, scale, sx, seg.p1.screen.y, seg.clip, width);
      }
      if (!seg.dyn.length) continue;
      const list = seg.dyn.slice().sort((a, b) => b.z - a.z);
      for (const o of list) {
        if (o.ref === viewer) continue;
        const pct = M.percentRemaining(o.z, SEG);
        const scale = M.lerp(seg.p1.screen.scale, seg.p2.screen.scale, pct);
        const sx = M.lerp(seg.p1.screen.x, seg.p2.screen.x, pct) + scale * o.x * ROAD_WIDTH * width / 2;
        const sy = M.lerp(seg.p1.screen.y, seg.p2.screen.y, pct);
        if (sy - 2 > seg.clip + 1000) continue;
        const unit = scale * width / 2;
        withClip(ctx, width, seg.clip, () => {
          if (o.kind === 'box') drawItemBox(ctx, sx, sy, 260 * unit, time);
          else if (o.kind === 'oil') {
            ctx.fillStyle = 'rgba(10,10,10,0.9)';
            ctx.beginPath(); ctx.ellipse(sx, sy, 300 * unit, 70 * unit, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(140,90,255,0.35)';
            ctx.beginPath(); ctx.ellipse(sx - 80 * unit, sy - 10 * unit, 110 * unit, 22 * unit, 0, 0, Math.PI * 2); ctx.fill();
          } else if (o.kind === 'rocket') {
            drawItemIcon(ctx, 'rocket', sx, sy - 160 * unit, 300 * unit, time);
          } else if (o.kind === 'racer') {
            const r = o.ref;
            const size = BIKE_WORLD_W * unit;
            // rivals right beside the camera project huge; fade them out
            const near = size / (BIKE_WORLD_W * (CAMERA_DEPTH / PLAYER_Z) * width / 2);
            const alpha = near <= 1.05 ? 1 : Math.max(0, 1 - (near - 1.05) / 0.55);
            if (alpha <= 0) return;
            ctx.globalAlpha = alpha;
            const wob = r.spinTime > 0 ? Math.sin(r.spinTime * 20) * 0.6 : 0;
            drawBikeRear(ctx, r.bike, sx, sy, size, r.lean + wob, { time, boost: r.boostTime > 0, star: r.starTime > 0, braking: false });
            if (size > 26) {
              ctx.font = '800 ' + Math.max(10, Math.min(18, size * 0.16)) + 'px system-ui, sans-serif';
              ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
              const label = r.name;
              const tw = ctx.measureText(label).width + 10;
              const ly = sy - size * 1.42;
              ctx.fillStyle = r.human ? 'rgba(255,200,0,0.9)' : 'rgba(0,0,0,0.55)';
              rr(ctx, sx - tw / 2, ly - 18, tw, 18, 9); ctx.fill();
              ctx.fillStyle = r.human ? '#000' : '#fff';
              ctx.fillText(label, sx, ly - 2);
            }
          }
        });
      }
    }

    // viewer's own bike
    const ps = PLAYER_Z;
    const camY = M.lerp(playerSegment.p1.camera.y, playerSegment.p2.camera.y, playerPercent);
    const by = height / 2 - (CAMERA_DEPTH / ps) * camY * height / 2;
    const size = BIKE_WORLD_W * (CAMERA_DEPTH / ps) * width / 2;
    const sp = viewer.speed / BASE_MAX_SPEED;
    const bounce = (viewer.offroad ? 3 : 1) * Math.sin(time * 40) * sp * size * 0.012;
    const wob = viewer.spinTime > 0 ? Math.sin(viewer.spinTime * 20) * 0.7 : 0;
    const drift = viewer.drifting ? viewer.driftDir * 0.12 : 0;
    // particles (dust / drift sparks)
    if (viewer.offroad && sp > 0.15 && Math.random() < 0.8) {
      view.particles.push({ x: width / 2 + (Math.random() - 0.5) * size * 0.3, y: by - size * 0.05, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, life: 0.7, max: 0.7, r: size * 0.08, color: theme.grass[1] });
    }
    if (viewer.drifting && Math.random() < 0.9) {
      const hot = viewer.driftCharge > 0.8;
      view.particles.push({ x: width / 2 - viewer.driftDir * size * 0.08, y: by - size * 0.02, vx: -viewer.driftDir * (60 + Math.random() * 120), vy: -60 - Math.random() * 80, life: 0.35, max: 0.35, r: size * 0.03, color: hot ? (viewer.driftCharge > 1.6 ? '#ff4df2' : '#3fd2ff') : '#ffd23f' });
    }
    view.particles = view.particles.filter((p) => (p.life -= view.dt) > 0);
    view.particles.forEach((p) => {
      p.x += p.vx * view.dt; p.y += p.vy * view.dt;
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.5 - p.life / p.max), 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawBikeRear(ctx, viewer.bike, width / 2, by + bounce, size, viewer.lean + wob + drift, {
      time, boost: viewer.boostTime > 0, star: viewer.starTime > 0, braking: view.braking,
    });

    // speed lines
    if (viewer.boostTime > 0 || viewer.starTime > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2;
        const r0 = Math.max(width, height) * (0.35 + Math.random() * 0.2);
        ctx.beginPath();
        ctx.moveTo(width / 2 + Math.cos(a) * r0, height / 2 + Math.sin(a) * r0);
        ctx.lineTo(width / 2 + Math.cos(a) * r0 * 1.4, height / 2 + Math.sin(a) * r0 * 1.4);
        ctx.stroke();
      }
    }

    drawHUD(ctx, width, height, race, viewer, view, A, time);
    ctx.restore();
  }

  /* -------------------------------------------------------------------- HUD */
  function hudText(ctx, text, x, y, size, color, align, stroke) {
    ctx.font = 'italic 900 ' + Math.round(size) + 'px "Arial Black", Impact, system-ui, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.16);
    ctx.strokeStyle = stroke || 'rgba(0,0,0,0.75)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color || '#fff';
    ctx.fillText(text, x, y);
  }

  function drawHUD(ctx, w, h, race, r, view, A, t) {
    const u = Math.min(w / 900, h / 520);
    const pad = 14 * Math.max(0.6, u);
    // position
    const placeCol = r.place === 1 ? '#ffd700' : r.place === 2 ? '#e0e0e0' : r.place === 3 ? '#ff9b4a' : '#ffffff';
    hudText(ctx, M.ordinal(r.place), pad, pad + 64 * u, 70 * u, placeCol);
    hudText(ctx, '/ ' + race.racers.length, pad + ctx.measureText(M.ordinal(r.place)).width + 8 * u, pad + 64 * u, 26 * u, '#fff');
    const lap = Math.max(1, Math.min(race.laps, r.lap));
    hudText(ctx, 'LAP ' + lap + '/' + race.laps, pad, pad + 100 * u, 26 * u, '#fff');
    hudText(ctx, M.formatTime(r.finished ? r.finishTime : race.time), pad, pad + 130 * u, 22 * u, '#bfe8ff');
    if (view.name) hudText(ctx, view.name, pad, pad + 156 * u, 18 * u, '#ffd23f');

    // item slot
    const box = 84 * u;
    const bx = w - pad - box;
    const by = pad;
    rr(ctx, bx, by, box, box, 14 * u);
    ctx.fillStyle = 'rgba(10,15,40,0.75)'; ctx.fill();
    ctx.lineWidth = 4 * u; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
    if (r.item) {
      const shown = r.itemRoll > 0 ? M.ITEMS[Math.floor(t * 14) % M.ITEMS.length] : r.item;
      drawItemIcon(ctx, shown, bx + box / 2, by + box / 2, box * 0.8, t);
    }
    if (view.itemKey && r.item && r.itemRoll <= 0) hudText(ctx, view.itemKey, bx + box / 2, by + box + 20 * u, 14 * u, '#fff', 'center');

    // speedometer
    const kmh = Math.round((r.speed / BASE_MAX_SPEED) * KMH_AT_BASE);
    // on touch the bottom corners belong to the joystick and buttons
    const rad = 62 * u;
    const cx = view.touch ? bx - pad - rad - 10 * u : w - pad - 70 * u;
    const cy = view.touch ? pad + rad + 10 * u : h - pad - 30 * u;
    ctx.lineWidth = 10 * u; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.arc(cx, cy, rad, Math.PI, Math.PI * 2); ctx.stroke();
    const frac = Math.min(1, kmh / 320);
    const sg = ctx.createLinearGradient(cx - rad, 0, cx + rad, 0);
    sg.addColorStop(0, '#3fd2ff'); sg.addColorStop(0.6, '#ffe600'); sg.addColorStop(1, '#ff3b3b');
    ctx.strokeStyle = sg;
    ctx.beginPath(); ctx.arc(cx, cy, rad, Math.PI, Math.PI + Math.PI * frac); ctx.stroke();
    ctx.lineCap = 'butt';
    hudText(ctx, String(kmh), cx, cy - 8 * u, 34 * u, '#fff', 'center');
    hudText(ctx, 'km/h', cx, cy + 14 * u, 13 * u, '#ddd', 'center');

    // drift charge
    if (r.drifting) {
      const c = r.driftCharge > 1.6 ? '#ff4df2' : r.driftCharge > 0.8 ? '#3fd2ff' : '#ffd23f';
      hudText(ctx, 'DRIFT!', w / 2, h * 0.3, 26 * u, c, 'center');
    }

    // minimap
    const mm = A.layout;
    const ms = Math.min(150 * u, h * 0.28);
    const mx = view.touch ? w - pad - ms : pad;
    const my = view.touch ? by + box + 30 * u : h - pad - ms;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    mm.forEach((p, i) => (i ? ctx.lineTo(mx + p.x * ms, my + p.y * ms) : ctx.moveTo(mx + p.x * ms, my + p.y * ms)));
    ctx.closePath();
    ctx.lineWidth = 9 * u; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
    ctx.lineWidth = 5 * u; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
    const n = race.track.segments.length;
    const at = (z) => mm[Math.min(mm.length - 1, Math.floor((M.wrap(z, race.track.length) / SEG / n) * mm.length))];
    const s0 = mm[0];
    ctx.fillStyle = '#000'; ctx.fillRect(mx + s0.x * ms - 4 * u, my + s0.y * ms - 4 * u, 8 * u, 8 * u);
    race.racers.slice().sort((a) => (a === r ? 1 : 0)).forEach((o) => {
      const p = at(o.z);
      ctx.beginPath(); ctx.arc(mx + p.x * ms, my + p.y * ms, (o === r ? 7 : 4.5) * u, 0, Math.PI * 2);
      ctx.fillStyle = o === r ? '#ffd23f' : o.human ? '#3fd2ff' : o.bike.colors.primary;
      ctx.fill(); ctx.lineWidth = 2 * u; ctx.strokeStyle = '#000'; ctx.stroke();
    });
    ctx.restore();

    // banners
    if (race.phase === 'countdown') {
      const n2 = Math.ceil(race.countdown);
      drawLights(ctx, w / 2, h * 0.16, u, 3 - n2);
      hudText(ctx, String(n2), w / 2, h * 0.45, 120 * u, '#ffd23f', 'center');
    } else if (race.time < 1.2) {
      hudText(ctx, 'GO!', w / 2, h * 0.45, 130 * u * (1 + race.time * 0.3), '#3dff6e', 'center');
      drawLights(ctx, w / 2, h * 0.16, u, 3);
    }
    if (view.banner && view.bannerTime > 0) {
      ctx.globalAlpha = Math.min(1, view.bannerTime * 2);
      hudText(ctx, view.banner, w / 2, h * 0.38, 54 * u, view.bannerColor || '#fff', 'center');
      ctx.globalAlpha = 1;
    }
    if (r.finished) {
      hudText(ctx, 'FINISHED ' + M.ordinal(r.finishPlace || r.place) + '!', w / 2, h * 0.3, 60 * u, '#ffd700', 'center');
    }
  }

  function drawLights(ctx, cx, cy, u, lit) {
    const r = 16 * u;
    rr(ctx, cx - r * 5, cy - r * 1.5, r * 10, r * 3, r);
    ctx.fillStyle = 'rgba(15,15,20,0.85)'; ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(cx + (i - 1) * r * 3, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = lit >= 3 ? '#3dff6e' : i < lit ? '#ff3030' : '#3a1010';
      ctx.fill();
    }
  }

  function drawMinimapPreview(ctx, layout, w, h, color) {
    ctx.clearRect(0, 0, w, h);
    const s = Math.min(w, h) * 0.8;
    const ox = (w - s) / 2;
    const oy = (h - s) / 2;
    ctx.beginPath();
    layout.forEach((p, i) => (i ? ctx.lineTo(ox + p.x * s, oy + p.y * s) : ctx.moveTo(ox + p.x * s, oy + p.y * s)));
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = color || '#fff'; ctx.stroke();
  }

  window.MMCRender = {
    THEMES, buildSprites, buildBackground, renderView, drawBikeSide, drawBikeRear, drawItemIcon, drawMinimapPreview,
  };
})();

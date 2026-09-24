'use strict';
// World constants, shared state, sound synth and destructible terrain.

const W = 1280, H = 720;
const WATER_Y = 652;
const G = 620;             // gravity, px/s²
const WIND_ACC = 150;      // sideways px/s² at full wind
const TS = 2;              // terrain canvas supersampling
const STEP = 1 / 120;      // fixed physics step
const TAU = Math.PI * 2;
const PLATEAU_Y = 430;
const FORT = { x: 26, w: 104, top: 318, front: 150 };   // enemies past `front` hit the fort
const GUN = { x: 92, y: 300 };                           // muzzle pivot of the player's worm

const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const pick = a => a[Math.floor(Math.random() * a.length)];
const view = { k: 1, css: 1 }; // canvas px and CSS px per world px, set by layout()
const fontPx = px => Math.round(Math.max(px, 12 / view.css)); // canvas text never drops below 12 CSS px on a shrunken canvas
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// Everything that changes during a run. game.js resets it.
const S = {
  phase: 'title', paused: false, t: 0,
  wave: 0, coins: 0, kills: 0, fortHp: 100, fortMax: 100, fortFlash: 0,
  wind: 0, shake: 0, flash: 0,
  enemies: [], shots: [], parts: [], texts: [], fires: [], towers: [], graves: [], strikes: [],
  ammo: {}, weapon: 'bazooka', cooldown: 0,
  aim: { x: 700, y: 300 }, charging: false, power: 0, placing: null,
};

// ---------- sound: everything synthesized, no assets ----------
const Sfx = (() => {
  let ac = null, out = null, noise = null, muted = false;
  const last = {};
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      out = ac.createGain();
      out.gain.value = muted ? 0 : 0.55;
      out.connect(ac.createDynamicsCompressor()).connect(ac.destination);
      noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }
  // rate-limit each sound so a 12-bomblet cluster doesn't clip
  const ok = (name, gap) => {
    if (!ac || muted) return false;
    const n = ac.currentTime;
    if (last[name] && n - last[name] < gap) return false;
    last[name] = n;
    return true;
  };
  function hiss(type, f0, f1, dur, vol, q = 1, delay = 0) {
    const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function tone(type, f0, f1, dur, vol, delay = 0) {
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  return {
    init,
    get muted() { return muted; },
    toggle() { muted = !muted; if (out) out.gain.value = muted ? 0 : 0.55; return muted; },
    boom(size = 1) {
      if (!ok('boom', 0.035)) return;
      const s = Math.min(size, 3);
      hiss('lowpass', 1400 + 600 * s, 50, 0.45 + 0.35 * s, Math.min(1, 0.45 + 0.25 * s));
      tone('sine', 110, 28, 0.35 + 0.25 * s, Math.min(0.9, 0.4 + 0.25 * s));
    },
    launch() { if (ok('launch', 0.05)) hiss('bandpass', 350, 2200, 0.28, 0.45, 1.4); },
    toss() { if (ok('toss', 0.05)) hiss('bandpass', 900, 450, 0.16, 0.3, 2); },
    bounce() { if (ok('bounce', 0.06)) tone('triangle', 260, 140, 0.08, 0.35); },
    splash() {
      if (!ok('splash', 0.08)) return;
      hiss('lowpass', 2500, 300, 0.5, 0.5);
      tone('sine', 500, 1400, 0.12, 0.15, 0.05); tone('sine', 420, 1100, 0.1, 0.12, 0.16);
    },
    squeak() { if (ok('squeak', 0.04)) { const p = rand(700, 1100); tone('square', p, p * 0.45, 0.16, 0.1); } },
    coin() { if (ok('coin', 0.05)) { tone('sine', 988, 988, 0.08, 0.16); tone('sine', 1318, 1318, 0.16, 0.16, 0.07); } },
    shot() { if (ok('shot', 0.07)) { hiss('highpass', 3000, 1500, 0.05, 0.22); tone('square', 180, 90, 0.04, 0.07); } },
    freeze() {
      if (!ok('freeze', 0.1)) return;
      hiss('highpass', 6000, 2500, 0.6, 0.35);
      [1568, 2093, 2637].forEach((f, i) => tone('sine', f, f, 0.5, 0.07, i * 0.06));
    },
    fire() { if (ok('fire', 0.12)) hiss('bandpass', 700, 250, 0.7, 0.35, 0.8); },
    thud() { if (ok('thud', 0.1)) { tone('sawtooth', 140, 50, 0.25, 0.22); hiss('lowpass', 800, 100, 0.3, 0.4); } },
    click() { if (ok('click', 0.03)) tone('triangle', 660, 520, 0.05, 0.12); },
    horn() { if (ok('horn', 0.5)) { tone('sawtooth', 220, 220, 0.3, 0.14); tone('sawtooth', 294, 294, 0.5, 0.14, 0.28); } },
    win() { if (ok('win', 0.5)) [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22, 0.2, i * 0.1)); },
    lose() { if (ok('lose', 1)) [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.97, 0.35, 0.22, i * 0.22)); },
    baa() {
      if (!ok('baa', 0.4)) return;
      const t = ac.currentTime, o = ac.createOscillator(), l = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(480, t); o.frequency.linearRampToValueAtTime(370, t + 0.5);
      l.frequency.value = 26; lg.gain.value = 30; l.connect(lg).connect(o.frequency);
      f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 2;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      o.connect(f).connect(g).connect(out); o.start(t); l.start(t); o.stop(t + 0.6); l.stop(t + 0.6);
    },
    holy() { // the choir
      if (!ok('holy', 1)) return;
      const t = ac.currentTime;
      [440, 554.4, 659.3, 880].forEach(fr => {
        const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = rand(-8, 8);
        f.type = 'lowpass'; f.frequency.value = 1800;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.15);
        g.gain.setValueAtTime(0.08, t + 1.1); g.gain.exponentialRampToValueAtTime(0.001, t + 1.7);
        o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 1.8);
      });
    },
  };
})();

// ---------- destructible terrain: 1 byte per pixel mask + painted canvas ----------
// mask: 0 air, 1 dirt, 2 bedrock (fort foundation, never destroyed)
const Terrain = (() => {
  const mask = new Uint8Array(W * H);
  const cv = document.createElement('canvas');
  cv.width = W * TS; cv.height = H * TS;
  const tx = cv.getContext('2d');
  const surf = new Float32Array(W);

  function generate() {
    const p = [rand(TAU), rand(TAU), rand(TAU), rand(TAU)];
    for (let x = 0; x < W; x++) {
      let h = 488 + 58 * Math.sin(x * 0.0052 + p[0]) + 30 * Math.sin(x * 0.0127 + p[1]) + 11 * Math.sin(x * 0.034 + p[2]) + 4 * Math.sin(x * 0.09 + p[3]);
      h = lerp(PLATEAU_Y, h, smooth(FORT.front, 300, x)); // fort plateau
      h = lerp(h, 470, smooth(W - 200, W - 40, x));        // flat ledge where the legion lands
      surf[x] = clamp(h, 360, 612);
    }
    mask.fill(0);
    for (let x = 0; x < W; x++) {
      for (let y = Math.round(surf[x]); y < H; y++) mask[y * W + x] = x < FORT.front && y >= PLATEAU_Y ? 2 : 1;
    }
    paint();
  }

  function paint() {
    tx.setTransform(TS, 0, 0, TS, 0, 0);
    tx.globalCompositeOperation = 'source-over';
    tx.clearRect(0, 0, W, H);
    const sy = x => surf[Math.min(W - 1, x | 0)];
    const body = new Path2D();
    body.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) body.lineTo(x, sy(x));
    body.lineTo(W, H); body.closePath();
    const g = tx.createLinearGradient(0, 360, 0, H);
    g.addColorStop(0, '#9a6238'); g.addColorStop(0.45, '#6e4127'); g.addColorStop(1, '#3b2216');
    tx.fillStyle = g; tx.fill(body);

    tx.save(); tx.clip(body);
    for (let i = 0; i < 7; i++) { // strata
      const y0 = 480 + i * 34 + rand(-6, 6);
      tx.strokeStyle = `rgba(40,20,10,${rand(0.08, 0.16)})`; tx.lineWidth = rand(3, 9);
      tx.beginPath();
      for (let x = 0; x <= W; x += 16) tx.lineTo(x, y0 + Math.sin(x * 0.01 + i) * 8 + (sy(x) - 480) * 0.35);
      tx.stroke();
    }
    for (let i = 0; i < 3200; i++) {
      tx.fillStyle = Math.random() < 0.6 ? `rgba(30,14,6,${rand(0.1, 0.3)})` : `rgba(255,214,170,${rand(0.05, 0.14)})`;
      const s = rand(0.8, 2.6);
      tx.fillRect(rand(W), rand(360, H), s, s);
    }
    for (let i = 0; i < 14; i++) { // roots
      let x = rand(FORT.front, W), y = sy(x) + 4;
      tx.strokeStyle = 'rgba(58,32,16,.55)'; tx.lineWidth = rand(1, 2.2);
      tx.beginPath(); tx.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += rand(-8, 8); y += rand(5, 12); tx.lineTo(x, y); }
      tx.stroke();
    }
    for (let i = 0; i < 110; i++) { // pebbles
      const x = rand(W), y = rand(sy(x) + 18, H), rx = rand(3, 9), ry = rx * rand(0.5, 0.8);
      tx.fillStyle = pick(['#8d7f74', '#a39486', '#6f6259', '#b0876a']);
      tx.beginPath(); tx.ellipse(x, y, rx, ry, rand(TAU), 0, TAU); tx.fill();
      tx.fillStyle = 'rgba(255,255,255,.18)';
      tx.beginPath(); tx.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.4, ry * 0.3, 0, 0, TAU); tx.fill();
    }
    tx.restore();

    const line = new Path2D();
    for (let x = 0; x <= W; x += 2) line.lineTo(x, sy(x));
    tx.lineJoin = 'round';
    tx.strokeStyle = '#2f6d22'; tx.lineWidth = 11; tx.stroke(line);
    tx.strokeStyle = '#58b336'; tx.lineWidth = 6; tx.stroke(line);
    tx.save(); tx.translate(0, -2); tx.strokeStyle = '#86d655'; tx.lineWidth = 2.5; tx.stroke(line); tx.restore();
    tx.lineWidth = 1.2;
    for (let x = 0; x < W; x += 2.5) { // blades
      const y = sy(x) - 2, h = rand(3, 8);
      tx.strokeStyle = pick(['#4aa02c', '#6cc644', '#8ad65a', '#3d8b27']);
      tx.beginPath(); tx.moveTo(x, y + 2); tx.quadraticCurveTo(x + rand(-2, 2), y - h * 0.5, x + rand(-3, 3), y - h); tx.stroke();
    }
    for (let i = 0; i < 40; i++) { // flowers
      const x = rand(FORT.front + 20, W);
      tx.fillStyle = pick(['#fff6a8', '#ffb3d1', '#ffffff', '#c3a6ff']);
      tx.beginPath(); tx.arc(x, sy(x) - rand(4, 8), 1.6, 0, TAU); tx.fill();
    }
  }

  function carve(cx, cy, r) {
    if (r <= 0) return;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r)), r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy, row = y * W;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2 && mask[row + x] === 1) mask[row + x] = 0;
      }
    }
    tx.save();
    tx.setTransform(TS, 0, 0, TS, 0, 0);
    tx.globalCompositeOperation = 'destination-out';
    tx.beginPath(); tx.arc(cx, cy, r, 0, TAU); tx.fill();
    tx.globalCompositeOperation = 'source-atop'; // scorched rim only on remaining dirt
    tx.strokeStyle = 'rgba(38,20,10,.9)'; tx.lineWidth = 4;
    tx.beginPath(); tx.arc(cx, cy, r + 1.5, 0, TAU); tx.stroke();
    tx.strokeStyle = 'rgba(20,10,4,.35)'; tx.lineWidth = 7;
    tx.beginPath(); tx.arc(cx, cy, r + 5, 0, TAU); tx.stroke();
    tx.restore();
  }

  const solid = (x, y) => {
    x |= 0; y |= 0;
    if (y < 0) return false;
    if (y >= H) return true;
    if (x < 0) x = 0; else if (x >= W) x = W - 1;
    return mask[y * W + x] !== 0;
  };

  // outward surface normal from the solid pixels around (x, y)
  function normal(x, y, r = 5) {
    let nx = 0, ny = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r && solid(x + dx, y + dy)) { nx -= dx; ny -= dy; }
    }
    const l = Math.hypot(nx, ny);
    return l ? { x: nx / l, y: ny / l } : { x: 0, y: -1 };
  }

  // standing height at column x: climbs out if inside dirt, drops if in the air
  function rest(x, y0) {
    let y = Math.round(y0);
    if (solid(x, y)) { while (y > 0 && solid(x, y)) y--; return y; }
    while (y < H && !solid(x, y + 1)) y++;
    return y;
  }

  return { mask, canvas: cv, surf, generate, carve, solid, normal, rest };
})();

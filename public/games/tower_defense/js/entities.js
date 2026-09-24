'use strict';
// The grub legion, the shared explosion, particles and floating text.

const ENEMY = {
  grub:   { name: 'Grub',     hp: 40,  speed: 30, reward: 4,   bite: 6,  color: '#9bd35a', dark: '#40701c', scale: 1.2,  mass: 1 },
  zippy:  { name: 'Zippy',    hp: 24,  speed: 64, reward: 5,   bite: 4,  color: '#ffb347', dark: '#9a560c', scale: 1.05, mass: 0.8, hat: 'band', leaper: true },
  helmet: { name: 'Tin Grub', hp: 115, speed: 20, reward: 10,  bite: 12, color: '#b388eb', dark: '#553584', scale: 1.4,  mass: 2,   hat: 'helmet' },
  para:   { name: 'Dropper',  hp: 36,  speed: 32, reward: 6,   bite: 6,  color: '#6fd3c9', dark: '#23736a', scale: 1.2,  mass: 1 },
  flyer:  { name: 'Buzzer',   hp: 30,  speed: 46, reward: 8,   bite: 8,  color: '#ff7b7b', dark: '#8f2b2b', scale: 1.15, mass: 0.9, hat: 'prop', flies: true },
  boss:   { name: 'Big Mama', hp: 700, speed: 13, reward: 120, bite: 40, color: '#8e5bd6', dark: '#3f2068', scale: 2.7,  mass: 6,   hat: 'crown' },
};
const hpScale = w => 1 + 0.16 * (w - 1);
S.combo = { n: 0, t: 0 };

function spawnEnemy(type, hpMul = 1) {
  const d = ENEMY[type];
  const e = {
    type, d, hp: d.hp * hpMul, max: d.hp * hpMul, s: d.scale, x: W + 14, y: 0, vx: 0, vy: 0, dir: -1,
    grounded: false, t: rand(TAU), frozen: 0, slow: 0, burn: 0, flash: 0, pend: 0, pendT: 0,
    jumpCd: 0, stuck: 0, chute: false, alt: 0, dead: false, splits: 0,
  };
  e.h = 26 * e.s; e.rad = 10 * e.s;
  if (d.flies) { e.alt = rand(140, 280); e.y = e.alt; e.x = W + 20; }
  else if (type === 'para') { e.x = rand(FORT.front + 90, W - 80); e.y = -30; e.chute = true; } // drops behind your moats
  else { e.y = Terrain.rest(e.x, 300); e.grounded = true; }
  e.fallFrom = e.y;
  S.enemies.push(e);
  return e;
}

function updateEnemies(dt) {
  if (S.combo.t > 0 && (S.combo.t -= dt) <= 0) {
    const n = S.combo.n;
    if (n >= 2) {
      shout(n === 2 ? 'Double kill!' : n === 3 ? 'Triple kill!' : n < 6 ? 'Multi kill!' : 'Wormageddon!');
      S.coins += n * 3;
    }
    S.combo.n = 0;
  }
  for (const e of S.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt);
    e.jumpCd -= dt;
    if (e.burn > 0) {
      e.burn -= dt;
      hurt(e, 9 * dt, 'fire');
      if (Math.random() < dt * 16) flame(e.x + rand(-4, 4), e.y - e.h * rand(0.3, 0.9), e.s);
    }
    if (e.pend > 0 && (e.pendT += dt) > 0.15) {
      if (e.pend >= 1) floatText(e.x, e.y - e.h - 16 * e.s, '-' + Math.round(e.pend), '#ffffff', 15);
      e.pend = 0; e.pendT = 0;
    }
    if (e.dead) continue;
    const sp = e.d.speed * (e.frozen > 0 ? 0 : e.slow > 0 ? 0.45 : 1);
    if (e.frozen > 0) e.frozen -= dt; else if (e.slow > 0) e.slow -= dt;
    if (sp) e.t += dt * 9;
    if (e.d.flies) flyerStep(e, dt, sp);
    else if (e.chute) chuteStep(e, dt);
    else if (e.grounded) walkStep(e, dt, sp);
    else airStep(e, dt);
    if (e.dead) continue;
    if (e.y > WATER_Y + 4 && e.type !== 'boss') drown(e); // Big Mama wades out of moats
    else if (e.x < FORT.front) biteFort(e);
  }
  S.enemies = S.enemies.filter(e => !e.dead);
}

function walkStep(e, dt, sp) {
  if (!sp) return;
  const nx = e.x + e.dir * sp * dt, climb = 8 * e.s;
  let y = e.y;
  if (Terrain.solid(nx, y)) {
    let k = 1;
    while (k <= climb && Terrain.solid(nx, y - k)) k++;
    if (k > climb) return blocked(e, nx, dt);
    y -= k;
  } else {
    let k = 0;
    while (k <= 6 && !Terrain.solid(nx, y + k + 1)) k++;
    if (k > 6) { // walked off a ledge; zippies leap gaps on purpose
      if (e.d.leaper && e.jumpCd <= 0) { e.vx = e.dir * 150; e.vy = -250; e.jumpCd = 1.2; }
      else { e.vx = e.dir * sp; e.vy = 0; }
      e.grounded = false; e.x = nx; e.fallFrom = e.y;
      return;
    }
    y += k;
  }
  if (Terrain.solid(nx, y - e.h)) return blocked(e, nx, dt); // overhang
  e.x = nx; e.y = y; e.stuck = 0;
}

// Wall ahead: hop it if short, otherwise chew straight through (worms burrow).
function blocked(e, nx, dt) {
  e.stuck += dt;
  let h = 0;
  while (h < 100 && Terrain.solid(nx, e.y - h)) h++;
  if (h < 70 * e.s && e.jumpCd <= 0) {
    e.vy = -Math.sqrt(2 * G * (h + 12)); e.vx = e.dir * 55;
    e.grounded = false; e.jumpCd = 1.4; e.fallFrom = e.y;
    return;
  }
  if (e.x < FORT.front + 80 && e.stuck > 3) return biteFort(e); // stuck at the bedrock: gnaw the fort
  if (e.stuck > 1) {
    e.stuck = 0.6;
    const cx = e.x + e.dir * 9 * e.s, cy = e.y - e.h * 0.55;
    Terrain.carve(cx, cy, e.h * 0.62);
    for (let i = 0; i < 6; i++) part({ kind: 'debris', x: cx, y: cy, vx: rand(-60, 60) - e.dir * 60, vy: rand(-160, -60), g: G, life: 0.7, max: 0.7, size: rand(1.5, 3), color: pick(['#7a4a2a', '#5e3620', '#9a6238']), vr: rand(-8, 8) });
  }
}

function airStep(e, dt) {
  e.vy += G * dt;
  e.vx *= 1 - 0.4 * dt;
  let nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
  if (Terrain.solid(nx, ny - e.h * 0.5)) { e.vx *= -0.25; nx = e.x; }
  if (e.vy < 0 && Terrain.solid(nx, ny - e.h)) { e.vy = 0; ny = e.y; }
  if (e.vy >= 0 && Terrain.solid(nx, ny)) {
    e.x = nx; e.y = Terrain.rest(nx, ny); e.grounded = true;
    const fall = e.y - e.fallFrom;
    if (fall > 70) hurt(e, (fall - 70) * 0.35, 'fall');
    e.vx = e.vy = 0; e.stuck = 0;
    for (let i = 0; i < 4; i++) part({ kind: 'smoke', x: e.x + rand(-6, 6), y: e.y, vx: rand(-30, 30), vy: rand(-20, -5), life: 0.5, max: 0.5, size: 3, grow: 10, color: '#8a6a4f' });
    return;
  }
  e.x = nx; e.y = ny;
  if (e.vy < 0) e.fallFrom = Math.min(e.fallFrom, e.y);
}

function chuteStep(e, dt) {
  e.x = clamp(e.x + (Math.sin(S.t * 1.7 + e.t) * 18 + S.wind * 25) * dt, FORT.front + 40, W - 12);
  e.y += 55 * dt;
  if (Terrain.solid(e.x, e.y + 1)) { e.chute = false; e.grounded = true; e.y = Terrain.rest(e.x, e.y); e.fallFrom = e.y; }
}

function flyerStep(e, dt, sp) {
  e.vx *= 1 - 2.5 * dt;
  if (e.frozen > 0) { e.vy += G * 0.8 * dt; e.y += e.vy * dt; } // iced buzzers drop like stones
  else {
    e.vy *= 1 - 2.5 * dt;
    if (Terrain.solid(e.x - 40, e.alt + 12)) e.alt -= 70 * dt; // climb over hills
    e.y += e.vy * dt + (e.alt + Math.sin(S.t * 2 + e.t) * 12 - e.y) * 1.8 * dt;
  }
  e.x += (-sp + e.vx) * dt;
  if (Terrain.solid(e.x, e.y)) {
    boomFx(e.x, e.y - 8, 16, 'fire');
    floatText(e.x, e.y - 30, 'Crash!', '#ffb347', 16);
    killEnemy(e, 'crash');
  }
}

function hurt(e, amt, cause) {
  if (e.dead || amt <= 0) return false;
  if (e.frozen > 0) amt *= 1.25; // ice is brittle
  e.hp -= amt; e.pend += amt; e.flash = 0.1;
  if (e.type === 'boss' && e.splits < 2 && e.hp > 0 && e.hp < e.max * (e.splits ? 0.33 : 0.66)) {
    e.splits++;
    for (let i = 0; i < 3; i++) {
      const g = spawnEnemy('grub', hpScale(S.wave));
      g.x = e.x + rand(-20, 20); g.y = e.y - e.h; g.grounded = false; g.fallFrom = g.y - 200; // babies don't take fall damage
      g.vx = rand(-140, 80); g.vy = rand(-340, -200);
    }
    floatText(e.x, e.y - e.h - 30, 'Babies!', '#e7c6ff', 20);
  }
  if (e.hp <= 0) { killEnemy(e, cause); return true; }
  return false;
}

function killEnemy(e, cause) {
  if (e.dead) return;
  e.dead = true;
  S.kills++;
  S.combo.n++; S.combo.t = 0.6;
  const r = cause === 'drown' ? Math.ceil(e.d.reward * 1.5) : e.d.reward;
  S.coins += r;
  floatText(e.x, e.y - e.h - 10, '+' + r, '#ffd23f', 16);
  Sfx.squeak(); Sfx.coin();
  if (cause === 'drown') return;
  for (let i = 0; i < 10; i++) part({ kind: 'dot', x: e.x, y: e.y - e.h * 0.5, vx: rand(-120, 120), vy: rand(-220, -40), g: G, life: rand(0.4, 0.8), max: 0.8, size: rand(1.5, 3.2), color: e.d.color });
  part({ kind: 'smoke', x: e.x, y: e.y - e.h * 0.5, vy: -20, life: 0.7, max: 0.7, size: 6 * e.s, grow: 30, color: '#e8e0d6' });
  if (e.type === 'boss') {
    boomFx(e.x, e.y - e.h * 0.5, 80, 'fire'); Sfx.boom(2.5);
    shout('Big Mama is down!', '#e7c6ff');
    S.shake = 1.2;
  }
  S.graves.push({ x: e.x, y: e.y, vy: 0, life: 5, s: Math.min(e.s, 1.6) });
}

function drown(e) {
  splash(e.x, e.s);
  floatText(e.x, WATER_Y - 34, 'Splash!', '#8fd8ff', 18);
  Sfx.splash();
  killEnemy(e, 'drown');
}

function biteFort(e) {
  if (e.dead) return;
  e.dead = true;
  S.fortHp = Math.max(0, S.fortHp - e.d.bite);
  S.fortFlash = 0.35; S.shake = Math.min(1.2, S.shake + 0.4);
  floatText(FORT.x + FORT.w / 2, FORT.top - 34, '-' + e.d.bite, '#ff5c5c', 24);
  boomFx(FORT.front - 12, e.y - e.h * 0.5, 14 * e.s, 'fire');
  Sfx.thud();
}

// ---------- explosions ----------
function explode(x, y, r, dmg, o = {}) {
  const carve = o.carve ?? r * 0.85;
  const nearDirt = Terrain.solid(x, y) || Terrain.solid(x, y + r * 0.7);
  if (carve > 0) Terrain.carve(x, y, carve);
  const kb = o.kb ?? 1;
  for (const e of S.enemies) {
    if (e.dead) continue;
    const cx = e.x, cy = e.y - e.h * 0.5, d = Math.hypot(cx - x, cy - y), reach = r + e.rad;
    if (d >= reach) continue;
    const f = 1 - d / reach;
    if (dmg) hurt(e, dmg * (0.4 + 0.6 * f), o.cause);
    if (o.freeze) { e.frozen = o.freeze; e.slow = o.freeze + 2.5; e.burn = 0; }
    if (e.dead) continue;
    const k = (kb * (180 + r * 5) * f) / e.d.mass;
    if (k < 25) continue;
    const nx = d ? (cx - x) / d : 0, ny = d ? (cy - y) / d : -1;
    if (e.d.flies) { e.vx += nx * k; e.vy += ny * k; continue; }
    if (e.grounded) e.fallFrom = e.y;
    e.vx += nx * k; e.vy += ny * k - k * 0.45;
    e.grounded = false; e.chute = false; e.y -= 1;
  }
  for (const s of S.shots) { // knock loose mines, sheep and resting grenades around
    if (s.dead || s === o.self || !s.loose) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d > r * 1.4) continue;
    const f = 1 - d / (r * 1.4), k = 420 * f * kb;
    s.vx += ((s.x - x) / (d || 1)) * k; s.vy += ((s.y - y) / (d || 1)) * k - 120 * f;
    s.rest = false; s.air = true;
  }
  boomFx(x, y, r, o.fx || 'fire');
  if (carve > 0 && nearDirt) {
    for (let i = 0; i < Math.min(24, r / 2); i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), v = rand(160, 420);
      part({ kind: 'debris', x: x + rand(-r, r) * 0.5, y: y + rand(-r, r) * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: G, life: rand(0.8, 1.5), max: 1.5, size: rand(2, 5), color: pick(['#7a4a2a', '#5e3620', '#9a6238', '#3b2216']), vr: rand(-10, 10) });
    }
  }
  if (!o.quiet) Sfx.boom(r / 40);
  S.shake = Math.min(1.4, S.shake + r / 110);
}

function boomFx(x, y, r, fx) {
  if (fx === 'ice') {
    part({ kind: 'flash', x, y, size: r * 1.3, life: 0.18, max: 0.18, color: '#bfeaff', add: true });
    part({ kind: 'ring', x, y, size: r * 0.2, grow: r * 5, life: 0.35, max: 0.35, color: '#d8f3ff', w: 4 });
    for (let i = 0; i < 40; i++) {
      const a = rand(TAU), v = rand(40, 260);
      part({ kind: 'flake', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.5, g: 40, life: rand(0.6, 1.3), max: 1.3, size: rand(2, 4.5), color: pick(['#ffffff', '#bfeaff', '#8fd8ff']), vr: rand(-6, 6) });
    }
    return;
  }
  part({ kind: 'flash', x, y, size: r * 1.8, life: 0.14, max: 0.14, color: fx === 'holy' ? '#ffffff' : '#fff1c1', add: true });
  part({ kind: 'ring', x, y, size: r * 0.3, grow: r * 6, life: 0.24, max: 0.24, color: '#fff5d6', w: 5 });
  const n = Math.min(30, 8 + r / 3);
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), v = rand(r * 1.2, r * 3.6);
    part({ kind: 'fire', x: x + rand(-r, r) * 0.3, y: y + rand(-r, r) * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, drag: 5, life: rand(0.25, 0.55), max: 0.55, size: rand(r * 0.18, r * 0.42), grow: -r * 0.3, add: true });
  }
  for (let i = 0; i < n * 0.6; i++) {
    part({ kind: 'smoke', x: x + rand(-r, r) * 0.5, y: y + rand(-r, r) * 0.4, vx: rand(-25, 25) + S.wind * 30, vy: rand(-45, -15), life: rand(0.9, 1.8), max: 1.8, size: rand(r * 0.2, r * 0.4), grow: r * 0.35, color: pick(['#3b332d', '#51463d', '#6a5c50']) });
  }
  for (let i = 0; i < n * 0.5; i++) {
    const a = rand(TAU), v = rand(250, 620);
    part({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3, g: 300, life: rand(0.2, 0.45), max: 0.45, color: '#ffd27a', add: true });
  }
}

// ---------- particles & text ----------
function part(o) {
  if (S.parts.length > 1200) return;
  o.vx ??= 0; o.vy ??= 0; o.g ??= 0; o.drag ??= 0; o.grow ??= 0; o.rot ??= 0; o.vr ??= 0; o.size ??= 3; o.max ??= o.life;
  S.parts.push(o);
}
function flame(x, y, s = 1) {
  part({ kind: 'fire', x, y, vx: rand(-12, 12) + S.wind * 20, vy: rand(-70, -30), life: rand(0.25, 0.5), max: 0.5, size: rand(3, 6) * s, grow: -6 * s, add: true });
}
function splash(x, big = 1) {
  for (let i = 0; i < 14 * big; i++) part({ kind: 'dot', x: x + rand(-6, 6) * big, y: WATER_Y, vx: rand(-90, 90), vy: rand(-320, -120), g: G, life: rand(0.5, 0.9), max: 0.9, size: rand(1.5, 3.5), color: pick(['#bfe8ff', '#7fc8f0', '#ffffff']) });
  part({ kind: 'ring', x, y: WATER_Y, size: 4, grow: 60, life: 0.5, max: 0.5, color: '#d6f1ff', w: 2, flat: true });
}
function floatText(x, y, str, color = '#fff', size = 16) {
  S.texts.push({ x: clamp(x, 30, W - 30), y, str, color, size, life: 1.1, max: 1.1, vy: -38 });
}
function shout(str, color = '#ffd23f') {
  S.texts.push({ x: W / 2, y: 170, str, color, size: 46, life: 1.8, max: 1.8, vy: -8, shout: true });
}

function updateParts(dt) {
  for (const p of S.parts) {
    p.life -= dt;
    p.vy += p.g * dt;
    if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.size = Math.max(0.1, p.size + p.grow * dt);
    p.rot += p.vr * dt;
    if (p.kind === 'debris' && p.vy > 0 && Terrain.solid(p.x, p.y)) { p.vy *= -0.3; p.vx *= 0.6; p.y -= 1; }
  }
  S.parts = S.parts.filter(p => p.life > 0);
  for (const t of S.texts) { t.life -= dt; t.y += t.vy * dt; }
  S.texts = S.texts.filter(t => t.life > 0);
  for (const g of S.graves) {
    g.life -= dt;
    if (Terrain.solid(g.x, g.y + 1)) continue;
    g.vy += G * dt;
    const ny = g.y + g.vy * dt;
    if (Terrain.solid(g.x, ny)) { g.y = Terrain.rest(g.x, ny); g.vy = 0; } else g.y = ny;
    if (g.y > WATER_Y + 10) g.life = 0;
  }
  S.graves = S.graves.filter(g => g.life > 0);
}

function drawParts(c, additive) {
  c.globalCompositeOperation = additive ? 'lighter' : 'source-over';
  for (const p of S.parts) {
    if (!p.add !== !additive) continue;
    const a = clamp(p.life / p.max, 0, 1);
    switch (p.kind) {
      case 'fire':
        c.globalAlpha = Math.min(1, a * 1.6);
        c.fillStyle = a > 0.6 ? '#fff0a8' : a > 0.35 ? '#ffac3b' : '#e2491f';
        c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.fill();
        break;
      case 'flash': {
        c.globalAlpha = a;
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(255,200,120,0)');
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.fill();
        break;
      }
      case 'spark':
      case 'tracer':
        c.globalAlpha = a; c.strokeStyle = p.color; c.lineWidth = p.kind === 'tracer' ? 1.6 : 1.8;
        c.beginPath();
        if (p.kind === 'tracer') { c.moveTo(p.x, p.y); c.lineTo(p.x2, p.y2); } else { c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); }
        c.stroke();
        break;
      case 'smoke':
        c.globalAlpha = a * 0.55; c.fillStyle = p.color;
        c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.fill();
        break;
      case 'ring':
        c.globalAlpha = a; c.strokeStyle = p.color; c.lineWidth = (p.w || 3) * a + 0.5;
        c.beginPath();
        if (p.flat) c.ellipse(p.x, p.y, p.size, p.size * 0.25, 0, 0, TAU); else c.arc(p.x, p.y, p.size, 0, TAU);
        c.stroke();
        break;
      case 'debris':
        c.globalAlpha = Math.min(1, a * 2); c.fillStyle = p.color;
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); c.restore();
        break;
      case 'flake':
        c.globalAlpha = a; c.strokeStyle = p.color; c.lineWidth = 1;
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.beginPath();
        for (let i = 0; i < 3; i++) { c.rotate(Math.PI / 3); c.moveTo(-p.size, 0); c.lineTo(p.size, 0); }
        c.stroke(); c.restore();
        break;
      default: // dot
        c.globalAlpha = Math.min(1, a * 2); c.fillStyle = p.color;
        c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.fill();
    }
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

function drawTexts(c) {
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  for (const t of S.texts) {
    const age = t.max - t.life, sc = t.shout ? 1 + Math.max(0, 0.5 - age * 3.5) : 1;
    c.globalAlpha = clamp(t.life / 0.35, 0, 1);
    const size = fontPx(t.size);
    c.font = `${Math.round(size * sc)}px "Luckiest Guy", Impact, sans-serif`;
    c.lineWidth = Math.max(3, size * 0.2); c.strokeStyle = '#1b0f07';
    c.strokeText(t.str, t.x, t.y);
    c.fillStyle = t.color; c.fillText(t.str, t.x, t.y);
  }
  c.globalAlpha = 1;
}

// ---------- drawing worms ----------
// (x, y) is where the tail touches the ground; drawn facing right, mirrored by dir.
function drawWorm(c, x, y, dir, o) {
  const s = o.scale || 1, st = Math.sin(o.phase || 0) * 1.6;
  c.save();
  c.translate(x, y); c.scale(dir * s, s);
  const hx = 3 + st * 0.4, hy = -19 - st, col = o.flash ? '#ffffff' : o.color;
  c.lineCap = 'round';
  c.beginPath(); c.moveTo(-11 + st * 0.8, -4); c.bezierCurveTo(-4, -4, hx, -6, hx, hy);
  c.strokeStyle = o.dark; c.lineWidth = 13.5; c.stroke();
  c.strokeStyle = col; c.lineWidth = 10.5; c.stroke();
  c.beginPath(); c.moveTo(-7, -3.2); c.bezierCurveTo(-1, -3, hx + 3, -6, hx + 3.2, hy + 2);
  c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 3; c.stroke();

  if (o.hat === 'band') {
    const f = Math.sin((o.phase || 0) * 2) * 1.5;
    c.strokeStyle = '#e8413c'; c.lineWidth = 2.4; c.beginPath();
    c.moveTo(hx - 5.5, hy - 5); c.lineTo(hx + 5.5, hy - 6.5);
    c.moveTo(hx - 5, hy - 5); c.quadraticCurveTo(hx - 10, hy - 7 + f, hx - 14, hy - 3 + f * 2);
    c.stroke();
  }
  const lx = (o.look ? o.look.x : 1) * dir, ly = o.look ? o.look.y : 0;
  for (const [ex, ey] of [[hx - 1.5, hy - 4.5], [hx + 3.6, hy - 4]]) {
    c.fillStyle = '#fff'; c.strokeStyle = o.dark; c.lineWidth = 1;
    c.beginPath(); c.ellipse(ex, ey, 3.2, 3.8, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#111'; c.beginPath(); c.arc(ex + lx * 1.3, ey + ly * 1.5 + 0.3, 1.6, 0, TAU); c.fill();
  }
  c.strokeStyle = o.dark; c.lineWidth = 1.6; c.beginPath();
  if (o.angry) {
    c.moveTo(hx - 4.5, hy - 10); c.lineTo(hx + 0.5, hy - 8);
    c.moveTo(hx + 2, hy - 8); c.lineTo(hx + 7, hy - 9.8);
    c.moveTo(hx + 5.5, hy + 3); c.arc(hx + 3.5, hy + 4.2, 2, Math.PI * 1.85, Math.PI * 1.15, true);
  } else {
    c.arc(hx + 3, hy + 1.2, 2.2, 0.15 * Math.PI, 0.85 * Math.PI);
  }
  c.stroke();

  if (o.hat === 'helmet' || o.hat === 'army') {
    c.fillStyle = o.hat === 'army' ? '#5d7f3a' : '#9aa3ad';
    c.strokeStyle = o.hat === 'army' ? '#33491d' : '#4f565e'; c.lineWidth = 1;
    c.beginPath(); c.arc(hx + 0.5, hy - 6, 7, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
    c.fillRect(hx - 8, hy - 6.8, 17, 2.4);
  } else if (o.hat === 'crown') {
    c.fillStyle = '#ffd23f'; c.strokeStyle = '#8a6a06'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(hx - 6, hy - 9);
    [[-6, -17], [-3, -12], [0.5, -19], [4, -12], [7, -17], [7, -9]].forEach(([px, py]) => c.lineTo(hx + px, hy + py));
    c.closePath(); c.fill(); c.stroke();
  } else if (o.hat === 'prop') {
    const bw = 10 * Math.abs(Math.sin(S.t * 28));
    c.fillStyle = '#3aa0ff'; c.beginPath(); c.arc(hx, hy - 8, 4.5, Math.PI, 0); c.fill();
    c.strokeStyle = '#333'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(hx, hy - 12); c.lineTo(hx, hy - 15);
    c.moveTo(hx - bw, hy - 15.5); c.lineTo(hx + bw, hy - 15.5); c.stroke();
  }
  if (o.frozen) {
    c.fillStyle = 'rgba(175,225,255,.45)'; c.strokeStyle = 'rgba(235,250,255,.9)'; c.lineWidth = 1.2;
    c.beginPath(); c.roundRect(-16, -33, 30, 35, 4); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.moveTo(-12, -28); c.lineTo(-7, -23); c.moveTo(-12, -22); c.lineTo(-9, -19); c.stroke();
  }
  c.restore();
}

function drawEnemies(c) {
  for (const e of S.enemies) {
    if (e.dead) continue;
    if (e.chute) drawChute(c, e);
    const tilt = e.d.flies ? -0.18 + (e.frozen > 0 ? 0.7 : 0) : e.grounded ? 0 : clamp(e.vx * 0.002, -0.5, 0.5);
    c.save(); c.translate(e.x, e.y); c.rotate(tilt);
    drawWorm(c, 0, 0, e.dir, { color: e.d.color, dark: e.d.dark, scale: e.s, phase: e.t, angry: true, hat: e.d.hat, frozen: e.frozen > 0, flash: e.flash > 0, look: { x: -1, y: 0.2 } });
    c.restore();
    if (e.hp < e.max && e.type !== 'boss') {
      const w = 24, f = clamp(e.hp / e.max, 0, 1), bx = e.x - w / 2, by = e.y - e.h - 12 * e.s - 6;
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(bx - 1, by - 1, w + 2, 5);
      c.fillStyle = f > 0.5 ? '#8fe05a' : f > 0.25 ? '#ffd23f' : '#ff5c5c'; c.fillRect(bx, by, w * f, 3);
    }
  }
}

function drawChute(c, e) {
  c.save(); c.translate(e.x, e.y - 30); c.rotate(Math.sin(S.t * 1.7 + e.t) * 0.15);
  c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 0.8; c.beginPath();
  c.moveTo(-17, -22); c.lineTo(0, 4); c.moveTo(17, -22); c.lineTo(0, 4); c.moveTo(0, -30); c.lineTo(0, 4); c.stroke();
  c.beginPath(); c.moveTo(-20, -22); c.quadraticCurveTo(0, -56, 20, -22); c.quadraticCurveTo(0, -29, -20, -22);
  c.fillStyle = '#ff5b5b'; c.fill();
  c.save(); c.clip(); c.fillStyle = '#fff4e6'; c.fillRect(-5, -56, 10, 36); c.restore();
  c.restore();
}

function drawGraves(c) {
  for (const g of S.graves) {
    c.globalAlpha = clamp(g.life, 0, 1);
    c.save(); c.translate(g.x, g.y); c.scale(g.s, g.s);
    c.fillStyle = '#b9b4ad'; c.strokeStyle = '#4d4741'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-5, 0); c.lineTo(-5, -9); c.arc(0, -9, 5, Math.PI, 0); c.lineTo(5, 0); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#6e675f'; c.beginPath(); c.moveTo(0, -12); c.lineTo(0, -4); c.moveTo(-2.5, -9.5); c.lineTo(2.5, -9.5); c.stroke();
    c.restore();
  }
  c.globalAlpha = 1;
}

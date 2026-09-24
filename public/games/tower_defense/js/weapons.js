'use strict';
// Ammunition, projectiles, napalm fires, airstrikes and the auto-turrets.

const POWER_MIN = 180, POWER_MAX = 1000;

const WEAPONS = [
  { id: 'bazooka', name: 'Bazooka', desc: 'Rocket that rides the wind. Bursts on contact.', cd: 0.55, infinite: true },
  { id: 'grenade', name: 'Grenade', desc: 'Bounces around, blows after 2 seconds. Ignores wind.', cd: 0.9, infinite: true },
  { id: 'cluster', name: 'Cluster Bomb', desc: 'Bursts into six bomblets on impact.', cd: 0.9, price: 30, pack: 2 },
  { id: 'homing', name: 'Homing Missile', desc: 'Locks onto the worm nearest your aim. Buzzers hate it.', cd: 0.9, price: 35, pack: 2 },
  { id: 'napalm', name: 'Napalm', desc: 'Rains fire that burns on the ground for six seconds.', cd: 1, price: 35, pack: 2 },
  { id: 'freeze', name: 'Frost Bomb', desc: 'Freezes worms solid. Frozen worms take 25% more damage.', cd: 1, price: 30, pack: 2 },
  { id: 'mine', name: 'Land Mine', desc: 'Lies in the dirt until a worm crawls past.', cd: 0.5, price: 25, pack: 3 },
  { id: 'sheep', name: 'Boom Sheep', desc: 'Lands, trots at the legion and explodes on contact.', cd: 1, price: 40, pack: 1 },
  { id: 'airstrike', name: 'Airstrike', desc: 'Click or tap a spot. Five bombs fall from the sky.', cd: 2, price: 50, pack: 1, target: true },
  { id: 'holy', name: 'Holy Grenade', desc: 'Divine intervention. Enormous blast after 3 seconds.', cd: 2, price: 150, pack: 1 },
];
const WEAPON = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
const START_AMMO = { cluster: 2, homing: 2, napalm: 1, freeze: 1, mine: 3, sheep: 1, airstrike: 1, holy: 0 };
const hasAmmo = id => WEAPON[id].infinite || (S.ammo[id] | 0) > 0;

const TOWERS = {
  sentry: { name: 'Sentry Worm', price: 70, range: 230, rate: 0.16, dmg: 4, desc: 'Uzi behind sandbags. Shreds anything it can see.' },
  mortar: { name: 'Mortar Worm', price: 110, range: 640, rate: 2.6, dmg: 28, desc: 'Lobs shells over hills. Digs holes as it goes.' },
};
const MAX_TOWERS = 6;

const aimAngle = () => Math.atan2(S.aim.y - GUN.y, S.aim.x - GUN.x);

function addShot(kind, x, y, vx, vy, extra) {
  const s = Object.assign({ kind, x, y, px: x, py: y, vx, vy, t: 0, dead: false, rest: false, wind: 0 }, extra);
  S.shots.push(s);
  return s;
}

function fireWeapon(power) {
  const w = WEAPON[S.weapon];
  if (S.cooldown > 0 || !hasAmmo(w.id)) return false;
  const a = aimAngle(), v = POWER_MIN + (POWER_MAX - POWER_MIN) * power;
  const x = GUN.x + Math.cos(a) * 20, y = GUN.y + Math.sin(a) * 20, vx = Math.cos(a) * v, vy = Math.sin(a) * v;
  switch (w.id) {
    case 'bazooka': addShot('rocket', x, y, vx, vy, { wind: 1 }); Sfx.launch(); break;
    case 'homing': addShot('homing', x, y, vx, vy, { ax: S.aim.x, ay: S.aim.y }); Sfx.launch(); break;
    case 'grenade': addShot('grenade', x, y, vx, vy, { fuse: 2, loose: true }); Sfx.toss(); break;
    case 'holy': addShot('holy', x, y, vx, vy, { fuse: 3, loose: true }); Sfx.toss(); break;
    case 'mine': addShot('mine', x, y, vx, vy, { arm: 0.8, trig: 0, loose: true }); Sfx.toss(); break;
    case 'sheep': addShot('sheep', x, y, vx, vy, { life: 9, loose: true }); Sfx.baa(); break;
    case 'airstrike': S.strikes.push({ x: clamp(S.aim.x, 60, W - 60), t: 0, n: 0, px: -80 }); Sfx.horn(); break;
    default: addShot(w.id, x, y, vx, vy); Sfx.toss(); // cluster, napalm, freeze
  }
  if (!w.infinite) S.ammo[w.id]--;
  S.cooldown = w.cd;
  if (!w.target) {
    for (let i = 0; i < 5; i++) part({ kind: 'smoke', x, y, vx: Math.cos(a) * rand(20, 60) + rand(-15, 15), vy: Math.sin(a) * rand(20, 60) - 10, life: 0.5, max: 0.5, size: 3, grow: 14, color: '#d8d0c4' });
  }
  return true;
}

// Dots for the first half second of flight, so charging feels readable.
function previewPath(power) {
  const w = WEAPON[S.weapon];
  if (w.target) return [];
  const a = aimAngle(), v = POWER_MIN + (POWER_MAX - POWER_MIN) * power;
  let x = GUN.x + Math.cos(a) * 20, y = GUN.y + Math.sin(a) * 20, vx = Math.cos(a) * v, vy = Math.sin(a) * v;
  const pts = [], dt = 1 / 60;
  for (let i = 1; i <= 34; i++) {
    vy += G * dt;
    if (w.id === 'bazooka') vx += S.wind * WIND_ACC * dt;
    x += vx * dt; y += vy * dt;
    if (Terrain.solid(x, y)) break;
    if (i % 3 === 0) pts.push([x, y]);
  }
  return pts;
}

// ---------- projectile physics ----------
function fly(s, dt) {
  s.vy += G * dt;
  if (s.wind) s.vx += S.wind * WIND_ACC * dt;
  s.px = s.x; s.py = s.y;
  s.x += s.vx * dt; s.y += s.vy * dt;
}
function touching(s, pad = 3) {
  for (const e of S.enemies) if (!e.dead && Math.hypot(e.x - s.x, e.y - e.h * 0.5 - s.y) < e.rad + pad) return e;
  return null;
}
function nearestEnemy(x, y) {
  let best = null, bd = Infinity;
  for (const e of S.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - x, e.y - e.h * 0.5 - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
// Bouncy things reflect off the dirt and settle when slow.
function bounceStep(s, dt, e = 0.3, f = 0.55) {
  if (s.rest) {
    if (Terrain.solid(s.x, s.y + 4)) return;
    s.rest = false;
  }
  fly(s, dt);
  if (!Terrain.solid(s.x, s.y)) return;
  const n = Terrain.normal(s.x, s.y), vn = s.vx * n.x + s.vy * n.y;
  s.x = s.px; s.y = s.py;
  if (vn < 0) { // keep f of the sliding speed, bounce back e of the impact speed
    s.vx = (s.vx - vn * n.x) * f - e * vn * n.x;
    s.vy = (s.vy - vn * n.y) * f - e * vn * n.y;
    if (vn < -70) Sfx.bounce();
  }
  if (Math.hypot(s.vx, s.vy) < 45 && n.y < -0.5) { s.vx = s.vy = 0; s.rest = true; }
}

function updateShots(dt) {
  for (const s of S.shots) {
    if (s.dead) continue;
    s.t += dt;
    const k = s.kind;
    if (k === 'homing') homingStep(s, dt);
    else if (k === 'grenade' || k === 'holy') {
      bounceStep(s, dt);
      const hit = s.rest ? null : touching(s, 4);
      if (hit && s.hit !== hit) { s.hit = hit; s.vx *= -0.25; s.vy *= 0.3; Sfx.bounce(); } // bonk off the worm
      s.fuse -= dt;
      if (k === 'holy' && s.fuse < 1.1 && !s.sang) { s.sang = true; Sfx.holy(); }
      if (s.fuse <= 0) detonate(s);
    } else if (k === 'mine') mineStep(s, dt);
    else if (k === 'sheep') sheepStep(s, dt);
    else {
      fly(s, dt);
      if (Terrain.solid(s.x, s.y) || touching(s)) impact(s);
    }
    if (s.dead) continue;
    if (s.y > WATER_Y) sink(s);
    else if (s.x < -80 || s.x > W + 80) s.dead = true;
    else if ((k === 'rocket' || k === 'homing' || k === 'bomb') && Math.random() < 0.45) {
      part({ kind: 'smoke', x: s.x, y: s.y, vx: rand(-10, 10), vy: rand(-18, -4), life: rand(0.4, 0.8), max: 0.8, size: 2.5, grow: 9, color: '#d9d2c7' });
    } else if ((k === 'drop' || k === 'napalm') && Math.random() < 0.5) flame(s.x, s.y, 0.7);
  }
  S.shots = S.shots.filter(s => !s.dead);
}

function impact(s) {
  s.dead = true;
  switch (s.kind) {
    case 'rocket': explode(s.x, s.y, 34, 42); break;
    case 'bomb': explode(s.x, s.y, 28, 36); break;
    case 'shell': explode(s.x, s.y, 26, TOWERS.mortar.dmg, { kb: 0.6 }); break;
    case 'bomblet': explode(s.x, s.y, 20, 22, { kb: 0.6 }); break;
    case 'homing': explode(s.x, s.y, 30, 55); break;
    case 'cluster':
      explode(s.x, s.y, 24, 24);
      for (let i = 0; i < 6; i++) addShot('bomblet', s.px, s.py - 4, rand(-210, 210), rand(-430, -220));
      break;
    case 'napalm':
      explode(s.x, s.y, 18, 10, { carve: 8, quiet: true });
      Sfx.fire();
      for (let i = 0; i < 16; i++) addShot('drop', s.px, s.py - 3, rand(-230, 230), rand(-380, -120), { wind: 0.6 });
      break;
    case 'drop': {
      const e = touching(s, 6);
      if (e) e.burn = Math.max(e.burn, 3);
      ignite(s.px, s.py);
      break;
    }
    case 'freeze':
      explode(s.x, s.y, 90, 8, { carve: 0, freeze: 3.5, kb: 0.15, fx: 'ice', quiet: true });
      Sfx.freeze();
      break;
  }
}

function detonate(s) {
  s.dead = true;
  if (s.kind === 'holy') {
    explode(s.x, s.y, 115, 170, { fx: 'holy', kb: 1.4, self: s });
    S.flash = 0.7; Sfx.boom(3);
    shout('Hallelujah!', '#fff6c2');
  } else explode(s.x, s.y, 40, 52, { self: s });
}

function sink(s) {
  s.dead = true;
  splash(s.x, 0.5); Sfx.splash();
  if (s.kind === 'sheep') floatText(s.x, WATER_Y - 30, 'Baa...', '#ffffff', 16);
}

function homingStep(s, dt) {
  if (s.t < 0.3) fly(s, dt);
  else {
    if (!s.target || s.target.dead) { s.target = s.locked ? nearestEnemy(s.x, s.y) : nearestEnemy(s.ax, s.ay); s.locked = true; }
    let ang = Math.atan2(s.vy, s.vx);
    const sp = Math.min(560, Math.hypot(s.vx, s.vy) + 900 * dt), tg = s.target;
    if (tg) {
      // aim above the worm while far away, so the final approach is a dive rather than a skim over the hills
      const tx = tg.x - s.x, ty = tg.y - tg.h * 0.5 - Math.min(160, Math.abs(tx) * 0.6) - s.y, near = Math.max(0, 1 - Math.hypot(tx, ty) / 160);
      // dirt ahead: pull up over the hill; otherwise turn at the target, harder when close so it can't orbit
      const blocked = Terrain.solid(s.x + Math.cos(ang) * 40, s.y + Math.sin(ang) * 40) && near < 0.6;
      let da = (blocked ? -Math.PI / 2 : Math.atan2(ty, tx)) - ang;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      const turn = (5 + 25 * near) * dt;
      ang += clamp(da, -turn, turn);
    }
    s.vx = Math.cos(ang) * sp; s.vy = Math.sin(ang) * sp;
    s.px = s.x; s.py = s.y;
    s.x += s.vx * dt; s.y += s.vy * dt;
  }
  if (Terrain.solid(s.x, s.y) || touching(s) || s.t > 6) impact(s);
}

function mineStep(s, dt) {
  bounceStep(s, dt, 0.15, 0.4);
  if (s.trig <= 0 && (!s.rest || (s.arm -= dt) > 0)) return; // arms only once it has settled
  if (s.trig > 0) {
    if ((s.trig -= dt) <= 0) { s.dead = true; explode(s.x, s.y, 36, 60, { self: s }); }
    return;
  }
  for (const e of S.enemies) {
    if (!e.dead && !e.d.flies && Math.hypot(e.x - s.x, e.y - e.h * 0.5 - s.y) < 26 + e.rad) { s.trig = 0.35; Sfx.click(); break; }
  }
}

function sheepStep(s, dt) {
  s.life -= dt;
  if (!s.walking) {
    bounceStep(s, dt, 0.25, 0.5);
    if (s.rest) { s.walking = true; s.air = false; s.rest = false; s.look = 0; Sfx.baa(); }
  } else if (s.air) {
    s.vy += G * dt;
    let nx = s.x + s.vx * dt;
    const ny = s.y + s.vy * dt;
    if (Terrain.solid(nx, ny - 8)) { s.vx = 0; nx = s.x; }
    if (s.vy > 0 && Terrain.solid(nx, ny)) { s.x = nx; s.y = Terrain.rest(nx, ny); s.air = false; }
    else { s.x = nx; s.y = ny; }
  } else {
    if ((s.look -= dt) <= 0) { // sniff out the nearest worm every second
      const e = nearestEnemy(s.x, s.y);
      s.dir = e && e.x < s.x ? -1 : 1; s.look = 1;
    }
    const nx = s.x + s.dir * 70 * dt;
    let k = 0;
    if (Terrain.solid(nx, s.y)) {
      k = 1;
      while (k <= 10 && Terrain.solid(nx, s.y - k)) k++;
      if (k > 10) { s.vx = s.dir * 90; s.vy = -330; s.air = true; } else { s.x = nx; s.y -= k; }
    } else {
      while (k <= 6 && !Terrain.solid(nx, s.y + k + 1)) k++;
      if (k > 6) { s.vx = s.dir * 70; s.vy = 0; s.air = true; s.x = nx; } else { s.x = nx; s.y += k; }
    }
    if (Math.random() < dt * 0.6) Sfx.baa();
  }
  s.y -= 7; const hit = touching(s, 12); s.y += 7; // measured from the fleece, not the hooves
  if (hit || s.life <= 0 || s.x > W - 8 || (s.walking && s.x < FORT.front)) { s.dead = true; explode(s.x, s.y - 8, 58, 85, { self: s }); }
}

// ---------- napalm fires ----------
function ignite(x, y) {
  y = Terrain.rest(x, y);
  if (y < WATER_Y) S.fires.push({ x, y, life: rand(5, 6.5), max: 6.5 });
}
function updateFires(dt) {
  for (const f of S.fires) {
    f.life -= dt;
    if (!Terrain.solid(f.x, f.y + 1)) f.y += 150 * dt;
    if (f.y > WATER_Y) { f.life = 0; continue; }
    if (Math.random() < dt * 16) flame(f.x + rand(-7, 7), f.y - rand(0, 4), 1.1);
    for (const e of S.enemies) {
      if (e.dead || Math.abs(e.x - f.x) > 9 + e.rad || Math.abs(e.y - e.h * 0.3 - f.y) > 10 + e.h * 0.4) continue;
      hurt(e, 16 * dt, 'fire');
      e.burn = Math.max(e.burn, 1.5);
      e.frozen = 0;
    }
  }
  S.fires = S.fires.filter(f => f.life > 0);
}

function updateStrikes(dt) {
  for (const k of S.strikes) {
    k.t += dt;
    k.px = -80 + k.t * 900;
    while (k.n < 5 && k.px >= k.x - 100 + k.n * 50) { addShot('bomb', k.px, 50, 40, 60, { wind: 1 }); k.n++; }
    if (k.px > W + 120) k.done = true;
  }
  S.strikes = S.strikes.filter(k => !k.done);
}

// ---------- turrets ----------
function towerSpot(x, y) {
  if (x < FORT.front + 30 || x > W - 40) return null;
  const gy = Terrain.rest(x, y);
  if (gy >= WATER_Y - 8 || gy < 60) return null;
  if (S.towers.some(t => Math.abs(t.x - x) < 30)) return null;
  return { x, y: gy };
}
function los(x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
  for (let i = 1; i < n; i++) if (Terrain.solid(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)) return false;
  return true;
}
function updateTowers(dt) {
  for (const t of S.towers) {
    if (!Terrain.solid(t.x, t.y + 1)) { // the ground went away: fall, maybe drown
      t.vy += G * dt;
      const ny = t.y + t.vy * dt;
      if (Terrain.solid(t.x, ny)) { t.y = Terrain.rest(t.x, ny); t.vy = 0; } else t.y = ny;
      if (t.y > WATER_Y) { t.dead = true; splash(t.x); Sfx.splash(); floatText(t.x, WATER_Y - 30, 'Glug!', '#8fd8ff', 18); }
      continue;
    }
    if ((t.cd -= dt) > 0) continue;
    const T = TOWERS[t.type], gx = t.x, gy = t.y - 20;
    let best = null, bd = Infinity;
    for (const e of S.enemies) {
      if (e.dead) continue;
      const ex = e.x, ey = e.y - e.h * 0.5, d = Math.hypot(ex - gx, ey - gy);
      if (d > T.range) continue;
      if (t.type === 'sentry') { if (d < bd && los(gx, gy, ex, ey)) { bd = d; best = e; } }
      else if (d > 90 && e.x < bd) { bd = e.x; best = e; } // mortar: whoever is closest to the fort
    }
    if (!best) { t.cd = 0.15; continue; }
    const ex = best.x, ey = best.y - best.h * 0.5;
    if (t.type === 'sentry') {
      t.cd = T.rate;
      t.ang = Math.atan2(ey - gy, ex - gx);
      const mx = gx + Math.cos(t.ang) * 15, my = gy + Math.sin(t.ang) * 15;
      hurt(best, T.dmg, 'bullet');
      part({ kind: 'tracer', x: mx, y: my, x2: ex + rand(-3, 3), y2: ey + rand(-3, 3), life: 0.06, max: 0.06, color: '#fff3b0', add: true });
      part({ kind: 'fire', x: mx, y: my, life: 0.05, max: 0.05, size: 3.5, add: true });
      part({ kind: 'spark', x: ex, y: ey, vx: rand(-120, 120), vy: rand(-160, -20), g: 300, life: 0.2, max: 0.2, color: '#ffe08a', add: true });
      Sfx.shot();
    } else {
      const th = 1.0, lead = best.frozen > 0 ? 0 : best.d.speed * (best.slow > 0 ? 0.45 : 1);
      const dx0 = ex - gx, tx = ex - lead * (Math.abs(dx0) / 420);
      const dx = tx - gx, dy = best.y - 4 - (gy - 6), adx = Math.abs(dx) || 1;
      const den = 2 * Math.cos(th) ** 2 * (adx * Math.tan(th) + dy);
      const v = den > 0 ? Math.sqrt((G * adx * adx) / den) : 0;
      if (!v || v > 1150) { t.cd = 0.3; continue; }
      const dir = Math.sign(dx) || 1;
      t.cd = T.rate;
      t.ang = Math.atan2(-Math.sin(th), dir * Math.cos(th));
      addShot('shell', gx, gy - 6, dir * Math.cos(th) * v, -Math.sin(th) * v);
      for (let i = 0; i < 4; i++) part({ kind: 'smoke', x: gx + dir * 10, y: gy - 14, vx: rand(-20, 20), vy: rand(-50, -20), life: 0.6, max: 0.6, size: 3, grow: 12, color: '#d8d0c4' });
      Sfx.toss();
    }
  }
  S.towers = S.towers.filter(t => !t.dead);
}

// ---------- sprites (shared by the battlefield, belt and armory) ----------
const SPR = {
  rocket(c) {
    c.fillStyle = '#6b7f3a'; c.beginPath(); c.roundRect(-8, -2.6, 14, 5.2, 2); c.fill();
    c.fillStyle = '#e0452b'; c.beginPath(); c.moveTo(6, -2.6); c.lineTo(10.5, 0); c.lineTo(6, 2.6); c.fill();
    c.fillStyle = '#3c4721'; c.beginPath(); c.moveTo(-8, -2.6); c.lineTo(-11, -5); c.lineTo(-5, -2.6); c.moveTo(-8, 2.6); c.lineTo(-11, 5); c.lineTo(-5, 2.6); c.fill();
  },
  homing(c) {
    c.fillStyle = '#d7dee2'; c.beginPath(); c.roundRect(-8, -2.6, 14, 5.2, 2); c.fill();
    c.fillStyle = '#3f8cff'; c.fillRect(-3, -2.6, 3, 5.2);
    c.fillStyle = '#ff4f6a'; c.beginPath(); c.moveTo(6, -2.6); c.lineTo(10.5, 0); c.lineTo(6, 2.6); c.fill();
    c.fillStyle = '#7b8a93'; c.beginPath(); c.moveTo(-8, -2.6); c.lineTo(-11, -5); c.lineTo(-5, -2.6); c.moveTo(-8, 2.6); c.lineTo(-11, 5); c.lineTo(-5, 2.6); c.fill();
  },
  grenade(c) {
    c.fillStyle = '#3f6b2a'; c.beginPath(); c.arc(0, 0, 5, 0, TAU); c.fill();
    c.fillStyle = '#9aa3ad'; c.fillRect(-1.5, -7.5, 3, 3);
    c.strokeStyle = '#c9ced4'; c.lineWidth = 1; c.beginPath(); c.arc(3, -7, 1.8, 0, TAU); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.arc(-1.6, -1.6, 1.8, 0, TAU); c.fill();
  },
  holy(c) {
    c.fillStyle = '#ffd23f'; c.strokeStyle = '#8a6a06'; c.lineWidth = 1;
    c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#fff6c2'; c.fillRect(-1, -12, 2, 7); c.fillRect(-3, -10, 6, 2);
    c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.arc(-2, -2, 2, 0, TAU); c.fill();
  },
  cluster(c) {
    c.fillStyle = '#b83b3b'; c.beginPath(); c.arc(0, 0, 5.5, 0, TAU); c.fill();
    c.fillStyle = '#5a1d1d'; c.fillRect(-5.5, -1, 11, 2);
    c.fillStyle = '#ffcf5a'; for (const [x, y] of [[-2.5, -3], [2.5, -3], [-2.5, 3], [2.5, 3]]) { c.beginPath(); c.arc(x, y, 0.9, 0, TAU); c.fill(); }
  },
  bomblet(c) { c.fillStyle = '#2d2d2d'; c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill(); c.fillStyle = '#ff6a3d'; c.fillRect(-0.7, -4.5, 1.4, 2); },
  napalm(c) {
    c.fillStyle = '#d9452b'; c.beginPath(); c.roundRect(-6, -3.5, 12, 7, 2.5); c.fill();
    c.fillStyle = '#ffcf3a'; c.fillRect(-1.5, -3.5, 3, 7);
  },
  drop(c) { c.fillStyle = '#ffb13b'; c.beginPath(); c.arc(0, 0, 2.6, 0, TAU); c.fill(); },
  freeze(c) {
    c.fillStyle = '#8fd8ff'; c.strokeStyle = '#2f7fb0'; c.lineWidth = 1;
    c.beginPath(); c.arc(0, 0, 5.5, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = '#ffffff'; c.beginPath();
    for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; c.moveTo(Math.cos(a) * 4, Math.sin(a) * 4); c.lineTo(-Math.cos(a) * 4, -Math.sin(a) * 4); }
    c.stroke();
  },
  mine(c, s) {
    c.fillStyle = '#6b737c'; c.beginPath(); c.arc(0, 0, 6, Math.PI, 0); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.arc(-2, -3, 2, 0, TAU); c.fill();
    c.fillStyle = '#ffcf3a'; c.fillRect(-7, -1.5, 14, 2.5);
    c.fillStyle = '#2b2b2b'; for (const x of [-4, 0, 4]) c.fillRect(x - 1, -1.5, 2, 2.5);
    const armed = s && s.arm <= 0, blink = s && (s.trig > 0 ? (S.t * 20) % 2 < 1 : (S.t * 2) % 2 < 1);
    c.fillStyle = armed && blink ? '#ff3b3b' : '#6b1f1f'; c.beginPath(); c.arc(0, -5, 1.6, 0, TAU); c.fill();
  },
  sheep(c, s) {
    const hop = s && s.walking && !s.air ? Math.abs(Math.sin(S.t * 14)) * 1.5 : 0;
    c.translate(0, -hop);
    c.strokeStyle = '#222'; c.lineWidth = 1.6; c.beginPath();
    c.moveTo(-4, 1); c.lineTo(-4, 5); c.moveTo(3, 1); c.lineTo(3, 5); c.stroke();
    c.fillStyle = '#f7f4ee';
    for (const [x, y, r] of [[-4, -2, 4], [0, -4, 4.5], [4, -2, 4], [0, 0, 4.5]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
    c.fillStyle = '#222'; c.beginPath(); c.ellipse(8, -3, 3.2, 2.6, 0.3, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(9, -3.8, 0.9, 0, TAU); c.fill();
  },
  bomb(c) {
    c.fillStyle = '#444b52'; c.beginPath(); c.ellipse(0, 0, 6, 3, 0, 0, TAU); c.fill();
    c.fillStyle = '#2b3035'; c.beginPath(); c.moveTo(-5, 0); c.lineTo(-9, -3.5); c.lineTo(-9, 3.5); c.fill();
  },
  shell(c) { c.fillStyle = '#56603f'; c.beginPath(); c.roundRect(-4.5, -2.2, 9, 4.4, 2); c.fill(); },
  plane(c) {
    c.fillStyle = '#8795a1'; c.beginPath(); c.ellipse(0, 0, 18, 4.5, 0, 0, TAU); c.fill();
    c.fillStyle = '#5c6873'; c.beginPath(); c.moveTo(-3, 0); c.lineTo(-10, 9); c.lineTo(-4, 9); c.lineTo(5, 0); c.fill();
    c.beginPath(); c.moveTo(-14, -1); c.lineTo(-19, -9); c.lineTo(-15, -9); c.lineTo(-9, -1); c.fill();
    c.fillStyle = '#bfe8ff'; c.beginPath(); c.ellipse(9, -1.6, 4, 2, 0, 0, TAU); c.fill();
  },
};
const ICON_SPRITE = { bazooka: 'rocket', airstrike: 'plane' };

function drawShots(c) {
  for (const s of S.shots) {
    const k = s.kind;
    c.save(); c.translate(s.x, s.y);
    if (k === 'sheep') { c.scale((s.walking ? s.dir : Math.sign(s.vx)) || 1, 1); c.translate(0, -5); }
    else if (k === 'mine') c.translate(0, -1);
    else if (k === 'grenade' || k === 'holy' || k === 'cluster') { if (!s.rest) c.rotate(s.t * 9 * Math.sign(s.vx || 1)); }
    else c.rotate(Math.atan2(s.vy, s.vx));
    SPR[k](c, s);
    c.restore();
    if (s.fuse !== undefined) {
      const fs = fontPx(13), ty = s.y - 7 - fs / 2;
      c.font = fs + 'px "Luckiest Guy", Impact, sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = '#1b0f07';
      c.strokeText(Math.ceil(s.fuse), s.x, ty); c.fillStyle = '#fff'; c.fillText(Math.ceil(s.fuse), s.x, ty);
    }
  }
  for (const k of S.strikes) { c.save(); c.translate(k.px, 44); SPR.plane(c); c.restore(); }
}

function drawFires(c) {
  c.globalCompositeOperation = 'lighter';
  for (const f of S.fires) {
    c.globalAlpha = clamp(f.life / 1.5, 0, 1) * 0.55;
    c.fillStyle = '#ff7a1a';
    c.beginPath(); c.ellipse(f.x, f.y, 9, 3.5, 0, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

function drawTower(c, t) {
  c.fillStyle = '#c9b27c'; c.strokeStyle = '#7d6a3e'; c.lineWidth = 1;
  for (const [bx, by] of [[-12, -3], [0, -3], [12, -3], [-6, -9], [6, -9]]) { c.beginPath(); c.ellipse(t.x + bx, t.y + by, 7, 4, 0, 0, TAU); c.fill(); c.stroke(); }
  const look = { x: Math.cos(t.ang), y: Math.sin(t.ang) }, dir = look.x < 0 ? -1 : 1;
  drawWorm(c, t.x - dir * 3, t.y - 9, dir, { color: '#ff8fb8', dark: '#a3406b', hat: 'army', look, phase: 0, scale: 1.2 });
  c.save(); c.translate(t.x + dir * 3, t.y - 22); c.rotate(t.ang);
  if (t.type === 'sentry') { c.fillStyle = '#2b2b2b'; c.fillRect(0, -2, 16, 4); c.fillRect(3, 2, 3, 5); c.fillStyle = '#555'; c.fillRect(0, -3, 7, 6); }
  else { c.fillStyle = '#4b5a33'; c.fillRect(-4, -4.5, 22, 9); c.fillStyle = '#2f3a1f'; c.fillRect(16, -5, 3, 10); }
  c.restore();
}
const drawTowers = c => S.towers.forEach(t => drawTower(c, t));

// icon for belt/armory: sprite scaled into a square canvas
function paintIcon(cv, id) {
  const c = cv.getContext('2d'), n = cv.width;
  c.clearRect(0, 0, n, n);
  c.save(); c.translate(n / 2, n / 2);
  if (id === 'sentry' || id === 'mortar') {
    c.scale(n / 50, n / 50);
    drawTower(c, { type: id, x: 2, y: 20, ang: id === 'sentry' ? -0.25 : -1 });
  } else if (id === 'repair') {
    c.scale(n / 30, n / 30);
    c.fillStyle = '#9b8f84'; c.strokeStyle = '#5a5048'; c.lineWidth = 1;
    for (const [x, y] of [[-10, 2], [0, 2], [-5, -5], [5, -5]]) { c.fillRect(x - 4.5, y - 3, 9.5, 6.5); c.strokeRect(x - 4.5, y - 3, 9.5, 6.5); }
    c.fillStyle = '#8fd14f'; c.fillRect(7, -1, 9, 3); c.fillRect(10, -4, 3, 9);
  } else {
    c.scale(n / 24, n / 24);
    const spr = ICON_SPRITE[id] || id;
    if (spr === 'rocket' || spr === 'homing') c.rotate(-0.6);
    if (spr === 'plane') c.scale(0.55, 0.55);
    if (spr === 'sheep') c.translate(-1, 1);
    SPR[spr](c, null);
  }
  c.restore();
}

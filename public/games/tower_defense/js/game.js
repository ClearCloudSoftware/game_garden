'use strict';
// Waves, economy, UI, input, rendering and the main loop.

const $ = id => document.getElementById(id);
const cv = $('game'), ctx = cv.getContext('2d');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const keys = new Set();
let best = 0;
try { best = +localStorage.getItem('wormhold-best') || 0; } catch (e) { /* storage blocked: no record */ }

// ---------- waves ----------
function waveList(n) {
  const list = [], add = (type, count) => { for (let i = 0; i < count; i++) list.push(type); };
  add('grub', 4 + n * 2);
  if (n >= 2) add('zippy', Math.floor(n * 1.2));
  if (n >= 3) add('helmet', Math.floor((n - 1) / 2));
  if (n >= 4) add('para', n - 2);
  if (n >= 5) add('flyer', Math.floor(n / 2));
  for (let i = list.length - 1; i > 0; i--) { const j = randi(0, i); [list[i], list[j]] = [list[j], list[i]]; }
  if (n % 5 === 0) add('boss', n / 5); // bosses close out every fifth wave
  return list;
}

function startGame(data = {}) {
  Sfx.init();
  Object.assign(S, {
    phase: 'prep', paused: false, t: 0, wave: data.wave || 0, coins: data.coins ?? 90, kills: data.kills || 0,
    fortHp: data.fortHp || 100, fortMax: data.fortMax || 100, walls: data.walls || 0,
    wind: rand(-0.3, 0.3), shake: 0, flash: 0, fortFlash: 0, armoryT: 0, queue: [],
    enemies: [], shots: [], parts: [], texts: [], fires: [], towers: [], graves: [], strikes: [],
    ammo: { ...START_AMMO, ...(data.ammo || {}) }, weapon: 'bazooka', cooldown: 0, charging: false, power: 0, placing: null,
    combo: { n: 0, t: 0 },
  });
  Terrain.generate();
  setTheme(S.wave + 1);
  $('title-screen').hidden = true; $('over-screen').hidden = true; $('armory').hidden = true; $('pause-screen').hidden = true;
  shout(S.wave ? `Wave ${S.wave + 1} is coming` : 'Dig in!');
  floatText(W / 2, 232, 'Dig, lay mines, then press Start wave', '#fff4e0', 20);
}

function startWave() {
  if (S.phase !== 'prep' || S.placing) return;
  $('armory').hidden = true;
  S.wave++;
  S.phase = 'wave';
  S.queue = waveList(S.wave);
  S.spawnT = 1.2;
  S.spawnGap = Math.max(0.45, 1.7 - S.wave * 0.09);
  S.wind = Math.round((S.wave === 1 ? rand(-0.3, 0.3) : rand(-1, 1)) * 10) / 10;
  setTheme(S.wave);
  S.texts = [];
  shout(`Wave ${S.wave}`);
  if (S.wave % 5 === 0) floatText(W / 2, 232, 'Big Mama is coming', '#e7c6ff', 22);
  Sfx.horn();
}

function waveCleared() {
  const bonus = 15 + S.wave * 5;
  S.coins += bonus;
  S.phase = 'prep';
  S.armoryT = 1.8;
  shout('Wave cleared!', '#9be35f');
  floatText(W / 2, 232, `+${bonus} bonus`, '#ffd23f', 24);
  Sfx.win();
  saveBest();
}

function gameOver() {
  S.phase = 'over';
  S.charging = false; S.placing = null;
  explode(FORT.x + FORT.w / 2, FORT.top + 30, 70, 0, { carve: 0 });
  Sfx.lose();
  saveBest();
  $('over-stats').innerHTML = `You held the hill until wave <b>${S.wave}</b> and flattened <b>${S.kills}</b> worms.<br>Best so far: wave <b>${best}</b>`;
  setTimeout(() => { $('over-screen').hidden = false; $('btn-again').focus(); }, 1200);
}

function saveBest() {
  best = Math.max(best, S.wave);
  try { localStorage.setItem('wormhold-best', best); } catch (e) { /* ignore */ }
}

// ---------- armory ----------
function openArmory() {
  if (S.phase !== 'prep' || S.placing) return;
  renderShop();
  $('armory').hidden = false;
  $('btn-start-2').focus();
}
function closeArmory() { $('armory').hidden = true; }

function renderShop() {
  $('armory-coins').textContent = S.coins;
  $('btn-start-2').textContent = `Start wave ${S.wave + 1} ▸`;
  const items = [
    ...WEAPONS.filter(w => !w.infinite).map(w => ({
      icon: w.id, name: w.name, desc: w.desc, price: w.price, have: `×${S.ammo[w.id] | 0}`, label: `Buy ×${w.pack}`,
      buy() { S.ammo[w.id] = (S.ammo[w.id] | 0) + w.pack; },
    })),
    ...Object.entries(TOWERS).map(([id, T]) => ({
      icon: id, name: T.name, desc: T.desc, price: T.price, have: `${S.towers.filter(t => t.type === id).length} built`,
      label: S.towers.length >= MAX_TOWERS ? `Max ${MAX_TOWERS} turrets` : 'Place on the hill', off: S.towers.length >= MAX_TOWERS,
      place: id,
    })),
    {
      icon: 'repair', name: 'Patch the Fort', desc: 'Mortar and elbow grease. Restores 25 health.', price: 30,
      have: `${Math.ceil(S.fortHp)}/${S.fortMax}`, label: 'Repair', off: S.fortHp >= S.fortMax,
      buy() { S.fortHp = Math.min(S.fortMax, S.fortHp + 25); },
    },
    {
      icon: 'repair', name: 'Thicker Walls', desc: 'Adds 20 max health to the fort and fills it.', price: 60 + 25 * S.walls,
      have: `${S.fortMax} max`, label: 'Reinforce',
      buy() { S.fortMax += 20; S.fortHp += 20; S.walls++; },
    },
  ];
  const grid = $('shop-grid');
  grid.innerHTML = '';
  items.forEach((it, i) => {
    const el = document.createElement('article');
    el.className = 'item';
    const icon = document.createElement('canvas');
    icon.width = icon.height = 88;
    paintIcon(icon, it.icon);
    el.innerHTML = `<h3>${it.name}<small>${it.have}</small></h3><p>${it.desc}</p>`;
    el.prepend(icon);
    const b = document.createElement('button');
    b.id = 'buy-' + i;
    b.className = 'btn primary';
    b.innerHTML = `${it.label}<span class="coin" aria-hidden="true"></span>${it.price}`;
    b.disabled = !!it.off || S.coins < it.price;
    b.onclick = () => {
      if (S.coins < it.price) return;
      if (it.place) { startPlacing(it.place); return; }
      S.coins -= it.price;
      it.buy();
      Sfx.coin();
      renderShop();
      $('buy-' + i)?.focus();
    };
    el.append(b);
    grid.append(el);
  });
}

function startPlacing(type) {
  closeArmory();
  S.placing = type;
  S.charging = false;
}
function tryPlace() {
  const T = TOWERS[S.placing], spot = towerSpot(S.aim.x, S.aim.y);
  if (!spot || S.coins < T.price) { Sfx.thud(); return; }
  S.coins -= T.price;
  S.towers.push({ type: S.placing, x: spot.x, y: spot.y, vy: 0, cd: 0.4, ang: -0.2 });
  floatText(spot.x, spot.y - 50, `${T.name} dug in`, '#ff8fb8', 16);
  for (let i = 0; i < 8; i++) part({ kind: 'smoke', x: spot.x + rand(-14, 14), y: spot.y, vx: rand(-40, 40), vy: rand(-30, -5), life: 0.6, max: 0.6, size: 3, grow: 12, color: '#b39a7c' });
  Sfx.bounce(); Sfx.coin();
  S.placing = null;
}

// ---------- input ----------
const canAct = () => (S.phase === 'wave' || S.phase === 'prep') && !S.paused && $('armory').hidden;
function selectWeapon(id) {
  if (S.weapon === id) return;
  S.weapon = id; S.charging = false;
  Sfx.click();
}
function cycle(d) {
  const i = WEAPONS.findIndex(w => w.id === S.weapon);
  selectWeapon(WEAPONS[(i + d + WEAPONS.length) % WEAPONS.length].id);
}
function beginCharge() {
  if (!canAct()) return;
  if (S.placing) return tryPlace();
  const w = WEAPON[S.weapon];
  if (!hasAmmo(w.id)) {
    if (!S.texts.some(t => t.str === 'Out of ammo')) floatText(GUN.x + 40, GUN.y - 40, 'Out of ammo', '#ff8a8a', 16);
    Sfx.thud();
    return;
  }
  if (S.cooldown > 0) return;
  if (w.target) fireWeapon(1);
  else { S.charging = true; S.power = 0; }
}
function releaseCharge() {
  if (!S.charging) return;
  S.charging = false;
  if (canAct()) fireWeapon(S.power);
}
function togglePause(force) {
  if (S.phase !== 'wave' && S.phase !== 'prep') return;
  S.paused = force ?? !S.paused;
  S.charging = false;
  $('pause-screen').hidden = !S.paused;
  if (S.paused) $('btn-resume').focus();
}
function toggleMute() {
  Sfx.init();
  const m = Sfx.toggle();
  $('btn-mute').textContent = m ? '✕' : '♪';
  $('btn-mute').setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
}
function toWorld(e) {
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

// Touch: finger down aims and charges, drag re-aims, lift fires. Turrets go down on lift so the ghost can be dragged into place.
// Extra fingers are ignored so a second touch can't break the charge.
const touchPlace = e => S.placing && e.pointerType === 'touch';
cv.addEventListener('pointerdown', e => {
  Sfx.init();
  if (e.button === 2) { S.placing = null; S.charging = false; return; }
  if (!e.isPrimary) return;
  Object.assign(S.aim, toWorld(e));
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
  if (!touchPlace(e)) beginCharge();
});
cv.addEventListener('pointermove', e => { if (e.isPrimary) Object.assign(S.aim, toWorld(e)); });
cv.addEventListener('pointerup', e => {
  if (e.button === 2 || !e.isPrimary) return;
  if (touchPlace(e)) beginCharge(); else releaseCharge();
});
cv.addEventListener('pointercancel', e => { if (e.isPrimary) S.charging = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { e.preventDefault(); cycle(Math.sign(e.deltaY)); }, { passive: false });

addEventListener('keydown', e => {
  const k = e.key, onButton = e.target instanceof HTMLButtonElement;
  if (k >= '0' && k <= '9') { const w = WEAPONS[k === '0' ? 9 : +k - 1]; if (w) selectWeapon(w.id); }
  else if (k === ' ' && !onButton) { e.preventDefault(); if (!e.repeat) { Sfx.init(); beginCharge(); } }
  else if (k.startsWith('Arrow')) { e.preventDefault(); keys.add(k); }
  else if (k === 'q' || k === 'Q') cycle(-1);
  else if (k === 'e' || k === 'E') cycle(1);
  else if (k === 'p' || k === 'P') togglePause();
  else if (k === 'm' || k === 'M') toggleMute();
  else if (k === 'b' || k === 'B') { if ($('armory').hidden) openArmory(); else closeArmory(); }
  else if (k === 'Enter' && !onButton && S.phase === 'prep' && $('armory').hidden) startWave();
  else if (k === 'Escape') {
    if (S.placing) S.placing = null;
    else if (!$('armory').hidden) closeArmory();
    else togglePause();
  }
});
addEventListener('keyup', e => {
  keys.delete(e.key);
  if (e.key === ' ') releaseCharge();
});
addEventListener('blur', () => { keys.clear(); S.charging = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });

$('btn-play').onclick = () => startGame();
$('btn-again').onclick = () => startGame();
$('btn-start').onclick = startWave;
$('btn-start-2').onclick = startWave;
$('btn-armory').onclick = openArmory;
$('btn-close-armory').onclick = closeArmory;
$('btn-pause').onclick = () => togglePause();
$('btn-resume').onclick = () => togglePause(false);
$('btn-mute').onclick = toggleMute;
$('btn-cancel').onclick = () => { S.placing = null; };

// ---------- belt & HUD ----------
function buildBelt() {
  const belt = $('belt');
  WEAPONS.forEach((w, i) => {
    const b = document.createElement('button');
    b.className = 'slot'; b.id = 'slot-' + w.id; b.tabIndex = -1; // number keys select; keep focus off the belt
    b.title = `${w.name} (${(i + 1) % 10})`;
    b.setAttribute('aria-label', w.name);
    const icon = document.createElement('canvas');
    icon.width = icon.height = 72;
    paintIcon(icon, w.id);
    b.innerHTML = `<span class="key">${(i + 1) % 10}</span><span class="count"></span><i class="cd"></i>`;
    b.prepend(icon);
    b.onmousedown = e => e.preventDefault();
    b.onclick = () => { Sfx.init(); selectWeapon(w.id); };
    belt.append(b);
  });
}

const shown = {};
function show(key, val, apply) { if (shown[key] !== val) { shown[key] = val; apply(val); } }
function syncHud() {
  const inWave = S.phase === 'wave';
  show('coins', S.coins, v => { $('coins').textContent = v; });
  show('wave', inWave ? `Wave ${S.wave}` : `Wave ${S.wave + 1}`, v => { $('wave-num').textContent = v; });
  const left = inWave ? S.queue.length + S.enemies.length : -1;
  show('sub', left, v => { $('wave-sub').textContent = v < 0 ? (S.phase === 'prep' ? 'Dig in' : '') : `${v} worm${v === 1 ? '' : 's'} left`; });
  show('fort', `${Math.ceil(S.fortHp)}/${S.fortMax}`, () => {
    $('fort-text').textContent = `${Math.ceil(S.fortHp)} / ${S.fortMax}`;
    $('fort-fill').style.width = (100 * S.fortHp) / S.fortMax + '%';
  });
  show('wind', S.wind, v => {
    $('wind-l').style.width = v < 0 ? -v * 50 + '%' : '0';
    $('wind-r').style.width = v > 0 ? v * 50 + '%' : '0';
  });
  show('prep', S.phase === 'prep' && !S.placing && $('armory').hidden, v => { $('prep-bar').hidden = !v; });
  show('place', !!S.placing, v => { $('place-bar').hidden = !v; });
  show('startLabel', S.wave, v => { $('btn-start').textContent = `Start wave ${v + 1} ▸`; });
  for (const w of WEAPONS) {
    const n = w.infinite ? '∞' : S.ammo[w.id] | 0;
    show('n-' + w.id, n, v => {
      const b = $('slot-' + w.id);
      b.querySelector('.count').textContent = v;
      b.classList.toggle('empty', v === 0);
    });
    show('on-' + w.id, S.weapon === w.id, v => $('slot-' + w.id).classList.toggle('on', v));
  }
  const cd = S.weapon && S.cooldown > 0 ? Math.round((S.cooldown / WEAPON[S.weapon].cd) * 100) : 0;
  show('cd', S.weapon + cd, () => {
    for (const w of WEAPONS) $('slot-' + w.id).querySelector('.cd').style.height = w.id === S.weapon ? cd + '%' : '0';
  });
  const w = WEAPON[S.weapon];
  show('info', S.weapon + hasAmmo(S.weapon) + S.placing, () => {
    $('weapon-info').innerHTML = S.placing
      ? `<b>Placing ${TOWERS[S.placing].name}</b> · click or tap the ground · right-click, Esc or Cancel to cancel`
      : `<b>${w.name}</b> · ${w.desc}${hasAmmo(w.id) ? '' : ' · <b>Out of ammo:</b> restock in the Armory between waves'}`;
  });
}

// ---------- scenery ----------
const THEMES = [
  { sky: ['#4fa6e6', '#9fd6f5', '#e6f5ff'], orb: '#fff5c4', orbXY: [1040, 120], far: '#9cc2d9', near: '#7fae9c', cloud: '#ffffff', stars: 0 },
  { sky: ['#2b2856', '#b4557a', '#ffb070'], orb: '#ffd28a', orbXY: [960, 330], far: '#7a4c6e', near: '#553a55', cloud: '#ffc9a8', stars: 40 },
  { sky: ['#060a1d', '#15234a', '#2c3e6c'], orb: '#f3f0d8', orbXY: [1060, 110], far: '#233257', near: '#172443', cloud: '#56668f', stars: 160 },
];
const bg = document.createElement('canvas');
bg.width = W * TS; bg.height = H * TS;
let themeIx = -1;
const clouds = Array.from({ length: 9 }, () => ({ x: rand(-100, W + 100), y: rand(40, 260), s: rand(0.6, 1.4) }));

function setTheme(wave) {
  const ix = Math.floor((Math.max(1, wave) - 1) / 3) % THEMES.length;
  if (ix === themeIx) return;
  themeIx = ix;
  const T = THEMES[ix], c = bg.getContext('2d');
  c.setTransform(TS, 0, 0, TS, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, H * 0.8);
  T.sky.forEach((col, i) => g.addColorStop(i / (T.sky.length - 1), col));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let i = 0; i < T.stars; i++) {
    c.fillStyle = `rgba(255,255,255,${rand(0.3, 0.9)})`;
    c.fillRect(rand(W), rand(H * 0.55), rand(0.8, 1.8), rand(0.8, 1.8));
  }
  const [ox, oy] = T.orbXY, glow = c.createRadialGradient(ox, oy, 0, ox, oy, 140);
  glow.addColorStop(0, T.orb); glow.addColorStop(0.25, T.orb + '66'); glow.addColorStop(1, T.orb + '00');
  c.fillStyle = glow; c.fillRect(ox - 140, oy - 140, 280, 280);
  c.fillStyle = T.orb; c.beginPath(); c.arc(ox, oy, 34, 0, TAU); c.fill();
  const ridge = (base, amp, freq, col, seed) => {
    c.fillStyle = col; c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) c.lineTo(x, base - Math.abs(Math.sin(x * freq + seed)) * amp - Math.sin(x * freq * 3.1 + seed) * amp * 0.25);
    c.lineTo(W, H); c.fill();
  };
  ridge(430, 170, 0.0042, T.far, rand(TAU));
  ridge(470, 90, 0.0075, T.near, rand(TAU));
}

function updateClouds(dt) {
  for (const cl of clouds) {
    cl.x += (6 + S.wind * 45) * cl.s * dt;
    if (cl.x > W + 140) cl.x = -140; else if (cl.x < -140) cl.x = W + 140;
  }
}
function drawClouds(c) {
  c.fillStyle = THEMES[themeIx].cloud;
  for (const cl of clouds) {
    c.globalAlpha = 0.35 + cl.s * 0.3;
    c.beginPath();
    for (const [dx, dy, r] of [[-34, 6, 20], [-10, -6, 28], [20, 0, 24], [44, 8, 16]]) c.arc(cl.x + dx * cl.s, cl.y + dy * cl.s, r * cl.s, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
}

// The fort: a stone tower on an indestructible foundation.
const fortCv = document.createElement('canvas');
fortCv.width = (FORT.front + 6) * TS; fortCv.height = H * TS;
function bricks(c, x, y, w, h, bw, bh, cols, mortar) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = mortar; c.fillRect(x, y, w, h);
  for (let r = 0, yy = y; yy < y + h; r++, yy += bh) {
    for (let xx = x - (r % 2 ? bw / 2 : 0); xx < x + w; xx += bw) { c.fillStyle = pick(cols); c.fillRect(xx + 1, yy + 1, bw - 2, bh - 2); }
  }
  c.restore();
}
function buildFort() {
  const c = fortCv.getContext('2d'), fy = PLATEAU_Y, tx = FORT.x, tw = FORT.w, ty = FORT.top;
  c.setTransform(TS, 0, 0, TS, 0, 0);
  bricks(c, 0, fy, FORT.front, H - fy, 26, 13, ['#6d6259', '#655a52', '#72675e'], '#463e38');
  const sh = c.createLinearGradient(0, fy, 0, H);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.45)');
  c.fillStyle = sh; c.fillRect(0, fy, FORT.front, H - fy);
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(FORT.front - 5, fy, 5, H - fy);
  c.fillStyle = '#3f8f2f'; c.fillRect(0, fy - 3, FORT.front, 5);
  c.fillStyle = '#6cc644'; c.fillRect(0, fy - 4, FORT.front, 2);
  bricks(c, tx, ty, tw, fy - ty, 20, 11, ['#9b9086', '#a39889', '#948980', '#8c8279'], '#5d544c');
  for (const mx of [tx - 4, tx + tw - 18]) bricks(c, mx, ty - 16, 22, 16, 11, 8, ['#a39889', '#9b9086'], '#5d544c');
  c.fillStyle = '#7d736a'; c.fillRect(tx - 6, ty - 2, tw + 12, 5);
  const side = c.createLinearGradient(tx, 0, tx + tw, 0);
  side.addColorStop(0, 'rgba(0,0,0,.28)'); side.addColorStop(0.35, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,.2)');
  c.fillStyle = side; c.fillRect(tx, ty, tw, fy - ty);
  c.fillStyle = '#2b1d14';
  c.beginPath(); c.moveTo(tx + tw / 2 - 14, fy); c.lineTo(tx + tw / 2 - 14, fy - 24); c.arc(tx + tw / 2, fy - 24, 14, Math.PI, 0); c.lineTo(tx + tw / 2 + 14, fy); c.fill();
  c.strokeStyle = '#4a3322'; c.lineWidth = 1.5;
  for (const dx of [-7, 0, 7]) { c.beginPath(); c.moveTo(tx + tw / 2 + dx, fy); c.lineTo(tx + tw / 2 + dx, fy - 34); c.stroke(); }
  c.fillStyle = '#1d140e';
  for (const [wx, wy] of [[tx + 22, ty + 30], [tx + tw - 26, ty + 30]]) { c.beginPath(); c.roundRect(wx, wy, 5, 18, 2.5); c.fill(); }
}

function drawFort(c) {
  c.drawImage(fortCv, 0, 0, FORT.front + 6, H);
  const tx = FORT.x, ty = FORT.top, hp = S.fortHp / S.fortMax;
  // flag
  const px = tx + 6, top = ty - 58;
  c.strokeStyle = '#3b2a1c'; c.lineWidth = 2; c.beginPath(); c.moveTo(px, ty - 16); c.lineTo(px, top); c.stroke();
  c.fillStyle = '#ff8fb8'; c.beginPath(); c.moveTo(px, top);
  for (let i = 0; i <= 6; i++) c.lineTo(px + i * 5, top + 2 + Math.sin(S.t * 6 - i * 0.8) * 2.5 + i * 0.6);
  for (let i = 6; i >= 0; i--) c.lineTo(px + i * 5, top + 14 + Math.sin(S.t * 6 - i * 0.8) * 2.5 - i * 0.6);
  c.fill();
  // cracks as it takes damage
  c.strokeStyle = 'rgba(30,22,16,.85)'; c.lineWidth = 1.6;
  const cracks = [[[tx + 70, ty + 8], [tx + 64, ty + 26], [tx + 72, ty + 38], [tx + 66, ty + 54]], [[tx + 18, ty + 60], [tx + 28, ty + 72], [tx + 22, ty + 88]], [[tx + 88, ty + 70], [tx + 80, ty + 84], [tx + 90, ty + 100]]];
  cracks.slice(0, hp < 0.3 ? 3 : hp < 0.6 ? 2 : hp < 0.85 ? 1 : 0).forEach(pts => {
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
  });
  if (hp < 0.35 && Math.random() < 0.1) part({ kind: 'smoke', x: tx + rand(10, FORT.w - 10), y: ty - 4, vx: S.wind * 20, vy: rand(-40, -20), life: 1.4, max: 1.4, size: 4, grow: 16, color: '#3b332d' });
  if (S.fortFlash > 0) {
    c.fillStyle = `rgba(255,60,60,${S.fortFlash})`;
    c.fillRect(tx, ty, FORT.w, PLATEAU_Y - ty);
  }
}

function drawPlayer(c) {
  const a = aimAngle(), dir = Math.cos(a) >= 0 ? 1 : -1;
  drawWorm(c, GUN.x - 8, FORT.top, dir, { color: '#ff8fb8', dark: '#a3406b', look: { x: Math.cos(a), y: Math.sin(a) }, phase: S.charging ? S.t * 40 : 0, scale: 1.2 });
  c.save(); c.translate(GUN.x, GUN.y); c.rotate(a);
  if (dir < 0) c.scale(1, -1);
  const w = S.weapon;
  if (w === 'bazooka' || w === 'homing') {
    c.fillStyle = '#4b5a33'; c.fillRect(-10, -3.5, 26, 7);
    c.fillStyle = '#2f3a1f'; c.fillRect(14, -4.5, 4, 9); c.fillRect(-2, 3, 3, 5);
  } else if (w === 'airstrike') {
    c.fillStyle = '#3d4a2c'; c.fillRect(2, -5, 9, 11);
    c.strokeStyle = '#222'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(9, -5); c.lineTo(13, -15); c.stroke();
  } else { c.translate(12, 0); SPR[w](c, null); }
  c.restore();
}

function drawWater(c) {
  for (let l = 0; l < 3; l++) {
    c.fillStyle = ['rgba(40,110,170,.55)', 'rgba(26,84,140,.75)', 'rgba(16,58,104,.92)'][l];
    c.beginPath(); c.moveTo(0, H);
    const y0 = WATER_Y + l * 9, amp = 3 + l;
    for (let x = 0; x <= W; x += 16) c.lineTo(x, y0 + Math.sin(x * 0.03 + S.t * (1.3 + l * 0.4) + l * 2) * amp);
    c.lineTo(W, H); c.fill();
  }
  c.strokeStyle = 'rgba(210,240,255,.45)'; c.lineWidth = 1.5; c.beginPath();
  for (let x = 0; x <= W; x += 16) c.lineTo(x, WATER_Y + Math.sin(x * 0.03 + S.t * 1.3) * 3);
  c.stroke();
}

function drawAim(c) {
  if (S.phase !== 'wave' && S.phase !== 'prep') return;
  const ax = S.aim.x, ay = S.aim.y;
  c.save();
  c.lineWidth = 1.5;
  if (S.placing) {
    const T = TOWERS[S.placing], spot = towerSpot(ax, ay);
    if (spot) {
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.setLineDash([8, 8]);
      c.beginPath(); c.arc(spot.x, spot.y - 20, T.range, 0, TAU); c.stroke(); c.setLineDash([]);
      c.globalAlpha = 0.75; drawTower(c, { type: S.placing, x: spot.x, y: spot.y, ang: -0.2 });
    } else {
      c.strokeStyle = '#ff5c5c'; c.lineWidth = 3; c.beginPath();
      c.moveTo(ax - 8, ay - 8); c.lineTo(ax + 8, ay + 8); c.moveTo(ax + 8, ay - 8); c.lineTo(ax - 8, ay + 8); c.stroke();
    }
    c.restore();
    return;
  }
  const w = WEAPON[S.weapon];
  if (w.target) {
    c.strokeStyle = 'rgba(255,110,110,.9)'; c.setLineDash([6, 6]);
    c.beginPath(); c.moveTo(ax, 40); c.lineTo(ax, ay); c.moveTo(ax - 100, ay); c.lineTo(ax + 100, ay); c.stroke();
    c.setLineDash([]);
  } else if (S.charging) {
    c.fillStyle = 'rgba(255,255,255,.85)';
    for (const [x, y] of previewPath(S.power)) { c.beginPath(); c.arc(x, y, 2.2, 0, TAU); c.fill(); }
    const L = 16 + 70 * S.power, g = c.createLinearGradient(14, 0, 14 + L, 0);
    g.addColorStop(0, '#ffe066'); g.addColorStop(1, S.power > 0.8 ? '#ff2d2d' : '#ff8a1f');
    c.save(); c.translate(GUN.x, GUN.y); c.rotate(aimAngle());
    c.fillStyle = g; c.beginPath(); c.moveTo(16, 0); c.lineTo(16 + L, -2 - 7 * S.power); c.lineTo(16 + L, 2 + 7 * S.power); c.closePath(); c.fill();
    c.restore();
  }
  c.strokeStyle = '#1b0f07'; c.lineWidth = 4;
  c.beginPath(); c.arc(ax, ay, 9, 0, TAU); c.stroke();
  c.strokeStyle = w.target ? '#ff6e6e' : '#ffffff'; c.lineWidth = 2;
  c.beginPath(); c.arc(ax, ay, 9, 0, TAU);
  c.moveTo(ax - 15, ay); c.lineTo(ax - 5, ay); c.moveTo(ax + 5, ay); c.lineTo(ax + 15, ay);
  c.moveTo(ax, ay - 15); c.lineTo(ax, ay - 5); c.moveTo(ax, ay + 5); c.lineTo(ax, ay + 15);
  c.stroke();
  c.restore();
}

function drawBossBar(c) {
  const b = S.enemies.find(e => e.type === 'boss' && !e.dead);
  if (!b) return;
  const w = 360, x = W / 2 - w / 2, y = 96;
  c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - 3, y - 3, w + 6, 16);
  c.fillStyle = '#b388eb'; c.fillRect(x, y, w * clamp(b.hp / b.max, 0, 1), 10);
  const fs = fontPx(18), ty = y - 3 - fs / 2;
  c.font = fs + 'px "Luckiest Guy", Impact, sans-serif'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = '#1b0f07';
  c.strokeText('Big Mama', W / 2, ty); c.fillStyle = '#e7c6ff'; c.fillText('Big Mama', W / 2, ty);
}

function drawOffscreen(c) {
  c.fillStyle = '#ffffff';
  for (const s of S.shots) {
    if (s.y > -6) continue;
    c.beginPath(); c.moveTo(s.x, 4); c.lineTo(s.x - 6, 14); c.lineTo(s.x + 6, 14); c.fill();
  }
}

function render() {
  const c = ctx;
  let sx = 0, sy = 0;
  if (S.shake > 0.01 && !reduceMotion) { const m = S.shake * S.shake * 14; sx = rand(-m, m); sy = rand(-m, m); }
  c.setTransform(view.k, 0, 0, view.k, sx * view.k, sy * view.k);
  c.drawImage(bg, -20, -20, W + 40, H + 40);
  drawClouds(c);
  c.drawImage(Terrain.canvas, 0, 0, W, H);
  drawFort(c);
  drawFires(c);
  drawGraves(c);
  drawTowers(c);
  drawEnemies(c);
  if (S.phase !== 'over') drawPlayer(c);
  drawShots(c);
  drawParts(c, false);
  drawParts(c, true);
  drawWater(c);
  drawAim(c);
  drawOffscreen(c);
  drawTexts(c);
  drawBossBar(c);
  if (S.flash > 0) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = `rgba(255,255,236,${Math.min(1, S.flash)})`;
    c.fillRect(0, 0, cv.width, cv.height);
  }
}

// ---------- loop ----------
function update(dt) {
  S.t += dt;
  S.cooldown = Math.max(0, S.cooldown - dt);
  if (S.charging) S.power = Math.min(1, S.power + dt / 1.1);
  if (keys.size) {
    const v = 520 * dt;
    if (keys.has('ArrowLeft')) S.aim.x -= v;
    if (keys.has('ArrowRight')) S.aim.x += v;
    if (keys.has('ArrowUp')) S.aim.y -= v;
    if (keys.has('ArrowDown')) S.aim.y += v;
    S.aim.x = clamp(S.aim.x, 0, W); S.aim.y = clamp(S.aim.y, 0, H);
  }
  if (S.phase === 'wave' && S.queue.length && (S.spawnT -= dt) <= 0) {
    spawnEnemy(S.queue.shift(), hpScale(S.wave));
    S.spawnT = S.spawnGap * rand(0.5, 1.5);
  }
  updateEnemies(dt);
  updateShots(dt);
  updateFires(dt);
  updateStrikes(dt);
  updateTowers(dt);
  S.shake = Math.max(0, S.shake - dt * 1.8);
  S.flash = Math.max(0, S.flash - dt * 1.4);
  S.fortFlash = Math.max(0, S.fortFlash - dt);
  if (S.phase === 'wave') {
    if (S.fortHp <= 0) gameOver();
    else if (!S.queue.length && !S.enemies.length) waveCleared();
  }
  if (S.armoryT > 0 && (S.armoryT -= dt) <= 0) openArmory();
}

let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!S.paused) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n++ < 10) { update(STEP); acc -= STEP; }
    if (n > 10) acc = 0;
    updateParts(dt);
    updateClouds(dt);
  }
  render();
  syncHud();
  requestAnimationFrame(frame);
}

// Fits the 16:9 battlefield into whatever the CSS layout leaves: belt below (default) or beside it (short
// landscape, #app is a grid), HUD over the canvas or as a strip above it (phone portrait, #hud is static).
function layout() {
  const app = $('app'), belt = $('belt'), cs = getComputedStyle(app), px = k => parseFloat(cs[k]) || 0;
  const side = cs.display === 'grid', hudH = getComputedStyle($('hud')).position === 'static' ? $('hud').offsetHeight : 0;
  const availW = app.clientWidth - px('paddingLeft') - px('paddingRight') - (side ? belt.offsetWidth + px('columnGap') : 0);
  belt.style.maxWidth = side ? '' : availW + 'px';
  const availH = app.clientHeight - px('paddingTop') - px('paddingBottom') - hudH
    - (side ? 0 : belt.offsetHeight + $('weapon-info').offsetHeight + 2 * px('rowGap'));
  const w = Math.max(240, Math.floor(Math.min(availW, (availH * 16) / 9))), h = Math.round((w * 9) / 16);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  if (!side) belt.style.maxWidth = w + 'px';
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  view.k = cv.width / W; view.css = w / W;
}

function boot(data) {
  buildBelt();
  buildFort();
  Terrain.generate();
  setTheme(1);
  layout();
  requestAnimationFrame(layout); // belt may wrap after the first pass
  addEventListener('resize', () => { layout(); requestAnimationFrame(layout); }); // rotation reflows the HUD and belt
  if (best) $('best-line').textContent = `Your best: wave ${best}`;
  if (data?.phase === 'prep' || data?.phase === 'wave') startGame(data); // resume after a live update
  else $('btn-play').focus();
  document.fonts?.load('20px "Luckiest Guy"').catch(() => {});
  requestAnimationFrame(frame);
}

window.claude?.hot?.snapshot?.(() => ({
  phase: S.phase, wave: S.phase === 'wave' ? S.wave - 1 : S.wave, coins: S.coins, kills: S.kills,
  fortHp: S.fortHp, fortMax: S.fortMax, walls: S.walls, ammo: S.ammo,
}));
if (window.claude?.hot?.ready) window.claude.hot.ready(boot);
else boot(window.claude?.hot?.data ?? {});

// Oveja Saltarina — la oveja rebota sola sobre los tablones; tú la mueves a izquierda y derecha.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const metersEl = $('meters');
const bestHudEl = $('bestHud');
const heartsEl = $('hearts');
const overlay = $('overlay');
const titleEl = $('title');
const messageEl = $('message');
const bestEl = $('best');
const playBtn = $('play');
const soundBtn = $('sound');

// ---------- Ajustes del juego (fáciles de cambiar) ----------
const GW = 400;          // ancho del mundo en unidades lógicas
const GRAVITY = 1500;    // gravedad
const JUMP = 830;        // fuerza del rebote (altura máx. ≈ 230)
const MOVE = 320;        // velocidad lateral
const PX_PER_M = 40;     // unidades por metro
const MAX_HEARTS = 3;

// ---------- Pantalla ----------
let W, H, dpr, scale, GH, offX;
function resize() {
  dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth || window.innerWidth;
  H = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  scale = Math.min(W / GW, H / 560);
  GH = H / scale;
  offX = (W - GW * scale) / 2;
}
window.addEventListener('resize', resize);
resize();

// ---------- Almacenamiento seguro ----------
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

// ---------- Sonido (Web Audio, sin archivos) ----------
let audio = null;
let soundOn = safeGet('sound') !== 'off';
function initAudio() {
  if (audio) return;
  try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; }
}
function tone(type, f1, f2, dur, vol = 0.15) {
  if (!audio || !soundOn) return;
  const t = audio.currentTime;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + dur);
}
const sfx = {
  boing: () => tone('sine', 280, 620, 0.14, 0.12),
  crack: () => tone('triangle', 180, 60, 0.18, 0.18),
  ouch: () => { tone('square', 420, 120, 0.25, 0.08); },
  fall: () => tone('sine', 600, 90, 0.7, 0.15),
  record: () => { tone('sine', 520, 780, 0.12, 0.1); setTimeout(() => tone('sine', 780, 1040, 0.15, 0.1), 120); },
};
function renderSoundBtn() {
  soundBtn.textContent = soundOn ? '🔊' : '🔇';
  soundBtn.setAttribute('aria-label', soundOn ? 'Silenciar sonido' : 'Activar sonido');
}
soundBtn.addEventListener('click', () => {
  initAudio();
  soundOn = !soundOn;
  safeSet('sound', soundOn ? 'on' : 'off');
  renderSoundBtn();
});
renderSoundBtn();

// ---------- Controles ----------
const keys = { left: false, right: false };
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
  if ((e.key === 'Enter' || e.key === ' ') && mode !== 'play') { e.preventDefault(); start(); }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
});
const pointers = new Map();
function pointerSide(e) { return e.clientX < W / 2 ? -1 : 1; }
canvas.addEventListener('pointerdown', (e) => { pointers.set(e.pointerId, pointerSide(e)); });
canvas.addEventListener('pointermove', (e) => { if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pointerSide(e)); });
['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => canvas.addEventListener(t, (e) => pointers.delete(e.pointerId)));
function inputDir() {
  let l = keys.left, r = keys.right;
  for (const s of pointers.values()) { if (s < 0) l = true; else r = true; }
  return (r ? 1 : 0) - (l ? 1 : 0);
}

// ---------- Estado ----------
let mode = 'menu'; // menu | play | over
let sheep, bars, foes, parts, camY, topY, maxY, hearts, inv, time, newRecordShown;
let best = Number(safeGet('best-m') || 0);

const clouds = Array.from({ length: 7 }, () => ({
  x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8, v: 4 + Math.random() * 8,
}));
const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4 }));

function meters() { return Math.max(0, Math.floor(-maxY / PX_PER_M)); }

function reset() {
  sheep = { x: GW / 2, y: 0, vx: 0, vy: 0, face: 1, squash: 0 };
  bars = [{ x: -2000, y: 0, w: GW + 4000, ground: true }];
  foes = [];
  parts = [];
  camY = -(GH - 90);
  topY = 0;
  maxY = 0;
  hearts = MAX_HEARTS;
  inv = 0;
  time = 0;
  newRecordShown = false;
  while (topY > camY - 200) genBar();
  updateHud();
}

function genBar() {
  const m = -topY / PX_PER_M;              // altura de este tablón en metros
  const d = Math.min(m / 400, 1);          // dificultad 0..1
  const gap = 55 + Math.random() * (45 + 75 * d);
  const y = topY - gap;
  const w = Math.max(55, 100 - 40 * d + Math.random() * 20);
  const x = Math.random() * (GW - w);
  const pMove = m > 25 ? 0.1 + 0.25 * d : 0;
  const pFrag = m > 50 ? 0.08 + 0.17 * d : 0;
  const r = Math.random();
  const type = r < pMove ? 'moving' : r < pMove + pFrag ? 'fragile' : 'normal';
  const bar = { x, y, w, type, vx: 0, broken: false, fallV: 0 };
  if (type === 'moving') bar.vx = (40 + 70 * d) * (Math.random() < 0.5 ? -1 : 1);
  bars.push(bar);

  // Obstáculos
  if (m > 15 && Math.random() < 0.06 + 0.16 * d) {
    foes.push({
      kind: 'bee', x: 20 + Math.random() * (GW - 40), baseY: y + gap / 2, y: y + gap / 2,
      vx: (50 + 70 * d) * (Math.random() < 0.5 ? -1 : 1), t: Math.random() * 6, r: 13,
    });
  }
  if (type === 'normal' && m > 30 && w > 70 && Math.random() < 0.08 + 0.14 * d) {
    foes.push({ kind: 'thorn', bar, off: Math.random() < 0.5 ? 14 : w - 14, x: 0, y: 0, r: 12 });
  }
  topY = y;
}

function updateHud() {
  metersEl.textContent = `${meters()} m`;
  bestHudEl.textContent = best ? `Récord ${best} m` : '';
  heartsEl.innerHTML = '';
  for (let i = 0; i < MAX_HEARTS; i++) {
    const s = document.createElement('span');
    s.textContent = '♥';
    if (i >= hearts) s.className = 'lost';
    heartsEl.appendChild(s);
  }
}

function puff(x, y, color, n = 6, spd = 120) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    parts.push({ x, y, vx: Math.cos(a) * spd * Math.random(), vy: Math.sin(a) * spd * Math.random() - 40, life: 0.6, max: 0.6, color, r: 3 + Math.random() * 4 });
  }
}

function start() {
  initAudio();
  if (audio && audio.state === 'suspended') audio.resume();
  reset();
  sheep.vy = -JUMP;
  sfx.boing();
  mode = 'play';
  overlay.classList.add('hidden');
}

function gameOver(reason) {
  mode = 'over';
  const m = meters();
  const isRecord = m > best;
  if (isRecord) { best = m; safeSet('best-m', best); }
  titleEl.textContent = reason === 'fall' ? '¡Uy, se cayó!' : '¡Ay, ay, ay!';
  messageEl.innerHTML = `Subiste <strong>${m} metros</strong>`;
  bestEl.textContent = isRecord && m > 0 ? '¡Nuevo récord!' : best ? `Récord: ${best} m` : '';
  playBtn.textContent = 'Jugar otra vez';
  overlay.classList.remove('hidden');
  updateHud();
}

function hurt() {
  hearts--;
  inv = 1.6;
  sheep.vy = Math.min(sheep.vy, -JUMP * 0.55);
  puff(sheep.x, sheep.y - 22, '#ffd84d', 10, 180);
  sfx.ouch();
  navigator.vibrate?.(120);
  updateHud();
  if (hearts <= 0) gameOver('hit');
}

// ---------- Actualización ----------
function update(dt) {
  time += dt;
  const playing = mode === 'play';
  const dir = playing ? inputDir() : 0;

  sheep.vx += (dir * MOVE - sheep.vx) * Math.min(1, dt * 10);
  if (dir) sheep.face = dir;
  sheep.x += sheep.vx * dt;
  if (sheep.x < -16) sheep.x = GW + 16;
  if (sheep.x > GW + 16) sheep.x = -16;

  const prevY = sheep.y;
  sheep.vy += GRAVITY * dt;
  sheep.y += sheep.vy * dt;
  sheep.squash = Math.max(0, sheep.squash - dt * 5);
  if (inv > 0) inv -= dt;

  for (const b of bars) {
    if (b.type === 'moving') {
      b.x += b.vx * dt;
      if (b.x < 0) { b.x = 0; b.vx *= -1; }
      if (b.x + b.w > GW) { b.x = GW - b.w; b.vx *= -1; }
    }
    if (b.broken) { b.fallV += GRAVITY * dt; b.y += b.fallV * dt; }
  }

  // Aterrizaje sobre tablones
  if (sheep.vy > 0) {
    for (const b of bars) {
      if (b.broken || (!playing && !b.ground)) continue;
      if (prevY <= b.y + 1 && sheep.y >= b.y && sheep.x + 14 > b.x && sheep.x - 14 < b.x + b.w) {
        sheep.y = b.y;
        sheep.vy = -JUMP;
        sheep.squash = 1;
        puff(sheep.x, b.y, 'rgba(255,255,255,0.9)', 5, 90);
        if (b.type === 'fragile') {
          b.broken = true;
          sfx.crack();
          puff(b.x + b.w / 2, b.y + 6, '#d9a066', 8, 150);
        } else sfx.boing();
        break;
      }
    }
  }

  // Obstáculos
  for (const f of foes) {
    if (f.kind === 'bee') {
      f.t += dt;
      f.x += f.vx * dt;
      if (f.x < 16) { f.x = 16; f.vx *= -1; }
      if (f.x > GW - 16) { f.x = GW - 16; f.vx *= -1; }
      f.y = f.baseY + Math.sin(f.t * 3) * 12;
    } else {
      f.x = f.bar.x + f.off;
      f.y = f.bar.y - 10;
    }
    if (playing && inv <= 0) {
      const dx = f.x - sheep.x, dy = f.y - (sheep.y - 20);
      if (dx * dx + dy * dy < (f.r + 14) ** 2) { hurt(); if (mode !== 'play') return; }
    }
  }

  // Partículas
  for (const p of parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; }
  parts = parts.filter((p) => p.life > 0);

  if (!playing) return;

  // Cámara: solo sube
  const target = sheep.y - GH * 0.42;
  if (target < camY) camY = target;
  if (sheep.y < maxY) {
    const before = meters();
    maxY = sheep.y;
    if (meters() !== before) {
      if (best && !newRecordShown && meters() > best) { newRecordShown = true; sfx.record(); }
      updateHud();
    }
  }

  // Generar y limpiar
  while (topY > camY - 200) genBar();
  const bottom = camY + GH + 250;
  bars = bars.filter((b) => b.y < bottom);
  foes = foes.filter((f) => (f.kind === 'thorn' ? bars.includes(f.bar) : f.y < bottom));

  if (sheep.y > camY + GH + 60) { sfx.fall(); gameOver('fall'); }
}

// ---------- Dibujo ----------
function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}

function drawSky() {
  const t = Math.min(Math.max((-camY - GH) / (PX_PER_M * 500), 0), 1); // de día a noche en ~500 m
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mix('#6cc6ff', '#1e1b4b', t));
  g.addColorStop(1, mix('#dff5ff', '#6d5bb5', t));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (t > 0.3) {
    ctx.fillStyle = `rgba(255,255,255,${(t - 0.3) * 1.2})`;
    for (const s of stars) {
      const y = ((s.y * H - camY * scale * 0.05) % H + H) % H;
      ctx.beginPath(); ctx.arc(s.x * W, y, s.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Sol / luna
  ctx.fillStyle = t < 0.6 ? 'rgba(255,226,120,0.95)' : 'rgba(250,245,220,0.95)';
  ctx.beginPath(); ctx.arc(W - 70, 110, 34, 0, Math.PI * 2); ctx.fill();

  // Nubes con paralaje
  for (const c of clouds) {
    c.x += (c.v / W) * (1 / 60);
    if (c.x > 1.2) c.x = -0.2;
    const span = H + 200;
    const y = ((c.y * span - camY * scale * 0.25) % span + span) % span - 100;
    drawCloud(c.x * W, y, c.s * Math.max(scale, 0.8), 1 - t * 0.5);
  }
}

function drawCloud(x, y, s, a) {
  ctx.fillStyle = `rgba(255,255,255,${0.85 * a})`;
  ctx.beginPath();
  ctx.arc(x, y, 22 * s, 0, Math.PI * 2);
  ctx.arc(x + 24 * s, y - 10 * s, 26 * s, 0, Math.PI * 2);
  ctx.arc(x + 52 * s, y, 20 * s, 0, Math.PI * 2);
  ctx.arc(x + 26 * s, y + 8 * s, 20 * s, 0, Math.PI * 2);
  ctx.fill();
}

function worldToScreenY(y) { return (y - camY) * scale; }

function drawGround() {
  const gy = worldToScreenY(0);
  if (gy > H + 50) return;
  // Colinas
  ctx.fillStyle = '#9ad97a';
  ctx.beginPath(); ctx.ellipse(W * 0.2, gy + 10, W * 0.45, 70 * scale, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#86cf6a';
  ctx.beginPath(); ctx.ellipse(W * 0.8, gy + 10, W * 0.5, 55 * scale, 0, Math.PI, 0); ctx.fill();
  // Pasto
  ctx.fillStyle = '#6cbf55';
  ctx.fillRect(0, gy, W, H - gy + 10);
  ctx.fillStyle = '#5aae45';
  ctx.fillRect(0, gy, W, 6 * scale);
  // Flores
  const flowers = ['#ff8fb1', '#ffd84d', '#ffffff', '#b28dff'];
  for (let i = 0; i < 14; i++) {
    const fx = ((i * 97) % 100) / 100 * W;
    const fy = gy + 20 * scale + ((i * 53) % 40) * scale;
    ctx.fillStyle = flowers[i % 4];
    ctx.beginPath(); ctx.arc(fx, fy, 4 * scale, 0, Math.PI * 2); ctx.fill();
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

function drawBar(b) {
  if (b.ground) return;
  const h = 14;
  const colors = {
    normal: ['#c98a4b', '#e3aa6a', '#8a5a2b'],
    moving: ['#5fb7e8', '#8fd3f7', '#2f7fae'],
    fragile: ['#e6c49a', '#f3dcbc', '#b38d5e'],
  }[b.type];
  ctx.save();
  if (b.broken) { ctx.globalAlpha = 0.7; ctx.translate(b.x + b.w / 2, b.y); ctx.rotate(0.15); ctx.translate(-(b.x + b.w / 2), -b.y); }
  // Postes
  ctx.fillStyle = colors[2];
  roundRect(b.x + 8, b.y + 4, 7, 16, 3); ctx.fill();
  roundRect(b.x + b.w - 15, b.y + 4, 7, 16, 3); ctx.fill();
  // Tablón
  ctx.fillStyle = colors[2];
  roundRect(b.x, b.y + 2, b.w, h, 6); ctx.fill();
  ctx.fillStyle = colors[0];
  roundRect(b.x, b.y, b.w, h - 2, 6); ctx.fill();
  ctx.fillStyle = colors[1];
  roundRect(b.x + 4, b.y + 2, b.w - 8, 3, 2); ctx.fill();
  // Clavos
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(b.x + 11, b.y + 7, 1.8, 0, Math.PI * 2); ctx.arc(b.x + b.w - 11, b.y + 7, 1.8, 0, Math.PI * 2); ctx.fill();
  if (b.type === 'moving') {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 11px Fredoka, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('◀  ▶', b.x + b.w / 2, b.y + 10);
  }
  if (b.type === 'fragile') {
    ctx.strokeStyle = colors[2];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const cx = b.x + b.w / 2;
    ctx.moveTo(cx - 6, b.y + 1); ctx.lineTo(cx, b.y + 6); ctx.lineTo(cx - 3, b.y + 11);
    ctx.moveTo(cx, b.y + 6); ctx.lineTo(cx + 8, b.y + 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSheep(s) {
  if (inv > 0 && Math.floor(inv * 12) % 2 === 0) return;
  ctx.save();
  ctx.translate(s.x, s.y);
  const sq = s.squash;
  ctx.scale(s.face * (1 + 0.18 * sq), 1 - 0.22 * sq);
  const air = s.vy < -200;

  // Patas
  ctx.fillStyle = '#3b3340';
  const legY = air ? -14 : -12;
  for (const lx of [-12, -5, 5, 12]) { roundRect(lx - 2.5, legY, 5, air ? 10 : 12, 2.5); ctx.fill(); }

  // Lana
  const puffs = [[-14, -24, 10], [-6, -32, 11], [6, -32, 11], [13, -25, 10], [0, -20, 12], [-9, -17, 9], [9, -17, 9], [0, -28, 12]];
  ctx.fillStyle = '#d9d3e3';
  for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.arc(x, y + 1.5, r + 1.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ffffff';
  for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  // Colita
  ctx.beginPath(); ctx.arc(-22, -26, 5, 0, Math.PI * 2); ctx.fill();

  // Cabeza
  ctx.fillStyle = '#3b3340';
  ctx.beginPath(); ctx.ellipse(19, -30, 9, 11, 0.15, 0, Math.PI * 2); ctx.fill();
  // Orejas
  ctx.beginPath(); ctx.ellipse(11, -36, 6, 3, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff9fb8';
  ctx.beginPath(); ctx.ellipse(11, -36, 3.5, 1.5, -0.6, 0, Math.PI * 2); ctx.fill();
  // Copete
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(16, -40, 4.5, 0, Math.PI * 2); ctx.arc(21, -41, 4, 0, Math.PI * 2); ctx.fill();
  // Ojo
  const blink = Math.sin(time * 1.3) > 0.985;
  ctx.fillStyle = '#ffffff';
  if (blink) { ctx.fillRect(19, -32, 6, 1.5); }
  else {
    ctx.beginPath(); ctx.arc(22, -31, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1420';
    ctx.beginPath(); ctx.arc(23, -31, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  // Mejilla
  ctx.fillStyle = 'rgba(255,143,177,0.8)';
  ctx.beginPath(); ctx.arc(22, -24, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBee(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.vx < 0 ? -1 : 1, 1);
  // Alas
  const flap = 0.5 + Math.abs(Math.sin(time * 28)) * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.ellipse(-3, -10, 6, 9 * flap, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(4, -10, 5, 8 * flap, 0.3, 0, Math.PI * 2); ctx.fill();
  // Cuerpo
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 10, 0, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#ffcf3a'; ctx.fillRect(-14, -11, 28, 22);
  ctx.fillStyle = '#2b2430';
  ctx.fillRect(-7, -11, 4, 22); ctx.fillRect(1, -11, 4, 22);
  ctx.restore();
  // Aguijón
  ctx.fillStyle = '#2b2430';
  ctx.beginPath(); ctx.moveTo(-13, -2); ctx.lineTo(-19, 0); ctx.lineTo(-13, 2); ctx.fill();
  // Ojo
  ctx.beginPath(); ctx.arc(8, -2, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawThorn(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  // Hojas espinosas
  ctx.fillStyle = '#4f9a4a';
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    const r = i % 2 === 0 ? 13 : 7;
    ctx.lineTo(Math.cos(a) * r, 10 + Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  // Flor del cardo
  ctx.fillStyle = '#3f7f3b';
  ctx.beginPath(); ctx.ellipse(0, -1, 6, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b15fd1';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(i * 2.2, -13 + Math.abs(i) * 0.8); ctx.stroke();
  }
  ctx.restore();
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSky();
  drawGround();

  // Mundo
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, -dpr * camY * scale);
  for (const b of bars) drawBar(b);
  for (const f of foes) (f.kind === 'bee' ? drawBee : drawThorn)(f);
  for (const p of parts) {
    ctx.globalAlpha = Math.max(p.life / p.max, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawSheep(sheep);

  // Bordes de la zona de juego en pantallas anchas
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (offX > 4) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, 0, offX, H);
    ctx.fillRect(W - offX, 0, offX, H);
  }
}

// ---------- Bucle ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  if (mode !== 'over') update(dt);
  draw();
  requestAnimationFrame(loop);
}

playBtn.addEventListener('click', start);
reset();
bestEl.textContent = best ? `Récord: ${best} m` : '';
requestAnimationFrame(loop);

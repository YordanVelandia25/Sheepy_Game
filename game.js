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

const clouds = Array.from({ length: 5 }, () => ({
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
  const bar = { x, y, w, type, vx: 0, broken: false, fallV: 0, seed: Math.random() };
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
  puff(sheep.x, sheep.y - 22, 'rgba(241,236,226,0.9)', 10, 180);
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
        puff(sheep.x, b.y, 'rgba(235,225,205,0.6)', 5, 90);
        if (b.type === 'fragile') {
          b.broken = true;
          sfx.crack();
          puff(b.x + b.w / 2, b.y + 6, '#9c8566', 8, 150);
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
// Paleta: amanecer de montaña, colores apagados y naturales.
const PAL = {
  skyTop: ['8fb3c9', '2a3550', '0f1424'],     // día → atardecer → noche
  skyBottom: ['ecdcc0', 'd59a7a', '2e3352'],
  mountains: ['6f8798', '566d7e', '3f5463'],  // lejos → cerca
  grass: '#6f8a4e', grassDark: '#55703a', grassLight: '#8aa463',
  wool: '#f1ece2', woolShade: '#c9bfae', skin: '#2b2726',
};

function hexRgb(h) { return h.match(/\w\w/g).map((x) => parseInt(x, 16)); }
function mix(a, b, t) {
  const pa = hexRgb(a), pb = hexRgb(b);
  return pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
}
function mix3(arr, t) { // t 0..1 sobre 3 colores
  return t < 0.5 ? mix(arr[0], arr[1], t * 2) : mix(arr[1], arr[2], (t - 0.5) * 2);
}
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// Crestas de montaña precalculadas (se repiten a lo ancho)
const ridges = [0, 1, 2].map((layer) => {
  const pts = [];
  let h = 0.5;
  for (let i = 0; i < 48; i++) {
    h += (Math.random() - 0.5) * (0.35 - layer * 0.08);
    h = Math.min(Math.max(h, 0.1), 1);
    pts.push(h);
  }
  return pts;
});

function skyT() { return Math.min(Math.max((-camY - GH) / (PX_PER_M * 500), 0), 1); }

function drawSky() {
  const t = skyT();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(mix3(PAL.skyTop, t)));
  g.addColorStop(1, rgb(mix3(PAL.skyBottom, t)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Estrellas al anochecer
  if (t > 0.45) {
    for (const s of stars) {
      const y = ((s.y * H - camY * scale * 0.05) % H + H) % H;
      ctx.fillStyle = `rgba(255,250,235,${Math.min((t - 0.45) * 1.6, 0.85) * (0.4 + s.r / 3)})`;
      ctx.fillRect(s.x * W, y, s.r * 0.9, s.r * 0.9);
    }
  }

  // Sol con halo suave
  const rise = -camY - (GH - 90);
  const sunY = H * 0.42 + rise * scale * 0.08;
  if (sunY < H + 80) {
    const sx = W * 0.72;
    const halo = ctx.createRadialGradient(sx, sunY, 0, sx, sunY, 160 * Math.max(scale, 0.8));
    halo.addColorStop(0, `rgba(255,236,200,${0.55 * (1 - t)})`);
    halo.addColorStop(1, 'rgba(255,236,200,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(255,243,220,${0.95 * (1 - t * 0.8)})`;
    ctx.beginPath(); ctx.arc(sx, sunY, 26 * Math.max(scale, 0.8), 0, Math.PI * 2); ctx.fill();
  }

  // Nubes alargadas y translúcidas
  for (const c of clouds) {
    c.x += (c.v / W) * (1 / 60);
    if (c.x > 1.3) c.x = -0.3;
    const span = H + 200;
    const y = ((c.y * span - camY * scale * 0.25) % span + span) % span - 100;
    drawCloud(c.x * W, y, c.s * Math.max(scale, 0.8), t);
  }

  drawMountains(rise, t);
}

function drawCloud(x, y, s, t) {
  const top = rgb(mix('fffaf2', '8a8fa8', t), 0.55);
  const bottom = rgb(mix('d9cdbd', '4a5070', t), 0.35);
  const g = ctx.createLinearGradient(0, y - 14 * s, 0, y + 10 * s);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.beginPath();
  for (const [cx, cy, rx, ry] of [[x, y, 60, 9], [x + 20 * s, y - 6 * s, 34, 10], [x - 22 * s, y - 3 * s, 26, 7]]) {
    ctx.moveTo(cx + rx * s, cy);
    ctx.ellipse(cx, cy, rx * s, ry * s, 0, 0, Math.PI * 2);
  }
  ctx.fill();
}

function drawMountains(rise, t) {
  const sky = mix3(PAL.skyBottom, t);
  [0, 1, 2].forEach((i) => {
    const base = H * (0.6 + i * 0.07) + rise * scale * (0.12 + i * 0.12);
    if (base - H * 0.35 > H) return;
    const amp = H * (0.22 - i * 0.05);
    const col = mix(PAL.mountains[i], PAL.mountains[2], t * 0.6);
    // Perspectiva atmosférica: lo lejano se funde con el cielo
    const haze = 0.55 - i * 0.2;
    const c = col.map((v, k) => Math.round(v + (sky[k] - v) * haze));
    ctx.fillStyle = rgb(c);
    ctx.beginPath();
    ctx.moveTo(0, H + 10);
    const pts = ridges[i];
    const n = 24;
    for (let k = 0; k <= n; k++) {
      const x = (k / n) * W;
      const v = pts[(k + i * 7) % pts.length];
      ctx.lineTo(x, base - v * amp);
    }
    ctx.lineTo(W, H + 10);
    ctx.closePath();
    ctx.fill();
  });
}

function worldToScreenY(y) { return (y - camY) * scale; }

function drawGround() {
  const gy = worldToScreenY(0);
  if (gy > H + 50) return;
  const g = ctx.createLinearGradient(0, gy - 30 * scale, 0, H);
  g.addColorStop(0, PAL.grassLight);
  g.addColorStop(0.25, PAL.grass);
  g.addColorStop(1, PAL.grassDark);
  // Loma suave
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, gy + 6 * scale);
  ctx.quadraticCurveTo(W * 0.3, gy - 26 * scale, W * 0.6, gy - 4 * scale);
  ctx.quadraticCurveTo(W * 0.85, gy + 8 * scale, W, gy - 10 * scale);
  ctx.lineTo(W, H + 10); ctx.lineTo(0, H + 10);
  ctx.closePath(); ctx.fill();
  // Briznas de hierba
  ctx.strokeStyle = PAL.grassDark;
  ctx.lineWidth = Math.max(1, 1.2 * scale);
  ctx.beginPath();
  for (let i = 0; i < 90; i++) {
    const x = ((i * 37.7) % 100) / 100 * W;
    const y = gy + (6 + ((i * 13) % 50)) * scale;
    const h = (4 + (i % 5)) * scale;
    ctx.moveTo(x, y); ctx.lineTo(x - 1.5 * scale, y - h);
    ctx.moveTo(x + 2 * scale, y); ctx.lineTo(x + 3 * scale, y - h * 0.8);
  }
  ctx.stroke();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

const WOOD = {
  normal: { top: '#9a6b43', mid: '#7f5535', dark: '#4e3220', grain: 'rgba(60,35,18,0.35)' },
  moving: { top: '#6e7f86', mid: '#56666d', dark: '#323d42', grain: 'rgba(25,32,36,0.35)' },
  fragile: { top: '#b7a184', mid: '#9c8566', dark: '#6b5a44', grain: 'rgba(70,55,38,0.4)' },
};

function drawBar(b) {
  if (b.ground) return;
  const h = 12;
  const c = WOOD[b.type];
  const seed = b.seed || 0.5;
  ctx.save();
  if (b.broken) { ctx.globalAlpha = 0.75; ctx.translate(b.x + b.w / 2, b.y); ctx.rotate(0.18); ctx.translate(-(b.x + b.w / 2), -b.y); }

  // Sombra proyectada
  ctx.fillStyle = 'rgba(20,20,30,0.18)';
  roundRect(b.x + 3, b.y + 5, b.w, h, 2); ctx.fill();
  // Postes
  ctx.fillStyle = c.dark;
  ctx.fillRect(b.x + 9, b.y + 6, 5, 14);
  ctx.fillRect(b.x + b.w - 14, b.y + 6, 5, 14);
  // Tablón con volumen
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + h);
  g.addColorStop(0, c.top);
  g.addColorStop(0.55, c.mid);
  g.addColorStop(1, c.dark);
  ctx.fillStyle = g;
  roundRect(b.x, b.y, b.w, h, 2); ctx.fill();
  // Veta de la madera
  ctx.strokeStyle = c.grain;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const yy = b.y + 3 + i * 3;
    const off = (seed * 50 + i * 17) % 30;
    ctx.moveTo(b.x + 4 + off * 0.3, yy);
    ctx.bezierCurveTo(b.x + b.w * 0.35, yy - 1.2, b.x + b.w * 0.6, yy + 1.2, b.x + b.w - 6 - off * 0.2, yy);
  }
  ctx.stroke();
  // Nudo
  ctx.fillStyle = c.grain;
  ctx.beginPath(); ctx.ellipse(b.x + 18 + seed * (b.w - 36), b.y + 6, 2.6, 1.4, 0, 0, Math.PI * 2); ctx.fill();
  // Borde iluminado
  ctx.fillStyle = 'rgba(255,240,215,0.18)';
  ctx.fillRect(b.x + 2, b.y + 0.5, b.w - 4, 1.2);

  if (b.type === 'moving') {
    // Abrazaderas de hierro
    ctx.fillStyle = '#2a2f33';
    ctx.fillRect(b.x + 5, b.y, 3, h);
    ctx.fillRect(b.x + b.w - 8, b.y, 3, h);
    ctx.fillStyle = 'rgba(220,225,228,0.5)';
    ctx.fillRect(b.x + 5, b.y + 1, 3, 1);
    ctx.fillRect(b.x + b.w - 8, b.y + 1, 3, 1);
  }
  if (b.type === 'fragile') {
    ctx.strokeStyle = 'rgba(40,28,18,0.75)';
    ctx.lineWidth = 1.2;
    const cx = b.x + b.w * (0.35 + seed * 0.3);
    ctx.beginPath();
    ctx.moveTo(cx - 4, b.y); ctx.lineTo(cx + 1, b.y + 5); ctx.lineTo(cx - 2, b.y + h);
    ctx.moveTo(cx + 1, b.y + 5); ctx.lineTo(cx + 9, b.y + 3);
    ctx.stroke();
  }
  ctx.restore();
}

function woolPuff(x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, PAL.wool);
  g.addColorStop(1, PAL.woolShade);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function drawSheep(s) {
  if (inv > 0 && Math.floor(inv * 12) % 2 === 0) return;
  ctx.save();
  ctx.translate(s.x, s.y);
  const sq = s.squash;
  ctx.scale(s.face * (1 + 0.14 * sq), 1 - 0.18 * sq);
  const air = s.vy < -200;

  // Sombra sobre el tablón
  if (!air) {
    ctx.fillStyle = 'rgba(20,20,30,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 0, 18, 3, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Patas finas con pezuña
  const legLen = air ? 9 : 12;
  for (const [lx, back] of [[-12, 1], [-6, 0], [6, 1], [12, 0]]) {
    ctx.fillStyle = back ? '#1c1918' : PAL.skin;
    const kick = air ? (back ? -2 : 2) : 0;
    ctx.fillRect(lx - 1.6 + kick, -legLen - 2, 3.2, legLen);
    ctx.fillStyle = '#121010';
    ctx.fillRect(lx - 1.9 + kick, -3, 3.8, 3);
  }

  // Lana con volumen (de atrás hacia delante)
  const puffs = [[-15, -20, 8], [-12, -29, 9], [-3, -33, 9.5], [7, -32, 9], [13, -24, 8], [-6, -18, 9], [5, -18, 9], [0, -26, 11]];
  ctx.fillStyle = 'rgba(80,70,60,0.18)';
  ctx.beginPath(); ctx.ellipse(0, -18, 19, 6, 0, 0, Math.PI * 2); ctx.fill();
  for (const [x, y, r] of puffs) woolPuff(x, y, r);
  // Rizos sutiles
  ctx.strokeStyle = 'rgba(150,138,120,0.35)';
  ctx.lineWidth = 0.9;
  for (const [x, y] of [[-8, -26], [2, -29], [8, -22], [-2, -20], [-13, -23]]) {
    ctx.beginPath(); ctx.arc(x, y, 2.4, 0.3, Math.PI * 1.4); ctx.stroke();
  }

  // Cabeza alargada
  ctx.save();
  ctx.translate(19, -28);
  ctx.rotate(0.35);
  const hg = ctx.createLinearGradient(-6, -8, 6, 10);
  hg.addColorStop(0, '#3d3735');
  hg.addColorStop(1, '#1d1a19');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.ellipse(1, 2, 6.5, 10, 0, 0, Math.PI * 2); ctx.fill();
  // Hocico
  ctx.fillStyle = '#1a1716';
  ctx.beginPath(); ctx.ellipse(2, 10, 4.2, 3.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Oreja horizontal
  ctx.fillStyle = '#2b2726';
  ctx.beginPath(); ctx.ellipse(12, -33, 6.5, 2.2, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(160,110,100,0.55)';
  ctx.beginPath(); ctx.ellipse(11.5, -33, 4, 1, -0.25, 0, Math.PI * 2); ctx.fill();
  // Copete de lana
  woolPuff(17, -38, 4.2);
  woolPuff(21, -37, 3.4);
  // Ojo
  const blink = Math.sin(time * 1.3) > 0.985;
  if (blink) {
    ctx.fillStyle = '#5c5450'; ctx.fillRect(18.5, -30.5, 4, 1);
  } else {
    ctx.fillStyle = '#d8cfc0';
    ctx.beginPath(); ctx.ellipse(21, -30, 2.3, 1.8, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0d0b0b';
    ctx.beginPath(); ctx.ellipse(21.3, -30, 1.1, 1.5, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(21.4, -31.2, 0.8, 0.8);
  }
  ctx.restore();
}

function drawBee(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.vx < 0 ? -0.85 : 0.85, 0.85);
  // Alas translúcidas con nervadura
  const flap = 0.45 + Math.abs(Math.sin(time * 32)) * 0.55;
  ctx.fillStyle = 'rgba(225,235,240,0.45)';
  ctx.strokeStyle = 'rgba(80,90,100,0.5)';
  ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.ellipse(-2, -9, 5, 9 * flap, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(4, -8, 4, 7 * flap, 0.25, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Abdomen con franjas
  ctx.save();
  ctx.beginPath(); ctx.ellipse(-3, 1, 10, 7, 0.1, 0, Math.PI * 2); ctx.clip();
  const bg = ctx.createLinearGradient(0, -7, 0, 8);
  bg.addColorStop(0, '#e2a93b'); bg.addColorStop(1, '#a66d1c');
  ctx.fillStyle = bg; ctx.fillRect(-14, -8, 22, 16);
  ctx.fillStyle = '#231a12';
  ctx.fillRect(-8, -8, 3, 16); ctx.fillRect(-2, -8, 3, 16); ctx.fillRect(-14, -8, 3, 16);
  ctx.restore();
  // Tórax peludo y cabeza
  ctx.fillStyle = '#4a3720';
  ctx.beginPath(); ctx.arc(7, 0, 4.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1e1712';
  ctx.beginPath(); ctx.arc(12, 1, 3.6, 0, Math.PI * 2); ctx.fill();
  // Antena
  ctx.strokeStyle = '#1e1712'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(13, -2); ctx.quadraticCurveTo(16, -7, 18, -6); ctx.stroke();
  // Aguijón
  ctx.fillStyle = '#1e1712';
  ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-17, 2); ctx.lineTo(-12, 3); ctx.fill();
  ctx.restore();
}

function drawThorn(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  // Hojas dentadas
  ctx.fillStyle = '#5d7148';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 10);
    for (let i = 1; i <= 5; i++) {
      ctx.lineTo(dir * i * 2.8, 10 - i * 1.6 - (i % 2 ? 3 : 0));
    }
    ctx.lineTo(dir * 2, 4);
    ctx.closePath(); ctx.fill();
  }
  // Tallo
  ctx.strokeStyle = '#4a5c38'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -2); ctx.stroke();
  // Cabezuela con brácteas espinosas
  const g = ctx.createRadialGradient(-1, -3, 1, 0, -1, 7);
  g.addColorStop(0, '#7f9466'); g.addColorStop(1, '#4b5d3a');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, -1, 5.5, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#cfd6c0'; ctx.lineWidth = 0.7;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 5, -1 + Math.sin(a) * 5.5); ctx.lineTo(Math.cos(a) * 8.5, -1 + Math.sin(a) * 9); ctx.stroke();
  }
  // Flor
  ctx.strokeStyle = '#8a5f9e'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(i * 1.5, -12 + Math.abs(i) * 0.7); ctx.stroke();
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
    ctx.fillStyle = 'rgba(15,20,30,0.28)';
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

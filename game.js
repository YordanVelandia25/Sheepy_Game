// Sheepy Jump — la oveja rebota sola sobre los tablones; tú la mueves a izquierda y derecha.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

// ---------- Pantalla de inicio ----------
// Va al principio para que el botón Iniciar funcione aunque algo más falle.
const splash = $('splash');
let menuReadyAt = 0; // evita que la misma pulsación de Iniciar empiece la partida
function closeSplash() {
  if (splash.classList.contains('leaving')) return;
  menuReadyAt = performance.now() + 900;
  document.activeElement?.blur?.();
  try {
    initAudio();
    if (audio && audio.state === 'suspended') audio.resume();
    sfx.record();
  } catch (err) { console.warn('Sonido no disponible:', err); }
  splash.classList.add('leaving');
  setTimeout(() => { splash.hidden = true; }, 450);
}
$('startBtn').addEventListener('click', closeSplash);
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
// Progresión de obstáculos y premios (en metros)
const SAFE_M = 100;        // 0–99 m: sin obstáculos
const BEES_FROM_M = 201;   // 100–200 m: solo cardos; desde 201 m también abejas
const HEART_FROM_M = 400;  // primer corazón para recuperar vidas…
const HEART_EVERY_M = 300; // …y luego uno cada 300 m

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
  heal: () => { tone('sine', 660, 880, 0.1, 0.1); setTimeout(() => tone('sine', 880, 1320, 0.16, 0.1), 90); },
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
  if (e.target instanceof HTMLInputElement) return; // escribiendo el nombre
  if (!splash.hidden) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeSplash(); }
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
  // Enter/espacio empiezan la partida desde el menú, pero no justo después de la pantalla de inicio
  if ((e.key === 'Enter' || e.key === ' ') && mode !== 'play' && !e.repeat && performance.now() > menuReadyAt) { e.preventDefault(); start(); }
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
let sheep, bars, foes, parts, camY, topY, maxY, hearts, inv, time, newRecordShown, nextHeartM;
let best = Number(safeGet('best-m') || 0);

const clouds = Array.from({ length: 5 }, () => ({
  x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8, v: 4 + Math.random() * 8,
}));
const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4 }));

function meters() { return Math.max(0, Math.floor(-maxY / PX_PER_M)); }

function reset() {
  sheep = { x: GW / 2, y: 0, vx: 0, vy: 0, face: 1, squash: 0, ear: 0, earV: 0, arm: 0, armV: 0 };
  bars = [{ x: -2000, y: 0, w: GW + 4000, ground: true }];
  foes = [];
  parts = [];
  camY = -(GH - 90);
  topY = 0;
  maxY = 0;
  hearts = MAX_HEARTS;
  nextHeartM = HEART_FROM_M;
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

  // Obstáculos: van apareciendo poco a poco y cada uno se vuelve más frecuente con la altura
  const thornD = Math.min(Math.max((m - SAFE_M) / 300, 0), 1);
  const beeD = Math.min(Math.max((m - BEES_FROM_M) / 400, 0), 1);
  const heartHere = m >= nextHeartM && type !== 'fragile';
  if (heartHere) {
    nextHeartM += HEART_EVERY_M;
    foes.push({ kind: 'heart', bar, off: w / 2, x: 0, y: 0, r: 12, t: 0 });
  }
  if (m >= BEES_FROM_M && Math.random() < 0.06 + 0.16 * beeD) {
    foes.push({
      kind: 'bee', x: 20 + Math.random() * (GW - 40), baseY: y + gap / 2, y: y + gap / 2,
      vx: (50 + 70 * beeD) * (Math.random() < 0.5 ? -1 : 1), t: Math.random() * 6, r: 13,
    });
  }
  if (!heartHere && type === 'normal' && m >= SAFE_M && w > 70 && Math.random() < 0.08 + 0.14 * thornD) {
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

// ---------- Ranking: mundial (Supabase) y de este dispositivo ----------
// Una sola puntuación por jugador (por nombre, sin distinguir mayúsculas):
// solo se reemplaza cuando se supera la anterior.
const RANK_KEY = 'ranking-v1';
const PENDING_KEY = 'ranking-pendiente-v2';
const DRAFT_KEY = 'partida-sin-guardar';
const RANK_MAX = 50;   // jugadores guardados en el dispositivo
const RANK_SHOW = 10;  // jugadores visibles
const playerInput = $('player');
const rankingEl = $('ranking');
const savedEl = $('saved');
const introEl = $('intro');
const saveBtn = $('save');
const playerLabel = document.querySelector('label[for="player"]');

const CFG = window.OVEJA_CONFIG || {};
const GLOBAL_ON = !!(CFG.supabaseUrl && CFG.supabaseKey);

let ranking = loadRanking();        // ranking del dispositivo
let worldTop = [];                  // top 10 mundial
let worldState = 'idle';            // idle | loading | ok | error
let worldError = '';                // mensaje de Supabase si falló la carga
let current = null;                 // última partida: { m, saved, name, local, world }
best = Math.max(best, ranking[0]?.m || 0);
playerInput.value = safeGet('player-name') || '';

function loadJSON(key, fallback) {
  try { const v = JSON.parse(safeGet(key) || 'null'); return v ?? fallback; } catch { return fallback; }
}
function byScore(a, b) { return b.m - a.m || a.t - b.t; }
function cleanName(s) { return (s || '').replace(/\s+/g, ' ').trim().slice(0, 16); }
function nameKey(s) { return cleanName(s).toLowerCase(); }
function playerName() { return cleanName(playerInput.value) || 'Jugador'; }

function loadRanking() {
  const r = loadJSON(RANK_KEY, []);
  if (!Array.isArray(r)) return [];
  // Deja solo la mejor puntuación de cada jugador (también limpia datos antiguos)
  const bestBy = new Map();
  for (const e of r) {
    if (!e || typeof e.name !== 'string' || !Number.isFinite(e.m)) continue;
    const k = nameKey(e.name), prev = bestBy.get(k);
    if (!prev || e.m > prev.m) bestBy.set(k, e);
  }
  return [...bestBy.values()].sort(byScore).slice(0, RANK_MAX);
}
function saveRanking() { safeSet(RANK_KEY, JSON.stringify(ranking)); }

// Guarda en el dispositivo. Devuelve { entry, improved }.
function saveLocalScore(name, m) {
  let entry = ranking.find((e) => nameKey(e.name) === nameKey(name));
  let improved = false;
  if (!entry) {
    entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, m, t: Date.now() };
    ranking.push(entry);
    improved = true;
  } else if (m > entry.m) {
    Object.assign(entry, { name, m, t: Date.now() });
    improved = true;
  }
  ranking.sort(byScore);
  ranking = ranking.slice(0, RANK_MAX);
  saveRanking();
  return { entry: ranking.includes(entry) ? entry : null, improved };
}

// --- API de Supabase (REST, sin librerías) ---
async function api(path, body) {
  const res = await fetch(CFG.supabaseUrl.replace(/\/$/, '') + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      apikey: CFG.supabaseKey,
      // Las claves antiguas (anon, formato JWT "eyJ…") también van como Bearer;
      // las nuevas (sb_publishable_…) solo en "apikey".
      ...(CFG.supabaseKey.startsWith('eyJ') ? { Authorization: `Bearer ${CFG.supabaseKey}` } : {}),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    keepalive: !!body,
  });
  if (!res.ok) {
    // Error devuelto por Supabase (no de conexión): se muestra su mensaje
    let detail = '';
    try { const j = await res.json(); detail = j.message || j.hint || j.error || ''; } catch {}
    const err = new Error(`${res.status}${detail ? ': ' + detail : ''}`);
    err.server = true;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

async function loadWorld() {
  if (!GLOBAL_ON) return;
  worldState = worldTop.length ? 'ok' : 'loading';
  renderRanking();
  try {
    worldTop = await api(`/rest/v1/scores?select=name,meters&order=meters.desc,created_at.asc&limit=${RANK_SHOW}`);
    worldState = 'ok';
  } catch (err) {
    worldState = 'error';
    worldError = err.server ? err.message : '';
    console.warn('Ranking mundial:', err);
  }
  renderRanking();
}

// Cola de puntuaciones por enviar (sobrevive a cortes de conexión y recargas)
let pending = loadJSON(PENDING_KEY, []);
if (!Array.isArray(pending)) pending = [];
const savePending = () => safeSet(PENDING_KEY, JSON.stringify(pending));
let flushing = false;

async function flushPending() {
  if (!GLOBAL_ON || flushing || !pending.length) return;
  flushing = true;
  try {
    while (pending.length) {
      const item = pending[0];
      // La partida en pantalla puede cambiar mientras se envía: se guarda la referencia
      const game = current && current.world?.key === item.key ? current : null;
      try {
        const [row] = await api('/rest/v1/rpc/submit_score', { p_name: item.name, p_meters: item.m });
        pending.shift(); savePending();
        if (!row || row.best_meters == null) throw Object.assign(new Error('respuesta inesperada; vuelve a ejecutar supabase/ranking.sql'), { server: true });
        if (game) Object.assign(game.world, { status: 'sent', rank: row.score_rank, best: row.best_meters, improved: row.improved });
        if (nameKey(item.name) === nameKey(playerInput.value)) me = { name: item.name, best: row.best_meters, rank: row.score_rank };
      } catch (err) {
        if (game) Object.assign(game.world, { status: err.server ? 'error' : 'offline', error: err.message });
        console.warn('Ranking mundial:', err);
        break;
      }
    }
  } finally {
    flushing = false;
  }
  showSaved();
  loadWorld();
}
window.addEventListener('online', flushPending);

// --- Guardar la partida ---
function commitScore() {
  if (!current || current.saved) return;
  const name = playerName();
  playerInput.value = name;
  safeSet('player-name', name);
  const local = saveLocalScore(name, current.m);
  const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  Object.assign(current, { saved: true, name, local: local.entry, localImproved: local.improved, world: { key, status: 'sending' } });
  safeSet(DRAFT_KEY, '');
  if (GLOBAL_ON) {
    pending.push({ key, name, m: current.m });
    savePending();
    flushPending();
  }
  saveBtn.hidden = true;
  playerLabel.textContent = 'Nombre del jugador';
  showSaved();
  renderRanking();
}
saveBtn.addEventListener('click', commitScore);

// Si se cierra el juego sin guardar, se guarda solo
function commitOnExit() { if (mode === 'over' && current && !current.saved) commitScore(); }
window.addEventListener('pagehide', commitOnExit);
document.addEventListener('visibilitychange', () => { if (document.hidden) commitOnExit(); });

// Partida que quedó sin guardar en una sesión anterior (p. ej. se cerró la app)
function recoverDraft() {
  const d = loadJSON(DRAFT_KEY, null);
  if (!d || !Number.isFinite(d.m) || d.m <= 0) return;
  const saved = playerInput.value;
  playerInput.value = d.name || saved;
  current = { m: d.m, saved: false, world: {} };
  commitScore();
  current = null;
  playerInput.value = saved || playerInput.value;
  safeSet('player-name', cleanName(playerInput.value));
  savedEl.textContent = '';
}

// --- Dibujo del ranking: podio (1-3), lista (4-10) y tu posición ---
const AVATAR = 'sprites/avatar-sheepy.webp';
// Avatares especiales del podio: 1.º Sheepy Corona, 2.º Sheepy Marinera, 3.º Sheepy La Bella
const PODIUM_AVATARS = { 1: 'sprites/avatar-corona.webp', 2: 'sprites/avatar-marinera.webp', 3: 'sprites/avatar-bella.webp' };
let me = null;          // { name, best, rank } del jugador actual en el ranking mundial
let meLoading = 0;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function avatar(cls, src) {
  const wrap = el('span', 'avatar ' + (cls || ''));
  const im = document.createElement('img');
  im.src = src || AVATAR; im.alt = ''; im.width = 80; im.height = 80; im.decoding = 'async';
  wrap.appendChild(im);
  return wrap;
}
function note(text) { return el('p', 'rank-note', text); }

function podiumSpot(r, place, isMe) {
  const spot = el('div', `spot p${place}${isMe ? ' me' : ''}`);
  const av = avatar('', PODIUM_AVATARS[place]);
  av.appendChild(el('span', 'badge', place));
  spot.append(av, el('span', 'spot-name', r.name), el('span', 'spot-score', `${r.meters} m`));
  const block = el('div', 'block');
  block.appendChild(el('span', 'block-num', place));
  spot.appendChild(block);
  return spot;
}

function renderRanking() {
  rankingEl.replaceChildren();
  const myKey = me ? nameKey(me.name) : (current?.saved ? nameKey(current.name) : null);
  if (!GLOBAL_ON) { rankingEl.appendChild(note('El ranking mundial está disponible en la versión publicada del juego.')); return; }
  if (worldState === 'loading' || worldState === 'idle') { rankingEl.appendChild(note('Cargando el ranking mundial…')); return; }
  if (worldState === 'error') {
    rankingEl.appendChild(note(worldError
      ? `No se pudo cargar el ranking mundial (error ${worldError}).`
      : 'No se pudo cargar el ranking mundial. Revisa tu conexión.'));
    return;
  }
  if (!worldTop.length) { rankingEl.appendChild(note('Todavía no hay puntuaciones en el mundo. ¡Sé la primera persona!')); return; }

  // Podio: 2.º a la izquierda, 1.º al centro, 3.º a la derecha
  const podium = el('div', 'podium');
  for (const place of [2, 1, 3]) {
    const r = worldTop[place - 1];
    podium.appendChild(r ? podiumSpot(r, place, nameKey(r.name) === myKey) : el('div', `spot p${place} empty`));
  }
  rankingEl.appendChild(podium);

  // Lista del 4.º al 10.º
  if (worldTop.length > 3) {
    const table = el('div', 'rank-table');
    const head = el('div', 'rank-head');
    head.append(el('span', null, 'Puesto'), el('span', null, 'Jugador'), el('span', null, 'Metros'));
    table.appendChild(head);
    worldTop.slice(3).forEach((r, i) => {
      const row = el('div', 'rank-row' + (nameKey(r.name) === myKey ? ' me' : ''));
      row.append(el('span', 'pos', i + 4), avatar('sm'), el('span', 'name', r.name), el('span', 'score', `${r.meters} m`));
      table.appendChild(row);
    });
    rankingEl.appendChild(table);
  }

  // Tu posición
  if (me && me.rank) {
    const bar = el('div', 'me-bar');
    const info = el('div', 'me-info');
    const nm = el('span', 'me-name', me.name);
    nm.appendChild(el('span', 'you', 'TÚ'));
    info.append(nm, el('span', 'me-best', `Mejor marca: ${me.best} m`));
    bar.append(el('span', 'me-rank', `#${me.rank}`), avatar('sm'), info);
    rankingEl.appendChild(bar);
  }
}

// Busca la mejor marca y el puesto de un nombre en el ranking mundial
async function loadMe(name) {
  if (!GLOBAL_ON) return;
  const key = cleanName(name);
  if (!key) { me = null; renderRanking(); return; }
  const ticket = ++meLoading;
  try {
    const like = key.replace(/[\\%_*]/g, (c) => '\\' + c);
    const rows = await api(`/rest/v1/scores?select=name,meters&name=ilike.${encodeURIComponent(like)}&limit=1`);
    if (ticket !== meLoading) return;
    if (!rows.length) { me = null; renderRanking(); return; }
    const best = rows[0].meters;
    const res = await fetch(`${CFG.supabaseUrl.replace(/\/$/, '')}/rest/v1/scores?select=id&meters=gt.${best}`, {
      method: 'HEAD',
      headers: {
        apikey: CFG.supabaseKey,
        Prefer: 'count=exact',
        ...(CFG.supabaseKey.startsWith('eyJ') ? { Authorization: `Bearer ${CFG.supabaseKey}` } : {}),
      },
    });
    if (ticket !== meLoading) return;
    const total = Number((res.headers.get('content-range') || '').split('/')[1]);
    me = { name: rows[0].name, best, rank: Number.isFinite(total) ? total + 1 : null };
  } catch { if (ticket === meLoading) me = null; }
  renderRanking();
}

function showSaved() {
  if (!current) return;
  if (!current.saved) {
    savedEl.textContent = 'Escribe tu nombre y guarda. Cada jugador tiene una sola puntuación: solo se reemplaza si la superas.';
    return;
  }
  const name = `«${current.name}»`;
  const w = current.world;
  if (GLOBAL_ON && w.status === 'sent') {
    savedEl.textContent = w.improved
      ? `¡Nuevo récord de ${name}! Puesto ${w.rank} en el mundo.`
      : `${name} ya tenía ${w.best} m, así que se mantiene esa marca (puesto ${w.rank} en el mundo).`;
    return;
  }
  if (GLOBAL_ON && w.status === 'offline') savedEl.textContent = `Sin conexión: la puntuación de ${name} se enviará al ranking mundial cuando vuelva internet.`;
  else if (GLOBAL_ON && w.status === 'error') savedEl.textContent = `No se pudo guardar en el ranking mundial (error ${w.error}). Se volverá a intentar.`;
  else if (GLOBAL_ON) savedEl.textContent = `Guardando a ${name} en el ranking mundial…`;
  else savedEl.textContent = current.localImproved
    ? `¡Nuevo récord de ${name}!`
    : `${name} ya tenía ${current.local?.m} m, así que se mantiene esa marca.`;
}

let meTimer = 0;
playerInput.addEventListener('input', () => {
  const name = cleanName(playerInput.value);
  safeSet('player-name', name);
  clearTimeout(meTimer);
  meTimer = setTimeout(() => loadMe(name), 500);
  if (mode === 'over' && current && !current.saved) {
    safeSet(DRAFT_KEY, JSON.stringify({ name, m: current.m }));
  }
});
playerInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (mode === 'over' && current && !current.saved) commitScore();
  else { playerInput.blur(); start(); }
});

function start() {
  if (!splash.hidden || performance.now() < menuReadyAt) return; // aún en la pantalla de inicio
  commitOnExit(); // "Jugar otra vez" guarda la partida anterior si no se guardó
  playerInput.value = cleanName(playerInput.value);
  safeSet('player-name', playerInput.value);
  current = null;
  savedEl.textContent = '';
  saveBtn.hidden = true;
  playerLabel.textContent = 'Nombre del jugador';
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
  if (m > 0) {
    current = { m, saved: false, world: {} };
    safeSet(DRAFT_KEY, JSON.stringify({ name: playerName(), m }));
    saveBtn.hidden = false;
    playerLabel.textContent = 'Nombre para esta puntuación';
    showSaved();
  } else {
    current = null;
    saveBtn.hidden = true;
    savedEl.textContent = 'Con 0 m la partida no se guarda en el ranking.';
  }
  introEl.hidden = true;
  renderRanking();
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
  puff(sheep.x, sheep.y - SHEEP_H * 0.5, '#ffd23f', 10, 180);
  sfx.ouch();
  navigator.vibrate?.(120);
  updateHud();
  if (hearts <= 0) gameOver('hit');
}

function collectHeart(f) {
  f.taken = true;
  if (hearts < MAX_HEARTS) hearts++;
  puff(f.x, f.y, '#ff6b6b', 10, 150);
  puff(f.x, f.y, '#ffffff', 6, 110);
  sfx.heal();
  updateHud();
  heartsEl.classList.remove('gain'); void heartsEl.offsetWidth; heartsEl.classList.add('gain');
}

// ---------- Animación de orejas y brazos ----------
// Cada pieza sigue un ángulo objetivo con un resorte: llega con retraso y rebota un poco.
function spring(s, key, target, dt, stiffness, damping) {
  const v = key + 'V';
  s[v] += ((target - s[key]) * stiffness - s[v] * damping) * dt;
  s[key] += s[v] * dt;
}
function animateLimbs(s, dt) {
  const t = Math.min(Math.max(s.vy / JUMP, -1), 1); // -1 subiendo rápido … +1 cayendo rápido
  const up = Math.max(-t, 0), down = Math.max(t, 0);
  // Orejas: al subir caen por la inercia; al caer se levantan con el aire
  spring(s, 'ear', t < 0 ? t * 0.6 : t * 1.05, dt, 170, 7);
  // Brazos (enteros, desde el hombro): al subir se levantan; al caer se abren y aletean
  const flap = down > 0.1 ? Math.sin(time * 18) * 0.55 * down : 0;
  spring(s, 'arm', up * 1.75 + down * 0.85 + flap, dt, 160, 8);
}
function bumpLimbs(s) { // golpe al aterrizar: orejas y brazos rebotan
  s.earV -= 16;
  s.armV -= 13;
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
  animateLimbs(sheep, dt);
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
      if (prevY <= b.y + 1 && sheep.y >= b.y && sheep.x + SHEEP_W * 0.36 > b.x && sheep.x - SHEEP_W * 0.36 < b.x + b.w) {
        sheep.y = b.y;
        sheep.vy = -JUMP;
        sheep.squash = 1;
        bumpLimbs(sheep);
        puff(sheep.x, b.y, '#ffffff', 5, 90);
        if (b.type === 'fragile') {
          b.broken = true;
          sfx.crack();
          puff(b.x + b.w / 2, b.y + 6, '#dcc08e', 8, 150);
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
    } else if (f.kind === 'heart') {
      f.t += dt;
      f.x = f.bar.x + f.off;
      f.y = f.bar.y - 34 + Math.sin(f.t * 3) * 4;
      if (playing && !f.taken) {
        const dx = f.x - sheep.x, dy = f.y - (sheep.y - SHEEP_H * 0.5);
        if (dx * dx + dy * dy < (f.r + SHEEP_W * 0.45) ** 2) collectHeart(f);
      }
      continue;
    } else {
      f.x = f.bar.x + f.off;
      f.y = f.bar.y - 10;
    }
    if (playing && inv <= 0) {
      const dx = f.x - sheep.x, dy = f.y - (sheep.y - SHEEP_H * 0.5);
      if (dx * dx + dy * dy < (f.r + SHEEP_W * 0.36) ** 2) { hurt(); if (mode !== 'play') return; }
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
  foes = foes.filter((f) => !f.taken && (f.bar ? bars.includes(f.bar) : f.y < bottom));

  if (sheep.y > camY + GH + 60) { sfx.fall(); gameOver('fall'); }
}

// ---------- Dibujo ----------
// Estilo de caricatura: contorno oscuro, colores planos con una luz y una sombra.
const OUTLINE = '#1d1a1a';
const PAL = {
  skyTop: ['47a6e0', '5b4f9e', '131a3a'],     // día → atardecer → noche
  skyBottom: ['cdeefa', 'f3a678', '34306a'],
  mountains: ['a9cfe0', '86b6cb', '6299b2'],   // lejos → cerca
  grass: '#7cc04f', grassDark: '#4f8f2c', grassLight: '#a3d86d',
};

// Sprites del personaje (cuerpo y tenis por separado para animarlos)
const SPRITES = {
  body: 'sprites/oveja-cuerpo.png',
  footL: 'sprites/oveja-pie-izq.png',
  footR: 'sprites/oveja-pie-der.png',
  earL: 'sprites/oveja-oreja-izq.png',
  earR: 'sprites/oveja-oreja-der.png',
  armL: 'sprites/oveja-brazo-izq.png',
  armR: 'sprites/oveja-brazo-der.png',
};
// Piezas móviles: esquina superior izquierda (x, y) y punto de giro (px, py), en píxeles del sprite
const PARTS = {
  earL: { x: 0.4, y: 77.6, px: 51.2, py: 96 },
  earR: { x: 152, y: 76.8, px: 160, py: 96 },
  armL: { x: 0, y: 174.4, px: 32, py: 182 },       // brazo entero, gira en el hombro
  armR: { x: 170.8, y: 174.4, px: 180.8, py: 182 },
};
const img = {};
for (const [k, src] of Object.entries(SPRITES)) { img[k] = new Image(); img[k].src = src; }
const SHEEP_W = 50;              // ancho de la oveja en el mundo (tamaño en pantalla)
const SPR_W = 213;               // ancho del sprite en píxeles
const SPR_K = SHEEP_W / SPR_W;   // píxeles del sprite → unidades del mundo
const SHEEP_H = 363 * SPR_K;     // alto total (≈ 85)
const LEGS_TOP = 283 * SPR_K;    // dónde empieza la capa de los tenis
const EYES = [[82, 90.4], [131.2, 90.4]]; // centros de los ojos en el sprite
const FACE = '#faf7ee';

function hexRgb(h) { return h.match(/\w\w/g).map((x) => parseInt(x, 16)); }
function mix(a, b, t) {
  const pa = hexRgb(a), pb = hexRgb(b);
  return pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
}
function mix3(arr, t) {
  return t < 0.5 ? mix(arr[0], arr[1], t * 2) : mix(arr[1], arr[2], (t - 0.5) * 2);
}
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const ridges = [0, 1, 2].map((layer) => {
  const pts = [];
  let h = 0.5;
  for (let i = 0; i < 48; i++) {
    h += (Math.random() - 0.5) * (0.4 - layer * 0.1);
    h = Math.min(Math.max(h, 0.15), 1);
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

  if (t > 0.45) {
    ctx.fillStyle = `rgba(255,250,220,${Math.min((t - 0.45) * 1.8, 0.9)})`;
    for (const s of stars) {
      const y = ((s.y * H - camY * scale * 0.05) % H + H) % H;
      drawSparkle(s.x * W, y, s.r * 1.6);
    }
  }

  // Sol de caricatura
  const rise = -camY - (GH - 90);
  const sunY = H * 0.28 + rise * scale * 0.08;
  if (sunY < H + 80) {
    const sx = W * 0.78, r = 30 * Math.max(scale, 0.8);
    ctx.fillStyle = 'rgba(255,230,120,0.25)';
    ctx.beginPath(); ctx.arc(sx, sunY, r * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t < 0.6 ? '#ffd23f' : '#fff3c4';
    ctx.strokeStyle = 'rgba(29,26,26,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx, sunY, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(sx - r * 0.35, sunY - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fill();
  }

  for (const c of clouds) {
    c.x += (c.v / W) * (1 / 60);
    if (c.x > 1.3) c.x = -0.3;
    const span = H + 200;
    const y = ((c.y * span - camY * scale * 0.25) % span + span) % span - 100;
    drawCloud(c.x * W, y, c.s * Math.max(scale, 0.8), t);
  }

  drawMountains(rise, t);
}

function drawSparkle(x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.3, y - r * 0.3); ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.3, y + r * 0.3); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.3, y + r * 0.3);
  ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.3, y - r * 0.3); ctx.closePath(); ctx.fill();
}

function cloudPath(x, y, s) {
  ctx.beginPath();
  for (const [cx, cy, r] of [[-34, 6, 16], [-14, -6, 22], [12, -12, 26], [36, 0, 18], [0, 10, 18], [24, 10, 16]]) {
    ctx.moveTo(x + (cx + r) * s, y + cy * s);
    ctx.arc(x + cx * s, y + cy * s, r * s, 0, Math.PI * 2);
  }
}
function drawCloud(x, y, s, t) {
  // Contorno: se dibuja el trazo grueso y luego el relleno encima
  cloudPath(x, y, s);
  ctx.strokeStyle = rgb(mix('6d8bb0', '2a2550', t), 0.9);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = rgb(mix('ffffff', '8c88b8', t));
  ctx.fill();
  // Sombra inferior
  ctx.save();
  cloudPath(x, y, s); ctx.clip();
  ctx.fillStyle = rgb(mix('d9ecf7', '6e6aa0', t));
  ctx.fillRect(x - 60 * s, y + 8 * s, 120 * s, 30 * s);
  ctx.restore();
}

function drawMountains(rise, t) {
  const sky = mix3(PAL.skyBottom, t);
  [0, 1, 2].forEach((i) => {
    const base = H * (0.62 + i * 0.07) + rise * scale * (0.12 + i * 0.12);
    if (base - H * 0.35 > H) return;
    const amp = H * (0.2 - i * 0.04);
    const col = mix(PAL.mountains[i], '3c4a78', t * 0.7);
    const haze = 0.35 - i * 0.15;
    const c = col.map((v, k) => Math.round(v + (sky[k] - v) * haze));
    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    const pts = ridges[i];
    const n = 16;
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const x = (k / n) * W;
      const yy = base - pts[(k + i * 7) % pts.length] * amp;
      if (k === 0) ctx.lineTo(x, yy);
      else ctx.quadraticCurveTo(prev[0], prev[1], (prev[0] + x) / 2, (prev[1] + yy) / 2);
      prev = [x, yy];
    }
    ctx.lineTo(W + 10, prev[1]);
    ctx.lineTo(W + 10, H + 10);
    ctx.closePath();
    ctx.fillStyle = rgb(c);
    ctx.fill();
    ctx.strokeStyle = `rgba(29,26,26,${0.25 + i * 0.12})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  });
}

function worldToScreenY(y) { return (y - camY) * scale; }

function drawGround() {
  const gy = worldToScreenY(0);
  if (gy > H + 50) return;
  ctx.beginPath();
  ctx.moveTo(-10, gy + 6 * scale);
  ctx.quadraticCurveTo(W * 0.3, gy - 26 * scale, W * 0.6, gy - 4 * scale);
  ctx.quadraticCurveTo(W * 0.85, gy + 8 * scale, W + 10, gy - 10 * scale);
  ctx.lineTo(W + 10, H + 10); ctx.lineTo(-10, H + 10);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, gy - 30 * scale, 0, H);
  g.addColorStop(0, PAL.grassLight);
  g.addColorStop(0.2, PAL.grass);
  g.addColorStop(1, PAL.grassDark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;
  ctx.stroke();
  // Matas de hierba en "w"
  ctx.strokeStyle = PAL.grassDark;
  ctx.lineWidth = Math.max(1.5, 2 * scale);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < 26; i++) {
    const x = ((i * 37.7) % 100) / 100 * W;
    const y = gy + (18 + ((i * 13) % 60)) * scale;
    const h = 6 * scale;
    ctx.moveTo(x - 6 * scale, y - h); ctx.lineTo(x - 3 * scale, y); ctx.lineTo(x, y - h * 1.2);
    ctx.lineTo(x + 3 * scale, y); ctx.lineTo(x + 6 * scale, y - h);
  }
  ctx.stroke();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

const WOOD = {
  normal: { fill: '#c07a3e', light: '#e0a066', dark: '#8a4f22' },
  moving: { fill: '#3f8fd0', light: '#79b9ea', dark: '#255f92' },
  fragile: { fill: '#dcc08e', light: '#f1dcb2', dark: '#a98a5c' },
};

function drawBar(b) {
  if (b.ground) return;
  const h = 13;
  const c = WOOD[b.type];
  const seed = b.seed || 0.5;
  ctx.save();
  ctx.lineJoin = 'round';
  if (b.broken) { ctx.globalAlpha = 0.8; ctx.translate(b.x + b.w / 2, b.y); ctx.rotate(0.2); ctx.translate(-(b.x + b.w / 2), -b.y); }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  // Postes
  for (const px of [b.x + 9, b.x + b.w - 15]) {
    ctx.fillStyle = c.dark;
    roundRect(px, b.y + 6, 6, 15, 2); ctx.fill(); ctx.stroke();
  }
  // Tablón
  ctx.fillStyle = c.fill;
  roundRect(b.x, b.y, b.w, h, 4); ctx.fill();
  ctx.fillStyle = c.dark;
  ctx.fillRect(b.x + 2, b.y + h - 4, b.w - 4, 3);
  ctx.fillStyle = c.light;
  roundRect(b.x + 3, b.y + 2, b.w - 6, 3, 1.5); ctx.fill();
  roundRect(b.x, b.y, b.w, h, 4); ctx.stroke();
  // Veta
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const gx = b.x + 14 + seed * (b.w - 40);
  ctx.moveTo(gx, b.y + 7); ctx.quadraticCurveTo(gx + 8, b.y + 5, gx + 16, b.y + 7);
  ctx.moveTo(b.x + b.w - 26 - seed * 10, b.y + 8); ctx.lineTo(b.x + b.w - 14 - seed * 10, b.y + 8);
  ctx.stroke();
  // Clavos
  ctx.fillStyle = OUTLINE;
  ctx.beginPath(); ctx.arc(b.x + 5, b.y + 6.5, 1.3, 0, Math.PI * 2); ctx.arc(b.x + b.w - 5, b.y + 6.5, 1.3, 0, Math.PI * 2); ctx.fill();

  if (b.type === 'moving') {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.2;
    const cx = b.x + b.w / 2, cy = b.y + 6.5;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + d * 6, cy - 3.5); ctx.lineTo(cx + d * 12, cy); ctx.lineTo(cx + d * 6, cy + 3.5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  if (b.type === 'fragile') {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    const cx = b.x + b.w * (0.35 + seed * 0.3);
    ctx.beginPath();
    ctx.moveTo(cx - 4, b.y); ctx.lineTo(cx + 1, b.y + 5); ctx.lineTo(cx - 2, b.y + h);
    ctx.moveTo(cx + 1, b.y + 5); ctx.lineTo(cx + 9, b.y + 3);
    ctx.stroke();
  }
  ctx.restore();
}

// Dibuja una pieza girada sobre su punto de unión
function drawPart(name, lx, top, angle) {
  const P = PARTS[name], im = img[name];
  if (!im.complete || !im.naturalWidth) return;
  ctx.save();
  ctx.translate(lx + P.px * SPR_K, top + P.py * SPR_K);
  ctx.rotate(angle);
  ctx.drawImage(im, (P.x - P.px) * SPR_K, (P.y - P.py) * SPR_K, im.naturalWidth * SPR_K, im.naturalHeight * SPR_K);
  ctx.restore();
}

function drawSheep(s) {
  if (inv > 0 && Math.floor(inv * 12) % 2 === 0) return;
  if (!img.body.complete || !img.body.naturalWidth) return;
  ctx.save();
  ctx.translate(s.x, s.y);
  // Inclinación al moverse, aplastar al caer y estirar al subir
  ctx.rotate((s.vx / MOVE) * 0.12);
  const rising = Math.min(Math.max(-s.vy / JUMP, 0), 1);
  const sq = s.squash;
  ctx.scale(1 + 0.2 * sq - 0.05 * rising, 1 - 0.2 * sq + 0.07 * rising);

  // Sombra al estar cerca del tablón
  if (sq > 0.2) {
    ctx.fillStyle = 'rgba(20,20,30,0.22)';
    ctx.beginPath(); ctx.ellipse(0, 0, SHEEP_W * 0.42, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  }

  const lx = -SHEEP_W / 2;
  const top = -SHEEP_H;

  // Brazos y orejas van detrás del cuerpo: su base queda tapada por la lana
  drawPart('armL', lx, top, s.arm);
  drawPart('armR', lx, top, -s.arm);
  const ear = Math.min(Math.max(s.ear, -0.7), 1.2); // hacia abajo se esconderían tras la cabeza
  drawPart('earL', lx, top, ear);
  drawPart('earR', lx, top, -ear);

  // Tenis: se encogen al subir, cuelgan al caer y se balancean al moverse
  const falling = Math.min(Math.max(s.vy / JUMP, 0), 1);
  const tuck = -5 * rising + 3 * falling;
  const swing = Math.abs(s.vx) > 40 ? Math.sin(time * 20) * 2.5 : 0;
  ctx.drawImage(img.footL, lx, -SHEEP_H + LEGS_TOP + tuck + swing, SHEEP_W, img.footL.naturalHeight * SPR_K);
  ctx.drawImage(img.footR, lx, -SHEEP_H + LEGS_TOP + tuck - swing, SHEEP_W, img.footR.naturalHeight * SPR_K);

  // Cuerpo
  ctx.drawImage(img.body, lx, top, SHEEP_W, img.body.naturalHeight * SPR_K);

  // Parpadeo
  const blink = Math.sin(time * 1.3) > 0.985;
  if (blink) {
    for (const [ex, ey] of EYES) {
      const x = lx + ex * SPR_K, y = top + ey * SPR_K;
      ctx.fillStyle = FACE;
      ctx.beginPath(); ctx.ellipse(x, y, 9.4 * SPR_K, 12 * SPR_K, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y - 3 * SPR_K, 7 * SPR_K, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBee(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.vx < 0 ? -1 : 1, 1);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  // Alas
  const flap = 0.5 + Math.abs(Math.sin(time * 30)) * 0.5;
  ctx.fillStyle = 'rgba(235,248,255,0.92)';
  ctx.beginPath(); ctx.ellipse(-3, -10, 5.5, 9 * flap, -0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(4, -9, 4.5, 7.5 * flap, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Aguijón
  ctx.fillStyle = OUTLINE;
  ctx.beginPath(); ctx.moveTo(-11, -1.5); ctx.lineTo(-17, 0.5); ctx.lineTo(-11, 2.5); ctx.fill();
  // Cuerpo
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#ffcc1a'; ctx.fillRect(-13, -10, 26, 20);
  ctx.fillStyle = '#ffe680'; ctx.fillRect(-13, -9, 26, 4);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(-6, -10, 3.5, 20); ctx.fillRect(0.5, -10, 3.5, 20);
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2); ctx.stroke();
  // Ojo grande
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(7, -2, 3.4, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = OUTLINE;
  ctx.beginPath(); ctx.arc(8, -1.5, 1.8, 0, Math.PI * 2); ctx.fill();
  // Antena
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(8, -7); ctx.quadraticCurveTo(10, -12, 13, -12); ctx.stroke();
  ctx.restore();
}

// Corazón para recuperar una vida: rojo con brillo, late y tiene un halo
function drawHeart(f) {
  const beat = 1 + Math.max(0, Math.sin(f.t * 6)) * 0.12;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.fillStyle = 'rgba(255, 220, 120, 0.35)';
  ctx.beginPath(); ctx.arc(0, 1, 19 + Math.sin(f.t * 3) * 2, 0, Math.PI * 2); ctx.fill();
  ctx.scale(beat, beat);
  const heartPath = () => {
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.bezierCurveTo(-4, 8, -14, 2, -14, -5);
    ctx.bezierCurveTo(-14, -11, -9, -14, -6, -14);
    ctx.bezierCurveTo(-3, -14, -1, -12, 0, -9);
    ctx.bezierCurveTo(1, -12, 3, -14, 6, -14);
    ctx.bezierCurveTo(9, -14, 14, -11, 14, -5);
    ctx.bezierCurveTo(14, 2, 4, 8, 0, 12);
    ctx.closePath();
  };
  heartPath();
  ctx.fillStyle = '#e3262b'; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath(); ctx.ellipse(-7, -7, 3.2, 2, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawThorn(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  // Hojas con espinas
  ctx.fillStyle = '#5aa83a';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(dir * 5, 7); ctx.lineTo(dir * 7, 9); ctx.lineTo(dir * 9, 4); ctx.lineTo(dir * 12, 5);
    ctx.lineTo(dir * 11, 1); ctx.lineTo(dir * 4, 3);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Cabezuela verde con espinas blancas
  ctx.fillStyle = '#6cbf45';
  ctx.beginPath(); ctx.ellipse(0, 0, 6, 6.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
  for (let a = Math.PI * 0.1; a < Math.PI * 1.9; a += Math.PI / 4) {
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6.5); ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10.5); ctx.stroke();
  }
  // Penacho morado
  ctx.fillStyle = '#b14fd0';
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-6, -4);
  for (let i = 0; i <= 6; i++) ctx.lineTo(-6 + i * 2, i % 2 ? -9 : -14 + Math.abs(i - 3));
  ctx.lineTo(6, -4);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSky();
  drawGround();

  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, -dpr * camY * scale);
  for (const b of bars) drawBar(b);
  for (const f of foes) (f.kind === 'bee' ? drawBee : f.kind === 'heart' ? drawHeart : drawThorn)(f);
  for (const p of parts) {
    ctx.globalAlpha = Math.max(p.life / p.max, 0);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawSheep(sheep);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (offX > 4) {
    ctx.fillStyle = 'rgba(15,20,40,0.25)';
    ctx.fillRect(0, 0, offX, H);
    ctx.fillRect(W - offX, 0, offX, H);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(offX, 0); ctx.lineTo(offX, H); ctx.moveTo(W - offX, 0); ctx.lineTo(W - offX, H); ctx.stroke();
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

recoverDraft();
renderRanking();
if (GLOBAL_ON) { loadWorld(); flushPending(); loadMe(playerInput.value); }
reset();
bestEl.textContent = best ? `Récord: ${best} m` : '';
requestAnimationFrame(loop);

// Sheepy Jumps — la oveja rebota sola sobre los tablones; tú la mueves a izquierda y derecha.
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
// Etapas del mundo (en metros)
const NIGHT_FROM_M = 800;    // de día hasta 800 m; de 800 a 1000 m se hace de noche
const SPACE_FROM_M = 1000;   // de 1000 a 2000 m: espacio exterior
const HEAVEN_FROM_M = 2000;  // desde 2000 m: el cielo y la ciudad de oro
const PARTY_FROM_M = 1000;   // a los 1000 m Sheepy se pone su traje de fiesta
const BONUS_HEARTS = 4; // solo el tablón de Jesús da el cuarto sendauro
// Progresión de obstáculos y premios (en metros)
const SAFE_M = 100;        // 0–99 m: sin obstáculos
const BEES_FROM_M = 201;   // 100–200 m: solo cardos; desde 201 m también abejas
const HEART_FROM_M = 350;  // billete Un Sendauro (devuelve una vida): desde 350 m…
const HEART_EVERY_M = 200; // …cada 200 m hay una oportunidad…
const HEART_CHANCE = 0.5;  // …con 50 % de probabilidad de que salga
const SHIELD_FROM_M = 20;  // escudo: 5 s sin recibir daño (frecuente, desde el inicio)
const SHIELD_TIME = 5;
const SPIKES_FROM_M = 300; // pinchos en los tablones (como los cardos)
const BATS_FROM_M = 450;   // murciélagos (como las abejas)
const HAT_FROM_M = 350;    // gorrito con hélice: impulsa a Sheepy 50 m (poco frecuente)
const HAT_BOOST_M = 50;
const HAT_SPEED = 1150;
const JESUS_FROM_M = 60;   // Jesús sobre un tablón (poco frecuente): no hace daño ni da premio, anima a Sheepy
const JESUS_H = 74;
const FLIP_FROM_M = 300;   // chancleta voladora: cruza la pantalla de lado a lado (poco frecuente)
const FLIP_WARN = 1.1;     // segundos de aviso antes de que entre
const STAR_FROM_M = 600;   // estrella fugaz: misma mecánica que la chancleta (poco frecuente)
const GLASSES_FROM_M = 150; // anteojos: distorsionan la vista un rato (poco frecuentes)
const GLASSES_TIME = 6;
const SPRING_M = 30;       // resorte en los tablones: impulsa 30 m (desde el inicio, frecuente)
const SPRING_CHANCE = 0.08;
const SPRING_SHIELD_CHANCE = 0.4; // 40 % de los resortes llevan un escudo flotando en su trayectoria
const SPRING_V = Math.sqrt(2 * GRAVITY * SPRING_M * PX_PER_M);

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
  shield: () => { tone('triangle', 400, 900, 0.18, 0.1); setTimeout(() => tone('sine', 900, 1200, 0.2, 0.08), 110); },
  whoosh: () => { tone('sawtooth', 200, 1100, 0.6, 0.05); tone('sine', 300, 1300, 0.6, 0.08); },
  spring: () => { tone('square', 160, 720, 0.28, 0.06); tone('sine', 220, 990, 0.32, 0.1); },
  alert: () => { tone('square', 880, 660, 0.12, 0.06); setTimeout(() => tone('square', 880, 660, 0.12, 0.06), 160); },
  cheer: () => { tone('sine', 523, 523, 0.12, 0.07); setTimeout(() => tone('sine', 659, 659, 0.12, 0.07), 110); setTimeout(() => tone('sine', 784, 784, 0.2, 0.07), 220); },
  wobble: () => { tone('sine', 500, 260, 0.35, 0.08); setTimeout(() => tone('sine', 420, 640, 0.35, 0.06), 180); },
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
  if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return; // el botón ya hace lo suyo
  if (!splash.hidden) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeSplash(); }
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
  // La partida solo empieza con el botón Jugar (ni Enter ni espacio la inician)
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
let skin = 'classic';
let shield, boost, nextShieldM, nextHatM, nextFlipM, nextJesusM, nextStarM, nextGlassesM, blurry;
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
  shield = 0;
  boost = null;
  nextShieldM = SHIELD_FROM_M + Math.random() * 40;
  nextHatM = HAT_FROM_M + Math.random() * 80;
  nextFlipM = FLIP_FROM_M + Math.random() * 80;
  nextJesusM = JESUS_FROM_M + Math.random() * 90;
  nextStarM = STAR_FROM_M + Math.random() * 80;
  nextGlassesM = GLASSES_FROM_M + Math.random() * 80;
  blurry = 0;
  skin = 'classic';
  sheepSay = null;
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
  let type = r < pMove ? 'moving' : r < pMove + pFrag ? 'fragile' : 'normal';
  // En el cielo (desde 2000 m) no hay tablones fijos: solo los que se mueven y los que se rompen
  if (-y / PX_PER_M >= HEAVEN_FROM_M) type = Math.random() < 0.3 ? 'fragile' : 'moving';
  const bar = { x, y, w, type, vx: 0, broken: false, fallV: 0, seed: Math.random() };
  if (type === 'moving') bar.vx = (40 + 70 * d) * (Math.random() < 0.5 ? -1 : 1);
  bars.push(bar);

  // Obstáculos: van apareciendo poco a poco y cada uno se vuelve más frecuente con la altura
  const ramp = (from, span) => Math.min(Math.max((m - from) / span, 0), 1);
  const thornD = ramp(SAFE_M, 300), beeD = ramp(BEES_FROM_M, 400);
  const spikeD = ramp(SPIKES_FROM_M, 400), batD = ramp(BATS_FROM_M, 400);

  // Premios sobre el tablón (como mucho uno por tablón y nunca en uno frágil)
  let prize = null;
  if (type !== 'fragile') {
    if (m >= nextHeartM) {
      nextHeartM += HEART_EVERY_M;
      if (Math.random() < HEART_CHANCE) prize = 'heart';
    }
    if (!prize && m >= HAT_FROM_M && m >= nextHatM && Math.random() < 0.03) { prize = 'hat'; nextHatM = m + 180 + Math.random() * 120; }
    else if (!prize && m >= SHIELD_FROM_M && m >= nextShieldM && Math.random() < 0.08) { prize = 'shield'; nextShieldM = m + 55 + Math.random() * 55; }
    else if (!prize && m >= GLASSES_FROM_M && m >= nextGlassesM && Math.random() < 0.035) { prize = 'glasses'; nextGlassesM = m + 180 + Math.random() * 170; }
  }
  if (prize) foes.push({ kind: prize, bar, off: w / 2, x: 0, y: 0, r: 16, t: Math.random() * 6 });
  // Jesús: de pie en un tablón normal y ancho, en un extremo para que Sheepy pueda caer a su lado
  if (!prize && (type === 'normal' || (m >= HEAVEN_FROM_M && type === 'moving')) && w >= 70 && m >= nextJesusM && Math.random() < 0.06) {
    nextJesusM = m + 230 + Math.random() * 200;
    bar.jesus = { kind: 'jesus', bar, off: Math.random() < 0.5 ? 20 : w - 20, x: 0, y: 0, r: 0, t: Math.random() * 6, say: '', sayT: 0 };
    foes.push(bar.jesus);
  }
  const occupied = !!prize || !!bar.jesus;

  // Voladores: abejas desde 201 m y murciélagos desde 450 m (uno por hueco como mucho)
  const flyer = (kind, dd, speed) => foes.push({
    kind, x: 20 + Math.random() * (GW - 40), baseY: y + gap / 2, y: y + gap / 2,
    vx: (speed + 70 * dd) * (Math.random() < 0.5 ? -1 : 1), t: Math.random() * 6, r: 13,
  });
  if (m >= BATS_FROM_M && Math.random() < 0.04 + 0.1 * batD) flyer('bat', batD, 60);
  else if (m >= BEES_FROM_M && Math.random() < 0.06 + 0.16 * beeD) flyer('bee', beeD, 50);

  // En el tablón: resortes desde el inicio, cardos desde 100 m y pinchos desde 300 m (uno por tablón)
  const off = Math.random() < 0.5 ? 16 : w - 16;
  if (!occupied && type !== 'fragile' && m > 8 && Math.random() < SPRING_CHANCE) {
    bar.spring = { kind: 'spring', bar, off, x: 0, y: 0, r: 0, squish: 0 };
    foes.push(bar.spring);
    // A veces hay un escudo flotando justo encima del resorte (entre 6 y 14 m),
    // para atraparlo en el salto y subir protegida
    if (m >= 20 && Math.random() < SPRING_SHIELD_CHANCE) {
      const sx = Math.min(Math.max(x + off, 24), GW - 24);
      const fy = y - (6 + Math.random() * 8) * PX_PER_M;
      foes.push({ kind: 'shield', bar: null, fx: sx, fy, x: sx, y: fy, r: 16, t: Math.random() * 6 });
      nextShieldM = Math.max(nextShieldM, m + 30); // que no salga otro escudo normal enseguida
    }
  } else if (!occupied && type === 'normal' && w > 70) {
    if (m >= SPIKES_FROM_M && Math.random() < 0.05 + 0.1 * spikeD) foes.push({ kind: 'spike', bar, off, x: 0, y: 0, r: 12 });
    else if (m >= SAFE_M && Math.random() < 0.08 + 0.14 * thornD) foes.push({ kind: 'thorn', bar, off, x: 0, y: 0, r: 12 });
  }
  topY = y;
}

function updateHud() {
  metersEl.textContent = `${meters()} m`;
  bestHudEl.textContent = best ? `Récord ${best} m` : '';
  // Vidas: un billete "Un Sendauro" por vida; las perdidas se ven grises.
  // El cuarto (solo con Jesús) aparece aparte, con resplandor dorado.
  const slots = Math.max(MAX_HEARTS, hearts);
  while (heartsEl.children.length < slots) {
    const im = document.createElement('img');
    im.src = 'sprites/billete.webp'; im.alt = ''; im.width = 200; im.height = 100;
    if (heartsEl.children.length >= MAX_HEARTS) im.className = 'bonus';
    heartsEl.appendChild(im);
  }
  while (heartsEl.children.length > slots) heartsEl.lastElementChild.remove();
  [...heartsEl.children].forEach((im, i) => im.classList.toggle('lost', i >= hearts));
  heartsEl.setAttribute('aria-label', `Vidas: ${hearts} de ${slots}`);
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
const resultEl = $('result');
const tabsPanel = document.querySelector('.tabs-panel');
// Pestañas: Ranking / Cómo jugar
const TAB_IDS = ['ranking', 'howto'];
function selectTab(id, focus) {
  for (const t of TAB_IDS) {
    const btn = $('tabBtn-' + t), on = t === id;
    btn.setAttribute('aria-selected', on);
    btn.tabIndex = on ? 0 : -1;
    $('tab-' + t).hidden = !on;
    if (on && focus) btn.focus();
  }
}
for (const t of TAB_IDS) {
  const btn = $('tabBtn-' + t);
  btn.addEventListener('click', () => selectTab(t));
  btn.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault(); e.stopPropagation();
    const i = (TAB_IDS.indexOf(t) + (e.key === 'ArrowRight' ? 1 : TAB_IDS.length - 1)) % TAB_IDS.length;
    selectTab(TAB_IDS[i], true);
  });
}
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
  else playerInput.blur();
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

// Frases al perder, según lo que hizo caer a Sheepy (sin repetir la última)
const LOSS_PHRASES = {
  fall: ['¡Uy, se cayó!', '¡Sheepy miró hacia abajo!', '¡Faltó un tablón!', '¡Directo al pasto!', '¡Ese salto se quedó corto!'],
  bee: ['¡Bzzz! Ganaron las abejas', '¡Auch, un aguijón!', '¡Esa abeja no quería compartir!', '¡Picadura en la lana!'],
  bat: ['¡Un murciélago la asustó!', '¡Mordisco nocturno!', '¡Ese murciélago no veía nada!', '¡Ataque desde la oscuridad!'],
  thorn: ['¡Cardos y lana no combinan!', '¡Pinchazo de cardo!', '¡Aterrizó en un cardo!', '¡Ese cardo estaba de malas!'],
  spike: ['¡Auch, pinchos!', '¡Esos pinchos no eran de adorno!', '¡Pinchada sin piedad!', '¡Mala idea pisar ahí!'],
  star: ['¡Te alcanzó la estrella fugaz!', '¡Pide un deseo… la próxima vez!', '¡Qué estrellazo!', '¡Brilló demasiado cerca!'],
  flip: ['¡Chanclazo!', '¡La chancleta voladora no perdona!', '¡Llegó la chancla!', '¡Nadie esquiva la chancla!'],
  hit: ['¡Ay, ay, ay!'],
};
let lastPhrase = '';
function lossPhrase(reason) {
  const list = LOSS_PHRASES[reason] || LOSS_PHRASES.hit;
  const options = list.length > 1 ? list.filter((t) => t !== lastPhrase) : list;
  lastPhrase = options[Math.floor(Math.random() * options.length)];
  return lastPhrase;
}

function gameOver(reason) {
  mode = 'over';
  blurry = 0;
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
  resultEl.hidden = false;
  selectTab('ranking');
  tabsPanel.classList.add('only-ranking'); // tras perder solo se muestra el ranking
  renderRanking();
  titleEl.textContent = lossPhrase(reason);
  messageEl.innerHTML = `Subiste <strong>${m} metros</strong>`;
  bestEl.textContent = isRecord && m > 0 ? '¡Nuevo récord!' : best ? `Récord: ${best} m` : '';
  playBtn.textContent = 'Jugar otra vez';
  overlay.classList.remove('hidden');
  updateHud();
}

function hurt(cause) {
  hearts--;
  inv = 1.6;
  sheep.vy = Math.min(sheep.vy, -JUMP * 0.55);
  puff(sheep.x, sheep.y - SHEEP_H * 0.5, '#ffd23f', 10, 180);
  sfx.ouch();
  navigator.vibrate?.(120);
  updateHud();
  if (hearts <= 0) gameOver(cause || 'hit');
}

// ---------- Chancleta voladora ----------
let sheepSay = null; // globo de diálogo que sale de Sheepy: { text, t, dur }
const SAY_TIME = 2.4;
// Cruzan la pantalla de lado a lado con aviso: chancleta voladora y estrella fugaz
const CROSSERS = new Set(['flip', 'star']);
function spawnCrosser(kind) {
  const dir = Math.random() < 0.5 ? 1 : -1;
  const sy = Math.min(Math.max(sheep.y - camY - 30 - Math.random() * 60, 140), GH - 220);
  const k = Math.min(meters() / 2000, 1);
  const spd = kind === 'star' ? 300 + k * 120 : 230 + k * 120;
  const vsy = kind === 'star' ? 40 + Math.random() * 40 : 0;   // la estrella cae un poco en diagonal
  foes.push({ kind, x: dir > 0 ? -45 : GW + 45, y: camY + sy, sy, vsy, vx: dir * spd, warn: FLIP_WARN, t: 0, r: kind === 'star' ? 14 : 15 });
  showAnnounce(kind === 'star' ? '¡Una Estrella Fugaz!' : '¡Una Chancleta Voladora!');
  sfx.alert();
}
function spawnFlip() { spawnCrosser('flip'); }
function showAnnounce(text, color) {
  sheepSay = { text, t: SAY_TIME, dur: SAY_TIME, color };
  speak(text.replace(/[¡!]/g, ''));
}
// Voz del anuncio con la síntesis de voz del navegador (sin archivos de audio)
let voiceEs = null;
function pickVoice() {
  const vs = window.speechSynthesis?.getVoices?.() || [];
  voiceEs = vs.find((v) => /^es[-_](419|MX|US|CO)/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }
function speak(text) {
  if (!soundOn || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voiceEs?.lang || 'es-ES';
    if (voiceEs) u.voice = voiceEs;
    u.rate = 1.05; u.pitch = 1.25; u.volume = 1;
    speechSynthesis.speak(u);
  } catch (err) { console.warn('Sin voz:', err); }
}

// ---------- Jesús: frases de ánimo ----------
const CHEERS = [
  '¡Tú puedes, Sheepy!',
  '¡Sigue saltando, no te rindas!',
  '¡Estoy contigo en cada salto!',
  '¡Lo estás haciendo muy bien!',
  '¡No tengas miedo, sigue subiendo!',
  '¡Eres más fuerte de lo que crees!',
  '¡Ánimo, llega a lo más alto!',
  '¡Cada salto cuenta, sigue adelante!',
  '¡Confía y sigue saltando!',
  '¡Qué bien saltas, Sheepy!',
];
let lastCheer = '';
function cheer(f) {
  if (!f.say) {
    const opts = CHEERS.filter((c) => c !== lastCheer);
    f.say = lastCheer = opts[Math.floor(Math.random() * opts.length)];
    sfx.cheer();
    // Regalo: un sendauro extra (aunque ya tenga 3; máximo 4)
    if (hearts < BONUS_HEARTS) {
      hearts++;
      updateHud();
      heartsEl.classList.remove('gain'); void heartsEl.offsetWidth; heartsEl.classList.add('gain');
    }
    puff(f.x, f.y - JESUS_H * 0.6, '#ffd23f', 14, 170);
    puff(f.x, f.y - JESUS_H * 0.6, '#ffffff', 8, 120);
  }
  f.sayT = 3.5;
}

const PRIZES = new Set(['heart', 'shield', 'hat', 'glasses']);
function collectPrize(f) {
  f.taken = true;
  puff(f.x, f.y, '#ffffff', 6, 110);
  if (f.kind === 'heart') {
    if (hearts < MAX_HEARTS) hearts++;
    puff(f.x, f.y, '#5bc8f5', 10, 150);
    sfx.heal();
    updateHud();
    heartsEl.classList.remove('gain'); void heartsEl.offsetWidth; heartsEl.classList.add('gain');
  } else if (f.kind === 'shield') {
    shield = SHIELD_TIME;
    puff(f.x, f.y, '#7fd3ff', 12, 160);
    sfx.shield();
  } else if (f.kind === 'glasses') {
    blurry = GLASSES_TIME;
    puff(f.x, f.y, '#c9b8ff', 12, 150);
    sfx.wobble();
    showAnnounce('¡Uy, el ojólogo!', '#6b4fd8');
  } else if (f.kind === 'hat') {
    boost = { toY: Math.min(sheep.y, f.y) - HAT_BOOST_M * PX_PER_M, t: 0 };
    puff(f.x, f.y, '#ffc33e', 12, 160);
    sfx.whoosh();
  }
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
  if (boost) {
    // Gorrito con hélice: sube sin gravedad hasta completar los 50 m
    sheep.vy = -HAT_SPEED;
    sheep.y += sheep.vy * dt;
    boost.t += dt;
    if (Math.random() < dt * 30) puff(sheep.x + (Math.random() - 0.5) * 20, sheep.y + 4, '#ffffff', 1, 60);
    if (sheep.y <= boost.toY) { sheep.y = boost.toY; sheep.vy = -JUMP * 0.55; boost = null; inv = Math.max(inv, 0.6); }
  } else {
    sheep.vy += GRAVITY * dt;
    sheep.y += sheep.vy * dt;
  }
  sheep.squash = Math.max(0, sheep.squash - dt * 5);
  animateLimbs(sheep, dt);
  if (inv > 0) inv -= dt;
  if (shield > 0) shield = Math.max(0, shield - dt);
  if (sheepSay && (sheepSay.t -= dt) <= 0) sheepSay = null;
  if (blurry > 0) blurry = Math.max(0, blurry - dt);

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
        if (b.jesus && playing) cheer(b.jesus);
        const sp = b.spring;
        if (sp && Math.abs(sheep.x - (b.x + sp.off)) < 13 + SHEEP_W * 0.3) {
          // Resorte: salto gigante de 30 m
          sheep.y = b.y - 12;
          sheep.vy = -SPRING_V;
          sp.squish = 1;
          sheep.earV -= 10; sheep.armV -= 8;
          puff(b.x + sp.off, b.y - 10, '#ffc33e', 8, 140);
          sfx.spring();
        } else if (b.type === 'fragile') {
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
    } else if (f.kind === 'bat') {
      f.t += dt;
      f.x += f.vx * dt;
      if (f.x < 18) { f.x = 18; f.vx *= -1; }
      if (f.x > GW - 18) { f.x = GW - 18; f.vx *= -1; }
      f.y = f.baseY + Math.sin(f.t * 4) * 9 + Math.sin(f.t * 1.7) * 6;
    } else if (CROSSERS.has(f.kind)) {
      f.y = camY + f.sy;
      if (f.warn > 0) { f.warn -= dt; continue; }   // aún avisando: no se mueve ni hace daño
      f.t += dt;
      f.x += f.vx * dt;
      f.sy += (f.vsy || 0) * dt;
      if ((f.vx > 0 && f.x > GW + 60) || (f.vx < 0 && f.x < -60)) { f.gone = true; continue; }
    } else if (f.kind === 'jesus') {
      f.t += dt;
      f.x = f.bar.x + f.off;
      f.y = f.bar.y;
      if (f.sayT > 0) f.sayT -= dt;
      continue;
    } else if (f.kind === 'spring') {
      f.x = f.bar.x + f.off;
      f.y = f.bar.y;
      f.squish = Math.max(0, f.squish - dt * 3);
      continue;
    } else if (PRIZES.has(f.kind)) {
      f.t += dt;
      if (f.bar) { f.x = f.bar.x + f.off; f.y = f.bar.y - 34 + Math.sin(f.t * 3) * 4; }
      else { f.x = f.fx; f.y = f.fy + Math.sin(f.t * 3) * 4; }   // flotando sobre un resorte
      if (playing && !f.taken) {
        const dx = f.x - sheep.x, dy = f.y - (sheep.y - SHEEP_H * 0.5);
        if (dx * dx + dy * dy < (f.r + SHEEP_W * 0.45) ** 2) collectPrize(f);
      }
      continue;
    } else {
      f.x = f.bar.x + f.off;
      f.y = f.bar.y - 10;
    }
    if (playing && inv <= 0 && shield <= 0 && !boost) {
      const dx = f.x - sheep.x, dy = f.y - (sheep.y - SHEEP_H * 0.5);
      if (dx * dx + dy * dy < (f.r + SHEEP_W * 0.36) ** 2) { hurt(f.kind); if (mode !== 'play') return; }
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

  // A los 1000 m Sheepy se pone su traje de fiesta
  if (skin === 'classic' && meters() >= PARTY_FROM_M) {
    skin = 'party';
    for (const col of ['#ff4fb8', '#ffe14d', '#4fe36b', '#3fc4ff', '#b35cff']) puff(sheep.x, sheep.y - SHEEP_H * 0.5, col, 5, 200);
    sfx.record();
  }

  // Chancleta voladora: de vez en cuando cruza la pantalla con aviso y anuncio
  const crossing = foes.some((f) => CROSSERS.has(f.kind));
  if (meters() >= nextFlipM && !boost && !crossing) {
    nextFlipM = meters() + 170 + Math.random() * 160;
    spawnCrosser('flip');
  } else if (meters() >= nextStarM && !boost && !crossing) {
    nextStarM = meters() + 200 + Math.random() * 200;
    spawnCrosser('star');
  }

  // Generar y limpiar
  while (topY > camY - 200) genBar();
  const bottom = camY + GH + 250;
  bars = bars.filter((b) => b.y < bottom);
  foes = foes.filter((f) => !f.taken && !f.gone && (f.bar ? bars.includes(f.bar) : f.y < bottom));

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
  bill: 'sprites/billete.webp',
  jesus: 'sprites/jesus.webp',
  party: 'sprites/oveja-fiesta.webp',
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

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
// Altura (m) a la que mira la cámara, más o menos la de Sheepy
function viewM() { return Math.max(0, (-camY - GH * 0.58) / PX_PER_M); }
function skyT() { return clamp01((viewM() - NIGHT_FROM_M) / (SPACE_FROM_M - NIGHT_FROM_M)); }   // día → noche
function spaceT() { return clamp01((viewM() - SPACE_FROM_M) / 120); }                           // noche → espacio
function heavenT() { return clamp01((viewM() - HEAVEN_FROM_M) / 150); }                         // espacio → cielo
const lerpC = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

function drawSky() {
  const t = skyT(), sp = spaceT(), hv = heavenT();
  // Degradado: día/atardecer/noche → espacio → cielo dorado
  let top = mix3(PAL.skyTop, t), bot = mix3(PAL.skyBottom, t);
  top = lerpC(top, hexRgb('070a26'), sp); bot = lerpC(bot, hexRgb('2a1a5e'), sp);
  top = lerpC(top, hexRgb('fff6dc'), hv); bot = lerpC(bot, hexRgb('ffc94f'), hv);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(top));
  g.addColorStop(1, rgb(bot));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Estrellas: aparecen al anochecer, son muchas en el espacio y se apagan en el cielo
  const starA = Math.max(clamp01((t - 0.45) * 1.8) * 0.9, sp) * (1 - hv);
  if (starA > 0.01) {
    for (const st of stars) {
      const y = ((st.y * H - camY * scale * 0.05) % H + H) % H;
      const tw = 0.65 + 0.35 * Math.sin(time * 2.5 + st.x * 40);
      ctx.fillStyle = `rgba(255,250,220,${starA * tw})`;
      drawSparkle(st.x * W, y, st.r * 1.6);
    }
    if (sp > 0) {
      for (const st of spaceStars) {
        const y = ((st.y * H - camY * scale * st.p) % H + H) % H;
        ctx.fillStyle = `rgba(${st.c},${sp * (1 - hv) * (0.5 + 0.5 * Math.sin(time * 3 + st.x * 50))})`;
        ctx.beginPath(); ctx.arc(st.x * W, y, st.r * Math.max(scale, 0.8), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // Sol de caricatura (solo cerca del suelo)
  const rise = -camY - (GH - 90);
  const sunY = H * 0.28 + rise * scale * 0.08;
  if (sunY < H + 80) {
    const sx = W * 0.78, r = 30 * Math.max(scale, 0.8);
    ctx.fillStyle = 'rgba(255,230,120,0.25)';
    ctx.beginPath(); ctx.arc(sx, sunY, r * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = 'rgba(29,26,26,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx, sunY, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(sx - r * 0.35, sunY - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fill();
  }

  // Luna al anochecer
  const moonA = clamp01((t - 0.3) * 2) * (1 - sp);
  if (moonA > 0.01) drawMoon(W * 0.24, H * 0.2, 26 * Math.max(scale, 0.8), moonA);

  // Espacio exterior: planetas, galaxias, cometas…
  if (sp > 0.01 && hv < 0.99) drawSpace(sp * (1 - hv));

  // Cielo: rayos de luz y la ciudad de oro al fondo
  if (hv > 0.01) drawHeaven(hv);

  // Nubes: de día y en el cielo (no en el espacio)
  const cloudA = Math.max(1 - sp, hv);
  if (cloudA > 0.01) {
    ctx.save();
    ctx.globalAlpha = cloudA;
    for (const c of clouds) {
      c.x += (c.v / W) * (1 / 60);
      if (c.x > 1.3) c.x = -0.3;
      const span = H + 200;
      const y = ((c.y * span - camY * scale * 0.25) % span + span) % span - 100;
      drawCloud(c.x * W, y, c.s * Math.max(scale, 0.8), hv > 0 ? 0 : t, hv);
    }
    ctx.restore();
  }

  if (viewM() < 700) drawMountains(rise, t);
}

// Luna creciente
function drawMoon(x, y, r, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(255,245,200,0.18)';
  ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
  ctx.fillStyle = '#fff3c4'; ctx.fill();
  ctx.strokeStyle = 'rgba(29,26,26,0.55)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = 'rgba(214,196,140,0.6)';
  for (const [dx, dy, rr] of [[-0.3, -0.2, 0.18], [0.25, 0.25, 0.14], [0.1, -0.4, 0.1]]) {
    ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- Espacio exterior (1000–2000 m) ----------
const spaceStars = Array.from({ length: 90 }, () => ({
  x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.4, p: 0.03 + Math.random() * 0.06,
  c: ['255,255,255', '200,220,255', '255,230,200', '255,200,240'][Math.floor(Math.random() * 4)],
}));
// Objetos colocados a lo largo del viaje: altura (m), posición x (0..1), tipo y tamaño
const SPACE_KINDS = ['ringed', 'red', 'earth', 'galaxy', 'gas', 'moonrock', 'comet', 'asteroids', 'nebula', 'satellite'];
const spaceObjs = [];
for (let m = SPACE_FROM_M + 30, i = 0; m < HEAVEN_FROM_M + 40; m += 42 + (i * 37) % 30, i++) {
  spaceObjs.push({ m, x: [0.18, 0.78, 0.3, 0.7, 0.15, 0.85, 0.5][i % 7], kind: SPACE_KINDS[i % SPACE_KINDS.length], s: 0.8 + ((i * 53) % 10) / 20, rot: (i * 1.7) % 6.28 });
}
const SPACE_PAR = 0.22; // se mueven más despacio que los tablones (están lejos)
function drawSpace(a) {
  ctx.save();
  ctx.globalAlpha = a;
  // Nebulosas suaves de fondo
  for (const [fx, fy, rr, col] of [[0.2, 0.3, 0.55, '160,90,255'], [0.85, 0.7, 0.5, '255,90,190'], [0.5, 0.05, 0.4, '60,170,255']]) {
    const yy = ((fy * H - camY * scale * 0.02) % (H * 1.4) + H * 1.4) % (H * 1.4) - H * 0.2;
    const gr = ctx.createRadialGradient(fx * W, yy, 0, fx * W, yy, rr * W);
    gr.addColorStop(0, `rgba(${col},0.22)`); gr.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  const cm = (-camY - GH * 0.5) / PX_PER_M;
  const k = Math.max(scale, 0.8);
  for (const o of spaceObjs) {
    const y = H * 0.5 - (o.m - cm) * PX_PER_M * scale * SPACE_PAR;
    if (y < -160 * k || y > H + 160 * k) continue;
    drawSpaceObj(o, o.x * W, y, o.s * k * 1.35);
  }
  ctx.restore();
}
function planet(x, y, r, base, light, dark) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = base; ctx.fill();
  ctx.clip();
  ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.35, r * 1.05, 0, Math.PI * 2); ctx.arc(x - r * 0.15, y - r * 0.15, r * 1.02, 0, Math.PI * 2, true); ctx.fill('evenodd');
  ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(x - r * 0.4, y - r * 0.45, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}
function drawSpaceObj(o, x, y, k) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (o.kind) {
    case 'ringed': {
      const r = 34 * k;
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.35);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.9, r * 0.55, 0, Math.PI, Math.PI * 2); ctx.fillStyle = '#ffd98a'; ctx.stroke();
      ctx.restore();
      planet(x, y, r, '#f2a65a', 'rgba(255,255,255,0.5)', 'rgba(150,70,20,0.35)');
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = 'rgba(160,80,30,0.45)'; ctx.lineWidth = 4 * k;
      for (const d of [-0.4, 0.05, 0.45]) { ctx.beginPath(); ctx.moveTo(x - r, y + d * r - 4); ctx.quadraticCurveTo(x, y + d * r + 6, x + r, y + d * r - 8); ctx.stroke(); }
      ctx.restore();
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.35);
      ctx.lineWidth = 7 * k; ctx.strokeStyle = OUTLINE;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.9, r * 0.55, 0, 0, Math.PI); ctx.stroke();
      ctx.lineWidth = 4 * k; ctx.strokeStyle = '#ffe1a0';
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.9, r * 0.55, 0, 0, Math.PI); ctx.stroke();
      ctx.restore();
      break;
    }
    case 'red': {
      const r = 26 * k;
      planet(x, y, r, '#e8603c', 'rgba(255,220,200,0.55)', 'rgba(120,30,10,0.35)');
      ctx.fillStyle = 'rgba(140,40,20,0.5)';
      for (const [dx, dy, rr] of [[-0.3, 0.1, 0.18], [0.3, -0.25, 0.12], [0.1, 0.45, 0.1]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'earth': {
      const r = 30 * k;
      planet(x, y, r, '#3f8fd0', 'rgba(255,255,255,0.6)', 'rgba(10,40,90,0.35)');
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#5fbf5a';
      ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.1, r * 0.35, r * 0.5, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + r * 0.45, y + r * 0.35, r * 0.3, r * 0.22, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'gas': {
      const r = 40 * k;
      planet(x, y, r, '#9b7bff', 'rgba(255,255,255,0.45)', 'rgba(50,20,120,0.35)');
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = 'rgba(255,170,230,0.45)';
      for (const d of [-0.55, -0.1, 0.35]) ctx.fillRect(x - r, y + d * r, r * 2, r * 0.16);
      ctx.fillStyle = 'rgba(255,120,120,0.7)'; ctx.beginPath(); ctx.ellipse(x + r * 0.35, y + r * 0.15, r * 0.18, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'moonrock': {
      const r = 18 * k;
      planet(x, y, r, '#c9c4d6', 'rgba(255,255,255,0.6)', 'rgba(60,50,90,0.3)');
      ctx.fillStyle = 'rgba(110,100,140,0.55)';
      for (const [dx, dy, rr] of [[-0.35, -0.1, 0.22], [0.3, 0.3, 0.16], [0.25, -0.4, 0.12]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'galaxy': {
      ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot + time * 0.05);
      const R = 46 * k;
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, 'rgba(255,240,200,0.95)'); gr.addColorStop(0.25, 'rgba(255,170,230,0.5)'); gr.addColorStop(1, 'rgba(120,90,255,0)');
      ctx.fillStyle = gr; ctx.scale(1, 0.55); ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,255,0.6)'; ctx.lineWidth = 3;
      for (const off of [0, Math.PI]) {
        ctx.beginPath();
        for (let a = 0; a < 4.2; a += 0.15) { const rr = 5 + a * 9 * k; ctx.lineTo(Math.cos(a + off) * rr, Math.sin(a + off) * rr); }
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'comet': {
      ctx.save(); ctx.translate(x + Math.sin(time * 0.3 + o.rot) * 20, y);
      const gr = ctx.createLinearGradient(0, 0, 90 * k, -40 * k);
      gr.addColorStop(0, 'rgba(160,230,255,0.9)'); gr.addColorStop(1, 'rgba(160,230,255,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-6 * k, -6 * k); ctx.lineTo(90 * k, -44 * k); ctx.lineTo(96 * k, -30 * k); ctx.lineTo(6 * k, 6 * k); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8fbff'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 8 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
      break;
    }
    case 'asteroids': {
      ctx.fillStyle = '#8d8496'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
      for (const [dx, dy, rr] of [[-30, 0, 9], [0, -12, 13], [26, 8, 7], [10, 20, 5]]) {
        ctx.save(); ctx.translate(x + dx * k, y + dy * k); ctx.rotate(time * 0.4 + dx);
        ctx.beginPath();
        for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, q = rr * k * (0.75 + ((i * 37 + dx) % 5) / 10); ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'nebula': {
      for (const [dx, dy, rr, col] of [[0, 0, 60, '255,120,200'], [30, 15, 45, '120,160,255'], [-25, 20, 40, '180,110,255']]) {
        const gr = ctx.createRadialGradient(x + dx * k, y + dy * k, 0, x + dx * k, y + dy * k, rr * k);
        gr.addColorStop(0, `rgba(${col},0.35)`); gr.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x + dx * k, y + dy * k, rr * k, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'satellite': {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(time * 0.6 + o.rot) * 0.3);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2;
      ctx.fillStyle = '#3f8fd0';
      for (const d of [-1, 1]) { ctx.fillRect(d * 14 * k - (d < 0 ? 22 * k : 0), -7 * k, 22 * k, 14 * k); ctx.strokeRect(d * 14 * k - (d < 0 ? 22 * k : 0), -7 * k, 22 * k, 14 * k); }
      ctx.fillStyle = '#d7dbe3'; ctx.beginPath(); ctx.roundRect(-12 * k, -10 * k, 24 * k, 20 * k, 4); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -10 * k); ctx.lineTo(0, -20 * k); ctx.stroke();
      ctx.fillStyle = '#ff7751'; ctx.beginPath(); ctx.arc(0, -21 * k, 3 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
      break;
    }
  }
}

// ---------- El cielo y la ciudad de oro (desde 2000 m) ----------
const CITY = (() => {
  // Edificios en coordenadas relativas (x y ancho en fracción de pantalla; alto en fracción de la altura de la ciudad)
  const b = [];
  const plan = [
    [0.00, 0.10, 0.55, 'tower'], [0.08, 0.12, 0.75, 'dome'], [0.19, 0.07, 0.95, 'spire'], [0.25, 0.13, 0.62, 'dome'],
    [0.36, 0.28, 0.82, 'gate'], [0.62, 0.12, 0.66, 'dome'], [0.73, 0.07, 1.0, 'spire'], [0.79, 0.12, 0.78, 'dome'], [0.9, 0.12, 0.58, 'tower'],
  ];
  for (const [x, w, h, kind] of plan) b.push({ x, w, h, kind });
  return b;
})();
function drawHeaven(hv) {
  ctx.save();
  // Rayos de luz desde arriba
  ctx.globalAlpha = 0.35 * hv;
  ctx.translate(W / 2, -H * 0.1);
  ctx.rotate(Math.sin(time * 0.15) * 0.1);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 12);
    const gr = ctx.createLinearGradient(0, 0, 0, H * 1.3);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(-W * 0.04, 0); ctx.lineTo(W * 0.04, 0); ctx.lineTo(W * 0.16, H * 1.3); ctx.lineTo(-W * 0.16, H * 1.3); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // Brillitos dorados flotando
  ctx.save();
  ctx.globalAlpha = hv;
  for (const st of stars) {
    const y = ((st.y * H - camY * scale * 0.08 - time * 12) % H + H) % H;
    ctx.fillStyle = `rgba(255,215,90,${0.5 + 0.5 * Math.sin(time * 2 + st.x * 30)})`;
    drawSparkle(st.x * W, y, st.r * 2);
  }
  ctx.restore();

  drawGoldenCity(hv);
}
function drawGoldenCity(hv) {
  const ch = Math.min(H * 0.42, 340 * Math.max(scale, 0.8));       // alto de la ciudad
  const baseY = H + (1 - hv) * ch * 1.1;                            // sube desde abajo al llegar
  const ox = 0;
  ctx.save();
  ctx.lineJoin = 'round';
  // Resplandor detrás
  const glow = ctx.createRadialGradient(W / 2, baseY - ch * 0.5, 0, W / 2, baseY - ch * 0.5, W * 0.8);
  glow.addColorStop(0, 'rgba(255,240,180,0.8)'); glow.addColorStop(1, 'rgba(255,240,180,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  const gold = '#f3c13f', goldL = '#ffe9a3', goldD = '#c8901a', line = '#7a5310';
  ctx.strokeStyle = line; ctx.lineWidth = 3;
  for (const b of CITY) {
    const x = ox + b.x * W, w = b.w * W, h = b.h * ch, top = baseY - h;
    // Cuerpo
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, goldL); g.addColorStop(0.45, gold); g.addColorStop(1, goldD);
    ctx.fillStyle = g;
    if (b.kind === 'gate') {
      ctx.beginPath();
      ctx.moveTo(x, baseY + 4); ctx.lineTo(x, top + h * 0.25); ctx.lineTo(x + w * 0.5, top); ctx.lineTo(x + w, top + h * 0.25); ctx.lineTo(x + w, baseY + 4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Puerta de perla en arco
      ctx.fillStyle = '#fff8ee';
      ctx.beginPath(); ctx.moveTo(x + w * 0.3, baseY + 4); ctx.lineTo(x + w * 0.3, top + h * 0.55); ctx.arc(x + w * 0.5, top + h * 0.55, w * 0.2, Math.PI, 0); ctx.lineTo(x + w * 0.7, baseY + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,215,120,0.6)';
      ctx.beginPath(); ctx.arc(x + w * 0.5, top + h * 0.55, w * 0.12, Math.PI, 0); ctx.fill();
      // Columnas
      ctx.strokeStyle = 'rgba(122,83,16,0.6)'; ctx.lineWidth = 2;
      for (const f of [0.12, 0.2, 0.8, 0.88]) { ctx.beginPath(); ctx.moveTo(x + w * f, top + h * 0.35); ctx.lineTo(x + w * f, baseY); ctx.stroke(); }
      ctx.strokeStyle = line; ctx.lineWidth = 3;
      continue;
    }
    ctx.beginPath(); ctx.rect(x, top, w, h + 6); ctx.fill(); ctx.stroke();
    // Techos
    ctx.fillStyle = g;
    if (b.kind === 'dome') {
      ctx.beginPath(); ctx.arc(x + w / 2, top, w * 0.5, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w / 2, top - w * 0.5); ctx.lineTo(x + w / 2, top - w * 0.75); ctx.stroke();
      ctx.fillStyle = '#fff8ee'; ctx.beginPath(); ctx.arc(x + w / 2, top - w * 0.78, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (b.kind === 'spire') {
      ctx.beginPath(); ctx.moveTo(x - 2, top); ctx.lineTo(x + w / 2, top - w * 1.6); ctx.lineTo(x + w + 2, top); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      const n = 4, cw = w / (n * 2 - 1);
      for (let i = 0; i < n; i++) { ctx.rect(x + i * cw * 2, top - cw, cw, cw); }
      ctx.fill(); ctx.stroke();
    }
    // Ventanas de luz
    ctx.fillStyle = 'rgba(255,252,235,0.95)';
    const cols = Math.max(1, Math.floor(w / 16)), rows = Math.max(1, Math.floor(h / 26));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const wx = x + (c + 0.5) * (w / cols) - 3, wy = top + 12 + r * 26;
      if (wy + 12 > baseY) continue;
      ctx.beginPath(); ctx.moveTo(wx, wy + 12); ctx.lineTo(wx, wy + 4); ctx.arc(wx + 3, wy + 4, 3, Math.PI, 0); ctx.lineTo(wx + 6, wy + 12); ctx.closePath(); ctx.fill();
    }
  }
  // Neblina luminosa: la ciudad queda al fondo y los tablones de oro se distinguen bien
  const haze = ctx.createLinearGradient(0, baseY - ch * 1.25, 0, baseY - ch * 0.6);
  haze.addColorStop(0, 'rgba(255,248,226,0)'); haze.addColorStop(1, 'rgba(255,248,226,0.42)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, baseY - ch * 1.25, W, ch * 1.35);
  // Muralla y nubes al pie
  ctx.fillStyle = '#e9b23a'; ctx.strokeStyle = line;
  ctx.beginPath(); ctx.rect(-10, baseY - ch * 0.12, W + 20, ch * 0.2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffe9a3';
  for (let x = 0; x < W; x += 22) { ctx.beginPath(); ctx.rect(x, baseY - ch * 0.12 - 7, 11, 7); ctx.fill(); ctx.stroke(); }
  for (let i = 0; i < 7; i++) {
    const cx = (i / 6) * W, cy = baseY - ch * 0.02;
    cloudPath(cx, cy, 1.2 * Math.max(scale, 0.8));
    ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  ctx.restore();
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
function drawCloud(x, y, s, t, hv = 0) {
  // Contorno: se dibuja el trazo grueso y luego el relleno encima
  cloudPath(x, y, s);
  ctx.strokeStyle = rgb(lerpC(mix('6d8bb0', '2a2550', t), hexRgb('d8a640'), hv), 0.9);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = rgb(mix('ffffff', '8c88b8', t));
  ctx.fill();
  // Sombra inferior
  ctx.save();
  cloudPath(x, y, s); ctx.clip();
  ctx.fillStyle = rgb(lerpC(mix('d9ecf7', '6e6aa0', t), hexRgb('ffe7a6'), hv));
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

// Desde 2000 m: tablones de oro y los que se rompen, de cristal
const GOLD = {
  normal: { fill: '#f2bd3a', light: '#fff0a8', dark: '#b07b0c' },
  moving: { fill: '#ffd24d', light: '#fffbe0', dark: '#c28a00' },
};
const CRYSTAL = { fill: 'rgba(196,236,255,0.6)', light: 'rgba(255,255,255,0.95)', dark: 'rgba(110,170,215,0.85)' };
// Entre 1000 y 2000 m: plataformas espaciales de metal con neón y propulsores; las que se rompen son rocas de asteroide
function drawSpaceBar(b) {
  const h = 13, seed = b.seed || 0.5;
  ctx.save();
  ctx.lineJoin = 'round';
  if (b.broken) { ctx.globalAlpha = 0.8; ctx.translate(b.x + b.w / 2, b.y); ctx.rotate(0.2); ctx.translate(-(b.x + b.w / 2), -b.y); }
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
  if (b.type === 'fragile') {
    // Roca de asteroide
    ctx.fillStyle = '#8a7f8f';
    ctx.beginPath();
    ctx.moveTo(b.x + 3, b.y + 2);
    const n = Math.max(4, Math.round(b.w / 14));
    for (let i = 1; i < n; i++) ctx.lineTo(b.x + (b.w * i) / n, b.y + (i % 2 ? -1.5 : 1));
    ctx.lineTo(b.x + b.w - 2, b.y + 3);
    ctx.lineTo(b.x + b.w - 5, b.y + h + 1);
    for (let i = n - 1; i > 0; i--) ctx.lineTo(b.x + (b.w * i) / n, b.y + h + (i % 2 ? 3 : 0.5));
    ctx.lineTo(b.x + 1, b.y + h - 1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(b.x + 5, b.y + 2, b.w - 12, 2.5);
    ctx.fillStyle = '#625868';
    for (const f of [0.22, 0.55, 0.8]) { ctx.beginPath(); ctx.ellipse(b.x + b.w * ((f + seed * 0.15) % 0.9 + 0.05), b.y + 7, 3.2, 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6;
    const cx = b.x + b.w * (0.35 + seed * 0.3);
    ctx.beginPath(); ctx.moveTo(cx - 4, b.y); ctx.lineTo(cx + 1, b.y + 5); ctx.lineTo(cx - 2, b.y + h); ctx.moveTo(cx + 1, b.y + 5); ctx.lineTo(cx + 9, b.y + 3); ctx.stroke();
    ctx.restore();
    return;
  }
  const neon = b.type === 'moving' ? '#ff4fd8' : '#3fe0ff';
  // Propulsores debajo, con llama que parpadea
  for (const px of [b.x + 14, b.x + b.w - 14]) {
    const fl = 5 + Math.sin(time * 30 + px) * 2;
    const g = ctx.createLinearGradient(0, b.y + h, 0, b.y + h + 6 + fl);
    g.addColorStop(0, neon); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(px - 4, b.y + h + 3); ctx.lineTo(px, b.y + h + 7 + fl); ctx.lineTo(px + 4, b.y + h + 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#39445e';
    roundRect(px - 5, b.y + h - 2, 10, 6, 2); ctx.fill(); ctx.stroke();
  }
  // Placa de metal
  ctx.fillStyle = b.type === 'moving' ? '#6f6a9c' : '#5f7196';
  roundRect(b.x, b.y, b.w, h, 4); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; roundRect(b.x + 3, b.y + 2, b.w - 6, 2.5, 1.2); ctx.fill();
  // Franja de neón
  ctx.save();
  ctx.shadowColor = neon; ctx.shadowBlur = 8;
  ctx.fillStyle = neon; ctx.fillRect(b.x + 4, b.y + h - 4.5, b.w - 8, 2.2);
  ctx.restore();
  roundRect(b.x, b.y, b.w, h, 4); ctx.stroke();
  // Remaches y paneles
  ctx.fillStyle = '#c9d3ea';
  ctx.beginPath(); ctx.arc(b.x + 5, b.y + 6.5, 1.3, 0, Math.PI * 2); ctx.arc(b.x + b.w - 5, b.y + 6.5, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(29,26,26,0.45)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = b.x + 22; x < b.x + b.w - 16; x += 22) { ctx.moveTo(x, b.y + 2); ctx.lineTo(x, b.y + h - 5); }
  ctx.stroke();
  if (b.type === 'moving') {
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.2;
    ctx.save(); ctx.shadowColor = neon; ctx.shadowBlur = 6;
    const cx = b.x + b.w / 2, cy = b.y + 5.5;
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(cx + d * 6, cy - 3.5); ctx.lineTo(cx + d * 12, cy); ctx.lineTo(cx + d * 6, cy + 3.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawBar(b) {
  if (b.ground) return;
  const h = 13;
  const heaven = b.y < -HEAVEN_FROM_M * PX_PER_M;
  if (!heaven && b.y < -SPACE_FROM_M * PX_PER_M) { drawSpaceBar(b); return; }
  const c = heaven ? (b.type === 'fragile' ? CRYSTAL : GOLD[b.type]) : WOOD[b.type];
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
    ctx.strokeStyle = heaven ? 'rgba(255,255,255,0.95)' : OUTLINE;
    ctx.lineWidth = 1.6;
    const cx = b.x + b.w * (0.35 + seed * 0.3);
    ctx.beginPath();
    ctx.moveTo(cx - 4, b.y); ctx.lineTo(cx + 1, b.y + 5); ctx.lineTo(cx - 2, b.y + h);
    ctx.moveTo(cx + 1, b.y + 5); ctx.lineTo(cx + 9, b.y + 3);
    ctx.stroke();
  }
  if (heaven) {
    // Destello que recorre el oro / el cristal
    ctx.save();
    roundRect(b.x, b.y, b.w, h, 4); ctx.clip();
    const sx = b.x - 20 + (((time * 60 + seed * 400) % (b.w + 140)));
    ctx.fillStyle = b.type === 'fragile' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.moveTo(sx, b.y + h); ctx.lineTo(sx + 7, b.y); ctx.lineTo(sx + 13, b.y); ctx.lineTo(sx + 6, b.y + h); ctx.closePath(); ctx.fill();
    if (b.type === 'fragile') {
      // Facetas del cristal
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = b.x + 10; x < b.x + b.w - 6; x += 16) { ctx.moveTo(x, b.y); ctx.lineTo(x + 6, b.y + h); }
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

// Sheepy con su traje de fiesta (desde 1000 m): baila mientras salta
const PARTY_HEAD = { x: 0.59, y: 0.07 }; // dónde va el gorrito de hélice (fracción de la imagen)
function drawPartySheep(s) {
  const im = img.party;
  const h = SHEEP_H * 1.08, w = h * im.naturalWidth / im.naturalHeight;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate((s.vx / MOVE) * 0.12 + Math.sin(time * 9) * 0.06);
  const rising = Math.min(Math.max(-s.vy / JUMP, 0), 1);
  const sq = s.squash;
  ctx.scale(1 + 0.2 * sq - 0.05 * rising, 1 - 0.2 * sq + 0.07 * rising);
  if (sq > 0.2) {
    ctx.fillStyle = 'rgba(20,20,30,0.22)';
    ctx.beginPath(); ctx.ellipse(0, 0, SHEEP_W * 0.42, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (s.face < 0) ctx.scale(-1, 1);
  ctx.drawImage(im, -w / 2, -h, w, h);
  if (boost) { ctx.translate(w * (PARTY_HEAD.x - 0.5), -h + h * PARTY_HEAD.y + 2); drawPropHat(boost.t, 1); }
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
  if (skin === 'party' && img.party.complete && img.party.naturalWidth) { drawPartySheep(s); return; }
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
  if (boost) { ctx.translate(0, top + 4); drawPropHat(boost.t, 1); }
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

// Billete "Un Sendauro" que devuelve una vida: flota, se balancea y tiene un brillo detrás
const BILL_W = 58, BILL_H = 29;
function drawHeart(f) {
  const beat = 1 + Math.max(0, Math.sin(f.t * 6)) * 0.08;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.fillStyle = 'rgba(255, 220, 120, 0.4)';
  ctx.beginPath(); ctx.ellipse(0, 0, BILL_W * 0.62 + Math.sin(f.t * 3) * 2, BILL_H * 0.85, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(Math.sin(f.t * 2.4) * 0.12);
  ctx.scale(beat, beat);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(-BILL_W / 2 + 2, -BILL_H / 2 + 3, BILL_W, BILL_H);
  if (img.bill.complete && img.bill.naturalWidth) ctx.drawImage(img.bill, -BILL_W / 2, -BILL_H / 2, BILL_W, BILL_H);
  else { ctx.fillStyle = '#5bc8f5'; ctx.fillRect(-BILL_W / 2, -BILL_H / 2, BILL_W, BILL_H); }
  ctx.lineWidth = 1.5; ctx.strokeStyle = OUTLINE;
  ctx.strokeRect(-BILL_W / 2, -BILL_H / 2, BILL_W, BILL_H);
  ctx.restore();
}

// ---------- Nuevos elementos ----------
// Gorrito de hélice (lo usa el premio y Sheepy mientras vuela)
function drawPropHat(t, k) {
  ctx.save();
  ctx.scale(k, k);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
  // Gorro a gajos
  const cols = ['#ff7751', '#ffc33e', '#10bdc6', '#7c5cff'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = cols[i];
    ctx.beginPath(); ctx.moveTo(0, -12);
    ctx.ellipse(0, 0, 13, 12, 0, Math.PI + (i * Math.PI) / 4, Math.PI + ((i + 1) * Math.PI) / 4);
    ctx.closePath(); ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 12, 0, Math.PI, 0); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = '#ff7751';
  ctx.beginPath(); ctx.ellipse(0, 0.5, 15, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Palito y hélice girando
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, -17); ctx.stroke();
  const spin = Math.cos(t * 28);
  ctx.fillStyle = '#ffc33e';
  ctx.beginPath(); ctx.ellipse(-8 * spin, -18, Math.max(1.5, 9 * Math.abs(spin)), 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e3262b';
  ctx.beginPath(); ctx.ellipse(8 * spin, -18, Math.max(1.5, 9 * Math.abs(spin)), 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(0, -18, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function prizeGlow(f, rx, ry) {
  ctx.fillStyle = 'rgba(255, 220, 120, 0.4)';
  ctx.beginPath(); ctx.ellipse(0, 0, rx + Math.sin(f.t * 3) * 2, ry + Math.sin(f.t * 3) * 2, 0, 0, Math.PI * 2); ctx.fill();
}
function drawHatPrize(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  prizeGlow(f, 22, 22);
  ctx.translate(0, 8);
  ctx.rotate(Math.sin(f.t * 2.4) * 0.12);
  drawPropHat(f.t * 0.35, 1.05);
  ctx.restore();
}
function shieldPath(w, h) {
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.quadraticCurveTo(w * 0.55, -h * 0.75, w, -h * 0.8);
  ctx.quadraticCurveTo(w, h * 0.25, 0, h);
  ctx.quadraticCurveTo(-w, h * 0.25, -w, -h * 0.8);
  ctx.quadraticCurveTo(-w * 0.55, -h * 0.75, 0, -h);
  ctx.closePath();
}
function drawShieldPrize(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  prizeGlow(f, 21, 21);
  ctx.rotate(Math.sin(f.t * 2.4) * 0.12);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
  shieldPath(13, 15); ctx.fillStyle = '#10bdc6'; ctx.fill(); ctx.stroke();
  shieldPath(8.5, 10); ctx.fillStyle = '#8fe3e8'; ctx.fill();
  // Estrella
  ctx.fillStyle = '#ffc33e'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 2.6 : 6;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r - 0.5);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.ellipse(-6, -8, 2.5, 1.5, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// Burbuja protectora alrededor de Sheepy (parpadea el último segundo)
function drawShieldBubble(s) {
  if (shield < 1.2 && Math.floor(shield * 8) % 2 === 0) return;
  const cx = s.x, cy = s.y - SHEEP_H * 0.5, r = SHEEP_H * 0.62;
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
  g.addColorStop(0, 'rgba(143, 227, 232, 0)');
  g.addColorStop(1, 'rgba(16, 189, 198, 0.35)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(16, 189, 198, 0.9)'; ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; ctx.lineCap = 'round';
  const a = time * 2;
  ctx.beginPath(); ctx.arc(cx, cy, r - 5, a, a + 0.7); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r - 5, a + Math.PI, a + Math.PI + 0.35); ctx.stroke();
  ctx.restore();
}
// Murciélago: misma mecánica que la abeja
function drawBat(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.vx < 0 ? -1 : 1, 1);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
  const flap = Math.sin(time * 16 + f.t);
  ctx.fillStyle = '#4a3a6b';
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.scale(dir, 1);
    ctx.rotate(-flap * 0.45);
    ctx.beginPath();
    ctx.moveTo(4, -3);
    ctx.quadraticCurveTo(12, -12, 22, -7);
    ctx.quadraticCurveTo(19, -2, 20, 3);
    ctx.quadraticCurveTo(16, 0, 13, 4);
    ctx.quadraticCurveTo(10, 1, 6, 4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // Cuerpo y orejas
  ctx.fillStyle = '#5d4a85';
  ctx.beginPath();
  ctx.moveTo(-6, -6); ctx.lineTo(-5, -13); ctx.lineTo(-1, -8); ctx.lineTo(1, -8); ctx.lineTo(5, -13); ctx.lineTo(6, -6);
  ctx.quadraticCurveTo(9, 2, 0, 8); ctx.quadraticCurveTo(-9, 2, -6, -6);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Ojos y colmillos
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.arc(-2.6, -3, 2.1, 0, Math.PI * 2); ctx.arc(2.6, -3, 2.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = OUTLINE;
  ctx.beginPath(); ctx.arc(-2.2, -2.8, 0.9, 0, Math.PI * 2); ctx.arc(3, -2.8, 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-2, 2); ctx.lineTo(-1.2, 4.5); ctx.lineTo(-0.4, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.4, 2); ctx.lineTo(1.2, 4.5); ctx.lineTo(2, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
// Chancleta voladora (vista desde arriba): gira mientras cruza; antes de entrar, aviso en el borde
function drawCrossWarn(f) {
  if (Math.floor(f.warn * 6) % 2 === 0) return;
  const x = f.vx > 0 ? 18 : GW - 18;
  ctx.save();
  ctx.translate(x, f.y);
  ctx.fillStyle = f.kind === 'star' ? '#ffc33e' : '#ff7751'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(14, 11); ctx.lineTo(-14, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = f.kind === 'star' ? OUTLINE : '#ffffff'; ctx.font = '900 16px Grandstander, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('!', 0, 3);
  ctx.restore();
}
// Estrella fugaz: estrella amarilla con carita que gira, con una cola de brillos
function starPath(r1, r2) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? r2 : r1;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}
function drawShootingStar(f) {
  if (f.warn > 0) { drawCrossWarn(f); return; }
  ctx.save();
  ctx.translate(f.x, f.y);
  const back = f.vx > 0 ? -1 : 1, rise = -(f.vsy || 0) / Math.abs(f.vx); // la cola apunta hacia atrás y arriba
  // Cola
  const ex = back * 80, ey = rise * 80;
  const g = ctx.createLinearGradient(0, 0, ex, ey);
  g.addColorStop(0, 'rgba(255, 228, 120, 0.95)'); g.addColorStop(1, 'rgba(255, 228, 120, 0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(ex, ey - 2); ctx.lineTo(ex, ey + 2); ctx.lineTo(0, 10); ctx.closePath(); ctx.fill();
  for (let i = 1; i <= 4; i++) {
    const d = 16 + i * 14;
    ctx.fillStyle = `rgba(255,255,255,${0.9 - i * 0.18})`;
    ctx.beginPath(); ctx.arc(back * d, rise * d + Math.sin(f.t * 20 + i) * 4, 3 - i * 0.4, 0, Math.PI * 2); ctx.fill();
  }
  // Estrella
  ctx.rotate(f.t * 5 * Math.sign(f.vx));
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
  starPath(16, 7.5); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.stroke();
  starPath(9, 4.5); ctx.fillStyle = '#fff1a8'; ctx.fill();
  ctx.fillStyle = OUTLINE;
  ctx.beginPath(); ctx.arc(-3, -1, 1.5, 0, Math.PI * 2); ctx.arc(3, -1, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(0, 1.5, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.restore();
}
// Anteojos: al tomarlos la vista se distorsiona un rato
function drawGlassesPrize(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  prizeGlow(f, 24, 18);
  ctx.rotate(Math.sin(f.t * 2.4) * 0.15);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // Patillas y puente
  ctx.beginPath(); ctx.moveTo(-19, -3); ctx.lineTo(-23, -6); ctx.moveTo(19, -3); ctx.lineTo(23, -6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-4, -2); ctx.quadraticCurveTo(0, -6, 4, -2); ctx.stroke();
  for (const dx of [-11, 11]) {
    ctx.fillStyle = '#d9f3ff';
    ctx.beginPath(); ctx.arc(dx, 0, 8, 0, Math.PI * 2); ctx.fill();
    // Remolino que gira dentro del lente
    ctx.save(); ctx.beginPath(); ctx.arc(dx, 0, 8, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = '#7c5cff'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.3) { const r = a * 0.5; ctx.lineTo(dx + Math.cos(a + f.t * 4) * r, Math.sin(a + f.t * 4) * r); }
    ctx.stroke(); ctx.restore();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(dx, 0, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#7c5cff'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(dx, 0, 6.3, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.ellipse(-14, -3, 2, 1.2, -0.6, 0, Math.PI * 2); ctx.ellipse(8, -3, 2, 1.2, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// Distorsión de la vista (anteojos): borroso, colores raros y el mundo se tambalea
let lastFilter = '';
function blurAmount() {
  if (blurry <= 0) return 0;
  return Math.min(1, blurry / 0.8, (GLASSES_TIME - blurry) / 0.5);
}
function applyBlurFilter() {
  const k = blurAmount();
  const f = k > 0.01 ? `blur(${(1.6 * k).toFixed(2)}px) saturate(${(1 + 0.7 * k).toFixed(2)}) hue-rotate(${Math.round(Math.sin(time * 1.6) * 35 * k)}deg)` : '';
  if (f !== lastFilter) { canvas.style.filter = f; lastFilter = f; }
  return k;
}

function drawFlip(f) {
  if (f.warn > 0) {
    if (Math.floor(f.warn * 6) % 2 === 0) return;
    const x = f.vx > 0 ? 18 : GW - 18;
    ctx.save();
    ctx.translate(x, f.y);
    ctx.fillStyle = '#ff7751'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(14, 11); ctx.lineTo(-14, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = '900 16px Grandstander, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 3);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(f.x, f.y);
  // Estela
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  const back = f.vx > 0 ? -1 : 1;
  for (const dy of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(back * 22, dy); ctx.lineTo(back * (34 + Math.abs(dy)), dy); ctx.stroke(); }
  ctx.rotate(f.t * 9 * Math.sign(f.vx));
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  // Suela con forma de pie
  const sole = () => {
    ctx.beginPath();
    ctx.moveTo(0, -19);
    ctx.bezierCurveTo(9, -19, 10, -8, 8, -1);
    ctx.bezierCurveTo(6, 6, 9, 12, 7, 17);
    ctx.bezierCurveTo(5, 21, -5, 21, -7, 17);
    ctx.bezierCurveTo(-9, 12, -6, 6, -8, -1);
    ctx.bezierCurveTo(-10, -8, -9, -19, 0, -19);
    ctx.closePath();
  };
  sole(); ctx.fillStyle = '#10bdc6'; ctx.fill(); ctx.stroke();
  ctx.save(); sole(); ctx.clip();
  ctx.fillStyle = '#8fe3e8'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Tira en Y
  ctx.lineWidth = 4.5; ctx.strokeStyle = OUTLINE; ctx.lineCap = 'round';
  const strap = () => { ctx.beginPath(); ctx.moveTo(-8, 2); ctx.quadraticCurveTo(-3, -6, 0, -12); ctx.quadraticCurveTo(3, -6, 8, 2); ctx.stroke(); };
  strap(); ctx.lineWidth = 2.6; ctx.strokeStyle = '#ffc33e'; strap();
  ctx.fillStyle = '#ff7751'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0, -12, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// Jesús de pie sobre el tablón; si Sheepy cae en su tablón, le dice una frase de ánimo
function drawJesus(f) {
  const im = img.jesus;
  if (!im.complete || !im.naturalWidth) return;
  const h = JESUS_H, w = h * im.naturalWidth / im.naturalHeight;
  ctx.save();
  ctx.translate(f.x, f.y + 1);
  ctx.fillStyle = 'rgba(20,20,30,0.2)';
  ctx.beginPath(); ctx.ellipse(0, 0, w * 0.42, 3, 0, 0, Math.PI * 2); ctx.fill();
  const breathe = 1 + Math.sin(f.t * 2) * 0.012;
  ctx.scale(1, breathe);
  ctx.drawImage(im, -w / 2, -h, w, h);
  ctx.restore();
}
function drawSpeech(f) {
  if (f.sayT <= 0 || !f.say) return;
  drawBubble(f.say, f.x, f.y - JESUS_H - 6, Math.min(1, f.sayT / 0.4, (3.5 - f.sayT) / 0.15 + 0.2));
}
// Globo de diálogo con pico hacia (tipX, tipY); el texto se parte en líneas
function drawBubble(text, tipX, tipY, alpha, o = {}) {
  const size = o.size || 14, maxW = o.maxW || 170, lh = Math.round(size * 1.2);
  const padX = o.padX || 12, padY = o.padY || 9;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = `900 ${size}px Grandstander, "Lilita One", sans-serif`;
  const words = text.split(' '), lines = [];
  let line = '';
  for (const wd of words) {
    const t = line ? line + ' ' + wd : wd;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = wd; } else line = t;
  }
  lines.push(line);
  const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
  const bh = lines.length * lh + padY * 2;
  const bx = Math.min(Math.max(tipX - bw / 2, 6), GW - 6 - bw), by = tipY - 10 - bh;
  const tx = Math.min(Math.max(tipX, bx + 14), bx + bw - 14);
  ctx.fillStyle = o.bg || '#ffffff'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = o.line || 2.5; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, Math.min(12, bh / 2));
  ctx.moveTo(tx - 7, by + bh); ctx.lineTo(tipX, tipY); ctx.lineTo(tx + 7, by + bh);
  ctx.fill(); ctx.stroke();
  ctx.fillRect(tx - 5.5, by + bh - 3, 11, 4);   // tapa la línea entre globo y pico
  ctx.fillStyle = o.color || OUTLINE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + padY + lh * i + lh / 2 + 1));
  ctx.restore();
}
// Lo que dice Sheepy (p. ej. el aviso de la chancleta): globo pequeño sobre su cabeza
function drawSheepSay() {
  if (!sheepSay) return;
  const { text, t, dur } = sheepSay;
  const pop = Math.min(1, (dur - t) / 0.15);
  drawBubble(text, sheep.x, sheep.y - SHEEP_H - 2 - (1 - pop) * 6, Math.min(1, t / 0.35, pop + 0.2),
    { size: 11.5, maxW: 120, padX: 9, padY: 6, line: 2, color: sheepSay.color || '#d9452b' });
}

// Resorte sobre el tablón: no hace daño, lanza a Sheepy 30 m
function drawSpring(f) {
  const k = f.squish;                         // 1 justo al saltar: se estira y luego vuelve
  const h = 12 + Math.sin(k * Math.PI) * 9;   // altura de la espiral
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // Base
  ctx.fillStyle = '#6f7682'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.rect(-10, -3, 20, 3); ctx.fill(); ctx.stroke();
  // Espiral en zigzag
  const turns = 4, top = -3 - h;
  ctx.lineWidth = 4.5; ctx.strokeStyle = OUTLINE;
  const zig = () => { ctx.beginPath(); ctx.moveTo(-7, -3); for (let i = 1; i <= turns * 2; i++) ctx.lineTo(i % 2 ? 7 : -7, -3 - (h * i) / (turns * 2)); };
  zig(); ctx.stroke();
  ctx.lineWidth = 2.2; ctx.strokeStyle = '#c9ced6'; zig(); ctx.stroke();
  // Plato superior
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6; ctx.fillStyle = '#ff7751';
  ctx.beginPath(); ctx.roundRect(-12, top - 4, 24, 5, 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-9, top - 3, 8, 1.5);
  ctx.restore();
}

// Pinchos metálicos sobre el tablón: misma mecánica que el cardo
function drawSpike(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
  ctx.fillStyle = '#6f7682';
  ctx.beginPath(); ctx.rect(-14, 7, 28, 4); ctx.fill(); ctx.stroke();
  for (let i = -1; i <= 1; i++) {
    const x = i * 9;
    ctx.fillStyle = '#c9ced6';
    ctx.beginPath(); ctx.moveTo(x - 5, 7); ctx.lineTo(x, -9); ctx.lineTo(x + 5, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f4f6f9';
    ctx.beginPath(); ctx.moveTo(x - 2.5, 6); ctx.lineTo(x, -5); ctx.lineTo(x, 6); ctx.closePath(); ctx.fill();
  }
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
  const wob = applyBlurFilter();
  if (wob > 0) {
    const cx = GW / 2, cy = camY + GH / 2;
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(time * 1.7) * 0.05 * wob);
    ctx.scale(1 + Math.sin(time * 2.3) * 0.06 * wob, 1 + Math.cos(time * 1.9) * 0.06 * wob);
    ctx.transform(1, 0, Math.sin(time * 1.3) * 0.08 * wob, 1, 0, 0);
    ctx.translate(-cx, -cy);
  }
  for (const b of bars) drawBar(b);
  for (const f of foes) FOE_DRAW[f.kind](f);
  for (const p of parts) {
    ctx.globalAlpha = Math.max(p.life / p.max, 0);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawSheep(sheep);
  if (shield > 0) drawShieldBubble(sheep);
  for (const f of foes) if (f.kind === 'jesus') drawSpeech(f);
  drawSheepSay();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (offX > 4) {
    ctx.fillStyle = 'rgba(15,20,40,0.25)';
    ctx.fillRect(0, 0, offX, H);
    ctx.fillRect(W - offX, 0, offX, H);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(offX, 0); ctx.lineTo(offX, H); ctx.moveTo(W - offX, 0); ctx.lineTo(W - offX, H); ctx.stroke();
  }
}

const FOE_DRAW = { bee: drawBee, bat: drawBat, thorn: drawThorn, spike: drawSpike, spring: drawSpring, flip: drawFlip, jesus: drawJesus, star: drawShootingStar, glasses: drawGlassesPrize, heart: drawHeart, shield: drawShieldPrize, hat: drawHatPrize };

// ---------- Bucle ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  if (mode !== 'over') update(dt);
  draw();
  requestAnimationFrame(loop);
}

playBtn.addEventListener('click', () => start());

recoverDraft();
renderRanking();
if (GLOBAL_ON) { loadWorld(); flushPending(); loadMe(playerInput.value); }
reset();
bestEl.textContent = best ? `Récord: ${best} m` : '';
requestAnimationFrame(loop);

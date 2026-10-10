'use strict';
/* ==== p01_core.js ==== */
'use strict';
/* SPIDER-MAN — Web of the City.  p01: namespace, maths, RNG, noise, input. */

const SM = {
  BUILD: '2026-09-18 12:37:12',
  Q: new URLSearchParams(location.search),
  mode: 'boot',            // boot | title | play | pause | photo | cine
  time: 0, dt: 0, frame: 0, timeScale: 1, hitStop: 0,
  quality: 1, tod: 0,
  testing: false,
  ready: false,
};
SM.SHOT = SM.Q.has('shot');
SM.TEST = SM.Q.has('test');
SM.DBG = SM.Q.has('dbg');
SM.SEED = parseInt(SM.Q.get('seed') || '1962', 10);

const V3 = THREE.Vector3, Q4 = THREE.Quaternion, M4 = THREE.Matrix4, C3 = THREE.Color;
const PI = Math.PI, TAU = Math.PI * 2, DEG = Math.PI / 180;
const UP = new V3(0, 1, 0);

const U = {
  clamp: (x, a, b) => x < a ? a : x > b ? b : x,
  sat: x => x < 0 ? 0 : x > 1 ? 1 : x,
  lerp: (a, b, t) => a + (b - a) * t,
  inv: (a, b, x) => (x - a) / (b - a),
  remap: (x, a, b, c, d) => c + (d - c) * U.sat((x - a) / (b - a)),
  smooth: (a, b, x) => { const t = U.sat((x - a) / (b - a)); return t * t * (3 - 2 * t); },
  ease: t => t * t * (3 - 2 * t),
  easeOut: t => 1 - (1 - t) * (1 - t) * (1 - t),
  easeIn: t => t * t * t,
  damp: (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt)),
  dampK: (l, dt) => 1 - Math.exp(-l * dt),
  wrapPi: a => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; },
  dampAngle: (a, b, l, dt) => a + U.wrapPi(b - a) * (1 - Math.exp(-l * dt)),
  approach: (a, b, d) => a < b ? Math.min(a + d, b) : Math.max(a - d, b),
  sign: x => x < 0 ? -1 : 1,
  len2: (x, z) => Math.sqrt(x * x + z * z),
  fmt: (n, d = 1) => Number(n).toFixed(d),
};

/* ---------- seeded RNG ---------- */
function mulberry(seed) {
  let a = seed >>> 0;
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (a2, b) => a2 + (b - a2) * f();
  f.int = (a2, b) => Math.floor(a2 + (b - a2 + 1) * f());
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.chance = p => f() < p;
  f.sign = () => f() < 0.5 ? -1 : 1;
  return f;
}
function hash2(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function hash3(x, y, z) { return hash2(x + Math.imul(z | 0, 1013), y + Math.imul(z | 0, 7919)); }

/* ---------- value noise ---------- */
function vnoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm2(x, y, oct = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise2(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }

/* ---------- scratch vectors (never hold across calls) ---------- */
const _v1 = new V3(), _v2 = new V3(), _v3 = new V3(), _v4 = new V3(), _v5 = new V3(), _v6 = new V3();
const _q1 = new Q4(), _q2 = new Q4(), _q3 = new Q4();
const _m1 = new M4(), _m2 = new M4();

/* ---------- loading helper ---------- */
const Loader = {
  set(p, msg) {
    const b = document.getElementById('loadbar'); if (b) b.style.width = Math.round(p * 100) + '%';
    const m = document.getElementById('loadmsg'); if (m && msg) m.textContent = msg;
  },
  // yield to the browser so the bar paints. setTimeout is clamped to 1 s in hidden tabs → MessageChannel there.
  yield() {
    return new Promise(res => {
      if (document.hidden) { const mc = new MessageChannel(); mc.port1.onmessage = () => res(); mc.port2.postMessage(0); }
      else setTimeout(res, 0);
    });
  },
};

/* ---------- INPUT ---------- */
const IN = {
  keys: Object.create(null), pressed: Object.create(null), released: Object.create(null),
  mdx: 0, mdy: 0, wheel: 0, mb: [false, false, false], mpressed: [false, false, false], mreleased: [false, false, false],
  locked: false, lockFailed: false, mx: 0, my: 0,
  pad: { lx: 0, ly: 0, rx: 0, ry: 0, b: [], bp: [], connected: false },
  // logical state, refreshed by IN.poll()
  moveX: 0, moveY: 0, lookX: 0, lookY: 0,
  a: {},          // action held
  ap: {},         // action pressed this frame
  ar: {},         // action released this frame
  holdT: {},      // seconds held
  lastInputT: 0,
};
const ACTIONS = {
  swing: { k: ['ShiftLeft', 'ShiftRight'], m: [2], p: [7] },
  jump: { k: ['Space'], p: [0] },
  attack: { k: ['KeyJ'], m: [0], p: [2] },
  web: { k: ['KeyE', 'KeyK'], p: [5] },
  dodge: { k: ['KeyQ', 'ControlLeft', 'KeyL'], p: [1] },
  zip: { k: ['KeyF'], p: [3] },
  dive: { k: ['KeyC'], p: [10] },
  heal: { k: ['KeyH'], p: [13] },
  pause: { k: ['Escape'], p: [9] },
  photo: { k: ['KeyP'], p: [] },
  tod: { k: ['KeyT'], p: [] },
  mute: { k: ['KeyM'], p: [] },
};
IN.init = function (canvas) {
  const kd = e => {
    if (e.repeat) { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault(); return; }
    IN.keys[e.code] = true; IN.pressed[e.code] = true; IN.lastInputT = performance.now();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'ControlLeft'].includes(e.code)) e.preventDefault();
  };
  const ku = e => { IN.keys[e.code] = false; IN.released[e.code] = true; };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('blur', () => { for (const k in IN.keys) IN.keys[k] = false; IN.mb = [false, false, false]; });
  canvas.addEventListener('mousedown', e => {
    IN.mb[e.button] = true; IN.mpressed[e.button] = true; IN.lastInputT = performance.now();
    if (SM.mode === 'play' && !IN.locked && !SM.SHOT) IN.lock(canvas);
    e.preventDefault();
  });
  window.addEventListener('mouseup', e => { IN.mb[e.button] = false; IN.mreleased[e.button] = true; });
  window.addEventListener('mousemove', e => {
    IN.mx = e.clientX; IN.my = e.clientY;
    if (IN.locked) { IN.mdx += e.movementX || 0; IN.mdy += e.movementY || 0; }
    else if (e.buttons & 6 || (SM.mode === 'photo' && (e.buttons & 1))) { IN.mdx += e.movementX || 0; IN.mdy += e.movementY || 0; }
  });
  canvas.addEventListener('wheel', e => { IN.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    IN.locked = document.pointerLockElement === canvas;
    if (!IN.locked && SM.mode === 'play' && !SM.SHOT && !SM.testing && typeof Game !== 'undefined' && Game.onLockLost) Game.onLockLost();
  });
  document.addEventListener('pointerlockerror', () => { IN.lockFailed = true; });
  window.addEventListener('gamepadconnected', () => { IN.pad.connected = true; });
};
IN.lock = function (canvas) {
  try { const p = canvas.requestPointerLock && canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { IN.lockFailed = true; }); } catch (e) { IN.lockFailed = true; }
};
IN.unlock = function () { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { } };
IN.poll = function (dt) {
  // gamepad
  const P = IN.pad; P.bp = [];
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null; for (const g of gps) if (g && g.connected) { gp = g; break; }
  if (gp) {
    const dz = v => Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84;
    P.lx = dz(gp.axes[0] || 0); P.ly = dz(gp.axes[1] || 0); P.rx = dz(gp.axes[2] || 0); P.ry = dz(gp.axes[3] || 0);
    for (let i = 0; i < gp.buttons.length; i++) { const d = gp.buttons[i].pressed || gp.buttons[i].value > 0.4; P.bp[i] = d && !P.b[i]; P.b[i] = d; }
    P.connected = true;
  } else { P.lx = P.ly = P.rx = P.ry = 0; P.b = []; P.connected = false; }
  const K = IN.keys;
  let mx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) + P.lx, my = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0) - P.ly;
  const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  IN.moveX = mx; IN.moveY = my;
  const ar = ((K.ArrowRight ? 1 : 0) - (K.ArrowLeft ? 1 : 0)), au = ((K.ArrowDown ? 1 : 0) - (K.ArrowUp ? 1 : 0));
  IN.lookX = IN.mdx * 0.0024 + (ar * 2.2 + P.rx * 3.0) * dt;
  IN.lookY = IN.mdy * 0.0024 + (au * 1.5 + P.ry * 2.0) * dt;
  for (const name in ACTIONS) {
    const A = ACTIONS[name]; let held = false, pr = false, rl = false;
    if (A.k) for (const k of A.k) { if (K[k]) held = true; if (IN.pressed[k]) pr = true; if (IN.released[k]) rl = true; }
    if (A.m) for (const b of A.m) { if (IN.mb[b]) held = true; if (IN.mpressed[b]) pr = true; if (IN.mreleased[b]) rl = true; }
    if (A.p) for (const b of A.p) { if (P.b[b]) held = true; if (P.bp[b]) pr = true; }
    const was = IN.a[name];
    IN.ap[name] = pr || (held && !was); IN.ar[name] = (!held && was) || (rl && !held);
    IN.a[name] = held; IN.holdT[name] = held ? (IN.holdT[name] || 0) + dt : 0;
  }
};
IN.endFrame = function () {
  IN.mdx = 0; IN.mdy = 0; IN.wheel = 0;
  for (const k in IN.pressed) delete IN.pressed[k];
  for (const k in IN.released) delete IN.released[k];
  IN.mpressed = [false, false, false]; IN.mreleased = [false, false, false];
};
/* synthetic input for tests: IN.sim({swing:true}) holds logical actions regardless of DOM */
IN.simKeys = function (codes, down) { for (const c of codes) { if (down) { if (!IN.keys[c]) IN.pressed[c] = true; IN.keys[c] = true; } else { if (IN.keys[c]) IN.released[c] = true; IN.keys[c] = false; } } };


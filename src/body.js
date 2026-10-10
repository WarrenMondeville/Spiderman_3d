'use strict';
/* ==== p20_body.js ==== */
/* p20: procedural anatomy. A figure is a smooth union of ellipsoids / round cones in T-pose, meshed with surface nets,
   projected onto the true surface, and skinned automatically from which primitive owns each vertex. */

const Body = {};

/* rest skeleton (T-pose, facing +Z, character's left = +X). Right side is mirrored automatically. */
Body.SKEL = [
  ['hips', null, 0, 0.965, 0], ['spine', 'hips', 0, 1.075, 0.004], ['chest', 'spine', 0, 1.225, 0.0], ['neck', 'chest', 0, 1.492, -0.012], ['head', 'neck', 0, 1.578, 0.0],
  ['L_clav', 'chest', 0.035, 1.435, 0.0], ['L_upperarm', 'L_clav', 0.188, 1.43, -0.005], ['L_forearm', 'L_upperarm', 0.465, 1.43, -0.005], ['L_hand', 'L_forearm', 0.715, 1.43, -0.005],
  ['L_fA1', 'L_hand', 0.803, 1.428, 0.0], ['L_fA2', 'L_fA1', 0.842, 1.427, 0.0], ['L_fB1', 'L_hand', 0.807, 1.428, 0.0], ['L_fB2', 'L_fB1', 0.851, 1.427, 0.0],
  ['L_th1', 'L_hand', 0.748, 1.422, 0.034], ['L_th2', 'L_th1', 0.778, 1.420, 0.064],
  ['L_thigh', 'hips', 0.095, 0.915, 0.0], ['L_shin', 'L_thigh', 0.10, 0.505, 0.005], ['L_foot', 'L_shin', 0.10, 0.088, -0.015], ['L_toe', 'L_foot', 0.10, 0.03, 0.095],
];
Body.boneList = function () {
  const out = []; for (const b of Body.SKEL) out.push({ name: b[0], parent: b[1], x: b[2], y: b[3], z: b[4] });
  for (const b of Body.SKEL) if (b[0].startsWith('L_')) out.push({ name: 'R_' + b[0].slice(2), parent: b[1].startsWith('L_') ? 'R_' + b[1].slice(2) : b[1], x: -b[2], y: b[3], z: b[4] });
  return out;
};

/* ----- primitives (all defined for x >= 0; the field folds |x|) ----- */
Body.prims = function (o) {
  o = Object.assign({ bulk: 1, arm: 1, leg: 1, torso: 1, belly: 0, jacket: 0, hood: 0, boots: 0, neck: 1, head: 1, hands: 'full', pads: 0, pants: 0 }, o || {});
  const P = [];
  const E = (cx, cy, cz, rx, ry, rz, w, k = 0.03, rot) => P.push({ t: 0, cx, cy, cz, rx, ry, rz, w, k, rot: rot || null });
  const C = (ax, ay, az, bx, by, bz, r1, r2, w, k = 0.03) => P.push({ t: 1, ax, ay, az, bx, by, bz, r1, r2, w, k });
  const Bx = (cx, cy, cz, hx, hy, hz, r, w, k = 0.01) => P.push({ t: 2, cx, cy, cz, hx, hy, hz, r, w, k });
  const T = o.torso * o.bulk, A = o.arm * o.bulk, L = o.leg * o.bulk, J = o.jacket, H = o.head;
  // head + neck
  E(0, 1.668, 0.010, 0.083 * H, 0.108 * H, 0.098 * H, { head: 1 }, 0.0);
  E(0, 1.612, 0.032, 0.058 * H, 0.062 * H, 0.066 * H, { head: 1 }, 0.035);
  E(0, 1.690, -0.022, 0.079 * H, 0.090 * H, 0.086 * H, { head: 1 }, 0.03);
  C(0, 1.465, -0.014, 0, 1.60, 0.000, 0.060 * o.neck, 0.053 * o.neck, { neck: 1 }, 0.025);
  C(0.0, 1.505, -0.032, 0.150, 1.448, -0.012, 0.046 * T, 0.040 * T, { chest: 0.75, L_clav: 0.25 }, 0.045);
  // torso
  E(0, 1.300, 0.000, (0.158 + J * 0.02) * T, 0.178, (0.112 + J * 0.018) * T, { chest: 1 }, 0.04);
  E(0.078, 1.366, 0.073 + J * 0.012, 0.094 * T, 0.056, 0.034 * T, { chest: 1 }, 0.034, [0, 0, -0.16]);
  E(0.130, 1.265, -0.036, 0.060 * T, 0.135, 0.072 * T, { chest: 1 }, 0.045);
  E(0.072, 1.372, -0.088, 0.082 * T, 0.095, 0.040 * T, { chest: 1 }, 0.045);
  E(0, 1.120, 0.012 + o.belly * 0.05, (0.127 + J * 0.022 + o.belly * 0.03) * T, 0.125, (0.092 + J * 0.02 + o.belly * 0.07) * T, { spine: 1 }, 0.05);
  if (!J) { for (const ay of [1.205, 1.140, 1.075]) E(0.036, ay, 0.090 * T + o.belly * 0.06, 0.034, 0.027, 0.020, { spine: 1 }, 0.016); }
  E(0.108, 1.085, 0.008, 0.050 * T, 0.085, 0.072 * T, { spine: 1 }, 0.045);
  E(0, 0.975, 0.000, (0.150 + J * 0.018) * T, 0.098, (0.102 + J * 0.015) * T, { hips: 1 }, 0.05);
  E(0.080, 0.918, -0.046, 0.084 * L, 0.084, 0.066 * L, { hips: 0.6, L_thigh: 0.4 }, 0.04);
  E(0, 0.905, 0.022, 0.070, 0.062, 0.072, { hips: 1 }, 0.04);
  if (J) { C(0.0, 0.93, 0.0, 0.13, 0.93, 0.0, 0.118 * T, 0.10 * T, { hips: 1 }, 0.03); }                     // jacket hem
  if (o.hood) { E(0, 1.675, -0.030, 0.105 * H, 0.118 * H, 0.112 * H, { head: 1 }, 0.02); E(0, 1.535, -0.070, 0.10, 0.07, 0.075, { chest: 0.6, neck: 0.4 }, 0.04); }
  // arm
  E(0.208, 1.443, 0.000, (0.082 + J * 0.012) * A, (0.067 + J * 0.01) * A, (0.071 + J * 0.01) * A, { L_clav: 0.35, L_upperarm: 0.65 }, 0.035);
  C(0.200, 1.430, -0.005, 0.465, 1.430, -0.005, (0.050 + J * 0.010) * A, (0.040 + J * 0.010) * A, { L_upperarm: 1 }, 0.03);
  E(0.330, 1.424, 0.022, 0.088, 0.040 * A + J * 0.008, 0.040 * A + J * 0.008, { L_upperarm: 1 }, 0.025);
  E(0.322, 1.433, -0.031, 0.098, 0.040 * A + J * 0.008, 0.038 * A + J * 0.008, { L_upperarm: 1 }, 0.025);
  C(0.465, 1.430, -0.005, 0.715, 1.430, -0.005, (0.0425 + J * 0.010) * A, (0.0285 + J * 0.008) * A, { L_forearm: 1 }, 0.025);
  E(0.548, 1.432, 0.008, 0.078, 0.040 * A + J * 0.008, 0.036 * A + J * 0.008, { L_forearm: 1 }, 0.025);
  if (o.pads) E(0.215, 1.462, 0.0, 0.085, 0.05, 0.082, { L_clav: 0.4, L_upperarm: 0.6 }, 0.012);
  // leg
  const pl = o.pants * 0.012;
  C(0.095, 0.905, 0.000, 0.100, 0.505, 0.005, (0.086 + pl) * L, (0.054 + pl) * L, { L_thigh: 1 }, 0.04);
  E(0.100, 0.720, 0.036, 0.062 * L, 0.170, 0.050 * L + pl, { L_thigh: 1 }, 0.03);
  E(0.098, 0.700, -0.036, 0.055 * L, 0.160, 0.046 * L + pl, { L_thigh: 1 }, 0.03);
  E(0.058, 0.800, 0.000, 0.046 * L, 0.125, 0.062 * L, { L_thigh: 1 }, 0.04);
  E(0.100, 0.505, 0.018, 0.050 * L + pl, 0.056, 0.050 * L + pl, { L_thigh: 0.5, L_shin: 0.5 }, 0.025);
  C(0.100, 0.505, 0.005, 0.100, 0.090, -0.015, (0.052 + pl) * L, (0.035 + pl + o.boots * 0.012) * L, { L_shin: 1 }, 0.03);
  E(0.100, 0.372, -0.036, 0.048 * L + pl, 0.118, 0.048 * L + pl, { L_shin: 1 }, 0.03);
  // foot
  const fb = 1 + o.boots * 0.22;
  E(0.100, 0.046, -0.036, 0.040 * fb, 0.046 * fb, 0.050 * fb, { L_foot: 1 }, 0.02);
  C(0.100, 0.046, -0.020, 0.100, 0.034, 0.098, 0.043 * fb, 0.037 * fb, { L_foot: 1 }, 0.02);
  E(0.100, 0.029, 0.136, 0.045 * fb, 0.027 * fb, 0.052 * fb, { L_toe: 1 }, 0.02);
  return P;
};
Body.handPrims = function (o) {
  o = Object.assign({ hands: 'full', arm: 1, bulk: 1, jacket: 0, glove: 0 }, o || {});
  const P = []; const s = 1 + o.glove * 0.12;
  const E = (cx, cy, cz, rx, ry, rz, w, k = 0.01) => P.push({ t: 0, cx, cy, cz, rx, ry, rz, w, k, rot: null });
  const C = (ax, ay, az, bx, by, bz, r1, r2, w, k = 0.006) => P.push({ t: 1, ax, ay, az, bx, by, bz, r1, r2, w, k });
  const Bx = (cx, cy, cz, hx, hy, hz, r, w, k = 0.008) => P.push({ t: 2, cx, cy, cz, hx, hy, hz, r, w, k });
  C(0.690, 1.430, -0.005, 0.738, 1.430, -0.005, 0.0300 * s, 0.0290 * s, { L_forearm: 0.5, L_hand: 0.5 }, 0.0);
  Bx(0.768, 1.4285, -0.003, 0.036, 0.0075 * s, 0.036, 0.0125 * s, { L_hand: 1 }, 0.012);
  E(0.748, 1.4235, 0.030, 0.028, 0.0165 * s, 0.021, { L_hand: 0.7, L_th1: 0.3 }, 0.012);
  E(0.760, 1.425, -0.030, 0.034, 0.015 * s, 0.014, { L_hand: 1 }, 0.01);
  if (o.hands === 'full') {
    const F = [[0.028, 0.803, 0.845, 0.889, 0.0099, 'A'], [0.0085, 0.808, 0.853, 0.901, 0.0103, 'B'], [-0.0115, 0.805, 0.848, 0.893, 0.0098, 'B'], [-0.0305, 0.797, 0.832, 0.867, 0.0088, 'A']];
    for (const f of F) {
      const z = f[0], r = f[4] * s, b1 = 'L_f' + f[5] + '1', b2 = 'L_f' + f[5] + '2';
      C(f[1] - 0.012, 1.4285, z, f[2], 1.4275, z, r * 1.06, r * 0.95, { [b1]: 1 }, 0.006);
      C(f[2], 1.4275, z, f[3], 1.4255, z, r * 0.95, r * 0.80, { [b2]: 1 }, 0.004);
    }
    C(0.748, 1.4225, 0.036, 0.778, 1.4205, 0.066, 0.0118 * s, 0.0106 * s, { L_th1: 1 }, 0.008);
    C(0.778, 1.4205, 0.066, 0.803, 1.4185, 0.089, 0.0106 * s, 0.0088 * s, { L_th2: 1 }, 0.004);
  } else {   // mitten: one slab per finger group — reads as a fist at fighting distance
    Bx(0.826, 1.428, -0.002, 0.024, 0.0085 * s, 0.033, 0.009, { L_fA1: 0.5, L_fB1: 0.5 }, 0.006);
    Bx(0.868, 1.4265, -0.002, 0.022, 0.0075 * s, 0.031, 0.008, { L_fA2: 0.5, L_fB2: 0.5 }, 0.005);
    C(0.748, 1.4225, 0.036, 0.800, 1.419, 0.085, 0.0125 * s, 0.0095 * s, { L_th1: 0.5, L_th2: 0.5 }, 0.008);
  }
  return P;
};

/* ----- SDF evaluation ----- */
Body.prep = function (prims) {
  for (const p of prims) {
    if (p.t === 0) { p.br = Math.max(p.rx, p.ry, p.rz); p.minr = Math.min(p.rx, p.ry, p.rz); if (p.rot) { const e = new THREE.Euler(p.rot[0], p.rot[1], p.rot[2]); const m = new THREE.Matrix4().makeRotationFromEuler(e).invert().elements; p.m = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]]; } }
  }
  // bounding spheres
  for (const p of prims) {
    if (p.t === 1) { const mx = (p.ax + p.bx) / 2, my = (p.ay + p.by) / 2, mz = (p.az + p.bz) / 2; p.sx = mx; p.sy = my; p.sz = mz; p.sr = Math.hypot(p.bx - p.ax, p.by - p.ay, p.bz - p.az) / 2 + Math.max(p.r1, p.r2); const bax = p.bx - p.ax, bay = p.by - p.ay, baz = p.bz - p.az; p.l2 = bax * bax + bay * bay + baz * baz; p.rr = p.r1 - p.r2; p.a2 = p.l2 - p.rr * p.rr; p.il2 = 1 / p.l2; }
    else if (p.t === 0) { p.sx = p.cx; p.sy = p.cy; p.sz = p.cz; p.sr = p.br; }
    else { p.sx = p.cx; p.sy = p.cy; p.sz = p.cz; p.sr = Math.hypot(p.hx, p.hy, p.hz) + p.r; }
  }
  return prims;
};
Body.primD = function (p, x, y, z) {
  if (p.t === 0) {
    let lx = x - p.cx, ly = y - p.cy, lz = z - p.cz;
    if (p.m) { const m = p.m, tx = m[0] * lx + m[1] * ly + m[2] * lz, ty = m[3] * lx + m[4] * ly + m[5] * lz, tz = m[6] * lx + m[7] * ly + m[8] * lz; lx = tx; ly = ty; lz = tz; }
    const ux = lx / p.rx, uy = ly / p.ry, uz = lz / p.rz, k0 = Math.sqrt(ux * ux + uy * uy + uz * uz);
    const vx = ux / p.rx, vy = uy / p.ry, vz = uz / p.rz, k1 = Math.sqrt(vx * vx + vy * vy + vz * vz);
    return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -p.minr;
  }
  if (p.t === 1) {
    const bax = p.bx - p.ax, bay = p.by - p.ay, baz = p.bz - p.az, pax = x - p.ax, pay = y - p.ay, paz = z - p.az;
    const yy = pax * bax + pay * bay + paz * baz, zz = yy - p.l2;
    const qx = pax * p.l2 - bax * yy, qy = pay * p.l2 - bay * yy, qz = paz * p.l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * p.l2, z2 = zz * zz * p.l2;
    const k = Math.sign(p.rr) * p.rr * p.rr * x2;
    if (Math.sign(zz) * p.a2 * z2 > k) return Math.sqrt(x2 + z2) * p.il2 - p.r2;
    if (Math.sign(yy) * p.a2 * y2 < k) return Math.sqrt(x2 + y2) * p.il2 - p.r1;
    return (Math.sqrt(x2 * p.a2 * p.il2) + yy * p.rr) * p.il2 - p.r1;
  }
  const qx = Math.abs(x - p.cx) - p.hx, qy = Math.abs(y - p.cy) - p.hy, qz = Math.abs(z - p.cz) - p.hz;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - p.r;
};
Body.field = function (list, x, y, z, floorY) {
  x = Math.abs(x); let d = 1e3;
  for (let i = 0; i < list.length; i++) {
    const p = list[i], di = Body.primD(p, x, y, z), k = p.k;
    if (k > 0) { const h = Math.max(k - Math.abs(d - di), 0) / k; d = Math.min(d, di) - h * h * k * 0.25; } else d = Math.min(d, di);
  }
  if (floorY !== undefined) d = Math.max(d, floorY - y);
  return d;
};

/* ----- surface nets over a block-culled grid ----- */
Body.mesh = function (prims, bounds, h, opt) {
  opt = opt || {}; const floorY = opt.floorY;
  const [x0, x1, y0, y1, z0, z1] = bounds;
  let nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
  let ox = x0;
  if (opt.symmetric) { const half = Math.ceil(Math.max(Math.abs(x0), Math.abs(x1)) / h); nx = half * 2 + 1; ox = -half * h; }
  const N = nx * ny * nz, F = new Float32Array(N).fill(1);
  const BS = 6, bnx = Math.ceil(nx / BS), bny = Math.ceil(ny / BS), bnz = Math.ceil(nz / BS);
  const lists = new Array(bnx * bny * bnz);
  const brad = BS * h * 0.5 * Math.sqrt(3) + h;
  for (let bk = 0; bk < bnz; bk++) for (let bj = 0; bj < bny; bj++) for (let bi = 0; bi < bnx; bi++) {
    const cx = Math.abs(ox + (bi * BS + BS / 2) * h), cy = y0 + (bj * BS + BS / 2) * h, cz = z0 + (bk * BS + BS / 2) * h;
    let list = null, near = false;
    for (const p of prims) {
      // fold: test against |x| of the block centre, but blocks straddling x=0 must be generous
      const dx = cx - p.sx, dy = cy - p.sy, dz = cz - p.sz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) - p.sr - brad;
      if (dist < 0.05) { (list || (list = [])).push(p); if (dist < 0.004) near = true; }
    }
    lists[bi + bj * bnx + bk * bnx * bny] = near ? list : null;
    if (!near) continue;
    const ie = Math.min(nx, bi * BS + BS + 1), je = Math.min(ny, bj * BS + BS + 1), ke = Math.min(nz, bk * BS + BS + 1);
    for (let k = bk * BS; k < ke; k++) for (let j = bj * BS; j < je; j++) for (let i = bi * BS; i < ie; i++) {
      const id = i + j * nx + k * nx * ny; F[id] = Body.field(list, ox + i * h, y0 + j * h, z0 + k * h, floorY);
    }
  }
  const listAt = (x, y, z) => { const bi = U.clamp(Math.floor((x - ox) / h / BS), 0, bnx - 1), bj = U.clamp(Math.floor((y - y0) / h / BS), 0, bny - 1), bk = U.clamp(Math.floor((z - z0) / h / BS), 0, bnz - 1); return lists[bi + bj * bnx + bk * bnx * bny] || prims; };
  // vertices
  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1, cell = new Int32Array(cnx * cny * cnz).fill(-1);
  const pos = [], sxy = nx * ny;
  const co = [0, 1, nx, nx + 1, sxy, sxy + 1, sxy + nx, sxy + nx + 1], cpos = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < cnz; k++) for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++) {
    const b = i + j * nx + k * sxy; let mask = 0;
    for (let c = 0; c < 8; c++) { v[c] = F[b + co[c]]; if (v[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let e = 0; e < 12; e++) { const a = edges[e][0], c2 = edges[e][1]; if ((v[a] < 0) === (v[c2] < 0)) continue; const t = v[a] / (v[a] - v[c2]); sx += cpos[a][0] + (cpos[c2][0] - cpos[a][0]) * t; sy += cpos[a][1] + (cpos[c2][1] - cpos[a][1]) * t; sz += cpos[a][2] + (cpos[c2][2] - cpos[a][2]) * t; n++; }
    cell[i + j * cnx + k * cnx * cny] = pos.length / 3;
    pos.push(ox + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
  }
  // quads
  const idx = []; const cid = (i, j, k) => cell[i + j * cnx + k * cnx * cny];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < cnz; k++) for (let j = 1; j < cny; j++) for (let i = 1; i < cnx; i++) {
    const b = i + j * nx + k * sxy, f0 = F[b] < 0;
    if (f0 !== (F[b + 1] < 0)) quad(cid(i, j - 1, k - 1), cid(i, j, k - 1), cid(i, j, k), cid(i, j - 1, k), !f0);
    if (f0 !== (F[b + nx] < 0)) quad(cid(i - 1, j, k - 1), cid(i - 1, j, k), cid(i, j, k), cid(i, j, k - 1), !f0);
    if (f0 !== (F[b + sxy] < 0)) quad(cid(i - 1, j - 1, k), cid(i, j - 1, k), cid(i, j, k), cid(i - 1, j, k), !f0);
  }
  // project onto the true surface, take normals from the gradient
  const nv = pos.length / 3, nrm = new Float32Array(nv * 3), e = h * 0.35;
  for (let i = 0; i < nv; i++) {
    let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; const L = listAt(x, y, z); let gx = 0, gy = 1, gz = 0;
    for (let it = 0; it < 3; it++) {
      const d = Body.field(L, x, y, z, floorY);
      gx = Body.field(L, x + e, y, z, floorY) - Body.field(L, x - e, y, z, floorY); gy = Body.field(L, x, y + e, z, floorY) - Body.field(L, x, y - e, z, floorY); gz = Body.field(L, x, y, z + e, floorY) - Body.field(L, x, y, z - e, floorY);
      const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
      if (it < 2) { const st = U.clamp(d, -h, h); x -= gx * st; y -= gy * st; z -= gz * st; }
    }
    if (opt.symmetric && Math.abs(x) < h * 0.12) { x = 0; }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; nrm[i * 3] = gx; nrm[i * 3 + 1] = gy; nrm[i * 3 + 2] = gz;
  }
  // make sure every triangle faces along the gradient
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    if (fx * (nrm[a] + nrm[b] + nrm[c]) + fy * (nrm[a + 1] + nrm[b + 1] + nrm[c + 1]) + fz * (nrm[a + 2] + nrm[b + 2] + nrm[c + 2]) < 0) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
  }
  return { pos: new Float32Array(pos), nrm, idx, listAt };
};

/* ----- automatic skin weights: soft-min over the primitives near each vertex ----- */
Body.weights = function (M, boneIndex, sigma) {
  const nv = M.pos.length / 3, si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), acc = new Map();
  for (let i = 0; i < nv; i++) {
    const xs = M.pos[i * 3], x = Math.abs(xs), y = M.pos[i * 3 + 1], z = M.pos[i * 3 + 2], L = M.listAt(xs, y, z), right = xs < 0;
    let dmin = 1e9; const ds = new Array(L.length);
    for (let k = 0; k < L.length; k++) { ds[k] = Body.primD(L[k], x, y, z); if (ds[k] < dmin) dmin = ds[k]; }
    acc.clear();
    for (let k = 0; k < L.length; k++) { const w = Math.exp(-Math.max(ds[k] - dmin, 0) / sigma); if (w < 0.004) continue; const bw = L[k].w; for (const bn in bw) { const name = right && bn.startsWith('L_') ? 'R_' + bn.slice(2) : bn; acc.set(name, (acc.get(name) || 0) + w * bw[bn]); } }
    const arr = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4); let s = 0; for (const a of arr) s += a[1];
    for (let k = 0; k < 4; k++) { if (k < arr.length) { si[i * 4 + k] = boneIndex[arr[k][0]]; sw[i * 4 + k] = arr[k][1] / s; } else { si[i * 4 + k] = 0; sw[i * 4 + k] = 0; } }
  }
  return { si, sw };
};

/* full figure: body grid + fine hand grid (mirrored), merged into one skinned geometry */
Body.build = function (o) {
  o = o || {}; const hB = o.res || 0.0085, hH = o.handRes || 0.003;
  const bones = Body.boneList(), boneIndex = {}; bones.forEach((b, i) => boneIndex[b.name] = i);
  const bp = Body.prep(Body.prims(o)), hp = Body.prep(Body.handPrims(o));
  const MB = Body.mesh(bp, [-0.76, 0.76, -0.01, 1.82, -0.24, 0.24], hB, { symmetric: true, floorY: 0.004 });
  const WB = Body.weights(MB, boneIndex, o.sigma || 0.022);
  const MH = Body.mesh(hp, [0.675, 0.915, 1.395, 1.462, -0.062, 0.108], hH, {});
  const WH = Body.weights(MH, boneIndex, 0.006);
  const nb = MB.pos.length / 3, nh = MH.pos.length / 3, nv = nb + nh * 2;
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  pos.set(MB.pos); nrm.set(MB.nrm); si.set(WB.si); sw.set(WB.sw);
  pos.set(MH.pos, nb * 3); nrm.set(MH.nrm, nb * 3); si.set(WH.si, nb * 4); sw.set(WH.sw, nb * 4);
  const mir = {}; bones.forEach((b, i) => { const n = b.name.startsWith('L_') ? 'R_' + b.name.slice(2) : b.name.startsWith('R_') ? 'L_' + b.name.slice(2) : b.name; mir[i] = boneIndex[n]; });
  const o2 = nb + nh;
  for (let i = 0; i < nh; i++) {
    pos[(o2 + i) * 3] = -MH.pos[i * 3]; pos[(o2 + i) * 3 + 1] = MH.pos[i * 3 + 1]; pos[(o2 + i) * 3 + 2] = MH.pos[i * 3 + 2];
    nrm[(o2 + i) * 3] = -MH.nrm[i * 3]; nrm[(o2 + i) * 3 + 1] = MH.nrm[i * 3 + 1]; nrm[(o2 + i) * 3 + 2] = MH.nrm[i * 3 + 2];
    for (let k = 0; k < 4; k++) { si[(o2 + i) * 4 + k] = mir[WH.si[i * 4 + k]]; sw[(o2 + i) * 4 + k] = WH.sw[i * 4 + k]; }
  }
  const idx = new Uint32Array(MB.idx.length + MH.idx.length * 2); idx.set(MB.idx);
  for (let t = 0; t < MH.idx.length; t++) idx[MB.idx.length + t] = MH.idx[t] + nb;
  for (let t = 0; t < MH.idx.length; t += 3) { const b = MB.idx.length + MH.idx.length + t; idx[b] = MH.idx[t] + o2; idx[b + 1] = MH.idx[t + 2] + o2; idx[b + 2] = MH.idx[t + 1] + o2; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new V3(0, 0.95, 0), 1.6); g.boundingBox = new THREE.Box3(new V3(-1, -0.1, -0.6), new V3(1, 1.9, 0.6));
  return { geometry: g, bones, boneIndex, tris: idx.length / 3 };
};

/* instantiate: SkinnedMesh + Bone tree. All bones have identity rest rotation, so poses are easy to reason about. */
Body.instance = function (built, material, scale) {
  const bs = [], byName = {};
  for (const b of built.bones) { const bone = new THREE.Bone(); bone.name = b.name; bs.push(bone); byName[b.name] = bone; }
  built.bones.forEach((b, i) => { const bone = bs[i]; if (b.parent) { const p = built.bones[built.boneIndex[b.parent]]; bone.position.set(b.x - p.x, b.y - p.y, b.z - p.z); byName[b.parent].add(bone); } else bone.position.set(b.x, b.y, b.z); bone.userData.rest = bone.position.clone(); });
  const mesh = new THREE.SkinnedMesh(built.geometry, material);
  const root = new THREE.Group(); root.add(bs[0]); root.add(mesh);
  bs[0].updateMatrixWorld(true);
  const skel = new THREE.Skeleton(bs); mesh.bind(skel, new M4());
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  if (scale) root.scale.setScalar(scale);
  return { root, mesh, bones: byName, skeleton: skel, list: bs };
};


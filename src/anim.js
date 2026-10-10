'use strict';
/* ==== p22_anim.js ==== */
/* p22: pose solver. Poses are authored semantically — limb DIRECTIONS, elbow/knee bends, or foot targets solved by IK —
   in character space (facing +Z, left = +X). Right-side limbs are solved as mirrored left limbs, so everything is symmetric. */

const Anim = {};
Anim.BONES = ['hips', 'spine', 'chest', 'neck', 'head'];
for (const s of ['L_', 'R_']) for (const n of ['clav', 'upperarm', 'forearm', 'hand', 'fA1', 'fA2', 'fB1', 'fB2', 'th1', 'th2', 'thigh', 'shin', 'foot', 'toe']) Anim.BONES.push(s + n);
Anim.L1 = Math.hypot(0.10 - 0.095, 0.505 - 0.915, 0.005); Anim.L2 = Math.hypot(0, 0.088 - 0.505, -0.015 - 0.005);
Anim.HIP = new V3(0.095, 0.915 - 0.965, 0); Anim.ANKLE = 0.088;
Anim.HANDS = {   // [fA1, fA2, fB1, fB2, thumbCurl, thumbIn]
  relax: [0.30, 0.35, 0.36, 0.42, 0.20, 0.15], open: [0.06, 0.08, 0.06, 0.08, 0.0, -0.1], fist: [1.45, 1.65, 1.5, 1.7, 0.7, 0.9],
  thwip: [0.02, 0.04, 1.55, 1.7, -0.1, -0.35], splay: [0.22, 0.30, 0.22, 0.30, 0.05, -0.3], grip: [1.15, 1.35, 1.2, 1.4, 0.6, 0.7], claw: [0.55, 0.85, 0.55, 0.85, 0.3, 0.1],
};
const _aq = [], _av = [];
for (let i = 0; i < 24; i++) { _aq.push(new Q4()); _av.push(new V3()); }
const AX = new V3(1, 0, 0), AY = new V3(0, 1, 0), AZ = new V3(0, 0, 1), ANY = new V3(0, -1, 0);
const _e = new THREE.Euler();
Anim.mirQ = q => { q.y = -q.y; q.z = -q.z; return q; };
Anim.eul = (q, a) => { if (!a) return q.identity(); _e.set(a[0] || 0, a[1] || 0, a[2] || 0, 'YXZ'); return q.setFromEuler(_e); };

Anim.newSolved = function () { const o = { q: {}, hips: new V3(0, 0.965, 0) }; for (const b of Anim.BONES) o.q[b] = new Q4(); return o; };

/* solve a pose spec into local bone quaternions. rootQ (world) is only needed for world-space arm aiming. */
Anim.solve = function (pose, out, rootQ) {
  const q = out.q, R = pose.root || {};
  out.hips.set(R.x || 0, 0.965 + (R.y || 0), R.z || 0);
  Anim.eul(q.hips, pose.hips); Anim.eul(q.spine, pose.spine); Anim.eul(q.chest, pose.chest); Anim.eul(q.neck, pose.neck); Anim.eul(q.head, pose.head);
  const Qh = _aq[0].copy(q.hips), Qc = _aq[1].copy(q.hips).multiply(q.spine).multiply(q.chest);
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1, pre = side + '_';
    // ---------- arm
    const A = pose['arm' + side] || { d: [s * 0.3, -0.95, 0.05], el: 0.2 };
    const d = _av[0];
    if (A.aimW && rootQ) { d.copy(A.aimW).applyQuaternion(_aq[2].copy(rootQ).multiply(Qc).invert()); }
    else { d.set(A.d[0], A.d[1], A.d[2]); if (A.cs) d.applyQuaternion(_aq[2].copy(Qc).invert()); }   // cs: direction given in character space
    d.normalize(); d.x *= s;                                   // left-equivalent
    const el = Math.max(0, A.el || 0);
    const clavUp = Math.max(0, d.y) * 0.42 + (A.shrug || 0), clavFw = Math.max(0, d.z) * 0.22;
    const qcl = _aq[3]; _e.set(0, -clavFw, clavUp, 'YXZ'); qcl.setFromEuler(_e);
    d.applyQuaternion(_aq[4].copy(qcl).invert());
    const qsw = _aq[5].setFromUnitVectors(AX, d); if (A.tw) qsw.multiply(_aq[6].setFromAxisAngle(AX, A.tw));
    const qfo = _aq[7].setFromAxisAngle(AY, -el); if (A.ftw) qfo.multiply(_aq[6].setFromAxisAngle(AX, A.ftw));
    const qha = _aq[8]; Anim.eul(qha, A.hand);
    q[pre + 'clav'].copy(qcl); q[pre + 'upperarm'].copy(qsw); q[pre + 'forearm'].copy(qfo); q[pre + 'hand'].copy(qha);
    const G = Anim.HANDS[pose['hand' + side] || 'relax'];
    q[pre + 'fA1'].setFromAxisAngle(AZ, -G[0]); q[pre + 'fA2'].setFromAxisAngle(AZ, -G[1]); q[pre + 'fB1'].setFromAxisAngle(AZ, -G[2]); q[pre + 'fB2'].setFromAxisAngle(AZ, -G[3]);
    _e.set(-G[5] * 0.8, G[5] * 0.5, -G[4] * 0.6, 'XYZ'); q[pre + 'th1'].setFromEuler(_e); q[pre + 'th2'].setFromAxisAngle(AZ, -G[4] * 0.9);
    if (s < 0) for (const n of ['clav', 'upperarm', 'forearm', 'hand', 'fA1', 'fA2', 'fB1', 'fB2', 'th1', 'th2']) Anim.mirQ(q[pre + n]);
    // ---------- leg
    const Lg = pose['leg' + side] || { foot: [s * 0.12, 0, 0] };
    const Qhm = _aq[9].copy(Qh); if (s < 0) Anim.mirQ(Qhm);
    const qth = _aq[10], qkn = _aq[11], qft = _aq[12];
    if (Lg.foot) {
      const J = _av[1].copy(Anim.HIP).applyQuaternion(Qhm); J.x += s * out.hips.x; J.y += out.hips.y; J.z += out.hips.z;   // hips.x mirrored
      const T = _av[2].set(s * Lg.foot[0], Lg.foot[1] + Anim.ANKLE, Lg.foot[2]);
      const n = _av[3].subVectors(T, J); let D = n.length(); const l1 = Anim.L1, l2 = Anim.L2; D = U.clamp(D, 0.15, l1 + l2 - 0.003); n.normalize();
      const ca = U.clamp((l1 * l1 + D * D - l2 * l2) / (2 * l1 * D), -1, 1), al = Math.acos(ca);
      const kn = PI - Math.acos(U.clamp((l1 * l1 + l2 * l2 - D * D) / (2 * l1 * l2), -1, 1));
      const pole = _av[4]; if (Lg.knee) pole.set(s * Lg.knee[0], Lg.knee[1], Lg.knee[2]); else pole.set(0.10, 0, 1); pole.normalize();
      pole.addScaledVector(n, -pole.dot(n)); if (pole.lengthSq() < 1e-5) pole.set(0, 0, 1).addScaledVector(n, -n.z); pole.normalize();
      const td = _av[5].copy(n).multiplyScalar(Math.cos(al)).addScaledVector(pole, Math.sin(al));
      const hinge = _av[6].crossVectors(pole, n).normalize();
      const inv = _aq[13].copy(Qhm).invert(); td.applyQuaternion(inv).normalize(); hinge.applyQuaternion(inv);
      qth.setFromUnitVectors(ANY, td);
      const h0 = _av[7].copy(AX).applyQuaternion(qth);
      const tau = Math.atan2(_av[8].crossVectors(h0, hinge).dot(td), h0.dot(hinge));
      qth.premultiply(_aq[14].setFromAxisAngle(td, tau));
      qkn.setFromAxisAngle(AX, kn);
      _e.set(Lg.ft || 0, (Lg.yaw || 0), 0, 'YXZ'); qft.setFromEuler(_e);
      qft.premultiply(_aq[15].copy(Qhm).multiply(qth).multiply(qkn).invert());
    } else {
      const dl = _av[1].set(s * Lg.d[0], Lg.d[1], Lg.d[2]).normalize();
      if (Lg.cs) dl.applyQuaternion(_aq[13].copy(Qhm).invert());
      qth.setFromUnitVectors(ANY, dl); if (Lg.tw) qth.multiply(_aq[14].setFromAxisAngle(AY, Lg.tw));
      qkn.setFromAxisAngle(AX, Math.max(0, Lg.kn || 0)); qft.setFromAxisAngle(AX, Lg.ft === undefined ? 0.5 : Lg.ft);
    }
    q[pre + 'thigh'].copy(qth); q[pre + 'shin'].copy(qkn); q[pre + 'foot'].copy(qft); q[pre + 'toe'].setFromAxisAngle(AX, Lg.toe || 0);
    if (s < 0) for (const n of ['thigh', 'shin', 'foot', 'toe']) Anim.mirQ(q[pre + n]);
  }
  return out;
};

Anim.copy = function (dst, src) { for (const b of Anim.BONES) dst.q[b].copy(src.q[b]); dst.hips.copy(src.hips); return dst; };
Anim.blend = function (dst, a, b, t) { for (const n of Anim.BONES) dst.q[n].copy(a.q[n]).slerp(b.q[n], t); dst.hips.lerpVectors(a.hips, b.hips, t); return dst; };
Anim.toward = function (cur, target, k) { for (const n of Anim.BONES) cur.q[n].slerp(target.q[n], k); cur.hips.lerp(target.hips, k); };
Anim.apply = function (rig, solved) {
  const B = rig.bones; for (const n of Anim.BONES) B[n].quaternion.copy(solved.q[n]); B.hips.position.copy(solved.hips);
};

/* mirror a pose spec left<->right */
Anim.mirror = function (p) {
  const m = {}; const neg = a => a ? [a[0] || 0, -(a[1] || 0), -(a[2] || 0)] : a;
  for (const k of ['hips', 'spine', 'chest', 'neck', 'head']) if (p[k]) m[k] = neg(p[k]);
  if (p.root) m.root = Object.assign({}, p.root, { x: -(p.root.x || 0) });
  const arm = a => { if (!a) return a; const o = Object.assign({}, a); if (a.d) o.d = [-a.d[0], a.d[1], a.d[2]]; if (a.aimW) o.aimW = a.aimW; return o; };
  const leg = a => { if (!a) return a; const o = Object.assign({}, a); if (a.d) o.d = [-a.d[0], a.d[1], a.d[2]]; if (a.foot) o.foot = [-a.foot[0], a.foot[1], a.foot[2]]; if (a.knee) o.knee = [-a.knee[0], a.knee[1], a.knee[2]]; if (a.yaw) o.yaw = -a.yaw; return o; };
  m.armL = arm(p.armR); m.armR = arm(p.armL); m.legL = leg(p.legR); m.legR = leg(p.legL); m.handL = p.handR; m.handR = p.handL;
  return m;
};
/* blend two pose SPECS is not meaningful (IK vs FK) — blend solved poses instead. Helper for keyframed moves: */
Anim.keys = function (track, t, tmpA, tmpB, out, rootQ) {   // track: [[time, pose, ease?], ...]
  let i = 0; while (i < track.length - 1 && t >= track[i + 1][0]) i++;
  const a = track[i], b = track[Math.min(i + 1, track.length - 1)];
  if (a === b || t <= a[0]) return Anim.solve(a[1], out, rootQ);
  let k = U.sat((t - a[0]) / (b[0] - a[0])); const ez = b[2] || 'io'; k = ez === 'out' ? U.easeOut(k) : ez === 'in' ? k * k : ez === 'lin' ? k : U.ease(k);
  Anim.solve(a[1], tmpA, rootQ); Anim.solve(b[1], tmpB, rootQ); return Anim.blend(out, tmpA, tmpB, k);
};

/* ===================== pose library ===================== */
const POSE = {};
POSE.idle = (t) => ({ root: { y: -0.045 + Math.sin(t * 1.6) * 0.004 }, hips: [-0.03, 0.10, 0], spine: [0.03 + Math.sin(t * 1.6) * 0.012, -0.05, 0], chest: [-0.03 + Math.sin(t * 1.6 + 0.5) * 0.015, -0.05, 0], neck: [0.04, 0, 0], head: [0.02, Math.sin(t * 0.4) * 0.12, 0],
  armL: { d: [0.30, -0.93, 0.10], el: 0.38, tw: 0.3 }, armR: { d: [-0.32, -0.92, 0.04], el: 0.30, tw: 0.3 }, legL: { foot: [0.15, 0, 0.06], yaw: 0.25 }, legR: { foot: [-0.14, 0, -0.07], yaw: -0.2 }, handL: 'relax', handR: 'relax' });
POSE.run = (ph, s) => {   // s: 0 jog .. 1 sprint
  const st = 0.30 + 0.30 * s, lift = 0.16 + 0.26 * s, c = Math.cos(ph), sn = Math.sin(ph);
  const fz = p => st * Math.cos(p) + 0.04, fy = p => { const k = Math.sin(p - PI); return k > 0 ? lift * k + (Math.cos(p) < 0 ? 0.10 * s * k : 0) : 0; };
  const ft = p => { const k = Math.sin(p - PI); return k > 0 ? 0.9 * k : -0.25 * Math.max(0, Math.cos(p)); };
  return { root: { y: -0.05 - 0.03 * s + 0.035 * Math.cos(ph * 2) }, hips: [0.10 + 0.12 * s, -0.10 * c, 0.04 * sn], spine: [0.10 + 0.10 * s, 0.06 * c, 0], chest: [0.06 + 0.06 * s, 0.16 * c, 0], neck: [-0.10 - 0.08 * s, -0.06 * c, 0], head: [-0.08 - 0.06 * s, -0.04 * c, 0],
    armL: { d: [0.22, -0.72, -0.62 * c], el: 1.45 + 0.25 * c, tw: 0.2 }, armR: { d: [-0.22, -0.72, 0.62 * c], el: 1.45 - 0.25 * c, tw: 0.2 },
    legL: { foot: [0.09, fy(ph), fz(ph)], ft: ft(ph) }, legR: { foot: [-0.09, fy(ph + PI), fz(ph + PI)], ft: ft(ph + PI) }, handL: 'fist', handR: 'fist' };
};
POSE.crouch = (t) => ({ root: { y: -0.50 + Math.sin(t * 1.5) * 0.004, z: -0.04 }, hips: [0.55, 0, 0], spine: [0.28, 0, 0], chest: [0.12, 0.12, 0], neck: [-0.35, -0.06, 0], head: [-0.42, Math.sin(t * 0.5) * 0.2, 0],
  armL: { d: [0.18, -0.92, 0.36], el: 0.12, tw: 0.4 }, armR: { d: [-0.62, -0.55, -0.45], el: 0.9, tw: 0.3 }, legL: { foot: [0.27, 0, 0.12], knee: [0.75, 0, 0.66], yaw: 0.55 }, legR: { foot: [-0.30, 0, -0.10], knee: [-0.80, 0, 0.6], yaw: -0.6, ft: 0.0 }, handL: 'splay', handR: 'relax' });
POSE.jump = () => ({ root: { y: 0.0 }, hips: [0.05, 0, 0], spine: [-0.08, 0, 0], chest: [-0.12, 0, 0], head: [-0.15, 0, 0],
  armL: { d: [0.45, -0.75, -0.40], el: 0.5 }, armR: { d: [-0.40, -0.35, 0.55], el: 0.9 }, legL: { d: [0.10, -0.55, 0.80], kn: 1.5, ft: 0.7 }, legR: { d: [-0.08, -0.97, -0.20], kn: 0.35, ft: 0.9 }, handL: 'open', handR: 'open' });
POSE.fall = (t) => ({ hips: [0.12, 0, 0], spine: [0.10, 0, 0], chest: [0.05, 0, 0], head: [0.25, 0, 0],
  armL: { d: [0.72, 0.42 + Math.sin(t * 9) * 0.08, 0.30], el: 0.55 }, armR: { d: [-0.72, 0.38 + Math.sin(t * 9 + 1.7) * 0.08, 0.30], el: 0.55 },
  legL: { d: [0.22, -0.80, 0.42], kn: 0.95, ft: 0.5 }, legR: { d: [-0.20, -0.92, 0.10], kn: 0.75 + Math.sin(t * 7) * 0.1, ft: 0.5 }, handL: 'open', handR: 'open' });
POSE.dive = () => ({ hips: [-0.05, 0, 0], spine: [-0.10, 0, 0], chest: [-0.12, 0, 0], neck: [-0.30, 0, 0], head: [-0.35, 0, 0],
  armL: { d: [0.28, -0.93, -0.22], el: 0.10, tw: -0.5 }, armR: { d: [-0.28, -0.93, -0.22], el: 0.10, tw: -0.5 }, legL: { d: [0.07, -0.99, -0.08], kn: 0.10, ft: 1.0 }, legR: { d: [-0.07, -0.99, -0.05], kn: 0.18, ft: 1.0 }, handL: 'open', handR: 'open' });
POSE.soar = () => ({ hips: [-0.10, 0, 0], spine: [-0.18, 0, 0], chest: [-0.20, 0, 0], neck: [-0.2, 0, 0], head: [-0.3, 0, 0],
  armL: { d: [0.80, -0.20, -0.52], el: 0.25 }, armR: { d: [-0.80, -0.20, -0.52], el: 0.25 }, legL: { d: [0.10, -0.85, -0.50], kn: 0.9, ft: 1.0 }, legR: { d: [-0.10, -0.97, -0.22], kn: 0.25, ft: 1.0 }, handL: 'open', handR: 'open' });
POSE.tuck = () => ({ hips: [0.5, 0, 0], spine: [0.45, 0, 0], chest: [0.35, 0, 0], neck: [0.3, 0, 0], head: [0.3, 0, 0],
  armL: { d: [0.30, -0.55, 0.78], el: 1.6 }, armR: { d: [-0.30, -0.55, 0.78], el: 1.6 }, legL: { d: [0.14, -0.10, 0.98], kn: 2.2, ft: 0.8 }, legR: { d: [-0.14, -0.10, 0.98], kn: 2.2, ft: 0.8 }, handL: 'fist', handR: 'fist' });
/* swing: holding arm = LEFT in these specs (mirror for right). k: -1 start of arc .. 0 bottom .. +1 top of the rise */
POSE.swingBack = (aim) => ({ hips: [-0.18, 0.18, 0], spine: [-0.16, 0.10, 0.05], chest: [-0.14, 0.12, 0.08], neck: [0.05, -0.1, 0], head: [0.10, -0.15, 0],
  armL: { aimW: aim, d: [0.15, 0.95, 0.2], el: 0.18, tw: 1.2 }, armR: { d: [-0.55, -0.62, -0.55], el: 0.45 }, legL: { d: [0.10, -0.86, -0.50], kn: 0.85, ft: 1.0 }, legR: { d: [-0.10, -0.95, -0.30], kn: 0.45, ft: 1.0 }, handL: 'grip', handR: 'open' });
POSE.swingMid = (aim) => ({ hips: [0.05, 0.10, 0], spine: [0.08, 0.05, 0], chest: [0.05, 0.08, 0.05], neck: [-0.1, 0, 0], head: [-0.12, -0.05, 0],
  armL: { aimW: aim, d: [0.12, 0.97, 0.1], el: 0.35, tw: 1.2 }, armR: { d: [-0.50, -0.70, -0.30], el: 0.6 }, legL: { d: [0.10, -0.80, 0.58], kn: 0.30, ft: 0.9 }, legR: { d: [-0.08, -0.86, 0.50], kn: 0.42, ft: 0.9 }, handL: 'grip', handR: 'relax' });
POSE.swingFront = (aim) => ({ hips: [0.35, 0.0, 0], spine: [0.22, 0, 0], chest: [0.10, -0.10, 0], neck: [-0.2, 0, 0], head: [-0.25, 0, 0],
  armL: { aimW: aim, d: [0.10, 0.9, -0.3], el: 0.75, tw: 1.2 }, armR: { d: [-0.30, 0.35, 0.88], el: 0.5, tw: 2.4 }, legL: { d: [0.14, -0.35, 0.93], kn: 1.75, ft: 0.8 }, legR: { d: [-0.12, -0.55, 0.82], kn: 1.35, ft: 0.8 }, handL: 'grip', handR: 'thwip' });
POSE.zip = (aim) => ({ hips: [0.10, 0, 0], spine: [-0.05, 0, 0], chest: [-0.12, 0, 0], neck: [-0.3, 0, 0], head: [-0.35, 0, 0],
  armL: { aimW: aim, d: [0.12, 0.2, 0.97], el: 0.35, tw: 1.5 }, armR: { aimW: aim, d: [-0.12, 0.2, 0.97], el: 0.45, tw: 1.5 }, legL: { d: [0.10, -0.80, -0.58], kn: 0.5, ft: 1.0 }, legR: { d: [-0.10, -0.60, -0.10], kn: 1.5, ft: 1.0 }, handL: 'grip', handR: 'grip' });
POSE.wallCling = (t) => ({ root: { y: -0.62, z: 0.0 }, hips: [0.30, 0, 0], spine: [0.10, 0, 0], chest: [-0.05, 0, 0], neck: [-0.45, 0, 0], head: [-0.5, Math.sin(t * 0.6) * 0.25, 0],
  armL: { d: [0.50, -0.30, 0.80], el: 1.0, tw: 0.2 }, armR: { d: [-0.45, -0.62, 0.62], el: 0.75, tw: 0.2 }, legL: { foot: [0.34, 0.0, 0.18], knee: [0.9, 0, 0.4], yaw: 0.8 }, legR: { foot: [-0.32, 0, -0.24], knee: [-0.9, 0, 0.35], yaw: -0.8 }, handL: 'splay', handR: 'splay' });
POSE.wallCrawl = (ph) => { const c = Math.cos(ph), s = Math.sin(ph); return { root: { y: -0.63 + 0.015 * Math.cos(ph * 2) }, hips: [0.30, 0.08 * c, 0.06 * s], spine: [0.10, -0.06 * c, 0], chest: [-0.05, -0.08 * c, 0], neck: [-0.45, 0, 0], head: [-0.5, 0, 0],
  armL: { d: [0.45, -0.32 - 0.22 * c, 0.78 + 0.1 * c], el: 0.95 + 0.4 * c, tw: 0.2 }, armR: { d: [-0.45, -0.32 + 0.22 * c, 0.78 - 0.1 * c], el: 0.95 - 0.4 * c, tw: 0.2 },
  legL: { foot: [0.33, Math.max(0, -s) * 0.05, 0.02 - 0.2 * c], knee: [0.9, 0, 0.4], yaw: 0.8 }, legR: { foot: [-0.33, Math.max(0, s) * 0.05, 0.02 + 0.2 * c], knee: [-0.9, 0, 0.4], yaw: -0.8 }, handL: 'splay', handR: 'splay' }; };
POSE.land = () => ({ root: { y: -0.56, z: 0.02 }, hips: [0.62, 0, 0], spine: [0.30, 0, 0], chest: [0.10, 0, 0], neck: [-0.2, 0, 0], head: [-0.15, 0, 0],
  armL: { d: [0.20, -0.90, 0.40], el: 0.10 }, armR: { d: [-0.85, -0.10, -0.50], el: 0.5 }, legL: { foot: [0.24, 0, 0.20], knee: [0.55, 0, 0.83] }, legR: { foot: [-0.26, 0, -0.30], knee: [-0.5, 0, 0.85], ft: 0.6 }, handL: 'fist', handR: 'open' });
/* ---- combat ---- */
POSE.guard = (t) => ({ root: { y: -0.10 + Math.sin(t * 5) * 0.012 }, hips: [0.08, -0.45, 0], spine: [0.08, 0.15, 0], chest: [0.06, 0.20, 0], neck: [0, 0.1, 0], head: [-0.02, 0.02, 0],
  armL: { d: [0.22, -0.25, 0.92], el: 1.75, tw: 0.7 }, armR: { d: [-0.38, -0.55, 0.60], el: 2.0, tw: 0.7 }, legL: { foot: [0.16, 0, 0.26], yaw: 0.1 }, legR: { foot: [-0.18, 0, -0.26], yaw: -0.6 }, handL: 'fist', handR: 'fist' });
POSE.windR = () => ({ root: { y: -0.14 }, hips: [0.06, -0.75, 0], spine: [0.10, -0.15, 0], chest: [0.05, -0.25, 0], head: [0, 0.75, 0],
  armL: { d: [0.30, -0.20, 0.90], el: 1.6, tw: 0.7 }, armR: { d: [-0.62, -0.30, -0.45], el: 2.1, tw: 0.4 }, legL: { foot: [0.15, 0, 0.30] }, legR: { foot: [-0.20, 0, -0.28], yaw: -0.7 }, handL: 'fist', handR: 'fist' });
POSE.punchR = () => ({ root: { y: -0.12, z: 0.16 }, hips: [0.10, 0.45, 0], spine: [0.10, 0.25, 0], chest: [0.06, 0.40, 0], head: [0, -0.85, 0],
  armL: { d: [0.45, -0.55, -0.20], el: 1.9, tw: 0.5 }, armR: { d: [-0.04, 0.06, 1.0], cs: true, el: 0.04, tw: 1.4 }, legL: { foot: [0.16, 0, 0.42] }, legR: { foot: [-0.18, 0, -0.34], yaw: -0.5, ft: 0.5 }, handL: 'fist', handR: 'fist' });
POSE.windL = () => Anim.mirror(POSE.windR()); POSE.punchL = () => Anim.mirror(POSE.punchR());
POSE.kickWind = () => ({ root: { y: -0.06 }, hips: [-0.05, -0.55, 0.05], spine: [0.05, 0.1, 0], chest: [0, 0.2, 0], head: [0, 0.3, 0],
  armL: { d: [0.50, -0.30, 0.65], el: 1.5 }, armR: { d: [-0.60, -0.55, -0.10], el: 1.2 }, legL: { foot: [0.10, 0, 0.0], yaw: 0.5 }, legR: { d: [-0.20, -0.45, 0.85], kn: 2.0, ft: 0.3 }, handL: 'fist', handR: 'fist' });
POSE.kickR = () => ({ root: { y: -0.02, z: 0.10 }, hips: [-0.25, 0.95, -0.30], spine: [-0.05, -0.30, 0.1], chest: [0.0, -0.35, 0.1], head: [0.1, -0.35, 0],
  armL: { d: [0.55, -0.35, -0.35], el: 1.0 }, armR: { d: [-0.45, -0.30, 0.55], el: 1.5 }, legL: { foot: [0.05, 0, -0.08], yaw: 1.1 }, legR: { d: [-0.05, 0.10, 1.0], cs: true, kn: 0.06, ft: 0.0 }, handL: 'fist', handR: 'fist' });
POSE.upperWind = () => ({ root: { y: -0.40 }, hips: [0.35, -0.5, 0], spine: [0.25, -0.1, 0], chest: [0.1, -0.2, 0], head: [-0.3, 0.6, 0],
  armL: { d: [0.30, -0.30, 0.85], el: 1.7 }, armR: { d: [-0.35, -0.90, -0.20], el: 1.4 }, legL: { foot: [0.18, 0, 0.28], knee: [0.4, 0, 0.9] }, legR: { foot: [-0.2, 0, -0.22], knee: [-0.4, 0, 0.9], ft: 0.5 }, handL: 'fist', handR: 'fist' });
POSE.upper = () => ({ root: { y: 0.10, z: 0.10 }, hips: [-0.10, 0.35, 0], spine: [-0.15, 0.2, 0], chest: [-0.2, 0.3, 0], head: [-0.2, -0.5, 0],
  armL: { d: [0.50, -0.75, -0.30], el: 1.0 }, armR: { d: [-0.12, 0.90, 0.42], el: 0.75, tw: 1.6 }, legL: { d: [0.10, -0.98, 0.10], kn: 0.15, ft: 0.9 }, legR: { d: [-0.12, -0.80, 0.50], kn: 1.3, ft: 0.8 }, handL: 'fist', handR: 'fist' });
POSE.airKick = () => ({ hips: [-0.55, 0, 0], spine: [0.15, 0, 0], chest: [0.2, 0, 0], head: [0.3, 0, 0],
  armL: { d: [0.75, 0.10, -0.55], el: 0.5 }, armR: { d: [-0.75, 0.10, -0.55], el: 0.5 }, legL: { d: [0.05, -0.35, 0.94], kn: 0.05, ft: 0.0 }, legR: { d: [-0.12, -0.50, 0.55], kn: 1.9, ft: 0.8 }, handL: 'fist', handR: 'fist' });
POSE.shootR = (aim) => ({ root: { y: -0.08 }, hips: [0.04, 0.35, 0], spine: [0.04, 0.15, 0], chest: [0.02, 0.25, 0], head: [0, -0.6, 0],
  armL: { d: [0.45, -0.70, -0.10], el: 1.2 }, armR: { aimW: aim, d: [-0.05, 0.05, 1.0], el: 0.06, tw: 2.9 }, legL: { foot: [0.17, 0, 0.30] }, legR: { foot: [-0.18, 0, -0.26], yaw: -0.5 }, handL: 'fist', handR: 'thwip' });
POSE.hit = () => ({ root: { y: -0.08, z: -0.12 }, hips: [-0.15, 0.2, 0], spine: [-0.25, 0.1, 0.1], chest: [-0.25, 0.2, 0.1], neck: [-0.2, 0, 0], head: [-0.35, 0.3, 0.1],
  armL: { d: [0.75, -0.25, 0.35], el: 1.0 }, armR: { d: [-0.70, -0.45, 0.20], el: 0.8 }, legL: { foot: [0.18, 0, -0.10] }, legR: { foot: [-0.20, 0, -0.38], ft: 0.3 }, handL: 'open', handR: 'open' });
POSE.launched = (t) => ({ hips: [-0.35, 0, 0.1], spine: [-0.3, 0, 0], chest: [-0.3, 0.1, 0], neck: [-0.3, 0, 0], head: [-0.4, 0, 0],
  armL: { d: [0.80, 0.35 + Math.sin(t * 11) * 0.15, 0.30], el: 0.6 }, armR: { d: [-0.75, 0.20 + Math.cos(t * 9) * 0.15, 0.35], el: 0.7 }, legL: { d: [0.30, -0.70, 0.55], kn: 0.9 + Math.sin(t * 8) * 0.2, ft: 0.4 }, legR: { d: [-0.25, -0.88, 0.25], kn: 0.6, ft: 0.4 }, handL: 'open', handR: 'open' });
POSE.down = () => ({ root: { y: -0.84, z: -0.1 }, hips: [-1.50, 0.0, 0.08], spine: [-0.05, 0.05, 0], chest: [0.0, 0.1, 0], neck: [0.1, 0.3, 0], head: [0.1, 0.5, 0],
  armL: { d: [0.90, 0.30, -0.10], el: 0.7 }, armR: { d: [-0.85, -0.45, -0.05], el: 0.4 }, legL: { d: [0.28, -0.95, 0.05], kn: 0.25, ft: 0.6 }, legR: { d: [-0.22, -0.90, 0.25], kn: 0.75, ft: 0.6 }, handL: 'relax', handR: 'relax' });
POSE.webbed = (t) => ({ root: { y: -0.04 }, hips: [0.05, Math.sin(t * 9) * 0.10, 0], spine: [0.1, Math.sin(t * 9 + 1) * 0.12, 0], chest: [0.05, Math.sin(t * 11) * 0.10, 0], head: [0.15, Math.sin(t * 7) * 0.4, 0],
  armL: { d: [0.12, -0.98, 0.10], el: 0.25 }, armR: { d: [-0.12, -0.98, 0.10], el: 0.25 }, legL: { foot: [0.09, 0, 0.0] }, legR: { foot: [-0.09, 0, 0.0] }, handL: 'fist', handR: 'fist' });
POSE.dodge = () => ({ root: { y: -0.35 }, hips: [0.6, 0, 0], spine: [0.4, 0, 0], chest: [0.3, 0, 0], head: [0.2, 0, 0],
  armL: { d: [0.55, 0.20, 0.80], el: 0.6 }, armR: { d: [-0.55, 0.20, 0.80], el: 0.6 }, legL: { d: [0.22, -0.40, 0.88], kn: 1.9, ft: 0.8 }, legR: { d: [-0.22, -0.55, 0.78], kn: 1.6, ft: 0.8 }, handL: 'open', handR: 'open' });
/* ---- enemies ---- */
POSE.thugIdle = (t) => ({ root: { y: -0.03 + Math.sin(t * 1.4) * 0.004 }, hips: [0, 0.2, 0.03], spine: [0.08, -0.1, 0], chest: [0.06, -0.1, 0], head: [0.05, Math.sin(t * 0.5) * 0.3, 0],
  armL: { d: [0.28, -0.95, 0.06], el: 0.35 }, armR: { d: [-0.30, -0.93, 0.10], el: 0.5 }, legL: { foot: [0.16, 0, 0.04], yaw: 0.3 }, legR: { foot: [-0.15, 0, -0.04], yaw: -0.3 }, handL: 'relax', handR: 'grip' });
POSE.thugWalk = (ph, s) => { const c = Math.cos(ph); const fz = p => (0.22 + 0.14 * s) * Math.cos(p), fy = p => Math.max(0, Math.sin(p - PI)) * (0.09 + 0.1 * s);
  return { root: { y: -0.07 + 0.015 * Math.cos(ph * 2) }, hips: [0.06 + 0.08 * s, -0.08 * c, 0], spine: [0.08 + 0.08 * s, 0.05 * c, 0], chest: [0.05, 0.10 * c, 0], head: [-0.06, 0, 0],
    armL: { d: [0.32, -0.80, -0.36 * c + 0.1], el: 0.8 + 0.5 * s, tw: 0.2 }, armR: { d: [-0.32, -0.70, 0.30 * c + 0.25], el: 1.3, tw: 0.2 }, legL: { foot: [0.12, fy(ph), fz(ph)] }, legR: { foot: [-0.12, fy(ph + PI), fz(ph + PI)] }, handL: 'fist', handR: 'grip' }; };
POSE.thugWind = () => ({ root: { y: -0.12 }, hips: [0.05, -0.6, 0], spine: [0.05, -0.2, 0], chest: [0, -0.35, 0], head: [0, 0.8, 0],
  armL: { d: [0.35, -0.35, 0.80], el: 1.4 }, armR: { d: [-0.45, 0.62, -0.55], el: 1.5, tw: 0.8 }, legL: { foot: [0.16, 0, 0.26] }, legR: { foot: [-0.2, 0, -0.26], yaw: -0.6 }, handL: 'fist', handR: 'grip' });
POSE.thugStrike = () => ({ root: { y: -0.16, z: 0.18 }, hips: [0.18, 0.5, 0], spine: [0.18, 0.3, 0], chest: [0.12, 0.45, 0], head: [-0.1, -0.9, 0],
  armL: { d: [0.55, -0.60, -0.25], el: 1.3 }, armR: { d: [0.10, -0.35, 0.95], el: 0.25, tw: 1.0 }, legL: { foot: [0.17, 0, 0.44] }, legR: { foot: [-0.2, 0, -0.30], ft: 0.5, yaw: -0.4 }, handL: 'fist', handR: 'grip' });
POSE.thugAim = (aim) => ({ root: { y: -0.10 }, hips: [0.05, 0.3, 0], spine: [0.06, 0.1, 0], chest: [0.04, 0.2, 0], head: [0.02, -0.5, 0],
  armL: { aimW: aim, d: [0.10, 0.0, 1.0], el: 0.55, tw: 1.2 }, armR: { aimW: aim, d: [-0.06, 0.0, 1.0], el: 0.15, tw: 1.5 }, legL: { foot: [0.17, 0, 0.26] }, legR: { foot: [-0.18, 0, -0.24], yaw: -0.5 }, handL: 'grip', handR: 'grip' });
POSE.bruteWind = () => ({ root: { y: -0.12 }, hips: [-0.1, 0, 0], spine: [-0.2, 0, 0], chest: [-0.25, 0, 0], head: [0.2, 0, 0],
  armL: { d: [0.35, 0.90, -0.20], el: 0.9 }, armR: { d: [-0.35, 0.90, -0.20], el: 0.9 }, legL: { foot: [0.24, 0, 0.12] }, legR: { foot: [-0.24, 0, -0.12] }, handL: 'fist', handR: 'fist' });
POSE.bruteSlam = () => ({ root: { y: -0.42, z: 0.2 }, hips: [0.6, 0, 0], spine: [0.4, 0, 0], chest: [0.3, 0, 0], head: [-0.4, 0, 0],
  armL: { d: [0.22, -0.75, 0.62], el: 0.3 }, armR: { d: [-0.22, -0.75, 0.62], el: 0.3 }, legL: { foot: [0.28, 0, 0.2], knee: [0.5, 0, 0.85] }, legR: { foot: [-0.28, 0, -0.1], knee: [-0.5, 0, 0.85] }, handL: 'fist', handR: 'fist' });


'use strict';
/* ==== p31_player.js ==== */
/* p31: the player. Physics runs on the body's centre (a 0.5 m sphere vs. AABBs + a floor query); the rig root hangs 0.9 m below
   along the body's own up-vector, which is what lets the same code stand on streets, run up walls and hang from a web. */

const PL = { G: 26, R: 0.5, H: 0.9, JOG: 6.8, SPRINT: 12.8, JUMP: 10.8, AIR_ACC: 17, SWING_ACC: 8.5, SWING_MAX: 31, ZIP: 62, CRAWL: 3.8, WALLRUN: 12.5, TERM: 78 };

const Player = {
  pos: new V3(), vel: new V3(), yaw: 0, state: 'air', stateT: 0,
  up: new V3(0, 1, 0), fwd: new V3(0, 0, 1), quat: new Q4(), rootOff: 0.9,
  hp: 200, maxHp: 200, focus: 0, maxFocus: 3, lastHurtT: -99, dead: false, invuln: 0,
  web: { active: false, anchor: new V3(), len: 10, target: 10, side: 1, t: 0, taut: false, blockedT: 0 }, webCD: 0, lastSide: -1, airZipCD: 0,
  zip: null, zipTarget: null, perchT: 0, wallN: new V3(), wallBox: null, wallRunT: 0,
  act: null, runPh: 0, animT: 0, trick: null, flip: 0, roll: 0, airT: 0, landT: 0, coyote: 0, lastSafe: new V3(), speed: 0, hSpeed: 0,
  moveW: new V3(), wantMove: false, combatT: 0, diving: false, lean: 0, swingCount: 0, maxAlt: 0,
};

Player.init = function () {
  Player.rig = Hero.rig;
  const b = CITY.buildings.find(x => x.name === 'IMPERIAL STATE TOWER'), t = b.tiers[4];
  Player.titlePerch = { x: t.x0 + 0.15, y: t.y1 + City.PARAPET, z: (t.z0 + t.z1) / 2 + 3, yaw: -PI / 2 - 0.25 };
  Player.setPerch(Player.titlePerch.x, Player.titlePerch.y, Player.titlePerch.z, Player.titlePerch.yaw);
};
Player.feetY = () => Player.pos.y - PL.H;
Player.setState = function (s) { if (Player.state !== s) { Player.prev = Player.state; Player.state = s; Player.stateT = 0; } };
Player.setPerch = function (x, y, z, yaw) { Player.pos.set(x, y + PL.H, z); Player.vel.set(0, 0, 0); Player.yaw = yaw; Player.setState('perch'); Player.perchT = 1; Player.web.active = false; Player.up.set(0, 1, 0); };
Player.teleport = function (x, y, z) { Player.pos.set(x, y, z); Player.vel.set(0, 0, 0); Player.web.active = false; Player.zip = null; Player.act = null; Player.setState('air'); };
Player.debugLine = function () { const p = Player; return `${p.state} ${U.fmt(p.stateT)}s  pos ${U.fmt(p.pos.x, 0)} ${U.fmt(p.pos.y, 0)} ${U.fmt(p.pos.z, 0)}  spd ${U.fmt(p.speed)}  hp ${p.hp | 0}  act ${p.act ? p.act.type : '-'}`; };

/* ---------- web anchor search ---------- */
const _pa = new V3(), _pb = new V3(), _pc = new V3(), _pd = new V3(), _pe = new V3();
Player.findAnchor = function (dir) {
  const P = Player, sp = P.hSpeed;
  const ahead = U.clamp(13 + sp * 0.62, 13, 40), upH = U.clamp(21 + sp * 0.40, 21, 44);
  const rx = -dir.z, rz = dir.x;                       // char-left of travel is (dir.z, -dir.x); we use right = (-dir.z, dir.x)
  let best = null, bestScore = 1e9;
  const sides = [-P.lastSide, P.lastSide];
  for (let si = 0; si < 2; si++) {
    const side = sides[si];
    for (const lat of [11, 20]) {
      const tx = P.pos.x + dir.x * ahead + rx * side * lat, tz = P.pos.z + dir.z * ahead + rz * side * lat, ty = P.pos.y + upH;
      World.query(tx - 34, tx + 34, tz - 34, tz + 34, (b) => {
        if (b.kind !== 0 || b.y1 < P.pos.y + 7) return;
        let cx = U.clamp(tx, b.x0, b.x1), cz = U.clamp(tz, b.z0, b.z1);
        if (cx === tx && cz === tz) {   // target is over the footprint → slide to the face nearest the player
          const dx0 = Math.abs(P.pos.x - b.x0), dx1 = Math.abs(P.pos.x - b.x1), dz0 = Math.abs(P.pos.z - b.z0), dz1 = Math.abs(P.pos.z - b.z1);
          const px = P.pos.x < b.x0 ? b.x0 : P.pos.x > b.x1 ? b.x1 : null, pz = P.pos.z < b.z0 ? b.z0 : P.pos.z > b.z1 ? b.z1 : null;
          if (px !== null && (pz === null || Math.min(dx0, dx1) >= Math.min(dz0, dz1))) cx = px; else if (pz !== null) cz = pz; else return;
        }
        const cy = Math.min(ty, b.y1 - 0.4); if (cy < P.pos.y + 7) return;
        const dx = cx - P.pos.x, dy = cy - P.pos.y, dz = cz - P.pos.z, L = Math.hypot(dx, dy, dz);
        if (L < 9 || L > 70) return;
        const horiz = Math.hypot(dx, dz); if (horiz > dy * 2.1) return;
        const fwdness = (dx * dir.x + dz * dir.z) / (horiz + 1e-3);
        let score = Math.hypot(cx - tx, cy - ty, cz - tz) + (fwdness < 0.15 ? 40 * (0.15 - fwdness) : 0) + si * 5 + (lat > 12 ? 3 : 0);
        if (score >= bestScore) return;
        const h = World.ray(P.pos.x, P.pos.y, P.pos.z, dx, dy, dz, 1, bb => bb.kind === 0);
        if (h && h.t * L < L - 1.2) return;
        bestScore = score; best = best || {}; best.x = cx; best.y = cy; best.z = cz; best.side = side; best.L = L; best.box = b;
      });
    }
    if (best && bestScore < 26) break;
  }
  return best;
};

Player.startSwing = function () {
  const P = Player, dir = _pa;
  // travel direction: mostly where we are already going, nudged by stick and camera
  const camF = _pb.set(Math.sin(Cam.yaw), 0, Math.cos(Cam.yaw));
  dir.set(P.vel.x, 0, P.vel.z); const hs = dir.length();
  if (hs > 4) dir.multiplyScalar(1 / hs).multiplyScalar(0.55).addScaledVector(P.wantMove ? P.moveW : camF, 0.45 + (P.wantMove ? 0.25 : 0)); else dir.copy(P.wantMove ? P.moveW : camF);
  dir.y = 0; if (dir.lengthSq() < 1e-4) dir.copy(camF); dir.normalize();
  const a = Player.findAnchor(dir); if (!a) return false;
  const W = P.web; W.active = true; W.anchor.set(a.x, a.y, a.z); W.side = a.side; W.t = 0; W.taut = false; W.blockedT = 0; W.first = true; W.box = a.box;
  // the rope constraint uses a point pulled most of the way back into the plane of travel, so a swing carries you
  // down the street instead of dragging you into the facade the web is stuck to (the visible line still goes to the real anchor)
  const lat = (a.x - P.pos.x) * -dir.z + (a.z - P.pos.z) * dir.x;
  W.phys = (W.phys || new V3()).set(a.x + dir.z * lat * 0.62, a.y, a.z - dir.x * lat * 0.62);
  a.L = W.phys.distanceTo(P.pos); W.len = a.L;
  // keep the bottom of the arc clear of whatever is below and ahead
  let clearY = 0; for (const k of [0, 0.35, 0.7, 1.0]) { const hx = P.pos.x + dir.x * a.L * k, hz = P.pos.z + dir.z * a.L * k; const h = City.heightAt(hx, hz); if (h < a.y - 8) clearY = Math.max(clearY, h); }
  W.startY = P.pos.y;
  W.target = U.clamp(a.y - Math.max(clearY + 5, P.pos.y - 24), 7, a.L);      // never dip more than ~24 m below where the swing began
  P.lastSide = a.side; P.setState('swing'); P.trick = null; P.diving = false; P.swingCount++;
  if (typeof FX !== 'undefined') FX.webShoot(a.side, W.anchor);
  return true;
};
Player.releaseSwing = function (jumped) {
  const P = Player, W = P.web; if (!W.active) return;
  W.active = false; P.webCD = 0.16;
  const rising = P.vel.y > -2, hs = Math.hypot(P.vel.x, P.vel.z);
  if (rising && hs > 6) {
    const k = jumped ? 1.0 : 0.55;
    P.vel.y += 4.5 * k + (jumped ? 3.5 : 0); const s = 1 + 0.06 * k; P.vel.x *= s; P.vel.z *= s;
    if (P.speed > 17 && !P.act) { const r = Math.random(); P.trick = { type: r < 0.45 ? 'flip' : r < 0.75 ? 'soar' : 'twist', t: 0, dur: r < 0.45 ? 0.72 : 0.85 }; }
  }
  if (typeof FX !== 'undefined') FX.webRelease();
  P.setState('air');
};

/* ---------- zip-to-point ---------- */
Player.findZipTarget = function () {
  const P = Player, c = GFX.camera, d = _pa; c.getWorldDirection(d);
  const o = c.position; let res = null;
  const h = World.ray(o.x, o.y, o.z, d.x, d.y, d.z, 95, b => b.kind === 0 || (b.kind === 3 && b.y1 - b.y0 > 2.5));
  if (h && h.box) {
    const px = o.x + d.x * h.t, py = o.y + d.y * h.t, pz = o.z + d.z * h.t, b = h.box;
    if (h.ny > 0.5) res = { x: px, y: World.topOf(b, px, pz), z: pz, kind: 'perch' };
    else if (b.y1 - py < 16) { const ix = px - h.nx * 0.25, iz = pz - h.nz * 0.25; res = { x: U.clamp(ix, b.x0 + 0.2, b.x1 - 0.2), y: b.y1 + (b.par ? City.PARAPET : 0), z: U.clamp(iz, b.z0 + 0.2, b.z1 - 0.2), kind: 'perch' }; }
    else res = { x: px + h.nx * 0.5, y: py, z: pz + h.nz * 0.5, kind: 'wall', nx: h.nx, nz: h.nz, box: b };
    const dist = Math.hypot(res.x - P.pos.x, res.y - P.pos.y, res.z - P.pos.z); if (dist < 7 || dist > 95) res = null;
  }
  return res;
};
Player.startZip = function (t) {
  const P = Player; if (P.web.active) { P.web.active = false; if (typeof FX !== 'undefined') FX.webRelease(); }
  const to = new V3(t.x, t.y + (t.kind === 'wall' ? 0 : PL.H), t.z), dist = to.distanceTo(P.pos);
  P.zip = { from: P.pos.clone(), to, t: 0, dur: Math.max(0.22, dist / PL.ZIP), kind: t.kind, tgt: t, dist };
  P.vel.set(0, 0, 0); P.trick = null; P.act = null; P.setState('zip');
  if (typeof FX !== 'undefined') FX.webZip(to);
};

/* ---------- damage ---------- */
Player.hurt = function (dmg, from, knock) {
  const P = Player; if (P.invuln > 0 || P.dead || SM.mode !== 'play') return false;
  P.hp -= dmg; P.lastHurtT = SM.time; P.invuln = 0.35;
  if (typeof HUD !== 'undefined') HUD.damage(dmg);
  if (typeof Cam !== 'undefined') Cam.shake(0.35 + dmg * 0.012);
  if (P.web.active) Player.releaseSwing(false);
  if (from) { _pa.subVectors(P.pos, from).setY(0).normalize(); P.vel.addScaledVector(_pa, knock || 5); P.vel.y = Math.max(P.vel.y, 2.5); }
  if (P.state === 'perch' || P.state === 'wall') P.setState('air');
  P.act = { type: 'hit', t: 0, dur: 0.38 };
  if (P.hp <= 0) { P.hp = 0; P.dead = true; P.act = { type: 'down', t: 0, dur: 2.6 }; if (typeof Flow !== 'undefined') Flow.onDeath(); }
  return true;
};
Player.heal = function () { const P = Player; if (P.focus >= 1 && P.hp < P.maxHp) { P.focus -= 1; P.hp = Math.min(P.maxHp, P.hp + 80); if (typeof FX !== 'undefined') FX.healBurst(P.pos); if (typeof Sfx !== 'undefined') Sfx.play('heal'); return true; } return false; };
Player.addFocus = a => { Player.focus = U.clamp(Player.focus + a, 0, Player.maxFocus); };

/* ---------- per-frame ---------- */
Player.update = function (dt) {
  const P = Player; P.stateT += dt; P.animT += dt; P.webCD -= dt; P.airZipCD -= dt; P.invuln -= dt; P.combatT -= dt;
  // camera-relative stick
  const cy = Cam.yaw, fx = Math.sin(cy), fz = Math.cos(cy);
  P.moveW.set(fx * IN.moveY - fz * IN.moveX, 0, fz * IN.moveY + fx * IN.moveX); P.wantMove = P.moveW.lengthSq() > 0.02; if (P.wantMove) P.moveW.normalize();
  if (P.dead) { P.moveW.set(0, 0, 0); P.wantMove = false; }
  const locked = P.act && (P.act.lock || P.act.type === 'hit' || P.act.type === 'down');
  if (!P.dead && !locked) Player.actions(dt);
  if (P.act) { P.act.t += dt; if (P.act.t >= P.act.dur) { const a = P.act; P.act = null; if (a.onEnd) a.onEnd(); } }
  // fixed-step physics
  let rem = Math.min(dt, 0.05); const h = 1 / 120;
  while (rem > 1e-5) { const s = Math.min(h, rem); Player.physics(s); rem -= s; }
  P.speed = P.vel.length(); P.hSpeed = Math.hypot(P.vel.x, P.vel.z);
  if (P.state === 'ground') P.lastSafe.copy(P.pos);
  P.maxAlt = Math.max(P.maxAlt, P.pos.y);
  // regen out of combat
  if (!P.dead && SM.time - P.lastHurtT > 6 && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + 9 * dt);
  // water / out of bounds
  if (P.pos.y < -1.2 && !P.dead) { if (typeof FX !== 'undefined') FX.splash(P.pos); if (typeof Flow !== 'undefined') Flow.rescue(); }
  Player.animate(dt);
};

Player.actions = function (dt) {
  const P = Player, st = P.state;
  if (IN.ap.heal) Player.heal();
  if (typeof Combat !== 'undefined' && Combat.playerInput(dt)) return;
  // zip to point
  if (IN.ap.zip && st !== 'zip') { const t = P.zipTarget || Player.findZipTarget(); if (t) { Player.startZip(t); return; } }
  if (st === 'air') {
    P.diving = IN.a.dive && P.pos.y > 12;
    if (IN.a.swing && P.webCD <= 0 && P.stateT > 0.10) { if (!Player.startSwing()) P.webCD = 0.12; }
    else if (IN.ap.jump && P.airZipCD <= 0 && P.stateT > 0.15) {   // air web-zip: a short forward yank
      const d = _pa.set(Math.sin(Cam.yaw) * Math.cos(Cam.pitch * 0.5), 0.22, Math.cos(Cam.yaw) * Math.cos(Cam.pitch * 0.5)).normalize();
      const sp = Math.max(P.speed * 0.9, 24); P.vel.lerp(_pb.copy(d).multiplyScalar(sp), 0.85); P.vel.y = Math.max(P.vel.y, 5.5); P.airZipCD = 1.1; P.trick = null;
      if (typeof FX !== 'undefined') FX.airZip(d);
    }
  } else if (st === 'swing') {
    if (IN.ap.jump) Player.releaseSwing(true); else if (!IN.a.swing) Player.releaseSwing(false);
  } else if (st === 'ground') {
    if (IN.ap.jump) { P.vel.y = PL.JUMP + (IN.a.swing ? 1.2 : 0); P.setState('air'); if (typeof FX !== 'undefined') FX.dust(P.pos, 4); }
  } else if (st === 'perch') {
    if (IN.ap.jump || (P.wantMove && P.stateT > 0.25)) {
      const launch = IN.ap.jump, quick = P.stateT < 0.45 && P.prev === 'zip';
      const d = P.wantMove ? P.moveW : _pa.set(Math.sin(Cam.yaw), 0, Math.cos(Cam.yaw));
      const k = launch ? (quick ? 1.55 : 1.0) : 0.35;
      P.vel.set(d.x * 15 * k, launch ? 11.5 * (quick ? 1.25 : 1) : 3, d.z * 15 * k); P.yaw = Math.atan2(d.x, d.z); P.setState('air');
      if (quick && launch && typeof HUD !== 'undefined') HUD.toast('POINT LAUNCH');
    }
  } else if (st === 'wall') {
    if (IN.ap.jump) { const n = P.wallN; P.vel.set(n.x * 9.5 + P.moveW.x * 4, 8.8, n.z * 9.5 + P.moveW.z * 4); P.yaw = Math.atan2(P.vel.x, P.vel.z); P.setState('air'); P.webCD = 0.1; }
  }
};

Player.physics = function (h) {
  const P = Player, st = P.state, v = P.vel, p = P.pos;
  if (st === 'ground') {
    const act = P.act, lockMove = act && act.root;
    const sprint = IN.a.swing && !P.act, top = P.wantMove && !lockMove ? (sprint ? PL.SPRINT : PL.JOG) : 0;
    const k = U.dampK(top > 0 ? 11 : 14, h);
    if (!lockMove) { v.x += (P.moveW.x * top - v.x) * k; v.z += (P.moveW.z * top - v.z) * k; }
    else if (act.vel) { v.x = act.vel.x; v.z = act.vel.z; }          // lunges and dodges drive the body directly
    else { v.x *= 1 - U.dampK(10, h); v.z *= 1 - U.dampK(10, h); }
    if (P.wantMove && !lockMove) P.yaw = U.dampAngle(P.yaw, Math.atan2(P.moveW.x, P.moveW.z), 13, h);
    p.x += v.x * h; p.z += v.z * h;
    const hit = World.sphere(p, PL.R);
    if (hit && Math.abs(hit.ny) < 0.4) {
      const into = -(v.x * hit.nx + v.z * hit.nz);
      if (into > 0) { v.x += hit.nx * into; v.z += hit.nz * into; }
      if (into > 5.5 && sprint && hit.box && hit.box.kind === 0 && hit.box.y1 > p.y + 2) { Player.enterWall(hit, true); return; }
    }
    const fl = World.floorAt(p.x, p.z, P.feetY() + 0.6);
    if (P.feetY() > fl + 0.35) { P.coyote += h; if (P.coyote > 0.10) { P.setState('air'); v.y = Math.min(v.y, 0); } }
    else { P.coyote = 0; p.y = U.lerp(p.y, fl + PL.H, U.dampK(28, h)); v.y = 0; }
    P.up.lerp(UP, U.dampK(12, h)).normalize();
    return;
  }
  if (st === 'air' || st === 'swing') {
    const W = P.web, grav = PL.G * (P.diving ? 1.55 : 1);
    v.y -= grav * h;
    if (st === 'air') {
      if (P.wantMove) { const hs = Math.hypot(v.x, v.z), along = (v.x * P.moveW.x + v.z * P.moveW.z); const acc = hs < 13 || along < hs * 0.9 ? PL.AIR_ACC : PL.AIR_ACC * 0.25; v.x += P.moveW.x * acc * h; v.z += P.moveW.z * acc * h; }
      if (P.diving) { v.x *= 1 - 0.25 * h; v.z *= 1 - 0.25 * h; }
      if (v.y < -PL.TERM) v.y = -PL.TERM;
    } else {
      W.t += h;
      // reel toward the target length so the arc clears the street
      if (W.len > W.target) W.len = Math.max(W.target, W.len - 16 * h);
      const sp = v.length();
      if (sp > 0.5 && sp < PL.SWING_MAX) { const a = PL.SWING_ACC * (IN.moveY >= -0.1 ? 0.55 + 0.45 * Math.max(0, IN.moveY) : 0.1) * (v.y < 2 ? 1 : 0.45); v.addScaledVector(_pa.copy(v).multiplyScalar(1 / sp), a * h); }
      // carry the upswing back to at least the height the swing began at, so a run of swings holds its altitude
      if (v.y > 0 && sp > 3 && p.y < W.startY + 4 && IN.moveY >= -0.1) v.addScaledVector(_pa.copy(v).multiplyScalar(1 / sp), 13 * h);
      if (Math.abs(IN.moveX) > 0.05) { const cyw = Cam.yaw; v.x += -Math.cos(cyw) * IN.moveX * 13 * h; v.z += Math.sin(cyw) * IN.moveX * 13 * h; }
    }
    { const sp2 = v.length(); v.multiplyScalar(1 - (0.012 + Math.max(0, sp2 - 37) * 0.035) * h); }
    // canyon assist: feel for facades ahead-left and ahead-right and ease toward the open side, unless the player is steering into one
    { const hs = Math.hypot(v.x, v.z);
      if (hs > 9 && !P.act) {
        const dx = v.x / hs, dz = v.z / hs, rx2 = -dz, rz2 = dx, yy = p.y - 3; let push = 0;
        for (const pr of [[10, 5.5, 1.0], [20, 8, 0.7], [32, 10, 0.4]]) {
          const bl = City.heightAt(p.x + dx * pr[0] - rx2 * pr[1], p.z + dz * pr[0] - rz2 * pr[1]) > yy, br = City.heightAt(p.x + dx * pr[0] + rx2 * pr[1], p.z + dz * pr[0] + rz2 * pr[1]) > yy;
          if (bl !== br) push += (bl ? 1 : -1) * pr[2];
        }
        if (push !== 0) { const want = U.clamp(push, -1, 1); if (Math.abs(IN.moveX) < 0.3 || Math.sign(IN.moveX) === Math.sign(want)) { const a = 15 * want * U.sat(hs / 25); v.x += rx2 * a * h; v.z += rz2 * a * h; } }
      }
    }
    p.addScaledVector(v, h);
    if (st === 'swing') {
      const d = _pa.subVectors(p, W.phys), dist = d.length();
      if (dist > W.len) {
        d.multiplyScalar(1 / dist); p.copy(W.phys).addScaledVector(d, W.len);
        const vr = v.dot(d);
        if (vr > 0) {
          const before = v.length(); v.addScaledVector(d, -vr);
          if (W.first) { const after = v.length(); if (after > 1) v.multiplyScalar(Math.min(before * 0.95, 58) / after); W.first = false; }
        }
        W.taut = true;
      } else W.taut = dist > W.len - 0.6;
      // auto release: high on the far side of the arc, stalled, or the line is cut by a corner
      const fwdH = _pb.set(v.x, 0, v.z); const hs = fwdH.length(); if (hs > 0.1) fwdH.multiplyScalar(1 / hs);
      const rel = _pc.subVectors(W.phys, p); const behind = -(rel.x * fwdH.x + rel.z * fwdH.z), ang = Math.atan2(behind, rel.y);
      if ((ang > 1.02 && v.y > 0) || (W.t > 0.5 && v.y > 0 && v.length() < 7) || W.t > 7) { Player.releaseSwing(false); P.webCD = 0.05; }
      else if (!World.segClear(p, W.anchor, b => b.kind === 0 && b !== W.box)) { W.blockedT += h; if (W.blockedT > 0.14) Player.releaseSwing(false); } else W.blockedT = 0;
    }
    // land (checked before the sphere so the impact speed is still intact)
    if (v.y <= 0.5) {
      const fl = World.floorAt(p.x, p.z, P.feetY() + 0.45 + Math.max(0, -v.y * h));
      if (P.feetY() <= fl + 0.03) {
        const impact = -v.y; p.y = fl + PL.H; v.y = 0;
        if (W.active) { W.active = false; if (typeof FX !== 'undefined') FX.webRelease(); }
        P.landT = impact > 22 ? 0.55 : impact > 11 ? 0.28 : 0.12; P.landHard = impact > 22; P.trick = null; P.flip = 0; P.roll = 0; P.diving = false;
        if (impact > 11 && typeof FX !== 'undefined') { FX.dust(p, impact > 22 ? 16 : 7); if (impact > 22) Cam.shake(0.5); }
        if (P.landHard) { v.x *= 0.25; v.z *= 0.25; }
        P.setState('ground'); P.coyote = 0;
        if (P.act && P.act.air) P.act = null;
        return;
      }
    }
    // collide
    const hit = World.sphere(p, PL.R);
    if (hit) {
      const into = -(v.x * hit.nx + v.y * hit.ny + v.z * hit.nz);
      if (hit.ny > 0.6) { /* resolved by the floor check below */ if (into > 0) v.addScaledVector(_pa.set(hit.nx, hit.ny, hit.nz), into); }
      else if (Math.abs(hit.ny) < 0.35 && hit.box && hit.box.kind === 0) {
        const toward = P.wantMove ? -(P.moveW.x * hit.nx + P.moveW.z * hit.nz) : 0;
        if ((into > 3 || toward > 0.4 || IN.a.swing) && hit.box.y1 > p.y + 0.5 && !P.act && !P.dead) { if (W.active) { W.active = false; if (typeof FX !== 'undefined') FX.webRelease(); } Player.enterWall(hit, into > 9 || IN.a.swing); return; }
        if (into > 0) v.addScaledVector(_pa.set(hit.nx, hit.ny, hit.nz), into);
      } else if (into > 0) v.addScaledVector(_pa.set(hit.nx, hit.ny, hit.nz), into);
    }
    return;
  }
  if (st === 'zip') {
    const Z = P.zip; Z.t += h; const k = U.sat(Z.t / Z.dur), e = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
    const prev = _pa.copy(p); p.lerpVectors(Z.from, Z.to, e); p.y += Math.sin(k * PI) * Math.min(2.2, Z.dist * 0.035);
    v.subVectors(p, prev).multiplyScalar(1 / h);
    if (k >= 1) {
      P.zip = null; v.set(0, 0, 0);
      if (Z.kind === 'wall') { P.wallN.set(Z.tgt.nx, 0, Z.tgt.nz); P.wallBox = Z.tgt.box; P.wallRunT = 0; P.setState('wall'); }
      else if (Z.kind === 'enemy') { P.setState('air'); if (Z.onArrive) Z.onArrive(); }
      else { P.setState('perch'); P.perchT = 0; if (typeof FX !== 'undefined') FX.dust(p, 3); }
    }
    return;
  }
  if (st === 'perch') { v.set(0, 0, 0); P.up.lerp(UP, U.dampK(12, h)).normalize(); return; }
  if (st === 'wall') {
    const n = P.wallN, b = P.wallBox; P.wallRunT += h;
    const run = IN.a.swing, top = P.wantMove ? (run ? PL.WALLRUN : PL.CRAWL) : 0;
    // stick → wall plane: pushing into the wall climbs, pulling away descends
    const into = -(P.moveW.x * n.x + P.moveW.z * n.z);
    const tx = P.moveW.x + n.x * into, tz = P.moveW.z + n.z * into;
    const want = _pa.set(tx, into, tz); if (want.lengthSq() > 1) want.normalize();
    const k = U.dampK(10, h); v.x += (want.x * top - v.x) * k; v.y += (want.y * top - v.y) * k; v.z += (want.z * top - v.z) * k;
    p.addScaledVector(v, h);
    if (b) {
      // stay glued to this face
      if (n.x > 0.5) p.x = b.x1 + PL.R; else if (n.x < -0.5) p.x = b.x0 - PL.R; else if (n.z > 0.5) p.z = b.z1 + PL.R; else p.z = b.z0 - PL.R;
      if (p.y > b.y1 + (b.par ? City.PARAPET : 0) - 0.15) {   // crest the top → vault onto the roof
        p.x -= n.x * 1.1; p.z -= n.z * 1.1; p.y = World.topOf(b, p.x, p.z) + PL.H + 0.05; v.set(-n.x * 3 + want.x * 2, 0, -n.z * 3 + want.z * 2); P.yaw = Math.atan2(-n.x, -n.z); P.setState('ground'); return;
      }
      const along = Math.abs(n.x) > 0.5 ? p.z : p.x, lo = Math.abs(n.x) > 0.5 ? b.z0 : b.x0, hi = Math.abs(n.x) > 0.5 ? b.z1 : b.x1;
      if (along < lo - 0.1 || along > hi + 0.1) {
        // ran off the side of this face: continue on a flush neighbour, else wrap the corner
        const hh = World.ray(p.x, p.y, p.z, -n.x, 0, -n.z, 1.6, bb => bb.kind === 0);
        if (hh && hh.box) { P.wallBox = hh.box; }
        else {
          const sgn = along < lo ? -1 : 1; const nn = Math.abs(n.x) > 0.5 ? _pb.set(0, 0, sgn) : _pb.set(sgn, 0, 0);
          if (Math.abs(n.x) > 0.5) { p.z = (sgn < 0 ? b.z0 : b.z1) + sgn * PL.R; p.x = (n.x > 0 ? b.x1 : b.x0) - n.x * 0.6; } else { p.x = (sgn < 0 ? b.x0 : b.x1) + sgn * PL.R; p.z = (n.z > 0 ? b.z1 : b.z0) - n.z * 0.6; }
          const sp = Math.hypot(v.x, v.z); v.x = -n.x * sp; v.z = -n.z * sp; n.copy(nn);
        }
      }
    }
    const fl = World.floorAt(p.x, p.z, p.y); if (p.y - PL.R < fl + 0.1 && v.y <= 0) { p.y = fl + PL.H; P.setState('ground'); P.yaw = Math.atan2(n.x, n.z); return; }
    if (typeof Combat !== 'undefined' && P.act) { P.setState('air'); }
    return;
  }
};
Player.enterWall = function (hit, running) {
  const P = Player; P.wallN.set(hit.nx, 0, hit.nz).normalize(); P.wallBox = hit.box; P.wallRunT = 0;
  const n = P.wallN, v = P.vel; const into = v.x * n.x + v.z * n.z; v.x -= n.x * into; v.z -= n.z * into;
  if (running) { const sp = Math.max(P.speed * 0.8, 9); v.y = Math.max(v.y, 0) + Math.abs(into) * 0.7; const l = v.length(); if (l > 0.1) v.multiplyScalar(Math.min(sp, PL.WALLRUN * 1.3) / l); }
  else v.multiplyScalar(0.3);
  P.trick = null; P.diving = false; P.setState('wall');
};

/* ---------- orientation + animation ---------- */
const _rq = new Q4(), _rm = new M4(), _rx = new V3(), _ry = new V3(), _rz = new V3();
Player.basis = function (fwd, upHint, out) {
  _rz.copy(fwd).normalize(); _rx.crossVectors(upHint, _rz); if (_rx.lengthSq() < 1e-6) _rx.set(1, 0, 0); _rx.normalize(); _ry.crossVectors(_rz, _rx).normalize();
  _rm.makeBasis(_rx, _ry, _rz); return out.setFromRotationMatrix(_rm);
};
Player.animate = function (dt) {
  const P = Player, rig = P.rig, st = P.state, v = P.vel, T = rig.target;
  let pose = null, rate = 14, qrate = 14, off = PL.H;
  const tq = _rq; const f = _pa, u = _pb;
  f.set(Math.sin(P.yaw), 0, Math.cos(P.yaw)); u.copy(UP);
  if (st === 'ground') {
    const sp = P.hSpeed;
    if (P.landT > 0) { P.landT -= dt; pose = POSE.land(); rate = 22; }
    else if (sp < 0.6) pose = (P.combatT > 0 ? POSE.guard(P.animT) : POSE.idle(P.animT));
    else { P.runPh += dt * (3.2 + sp * 0.62); pose = POSE.run(P.runPh, U.sat((sp - 6) / 6)); rate = 20; }
    P.lean = U.damp(P.lean, 0, 8, dt);
  } else if (st === 'air') {
    P.airT = P.stateT;
    if (v.lengthSq() > 9 && !P.act) { const hy = Math.atan2(v.x, v.z); if (P.hSpeed > 3) P.yaw = U.dampAngle(P.yaw, hy, 8, dt); }
    f.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    if (P.trick) {
      const tr = P.trick; tr.t += dt; const k = U.sat(tr.t / tr.dur);
      if (tr.type === 'flip') { P.flip = U.ease(k) * TAU; pose = POSE.tuck(); rate = 16; } else if (tr.type === 'twist') { P.roll = U.ease(k) * TAU; pose = POSE.soar(); } else pose = POSE.soar();
      if (k >= 1) { P.trick = null; P.flip = 0; P.roll = 0; }
    } else if (P.diving) { pose = POSE.dive(); const d = _pc.copy(v).normalize(); f.copy(d).lerp(_pd.set(Math.sin(P.yaw), -2.2, Math.cos(P.yaw)).normalize(), 0.6).normalize(); u.set(Math.sin(P.yaw), 0.35, Math.cos(P.yaw)).normalize(); rate = 9; }
    else if (v.y > 3) pose = POSE.jump(); else pose = POSE.fall(P.animT);
    if (!P.diving && !P.trick) { const pitch = U.clamp(-v.y / 70, -0.35, 0.55); f.y = -pitch; f.normalize(); }
  } else if (st === 'swing') {
    const W = P.web, toA = _pc.subVectors(W.anchor, P.pos).normalize();
    const hv = _pd.set(v.x, 0, v.z); if (hv.lengthSq() > 1) { hv.normalize(); P.yaw = U.dampAngle(P.yaw, Math.atan2(hv.x, hv.z), 10, dt); } else hv.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    u.copy(UP).lerp(toA, 0.72).normalize();
    f.copy(v).normalize(); if (v.lengthSq() < 4) f.copy(hv);
    const a = Math.atan2(toA.x * hv.x + toA.z * hv.z, toA.y), k = U.clamp(-a / 0.85, -1, 1);
    const left = W.side < 0;   // anchor on travel-right (side=+1) → hold with the right hand
    const mk = (fn) => { const ps = fn(toA); return left ? ps : Anim.mirror(ps); };
    Anim.solve(mk(POSE.swingMid), rig.tA, rig.root.quaternion);
    if (k < 0) { Anim.solve(mk(POSE.swingBack), rig.tB, rig.root.quaternion); Anim.blend(T, rig.tA, rig.tB, -k); } else { Anim.solve(mk(POSE.swingFront), rig.tB, rig.root.quaternion); Anim.blend(T, rig.tA, rig.tB, k); }
    pose = null; rate = 12; qrate = 11;
  } else if (st === 'zip') { const Z = P.zip; if (Z) { f.subVectors(Z.to, Z.from).normalize(); P.yaw = Math.atan2(f.x, f.z); pose = POSE.zip(f); rate = 24; qrate = 22; } }
  else if (st === 'perch') { pose = POSE.crouch(P.animT); rate = 16; }
  else if (st === 'wall') {
    const n = P.wallN; u.copy(n); off = 0.5;
    const sp = v.length();
    if (sp > 0.5) { f.copy(v).normalize(); P.wallF = (P.wallF || new V3()).copy(f); } else f.copy(P.wallF || UP);
    if (Math.abs(f.dot(n)) > 0.9) f.copy(UP);
    if (sp > 6.5) { P.runPh += dt * (3.2 + sp * 0.62); pose = POSE.run(P.runPh, 1); rate = 20; } else if (sp > 0.4) { P.runPh += dt * (2.5 + sp * 1.6); pose = POSE.wallCrawl(P.runPh); } else pose = POSE.wallCling(P.animT);
    P.yaw = Math.atan2(-n.x, -n.z);
  }
  // combat / reaction overlays replace the locomotion pose
  if (P.act && typeof Combat !== 'undefined') { const r = Combat.playerPose(P.act, rig, f, u); if (r) { pose = r.pose; if (r.solved) pose = null; rate = r.rate || 26; if (r.fwd) f.copy(r.fwd); } }
  else if (P.act && P.act.type === 'hit') { pose = POSE.hit(); rate = 24; }
  if (pose) Anim.solve(pose, T, rig.root.quaternion);
  // orientation
  Player.basis(f, u, tq);
  if (P.flip) tq.multiply(_q1.setFromAxisAngle(AX, P.flip)); if (P.roll) tq.multiply(_q1.setFromAxisAngle(AZ, P.roll));
  if (st === 'ground' && P.hSpeed > 2) { const turn = U.wrapPi(Math.atan2(P.moveW.x, P.moveW.z) - P.yaw); P.lean = U.damp(P.lean, U.clamp(turn, -1, 1) * -0.22 * (P.wantMove ? 1 : 0), 8, dt); tq.multiply(_q1.setFromAxisAngle(AZ, P.lean)); }
  P.quat.slerp(tq, 1 - Math.exp(-qrate * dt));
  P.rootOff = U.damp(P.rootOff, off, 14, dt);
  _ry.set(0, 1, 0).applyQuaternion(P.quat);
  if (st === 'swing' || st === 'wall') P.up.copy(_ry); else P.up.lerp(UP, U.dampK(10, dt)).normalize();
  rig.root.quaternion.copy(P.quat);
  rig.root.position.copy(P.pos).addScaledVector(st === 'wall' ? P.wallN : _ry, -P.rootOff);
  if (st === 'wall') rig.root.position.copy(P.pos).addScaledVector(P.wallN, -PL.R);
  rigDrive(rig, T, rate, dt);
  rig.root.updateMatrixWorld(true);
};
Player.handPos = function (side, out) { return Player.rig.bones[(side > 0 ? 'R' : 'L') + '_hand'].getWorldPosition(out); };


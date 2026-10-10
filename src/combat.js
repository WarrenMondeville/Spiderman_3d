'use strict';
/* ==== p41_combat.js ==== */
/* p41: player combat — auto-targeted melee chains with lunges, launcher + air combo, web-strike from the air, web shooters that
   cocoon, spider-sense dodges (perfect dodge = slow-motion + counter web), focus finishers. Every hit gets hit-stop, flash and shake. */

const Combat = { combo: 0, comboT: 0, chain: 0, chainT: 0, shootSide: 1, target: null, best: 0, airHits: 0 };

Combat.TRACKS = null;
Combat.tracks = function () {
  if (Combat.TRACKS) return Combat.TRACKS;
  const g = POSE.guard(0);
  Combat.TRACKS = {
    0: { dur: 0.40, hitAt: 0.15, dmg: 24, knock: 3.5, keys: [[0, POSE.windR()], [0.07, POSE.windR()], [0.15, POSE.punchR(), 'out'], [0.26, POSE.punchR()], [0.40, g]] },
    1: { dur: 0.40, hitAt: 0.15, dmg: 24, knock: 3.5, keys: [[0, POSE.windL()], [0.07, POSE.windL()], [0.15, POSE.punchL(), 'out'], [0.26, POSE.punchL()], [0.40, g]] },
    2: { dur: 0.46, hitAt: 0.18, dmg: 30, knock: 6, keys: [[0, POSE.kickWind()], [0.09, POSE.kickWind()], [0.18, POSE.kickR(), 'out'], [0.30, POSE.kickR()], [0.46, g]] },
    3: { dur: 0.56, hitAt: 0.22, dmg: 46, knock: 10, heavy: true, keys: [[0, POSE.upperWind()], [0.13, POSE.upperWind()], [0.22, POSE.upper(), 'out'], [0.38, POSE.upper()], [0.56, g]] },
    launcher: { dur: 0.52, hitAt: 0.22, dmg: 28, knock: 1, heavy: true, launch: 11.5, keys: [[0, POSE.upperWind()], [0.13, POSE.upperWind()], [0.22, POSE.upper(), 'out'], [0.40, POSE.upper()], [0.52, POSE.jump()]] },
    air: { dur: 0.34, hitAt: 0.12, dmg: 26, knock: 2, air: true, keys: [[0, POSE.tuck()], [0.12, POSE.airKick(), 'out'], [0.26, POSE.airKick()], [0.34, POSE.fall(0)]] },
    slam: { dur: 0.42, hitAt: 0.16, dmg: 50, knock: 4, air: true, heavy: true, slam: true, keys: [[0, POSE.tuck()], [0.16, POSE.airKick(), 'out'], [0.34, POSE.airKick()], [0.42, POSE.fall(0)]] },
    strike: { dur: 0.30, hitAt: 0.02, dmg: 34, knock: 9, air: true, heavy: true, keys: [[0, POSE.airKick()], [0.2, POSE.airKick()], [0.30, POSE.fall(0)]] },
    finisher: { dur: 0.42, hitAt: 0.17, dmg: 9999, knock: 17, air: true, heavy: true, launchKO: 7, keys: [[0, POSE.tuck()], [0.17, POSE.airKick(), 'out'], [0.34, POSE.airKick()], [0.42, POSE.fall(0)]] },
  };
  return Combat.TRACKS;
};

Combat.pickTarget = function (maxD, coneBias) {
  const P = Player; let best = null, bs = 1e9;
  const dir = P.wantMove ? P.moveW : _v1.set(Math.sin(Cam.yaw), 0, Math.cos(Cam.yaw));
  for (const e of Enemies.list) {
    if (!e.alive || e.ko) continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, dy = e.pos.y + 1 - P.pos.y, d = Math.hypot(dx, dz, dy * 0.6); if (d > maxD) continue;
    const al = (dx * dir.x + dz * dir.z) / (Math.hypot(dx, dz) + 1e-3);
    const s = d * (1.6 - al * (coneBias || 0.8)) + (e === Combat.target ? -1.2 : 0) + (e.state === 'webbed' ? 2 : 0);
    if (s < bs) { bs = s; best = e; }
  }
  return best;
};

Combat.startAttack = function (key, e) {
  const P = Player, T = Combat.tracks()[key];
  const act = { type: 'attack', key, T, t: 0, dur: T.dur, target: e, done: false, lock: true, root: true, air: !!T.air, vel: new V3(), queued: false };
  if (e) {
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz) || 1; act.dirX = dx / d; act.dirZ = dz / d; P.yaw = Math.atan2(dx, dz);
    const stop = 1.25 * e.TY.scale; act.lungeTo = new V3(e.pos.x - dx / d * stop, 0, e.pos.z - dz / d * stop); act.lunge = d > stop + 0.15;
  } else { act.dirX = Math.sin(P.yaw); act.dirZ = Math.cos(P.yaw); act.lunge = false; }
  P.act = act; P.combatT = 3; Combat.target = e;
  return act;
};

/* returns true when it has taken the input this frame */
Combat.playerInput = function (dt) {
  const P = Player; Combat.chainT -= dt;
  const busy = P.act && P.act.lock;
  // ---- dodge
  if (IN.ap.dodge && (!busy || (P.act.type === 'attack' && P.act.done)) && P.state !== 'zip' && P.state !== 'perch') {
    const danger = Enemies.dangerFor();
    let dx, dz; if (P.wantMove) { dx = P.moveW.x; dz = P.moveW.z; } else { dx = -Math.sin(P.yaw); dz = -Math.cos(P.yaw); }
    if (P.web.active) Player.releaseSwing(false);
    if (P.state === 'wall') { P.setState('air'); P.vel.copy(P.wallN).multiplyScalar(7); }
    P.act = { type: 'dodge', t: 0, dur: 0.46, lock: true, root: true, vel: new V3(dx * 12.5, 0, dz * 12.5), air: P.state !== 'ground' };
    if (P.state !== 'ground') { P.vel.x = dx * 14; P.vel.z = dz * 14; P.vel.y = Math.max(P.vel.y, 4); }
    P.invuln = 0.5; P.trick = null;
    if (danger) {   // perfect dodge: time slows, the attacker eats a web
      Flow.slowmo(0.3, 0.75); Player.addFocus(0.5); HUD.toast('PERFECT DODGE'); Enemies.releaseToken(danger);
      const side = Combat.shootSide = -Combat.shootSide; const from = Player.handPos(side, new V3());
      FX.bolt(from, danger, (o) => Enemies.chest(danger, o).setY(danger.pos.y + 1.6 * danger.TY.scale), () => { if (danger.alive) { Combat.webHit(danger, true); } });
      danger.cool = 2.5; if (danger.state === 'windup' || danger.state === 'aim') Enemies.setState(danger, 'stagger');
    }
    return true;
  }
  if (busy && P.act.type !== 'attack') return true;
  // ---- finisher (zip key with focus, enemy close) — checked before zip-to-point
  if (IN.ap.zip && P.focus >= 1 && !busy) {
    const e = Combat.pickTarget(11, 0.5);
    if (e) { P.focus -= 1; if (P.web.active) Player.releaseSwing(false); if (P.state === 'wall' || P.state === 'perch') P.setState('air'); const a = Combat.startAttack('finisher', e); a.lunge = true; a.lungeTo.y = 0; Flow.slowmo(0.32, 1.1); HUD.toast('FINISHER'); Cam.kick = 1; return true; }
  }
  // ---- attack
  if (IN.ap.attack) {
    if (busy) { if (P.act.type === 'attack' && P.act.t > P.act.T.hitAt * 0.5) P.act.queued = true; return true; }
    if (P.state === 'zip' || P.state === 'perch' && !Combat.pickTarget(16)) return false;
    return Combat.beginChain();
  }
  // ---- web shooters
  if (IN.ap.web && !busy) {
    const e = Combat.pickTarget(30, 1.0); const side = Combat.shootSide = -Combat.shootSide;
    const aim = new V3(); if (e) Enemies.chest(e, aim).sub(P.pos).normalize(); else aim.set(Math.sin(Cam.yaw) * Math.cos(Cam.pitch), Math.sin(Cam.pitch), Math.cos(Cam.yaw) * Math.cos(Cam.pitch));
    P.act = { type: 'shoot', t: 0, dur: 0.24, lock: false, side, aim, fired: false, target: e };
    if (e && P.state === 'ground') P.yaw = Math.atan2(aim.x, aim.z);
    P.combatT = Math.max(P.combatT, e ? 3 : 0);
    return true;
  }
  return false;
};

Combat.beginChain = function () {
  const P = Player; const grounded = P.state === 'ground';
  const e = Combat.pickTarget(grounded ? 9 : 24, 0.9);
  if (!grounded) {
    if (P.web.active) Player.releaseSwing(false); if (P.state === 'wall' || P.state === 'perch') P.setState('air');
    if (e) {
      const d = Math.hypot(e.pos.x - P.pos.x, e.pos.y + 1 - P.pos.y, e.pos.z - P.pos.z);
      if (e.airborne && d < 4.5) { Combat.airHits++; Combat.startAttack(Combat.airHits >= 3 ? 'slam' : 'air', e); P.vel.set(0, 3.2, 0); e.vel.set(0, 3.4, 0); return true; }
      if (d > 3) {   // web-strike: yank yourself feet-first into them
        const to = Enemies.chest(e, new V3()), dir = new V3().subVectors(to, P.pos).normalize(); to.addScaledVector(dir, -1.1);
        Player.startZip({ x: to.x, y: to.y - PL.H + 0.2, z: to.z, kind: 'enemy' }); P.zip.onArrive = () => { const a = Combat.startAttack('strike', e); a.lunge = false; P.vel.copy(dir).multiplyScalar(4); P.vel.y = 3; };
        FX.webTo(1, to, 0.25); return true;
      }
      Combat.startAttack('air', e); return true;
    }
    Combat.startAttack('air', null); return true;
  }
  Combat.airHits = 0;
  if (Combat.chainT <= 0) Combat.chain = 0;
  Combat.startAttack(Combat.chain, e); return true;
};

Combat.webHit = function (e, face) {
  if (!e.alive || e.ko) return; const need = e.type === 'brute' ? 5 : 3;
  e.webHits += face ? 2 : 1; Player.addFocus(0.05);
  const c = Enemies.chest(e, new V3()); FX.webBits(c, 5); FX.splat(c, 0.7, e.rig.bones.chest, new V3(0, 0.12, 0));
  if (e.webHits >= need && e.state !== 'webbed') { e.cocoon.visible = true; e.cocoon.scale.set(0.27, 0.40, 0.23); e.webbedT = 7.5; Enemies.releaseToken(e); Enemies.setState(e, 'webbed'); HUD.toast('WEBBED UP'); }
  else if (e.type !== 'brute' && e.state !== 'webbed' && !e.airborne) { Enemies.releaseToken(e); Enemies.setState(e, 'stagger'); e.stateT = 0.2; }
};

Combat.hitEnemy = function (e, T, dirX, dirZ) {
  const P = Player; if (!e.alive || e.ko) return;
  const webbed = e.state === 'webbed'; let dmg = T.dmg * (webbed ? 3 : 1);
  e.hp -= dmg; Combat.combo++; Combat.comboT = 3.2; Combat.best = Math.max(Combat.best, Combat.combo); Player.addFocus(0.11 + (T.heavy ? 0.05 : 0)); HUD.combo(Combat.combo);
  const c = Enemies.chest(e, new V3()); FX.flash(c, T.heavy ? 2.3 : 1.5, !!T.heavy); FX.sparks(c, T.heavy ? 10 : 5, [3, 2.6, 2.0]);
  SM.hitStop = T.heavy ? 0.085 : 0.05; Cam.shake(T.heavy ? 0.4 : 0.2);
  const armoured = e.type === 'brute' && !T.heavy && !webbed && e.hp > 0;
  if (!armoured) { Enemies.releaseToken(e); e.vel.x += dirX * T.knock; e.vel.z += dirZ * T.knock; if (!e.airborne) Enemies.setState(e, 'stagger'); e.cool = Math.max(e.cool, 1.2); }
  if (T.launch && e.type !== 'brute') { e.airborne = true; e.vel.y = T.launch; e.pos.y += 0.1; Enemies.setState(e, 'launched'); P.vel.y = 10.2; P.setState('air'); P.act = null; Combat.airHits = 0; }
  if (T.slam) { e.vel.y = -24; e.vel.x = dirX * 5; e.vel.z = dirZ * 5; }
  if (e.hp <= 0 || (webbed && e.type !== 'brute')) {
    e.hp = 0; e.cocoon.visible = webbed; e.airborne = true; e.pos.y += 0.1; e.vel.set(dirX * (T.knock + 4), T.slam ? -20 : (T.launchKO || 5), dirZ * (T.knock + 4)); Enemies.setState(e, 'launched');
    if (Enemies.activeCount() <= 1) Flow.slowmo(0.22, 0.65);
  }
};

Combat.update = function (dt) {
  const P = Player, a = P.act;
  if (Combat.comboT > 0) { Combat.comboT -= dt; if (Combat.comboT <= 0) { Combat.combo = 0; HUD.combo(0); } }
  HUD.sense(!!Enemies.dangerFor() && !P.dead);
  Cam.kick = U.damp(Cam.kick || 0, 0, 3, dt);
  if (!a) return;
  if (a.type === 'attack') {
    const T = a.T, e = a.target;
    if (e && a.t < T.hitAt && a.lunge) {   // close the distance before the blow lands
      const rem = Math.max(T.hitAt - a.t, 0.03); const tx = a.lungeTo.x - P.pos.x, tz = a.lungeTo.z - P.pos.z; let vx = tx / rem, vz = tz / rem; const vl = Math.hypot(vx, vz); if (vl > 34) { vx *= 34 / vl; vz *= 34 / vl; }
      a.vel.set(vx, 0, vz); if (P.state !== 'ground') { P.vel.x = vx; P.vel.z = vz; if (a.key === 'finisher') P.vel.y = (e.pos.y + 1.1 - P.pos.y) / rem * 0.6; }
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z; if (dx * dx + dz * dz > 0.04) P.yaw = Math.atan2(dx, dz);
    } else a.vel.set(a.dirX * (a.t < T.hitAt + 0.05 ? 2.5 : 0), 0, a.dirZ * (a.t < T.hitAt + 0.05 ? 2.5 : 0));
    if (!a.done && a.t >= T.hitAt) {
      a.done = true;
      if (e && e.alive) { const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z), dy = Math.abs(e.pos.y + 1 - P.pos.y); if (d < 2.7 * e.TY.scale && dy < 2.6) Combat.hitEnemy(e, T, a.dirX, a.dirZ); }
      // splash to anyone else standing right there on heavy blows
      if (T.heavy) for (const o of Enemies.list) { if (o === e || !o.alive) continue; const d = Math.hypot(o.pos.x - P.pos.x, o.pos.z - P.pos.z); if (d < 2.2 && Math.abs(o.pos.y + 1 - P.pos.y) < 2) Combat.hitEnemy(o, { dmg: T.dmg * 0.5, knock: T.knock * 0.7, heavy: false }, (o.pos.x - P.pos.x) / (d + 1e-3), (o.pos.z - P.pos.z) / (d + 1e-3)); }
      if (typeof a.key === 'number') { Combat.chain = (a.key + 1) % 4; Combat.chainT = 0.9; }
    }
    // chain the next blow as soon as this one has connected
    if (a.done && a.t > T.hitAt + 0.10 && (a.queued || (IN.a.attack && IN.holdT.attack > 0.32)) && typeof a.key === 'number' && P.state === 'ground') {
      const hold = IN.a.attack && IN.holdT.attack > 0.32 && !a.queued; const nx = Combat.pickTarget(9, 0.9);
      if (hold && nx && nx.type !== 'brute') Combat.startAttack('launcher', nx); else Combat.startAttack(Combat.chain, nx);
    }
  } else if (a.type === 'shoot') {
    if (!a.fired && a.t >= 0.05) {
      a.fired = true; const from = Player.handPos(a.side, new V3()); FX.webBits(from, 2);
      if (a.target) { const e = a.target; FX.bolt(from, e, (o) => Enemies.chest(e, o), () => Combat.webHit(e, false)); }
      else { const to = from.clone().addScaledVector(a.aim, 40); const h = World.ray(from.x, from.y, from.z, a.aim.x, a.aim.y, a.aim.z, 40, b => b.kind === 0); if (h) to.copy(from).addScaledVector(a.aim, h.t); FX.bolt(from, null, (o) => o.copy(to), (p) => FX.splat(p, 1.1)); }
    }
  } else if (a.type === 'dodge') {
    const k = a.t / a.dur; P.flip = a.air ? 0 : 0; P.roll = U.ease(U.sat(k)) * TAU * (a.vel.x * Math.cos(P.yaw) - a.vel.z * Math.sin(P.yaw) > 0 ? -1 : 1);
    if (k > 0.75) a.vel.multiplyScalar(1 - 8 * dt);
    if (a.t + dt >= a.dur) { P.roll = 0; }
  }
};

/* pose provider for Player.animate */
Combat.playerPose = function (a, rig, f, u) {
  const P = Player;
  if (a.type === 'attack') { Anim.keys(a.T.keys, a.t, rig.tA, rig.tB, rig.target, rig.root.quaternion); return { solved: true, rate: 38, fwd: _v6.set(a.dirX, a.key === 'finisher' || a.key === 'strike' ? -0.15 : 0, a.dirZ).normalize() }; }
  if (a.type === 'dodge') return { pose: POSE.dodge(), rate: 24 };
  if (a.type === 'shoot') { if (P.state === 'swing' || P.state === 'wall' || P.state === 'zip') return null; const ps = POSE.shootR(a.aim); return { pose: a.side > 0 ? ps : Anim.mirror(ps), rate: 30 }; }
  if (a.type === 'hit') return { pose: POSE.hit(), rate: 24 };
  if (a.type === 'down') return { pose: POSE.down(), rate: 8 };
  return null;
};


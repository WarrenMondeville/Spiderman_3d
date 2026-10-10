'use strict';
/* ==== p40_enemies.js ==== */
/* p40: gang members — three procedurally built body types sharing the hero's skeleton, with token-limited group AI:
   they ring the player, only two may attack at once, every attack is telegraphed (that is what spider-sense reads). */

const Enemies = { list: [], built: {}, pools: { thug: [], gunner: [], brute: [] }, tokens: { melee: null, ranged: null }, tracers: null, alertT: 0, globalCool: 0, engaged: 0 };

Enemies.TYPES = {
  thug: { hp: 100, speed: 4.3, scale: 1.0, ring: 2.5, dmg: 13, body: { res: 0.0125, handRes: 0.0062, hands: 'mitt', jacket: 1, hood: 1, pants: 1, boots: 1 }, kind: 0, name: 'THUG',
    cols: [[0x5a6478, 0x39455c, 0xd62828], [0x7a5640, 0x3c4048, 0xe0a020], [0x4f6a54, 0x44464e, 0xd62828], [0x80705a, 0x36435a, 0x38a0e0], [0x6a5478, 0x40444e, 0xe05a20], [0x8a3a34, 0x30384a, 0xf0f0f0]] },
  gunner: { hp: 85, speed: 3.8, scale: 1.03, ring: 11, dmg: 6, body: { res: 0.0125, handRes: 0.0062, hands: 'mitt', jacket: 0.7, pants: 1, boots: 1, head: 1.05, bulk: 1.03 }, kind: 1, name: 'GUNMAN',
    cols: [[0x56664a, 0x3c4236, 0xe07a10], [0x5a5c66, 0x36383e, 0xe07a10]] },
  brute: { hp: 380, speed: 3.0, scale: 1.24, ring: 3.0, dmg: 34, body: { res: 0.014, handRes: 0.007, hands: 'mitt', bulk: 1.26, torso: 1.12, arm: 1.22, leg: 1.1, jacket: 0.8, pads: 1, belly: 0.55, boots: 1, neck: 1.3, pants: 1 }, kind: 2, name: 'BRUTE',
    cols: [[0x6e5a44, 0x3e3a36, 0xd62828]] },
};

Enemies.build = async function () {
  for (const k in Enemies.TYPES) { Enemies.built[k] = Body.build(Enemies.TYPES[k].body); await Loader.yield(); }
  // weapons
  const bat = new THREE.CylinderGeometry(0.022, 0.034, 0.78, 8); bat.translate(0, 0.30, 0);
  Enemies.batGeo = bat; Enemies.batMat = MAT(new THREE.MeshStandardMaterial({ color: 0x6b6f76, roughness: 0.4, metalness: 0.7 }));
  const gun = new THREE.BoxGeometry(0.035, 0.12, 0.24); gun.translate(0, -0.02, 0.10); const grip = new THREE.BoxGeometry(0.03, 0.11, 0.05); grip.translate(0, -0.09, 0.0);
  Enemies.gunGeo = gun; Enemies.gripGeo = grip; Enemies.gunMat = MAT(new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.45, metalness: 0.6 }));
  // tracers + muzzle flashes
  const n = 16, g = new THREE.BufferGeometry(); const T = Enemies.tracers = { n, pos: new Float32Array(n * 6), life: new Float32Array(n), geo: g, head: 0 };
  g.setAttribute('position', new THREE.BufferAttribute(T.pos, 3).setUsage(THREE.DynamicDrawUsage));
  const ln = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new C3(4, 2.6, 1.0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); ln.frustumCulled = false; GFX.scene.add(ln);
  // aim lasers (one per possible gunner)
  Enemies.laserMat = new THREE.LineBasicMaterial({ color: new C3(3, 0.15, 0.1), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  // web cocoon
  Enemies.cocoonGeo = new THREE.SphereGeometry(1, 14, 10);
  Enemies.cocoonMat = MAT(new THREE.MeshStandardMaterial({ color: 0xe9edf5, roughness: 0.75, metalness: 0, map: FX.texSplat, transparent: false, emissive: new C3(0.12, 0.12, 0.14) }));
};

Enemies.spawn = function (type, x, y, z, yaw, group) {
  const TY = Enemies.TYPES[type]; let e = Enemies.pools[type].pop();
  if (!e) {
    const c = TY.cols[Math.floor(Math.random() * TY.cols.length)];
    const mat = Suit.thugMaterial(TY.kind, c[0], c[1], c[2]);
    const inst = Body.instance(Enemies.built[type], mat, TY.scale); inst.root.name = 'enemy_' + type;
    e = { type, TY, rig: makeRig(inst), pos: new V3(), vel: new V3(), quat: new Q4(), tilt: 0 };
    if (type === 'thug' && Math.random() < 0.6) { e.weapon = new THREE.Mesh(Enemies.batGeo, Enemies.batMat); e.weapon.rotation.set(0, 0, PI / 2); e.weapon.position.set(-0.07, -0.01, 0.0); e.weapon.castShadow = true; inst.bones.R_hand.add(e.weapon); }
    if (type === 'gunner') { const w = new THREE.Group(); w.add(new THREE.Mesh(Enemies.gunGeo, Enemies.gunMat), new THREE.Mesh(Enemies.gripGeo, Enemies.gunMat)); w.rotation.set(0, PI / 2, PI / 2); w.position.set(-0.08, -0.03, 0.0); inst.bones.R_hand.add(w); e.weapon = w;
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage)); e.laser = new THREE.Line(lg, Enemies.laserMat); e.laser.frustumCulled = false; e.laser.visible = false; GFX.scene.add(e.laser); }
    e.cocoon = new THREE.Mesh(Enemies.cocoonGeo, Enemies.cocoonMat); e.cocoon.scale.set(0.27, 0.40, 0.23); e.cocoon.position.set(0, 0.10, 0.01); e.cocoon.visible = false; inst.bones.spine.add(e.cocoon);
  }
  GFX.scene.add(e.rig.root);
  e.pos.set(x, y, z); e.vel.set(0, 0, 0); e.yaw = yaw || 0; e.hp = e.maxHp = TY.hp * (group && group.hpMul || 1); e.state = 'idle'; e.stateT = Math.random() * 2; e.alive = true; e.ko = false; e.webHits = 0; e.webbedT = 0; e.group = group || null;
  e.ph = Math.random() * 6; e.animT = Math.random() * 10; e.slotA = Math.random() * TAU; e.cool = 1 + Math.random() * 2; e.hitDone = false; e.rig.first = true; e.cocoon.visible = false; e.boss = false; e.airborne = false; e.fade = 0; e.rig.mesh.visible = true; e.idleYaw = e.yaw;
  if (e.laser) e.laser.visible = false;
  Enemies.list.push(e); return e;
};
Enemies.remove = function (e) { const i = Enemies.list.indexOf(e); if (i >= 0) Enemies.list.splice(i, 1); GFX.scene.remove(e.rig.root); if (e.laser) e.laser.visible = false; Enemies.releaseToken(e); Enemies.pools[e.type].push(e); };
Enemies.clear = function () { for (const e of Enemies.list.slice()) Enemies.remove(e); };
Enemies.calm = function () { for (const e of Enemies.list) if (e.alive && !e.ko) { e.state = 'idle'; e.stateT = 0; Enemies.releaseToken(e); } Enemies.tokens.melee = Enemies.tokens.ranged = null; };
Enemies.releaseToken = function (e) { if (Enemies.tokens.melee === e) Enemies.tokens.melee = null; if (Enemies.tokens.ranged === e) Enemies.tokens.ranged = null; };
Enemies.setState = function (e, s) { e.state = s; e.stateT = 0; e.hitDone = false; };
Enemies.chest = function (e, out) { return out.set(e.pos.x, e.pos.y + 1.25 * e.TY.scale, e.pos.z); };
Enemies.activeCount = function () { let n = 0; for (const e of Enemies.list) if (e.alive && !e.ko) n++; return n; };
Enemies.dangerFor = function () {   // is an attack about to land on the player? → spider-sense
  for (const e of Enemies.list) { if (!e.alive || e.ko) continue; if (e.state === 'windup' && e.stateT > e.windT - 0.45) return e; if (e.state === 'aim' && e.stateT > e.aimT - 0.5) return e; }
  return null;
};

Enemies.tracer = function (a, b) { const T = Enemies.tracers, i = T.head; T.head = (T.head + 1) % T.n; T.pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); T.life[i] = 0.07; };

const _e1 = new V3(), _e2 = new V3(), _e3 = new V3(), _eq = new Q4();
Enemies.update = function (dt) {
  const P = Player, L = Enemies.list; if (!L.length) return;
  let engaged = 0;
  // tracers fade
  const T = Enemies.tracers; for (let i = 0; i < T.n; i++) { if (T.life[i] > 0) { T.life[i] -= dt; if (T.life[i] <= 0) T.pos.fill(0, i * 6, i * 6 + 6); } } T.geo.attributes.position.needsUpdate = true;
  for (let i = L.length - 1; i >= 0; i--) {
    const e = L[i], TY = e.TY; e.stateT += dt; e.animT += dt; e.cool -= dt;
    const toP = _e1.subVectors(P.pos, e.pos); toP.y -= PL.H; const dist = Math.hypot(toP.x, toP.z), dy = toP.y;
    let pose = null, rate = 12, faceP = false, moveX = 0, moveZ = 0, spd = 0;
    const canSee = dist < 34 && Math.abs(dy) < 9;
    if (e.ko) {
      pose = POSE.down(); rate = 9; e.fade += dt;
      if (e.fade > 1.2 && !e.cocoon.visible) { e.cocoon.visible = true; e.cocoon.scale.set(0.34, 0.5, 0.3); FX.webBits(Enemies.chest(e, _e2).setY(e.pos.y + 0.3), 6); }
    } else switch (e.state) {
      case 'idle': pose = POSE.thugIdle(e.animT); e.yaw = U.dampAngle(e.yaw, e.idleYaw + Math.sin(e.animT * 0.3) * 0.5, 2, dt);
        if (canSee && (dist < 22 || Enemies.alertT > 0) && !P.dead && SM.mode === 'play') { Enemies.setState(e, 'alert'); Enemies.alertT = 3; } break;
      case 'alert': faceP = true; pose = POSE.guard(e.animT); if (e.stateT > 0.7 + (i % 3) * 0.25) Enemies.setState(e, 'approach'); engaged++; break;
      case 'approach': case 'circle': {
        engaged++; faceP = true;
        if (P.dead || (!canSee && dist > 60)) { Enemies.setState(e, 'idle'); break; }
        // slot on a ring around the player; slots drift so the crowd keeps reshuffling
        e.slotA += dt * (0.25 + (i % 3) * 0.12) * (i % 2 ? 1 : -1);
        const ring = TY.ring + (e.type === 'gunner' ? 0 : (i % 3) * 0.7) + (Enemies.tokens.melee === e ? -0.9 : 0.6);
        const sx = P.pos.x + Math.cos(e.slotA) * ring, sz = P.pos.z + Math.sin(e.slotA) * ring;
        const mx = sx - e.pos.x, mz = sz - e.pos.z, md = Math.hypot(mx, mz);
        if (md > 0.35) { moveX = mx / md; moveZ = mz / md; spd = Math.min(TY.speed, md * 2.2) * (dist > ring + 4 ? 1.25 : 0.75); }
        e.state = md < 1.2 ? 'circle' : 'approach';
        // ask for an attack token
        const pGround = P.state === 'ground' || P.state === 'perch' || (P.pos.y - PL.H - e.pos.y < 2.5);
        if (e.cool <= 0 && !P.dead && e.stateT > 0.4 && Enemies.globalCool <= 0 && P.invuln <= 0) {
          if (e.type === 'gunner') { if (!Enemies.tokens.ranged && dist < 30 && dist > 4) { Enemies.tokens.ranged = e; e.aimT = 1.25; Enemies.setState(e, 'aim'); } }
          else if (!Enemies.tokens.melee && dist < TY.ring + 1.6 && pGround) { Enemies.tokens.melee = e; e.windT = e.type === 'brute' ? 0.85 : 0.62; Enemies.setState(e, 'windup'); }
        }
        pose = spd > 0.4 ? POSE.thugWalk(e.ph += dt * (2.5 + spd * 1.5), U.sat(spd / 4)) : POSE.guard(e.animT);
        if (e.type === 'gunner' && spd <= 0.4) pose = POSE.thugAim(_e3.copy(toP).setY(dy + 0.4).normalize());
        break; }
      case 'windup': engaged++; faceP = true; rate = 14; pose = e.type === 'brute' ? POSE.bruteWind() : POSE.thugWind();
        if (dist > 1.7) { moveX = toP.x / dist; moveZ = toP.z / dist; spd = TY.speed * 1.15; }
        if (e.stateT >= e.windT) Enemies.setState(e, 'strike'); break;
      case 'strike': engaged++; rate = 34; pose = e.type === 'brute' ? POSE.bruteSlam() : POSE.thugStrike();
        if (!e.hitDone && e.stateT > 0.07) {
          e.hitDone = true; const reach = e.type === 'brute' ? 3.1 : 2.2;
          const facing = (toP.x * Math.sin(e.yaw) + toP.z * Math.cos(e.yaw)) / (dist + 1e-3);
          if (dist < reach && Math.abs(dy) < 2.2 && (facing > 0.3 || e.type === 'brute')) { if (Player.hurt(TY.dmg * (e.group && e.group.dmgMul || 1), e.pos, e.type === 'brute' ? 13 : 6)) FX.flash(_e2.copy(P.pos), 1.2, false); }
          if (e.type === 'brute') { FX.dust(_e2.copy(e.pos).addScaledVector(_e3.set(Math.sin(e.yaw), 0, Math.cos(e.yaw)), 1.2).setY(e.pos.y + PL.H), 14); Cam.shake(0.3); }
        }
        if (e.stateT > 0.32) { Enemies.setState(e, 'recover'); } break;
      case 'recover': engaged++; pose = POSE.guard(e.animT); rate = 7; if (e.stateT > (e.type === 'brute' ? 1.1 : 0.7)) { Enemies.releaseToken(e); e.cool = 2.6 + Math.random() * 2.6; Enemies.globalCool = 1.5 + Math.random() * 0.8; Enemies.setState(e, 'approach'); } break;
      case 'aim': { engaged++; faceP = true; const aim = _e3.copy(toP).setY(dy + 0.35).normalize(); pose = POSE.thugAim(aim); rate = 16;
        if (e.laser) { const m = e.rig.bones.R_hand.getWorldPosition(_e2); const a = e.laser.geometry.attributes.position; a.setXYZ(0, m.x, m.y, m.z); a.setXYZ(1, P.pos.x, P.pos.y + 0.2, P.pos.z); a.needsUpdate = true; e.laser.visible = true; }
        if (dist > 40 || P.dead) { Enemies.releaseToken(e); if (e.laser) e.laser.visible = false; Enemies.setState(e, 'approach'); break; }
        if (e.stateT >= e.aimT) { e.shots = 3; e.shotT = 0; e.aimAt = (e.aimAt || new V3()).copy(P.pos); Enemies.setState(e, 'fire'); } break; }
      case 'fire': { engaged++; faceP = true; pose = POSE.thugAim(_e3.copy(toP).setY(dy + 0.35).normalize()); rate = 20; e.shotT -= dt;
        if (e.shotT <= 0 && e.shots > 0) {
          e.shots--; e.shotT = 0.13; const m = e.rig.bones.R_hand.getWorldPosition(_e2);
          // bullets go where the player WAS when the burst started, led a little: moving or dodging beats them
          const moved = e.aimAt.distanceTo(P.pos), tgt = _e3.copy(e.aimAt).lerp(P.pos, 0.35); tgt.y += 0.1;
          Enemies.tracer(m, _e1.copy(tgt).sub(m).normalize().multiplyScalar(60).add(m)); FX.sparks(m, 3, [4, 2.4, 0.8]);
          if (moved < 2.4 && World.segClear(m, P.pos, b => b.kind === 0)) Player.hurt(TY.dmg, e.pos, 2.5);
        }
        if (e.shots <= 0 && e.shotT <= -0.1) { if (e.laser) e.laser.visible = false; Enemies.releaseToken(e); e.cool = 4.0 + Math.random() * 3; Enemies.globalCool = Math.max(Enemies.globalCool, 1.2); Enemies.setState(e, 'recover'); } break; }
      case 'stagger': engaged++; pose = POSE.hit(); rate = 26; if (e.stateT > 0.5) Enemies.setState(e, 'approach'); break;
      case 'launched': engaged++; pose = POSE.launched(e.animT); rate = 16; break;
      case 'down': engaged++; pose = POSE.down(); rate = 12; if (e.stateT > 1.5) { Enemies.setState(e, 'getup'); } break;
      case 'getup': engaged++; pose = POSE.land(); rate = 6; if (e.stateT > 0.55) Enemies.setState(e, 'approach'); break;
      case 'webbed': engaged++; pose = POSE.webbed(e.animT); rate = 14; e.webbedT -= dt; if (e.webbedT <= 0) { e.cocoon.visible = false; e.webHits = 0; Enemies.setState(e, 'approach'); FX.webBits(Enemies.chest(e, _e2), 10); } break;
    }
    if (e.laser && e.state !== 'aim' && e.state !== 'fire') e.laser.visible = false;
    // ---- motion
    const onAir = e.airborne;
    if (!onAir) {
      const k = U.dampK(9, dt); e.vel.x += (moveX * spd - e.vel.x) * k; e.vel.z += (moveZ * spd - e.vel.z) * k;
      // keep apart from each other and from the player
      for (let j = 0; j < L.length; j++) { if (j === i) continue; const o = L[j]; if (o.ko) continue; const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, od = Math.hypot(ox, oz); if (od < 1.15 && od > 1e-3) { const push = (1.15 - od) * 3.5; e.vel.x += ox / od * push; e.vel.z += oz / od * push; } }
      if (dist < 0.95 && Math.abs(dy) < 1.5 && dist > 1e-3 && !e.ko) { e.vel.x -= toP.x / dist * 3; e.vel.z -= toP.z / dist * 3; }
    } else { e.vel.y -= 24 * dt; }
    e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt; e.pos.y += e.vel.y * dt;
    // walls
    _e2.set(e.pos.x, e.pos.y + 0.9, e.pos.z); const hit = World.sphere(_e2, 0.45);
    if (hit) { e.pos.x = _e2.x; e.pos.z = _e2.z; if (onAir && Math.abs(hit.ny) < 0.4) { const into = -(e.vel.x * hit.nx + e.vel.z * hit.nz); if (into > 0) { e.vel.x += hit.nx * into * 1.3; e.vel.z += hit.nz * into * 1.3; if (into > 5) { FX.flash(_e2, 1.4, true); Cam.shake(0.2); if (e.webHits > 0 || e.state === 'webbed') { e.wallStuck = true; } } } } }
    const fl = World.floorAt(e.pos.x, e.pos.z, e.pos.y + 0.7);
    if (onAir) { if (e.vel.y <= 0 && e.pos.y <= fl) { e.pos.y = fl; e.airborne = false; e.vel.set(e.vel.x * 0.3, 0, e.vel.z * 0.3); FX.dust(_e2.set(e.pos.x, e.pos.y + PL.H, e.pos.z), 6); if (e.hp <= 0) Enemies.knockOut(e); else Enemies.setState(e, 'down'); } }
    else if (e.pos.y > fl + 0.6) { e.airborne = true; if (e.state !== 'launched' && !e.ko) Enemies.setState(e, 'launched'); } else e.pos.y = U.damp(e.pos.y, fl, 20, dt);
    if (e.pos.y < -1.5) { e.hp = 0; Enemies.knockOut(e); e.fade = 99; }
    // ---- facing + rig
    if (faceP && dist > 0.2) e.yaw = U.dampAngle(e.yaw, Math.atan2(toP.x, toP.z), 9, dt); else if (spd > 0.5) e.yaw = U.dampAngle(e.yaw, Math.atan2(moveX, moveZ), 8, dt);
    e.rig.root.position.copy(e.pos); _eq.setFromAxisAngle(UP, e.yaw); e.rig.root.quaternion.copy(_eq);
    if (pose) { Anim.solve(pose, e.rig.target, e.rig.root.quaternion); rigDrive(e.rig, e.rig.target, rate, dt); }
    // cleanup long-dead bodies that are out of sight
    if (e.ko && e.fade > 14 && dist > 45) Enemies.remove(e);
  }
  if (engaged > 0) P.combatT = 2.5;
  Enemies.engaged = engaged; Enemies.alertT -= dt; Enemies.globalCool -= dt;
};

Enemies.knockOut = function (e) {
  if (e.ko) return; e.ko = true; e.alive = false; e.fade = 0; Enemies.releaseToken(e); if (e.laser) e.laser.visible = false;
  if (e.weapon) { /* stays in hand; reads fine on the ground */ }
  if (typeof Crimes !== 'undefined') Crimes.onKO(e);
};


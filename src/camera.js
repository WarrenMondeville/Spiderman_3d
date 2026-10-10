'use strict';
/* ==== p32_camera.js ==== */
/* p32: third-person camera — mouse orbit, speed-driven FOV and pull-back, swing roll, collision, trauma shake; plus title orbit and photo mode. */

const Cam = {
  yaw: 0, pitch: -0.12, dist: 4.4, fov: 60, roll: 0, trauma: 0, pos: new V3(), tgt: new V3(), idleT: 0, lastYawIn: 0,
  photo: { yaw: 0, pitch: -0.1, dist: 6, fly: false, pos: new V3(), center: new V3() }, cine: null, inited: false,
};
Cam.init = function () { Cam.yaw = Player.yaw; Cam.pos.copy(Player.pos).add(new V3(0, 2, -5)); Cam.tgt.copy(Player.pos); };
Cam.shake = function (a) { Cam.trauma = Math.min(1, Cam.trauma + a); };
Cam.snapBehind = function () { Cam.yaw = Player.yaw; Cam.pitch = -0.1; Cam.inited = false; };

Cam.update = function (dt) {
  const P = Player, c = GFX.camera;
  if (SM.mode === 'title') return Cam.title(dt);
  if (SM.mode === 'photo') return Cam.photoUpdate(dt);
  if (Cam.cine) return Cam.cineUpdate(dt);
  const lookMag = Math.abs(IN.lookX) + Math.abs(IN.lookY);
  Cam.yaw -= IN.lookX; Cam.pitch = U.clamp(Cam.pitch - IN.lookY, -1.35, 1.2);
  Cam.idleT = lookMag > 0.0005 ? 0 : Cam.idleT + dt;
  const sp = P.speed, fast = U.sat((sp - 10) / 30);
  // drift behind the direction of travel when the player is not steering the camera
  if (Cam.idleT > 0.9 && P.hSpeed > 9 && (P.state === 'swing' || P.state === 'air' || P.state === 'ground')) {
    const hy = Math.atan2(P.vel.x, P.vel.z); Cam.yaw = U.dampAngle(Cam.yaw, hy, 1.5 * U.sat((Cam.idleT - 0.9) * 2), dt);
    const wantP = P.diving ? -0.75 : U.clamp(-0.10 + P.vel.y / 110, -0.5, 0.25); Cam.pitch = U.damp(Cam.pitch, wantP, 1.2, dt);
  }
  if (P.state === 'wall' && Cam.idleT > 1.2) { const wy = Math.atan2(-P.wallN.x, -P.wallN.z); Cam.yaw = U.dampAngle(Cam.yaw, wy, 1.0, dt); }
  const inFight = P.combatT > 0 && P.state === 'ground';
  const wantDist = (P.state === 'perch' ? 5.0 : P.state === 'wall' ? 5.2 : inFight ? 5.6 : 4.3) + fast * 1.9 + (P.diving ? 1.2 : 0);
  Cam.dist = U.damp(Cam.dist, wantDist, 3.5, dt);
  const wantFov = 59 + fast * 17 + (P.diving ? 6 : 0) + (P.state === 'zip' ? 9 : 0);
  Cam.fov = U.damp(Cam.fov, wantFov, 4, dt);
  // look target: above the body centre, led slightly by velocity
  const tg = _v1.copy(P.pos).addScaledVector(UP, 0.62 + (inFight ? 0.25 : 0)).addScaledVector(P.vel, 0.035);
  if (!Cam.inited) { Cam.tgt.copy(tg); } else { Cam.tgt.x = U.damp(Cam.tgt.x, tg.x, 22, dt); Cam.tgt.z = U.damp(Cam.tgt.z, tg.z, 22, dt); Cam.tgt.y = U.damp(Cam.tgt.y, tg.y, 16, dt); }
  const cp = Math.cos(Cam.pitch), dir = _v2.set(Math.sin(Cam.yaw) * cp, Math.sin(Cam.pitch), Math.cos(Cam.yaw) * cp);
  const right = _v3.set(-Math.cos(Cam.yaw), 0, Math.sin(Cam.yaw));
  const want = _v4.copy(Cam.tgt).addScaledVector(dir, -Cam.dist * (1 - 0.3 * (Cam.kick || 0))).addScaledVector(right, 0.42).addScaledVector(UP, 0.25);
  // collision: pull in along the boom
  const bx = want.x - Cam.tgt.x, by = want.y - Cam.tgt.y, bz = want.z - Cam.tgt.z, bl = Math.hypot(bx, by, bz);
  const hit = World.ray(Cam.tgt.x, Cam.tgt.y, Cam.tgt.z, bx / bl, by / bl, bz / bl, bl + 0.35, b => b.kind !== 2 && !b.noCam);
  if (hit && hit.t < bl + 0.35) { const k = Math.max(0.6, hit.t - 0.35) / bl; want.set(Cam.tgt.x + bx * k, Cam.tgt.y + by * k, Cam.tgt.z + bz * k); }
  if (want.y < 0.35) want.y = 0.35;
  if (!Cam.inited) { Cam.pos.copy(want); Cam.inited = true; } else Cam.pos.lerp(want, 1 - Math.exp(-(hit ? 30 : 18) * dt));
  c.position.copy(Cam.pos);
  // shake
  Cam.trauma = Math.max(0, Cam.trauma - dt * 1.6); const sh = Cam.trauma * Cam.trauma, t = SM.time * 38;
  c.position.x += (vnoise2(t, 1.3) - 0.5) * sh * 0.5; c.position.y += (vnoise2(t, 7.7) - 0.5) * sh * 0.5; c.position.z += (vnoise2(t, 3.1) - 0.5) * sh * 0.5;
  c.up.set(0, 1, 0); c.lookAt(_v5.copy(Cam.tgt).addScaledVector(dir, 6));
  // bank into swing turns
  let wantRoll = 0; if (P.state === 'swing') { const lat = P.vel.x * right.x + P.vel.z * right.z; wantRoll = U.clamp(-lat * 0.006 - IN.moveX * 0.05, -0.14, 0.14); }
  Cam.roll = U.damp(Cam.roll, wantRoll, 3, dt); if (Math.abs(Cam.roll) > 1e-4) c.rotateZ(Cam.roll);
  if (Math.abs(c.fov - Cam.fov) > 0.01) { c.fov = Cam.fov; c.updateProjectionMatrix(); }
  GFX.post.comp.uniforms.uSpeed.value = U.damp(GFX.post.comp.uniforms.uSpeed.value, U.sat((sp - 22) / 30) * (P.state === 'ground' ? 0.3 : 1) + (P.state === 'zip' ? 0.5 : 0), 5, dt);
};

/* slow hero orbit behind the title card */
Cam.title = function (dt) {
  const P = Player, c = GFX.camera, t = SM.time * 0.07 + 0.35;
  // front three-quarter, sun on his chest, the lit city falling away behind; he sits on the right third, clear of the title
  // over his right shoulder: the hero rim-lit on the right third, the whole city and the low sun opening up beyond the ledge
  const a = P.yaw + PI - 0.62 + Math.sin(t) * 0.16, r = 4.3 + Math.sin(t * 1.7) * 0.4;
  c.position.set(P.pos.x + Math.sin(a) * r, P.pos.y + 0.75 + Math.sin(t * 1.3) * 0.25, P.pos.z + Math.cos(a) * r);
  const fx = Math.sin(a + PI), fz = Math.cos(a + PI), rx = -fz, rz = fx;      // camera forward / right
  c.up.set(0, 1, 0); c.lookAt(P.pos.x + fx * 30 - rx * 12.5, P.pos.y - 9, P.pos.z + fz * 30 - rz * 12.5);
  if (c.fov !== 46) { c.fov = 46; c.updateProjectionMatrix(); }
  Cam.yaw = P.yaw; Cam.pitch = -0.2; Cam.inited = false;
};

Cam.photoEnter = function () { const ph = Cam.photo; ph.yaw = Cam.yaw; ph.pitch = Cam.pitch; ph.dist = 6; ph.fly = false; ph.center.copy(Player.pos); ph.fov = 50; };
Cam.photoUpdate = function (dt) {
  const ph = Cam.photo, c = GFX.camera;
  ph.yaw -= IN.lookX; ph.pitch = U.clamp(ph.pitch - IN.lookY, -1.5, 1.5);
  ph.dist = U.clamp(ph.dist * (1 + IN.wheel * 0.12), 1.2, 1600);
  const cp = Math.cos(ph.pitch), dir = _v2.set(Math.sin(ph.yaw) * cp, Math.sin(ph.pitch), Math.cos(ph.yaw) * cp), right = _v3.set(-Math.cos(ph.yaw), 0, Math.sin(ph.yaw));
  const sp = (IN.keys.ShiftLeft ? 60 : 12) * dt * Math.max(1, ph.dist / 12);
  ph.center.addScaledVector(dir, IN.moveY * sp).addScaledVector(right, IN.moveX * sp); if (IN.keys.KeyE) ph.center.y += sp; if (IN.keys.KeyQ) ph.center.y -= sp;
  c.position.copy(ph.center).addScaledVector(dir, -ph.dist); if (c.position.y < 0.4) c.position.y = 0.4;
  c.up.set(0, 1, 0); c.lookAt(ph.center); if (c.fov !== ph.fov) { c.fov = ph.fov; c.updateProjectionMatrix(); }
};

/* short scripted shots (finishers, crime intros): {dur, fn(k, cam)} */
Cam.playCine = function (dur, fn, onEnd) { Cam.cine = { t: 0, dur, fn, onEnd }; };
Cam.cineUpdate = function (dt) {
  const C = Cam.cine, c = GFX.camera; C.t += dt / Math.max(SM.timeScale, 0.05) * SM.timeScale; const k = U.sat(C.t / C.dur);
  C.fn(k, c); if (k >= 1) { Cam.cine = null; Cam.inited = false; if (C.onEnd) C.onEnd(); }
};


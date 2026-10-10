'use strict';
/* ==== p42_crimes.js ==== */
/* p42: the city's trouble — a chain of crimes that spawn a swing away (street and rooftop), a boss showdown after the last one,
   endless patrol afterwards, and 24 spider tokens hidden on the skyline. */

const Crimes = { active: null, done: 0, total: 8, started: false, nextT: 0, tokens: [], tokenCount: 0, bossDone: false, props: [], rng: null, stats: { ko: 0 } };

Crimes.KINDS = [
  { name: 'MUGGING', roof: false, squad: ['thug', 'thug', 'thug'] },
  { name: 'ARMED ROBBERY', roof: false, squad: ['thug', 'thug', 'gunner', 'thug'] },
  { name: 'ROOFTOP DEAL', roof: true, squad: ['thug', 'thug', 'gunner', 'thug', 'thug'] },
  { name: 'GANG AMBUSH', roof: false, squad: ['thug', 'thug', 'thug', 'brute'] },
  { name: 'WEAPONS CACHE', roof: true, squad: ['gunner', 'thug', 'thug', 'gunner', 'thug'] },
  { name: 'TRUCK HEIST', roof: false, squad: ['thug', 'gunner', 'thug', 'brute', 'thug'] },
  { name: 'ROOFTOP SNIPERS', roof: true, squad: ['gunner', 'gunner', 'thug', 'thug', 'gunner', 'thug'] },
  { name: 'TURF WAR', roof: false, squad: ['thug', 'thug', 'brute', 'gunner', 'thug', 'brute'] },
];

Crimes.init = function () {
  Crimes.rng = mulberry(SM.SEED + 77);
  // beacon: a tall additive shaft you can spot from across town
  const g = new THREE.CylinderGeometry(1.6, 1.6, 1, 16, 1, true); g.translate(0, 0.5, 0);
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, uniforms: { uCol: { value: new C3(1.0, 0.12, 0.10) }, uA: { value: 1 }, uTime: GFX.uni.uTime },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vU; uniform vec3 uCol; uniform float uA, uTime; void main(){ float a = pow(1.0 - vU.y, 1.6) * (0.55 + 0.45 * sin(vU.y * 40.0 - uTime * 5.0)); gl_FragColor = vec4(uCol * 2.2, a * uA * 0.55); }' });
  Crimes.beacon = new THREE.Mesh(g, m); Crimes.beacon.scale.set(1, 260, 1); Crimes.beacon.visible = false; Crimes.beacon.frustumCulled = false; GFX.scene.add(Crimes.beacon);
  Crimes.crateGeo = new THREE.BoxGeometry(1, 1, 1); Crimes.crateMat = MAT(new THREE.MeshStandardMaterial({ color: 0x6a5232, roughness: 0.85 })); Crimes.crateMat2 = MAT(new THREE.MeshStandardMaterial({ color: 0x2f3b33, roughness: 0.7, metalness: 0.2 }));
  Crimes.placeTokens();
};
Crimes.begin = function () { if (Crimes.started) return; Crimes.started = true; Crimes.nextT = 1.5; };

/* ---------- locations ---------- */
Crimes.pickSpot = function (roof) {
  const P = Player.pos, R = Crimes.rng;
  for (let tries = 0; tries < 60; tries++) {
    const a = R() * TAU, d = 170 + R() * 190, x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
    if (!CITY.inBounds(x, z, -40) || CITY.inPark(x, z, 12)) continue;
    if (roof) {
      let best = null; World.query(x - 60, x + 60, z - 60, z + 60, b => { if (b.kind !== 0 || !b.par || b.y1 < 16 || b.y1 > 85) return; const w = b.x1 - b.x0, dd = b.z1 - b.z0; if (w < 24 || dd < 20) return; if (City.heightAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) > b.y1 + 1) return; if (!best || w * dd > best.a) best = { b, a: w * dd }; });
      if (best) { const b = best.b; return { x: (b.x0 + b.x1) / 2, y: b.y1, z: (b.z0 + b.z1) / 2, r: Math.min(b.x1 - b.x0, b.z1 - b.z0) / 2 - 3.5, roof: true }; }
    } else {
      // mid-block on the nearest cross street
      const i = U.clamp(Math.round((x - CITY.X0 - CITY.AVE - CITY.BX / 2) / CITY.PX), 0, CITY.NX - 1), j = U.clamp(Math.round((z - CITY.Z0 - CITY.ST / 2) / CITY.PZ), 0, CITY.NZ);
      const sx = CITY.blockX(i) + CITY.BX / 2, sz = CITY.stZ(j);
      if (CITY.inPark(sx, sz, 8)) continue; if (Math.hypot(sx - P.x, sz - P.z) < 140) continue;
      return { x: sx, y: 0, z: sz, r: 5.2, roof: false, street: true };
    }
  }
  return null;
};

Crimes.spawnNext = function () {
  const idx = Crimes.done, boss = idx >= Crimes.total && !Crimes.bossDone;
  let kind = boss ? { name: 'THE FOREMAN', roof: true, squad: ['brute', 'thug', 'thug', 'gunner', 'thug'] } : idx < Crimes.total ? Crimes.KINDS[idx] : Crimes.KINDS[2 + Math.floor(Crimes.rng() * 6)];
  const spot = Crimes.pickSpot(kind.roof) || Crimes.pickSpot(!kind.roof); if (!spot) { Crimes.nextT = 4; return; }
  Crimes.active = { kind, spot, state: 'far', enemies: [], t: 0, boss, farT: 0, group: { hpMul: 1 + Math.min(idx, 10) * 0.05, dmgMul: 1 + Math.min(idx, 10) * 0.04 }, startCombo: 0 };
  Crimes.beacon.position.set(spot.x, spot.y, spot.z); Crimes.beacon.visible = true; Crimes.beacon.material.uniforms.uCol.value.setRGB(boss ? 0.65 : 1.0, 0.12, boss ? 1.0 : 0.10);
  HUD.banner(boss ? 'SHOWDOWN' : 'CRIME IN PROGRESS', kind.name, (spot.roof ? 'ROOFTOP · ' : 'STREET LEVEL · ') + DISTRICTS[CITY.districtAt(spot.x, spot.z)], 4.5, boss ? 'info' : '');
  if (Crimes.done === 0) Flow.hint('FOLLOW THE <b style="color:#ff4a4f">RED MARKER</b> — THE BEACON SHOWS WHERE', 7);
};

Crimes.populate = function (C) {
  const s = C.spot, n = C.kind.squad.length;
  C.kind.squad.forEach((type, i) => {
    const a = i / n * TAU + 0.4, r = Math.min(s.r, 2.4 + (i % 3) * 1.5), x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r * (s.street ? 0.62 : 1);
    const e = Enemies.spawn(type, x, s.y + (s.street ? 0 : 0), z, Math.atan2(s.x - x, s.z - z) + PI * (i % 2), C.group); e.pos.y = World.floorAt(x, z, s.y + 1.2);
    if (C.boss && i === 0) { e.boss = true; e.hp = e.maxHp = 1150; e.rig.root.scale.setScalar(1.5); e.TY = Object.assign({}, e.TY, { scale: 1.5, dmg: 40, name: 'THE FOREMAN' }); }
    C.enemies.push(e);
  });
  // set dressing: crates and a duffel
  const R = Crimes.rng; for (let i = 0; i < 5; i++) { const sz = 0.7 + R() * 0.7, m = new THREE.Mesh(Crimes.crateGeo, i % 2 ? Crimes.crateMat : Crimes.crateMat2); const a = R() * TAU, r = s.r * (0.75 + R() * 0.3); m.scale.set(sz, sz * (0.7 + R() * 0.5), sz); m.position.set(s.x + Math.cos(a) * r, s.y + m.scale.y / 2 + (s.street ? 0 : 0), s.z + Math.sin(a) * r * (s.street ? 0.5 : 1)); m.rotation.y = R() * 3; m.castShadow = true; m.receiveShadow = true; GFX.scene.add(m); Crimes.props.push(m); }
};
Crimes.cleanupProps = function () { for (const m of Crimes.props) GFX.scene.remove(m); Crimes.props.length = 0; };

Crimes.onKO = function (e) { Crimes.stats.ko++; };

Crimes.update = function (dt) {
  Crimes.updateTokens(dt);
  if (!Crimes.started) return;
  const C = Crimes.active, P = Player;
  if (!C) { Crimes.nextT -= dt; if (Crimes.nextT <= 0) Crimes.spawnNext(); return; }
  C.t += dt; const s = C.spot, d = Math.hypot(P.pos.x - s.x, P.pos.z - s.z);
  Crimes.beacon.material.uniforms.uA.value = U.sat((d - 25) / 60);
  if (C.state === 'far') { if (d < 150) { Crimes.populate(C); C.state = 'ready'; } }
  else if (C.state === 'ready') { if (Enemies.engaged > 0) { C.state = 'fight'; C.startT = C.t; if (C.boss) HUD.boss(C.enemies[0]); if (Crimes.done === 0) Flow.hint('<span class="kbd">LMB</span> ATTACK · <span class="kbd">E</span> WEB · <span class="kbd">Q</span> DODGE WHEN YOUR SPIDER-SENSE FLARES', 8); } if (d > 300) { C.farT += dt; if (C.farT > 25) Crimes.abort(); } else C.farT = 0; }
  else if (C.state === 'fight') {
    if (C.boss && !C.wave2 && C.enemies[0].hp < C.enemies[0].maxHp * 0.5) { C.wave2 = true; for (let i = 0; i < 3; i++) { const a = i * 2.1, e = Enemies.spawn(i === 2 ? 'gunner' : 'thug', s.x + Math.cos(a) * s.r, s.y, s.z + Math.sin(a) * s.r, 0, C.group); e.state = 'approach'; C.enemies.push(e); } HUD.toast('REINFORCEMENTS'); }
    let alive = 0; for (const e of C.enemies) if (e.alive && !e.ko) alive++;
    if (alive === 0) {
      C.state = 'done'; C.doneT = 0; const secs = Math.round(C.t - C.startT);
      if (C.boss) { Crimes.bossDone = true; HUD.boss(null); HUD.banner('THE CITY IS SAFE', 'THE FOREMAN IS DOWN', `BEST COMBO ${Combat.best} · ${Crimes.stats.ko} CRIMINALS WEBBED UP · KEEP PATROLLING`, 8, 'good'); }
      else { Crimes.done++; HUD.banner('CRIME STOPPED', C.kind.name, `${secs}s · BEST COMBO ${Combat.best}` + (Crimes.done === Crimes.total ? ' · ONE MORE CALL COMING IN…' : ''), 4.5, 'good'); }
      Player.addFocus(1); Crimes.beacon.visible = false;
    }
    if (d > 220) { C.farT += dt; if (C.farT > 12) Crimes.abort(); } else C.farT = 0;
  } else if (C.state === 'done') { C.doneT += dt; if (C.doneT > 7) { if (d > 50 || C.doneT > 30) { for (const e of C.enemies) if (Enemies.list.includes(e)) Enemies.remove(e); Crimes.cleanupProps(); } Crimes.active = null; Crimes.nextT = 3; } }
};
Crimes.abort = function () { const C = Crimes.active; if (!C) return; for (const e of C.enemies) if (Enemies.list.includes(e)) Enemies.remove(e); Crimes.cleanupProps(); HUD.boss(null); Crimes.active = null; Crimes.nextT = 2; Crimes.beacon.visible = false; HUD.toast('THEY GOT AWAY — NEW CALL INCOMING'); };
Crimes.marker = function () { const C = Crimes.active; if (!C || C.state === 'done') return null; return { x: C.spot.x, y: C.spot.y + 3, z: C.spot.z, boss: C.boss, name: C.kind.name }; };

/* ---------- tokens ---------- */
Crimes.placeTokens = function () {
  const spots = [], far = (x, z) => spots.every(s => Math.hypot(s.x - x, s.z - z) > 110);
  const byH = CITY.buildings.slice().sort((a, b) => b.h - a.h);
  for (const b of byH) { if (spots.length >= 14) break; const t = b.tiers[b.tiers.length - 1], x = (t.x0 + t.x1) / 2, z = (t.z0 + t.z1) / 2; if (far(x, z)) spots.push({ x, y: (b.spire ? b.spire.y : t.y1) + 2.4, z }); }
  const R = mulberry(SM.SEED + 5); let guard = 0;
  while (spots.length < 22 && guard++ < 400) { const b = CITY.buildings[Math.floor(R() * CITY.buildings.length)]; if (b.h > 60 || b.h < 14) continue; const t = b.tiers[0], x = (t.x0 + t.x1) / 2, z = (t.z0 + t.z1) / 2; if (far(x, z)) spots.push({ x, y: t.y1 + 2.2, z }); }
  const Pk = CITY.PARK; spots.push({ x: (Pk.x0 + Pk.x1) / 2 + 30, y: 2.4, z: (Pk.z0 + Pk.z1) / 2 + 40 }); spots.push({ x: Pk.x0 + 40, y: 2.4, z: Pk.z0 + 40 });
  const tex = canvasTex(128, 128, (g) => { g.translate(64, 64); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, -10, 8, 10, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(0, 14, 10, 20, 0, 0, TAU); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round'; for (const s of [-1, 1]) for (const L of [[[6, -10], [26, -24], [30, -48]], [[7, -4], [36, -10], [46, -30]], [[7, 4], [36, 12], [46, 38]], [[5, 10], [24, 28], [26, 52]]]) { g.beginPath(); L.forEach((p, i) => i ? g.lineTo(p[0] * s, p[1]) : g.moveTo(p[0] * s, p[1])); g.stroke(); } }, { clamp: true });
  for (const s of spots) {
    s.y = Math.max(s.y, World.floorAt(s.x, s.z, 1e4) + 2.4);      // never inside a water tower or plant room
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new C3(3.0, 2.1, 0.5), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })); sp.scale.setScalar(1.7); sp.position.set(s.x, s.y, s.z);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.texGlow, color: new C3(1.6, 1.0, 0.2), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })); gl.scale.setScalar(5.5); gl.position.copy(sp.position);
    GFX.scene.add(sp, gl); Crimes.tokens.push({ x: s.x, y: s.y, z: s.z, sp, gl, got: false });
  }
};
Crimes.updateTokens = function (dt) {
  const P = Player.pos, t = SM.time;
  for (const k of Crimes.tokens) {
    if (k.got) continue; k.sp.position.y = k.y + Math.sin(t * 2 + k.x) * 0.25; k.gl.position.y = k.sp.position.y; k.sp.material.rotation = Math.sin(t * 1.3 + k.z) * 0.25;
    if (Math.abs(P.x - k.x) < 3.4 && Math.abs(P.z - k.z) < 3.4 && Math.abs(P.y - k.y) < 4) { k.got = true; k.sp.visible = k.gl.visible = false; Crimes.tokenCount++; Player.addFocus(0.5); FX.sparks(new V3(k.x, k.y, k.z), 24, [3, 2, 0.4]); HUD.toast(`SPIDER TOKEN ${Crimes.tokenCount}/${Crimes.tokens.length}`); }
  }
};


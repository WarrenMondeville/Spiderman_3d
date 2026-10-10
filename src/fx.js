'use strict';
/* ==== p33_fx.js ==== */
/* p33: effects — web lines (camera-facing ribbons that shoot out, go taut, then drift free), web bolts, particles, impact flashes, wind streaks, sun glare. */

const FX = { lines: [], bolts: [], flashes: [], parts: null, streaks: null, active: null, zipLines: [] };

FX.init = function () {
  // ---- textures
  FX.texStrand = canvasTex(64, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-out'; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
    for (let i = -2; i < 12; i++) { g.beginPath(); g.moveTo(0, i * 28); g.lineTo(w, i * 28 + 40); g.stroke(); }
  }, { linear: false });
  FX.texBurst = canvasTex(256, 256, (g, w, h) => {
    g.translate(w / 2, h / 2); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 120); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.85)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr; g.beginPath(); const n = 14; for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU, r = i % 2 ? 34 + (i * 37 % 17) : 120 - (i * 53 % 40); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
  }, { clamp: true });
  FX.texRing = canvasTex(256, 256, (g, w, h) => { g.translate(w / 2, h / 2); g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 108, 0, TAU); g.stroke(); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(0, 0, 90, 0, TAU); g.stroke(); }, { clamp: true });
  FX.texSplat = canvasTex(256, 256, (g, w, h) => {
    g.translate(w / 2, h / 2); g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineCap = 'round';
    for (let i = 0; i < 11; i++) { const a = i / 11 * TAU + (i % 3) * 0.12, r = 80 + (i * 29 % 40); g.lineWidth = 5 - (i % 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke(); }
    g.lineWidth = 2.5; for (const rr of [26, 50, 76]) { g.beginPath(); for (let i = 0; i <= 11; i++) { const a = i / 11 * TAU + (i % 3) * 0.12, r = rr * (0.92 + (i % 2) * 0.12); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.fill();
  }, { clamp: true });
  FX.texGlow = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { clamp: true });

  // ---- web line pool
  const SEG = 22; FX.SEG = SEG;
  FX.webMat = new THREE.MeshBasicMaterial({ map: FX.texStrand, color: new C3(1.12, 1.12, 1.16), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  for (let i = 0; i < 8; i++) {
    const g = new THREE.BufferGeometry(), n = (SEG + 1) * 2, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
    for (let s = 0; s <= SEG; s++) { uv[s * 4] = 0; uv[s * 4 + 1] = s / SEG * 6; uv[s * 4 + 2] = 1; uv[s * 4 + 3] = s / SEG * 6; if (s < SEG) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    const mat = FX.webMat.clone(); const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.visible = false; m.renderOrder = 20; GFX.scene.add(m);
    FX.lines.push({ mesh: m, a: new V3(), b: new V3(), live: false, grow: 0, age: 0, detached: false, side: 1, fade: 1, fromHand: true, vel: new V3(), slack: 0 });
  }
  // splat sprites + flashes
  const mkSprite = (tex, additive) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false, color: new C3(1.4, 1.4, 1.4) })); s.visible = false; s.renderOrder = 25; GFX.scene.add(s); return s; };
  for (let i = 0; i < 10; i++) FX.flashes.push({ s: mkSprite(i % 2 ? FX.texRing : FX.texBurst, true), t: 0, dur: 0.15, size: 1, live: false, ring: i % 2 === 1 });
  FX.splats = []; for (let i = 0; i < 10; i++) FX.splats.push({ s: mkSprite(FX.texSplat, false), t: 0, live: false, follow: null });
  // ---- bolts
  const bg = new THREE.OctahedronGeometry(0.09, 1); bg.scale(0.7, 0.7, 2.6);
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: new C3(2.2, 2.2, 2.3), toneMapped: false })); m.visible = false; GFX.scene.add(m); FX.bolts.push({ m, live: false, pos: new V3(), vel: new V3(), t: 0, target: null, onHit: null }); }
  // ---- particles (two blend modes share one shader)
  const mkParts = (n, additive) => {
    const g = new THREE.BufferGeometry(); const P = { n, pos: new Float32Array(n * 3), col: new Float32Array(n * 4), size: new Float32Array(n), vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), grav: new Float32Array(n), grow: new Float32Array(n), drag: new Float32Array(n), head: 0 };
    g.setAttribute('position', new THREE.BufferAttribute(P.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aCol', new THREE.BufferAttribute(P.col, 4).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aSize', new THREE.BufferAttribute(P.size, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false, uniforms: { uScale: { value: 600 } },
      vertexShader: 'attribute vec4 aCol; attribute float aSize; varying vec4 vCol; uniform float uScale; void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(-mv.z, 0.1); }',
      fragmentShader: 'varying vec4 vCol; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = smoothstep(1.0, 0.25, r); if (a * vCol.a < 0.004) discard; gl_FragColor = vec4(vCol.rgb, vCol.a * a); }' });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 22; GFX.scene.add(pts); P.pts = pts; P.geo = g; return P;
  };
  FX.soft = mkParts(500, false); FX.glow = mkParts(400, true);
  // ---- wind streaks
  const SN = 46, sg = new THREE.BufferGeometry(); FX.streak = { n: SN, pos: new Float32Array(SN * 6), col: new Float32Array(SN * 6), p: [], geo: sg };
  sg.setAttribute('position', new THREE.BufferAttribute(FX.streak.pos, 3).setUsage(THREE.DynamicDrawUsage)); sg.setAttribute('color', new THREE.BufferAttribute(FX.streak.col, 3).setUsage(THREE.DynamicDrawUsage));
  const sl = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); sl.frustumCulled = false; GFX.scene.add(sl);
  for (let i = 0; i < SN; i++) FX.streak.p.push({ pos: new V3(), life: 0 });
  // ---- sun glare
  FX.glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.texGlow, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, toneMapped: false, fog: false })); FX.glare.renderOrder = 30; FX.glareVis = 0; GFX.scene.add(FX.glare);
  FX.streakSp = new THREE.Sprite(FX.glare.material.clone()); FX.streakSp.renderOrder = 30; GFX.scene.add(FX.streakSp);
};

/* ---------- particles ---------- */
FX.emit = function (P, x, y, z, vx, vy, vz, r, g, b, a, size, life, grav, grow, drag) {
  const i = P.head; P.head = (P.head + 1) % P.n;
  P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z; P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
  P.col[i * 4] = r; P.col[i * 4 + 1] = g; P.col[i * 4 + 2] = b; P.col[i * 4 + 3] = a; P.size[i] = size; P.life[i] = life; P.max[i] = life; P.grav[i] = grav; P.grow[i] = grow; P.drag[i] = drag || 0; P.a0 = a;
};
FX.stepParts = function (P, dt) {
  for (let i = 0; i < P.n; i++) {
    if (P.life[i] <= 0) { if (P.col[i * 4 + 3] !== 0) P.col[i * 4 + 3] = 0; continue; }
    P.life[i] -= dt; const k = Math.max(0, P.life[i] / P.max[i]);
    P.vel[i * 3 + 1] -= P.grav[i] * dt; const dr = 1 - P.drag[i] * dt; P.vel[i * 3] *= dr; P.vel[i * 3 + 1] *= dr; P.vel[i * 3 + 2] *= dr;
    P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
    P.size[i] += P.grow[i] * dt; P.col[i * 4 + 3] *= (k < 0.5 ? Math.pow(k * 2, dt * 6) : 1); if (P.life[i] <= 0) P.col[i * 4 + 3] = 0;
  }
  P.geo.attributes.position.needsUpdate = true; P.geo.attributes.aCol.needsUpdate = true; P.geo.attributes.aSize.needsUpdate = true;
};
FX.dust = function (p, n) { const T = TODS[SM.tod], l = 0.35 + T.hemiInt * 0.12; for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 1.5 + Math.random() * 3; FX.emit(FX.soft, p.x + Math.cos(a) * 0.3, p.y - PL.H + 0.1, p.z + Math.sin(a) * 0.3, Math.cos(a) * s, 0.4 + Math.random() * 1.2, Math.sin(a) * s, l, l * 0.93, l * 0.85, 0.34, 0.35, 0.7 + Math.random() * 0.5, -0.3, 1.6, 2.5); } };
FX.sparks = function (p, n, col) { col = col || [3, 1.6, 0.5]; for (let i = 0; i < n; i++) { const a = Math.random() * TAU, e = Math.random() * 1.2 - 0.2, s = 3 + Math.random() * 7; FX.emit(FX.glow, p.x, p.y, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 2, Math.sin(a) * Math.cos(e) * s, col[0], col[1], col[2], 1, 0.06 + Math.random() * 0.05, 0.25 + Math.random() * 0.3, 14, 0, 1.5); } };
FX.webBits = function (p, n) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 1 + Math.random() * 3; FX.emit(FX.soft, p.x, p.y, p.z, Math.cos(a) * s, Math.random() * 3, Math.sin(a) * s, 1.3, 1.3, 1.35, 0.9, 0.08, 0.5, 6, 0, 2); } };
FX.splash = function (p) { for (let i = 0; i < 40; i++) { const a = Math.random() * TAU, s = 2 + Math.random() * 5; FX.emit(FX.soft, p.x, -2.4, p.z, Math.cos(a) * s, 5 + Math.random() * 8, Math.sin(a) * s, 0.9, 0.95, 1.0, 0.7, 0.35, 1.0, 16, 0.6, 0.5); } };
FX.healBurst = function (p) { for (let i = 0; i < 26; i++) { const a = Math.random() * TAU; FX.emit(FX.glow, p.x + Math.cos(a) * 0.5, p.y - 0.6 + Math.random() * 1.4, p.z + Math.sin(a) * 0.5, 0, 1.5 + Math.random(), 0, 0.3, 1.6, 0.7, 0.9, 0.1, 0.7, -1, 0, 0); } };
FX.smoke = function (x, y, z) { FX.emit(FX.soft, x, y, z, (Math.random() - 0.5) * 0.4, 1.0 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, 0.8, 0.8, 0.82, 0.16, 0.8, 3.2, -0.15, 0.9, 0.2); };

FX.flash = function (p, size, ringToo) {
  let n = 0; for (const f of FX.flashes) { if (f.live) continue; if (f.ring && !ringToo) continue; if (!f.ring && n) continue; f.live = true; f.t = 0; f.dur = f.ring ? 0.26 : 0.13; f.size = size * (f.ring ? 0.6 : 1); f.s.position.copy(p); f.s.visible = true; f.s.material.rotation = Math.random() * TAU; if (!f.ring) n++; else break; }
};
FX.splat = function (p, size, follow, off) { for (const s of FX.splats) { if (s.live) continue; s.live = true; s.t = 0; s.s.position.copy(p); s.s.scale.setScalar(size); s.s.visible = true; s.s.material.opacity = 1; s.s.material.rotation = Math.random() * TAU; s.follow = follow || null; s.off = off || null; return s; } };

/* ---------- web lines ---------- */
FX.getLine = function () { let best = FX.lines[0]; for (const l of FX.lines) { if (!l.live) return l; if (l.age > best.age) best = l; } return best; };
FX.webShoot = function (side, anchor) {
  const l = FX.getLine(); l.live = true; l.detached = false; l.grow = 0; l.age = 0; l.fade = 1; l.side = side; l.b.copy(anchor); l.fromHand = true; l.slack = 1; l.mesh.visible = true; FX.active = l;
  FX.splat(anchor, 1.6); FX.emitThwip(side);
};
FX.emitThwip = function (side) { const h = Player.handPos(side, _v6); FX.webBits(h, 3); };
FX.webRelease = function () { const l = FX.active; if (!l) return; l.detached = true; l.age = 0; l.vel.copy(Player.vel).multiplyScalar(0.5); FX.active = null; };
FX.webZip = function (to) {
  for (const side of [-1, 1]) { const l = FX.getLine(); l.live = true; l.detached = false; l.grow = 0; l.age = 0; l.fade = 1; l.side = side; l.b.copy(to); l.fromHand = true; l.slack = 0.2; l.mesh.visible = true; l.zip = true; FX.zipLines.push(l); }
  FX.splat(to, 1.2);
};
FX.airZip = function (d) { for (const side of [-1, 1]) { const l = FX.getLine(); l.live = true; l.detached = true; l.grow = 1; l.age = 0; l.fade = 1; l.side = side; Player.handPos(side, l.a); l.b.copy(l.a).addScaledVector(d, 16); l.vel.copy(Player.vel).multiplyScalar(0.2); l.fromHand = false; l.slack = 0.3; l.mesh.visible = true; l.zip = false; } };
FX.webTo = function (side, target, life) { const l = FX.getLine(); l.live = true; l.detached = false; l.grow = 0; l.age = 0; l.fade = 1; l.side = side; l.b.copy(target); l.fromHand = true; l.slack = 0.15; l.mesh.visible = true; l.zip = false; l.ttl = life || 0.3; return l; };

FX.updateLine = function (l, dt) {
  const cam = GFX.camera.position; l.age += dt;
  if (l.fromHand && !l.detached) Player.handPos(l.side, l.a);
  if (l.ttl !== undefined) { l.ttl -= dt; if (l.ttl <= 0) { l.detached = true; l.age = 0; l.ttl = undefined; l.vel.set(0, 0, 0); } }
  if (l.zip && Player.state !== 'zip') { l.zip = false; l.detached = true; l.age = 0; l.vel.set(0, 0, 0); }
  if (!l.detached) { l.grow = Math.min(1, l.grow + dt * 9); if (l === FX.active) l.slack = U.damp(l.slack, Player.web.taut ? 0 : 0.5, 10, dt); }
  else { l.fade = Math.max(0, 1 - l.age / 1.1); l.a.addScaledVector(l.vel, dt); l.vel.y -= 9 * dt; l.vel.multiplyScalar(1 - 1.5 * dt); l.slack = Math.min(2.5, l.slack + dt * 3); if (l.fade <= 0) { l.live = false; l.mesh.visible = false; return; } }
  const pos = l.mesh.geometry.attributes.position.array, SEG = FX.SEG;
  const ax = l.a.x, ay = l.a.y, az = l.a.z, dx = l.b.x - ax, dy = l.b.y - ay, dz = l.b.z - az, L = Math.hypot(dx, dy, dz) || 1;
  const sag = l.slack * Math.min(3, L * 0.06), wob = (1 - l.grow) * 0.6 + (l.detached ? 0.25 * l.slack : 0);
  // a horizontal side vector for the wobble
  let sx = -dz, sz = dx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
  let px = ax, py = ay, pz = az;
  for (let s = 0; s <= SEG; s++) {
    const t = s / SEG, tt = t * l.grow, env = Math.sin(t * PI);
    const w = Math.sin(t * 17 - SM.time * 34) * wob * env;
    const x = ax + dx * tt + sx * w, y = ay + dy * tt - sag * env + Math.cos(t * 13 + SM.time * 27) * wob * 0.5 * env, z = az + dz * tt + sz * w;
    // tangent & camera-facing side
    let tx = x - px, ty = y - py, tz = z - pz; if (s === 0) { tx = dx; ty = dy; tz = dz; }
    const cx = cam.x - x, cy = cam.y - y, cz = cam.z - z, cd = Math.hypot(cx, cy, cz);
    let ox = ty * cz - tz * cy, oy = tz * cx - tx * cz, oz = tx * cy - ty * cx; const ol = Math.hypot(ox, oy, oz) || 1;
    const wdt = U.clamp(cd * 0.0015, 0.011, 0.11) * (0.55 + 0.45 * l.fade); ox = ox / ol * wdt; oy = oy / ol * wdt; oz = oz / ol * wdt;
    const i = s * 6; pos[i] = x - ox; pos[i + 1] = y - oy; pos[i + 2] = z - oz; pos[i + 3] = x + ox; pos[i + 4] = y + oy; pos[i + 5] = z + oz;
    px = x; py = y; pz = z;
  }
  l.mesh.geometry.attributes.position.needsUpdate = true; l.mesh.material.opacity = l.fade;
};

/* ---------- web bolts ---------- */
FX.bolt = function (from, target, getPos, onHit) {
  for (const b of FX.bolts) { if (b.live) continue; b.live = true; b.t = 0; b.pos.copy(from); b.getPos = getPos; b.onHit = onHit; b.m.visible = true; return b; }
};

FX.update = function (dt) {
  for (const l of FX.lines) if (l.live) FX.updateLine(l, dt);
  FX.zipLines = FX.zipLines.filter(l => l.zip);
  for (const f of FX.flashes) { if (!f.live) continue; f.t += dt; const k = f.t / f.dur; if (k >= 1) { f.live = false; f.s.visible = false; continue; } const sc = f.size * (f.ring ? 0.4 + k * 2.2 : 0.6 + k * 0.9); f.s.scale.setScalar(sc); f.s.material.opacity = (1 - k) * (f.ring ? 0.8 : 1); }
  for (const s of FX.splats) { if (!s.live) continue; s.t += dt; if (s.follow) { s.follow.getWorldPosition(s.s.position); if (s.off) s.s.position.add(s.off); } if (s.t > 5) { s.s.material.opacity = Math.max(0, 1 - (s.t - 5)); if (s.t > 6) { s.live = false; s.s.visible = false; } } }
  for (const b of FX.bolts) {
    if (!b.live) continue; b.t += dt; const tp = b.getPos(_v6); const d = _v5.subVectors(tp, b.pos), dist = d.length(), step = 70 * dt;
    if (dist <= step + 0.3 || b.t > 1.5) { b.live = false; b.m.visible = false; if (b.t <= 1.5 && b.onHit) b.onHit(tp); continue; }
    d.multiplyScalar(1 / dist); b.pos.addScaledVector(d, step); b.m.position.copy(b.pos); b.m.lookAt(tp); if (Math.random() < 0.6) FX.emit(FX.soft, b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, 1.4, 1.4, 1.45, 0.5, 0.07, 0.25, 0, 0, 0);
  }
  FX.stepParts(FX.soft, dt); FX.stepParts(FX.glow, dt);
  const sc = GFX.renderer.domElement.height * 0.5 / Math.tan(GFX.camera.fov * DEG * 0.5); FX.soft.pts.material.uniforms.uScale.value = sc; FX.glow.pts.material.uniforms.uScale.value = sc;
  // wind streaks rush past at speed
  const S = FX.streak, P = Player, sp = P.speed, amt = U.sat((sp - 20) / 25) * (P.state === 'ground' ? 0 : 1);
  const cam = GFX.camera, vdir = _v1.copy(P.vel).normalize();
  for (let i = 0; i < S.n; i++) {
    const q = S.p[i]; q.life -= dt;
    if (q.life <= 0 && Math.random() < amt * 0.5) { const r = 2.5 + Math.random() * 7, a = Math.random() * TAU; _v2.set(Math.cos(a) * r, Math.sin(a) * r * 0.7, -(8 + Math.random() * 26)).applyQuaternion(cam.quaternion); q.pos.copy(cam.position).add(_v2); q.life = 0.35; }
    const o = i * 6, k = Math.max(0, q.life / 0.35), c = k * (1 - k) * 4 * 0.20 * amt;
    S.pos[o] = q.pos.x; S.pos[o + 1] = q.pos.y; S.pos[o + 2] = q.pos.z; S.pos[o + 3] = q.pos.x - vdir.x * (1.5 + sp * 0.05); S.pos[o + 4] = q.pos.y - vdir.y * (1.5 + sp * 0.05); S.pos[o + 5] = q.pos.z - vdir.z * (1.5 + sp * 0.05);
    S.col[o] = S.col[o + 1] = S.col[o + 2] = c; S.col[o + 3] = S.col[o + 4] = S.col[o + 5] = 0;
  }
  S.geo.attributes.position.needsUpdate = true; S.geo.attributes.color.needsUpdate = true;
  // sun glare with building occlusion
  const T = TODS[SM.tod], sd = GFX.uni.uSunDirW.value, cp = cam.position;
  const occ = World.ray(cp.x, cp.y, cp.z, sd.x, sd.y, sd.z, 1500, b => b.kind === 0);
  const fw = cam.getWorldDirection(_v3).dot(sd);
  FX.glareVis = U.damp(FX.glareVis, (occ && occ.box) || fw < 0.2 ? 0 : 1, 9, dt);
  const gi = FX.glareVis * (SM.tod === 1 ? 0.06 : 0.26) * U.sat((fw - 0.2) * 1.6);
  FX.glare.position.copy(cp).addScaledVector(sd, 900); FX.glare.scale.setScalar(360); FX.glare.material.color.setRGB(T.sunCol[0] * gi, T.sunCol[1] * gi, T.sunCol[2] * gi);
  FX.streakSp.position.copy(FX.glare.position); FX.streakSp.scale.set(2600, 46, 1); FX.streakSp.material.color.setRGB(T.sunCol[0] * gi * 0.8, T.sunCol[1] * gi * 0.8, T.sunCol[2] * gi * 0.8);
};


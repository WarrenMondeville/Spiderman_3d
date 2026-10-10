'use strict';
/* ==== p11_traffic.js ==== */
/* p11: traffic — cars follow lanes, keep gaps, queue at red lights, brake for Spider-Man and for crime scenes; kerbs are lined with parked cars. */

const Traffic = { lanes: [], cars: [], types: {}, meshes: {}, n: 0 };

Traffic.carGeo = function (kind) {
  const g = new GeoM(), body = colr(1, 1, 1), glass = colr(0.035, 0.05, 0.065), tyre = colr(0.02, 0.02, 0.022), trim = colr(0.06, 0.06, 0.07), hub = colr(0.35, 0.36, 0.38);
  const L = kind === 'bus' ? 11.5 : kind === 'van' ? 5.4 : 4.55, W = kind === 'bus' ? 2.55 : kind === 'van' ? 2.0 : 1.84, H = kind === 'bus' ? 2.2 : kind === 'van' ? 1.05 : 0.62, y0 = kind === 'bus' ? 0.45 : 0.30;
  // lower body with a dropped nose
  const lb = new THREE.BoxGeometry(L, H, W, 4, 1, 1).toNonIndexed(), P = lb.attributes.position;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i); if (y > 0 && kind === 'sedan') { if (x > L * 0.3) P.setY(i, y - 0.07); if (x < -L * 0.3) P.setY(i, y - 0.03); } if (Math.abs(x) > L * 0.49) P.setZ(i, P.getZ(i) * 0.93); }
  lb.computeVertexNormals(); g.add(lb, body, new M4().makeTranslation(0, y0 + H / 2, 0));
  // greenhouse: a tapered prism, glass sides, painted roof
  const cab = (x0, x1, tx0, tx1, yb, yt, wb, wt) => {
    const v = [[x0, yb, -wb], [x1, yb, -wb], [x1, yb, wb], [x0, yb, wb], [tx0, yt, -wt], [tx1, yt, -wt], [tx1, yt, wt], [tx0, yt, wt]];
    const quad = (a, b, c, d, col) => { const gg = new THREE.BufferGeometry(); const pts = [a, b, c, a, c, d].flatMap(k => v[k]); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); gg.computeVertexNormals(); g.add(gg, col); };
    quad(0, 4, 5, 1, glass); quad(2, 6, 7, 3, glass); quad(1, 5, 6, 2, glass); quad(3, 7, 4, 0, glass); quad(4, 7, 6, 5, body);
  };
  if (kind === 'sedan') cab(-1.35, 1.05, -0.95, 0.45, y0 + H - 0.03, y0 + H + 0.50, W / 2 - 0.06, W / 2 - 0.22);
  else if (kind === 'van') cab(-2.6, 1.55, -2.55, 1.0, y0 + H - 0.02, y0 + H + 0.62, W / 2 - 0.04, W / 2 - 0.12);
  else { for (const s of [-1, 1]) g.box(L * 0.88, 0.85, 0.04, -0.2, y0 + H * 0.66, s * (W / 2 + 0.005), glass); g.box(0.04, 1.0, W * 0.86, L / 2 + 0.005, y0 + H * 0.62, 0, glass); }
  const wr = kind === 'bus' ? 0.48 : 0.33, wx = kind === 'bus' ? [L * 0.33, -L * 0.30] : [L * 0.31, -L * 0.30];
  for (const x of wx) for (const s of [-1, 1]) { g.cyl(wr, wr, 0.24, 9, x, wr, s * (W / 2 - 0.10), tyre, PI / 2); g.cyl(wr * 0.55, wr * 0.55, 0.02, 6, x, wr, s * (W / 2 + 0.03), hub, PI / 2); }
  g.box(0.12, 0.2, W * 0.96, L / 2 + 0.02, y0 + 0.12, 0, trim); g.box(0.12, 0.2, W * 0.96, -L / 2 - 0.02, y0 + 0.12, 0, trim);
  // lights geometry (separate emissive mesh): white front, red rear
  const lg = new GeoM(); for (const s of [-1, 1]) { lg.box(0.05, 0.13, 0.32, L / 2 + 0.03, y0 + H * (kind === 'bus' ? 0.2 : 0.62), s * (W / 2 - 0.3), colr(1, 0.93, 0.75)); lg.box(0.05, 0.12, 0.36, -L / 2 - 0.03, y0 + H * (kind === 'bus' ? 0.25 : 0.68), s * (W / 2 - 0.3), colr(1, 0.05, 0.03)); }
  if (kind === 'sedan') { /* taxi roof light is tinted by instance colour: only visible on cabs via scale trick below */ }
  return { body: g.build(), lights: lg.build(), L, W, H: y0 + H + (kind === 'bus' ? 0 : 0.5) };
};

Traffic.build = function () {
  const R = mulberry(SM.SEED + 808);
  Traffic.paint = MAT(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.4, envMapIntensity: 1.0 }));
  Traffic.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const COLS = [0xf2b705, 0xf2b705, 0xf2b705, 0x1c1f24, 0xd8dade, 0x8d9299, 0x7a1418, 0x14305c, 0x2c4a36, 0xe9e6df, 0x4a4f57, 0xb8a27a];
  // ---- lanes: every maximal straight run of road, both directions
  const P = CITY.PARK, lanes = Traffic.lanes;
  const addLane = (axis, fixed, a, b, dir) => lanes.push({ axis, fixed, a, b, dir, cars: [], len: b - a });
  for (let i = 0; i <= CITY.NX; i++) {
    const cx = CITY.aveX(i), cut = i > P.i0 && i <= P.i1;
    const runs = cut ? [[CITY.Z0, P.z0 - CITY.ST], [P.z1 + CITY.ST, -CITY.Z0]] : [[CITY.Z0, -CITY.Z0]];
    for (const r of runs) for (const off of [1.85, 5.25]) { addLane('z', cx - off, r[0], r[1], 1); addLane('z', cx + off, r[0], r[1], -1); }
  }
  for (let j = 0; j <= CITY.NZ; j++) {
    const cz = CITY.stZ(j), cut = j > P.j0 && j <= P.j1;
    const runs = cut ? [[CITY.X0, P.x0 - CITY.AVE], [P.x1 + CITY.AVE, -CITY.X0]] : [[CITY.X0, -CITY.X0]];
    for (const r of runs) { addLane('x', cz + 1.8, r[0], r[1], 1); addLane('x', cz - 1.8, r[0], r[1], -1); }
  }
  // stop lines for each lane (positions along the lane where a crossing road starts)
  for (const l of lanes) {
    l.stops = [];
    if (l.axis === 'z') for (let j = 0; j <= CITY.NZ; j++) { const e = l.dir > 0 ? CITY.stZ(j) - CITY.ST / 2 - 6.2 : CITY.stZ(j) + CITY.ST / 2 + 6.2; if (e > l.a + 3 && e < l.b - 3) l.stops.push(e); }
    else for (let i = 0; i <= CITY.NX; i++) { const e = l.dir > 0 ? CITY.aveX(i) - CITY.AVE / 2 - 6.2 : CITY.aveX(i) + CITY.AVE / 2 + 6.2; if (e > l.a + 3 && e < l.b - 3) l.stops.push(e); }
    l.stops.sort((u, v) => l.dir > 0 ? u - v : v - u);
  }
  // ---- cars
  const kinds = ['sedan', 'van', 'bus']; for (const k of kinds) Traffic.types[k] = Traffic.carGeo(k);
  const density = SM.quality === 0 ? 0.55 : 1;
  for (const l of lanes) {
    const n = Math.max(1, Math.round(l.len / 46 * density * (0.6 + R() * 0.8))); let s = l.a + R() * 30;
    for (let k = 0; k < n && s < l.b - 8; k++) { const r = R(), kind = r < 0.78 ? 'sedan' : r < 0.94 ? 'van' : 'bus', T = Traffic.types[kind]; const c = kind === 'bus' ? 0x2a5fa8 : kind === 'van' ? R.pick([0xe9e6df, 0x8d9299, 0x3b2f2a, 0xd8dade]) : R.pick(COLS);
      const car = { lane: l, s, v: 8 + R() * 4, vMax: 10.5 + R() * 4.5, kind, T, col: c, idx: 0, x: 0, z: 0 }; l.cars.push(car); Traffic.cars.push(car); s += T.L + 14 + R() * 60; }
  }
  // ---- parked cars along kerbs
  const parked = [];
  for (const blk of CITY.blocks) { if (blk.park) continue;
    for (const side of [0, 1]) { let x = blk.x0 + 12; while (x < blk.x1 - 12) { if (R() < 0.62) { const kind = R() < 0.85 ? 'sedan' : 'van'; parked.push({ kind, x: x + 2.4, z: side ? blk.z1 + 1.35 : blk.z0 - 1.35, ry: side ? 0 : PI, col: R.pick(COLS.slice(3)) }); } x += 6.2 + R() * 1.5; } }
    for (const side of [0, 1]) { let z = blk.z0 + 12; while (z < blk.z1 - 12) { if (R() < 0.55) parked.push({ kind: 'sedan', x: side ? blk.x1 + 1.35 : blk.x0 - 1.35, z: z + 2.4, ry: side ? PI / 2 : -PI / 2, col: R.pick(COLS.slice(2)) }); z += 6.2 + R() * 1.5; } }
  }
  Traffic.parked = parked;
  // ---- instanced meshes
  const dummy = new THREE.Object3D(), col = new C3();
  Traffic.parkedMeshes = [];
  for (const k of kinds) {
    const mov = Traffic.cars.filter(c => c.kind === k), T = Traffic.types[k];
    if (mov.length) {
      const body = new THREE.InstancedMesh(T.body, Traffic.paint, mov.length), lights = new THREE.InstancedMesh(T.lights, Traffic.lightMat, mov.length);
      mov.forEach((c, i) => { c.idx = i; body.setColorAt(i, col.setHex(c.col)); });
      body.instanceColor.needsUpdate = true; body.castShadow = false; body.receiveShadow = true; body.frustumCulled = false; lights.frustumCulled = false; GFX.scene.add(body, lights);
      Traffic.meshes[k] = { body, lights, mov };
    }
    // parked: bucketed into sectors so they cull, and only nearby sectors reach the shadow pass
    const S = 5, buckets = new Map();
    for (const c of parked) { if (c.kind !== k) continue; const key = U.clamp(Math.floor((c.x - CITY.X0) / CITY.W * S), 0, S - 1) + ',' + U.clamp(Math.floor((c.z - CITY.Z0) / CITY.D * S), 0, S - 1); (buckets.get(key) || buckets.set(key, []).get(key)).push(c);
      const hw = (Math.abs(Math.cos(c.ry)) > 0.5 ? T.L : T.W) / 2, hd = (Math.abs(Math.cos(c.ry)) > 0.5 ? T.W : T.L) / 2; World.add({ x0: c.x - hw, x1: c.x + hw, y0: 0, y1: T.H, z0: c.z - hd, z1: c.z + hd, kind: 3 }); }
    for (const list of buckets.values()) {
      const m = new THREE.InstancedMesh(T.body, Traffic.paint, list.length); let cx = 0, cz = 0;
      list.forEach((c, i) => { dummy.position.set(c.x, 0, c.z); dummy.rotation.set(0, c.ry, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, col.setHex(c.col)); cx += c.x; cz += c.z; });
      m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; GFX.scene.add(m); Traffic.parkedMeshes.push([m, cx / list.length, cz / list.length]);
    }
  }
  Traffic.dummy = dummy; Traffic.update(0.016);
};

Traffic.update = function (dt) {
  const ph = (typeof Props !== 'undefined' && Props.phase) || { ns: 2, ew: 0 }, P = Player.pos, dummy = Traffic.dummy;
  const crime = typeof Crimes !== 'undefined' && Crimes.active && Crimes.active.spot.street && Crimes.active.state !== 'done' ? Crimes.active.spot : null;
  World.dyn.length = 0;
  for (const l of Traffic.lanes) {
    const cars = l.cars, n = cars.length; if (!n) continue; const go = (l.axis === 'z' ? ph.ns : ph.ew) === 2, dir = l.dir;
    if (dir > 0) cars.sort((a, b) => a.s - b.s); else cars.sort((a, b) => b.s - a.s);      // ascending in travel order
    for (let i = 0; i < n; i++) {
      const c = cars[i], ahead = cars[(i + 1) % n];
      let gap = 1e9; if (n > 1) { gap = (ahead.s - c.s) * dir; if (gap < 0) gap += l.len; gap -= (ahead.T.L + c.T.L) / 2; }
      if (!go) for (const st of l.stops) { const d = (st - c.s) * dir - c.T.L / 2; if (d > -1.5 && d < gap) { gap = Math.max(d, 0); break; } }
      // Spider-Man (or a brawl) in the road
      const px = l.axis === 'z' ? P.z : P.x, pl = l.axis === 'z' ? P.x : P.z; if (Math.abs(pl - l.fixed) < 2.2 && P.y < 3.5) { const d = (px - c.s) * dir - c.T.L / 2 - 1.5; if (d > -2 && d < gap) gap = Math.max(d, 0); }
      if (crime) { const cx = l.axis === 'z' ? crime.z : crime.x, cl = l.axis === 'z' ? crime.x : crime.z; if (Math.abs(cl - l.fixed) < 9) { const d = (cx - c.s) * dir - 16; if (d > -30 && d < gap) gap = Math.max(d, 0); } }
      const safe = 2.2 + c.v * 0.9, want = gap > safe + 20 ? c.vMax : Math.max(0, Math.min(c.vMax, (gap - 2.2) * 0.9));
      c.v += U.clamp(want - c.v, -9 * dt, 3.2 * dt); if (c.v < 0.05 && want <= 0) c.v = 0;
      c.s += c.v * dir * dt; if (dir > 0 && c.s > l.b) c.s -= l.len; else if (dir < 0 && c.s < l.a) c.s += l.len;
      const x = l.axis === 'z' ? l.fixed : c.s, z = l.axis === 'z' ? c.s : l.fixed; c.x = x; c.z = z;
      const edge = Math.min(c.s - l.a, l.b - c.s), sc = U.sat(edge / 10);          // cars shrink away at the ends of a run instead of popping
      dummy.position.set(x, 0, z); dummy.rotation.set(0, l.axis === 'z' ? (dir > 0 ? -PI / 2 : PI / 2) : (dir > 0 ? 0 : PI), 0); dummy.scale.setScalar(sc); dummy.updateMatrix();
      const M = Traffic.meshes[c.kind]; M.body.setMatrixAt(c.idx, dummy.matrix); M.lights.setMatrixAt(c.idx, dummy.matrix);
      if (Math.abs(x - P.x) < 45 && Math.abs(z - P.z) < 45 && sc > 0.9) { const hl = c.T.L / 2, hw = c.T.W / 2; World.dyn.push(l.axis === 'z' ? { x0: x - hw, x1: x + hw, y0: 0, y1: c.T.H, z0: z - hl, z1: z + hl, kind: 3 } : { x0: x - hl, x1: x + hl, y0: 0, y1: c.T.H, z0: z - hw, z1: z + hw, kind: 3 }); }
    }
  }
  for (const k in Traffic.meshes) { const M = Traffic.meshes[k]; M.body.instanceMatrix.needsUpdate = true; M.lights.instanceMatrix.needsUpdate = true; }
  Traffic.cullT = (Traffic.cullT || 0) - dt; if (Traffic.cullT <= 0) { Traffic.cullT = 0.5; const c = GFX.camera.position; for (const e of Traffic.parkedMeshes) e[0].visible = Math.hypot(e[1] - c.x, e[2] - c.z) + c.y * 0.3 < 820; }
  const T = TODS[SM.tod], li = 0.9 + T.lamps * 3.2; Traffic.lightMat.color.setRGB(li, li, li);
};


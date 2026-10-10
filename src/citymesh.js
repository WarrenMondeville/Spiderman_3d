'use strict';
/* ==== p06_citymesh.js ==== */
/* p06: turns building data into chunked geometry + the top-down height map + the collision world (AABBs in a spatial hash). */

class GeoB {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.fa = []; this.ex = []; this.i = []; this.vc = 0; }
  // wall quad: P0 is the left-bottom corner seen from outside, T = cross(up, N)
  wall(x, y0, z, tx, tz, len, y1, nx, nz, col, fa, ex, u0 = 0) {
    const b = this.vc;
    this.p.push(x, y0, z, x + tx * len, y0, z + tz * len, x + tx * len, y1, z + tz * len, x, y1, z);
    for (let k = 0; k < 4; k++) { this.n.push(nx, 0, nz); this.c.push(col.r, col.g, col.b); this.fa.push(fa[0], fa[1], fa[2], fa[3]); this.ex.push(ex[0], ex[1], ex[2], ex[3]); }
    this.uv.push(u0, y0, u0 + len, y0, u0 + len, y1, u0, y1);
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3); this.vc += 4;
  }
  // horizontal quad facing up (or down)
  flat(x0, x1, z0, z1, y, col, fa, ex, down) {
    const b = this.vc;
    this.p.push(x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0);
    for (let k = 0; k < 4; k++) { this.n.push(0, down ? -1 : 1, 0); this.c.push(col.r, col.g, col.b); this.fa.push(fa[0], fa[1], fa[2], fa[3]); this.ex.push(ex[0], ex[1], ex[2], ex[3]); }
    this.uv.push(0, 0, 0, z1 - z0, x1 - x0, z1 - z0, x1 - x0, 0);
    if (down) this.i.push(b, b + 2, b + 1, b, b + 3, b + 2); else this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.vc += 4;
  }
  // four outward walls of a box
  ring(x0, x1, z0, z1, y0, y1, col, fa, exf) {
    this.wall(x0, y0, z1, 1, 0, x1 - x0, y1, 0, 1, col, fa, exf(x1 - x0));
    this.wall(x1, y0, z0, -1, 0, x1 - x0, y1, 0, -1, col, fa, exf(x1 - x0));
    this.wall(x1, y0, z1, 0, -1, z1 - z0, y1, 1, 0, col, fa, exf(z1 - z0));
    this.wall(x0, y0, z0, 0, 1, z1 - z0, y1, -1, 0, col, fa, exf(z1 - z0));
  }
  // inward-facing walls (inside of a parapet)
  ringIn(x0, x1, z0, z1, y0, y1, col, fa, ex) {
    this.wall(x1, y0, z1, -1, 0, x1 - x0, y1, 0, -1, col, fa, ex);
    this.wall(x0, y0, z0, 1, 0, x1 - x0, y1, 0, 1, col, fa, ex);
    this.wall(x1, y0, z0, 0, 1, z1 - z0, y1, -1, 0, col, fa, ex);
    this.wall(x0, y0, z1, 0, -1, z1 - z0, y1, 1, 0, col, fa, ex);
  }
  box(x0, x1, y0, y1, z0, z1, col, fa, ex, noBottom = true) {
    this.ring(x0, x1, z0, z1, y0, y1, col, fa, () => ex);
    this.flat(x0, x1, z0, z1, y1, col, fa, ex, false);
    if (!noBottom) this.flat(x0, x1, z0, z1, y0, col, fa, ex, true);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aFacade', new THREE.Float32BufferAttribute(this.fa, 4));
    g.setAttribute('aExtra', new THREE.Float32BufferAttribute(this.ex, 4));
    g.setIndex(this.vc > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

City.PARAPET = 1.0;
City.fitBay = (len, want) => len / Math.max(1, Math.round(len / want));

City.addBuildingGeo = function (G, b) {
  const col = new C3().setHex(b.tint), trim = new C3().setHex(b.trim);
  const bayWant = b.style === FS.GLASS ? 1.6 + b.seed * 1.4 : b.style === FS.MASONRY ? 3.1 + b.seed * 0.7 : b.style === FS.BROWN ? 2.35 + b.seed * 0.4 : b.style === FS.GRID ? 3.4 + b.seed * 1.8 : b.style === FS.DECO ? 2.7 + b.seed * 0.6 : 4.6 + b.seed;
  const PH = City.PARAPET;
  for (let ti = 0; ti < b.tiers.length; ti++) {
    const t = b.tiers[ti], w = t.x1 - t.x0, d = t.z1 - t.z0;
    const isTop = ti === b.tiers.length - 1 || b.tiers[ti + 1].pent;
    if (t.pent) {
      const fa = [0, b.seed, 1, 1];
      G.ring(t.x0, t.x1, t.z0, t.z1, t.y0, t.y1, col, fa, () => [1, t.y1, 0, 3]);
      G.flat(t.x0, t.x1, t.z0, t.z1, t.y1, col, [0, b.seed, d, 1], [w, t.y1, 0, 1]);
      continue;
    }
    const crown = b.crownFrom && t.y0 >= b.crownFrom;
    const faces = [[t.x0, t.z1, 1, 0, w, 0, 1, 'z+'], [t.x1, t.z0, -1, 0, w, 0, -1, 'z-'], [t.x1, t.z1, 0, -1, d, 1, 0, 'x+'], [t.x0, t.z0, 0, 1, d, -1, 0, 'x-']];
    for (const f of faces) {
      const len = f[4]; let flag = 0, style = b.style;
      if (crown) flag = 4;
      else if (b.style === FS.BROWN && (f[7] === 'x+' || f[7] === 'x-')) flag = 5;
      const bay = City.fitBay(len, bayWant);
      G.wall(f[0], t.y0, f[1], f[2], f[3], len, t.y1 + PH, f[5], f[6], crown ? new C3(0.62, 0.64, 0.68) : col, [style, b.seed, bay, b.floorH], [len, t.y1, b.glassVar, flag]);
    }
    // roof + parapet (inner faces and coping)
    const pw = 0.35;
    G.flat(t.x0 + pw, t.x1 - pw, t.z0 + pw, t.z1 - pw, t.y1, col, [b.style, b.seed, d - 2 * pw, 1], [w - 2 * pw, t.y1, 0, 1]);
    G.ringIn(t.x0 + pw, t.x1 - pw, t.z0 + pw, t.z1 - pw, t.y1, t.y1 + PH, b.style === FS.GLASS ? new C3(0.3, 0.31, 0.33) : col, [0, b.seed, 1, 1], [1, t.y1, 0, 2]);
    const cc = b.style === FS.GLASS ? new C3(0.35, 0.36, 0.38) : trim, y = t.y1 + PH, fa2 = [0, b.seed, 1, 1], ex2 = [1, y, 0, 2];
    G.flat(t.x0, t.x1, t.z0, t.z0 + pw, y, cc, fa2, ex2); G.flat(t.x0, t.x1, t.z1 - pw, t.z1, y, cc, fa2, ex2);
    G.flat(t.x0, t.x0 + pw, t.z0 + pw, t.z1 - pw, y, cc, fa2, ex2); G.flat(t.x1 - pw, t.x1, t.z0 + pw, t.z1 - pw, y, cc, fa2, ex2);
    // cornice on masonry tops and podiums
    if (b.cornice && (isTop || ti === 0)) {
      const o = b.style === FS.BROWN ? 0.45 : 0.7, ch = b.style === FS.BROWN ? 0.7 : 1.0, y0 = t.y1 - ch * 0.4, y1 = t.y1 + PH * 0.55;
      const cfa = [0, b.seed, 1, 1], cex = [1, y1, 0, 2], tc = b.style === FS.BROWN ? new C3().setHex(b.tint).multiplyScalar(0.55) : trim;
      // four slabs framing the roof edge (with undersides — you swing beneath these)
      G.box(t.x0 - o, t.x1 + o, y0, y1, t.z1, t.z1 + o, tc, cfa, cex, false); G.box(t.x0 - o, t.x1 + o, y0, y1, t.z0 - o, t.z0, tc, cfa, cex, false);
      G.box(t.x1, t.x1 + o, y0, y1, t.z0, t.z1, tc, cfa, cex, false); G.box(t.x0 - o, t.x0, y0, y1, t.z0, t.z1, tc, cfa, cex, false);
    }
  }
  if (b.spire) {
    const s = b.spire, n = 5; let r = s.r, y = s.y;
    for (let k = 0; k < n; k++) { const hh = s.h * [0.18, 0.16, 0.2, 0.2, 0.26][k]; G.box(s.x - r, s.x + r, y, y + hh, s.z - r, s.z + r, new C3(0.6, 0.62, 0.66), [0, b.seed, 1, 1], [1, y + hh, 0, 4]); y += hh; r *= 0.58; }
  }
};

City.build = function () {
  const grp = City.group = new THREE.Group(); grp.name = 'city'; GFX.scene.add(grp);
  City.facadeMat = City.makeFacadeMaterial();
  const CH = 2, builders = new Map();
  for (const blk of CITY.blocks) {
    if (blk.park) continue;
    const key = Math.floor(blk.i / CH) + ',' + Math.floor(blk.j / CH);
    let G = builders.get(key); if (!G) { G = new GeoB(); builders.set(key, G); }
    for (let k = blk.first; k < blk.first + blk.count; k++) City.addBuildingGeo(G, CITY.buildings[k]);
  }
  for (const [key, G] of builders) {
    if (!G.vc) continue;
    const m = new THREE.Mesh(G.build(), City.facadeMat); m.castShadow = true; m.receiveShadow = true; m.name = 'chunk' + key; m.matrixAutoUpdate = false;
    grp.add(m); City.chunks.push(m);
  }
};

/* top-down height map — 1 texel per metre, value*2 = metres. Drives city-scale sun shadows and canyon AO in every city shader. */
City.buildHeightMap = function () {
  const pad = 70, x0 = Math.floor(CITY.X0 - pad), z0 = Math.floor(CITY.Z0 - pad);
  const W = Math.ceil((CITY.W + pad * 2) / 4) * 4, D = Math.ceil((CITY.D + pad * 2) / 4) * 4;
  const data = new Uint8Array(W * D);
  for (const bx of CITY.boxes) {
    const v = Math.min(255, Math.round(bx.y1 / 2));
    const ax = Math.max(0, Math.round(bx.x0 - x0)), bxx = Math.min(W, Math.round(bx.x1 - x0)), az = Math.max(0, Math.round(bx.z0 - z0)), bz = Math.min(D, Math.round(bx.z1 - z0));
    for (let z = az; z < bz; z++) { const row = z * W; for (let x = ax; x < bxx; x++) if (data[row + x] < v) data[row + x] = v; }
  }
  const tex = new THREE.DataTexture(data, W, D, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  City.heightTex = tex; City.hm = { data, W, D, x0, z0 };
  GFX.uni.uHeightMap.value = tex; GFX.uni.uHMInfo.value.set(x0, z0, 1 / W, 1 / D);
};
City.heightAt = function (x, z) {   // building roof height under a point (0 on streets)
  const h = City.hm; const ix = Math.floor(x - h.x0), iz = Math.floor(z - h.z0);
  if (ix < 0 || iz < 0 || ix >= h.W || iz >= h.D) return 0; return h.data[iz * h.W + ix] * 2;
};

/* ---------- collision world ---------- */
const World = { boxes: [], cell: 32, grid: new Map(), dyn: [], stamp: 0, marks: null };
World.key = (cx, cz) => (cx + 512) * 2048 + (cz + 512);
World.add = function (b) {   // {x0,x1,y0,y1,z0,z1, kind, noAnchor?, noCam?}
  b.idx = World.boxes.length; World.boxes.push(b);
  const c = World.cell, ax = Math.floor(b.x0 / c), bx = Math.floor(b.x1 / c), az = Math.floor(b.z0 / c), bz = Math.floor(b.z1 / c);
  for (let cx = ax; cx <= bx; cx++) for (let cz = az; cz <= bz; cz++) { const k = World.key(cx, cz); let a = World.grid.get(k); if (!a) { a = []; World.grid.set(k, a); } a.push(b.idx); }
  return b;
};
World.finish = function () { World.marks = new Int32Array(World.boxes.length + 8).fill(-1); };
// iterate unique boxes overlapping an xz rect
World.query = function (x0, x1, z0, z1, fn) {
  const c = World.cell, st = ++World.stamp, marks = World.marks;
  const ax = Math.floor(x0 / c), bx = Math.floor(x1 / c), az = Math.floor(z0 / c), bz = Math.floor(z1 / c);
  for (let cx = ax; cx <= bx; cx++) for (let cz = az; cz <= bz; cz++) {
    const a = World.grid.get(World.key(cx, cz)); if (!a) continue;
    for (let i = 0; i < a.length; i++) { const id = a[i]; if (marks[id] === st) continue; marks[id] = st; const b = World.boxes[id]; if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue; if (fn(b) === true) return; }
  }
};
/* ray vs world. returns {t, nx, ny, nz, box} or null. dir need not be normalised; t is in units of dir. */
World.ray = function (ox, oy, oz, dx, dy, dz, maxT, filter) {
  const ex = ox + dx * maxT, ez = oz + dz * maxT;
  let best = null, bt = maxT;
  const test = (b) => {
    if (filter && !filter(b)) return;
    let t0 = 0, t1 = bt, axis = -1, sgn = 0;
    // slabs
    if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) return; } else { let a = (b.x0 - ox) / dx, c = (b.x1 - ox) / dx, s = -1; if (a > c) { const q = a; a = c; c = q; s = 1; } if (a > t0) { t0 = a; axis = 0; sgn = s; } if (c < t1) t1 = c; if (t0 > t1) return; }
    if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) return; } else { let a = (b.y0 - oy) / dy, c = (b.y1 - oy) / dy, s = -1; if (a > c) { const q = a; a = c; c = q; s = 1; } if (a > t0) { t0 = a; axis = 1; sgn = s; } if (c < t1) t1 = c; if (t0 > t1) return; }
    if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) return; } else { let a = (b.z0 - oz) / dz, c = (b.z1 - oz) / dz, s = -1; if (a > c) { const q = a; a = c; c = q; s = 1; } if (a > t0) { t0 = a; axis = 2; sgn = s; } if (c < t1) t1 = c; if (t0 > t1) return; }
    if (axis < 0) return;  // origin inside
    if (t0 < bt) { bt = t0; best = best || {}; best.t = t0; best.nx = axis === 0 ? sgn : 0; best.ny = axis === 1 ? sgn : 0; best.nz = axis === 2 ? sgn : 0; best.box = b; }
  };
  World.query(Math.min(ox, ex) - 0.01, Math.max(ox, ex) + 0.01, Math.min(oz, ez) - 0.01, Math.max(oz, ez) + 0.01, test);
  for (const b of World.dyn) test(b);
  if (dy < 0) { const tg = (0 - oy) / dy; if (tg >= 0 && tg < bt) { bt = tg; best = best || {}; best.t = tg; best.nx = 0; best.ny = 1; best.nz = 0; best.box = null; } }
  return best;
};
World.segClear = function (a, b, filter) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const h = World.ray(a.x, a.y, a.z, dx, dy, dz, 1, filter); return !h || h.t >= 0.999;
};
/* highest walkable surface at (x,z) at or below yMax (+tolerance). Ground is 0 (sidewalk kerb handled by caller). */
World.topOf = function (b, x, z) {   // roofs are rimmed by a parapet: the walkable surface ramps up onto it near the edge
  if (!b.par) return b.y1;
  const e = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
  return b.y1 + City.PARAPET * (1 - U.smooth(0.30, 0.95, e));
};
World.floorAt = function (x, z, yMax) {
  let best = 0, bb = null;
  const fn = (b) => { if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || b.y1 > yMax + 1.2) return; const t = World.topOf(b, x, z); if (t <= yMax && t > best) { best = t; bb = b; } };
  World.query(x - 0.01, x + 0.01, z - 0.01, z + 0.01, fn);
  for (const b of World.dyn) fn(b);
  World._floorBox = bb; return best;
};
/* push a sphere out of all boxes. out: pos modified; returns contact {nx,ny,nz,box,depth} of the deepest contact or null */
World.sphere = function (pos, r, out) {
  let hit = null;
  for (let iter = 0; iter < 3; iter++) {
    let any = false;
    const fn = (b) => {
      const cx = U.clamp(pos.x, b.x0, b.x1), cy = U.clamp(pos.y, b.y0, b.y1), cz = U.clamp(pos.z, b.z0, b.z1);
      let dx = pos.x - cx, dy = pos.y - cy, dz = pos.z - cz; const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r * r) return;
      let nx, ny, nz, depth;
      if (d2 > 1e-10) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; nz = dz / d; depth = r - d; }
      else { // centre inside the box: exit through the nearest face
        const ex = [pos.x - b.x0, b.x1 - pos.x, pos.y - b.y0, b.y1 - pos.y, pos.z - b.z0, b.z1 - pos.z]; let m = 0; for (let k = 1; k < 6; k++) if (ex[k] < ex[m]) m = k;
        nx = m === 0 ? -1 : m === 1 ? 1 : 0; ny = m === 2 ? -1 : m === 3 ? 1 : 0; nz = m === 4 ? -1 : m === 5 ? 1 : 0; depth = ex[m] + r;
      }
      pos.x += nx * depth; pos.y += ny * depth; pos.z += nz * depth; any = true;
      if (!hit || depth > hit.depth) hit = { nx, ny, nz, box: b, depth };
    };
    World.query(pos.x - r, pos.x + r, pos.z - r, pos.z + r, fn);
    for (const b of World.dyn) { if (b.x1 < pos.x - r || b.x0 > pos.x + r || b.z1 < pos.z - r || b.z0 > pos.z + r) continue; fn(b); }
    if (!any) break;
  }
  return hit;
};
World.buildFromCity = function () {
  for (const bx of CITY.boxes) World.add({ x0: bx.x0, x1: bx.x1, y0: bx.y0, y1: bx.y1, z0: bx.z0, z1: bx.z1, kind: 0, b: bx.b, par: !bx.pent });
  for (const b of CITY.buildings) if (b.spire) { const s = b.spire; World.add({ x0: s.x - s.r, x1: s.x + s.r, y0: s.y, y1: s.y + s.h * 0.54, z0: s.z - s.r, z1: s.z + s.r, kind: 0, b: b.id }); }
};


'use strict';
/* ==== p10_props.js ==== */
/* p10: everything bolted onto the city — water towers, roof plant, fire escapes, street lamps, signals, street + park trees,
   landmark signs, Times-Square-style billboards, and the far-shore skyline. All instanced, bucketed into sectors for culling. */

const Props = { sectors: 4, buckets: new Map(), lampGlow: null, signalMats: null, billboards: [] };

/* merge coloured primitives into one geometry */
class GeoM {
  constructor() { this.p = []; this.n = []; this.c = []; }
  add(geo, col, m) {
    const g = geo.index ? geo.toNonIndexed() : geo; if (m) g.applyMatrix4(m);
    const P = g.attributes.position.array, N = g.attributes.normal.array; for (let i = 0; i < P.length; i += 3) { this.p.push(P[i], P[i + 1], P[i + 2]); this.n.push(N[i], N[i + 1], N[i + 2]); this.c.push(col.r, col.g, col.b); }
    return this;
  }
  box(w, h, d, x, y, z, col, ry, rz) { const m = new M4().makeTranslation(x, y, z); if (ry) m.multiply(new M4().makeRotationY(ry)); if (rz) m.multiply(new M4().makeRotationZ(rz)); return this.add(new THREE.BoxGeometry(w, h, d), col, m); }
  cyl(r0, r1, h, seg, x, y, z, col, rx, rz) { const m = new M4().makeTranslation(x, y, z); if (rx) m.multiply(new M4().makeRotationX(rx)); if (rz) m.multiply(new M4().makeRotationZ(rz)); return this.add(new THREE.CylinderGeometry(r0, r1, h, seg), col, m); }
  build() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); return g; }
}
const colr = (r, g, b) => new C3(r, g, b);

Props.put = function (kind, x, y, z, ry, sx, sy, sz, col) {
  const S = Props.sectors, i = U.clamp(Math.floor((x - CITY.X0) / CITY.W * S), 0, S - 1), j = U.clamp(Math.floor((z - CITY.Z0) / CITY.D * S), 0, S - 1), key = kind + '|' + i + '|' + j;
  let a = Props.buckets.get(key); if (!a) { a = []; Props.buckets.set(key, a); }
  a.push({ x, y, z, ry: ry || 0, sx: sx || 1, sy: sy || sx || 1, sz: sz || sx || 1, col: col || null });
};

Props.build = async function () {
  const R = mulberry(SM.SEED + 31);
  Props.mat = MAT(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05, envMapIntensity: 0.6 }));
  Props.metal = MAT(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.55, envMapIntensity: 0.8 }));
  const G = {};
  // ---- water tower
  { const g = new GeoM(), wood = colr(0.30, 0.19, 0.11), dark = colr(0.10, 0.10, 0.11), steel = colr(0.16, 0.13, 0.11);
    g.cyl(1.75, 1.75, 3.1, 14, 0, 4.15, 0, wood); for (const yy of [3.0, 4.1, 5.2]) g.cyl(1.79, 1.79, 0.09, 14, 0, yy, 0, dark); g.cyl(0.08, 1.95, 1.15, 14, 0, 6.27, 0, dark); g.cyl(2.0, 2.0, 0.14, 14, 0, 2.55, 0, steel);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { g.box(0.16, 2.5, 0.16, sx * 1.25, 1.25, sz * 1.25, steel); }
    for (const s of [-1, 1]) { g.box(0.07, 3.1, 0.07, s * 1.25, 1.3, 0, steel, 0, 0.93); g.box(0.07, 3.1, 0.07, 0, 1.3, s * 1.25, steel, PI / 2, 0.93); }
    G.tower = g.build(); }
  { const g = new GeoM(), c = colr(0.62, 0.63, 0.64), d = colr(0.08, 0.08, 0.09); g.box(1.7, 1.0, 1.2, 0, 0.62, 0, c); g.box(1.8, 0.12, 1.3, 0, 0.06, 0, d); g.cyl(0.42, 0.42, 0.05, 12, -0.35, 1.13, 0, d); g.cyl(0.42, 0.42, 0.05, 12, 0.45, 1.13, 0, d); G.ac = g.build(); }
  { const g = new GeoM(), c = colr(0.42, 0.30, 0.24), d = colr(0.12, 0.12, 0.13); g.box(3.0, 2.7, 4.2, 0, 1.35, 0, c); g.box(3.2, 0.15, 4.4, 0, 2.77, 0, d); g.box(0.95, 2.0, 0.06, 0, 1.0, 2.12, d); G.bulk = g.build(); }
  { const g = new GeoM(), c = colr(0.55, 0.56, 0.58); g.box(0.10, 9, 0.10, 0, 4.5, 0, c); g.box(1.6, 0.06, 0.06, 0, 7.2, 0, c); g.box(1.1, 0.06, 0.06, 0, 8.0, 0, c); g.box(0.06, 0.06, 1.3, 0, 6.4, 0, c); g.cyl(0.5, 0.5, 0.5, 8, 0, 0.25, 0, colr(0.2, 0.2, 0.21)); G.antenna = g.build(); }
  { const g = new GeoM(), c = colr(0.5, 0.5, 0.5); g.cyl(0.22, 0.22, 0.9, 8, 0, 0.45, 0, c); g.cyl(0.4, 0.28, 0.22, 8, 0, 1.0, 0, c); G.vent = g.build(); }
  // ---- fire escape module (one storey)
  { const g = new GeoM(), c = colr(0.035, 0.035, 0.04); g.box(2.7, 0.06, 0.95, 0, 0, 0.5, c); g.box(2.7, 0.05, 0.05, 0, 0.95, 0.96, c); g.box(2.7, 0.04, 0.04, 0, 0.5, 0.96, c);
    for (const xx of [-1.33, -0.66, 0, 0.66, 1.33]) g.box(0.04, 0.95, 0.04, xx, 0.48, 0.96, c); for (const s of [-1, 1]) { g.box(0.04, 0.95, 0.95, s * 1.33, 0.48, 0.5, c); }
    const m = new M4().makeTranslation(0.4, -1.62, 0.45).multiply(new M4().makeRotationZ(1.05)); g.add(new THREE.BoxGeometry(3.7, 0.06, 0.55), c, m); G.escape = g.build(); }
  // ---- street lamp + signal
  { const g = new GeoM(), c = colr(0.10, 0.12, 0.11); g.cyl(0.085, 0.13, 8.4, 8, 0, 4.2, 0, c); g.cyl(0.2, 0.24, 0.9, 8, 0, 0.45, 0, c); g.box(2.4, 0.09, 0.09, 1.15, 8.35, 0, c, 0, 0.12); g.box(0.85, 0.16, 0.36, 2.35, 8.47, 0, c); G.lamp = g.build(); }
  { const g = new THREE.BoxGeometry(0.7, 0.05, 0.28); g.translate(2.35, 8.37, 0); G.lampHead = g; }
  { const g = new GeoM(), c = colr(0.09, 0.10, 0.10), y = colr(0.55, 0.42, 0.05); g.cyl(0.1, 0.14, 6.6, 8, 0, 3.3, 0, c); g.box(5.6, 0.12, 0.12, 2.8, 6.45, 0, c); g.box(0.36, 1.05, 0.36, 4.9, 5.85, 0, y); g.box(0.36, 1.05, 0.36, 2.6, 5.85, 0, y); g.box(0.3, 0.8, 0.3, 0.0, 3.0, 0.2, y); G.signal = g.build(); }
  { const g = new GeoM(), c = colr(0.62, 0.10, 0.08); g.cyl(0.13, 0.16, 0.62, 8, 0, 0.31, 0, c); g.cyl(0.08, 0.08, 0.34, 6, 0, 0.42, 0, c, 0, PI / 2); g.cyl(0.10, 0.04, 0.14, 8, 0, 0.69, 0, c); G.hydrant = g.build(); }
  { const g = new GeoM(), c = colr(0.07, 0.09, 0.08); g.cyl(0.30, 0.25, 0.95, 10, 0, 0.48, 0, c); g.cyl(0.33, 0.33, 0.06, 10, 0, 0.97, 0, colr(0.03, 0.03, 0.03)); G.bin = g.build(); }
  // ---- trees: trunk + noisy canopy clumps (vertex-painted light on top, dark beneath)
  { const tr = new GeoM(), bark = colr(0.13, 0.10, 0.075); tr.cyl(0.12, 0.2, 3.4, 7, 0, 1.7, 0, bark); tr.cyl(0.07, 0.11, 2.0, 5, 0.5, 3.9, 0.1, bark, 0, -0.55); tr.cyl(0.07, 0.11, 2.0, 5, -0.45, 4.0, -0.2, bark, 0.2, 0.5); G.trunk = tr.build();
    const cg = new GeoM(), blobs = [[0, 5.3, 0, 2.0], [1.3, 4.6, 0.4, 1.5], [-1.2, 4.7, -0.5, 1.55], [0.2, 4.5, 1.3, 1.35], [-0.3, 4.6, -1.35, 1.3], [0.1, 6.4, 0.1, 1.3]];
    for (const b of blobs) { const ico = new THREE.IcosahedronGeometry(b[3], 1).toNonIndexed(); const P = ico.attributes.position, N = ico.attributes.normal;
      for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), l = Math.hypot(x, y, z) || 1, n = 0.80 + 0.34 * fbm2(x * 1.7 + b[0] * 3.1 + z * 0.9, y * 1.7 + b[2] * 2.3 - z * 1.3, 2);
        P.setXYZ(i, x * n, y * n * 0.82, z * n); N.setXYZ(i, x / l, y / l * 1.1 + 0.15, z / l); }     // smooth, slightly up-biased normals: soft rounded crowns
      cg.add(ico, colr(1, 1, 1), new M4().makeTranslation(b[0], b[1], b[2])); }
    const g = cg.build(), P = g.attributes.position, C = g.attributes.color, N2 = g.attributes.normal; for (let i = 0; i < P.count; i++) { const k = U.sat((P.getY(i) - 3.4) / 3.8), s = (0.26 + 0.50 * k) * (0.8 + 0.4 * fbm2(P.getX(i) * 1.3 + 9, P.getZ(i) * 1.3 + P.getY(i), 2)); C.setXYZ(i, s, s, s); const nl = Math.hypot(N2.getX(i), N2.getY(i), N2.getZ(i)); N2.setXYZ(i, N2.getX(i) / nl, N2.getY(i) / nl, N2.getZ(i) / nl); } G.canopy = g; }
  Props.leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.35 }); Props.leafMat.userData.tag = 'leaf';
  Props.leafMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = GFX.uni.uTime; sh.uniforms.uSunDirW = GFX.uni.uSunDirW; sh.uniforms.uSunCol = GFX.uni.uSunCol;
    sh.vertexShader = sh.vertexShader.replace(/void\s+main\s*\(\s*\)\s*\{/, 'uniform float uTime; varying vec3 vLW;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\n { vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float w = max(position.y - 3.0, 0.0) * 0.035; transformed.x += sin(uTime * 1.3 + ip.x * 0.31 + position.y * 0.8) * w; transformed.z += cos(uTime * 1.1 + ip.z * 0.27 + position.x * 0.9) * w; vLW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; }');
    sh.fragmentShader = sh.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/, 'uniform vec3 uSunDirW, uSunCol; varying vec3 vLW;\nvoid main() {')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n { vec3 Vw = normalize(vLW - cameraPosition); float back = pow(max(dot(Vw, uSunDirW), 0.0), 3.0); totalEmissiveRadiance += diffuseColor.rgb * uSunCol * back * 0.7; }');
  };
  MAT(Props.leafMat);

  // ================= placement =================
  for (const b of CITY.buildings) {
    const rb = mulberry(Math.floor(b.seed * 1e6) + 3); let top = null; for (const t of b.tiers) if (!t.pent) top = t; const pent = b.tiers.find(t => t.pent);
    if (!top || b.spire) continue; const w = top.x1 - top.x0, d = top.z1 - top.z0, y = top.y1, free = (x, z) => !pent || x < pent.x0 - 1.5 || x > pent.x1 + 1.5 || z < pent.z0 - 1.5 || z > pent.z1 + 1.5;
    const spot = (m) => { for (let k = 0; k < 8; k++) { const x = U.lerp(top.x0 + m, top.x1 - m, rb()), z = U.lerp(top.z0 + m, top.z1 - m, rb()); if (free(x, z)) return [x, z]; } return null; };
    if ((b.style === FS.MASONRY || b.style === FS.BROWN || b.style === FS.WAREHOUSE || b.style === FS.DECO) && b.h > 16 && b.h < 120 && w > 7.5 && d > 7.5 && rb() < 0.6) { const s = spot(3.2); if (s) { const sc = 0.85 + rb() * 0.3; Props.put('tower', s[0], y, s[1], rb() * TAU, sc); World.add({ x0: s[0] - 1.6 * sc, x1: s[0] + 1.6 * sc, y0: y, y1: y + 6.7 * sc, z0: s[1] - 1.6 * sc, z1: s[1] + 1.6 * sc, kind: 3 }); } }
    const nAC = Math.min(7, Math.floor(w * d / 110) + (b.style === FS.BROWN ? 0 : 1)); for (let k = 0; k < nAC; k++) { const s = spot(2); if (s) Props.put('ac', s[0], y, s[1], rb() < 0.5 ? 0 : PI / 2, 0.8 + rb() * 0.7); }
    if (!pent && w > 9 && d > 9 && rb() < 0.65) { const s = spot(3.4); if (s) { Props.put('bulk', s[0], y, s[1], Math.floor(rb() * 4) * PI / 2); World.add({ x0: s[0] - 2.2, x1: s[0] + 2.2, y0: y, y1: y + 2.85, z0: s[1] - 2.2, z1: s[1] + 2.2, kind: 3 }); } }
    if (b.h > 90 && rb() < 0.6) { const t = pent || top; Props.put('antenna', (t.x0 + t.x1) / 2 + (rb() - 0.5) * 3, t.y1, (t.z0 + t.z1) / 2 + (rb() - 0.5) * 3, rb() * 3, 1 + rb() * 1.2); }
    for (let k = 0; k < 2 + (w * d > 500 ? 3 : 0); k++) { const s = spot(1.5); if (s) Props.put('vent', s[0], y, s[1], 0, 0.8 + rb() * 0.8); }
    if (b.style === FS.BROWN && b.blank && w > 6.5) {   // front of the rowhouse faces away from the yard
      const front = b.blank === 'z+' ? -1 : 1, fz = front < 0 ? top.z0 : top.z1, fx = top.x0 + w * (0.3 + rb() * 0.4);
      const floors = Math.round((b.h - 5) / b.floorH); for (let f = 1; f <= floors; f++) Props.put('escape', fx, 5 + f * b.floorH - 0.2, fz, front < 0 ? PI : 0);
    }
  }
  // street furniture round every block
  for (const blk of CITY.blocks) {
    const { x0, x1, z0, z1 } = blk;
    if (!blk.park) {
      for (const zz of [z0 + 1.9, z1 - 1.9]) for (let bx = 9; bx <= CITY.BX - 8; bx += 11) if (R() < 0.82) { const sc = 0.8 + R() * 0.5, t = R(); Props.put('tree', x0 + bx, 0.16, zz, R() * TAU, sc, sc * (0.9 + R() * 0.3), sc, t < 0.12 ? [0.95, 0.62, 0.18] : t < 0.2 ? [0.85, 0.34, 0.12] : [0.30 + R() * 0.2, 0.52 + R() * 0.22, 0.16 + R() * 0.1]); }
      for (const s of [0, 1]) { const zz = s ? z1 - 0.9 : z0 + 0.9; for (let bx = 14; bx < CITY.BX - 4; bx += 28) Props.put('lamp', x0 + bx + 5.5, 0.16, zz, s ? -PI / 2 : PI / 2); }
      for (const s of [0, 1]) { const xx = s ? x1 - 0.9 : x0 + 0.9; for (let bz = 14; bz < CITY.BZ; bz += 28) Props.put('lamp', xx, 0.16, z0 + bz, s ? 0 : PI); }
      Props.put('hydrant', x0 + 6 + R() * 20, 0.16, z0 + 0.8, 0); Props.put('bin', x1 - 3, 0.16, z0 + 1.2, 0); Props.put('bin', x0 + 3, 0.16, z1 - 1.2, 0); Props.put('hydrant', x1 - 0.8, 0.16, z0 + 12 + R() * 20, 0);
    }
    // signals on the NW and SE corners of each block (one faces each approach)
    Props.put('signal', x0 + 0.7, 0.16, z0 + 0.7, PI, 1); Props.put('signal', x1 - 0.7, 0.16, z1 - 0.7, 0, 1);
    Props.put('signalB', x1 - 0.7, 0.16, z0 + 0.7, PI / 2, 1); Props.put('signalB', x0 + 0.7, 0.16, z1 - 0.7, -PI / 2, 1);
  }
  // the park
  { const Pk = CITY.PARK, rp = mulberry(SM.SEED + 9), pr = Ground.pondRect; let n = 0, guard = 0;
    while (n < (SM.quality === 0 ? 260 : 520) && guard++ < 5000) { const x = U.lerp(Pk.x0 + 8, Pk.x1 - 8, rp()), z = U.lerp(Pk.z0 + 8, Pk.z1 - 8, rp()); if (fbm2(x * 0.02, z * 0.02, 2) < 0.47) continue; if (pr && ((x - pr.x) / (pr.rx + 5)) ** 2 + ((z - pr.z) / (pr.rz + 5)) ** 2 < 1) continue; const sc = 0.9 + rp() * 0.9, t = rp(); Props.put('tree', x, 0.16, z, rp() * TAU, sc, sc * (0.9 + rp() * 0.4), sc, t < 0.16 ? [0.98, 0.64, 0.16] : t < 0.27 ? [0.88, 0.32, 0.10] : [0.26 + rp() * 0.2, 0.50 + rp() * 0.22, 0.14 + rp() * 0.1]); n++; } }
  await Loader.yield();

  // ================= instancing =================
  const defs = { tower: [G.tower, Props.mat, true], ac: [G.ac, Props.metal, true], bulk: [G.bulk, Props.mat, true], antenna: [G.antenna, Props.metal, false], vent: [G.vent, Props.metal, false], escape: [G.escape, Props.metal, true], lamp: [G.lamp, Props.metal, true], signal: [G.signal, Props.metal, false], signalB: [G.signal, Props.metal, false], hydrant: [G.hydrant, Props.mat, false], bin: [G.bin, Props.mat, false] };
  const dummy = new THREE.Object3D(), grp = Props.group = new THREE.Group(); GFX.scene.add(grp);
  const mkInst = (geo, mat, list, shadow, colored) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => { dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, p.ry, 0); dummy.scale.set(p.sx, p.sy, p.sz); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); if (colored) m.setColorAt(i, _v1 && new C3(p.col[0], p.col[1], p.col[2])); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); m.castShadow = !!shadow; m.receiveShadow = true; m.matrixAutoUpdate = false; grp.add(m); return m;
  };
  const lampHeads = [], sigA = [], sigB = [];
  Props.cull = [];   // [mesh, cx, cz, maxDist] — small things vanish with distance; nobody can see a hydrant from 500 m
  const FAR = { tree: 760, ac: 520, vent: 380, escape: 560, lamp: 560, hydrant: 260, bin: 260, signal: 560, signalB: 560, antenna: 900, bulk: 800, tower: 1400 };
  for (const [key, list] of Props.buckets) {
    const kind = key.split('|')[0]; let cx = 0, cz = 0; for (const p of list) { cx += p.x; cz += p.z; } cx /= list.length; cz /= list.length;
    if (kind === 'tree') { Props.cull.push([mkInst(G.trunk, Props.mat, list, true, false), cx, cz, 420], [mkInst(G.canopy, Props.leafMat, list, true, true), cx, cz, FAR.tree]); continue; }
    const d = defs[kind]; Props.cull.push([mkInst(d[0], d[1], list, d[2], false), cx, cz, FAR[kind] || 600]);
    if (kind === 'lamp') lampHeads.push(...list); if (kind === 'signal') sigA.push(...list); if (kind === 'signalB') sigB.push(...list);
  }
  // emissive lamp heads + ground pools
  Props.lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); const lh = mkInst(G.lampHead, Props.lampMat, lampHeads, false, false); lh.frustumCulled = false;
  const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-PI / 2); Props.poolMat = new THREE.MeshBasicMaterial({ map: FX_glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: 0x000000 });
  const pools = lampHeads.map(p => ({ x: p.x + Math.cos(-p.ry) * 2.35, y: 0.22, z: p.z + Math.sin(-p.ry) * 2.35, ry: 0, sx: 15, sy: 1, sz: 15 })); const pm = mkInst(pg, Props.poolMat, pools, false, false); pm.frustumCulled = false; pm.renderOrder = 5;
  // signal lenses: [red, amber, green] for each of the two phases
  const lens = new THREE.BoxGeometry(0.2, 0.2, 0.06); Props.signalMats = [];
  for (const [list, ph] of [[sigA, 0], [sigB, 1]]) for (let c = 0; c < 3; c++) { const g = new THREE.BufferGeometry().copy(lens); const mat = new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: false }); Props.signalMats.push({ mat, ph, c });
    const L = []; for (const p of list) for (const ox of [4.9, 2.6]) { const cs = Math.cos(p.ry), sn = Math.sin(p.ry), lx = ox, lz = 0.2; L.push({ x: p.x + lx * cs + lz * sn, y: p.y + 6.18 - c * 0.33, z: p.z - lx * sn + lz * cs, ry: p.ry, sx: 1, sy: 1, sz: 1 }); } const im = mkInst(g, mat, L, false, false); im.frustumCulled = false; }
  Props.signs(); Props.backdrop(); Props.buckets.clear();
};
function FX_glowTex() { return canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { clamp: true }); }

Props.signs = function () {
  const mk = (text, w, h, color, bg) => { const t = canvasTex(1024, Math.round(1024 * h / w), (g, W, H) => { g.fillStyle = bg || 'rgba(0,0,0,0)'; g.fillRect(0, 0, W, H); g.fillStyle = color; g.font = `900 ${Math.round(H * 0.78)}px Impact, "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H * 0.54, W * 0.96); }, { clamp: true }); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, side: THREE.DoubleSide, color: new C3(1.7, 1.7, 1.7) })); GFX.scene.add(m); Props.billboards.push({ m, base: 1.7, glow: true }); return m; };
  for (const b of CITY.buildings) { if (!b.sign) continue; const s = b.sign, m = mk(s.text, s.w, s.h, s.color);
    if (s.face === 'roof') { m.position.set(s.x, s.y + s.h / 2 + 2.2, s.z); m.rotation.y = PI; const fr = new GeoM(), c = colr(0.08, 0.08, 0.09); for (let k = -2; k <= 2; k++) fr.box(0.2, s.h + 2.4, 0.2, k * s.w / 4.4, (s.h + 2.4) / 2, 0.35, c); fr.box(s.w, 0.2, 0.2, 0, 2.0, 0.35, c); const f = new THREE.Mesh(fr.build(), Props.metal); f.position.set(s.x, s.y, s.z); f.castShadow = true; GFX.scene.add(f); }
    else { m.position.set(s.x, s.y, s.z + 0.15); } }
  // a bright crossroads: big animated ad panels on the facades around one midtown intersection
  const ix = CITY.aveX(5), iz = CITY.stZ(9), ads = [['ZAP! COLA', '#ffe23a', '#c4121f'], ['NOVA', '#ffffff', '#0a2a8a'], ['WEB OF THE CITY', '#ffd34a', '#16161c'], ['PIZZA 99¢', '#fff4d0', '#b02a10'], ['BUGLE NEWS 24', '#ffffff', '#7a0d14'], ['KICKS', '#0b0b0e', '#36e0c0']];
  let ai = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const bx = ix + sx * (CITY.AVE / 2 + CITY.SWX + 0.3), bz = iz + sz * (CITY.ST / 2 + CITY.SWZ + 0.3);
    for (const face of [0, 1]) { const a = ads[ai++ % ads.length], w = face ? 20 : 15, h = face ? 9 : 11, y = 14 + ((ai * 7) % 3) * 9; const hb = City.heightAt(bx + sx * 3, bz + sz * 3); if (hb < y + h) continue;
      const m = mk(a[0], w, h, a[1], a[2]); if (face) { m.position.set(bx + sx * (w / 2 + 1), y + h / 2, bz - sz * 0.35); m.rotation.y = sz > 0 ? PI : 0; } else { m.position.set(bx - sx * 0.35, y + h / 2, bz + sz * (w / 2 + 1)); m.rotation.y = sx > 0 ? -PI / 2 : PI / 2; } Props.billboards[Props.billboards.length - 1].ad = ai; }
  }
};

/* far shores: a ring of low-detail districts across the water so the horizon is never empty */
Props.backdrop = function () {
  const G = new GeoB(), R = mulberry(SM.SEED + 404), white = new C3(1, 1, 1), lands = [];
  const bands = [[-CITY.W / 2 - 1500, -CITY.W / 2 - 520, -1500, 1500], [CITY.W / 2 + 520, CITY.W / 2 + 1500, -1500, 1500], [-CITY.W / 2 - 520, CITY.W / 2 + 520, -CITY.D / 2 - 1700, -CITY.D / 2 - 640], [-CITY.W / 2 - 520, CITY.W / 2 + 520, CITY.D / 2 + 900, CITY.D / 2 + 1800]];
  for (const bd of bands) {
    lands.push(bd); const nx = Math.floor((bd[1] - bd[0]) / 95), nz = Math.floor((bd[3] - bd[2]) / 95);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (R() < 0.45) continue; const x = bd[0] + i * 95 + 12 + R() * 20, z = bd[2] + j * 95 + 12 + R() * 20, w = 28 + R() * 34, d = 26 + R() * 30;
      const edge = Math.min(x - bd[0], bd[1] - x, z - bd[2], bd[3] - z) / 300, h = (18 + R() * 60 + (R() < 0.12 ? 90 + R() * 110 : 0)) * U.lerp(0.7, 1.25, U.sat(edge));
      const style = R() < 0.4 ? FS.GLASS : R() < 0.6 ? FS.MASONRY : FS.GRID;
      const b = { style, seed: R(), floorH: 3.8, tint: R.pick(style === FS.GLASS ? PAL.metal : style === FS.MASONRY ? PAL.brick : PAL.concrete), trim: 0x999999, tiers: [{ x0: x, x1: x + w, z0: z, z1: z + d, y0: 0, y1: 5 + Math.round((h - 5) / 3.8) * 3.8 }], cornice: false, glassVar: R(), h };
      City.addBuildingGeo(G, b);
    }
  }
  const m = new THREE.Mesh(G.build(), City.facadeMat); m.matrixAutoUpdate = false; m.name = 'backdrop'; GFX.scene.add(m);
  const L = new GeoB(); for (const bd of lands) { L.flat(bd[0] - 60, bd[1] + 60, bd[2] - 60, bd[3] + 60, 0.4, white, [0, 0, 1, 1], [1, 0, 0, 0]); L.ring(bd[0] - 60, bd[1] + 60, bd[2] - 60, bd[3] + 60, -6, 0.4, white, [0, 0, 1, 1], () => [1, 0, 0, 0]); }
  const lm = new THREE.Mesh(L.build(), Ground.mat); lm.matrixAutoUpdate = false; lm.receiveShadow = false; GFX.scene.add(lm);
};

Props.applyTod = function (T) {
  const k = T.lamps; Props.lampMat.color.setRGB(1.0 + 5 * k, 0.85 + 3.6 * k, 0.55 + 1.6 * k); Props.poolMat.color.setRGB(1.25 * k * k, 0.90 * k * k, 0.45 * k * k);
  for (const b of Props.billboards) b.base = 0.9 + T.lit * 2.2;
};
Props.update = function (dt) {
  Props.cullT = (Props.cullT || 0) - dt; if (Props.cullT <= 0 && Props.cull) { Props.cullT = 0.4; const c = GFX.camera.position, hy = c.y * 0.6; for (const e of Props.cull) { const d = Math.hypot(e[1] - c.x, e[2] - c.z) - 240; e[0].visible = d + hy * 0.5 < e[3]; } }
  // signals: phase 0 = avenues flow (signal), phase 1 = streets flow (signalB)
  const t = SM.time % 36, a = t < 15 ? 2 : t < 18 ? 1 : 0, b = t < 18 ? 0 : t < 33 ? 2 : 1, cols = [[3.2, 0.12, 0.08], [3.0, 1.7, 0.1], [0.1, 3.0, 0.5]];
  Props.phase = { ns: a, ew: b };
  for (const s of Props.signalMats) { const on = (s.ph === 0 ? a : b) === s.c; if (on) s.mat.color.setRGB(cols[s.c][0], cols[s.c][1], cols[s.c][2]); else s.mat.color.setRGB(0.03, 0.03, 0.03); }
  for (const bb of Props.billboards) { const f = bb.ad ? 0.85 + 0.15 * Math.sin(SM.time * (1.5 + bb.ad * 0.37) + bb.ad) : 1; bb.m.material.color.setScalar(bb.base * f); }
};


'use strict';
/* ==== p04_citygen.js ==== */
/* p04: city layout — grid, districts, park, lots, buildings (stacks of axis-aligned tiers), landmarks. Pure data, no meshes. */

const CITY = {
  NX: 12, NZ: 16, BX: 84, BZ: 56, AVE: 20, ST: 13, SWX: 5, SWZ: 4,   // sidewalks live inside the block
  MARGIN: 30,                                                          // esplanade ring around the grid
  PARK: { i0: 4, i1: 7, j0: 2, j1: 6 },
};
CITY.PX = CITY.BX + CITY.AVE; CITY.PZ = CITY.BZ + CITY.ST;
CITY.W = CITY.NX * CITY.PX + CITY.AVE; CITY.D = CITY.NZ * CITY.PZ + CITY.ST;
CITY.X0 = -CITY.W / 2; CITY.Z0 = -CITY.D / 2;
CITY.blockX = i => CITY.X0 + i * CITY.PX + CITY.AVE;      // west edge of block i
CITY.blockZ = j => CITY.Z0 + j * CITY.PZ + CITY.ST;       // north edge of block j
CITY.aveX = i => CITY.X0 + i * CITY.PX + CITY.AVE / 2;    // centre line of avenue i (0..NX)
CITY.stZ = j => CITY.Z0 + j * CITY.PZ + CITY.ST / 2;      // centre line of street j (0..NZ)
{
  const P = CITY.PARK;
  P.x0 = CITY.blockX(P.i0); P.x1 = CITY.blockX(P.i1) + CITY.BX; P.z0 = CITY.blockZ(P.j0); P.z1 = CITY.blockZ(P.j1) + CITY.BZ;
}
CITY.inPark = (x, z, pad = 0) => { const P = CITY.PARK; return x > P.x0 - pad && x < P.x1 + pad && z > P.z0 - pad && z < P.z1 + pad; };
CITY.isParkBlock = (i, j) => { const P = CITY.PARK; return i >= P.i0 && i <= P.i1 && j >= P.j0 && j <= P.j1; };
CITY.inBounds = (x, z, pad = 0) => x > CITY.X0 - CITY.MARGIN - pad && x < -CITY.X0 + CITY.MARGIN + pad && z > CITY.Z0 - CITY.MARGIN - pad && z < -CITY.Z0 + CITY.MARGIN + pad;

/* facade styles */
const FS = { GLASS: 0, MASONRY: 1, BROWN: 2, GRID: 3, DECO: 4, WAREHOUSE: 5, BLANK: 6 };

const DISTRICTS = ['UPTOWN', 'MIDTOWN', 'FINANCIAL DISTRICT', 'WEST SIDE', 'EAST DOCKS', 'THE PARK'];
CITY.districtOf = function (i, j) {
  if (CITY.isParkBlock(i, j)) return 5;
  if (i >= 11 && j >= 3 && j <= 11) return 4;
  if (i <= 1 && j <= 8) return 3;
  if (j >= 12) return 2;
  if (j >= 7) return 1;
  return 0;
};
CITY.districtAt = function (x, z) {
  const i = U.clamp(Math.floor((x - CITY.X0 - CITY.AVE / 2) / CITY.PX), 0, CITY.NX - 1), j = U.clamp(Math.floor((z - CITY.Z0 - CITY.ST / 2) / CITY.PZ), 0, CITY.NZ - 1);
  return CITY.districtOf(i, j);
};

const PAL = {
  brick: [0x8a4a38, 0x9a5540, 0x7a4234, 0xa86a4c, 0x6e3a30, 0xb37a58, 0x94503c],
  stone: [0xcbbfa6, 0xd6cdb8, 0xb9ae98, 0xc4b79c, 0xe0d6c2, 0xa9a08e],
  brown: [0x6b4a3c, 0x7a5444, 0x5c4034, 0x8a6450, 0x4e3a32, 0x94705a, 0xa08268, 0x705848],
  concrete: [0xa8a49c, 0x98958e, 0xb6b2a8, 0x8c8a86, 0xc0bbb0],
  deco: [0xcfc4aa, 0xc2b79e, 0xd9cfb6, 0xb8ad96, 0xa79c88],
  metal: [0x5a6068, 0x484e56, 0x6a7078, 0x3c4148],
  ware: [0x7c4a3a, 0x6a4034, 0x8c5844, 0x5c3a30],
};

CITY.generate = function (seed) {
  const R = mulberry(seed);
  const B = CITY.buildings = [];
  CITY.blocks = [];
  const G0 = 5.0;                                 // ground-floor height
  const snapH = (h, fh) => G0 + Math.max(1, Math.round((h - G0) / fh)) * fh;

  const heightField = (x, z, d) => {
    const n = fbm2(x * 0.0042 + 7.3, z * 0.0042 - 3.1, 3), n2 = vnoise2(x * 0.013 + 40, z * 0.013 + 11);
    if (d === 2) return 95 + n * 190 + n2 * 60;
    if (d === 1) return 70 + n * 170 + n2 * 55;
    if (d === 0) return 26 + n * 60 + n2 * 28;
    if (d === 3) return 16 + n * 22 + n2 * 10;
    return 12 + n * 16 + n2 * 8;
  };
  // buildings ringing the park are taller (the classic wall of towers around the green)
  const parkBoost = (x, z) => { const P = CITY.PARK; const dx = Math.max(P.x0 - x, 0, x - P.x1), dz = Math.max(P.z0 - z, 0, z - P.z1); const d = Math.hypot(dx, dz); return d < 95 ? 1.75 : 1; };

  const addBuilding = (lot, style, h, o) => {
    o = o || {};
    const fh = o.floorH || (style === FS.GLASS ? 4.0 : style === FS.BROWN ? 3.3 : style === FS.WAREHOUSE ? 4.6 : 3.6);
    const b = { id: B.length, lot, style, seed: R(), floorH: fh, tiers: [], h: 0, tint: 0, trim: 0, district: o.district || 0, name: o.name || null, landmark: !!o.landmark, props: [], cornice: false, blank: o.blank || null, glassVar: R() };
    const pal = style === FS.MASONRY ? (R.chance(0.6) ? PAL.brick : PAL.stone) : style === FS.BROWN ? PAL.brown : style === FS.GRID ? PAL.concrete : style === FS.DECO ? PAL.deco : style === FS.WAREHOUSE ? PAL.ware : PAL.metal;
    b.tint = o.tint !== undefined ? o.tint : R.pick(pal);
    b.trim = o.trim !== undefined ? o.trim : (style === FS.BROWN ? R.pick(PAL.stone) : style === FS.MASONRY ? R.pick(PAL.stone) : 0x8a8f96);
    b.cornice = style === FS.MASONRY || style === FS.BROWN || style === FS.WAREHOUSE;
    let { x0, x1, z0, z1 } = lot;
    const w = x1 - x0, d = z1 - z0;
    if (o.tiers) {
      for (const t of o.tiers) b.tiers.push({ x0: t[0], x1: t[1], z0: t[2], z1: t[3], y0: t[4], y1: t[5] });
    } else if (style === FS.BROWN || style === FS.WAREHOUSE || h < 40) {
      b.tiers.push({ x0, x1, z0, z1, y0: 0, y1: snapH(h, fh) });
    } else if (style === FS.DECO || (style === FS.MASONRY && h > 70)) {
      // wedding-cake setbacks
      const n = h > 160 ? 4 : h > 100 ? 3 : 2; let y = 0, cx0 = x0, cx1 = x1, cz0 = z0, cz1 = z1;
      const fr = [0.34, 0.30, 0.22, 0.14];
      for (let k = 0; k < n; k++) {
        const top = k === n - 1 ? snapH(h, fh) : snapH(y + h * fr[k] * (0.85 + R() * 0.3), fh);
        b.tiers.push({ x0: cx0, x1: cx1, z0: cz0, z1: cz1, y0: y, y1: top }); y = top;
        const ix = Math.max(2.5, (cx1 - cx0) * (0.10 + R() * 0.06)), iz = Math.max(2.5, (cz1 - cz0) * (0.10 + R() * 0.06));
        cx0 += ix; cx1 -= ix; cz0 += iz; cz1 -= iz;
        if (cx1 - cx0 < 12 || cz1 - cz0 < 12) { b.tiers[b.tiers.length - 1].y1 = snapH(h, fh); break; }
      }
    } else {
      // modern: podium + shaft (+ offset crown)
      const pod = snapH(14 + R() * 14, fh);
      const hasPod = R.chance(0.65) && w > 26 && d > 26;
      let sx0 = x0, sx1 = x1, sz0 = z0, sz1 = z1, y = 0;
      if (hasPod) { b.tiers.push({ x0, x1, z0, z1, y0: 0, y1: pod }); y = pod; const ix = w * (0.08 + R() * 0.12), iz = d * (0.08 + R() * 0.12); sx0 += ix * R.range(0.4, 1.6); sx1 -= ix * R.range(0.4, 1.6); sz0 += iz * R.range(0.4, 1.6); sz1 -= iz * R.range(0.4, 1.6); }
      const H = snapH(h, fh);
      if (R.chance(0.45) && H > 110) {
        const mid = snapH(H * R.range(0.62, 0.82), fh);
        b.tiers.push({ x0: sx0, x1: sx1, z0: sz0, z1: sz1, y0: y, y1: mid });
        const cut = R.int(0, 3), a = R.range(0.25, 0.45);
        let tx0 = sx0, tx1 = sx1, tz0 = sz0, tz1 = sz1;
        if (cut === 0) tx0 += (sx1 - sx0) * a; else if (cut === 1) tx1 -= (sx1 - sx0) * a; else if (cut === 2) tz0 += (sz1 - sz0) * a; else tz1 -= (sz1 - sz0) * a;
        b.tiers.push({ x0: tx0, x1: tx1, z0: tz0, z1: tz1, y0: mid, y1: H });
      } else b.tiers.push({ x0: sx0, x1: sx1, z0: sz0, z1: sz1, y0: y, y1: H });
    }
    // mechanical penthouse on bigger roofs
    const top = b.tiers[b.tiers.length - 1];
    if (!o.noPenthouse && style !== FS.BROWN && (top.x1 - top.x0) > 16 && (top.z1 - top.z0) > 16 && R.chance(0.75)) {
      const pw = (top.x1 - top.x0) * R.range(0.3, 0.5), pd = (top.z1 - top.z0) * R.range(0.3, 0.5), px = U.lerp(top.x0 + 3, top.x1 - pw - 3, R()), pz = U.lerp(top.z0 + 3, top.z1 - pd - 3, R());
      b.tiers.push({ x0: px, x1: px + pw, z0: pz, z1: pz + pd, y0: top.y1, y1: top.y1 + R.range(4, 8), pent: true });
    }
    b.h = 0; for (const t of b.tiers) b.h = Math.max(b.h, t.y1);
    B.push(b); return b;
  };

  const splitLots = (rect, minW, maxW, R2) => {
    const out = []; const rec = (r, depth) => {
      const w = r.x1 - r.x0, d = r.z1 - r.z0; const long = Math.max(w, d);
      if (long <= maxW || (long < minW * 2) || (depth > 0 && long < maxW * 1.35 && R2.chance(0.3))) { out.push(r); return; }
      const t = R2.range(0.38, 0.62);
      if (w >= d) { const m = Math.round(r.x0 + w * t); rec({ x0: r.x0, x1: m, z0: r.z0, z1: r.z1 }, depth + 1); rec({ x0: m, x1: r.x1, z0: r.z0, z1: r.z1 }, depth + 1); }
      else { const m = Math.round(r.z0 + d * t); rec({ x0: r.x0, x1: r.x1, z0: r.z0, z1: m }, depth + 1); rec({ x0: r.x0, x1: r.x1, z0: m, z1: r.z1 }, depth + 1); }
    }; rec(rect, 0); return out;
  };

  const LM = {};   // landmark blocks "i,j" → builder
  LM['6,9'] = (zone) => {   // IMPERIAL STATE TOWER — deco supertall, title-screen perch
    const cx = (zone.x0 + zone.x1) / 2, cz = (zone.z0 + zone.z1) / 2; const T = [];
    const lv = [[34, 23, 0, 29], [29, 19.5, 29, 90], [24, 16, 90, 212], [18, 12.5, 212, 286], [12, 9, 286, 320], [6.5, 6.5, 320, 338]];
    for (const l of lv) T.push([cx - l[0], cx + l[0], cz - l[1], cz + l[1], l[2], l[3]]);
    const b = addBuilding(zone, FS.DECO, 338, { tiers: T, landmark: true, name: 'IMPERIAL STATE TOWER', district: 1, tint: 0xd2c7ad, noPenthouse: true, floorH: 3.7 });
    b.spire = { x: cx, z: cz, y: 338, h: 62, r: 2.6 };
  };
  LM['8,8'] = (zone) => {   // CROWN TOWER — stepped steel crown + needle
    const cx = (zone.x0 + zone.x1) / 2 - 8, cz = (zone.z0 + zone.z1) / 2; const T = [];
    const lv = [[27, 22, 0, 40], [21, 18, 40, 170], [16, 14, 170, 214], [12.5, 11, 214, 232], [9.5, 8.5, 232, 246], [6.8, 6.2, 246, 258], [4.4, 4.0, 258, 268]];
    for (const l of lv) T.push([cx - l[0], cx + l[0], cz - l[1], cz + l[1], l[2], l[3]]);
    const b = addBuilding({ x0: cx - 27, x1: cx + 27, z0: cz - 22, z1: cz + 22 }, FS.DECO, 268, { tiers: T, landmark: true, name: 'CROWN TOWER', district: 1, tint: 0xbfb8a8, noPenthouse: true, floorH: 3.6 });
    b.spire = { x: cx, z: cz, y: 268, h: 48, r: 1.5 }; b.crownFrom = 214;
    addBuilding({ x0: cx + 30, x1: zone.x1, z0: zone.z0, z1: zone.z1 }, FS.MASONRY, 58, { district: 1 });
  };
  LM['5,14'] = (zone) => {  // MERIDIAN ONE — glass supertall
    const cx = (zone.x0 + zone.x1) / 2, cz = (zone.z0 + zone.z1) / 2; const T = [];
    const lv = [[32, 22, 0, 21], [25, 19, 21, 150], [22, 16.5, 150, 262], [18, 13.5, 262, 340], [13, 10, 340, 384]];
    for (const l of lv) T.push([cx - l[0], cx + l[0], cz - l[1], cz + l[1], l[2], l[3]]);
    const b = addBuilding(zone, FS.GLASS, 384, { tiers: T, landmark: true, name: 'MERIDIAN ONE', district: 2, tint: 0x56606c, noPenthouse: true, floorH: 4.0 });
    b.spire = { x: cx, z: cz, y: 384, h: 70, r: 1.8 }; b.glassVar = 0.12;
  };
  LM['3,10'] = (zone) => {  // NOVACORP — twin glass slabs joined by a skybridge, glowing sign
    const T = [];
    T.push([zone.x0, zone.x1, zone.z0, zone.z1, 0, 17]);
    T.push([zone.x0 + 4, zone.x0 + 32, zone.z0 + 5, zone.z1 - 5, 17, 237]);
    T.push([zone.x1 - 32, zone.x1 - 4, zone.z0 + 8, zone.z1 - 8, 17, 197]);
    T.push([zone.x0 + 32, zone.x1 - 32, zone.z0 + 16, zone.z1 - 16, 129, 145]);
    const b = addBuilding(zone, FS.GLASS, 237, { tiers: T, landmark: true, name: 'NOVACORP PLAZA', district: 1, tint: 0x3c444e, noPenthouse: true, floorH: 4.0 });
    b.glassVar = 0.55; b.sign = { text: 'NOVACORP', x: zone.x0 + 18, z: zone.z1 - 5, y: 222, face: 'z+', w: 26, h: 7, color: '#35d0ff' };
  };
  LM['7,11'] = (zone) => {  // THE DAILY BUGLE
    const x0 = zone.x0, x1 = zone.x0 + 40, z0 = zone.z0, z1 = zone.z1; const T = [];
    T.push([x0, x1, z0, z1, 0, 19.4]); T.push([x0 + 3, x1 - 3, z0 + 3, z1 - 3, 19.4, 95]); T.push([x0 + 8, x1 - 8, z0 + 9, z1 - 9, 95, 113]);
    const b = addBuilding({ x0, x1, z0, z1 }, FS.MASONRY, 113, { tiers: T, landmark: true, name: 'THE DAILY BUGLE', district: 1, tint: 0xc9b89a, trim: 0xe6dcc6, noPenthouse: true });
    b.sign = { text: 'DAILY BUGLE', x: (x0 + x1) / 2, z: z0 + 9, y: 113, face: 'roof', w: 30, h: 8.5, color: '#ff3a2a' };
    const rest = splitLots({ x0: x1, x1: zone.x1, z0: zone.z0, z1: zone.z1 }, 18, 30, R);
    for (const lot of rest) addBuilding(lot, R.pick([FS.MASONRY, FS.GRID, FS.GLASS]), 60 + R() * 90, { district: 1 });
  };

  for (let j = 0; j < CITY.NZ; j++) for (let i = 0; i < CITY.NX; i++) {
    const bx = CITY.blockX(i), bz = CITY.blockZ(j);
    const blk = { i, j, x0: bx, x1: bx + CITY.BX, z0: bz, z1: bz + CITY.BZ, district: CITY.districtOf(i, j), park: CITY.isParkBlock(i, j), first: B.length };
    CITY.blocks.push(blk);
    if (blk.park) { blk.count = 0; continue; }
    const zone = { x0: bx + CITY.SWX, x1: bx + CITY.BX - CITY.SWX, z0: bz + CITY.SWZ, z1: bz + CITY.BZ - CITY.SWZ };
    const d = blk.district;
    const key = i + ',' + j;
    if (LM[key]) { LM[key](zone); blk.count = B.length - blk.first; continue; }
    const cxm = (zone.x0 + zone.x1) / 2, czm = (zone.z0 + zone.z1) / 2;
    const boost = parkBoost(cxm, czm);
    if (d === 3 || (d === 0 && R.chance(0.45) && boost === 1)) {
      // brownstone / tenement rows back-to-back with a rear yard, bigger corner buildings on the avenues
      const cornerW = R.range(18, 24), rowD = (zone.z1 - zone.z0 - 7) / 2;
      for (const side of [0, 1]) {
        const lotC = { x0: side ? zone.x1 - cornerW : zone.x0, x1: side ? zone.x1 : zone.x0 + cornerW, z0: zone.z0, z1: zone.z1 };
        addBuilding(lotC, R.chance(0.7) ? FS.MASONRY : FS.GRID, (28 + R() * 34) * (d === 3 ? 0.8 : 1), { district: d });
      }
      for (const row of [0, 1]) {
        let x = zone.x0 + cornerW; const xe = zone.x1 - cornerW; const z0 = row ? zone.z1 - rowD : zone.z0, z1 = row ? zone.z1 : zone.z0 + rowD;
        let hh = 15 + R() * 5;
        while (x < xe - 5) {
          let w = R.range(6.8, 10.5); if (xe - (x + w) < 6) w = xe - x;
          if (R.chance(0.35)) hh = 14 + R() * 8;
          const tall = R.chance(0.12);
          addBuilding({ x0: x, x1: x + w, z0, z1 }, FS.BROWN, tall ? hh + 8 : hh, { district: d, blank: row ? 'z-' : 'z+' });
          x += w;
        }
      }
    } else if (d === 4) {
      const lots = splitLots(zone, 22, 40, R);
      for (const lot of lots) addBuilding(lot, R.chance(0.75) ? FS.WAREHOUSE : FS.MASONRY, 13 + R() * 18, { district: d });
    } else {
      const big = d === 2 ? 46 : d === 1 ? 40 : 30;
      const lots = splitLots(zone, 18, big, R);
      for (const lot of lots) {
        const lx = (lot.x0 + lot.x1) / 2, lz = (lot.z0 + lot.z1) / 2;
        let h = heightField(lx, lz, d) * (0.62 + R() * 0.62) * boost;
        const area = (lot.x1 - lot.x0) * (lot.z1 - lot.z0);
        if (area < 500) h = Math.min(h, 95);
        if (R.chance(0.10)) h *= 0.45;
        let style;
        const r = R();
        if (d === 2) style = r < 0.62 ? FS.GLASS : r < 0.78 ? FS.GRID : r < 0.92 ? FS.DECO : FS.MASONRY;
        else if (d === 1) style = r < 0.40 ? FS.GLASS : r < 0.58 ? FS.DECO : r < 0.78 ? FS.MASONRY : FS.GRID;
        else style = r < 0.50 ? FS.MASONRY : r < 0.66 ? FS.GRID : r < 0.82 ? FS.GLASS : FS.DECO;
        if (h < 34 && style === FS.GLASS && R.chance(0.6)) style = FS.MASONRY;
        h = U.clamp(h, 18, 300);
        addBuilding(lot, style, h, { district: d });
      }
    }
    blk.count = B.length - blk.first;
  }

  // flat list of solid boxes for collision / heightmap
  const boxes = CITY.boxes = [];
  for (const b of B) for (const t of b.tiers) boxes.push({ x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1, y0: t.y0, y1: t.y1, b: b.id, kind: 0, pent: !!t.pent });
  return B;
};

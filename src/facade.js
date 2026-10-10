'use strict';
/* ==== p05_facade.js ==== */
/* p05: the facade material — every window, brick, mullion, storefront and lit interior in the city is drawn by this shader.
   Geometry is only boxes; per-vertex attributes carry style/seed/bay/floor so one program renders all architecture. */

const City = { chunks: [], group: null, facadeMat: null, heightTex: null };

GLSL.facade = /* glsl */`
uniform float uTime, uLit, uRoomAmb;
varying vec4 vFacade; varying vec4 vExtra; varying vec3 vWPos; varying vec3 vWNrm; varying vec2 vFuv;
vec3 fcAlbedo; float fcRough; float fcMetal; vec3 fcEmis; vec3 fcNrmW; float fcEnvK; float fcAO; float fcFar;

float aastep(float e, float x){ float w = fwidth(x) * 0.75 + 1e-5; return smoothstep(e - w, e + w, x); }
float rectM(vec2 p, vec2 lo, vec2 hi){ return aastep(lo.x, p.x) * (1.0 - aastep(hi.x, p.x)) * aastep(lo.y, p.y) * (1.0 - aastep(hi.y, p.y)); }

vec3 brickTex(vec2 uv, vec3 tint, float detail, out float bump){
  vec2 b = uv / vec2(0.23, 0.076); float row = floor(b.y); b.x += 0.5 * mod(row, 2.0);
  vec2 id = floor(b), f = fract(b);
  float mort = 1.0 - (smoothstep(0.0, 0.07, f.x) * smoothstep(1.0, 0.93, f.x) * smoothstep(0.0, 0.16, f.y) * smoothstep(1.0, 0.84, f.y));
  float r = hash12(id);
  vec3 c = tint * (0.80 + 0.40 * r); c = mix(c, c * vec3(0.72, 0.70, 0.78), step(0.86, r));
  c = mix(c, tint * 0.2 + vec3(0.46, 0.44, 0.41), mort * 0.8);
  bump = -mort;
  return mix(tint * 0.98, c, detail);
}
vec3 stoneTex(vec2 uv, vec3 tint, float detail, out float bump){
  vec2 b = uv / vec2(0.9, 0.42); float row = floor(b.y); b.x += 0.37 * mod(row, 3.0);
  vec2 id = floor(b), f = fract(b);
  float j = 1.0 - (smoothstep(0.0, 0.02, f.x) * smoothstep(1.0, 0.98, f.x) * smoothstep(0.0, 0.04, f.y) * smoothstep(1.0, 0.96, f.y));
  vec3 c = tint * (0.92 + 0.14 * hash12(id)) * (0.94 + 0.12 * vnoise(uv * 5.0));
  c *= 1.0 - j * 0.35; bump = -j;
  return mix(tint, c, detail);
}

// fake rooms behind the glass: intersect the view ray with a box the size of the bay × floor
vec3 interiorMap(vec2 cellUV, vec2 cellSize, vec3 rd, vec3 rnd3, float office, float lit, vec3 lightCol){
  float depth = mix(4.2, 7.0, office);
  vec3 ro = vec3(cellUV * cellSize, 0.0);
  vec3 bmax = vec3(cellSize, depth);
  vec3 sd = vec3(rd.x < 0.0 ? -1.0 : 1.0, rd.y < 0.0 ? -1.0 : 1.0, 1.0);
  vec3 ird = 1.0 / (abs(rd) + 1e-4) * sd;
  vec3 t1 = (bmax - ro) * ird, t0 = (-ro) * ird; vec3 tm = max(t0, t1);
  float t = min(tm.x, min(tm.y, tm.z));
  vec3 hp = ro + rd * t;
  vec3 wallC = mix(vec3(0.70, 0.64, 0.55), vec3(0.50, 0.58, 0.64), rnd3.x); wallC = mix(wallC, vec3(0.74, 0.50, 0.38), step(0.8, rnd3.z));
  vec3 c; float self = 0.0;
  if (tm.z <= t + 1e-4) {            // back wall
    c = wallC;
    vec2 q = hp.xy / cellSize;
    float door = step(0.12 + rnd3.y * 0.5, q.x) * step(q.x, 0.34 + rnd3.y * 0.5) * step(q.y, 0.72); c = mix(c, wallC * 0.35, door);
    float pic = step(0.62, q.x) * step(q.x, 0.84) * step(0.45, q.y) * step(q.y, 0.70) * step(0.4, rnd3.z); c = mix(c, vec3(0.9, 0.85, 0.7) * rnd3.yzx, pic * 0.8);
    float desk = step(q.y, 0.30) * step(0.3, fract(q.x * 2.0 + rnd3.x)); c = mix(c, wallC * 0.22, desk * office);
  } else if (tm.y <= t + 1e-4) {
    if (rd.y < 0.0) { c = mix(vec3(0.30, 0.22, 0.15), vec3(0.28, 0.29, 0.31), office); c *= 0.92 + 0.08 * step(0.5, fract(hp.x * 0.8)); }
    else { c = vec3(0.82);
      float pan = step(0.72, fract(hp.x / 2.4 + 0.2)) * step(0.55, fract(hp.z / 2.6)); self = pan * office * 1.6 + (1.0 - office) * 0.15 * step(length(vec2(hp.x - cellSize.x * 0.5, hp.z - 2.2)), 0.35) * 8.0; }
  } else { c = wallC * 0.85; float shelf = step(0.72, fract(hp.z * 0.55 + rnd3.y)) * step(hp.y, cellSize.y * 0.62); c = mix(c, wallC * 0.4, shelf * 0.8); }
  float fall = 0.50 + 0.50 * (1.0 - hp.z / depth);
  float cornerAO = smoothstep(0.0, 0.7, min(min(hp.x, cellSize.x - hp.x), min(hp.y, cellSize.y - hp.y)) + 0.15);
  vec3 litC = c * lightCol * fall * (0.55 + 0.45 * cornerAO) + lightCol * self;
  vec3 darkC = c * uRoomAmb * (0.35 + 0.65 * (1.0 - hp.z / depth)) * cornerAO;
  return mix(darkC, litC, lit);
}

void facadeMain(){
  float style = floor(vFacade.x + 0.5), seed = vFacade.y, bayW = vFacade.z, floorH = vFacade.w;
  float flag = floor(vExtra.w + 0.5);
  vec3 tint = vColor; vec3 N = normalize(vWNrm);
  fcAlbedo = tint; fcRough = 0.86; fcMetal = 0.0; fcEmis = vec3(0.0); fcNrmW = vec3(0.0); fcEnvK = 1.0; fcAO = 1.0;
  float dist = length(vWPos - cameraPosition);
  float detail = 1.0 - smoothstep(30.0, 110.0, dist);
  float bump = 0.0;

  if (flag > 0.5 && flag < 1.5) {                       // ---- ROOF
    float W = vExtra.x, D = vFacade.z; vec2 r = vFuv;
    float edge = min(min(r.x, W - r.x), min(r.y, D - r.y));
    float n = fbm3(vWPos.xz * 0.23 + seed * 40.0), n2 = vnoise(vWPos.xz * 2.7);
    vec3 base = mix(vec3(0.115, 0.115, 0.12), vec3(0.25, 0.24, 0.23), n);
    base = mix(base, vec3(0.50, 0.51, 0.53), step(0.74, seed) * 0.85);
    base = mix(base, vec3(0.30, 0.17, 0.13), step(seed, 0.14) * 0.8);
    base *= 0.82 + 0.36 * n2;
    float seam = 1.0 - smoothstep(0.0, 0.035 + fwidth(r.x) * 0.5, abs(fract(r.x / 2.9) - 0.5)); base *= 1.0 - seam * 0.30 * detail;
    float stain = smoothstep(0.55, 0.8, fbm3(vWPos.xz * 0.11 + 7.0)); base *= 1.0 - stain * 0.35;
    fcAlbedo = base; fcRough = mix(0.92, 0.55, stain * 0.7);
    fcAO = mix(0.45, 1.0, smoothstep(0.0, 2.2, edge));
    return;
  }
  if (flag > 1.5 && flag < 2.5) {                       // ---- TRIM / STONE
    float n = vnoise(vWPos.xz * 1.3 + vWPos.y * 0.7); fcAlbedo = tint * (0.86 + 0.24 * n); fcRough = 0.8; return;
  }
  if (flag > 2.5 && flag < 3.5) {                       // ---- MECHANICAL PENTHOUSE (louvred metal)
    float sl = fract(vFuv.y / 0.32); float lv = smoothstep(0.0, 0.5, sl) * (1.0 - step(0.92, sl));
    fcAlbedo = vec3(0.42, 0.43, 0.44) * (0.55 + 0.5 * lv) * (0.9 + 0.2 * vnoise(vFuv * 0.6)); fcRough = 0.55; fcMetal = 0.35;
    fcNrmW = vec3(0.0, (sl - 0.5) * 0.9 * detail, 0.0); return;
  }
  if (flag > 3.5 && flag < 4.5) {                       // ---- SPIRE / BRIGHT METAL
    fcAlbedo = vec3(0.80, 0.82, 0.85) * tint * 1.6; fcRough = 0.28; fcMetal = 0.95;
    float rib = abs(fract(vFuv.x / 0.8) - 0.5); fcNrmW = cross(vec3(0.0, 1.0, 0.0), N) * (rib - 0.25) * 0.8 * detail; return;
  }
  vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N));
  float u = vFuv.x, v = vFuv.y, roofY = vExtra.y;
  if (flag > 4.5) {                                     // ---- BLANK PARTY WALL (painted-over brick, ghost signs)
    fcAlbedo = brickTex(vec2(u, v), tint * 0.85, detail, bump);
    float ad = rectM(vec2(u / max(vExtra.x, 1.0), v / max(roofY, 1.0)), vec2(0.15, 0.45), vec2(0.85, 0.82)) * step(0.45, seed);
    vec3 adc = mix(vec3(0.75, 0.72, 0.62), vec3(0.25, 0.38, 0.5), step(0.75, seed));
    fcAlbedo = mix(fcAlbedo, adc * (0.7 + 0.3 * fbm3(vec2(u, v) * 0.8)), ad * 0.55 * smoothstep(0.35, 0.6, fbm3(vec2(u, v) * 0.35 + 3.0) + 0.25));
    fcAlbedo *= 0.75 + 0.25 * fbm3(vec2(u * 0.9, v * 0.12));
    fcAO = mix(0.7, 1.0, smoothstep(0.0, 9.0, v)); return;
  }

  // ---- WINDOWED FACADE
  float G0 = 5.0;
  bool isGlass = style < 0.5, isMas = style > 0.5 && style < 1.5, isBrown = style > 1.5 && style < 2.5, isGrid = style > 2.5 && style < 3.5, isDeco = style > 3.5 && style < 4.5, isWare = style > 4.5;
  float office = (isGlass || isGrid || isDeco) ? 1.0 : 0.0;
  vec3 trim = isGlass ? mix(vec3(0.10, 0.11, 0.12), vec3(0.55, 0.57, 0.60), step(0.5, fract(seed * 7.3))) : mix(tint * 1.25 + 0.06, vec3(0.78, 0.74, 0.66), 0.55);

  // wall surface
  vec3 wallC; float wb = 0.0;
  if (isGlass) wallC = trim;
  else if (isMas || isWare) { if (fract(seed * 3.7) < 0.62 || isWare) wallC = brickTex(vec2(u, v), tint, detail, wb); else wallC = stoneTex(vec2(u, v), tint, detail, wb); }
  else if (isBrown) { if (fract(seed * 5.1) < 0.5) wallC = brickTex(vec2(u, v), tint, detail, wb); else wallC = stoneTex(vec2(u, v) * 0.8, tint, detail, wb); }
  else if (isGrid) { wallC = tint * (0.90 + 0.18 * vnoise(vec2(u, v) * 0.9)); }
  else { wallC = stoneTex(vec2(u, v) * 0.7, tint, detail, wb); }
  float grime = fbm3(vec2(u * 1.3 + seed * 9.0, v * 0.06));
  if (!isGlass) wallC *= mix(1.0, 0.62 + 0.5 * grime, isWare ? 0.9 : 0.55);
  bump += wb * 0.5;

  if (v > roofY) {                                      // parapet + coping
    float cop = smoothstep(roofY + 0.75, roofY + 0.8, v);
    fcAlbedo = mix(wallC, trim * 0.95, isGlass ? 1.0 : cop); fcRough = isGlass ? 0.4 : 0.8; fcMetal = isGlass ? 0.6 : 0.0;
    fcAO = 1.0; return;
  }

  float litScale = isWare ? 0.25 : (office > 0.5 ? 1.2 : 0.95);
  vec3 V = normalize(vWPos - cameraPosition);
  vec3 rd = vec3(dot(V, T), V.y, -dot(V, N));
  float baseAO = mix(0.62, 1.0, smoothstep(0.0, 10.0, v)) * mix(0.8, 1.0, smoothstep(0.0, 1.2, roofY - v));

  if (v < G0) {                                         // ---- GROUND FLOOR
    bool shop = isGlass || isGrid || isDeco || (isMas && fract(seed * 11.0) < 0.75);
    float sw = shop ? bayW * (bayW < 3.0 ? 2.0 : 1.0) : bayW;
    float nb = max(1.0, floor(vExtra.x / sw + 0.5)); sw = vExtra.x / nb;
    float fx = u / sw, cx = floor(fx), lx = fract(fx), ly = v / G0;
    vec3 r3 = hash32(vec2(cx, -3.0) + seed * vec2(517.0, 271.0) + N.xz * 37.0);
    vec3 baseC = isGlass ? vec3(0.13, 0.13, 0.14) : wallC * 0.78;
    if (shop) {
      float isDoor = step(0.78, r3.x);
      vec2 lo = vec2(0.07, 0.09), hi = vec2(0.93, 0.66);
      float win = rectM(vec2(lx, ly), lo, hi);
      float signB = rectM(vec2(lx, ly), vec2(0.04, 0.72), vec2(0.96, 0.90)) * step(r3.y, 0.8);
      float litS = step(1.0 - min(uLit * 2.2 + 0.25, 0.92), r3.z);
      vec3 shopLight = mix(vec3(1.0, 0.82, 0.55), vec3(0.85, 0.95, 1.0), step(0.6, r3.y)) * 2.3;
      vec3 ic = interiorMap(vec2(lx, ly), vec2(sw, G0), rd, r3, 0.4, litS, shopLight);
      // mullions in the shop glass
      float mul = 1.0 - smoothstep(0.0, 0.02, abs(fract(lx * (isDoor > 0.5 ? 2.0 : 3.0)) - 0.5) - 0.47);
      fcAlbedo = mix(baseC, vec3(0.02), win); fcRough = mix(0.8, 0.07, win); fcEmis = ic * win * 0.9;
      fcAlbedo = mix(fcAlbedo, vec3(0.06), win * mul); fcEmis *= 1.0 - mul * 0.85;
      vec3 sc = 0.5 + 0.5 * cos(6.2831 * (r3.x * 3.0 + vec3(0.0, 0.33, 0.67))); sc = mix(sc, vec3(0.9), 0.25);
      float glyph = step(0.45, hash12(vec2(floor(lx * 22.0) + cx * 31.0, seed * 91.0))) * step(0.2, lx) * step(lx, 0.8) * step(0.76, ly) * step(ly, 0.86);
      vec3 signC = mix(sc * 0.20, vec3(1.0, 0.95, 0.85), glyph);
      fcAlbedo = mix(fcAlbedo, signC, signB); fcEmis += signC * signB * (0.10 + uLit * 1.1) * (0.5 + glyph * 0.7);
      fcRough = mix(fcRough, 0.5, signB);
      fcEnvK = mix(1.0, 0.35, win);
    } else {
      float dn = max(1.0, floor(nb * 0.5)); float isDoor = step(abs(cx - dn), 0.1);
      vec2 lo = isDoor > 0.5 ? vec2(0.30, 0.0) : vec2(0.27, 0.34), hi = isDoor > 0.5 ? vec2(0.70, 0.62) : vec2(0.73, 0.80);
      float win = rectM(vec2(lx, ly), lo, hi);
      float litS = step(1.0 - uLit * 0.8, r3.z) * (1.0 - isDoor);
      vec3 ic = interiorMap(vec2(lx, ly), vec2(sw, G0), rd, r3, 0.0, litS, vec3(1.0, 0.74, 0.42) * 1.5);
      vec3 doorC = mix(vec3(0.16, 0.07, 0.05), vec3(0.05, 0.12, 0.10), step(0.5, r3.y));
      fcAlbedo = mix(baseC * (0.85 + 0.15 * step(0.5, fract(v / 0.5))), mix(vec3(0.02), doorC, isDoor), win);
      fcRough = mix(0.85, mix(0.08, 0.45, isDoor), win); fcEmis = ic * win * (1.0 - isDoor) * 0.85;
      float fr = rectM(vec2(lx, ly), lo - vec2(0.05, 0.03), hi + vec2(0.05, 0.05)) - win; fcAlbedo = mix(fcAlbedo, trim * 0.9, clamp(fr, 0.0, 1.0));
    }
    float plinth = 1.0 - smoothstep(0.42, 0.47, v); fcAlbedo = mix(fcAlbedo, baseC * 0.6, plinth); fcEmis *= 1.0 - plinth; fcRough = mix(fcRough, 0.8, plinth);
    fcAO = baseAO; return;
  }

  // ---- UPPER FLOORS
  float fy = (v - G0) / floorH, cy = floor(fy), ly = fract(fy);
  float fx = u / bayW, cx = floor(fx), lx = fract(fx);
  vec2 cid = vec2(cx, cy) + seed * vec2(517.0, 271.0) + N.xz * 37.0;
  vec3 r3 = hash32(cid); float rF = hash11(cy * 3.7 + seed * 91.0);
  vec2 lo, hi; vec3 frameC = trim; float frameW = 0.05;
  vec3 spand = wallC; float spandM = 0.0;
  if (isGlass) { float mx = 0.07 / bayW; lo = vec2(mx, 1.05 / floorH); hi = vec2(1.0 - mx, 1.0 - 0.10 / floorH); frameW = 0.0; }
  else if (isMas) { lo = vec2(0.27, 0.24); hi = vec2(0.73, 0.80); }
  else if (isBrown) { lo = vec2(0.24, 0.20); hi = vec2(0.76, 0.80); frameW = 0.07; }
  else if (isGrid) { lo = vec2(0.085, 0.34); hi = vec2(0.915, 0.93); frameW = 0.0; }
  else if (isDeco) { lo = vec2(0.24, 0.30); hi = vec2(0.76, 0.93); frameW = 0.0; }
  else { lo = vec2(0.13, 0.20); hi = vec2(0.87, 0.86); frameW = 0.03; }
  vec2 p = vec2(lx, ly);
  float win = rectM(p, lo, hi);
  // lit rooms cluster by floor in offices, per window in homes
  float lr = mix(r3.z, mix(r3.z, rF, 0.55), office);
  float lit = step(1.0 - uLit * litScale, lr);
  vec3 lightCol = mix(vec3(1.0, 0.72, 0.40), vec3(0.92, 0.96, 1.0), office * step(0.35, r3.x));
  lightCol = mix(lightCol, vec3(0.45, 0.6, 1.0) * (0.7 + 0.3 * sin(uTime * 9.0 + r3.y * 40.0)), (1.0 - office) * step(0.93, r3.y));
  lightCol *= mix(1.3, 2.6, r3.x);
  vec3 ic = interiorMap(p, vec2(bayW, floorH), rd, r3, office, lit, lightCol);
  // blinds / curtains
  float wy = (ly - lo.y) / (hi.y - lo.y), wx = (lx - lo.x) / (hi.x - lo.x);
  float blindAmt = (office > 0.5 ? 0.38 : 0.62) * r3.y * step(office > 0.5 ? 0.62 : 0.40, r3.x);
  float blind = step(1.0 - blindAmt, wy);
  float curt = (1.0 - office) * step(0.5, r3.z) * (step(wx, 0.16) + step(0.84, wx));
  float cover = clamp(blind + curt, 0.0, 1.0);
  vec3 coverC = mix(vec3(0.78, 0.74, 0.66), vec3(0.55, 0.35, 0.30), step(0.8, r3.x) * (1.0 - office));
  if (office > 0.5 && blind > 0.5) coverC *= 0.92 + 0.08 * step(0.5, fract(wy * 30.0));
  ic = mix(ic, coverC * (uRoomAmb * 0.9 + lit * lightCol * 0.42), cover);
  // glass
  float gv = vExtra.z; vec3 glassA = vec3(0.02); float glassM = 0.0, glassR = 0.07, seeIn = 1.0;
  if (isGlass) {
    if (gv < 0.34) { glassA = vec3(0.36, 0.50, 0.60); glassM = 0.82; seeIn = 0.42; }
    else if (gv < 0.67) { glassA = vec3(0.20, 0.19, 0.17); glassM = 0.65; seeIn = 0.55; glassR = 0.09; }
    else { glassA = vec3(0.03, 0.04, 0.05); glassM = 0.0; seeIn = 1.0; }
  } else if (isWare) { glassR = 0.35; seeIn = 0.6; glassA = vec3(0.06, 0.07, 0.06); }
  // panes / muntins
  float mun = 0.0;
  if (isWare) mun = max(1.0 - smoothstep(0.0, 0.03, abs(fract(wx * 4.0) - 0.5) - 0.44), 1.0 - smoothstep(0.0, 0.03, abs(fract(wy * 5.0) - 0.5) - 0.44));
  else if (isMas || isBrown) mun = max(1.0 - smoothstep(0.0, 0.02, abs(wx - 0.5) - 0.0) * 1.0, 1.0 - smoothstep(0.0, 0.015, abs(wy - 0.5)));
  else if (isGrid) mun = 1.0 - smoothstep(0.0, 0.012, abs(fract(wx * 3.0) - 0.5) - 0.475);
  mun *= win * detail;
  if (isMas || isBrown) mun *= 0.85;

  // assemble
  vec3 wallFinal = wallC;
  if (isGlass) { // spandrel band of opaque glass between floors
    float sp = 1.0 - aastep(lo.y, ly); float mullV = 1.0 - rectM(vec2(lx, 0.5), vec2(lo.x, 0.0), vec2(hi.x, 1.0));
    wallFinal = mix(glassA * 0.55 + 0.02, trim, clamp(mullV + (1.0 - aastep(0.06 / floorH, ly)) , 0.0, 1.0));
    spandM = (1.0 - mullV) * 0.75;
  }
  if (isGrid) { float pan = rectM(p, vec2(lo.x, 0.06), vec2(hi.x, lo.y - 0.04)); vec3 pc = 0.5 + 0.5 * cos(6.2831 * (seed * 5.0 + vec3(0.0, 0.2, 0.45))); wallFinal = mix(wallFinal, mix(pc, vec3(0.35), 0.62) * 0.55, pan); }
  if (isDeco) {
    float pan = rectM(p, vec2(lo.x, 0.0), vec2(hi.x, lo.y)); float top = rectM(p, vec2(lo.x, hi.y), vec2(hi.x, 1.0));
    float chev = step(0.5, fract((abs(wx - 0.5) * 2.0 + ly / lo.y) * 2.0));
    wallFinal = mix(wallFinal, vec3(0.10, 0.12, 0.13) * (0.8 + 0.5 * chev), clamp(pan + top, 0.0, 1.0)); spandM = (pan + top) * 0.5;
    float flute = abs(fract(lx * 6.0) - 0.5); fcNrmW += T * (flute - 0.25) * 0.5 * (1.0 - step(lo.x, lx) * step(lx, hi.x)) * detail;
    float crownBand = smoothstep(roofY - 3.2, roofY - 3.0, v); wallFinal = mix(wallFinal, trim * 1.05, crownBand * (1.0 - win));
  }
  if (frameW > 0.0) {
    float fr = rectM(p, lo - vec2(frameW, frameW * 0.5), hi + vec2(frameW, frameW * 1.6)) - win; wallFinal = mix(wallFinal, frameC, clamp(fr, 0.0, 1.0) * 0.9);
    float sill = rectM(p, vec2(lo.x - frameW * 1.6, lo.y - 0.045), vec2(hi.x + frameW * 1.6, lo.y)); wallFinal = mix(wallFinal, frameC * 1.05, sill);
  }
  if (isMas || isDeco) { float belt = step(mod(cy, 6.0), 0.5) * (1.0 - smoothstep(0.0, 0.10, ly)); wallFinal = mix(wallFinal, trim, belt * 0.85); bump += belt * 0.6; }
  // window-unit AC boxes on some apartment windows
  if ((isMas || isBrown) && r3.x > 0.74) { float ac = rectM(p, vec2(mix(lo.x, hi.x, 0.2), lo.y), vec2(mix(lo.x, hi.x, 0.8), lo.y + 0.13)); ic = mix(ic, vec3(0.0), ac); glassA = mix(glassA, vec3(0.62, 0.62, 0.60), ac); glassR = mix(glassR, 0.6, ac); }

  fcAlbedo = mix(wallFinal, mix(glassA, frameC * 0.55, mun), win);
  fcRough = mix(isGlass ? 0.30 : 0.86, mix(glassR, 0.5, mun), win);
  fcMetal = mix(isGlass ? max(spandM, 0.5) : spandM, glassM * (1.0 - mun), win);
  float fres = pow(1.0 - clamp(rd.z, 0.0, 1.0), 4.0);
  fcEmis = ic * win * seeIn * (1.0 - mun) * (1.0 - 0.75 * fres);
  // every pane of a curtain wall sits at a slightly different angle: reflections quilt
  vec2 pr = hash22(cid * 1.31) - 0.5;
  fcNrmW += (T * pr.x + vec3(0.0, 1.0, 0.0) * pr.y) * (isGlass ? 0.030 : 0.045) * win;
  // fake reveal: the rim of each opening leans toward its centre
  vec2 q = (p - 0.5 * (lo + hi)) / (0.5 * (hi - lo));
  float rimX = smoothstep(0.80, 1.0, abs(q.x)) * (1.0 - smoothstep(1.0, 1.12, abs(q.x))), rimY = smoothstep(0.84, 1.0, abs(q.y)) * (1.0 - smoothstep(1.0, 1.12, abs(q.y)));
  float inBandX = step(abs(q.y), 1.05), inBandY = step(abs(q.x), 1.05);
  if (!isGlass) { fcNrmW += (-T * sign(q.x) * rimX * inBandX * 0.55 + vec3(0.0, -1.0, 0.0) * sign(q.y) * rimY * inBandY * 0.55) * detail;
    float recess = rectM(p, lo, vec2(hi.x, hi.y)) * smoothstep(hi.y - 0.10, hi.y, ly); fcEmis *= 1.0 - recess * 0.5; fcAlbedo *= 1.0 - recess * 0.4; }
  fcNrmW += vec3(0.0, 1.0, 0.0) * bump * 0.25 * detail;
  fcAO = baseAO;
  fcEnvK = mix(1.0, mix(0.45, 1.0, smoothstep(4.0, 60.0, v)), win);

  // distance LOD: when a cell shrinks toward a pixel, melt to the facade's average so skylines do not moire
  vec2 fw = fwidth(vec2(fx, fy)); float lod = smoothstep(0.45, 1.1, max(fw.x, fw.y));
  if (lod > 0.0) {
    float area = (hi.x - lo.x) * (hi.y - lo.y);
    vec3 avgA = mix(wallC, glassA, area); float avgR = mix(0.86, 0.25, area), avgM = glassM * area;
    vec3 avgE = lightCol * 0.5 * area * seeIn * uLit * litScale * 0.55;
    fcAlbedo = mix(fcAlbedo, avgA, lod); fcRough = mix(fcRough, avgR, lod); fcMetal = mix(fcMetal, avgM, lod); fcEmis = mix(fcEmis, avgE, lod); fcNrmW *= 1.0 - lod;
  }
}
`;

City.makeFacadeMaterial = function () {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0 });
  m.userData.tag = 'facade';
  m.onBeforeCompile = (sh) => {
    const Qy = GFX.QUAL[SM.quality];
    for (const k of ['uTime', 'uLit', 'uRoomAmb', 'uHeightMap', 'uHMInfo', 'uSunDirW', 'uShadowFocus']) sh.uniforms[k] = GFX.uni[k];
    sh.vertexShader = sh.vertexShader
      .replace(/void\s+main\s*\(\s*\)\s*\{/, 'attribute vec4 aFacade; attribute vec4 aExtra;\nvarying vec4 vFacade; varying vec4 vExtra; varying vec3 vWPos; varying vec3 vWNrm; varying vec2 vFuv;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vFacade = aFacade; vExtra = aExtra; vFuv = uv; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace(/void\s+main\s*\(\s*\)\s*\{/, '#define FAR_STEPS ' + Qy.farSteps + '\n' + GLSL.noise + GLSL.farShadow + GLSL.facade + '\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\n facadeMain(); diffuseColor.rgb = fcAlbedo;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = fcRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = fcMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(normal + (viewMatrix * vec4(fcNrmW, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += fcEmis;')
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
        { vec3 fsN = normalize(vWNrm); float fsW = smoothstep(uShadowFocus.w * 0.72, uShadowFocus.w * 0.94, max(abs(vWPos.x - uShadowFocus.x), abs(vWPos.z - uShadowFocus.z)));
          float fsNL = dot(fsN, uSunDirW); float fsh = 1.0;
          if (fsW > 0.001 && fsNL > 0.0) fsh = mix(1.0, farShadow(vWPos, fsN), fsW);
          reflectedLight.directDiffuse *= fsh; reflectedLight.directSpecular *= fsh; fcFar = fsh; }`)
      .replace('#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps.replace('radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );', 'radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness ) * fcEnvK;'))
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n { float cao = canyonAO(vWPos, normalize(vWNrm)) * fcAO; reflectedLight.indirectDiffuse *= cao; reflectedLight.indirectSpecular *= mix(1.0, cao, 0.7); }');
  };
  return MAT(m);
};


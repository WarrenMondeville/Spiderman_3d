'use strict';
/* ==== p21_suit.js ==== */
/* p21: character materials. Patterns are computed from the REST-POSE position, so they stick to the skin as it deforms:
   the classic red/blue suit with raised black webbing, lenses and spider emblems; and street clothes for the gangs. */

const Suit = {};

GLSL.suitCommon = /* glsl */`
varying vec3 vRest;
vec3 stAlbedo; float stRough; float stMetal; float stH; vec3 stEmis;
float sdSeg2(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sdEll2(vec2 p, vec2 c, vec2 r){ return (length((p - c) / r) - 1.0) * min(r.x, r.y); }
vec3 bumpN(vec3 surfPos, vec3 n, float h){
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx); float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - g);
}
float lineM(float d, float w, float aa){ return (1.0 - smoothstep(w - aa, w + aa, d)) * clamp(2.2 * w / (aa + 1e-6), 0.0, 1.0); }
`;

GLSL.suitHero = /* glsl */`
float spiderSDF(vec2 p, float fat){
  p.x = abs(p.x);
  float d = sdEll2(p, vec2(0.0, 0.0145), vec2(0.0095, 0.0120) * fat);
  d = min(d, sdEll2(p, vec2(0.0, -0.0150), vec2(0.0105 * fat, 0.0225)));
  float l = 1e3;
  l = min(l, min(sdSeg2(p, vec2(0.006, 0.020), vec2(0.021, 0.034)), sdSeg2(p, vec2(0.021, 0.034), vec2(0.0165, 0.057))));
  l = min(l, min(sdSeg2(p, vec2(0.008, 0.015), vec2(0.031, 0.021)), sdSeg2(p, vec2(0.031, 0.021), vec2(0.035, 0.046))));
  l = min(l, min(sdSeg2(p, vec2(0.008, 0.008), vec2(0.031, -0.001)), sdSeg2(p, vec2(0.031, -0.001), vec2(0.037, -0.031))));
  l = min(l, min(sdSeg2(p, vec2(0.006, 0.002), vec2(0.021, -0.017)), sdSeg2(p, vec2(0.021, -0.017), vec2(0.0225, -0.053))));
  return min(d, l - 0.0026);
}
// curvilinear web: 'a' counts the long threads, 'b' the rings; rings sag toward the hub between threads
float webGrid(float a, float b, float sag, float ma, float mb){
  float fa = fract(a);
  float da = (0.5 - abs(fa - 0.5)) * ma;
  float bb = b + sag * (1.0 - (2.0 * fa - 1.0) * (2.0 * fa - 1.0));
  float db = (0.5 - abs(fract(bb) - 0.5)) * mb;
  float aaA = fwidth(a) * ma * 0.9, aaB = fwidth(bb) * mb * 0.9;
  return max(lineM(da, 0.0013, aaA), lineM(db, 0.0011, aaB));
}
void suitMain(){
  vec3 p = vRest; float ax = abs(p.x);
  vec3 RED = vec3(0.440, 0.014, 0.020), BLUE = vec3(0.012, 0.036, 0.170), INK = vec3(0.010, 0.010, 0.014);
  stMetal = 0.0; stH = 0.0; stEmis = vec3(0.0);
  float redD = 1.0; float web = 0.0;
  bool isArm = ax > 0.215 && p.y > 1.30;
  if (p.y > 1.548 && !isArm) {
    // ---- HEAD + NECK: all red; web radiates from between the eyes
    redD = -1.0;
    vec3 hc = vec3(0.0, 1.662, 0.010); vec3 d = normalize(p - hc); vec3 d0 = normalize(vec3(0.0, 0.03, 1.0));
    float rho = acos(clamp(dot(d, d0), -1.0, 1.0));
    vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), d0)), e2 = cross(d0, e1);
    float phi = atan(dot(d, e2), dot(d, e1));
    float R = 0.10;
    web = webGrid(phi / (6.28318 / 16.0), rho / 0.235 - 0.30, -0.22 * smoothstep(0.2, 0.7, rho), (6.28318 / 16.0) * R * max(sin(rho), 0.12), 0.235 * R);
    web *= smoothstep(0.10, 0.16, rho);
  } else if (isArm) {
    float dy = p.y - 1.43, dz = p.z + 0.005; float th = atan(dz, dy); float r = length(vec2(dy, dz));
    float stripe = (abs(th) - 0.92) * 0.045;
    float gloveStart = 0.612 - 0.030 * cos(th);
    redD = min(stripe, gloveStart - ax);
    if (ax > 0.735) { web = webGrid((p.z + 0.005) / 0.0152 + 0.5, 16.7045 + (ax - 0.735) / 0.032, 0.28, 0.0152, 0.032) * step(0.0, dy + 0.004); redD = -1.0; }
    else web = webGrid(th / (6.28318 / 12.0) + 0.5, ax / 0.044, 0.28, (6.28318 / 12.0) * max(r, 0.02), 0.044);
  } else if (p.y < 0.90) {
    float lx = ax - 0.10, lz = p.z + 0.005; float th = atan(lx, lz); float r = length(vec2(lx, lz));
    float bootTop = 0.335 + 0.085 * (1.0 - abs(th) / 3.14159);
    redD = p.y - bootTop;
    if (p.y < 0.10) web = webGrid((ax - 0.10) / 0.021 + 0.5, p.z / 0.036, 0.22, 0.021, 0.036);
    else web = webGrid(th / (6.28318 / 12.0) + 0.5, p.y / 0.046, -0.28, (6.28318 / 12.0) * max(r, 0.02), 0.046);
  } else {
    // ---- TORSO
    float w = mix(0.066, 0.215, smoothstep(1.03, 1.40, p.y));
    float front = ax - w;
    float yoke = (1.392 - 0.018 * cos(ax * 22.0)) - p.y;
    redD = p.z > 0.0 ? min(front, yoke) : yoke; if (p.y < 0.984) redD = 1.0;
    float belt = max(p.y - 1.030, 0.984 - p.y);
    redD = min(redD, belt);
    float s = ax / max(w, 0.05);
    web = webGrid(s * 3.0 + 0.5, (1.50 - p.y) / 0.047, 0.30, max(w, 0.05) / 3.0, 0.047);
    if (belt < 0.0) web = webGrid(atan(p.x, p.z) / (6.28318 / 18.0), p.y / 0.05, 0.0, 0.04, 0.05);
  }
  bool red = redD < 0.0;
  vec3 base = red ? RED : BLUE;
  float aa = fwidth(redD) * 1.2;
  float piping = lineM(abs(redD), 0.0017, aa);
  web *= red ? smoothstep(0.0005, 0.0030, -redD) : 0.0;
  // fabric micro-weave (fades with distance)
  vec2 wuv = vec2(p.x + p.z * 0.7, p.y + p.z * 0.3) * 760.0; float wf = max(fwidth(wuv.x), fwidth(wuv.y));
  float weave = (sin(wuv.x) * sin(wuv.y)) * (1.0 - smoothstep(0.6, 2.2, wf));
  float hex = red ? weave : (sin(wuv.y * 1.6) * 0.6) * (1.0 - smoothstep(0.6, 2.2, wf));
  stAlbedo = base * (1.0 + hex * 0.10);
  stRough = (red ? 0.50 : 0.58) - hex * 0.05;
  stH = hex * 0.00006;
  stAlbedo = mix(stAlbedo, INK, max(web, piping)); stRough = mix(stRough, 0.34, max(web, piping)); stH += web * 0.00075 + piping * 0.0004;

  // ---- emblems
  if (p.y > 1.18 && p.y < 1.48 && ax < 0.13) {
    if (p.z > 0.04) { float d = spiderSDF((p.xy - vec2(0.0, 1.338)) / 0.92, 1.0) * 0.92; float m = 1.0 - smoothstep(-0.0008, 0.0008, d);
      stAlbedo = mix(stAlbedo, INK, m); stRough = mix(stRough, 0.30, m); stH = mix(stH, 0.0009, m); }
    else if (p.z < -0.04) { float d = spiderSDF((p.xy - vec2(0.0, 1.300)) / 2.05, 1.55) * 2.05; float m = 1.0 - smoothstep(-0.0010, 0.0010, d);
      stAlbedo = mix(stAlbedo, RED * 1.05, m); stRough = mix(stRough, 0.42, m); stH = mix(stH, 0.0008, m);
      float o = lineM(abs(d - 0.0012), 0.0012, fwidth(d)); stAlbedo = mix(stAlbedo, INK, o * (1.0 - m)); }
  }
  // ---- lenses
  if (p.y > 1.60 && p.z > 0.03) {
    vec2 e = vec2(ax - 0.0445, p.y - 1.6735); float ca = cos(0.50), sa = sin(0.50);
    e = vec2(ca * e.x + sa * e.y, -sa * e.x + ca * e.y);
    float a = 0.0405, h1 = 0.0135, h2 = 0.0250; float r1 = (a * a + h1 * h1) / (2.0 * h1), r2 = (a * a + h2 * h2) / (2.0 * h2);
    float d = max(length(e - vec2(0.0, h1 - r1)) - r1, length(e - vec2(0.0, r2 - h2)) - r2);
    float aaL = fwidth(d);
    float frame = 1.0 - smoothstep(0.0058 - aaL, 0.0058 + aaL, d);
    float lens = 1.0 - smoothstep(-0.0040 - aaL, -0.0040 + aaL, d);
    stAlbedo = mix(stAlbedo, INK, frame); stRough = mix(stRough, 0.30, frame); stH = mix(stH, 0.0016, frame);
    vec2 hx = e * 900.0; float mesh = 0.5 + 0.5 * sin(hx.x) * sin(hx.y * 1.15 + hx.x * 0.5);
    vec3 lc = vec3(0.86, 0.90, 0.93) * (0.88 + 0.12 * mesh * (1.0 - smoothstep(0.5, 2.0, fwidth(hx.x))));
    stAlbedo = mix(stAlbedo, lc, lens); stRough = mix(stRough, 0.16, lens); stH = mix(stH, 0.0011 + 0.0006 * smoothstep(-0.004, -0.02, d), lens);
    stEmis = lc * lens * 0.10;
  }
}
`;

GLSL.suitThug = /* glsl */`
uniform vec3 uColA, uColB, uColC; uniform float uKind;
void suitMain(){
  vec3 p = vRest; float ax = abs(p.x);
  stMetal = 0.0; stH = 0.0; stEmis = vec3(0.0);
  vec2 fuv = vec2(p.x + p.z, p.y) * 260.0; float ff = max(fwidth(fuv.x), fwidth(fuv.y)); float fab = sin(fuv.x) * sin(fuv.y) * (1.0 - smoothstep(0.5, 2.0, ff));
  float n = vnoise(p.xy * 18.0 + p.z * 11.0), n2 = vnoise(p.xy * 70.0 + p.z * 50.0);
  bool isArm = ax > 0.215 && p.y > 1.30;
  if (p.y > 1.535 && !isArm) {                                  // head
    vec3 skin = vec3(0.30, 0.17, 0.11);
    if (uKind < 0.5) {                                          // hood + bone-white mask with slit eyes and a red slash
      bool face = p.z > 0.045 && p.y < 1.745 && ax < 0.078;
      stAlbedo = uColA * 0.85 * (0.85 + 0.3 * n); stRough = 0.85;
      if (face) { stAlbedo = vec3(0.78, 0.76, 0.70) * (0.9 + 0.1 * n2); stRough = 0.35; stH = 0.002;
        vec2 e = vec2(ax - 0.034, p.y - 1.678); float eye = 1.0 - smoothstep(0.0, 0.002, sdSeg2(e, vec2(-0.016, -0.004), vec2(0.018, 0.006)) - 0.0065);
        stAlbedo = mix(stAlbedo, vec3(0.01), eye);
        float slash = 1.0 - smoothstep(0.0, 0.002, abs((p.x - 0.01) * 0.9 + (p.y - 1.66) * 0.35) - 0.007); stAlbedo = mix(stAlbedo, uColC, slash * step(p.y, 1.735) * (1.0 - eye));
        float mouth = 1.0 - smoothstep(0.0, 0.0015, abs(p.y - 1.612) - 0.0012); stAlbedo = mix(stAlbedo, vec3(0.02), mouth * step(ax, 0.03)); }
    } else if (uKind < 1.5) {                                   // tactical: helmet, amber goggles, balaclava
      stAlbedo = vec3(0.035, 0.04, 0.045); stRough = 0.75;
      if (p.y > 1.70) { stAlbedo = uColA * 0.5; stRough = 0.45; stH = 0.003; }
      float gog = 1.0 - smoothstep(0.0, 0.002, max(abs(p.y - 1.678) - 0.017, 0.035 - p.z));
      stAlbedo = mix(stAlbedo, vec3(0.9, 0.45, 0.05), gog); stRough = mix(stRough, 0.12, gog); stEmis = vec3(1.0, 0.45, 0.05) * gog * 0.35;
    } else {                                                    // brute: welded steel mask, red eye slits
      stAlbedo = vec3(0.30, 0.31, 0.33) * (0.7 + 0.5 * n); stRough = 0.42; stMetal = 0.8;
      vec2 e = vec2(ax - 0.036, p.y - 1.676); float eye = (1.0 - smoothstep(0.0, 0.002, sdSeg2(e, vec2(-0.014, 0.003), vec2(0.016, -0.004)) - 0.005)) * step(0.04, p.z);
      stAlbedo = mix(stAlbedo, vec3(0.02), eye); stEmis = vec3(1.0, 0.08, 0.04) * eye * 2.5; stMetal *= 1.0 - eye;
      float rivet = 1.0 - smoothstep(0.003, 0.004, length(fract(p.xy * 28.0) - 0.5) * 0.035); stH = rivet * 0.0008;
    }
    return;
  }
  if (p.y > 1.47 && !isArm && uKind < 1.5 && p.y < 1.535) { stAlbedo = uKind < 0.5 ? uColA * 0.8 : vec3(0.04); stRough = 0.85; return; }
  if (ax > 0.735) { stAlbedo = vec3(0.03, 0.03, 0.035) * (0.8 + 0.4 * n2); stRough = 0.6; return; }          // gloves
  if (p.y < 0.155) { stAlbedo = vec3(0.025, 0.022, 0.02) * (0.8 + 0.5 * n2); stRough = 0.5; stH = step(p.y, 0.03) * -0.001; return; }   // boots
  if (p.y < 0.955 && !isArm) {                                  // trousers
    stAlbedo = uColB * (0.80 + 0.30 * n) * (1.0 + fab * 0.12); stRough = 0.88;
    float seam = 1.0 - smoothstep(0.0, 0.0025, abs(ax - 0.165 + (0.9 - p.y) * 0.07)); stAlbedo *= 1.0 - seam * 0.35;
    float knee = 1.0 - smoothstep(0.045, 0.06, length(vec2((ax - 0.10) * 1.0, (p.y - 0.50) * 0.8))); if (p.z > 0.0) stAlbedo = mix(stAlbedo, stAlbedo * 0.6, knee * step(0.5, uKind));
    stH = fab * 0.00008; return;
  }
  // jacket / hoodie / plate carrier
  stAlbedo = uColA * (0.78 + 0.34 * n) * (1.0 + fab * 0.10); stRough = 0.82; stH = fab * 0.0001;
  float zip = 1.0 - smoothstep(0.0, 0.002, abs(p.x) - 0.0035); if (p.z > 0.0 && p.y < 1.45 && !isArm) { stAlbedo = mix(stAlbedo, vec3(0.45), zip * 0.8); stMetal = zip * 0.7; }
  float hem = 1.0 - smoothstep(0.0, 0.004, abs(p.y - 0.975) - 0.012); if (!isArm) stAlbedo *= 1.0 - hem * 0.3;
  float cuff = 1.0 - smoothstep(0.0, 0.004, abs(ax - 0.70) - 0.014); stAlbedo *= 1.0 - cuff * 0.35;
  if (uKind > 0.5 && !isArm && p.y > 1.06 && p.y < 1.43 && ax < 0.16) {     // vest / armour plates
    vec3 plate = uKind > 1.5 ? vec3(0.24, 0.25, 0.27) : vec3(0.05, 0.055, 0.05);
    float cells = 1.0 - smoothstep(0.0, 0.004, min(abs(fract(p.y * 12.0) - 0.5), abs(fract(ax * 14.0) - 0.5)) * 0.07);
    stAlbedo = plate * (0.8 + 0.4 * n) * (1.0 - cells * 0.4); stRough = uKind > 1.5 ? 0.4 : 0.7; stMetal = uKind > 1.5 ? 0.75 : 0.0; stH = -cells * 0.0012;
    float mark = 1.0 - smoothstep(0.0, 0.002, abs(length(vec2(p.x, p.y - 1.30)) - 0.035) - 0.006); if (p.z > 0.0) stAlbedo = mix(stAlbedo, uColC, mark * 0.9);
  }
  if (uKind > 1.5 && isArm && ax < 0.33) { stAlbedo = vec3(0.24, 0.25, 0.27) * (0.8 + 0.4 * n); stMetal = 0.75; stRough = 0.4; }   // pauldrons
}
`;

Suit.inject = function (m, body, extraUniforms) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = Suit.uRim;
    if (extraUniforms) for (const k in extraUniforms) sh.uniforms[k] = extraUniforms[k];
    sh.vertexShader = sh.vertexShader.replace(/void\s+main\s*\(\s*\)\s*\{/, 'varying vec3 vRest;\nvoid main() {\n vRest = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace(/void\s+main\s*\(\s*\)\s*\{/, 'uniform vec3 uRim;\n' + GLSL.noise + GLSL.suitCommon + body + '\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\n suitMain(); diffuseColor.rgb = stAlbedo;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(stRough, 0.05, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = stMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = bumpN(-vViewPosition, normal, stH);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n { float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0); totalEmissiveRadiance += stEmis + stAlbedo * uRim * rimF; }');
  };
  return MAT(m);
};
Suit.uRim = { value: new V3(0.5, 0.45, 0.4) };

Suit.heroMaterial = function () {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, sheen: 0.30, sheenRoughness: 0.5, sheenColor: new C3(0.8, 0.5, 0.45), envMapIntensity: 0.8 });
  m.userData.tag = 'hero';
  return Suit.inject(m, GLSL.suitHero);
};
Suit.thugMaterial = function (kind, colA, colB, colC) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, envMapIntensity: 0.55 });
  m.userData.tag = 'thug';
  const un = { uColA: { value: new C3().setHex(colA) }, uColB: { value: new C3().setHex(colB) }, uColC: { value: new C3().setHex(colC) }, uKind: { value: kind } };
  m.userData.un = null; Suit.inject(m, GLSL.suitThug, un); m._un = un;
  return m;
};
Suit.applyTod = function (T) { Suit.uRim.value.set(T.hemiSky[0] * 0.35 + T.sunCol[0] * 0.25, T.hemiSky[1] * 0.35 + T.sunCol[1] * 0.25, T.hemiSky[2] * 0.35 + T.sunCol[2] * 0.25).multiplyScalar(T.hemiInt * 0.28); };


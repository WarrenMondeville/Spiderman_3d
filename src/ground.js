'use strict';
/* ==== p07_ground.js ==== */
/* p07: streets, sidewalks, park lawn, esplanade and the river. Road paint is drawn analytically from world position. */

const Ground = { mat: null, water: null };

Ground.glsl = function () {
  const f = n => Number(n).toFixed(3), P = CITY.PARK;
  return /* glsl */`
uniform float uTime, uLamps;
varying vec3 vWPos; varying vec3 vWNrm;
vec3 gdAlbedo; float gdRough; float gdMetal; float gdAO; vec3 gdNrm; vec3 gdEmis;
const float GX0 = ${f(CITY.X0)}, GZ0 = ${f(CITY.Z0)}, GW = ${f(CITY.W)}, GD = ${f(CITY.D)}, PX = ${f(CITY.PX)}, PZ = ${f(CITY.PZ)}, AVE = ${f(CITY.AVE)}, ST = ${f(CITY.ST)}, BX = ${f(CITY.BX)}, BZ = ${f(CITY.BZ)};
const vec4 PARK = vec4(${f(P.x0)}, ${f(P.z0)}, ${f(P.x1)}, ${f(P.z1)});
float gaa(float e, float x){ float w = fwidth(x) * 0.8 + 1e-5; return smoothstep(e - w, e + w, x); }
float band(float x, float c, float hw){ return gaa(c - hw, x) * (1.0 - gaa(c + hw, x)); }
float dashes(float t, float period, float duty){ return 1.0 - gaa(duty, fract(t / period)); }
void groundMain(){
  vec2 P = vWPos.xz; float dist = length(vWPos - cameraPosition);
  float detail = 1.0 - smoothstep(40.0, 160.0, dist);
  gdMetal = 0.0; gdAO = 1.0; gdNrm = vec3(0.0); gdEmis = vec3(0.0);
  float gx = P.x - GX0, gz = P.y - GZ0;
  bool inGrid = gx > 0.0 && gx < GW && gz > 0.0 && gz < GD;
  float lx = mod(gx, PX), lz = mod(gz, PZ);
  bool ave = lx < AVE, st = lz < ST;
  bool park = P.x > PARK.x && P.x < PARK.z && P.y > PARK.y && P.y < PARK.w;
  bool raised = vWPos.y > 0.08;
  float n1 = fbm3(P * 0.85), n2 = vnoise(P * 8.0), n3 = vnoise(P * 0.06 + 3.0);

  if (raised && park) {                                  // ---- PARK LAWN + PATHS
    vec2 q = (P - PARK.xy) / (PARK.zw - PARK.xy);
    float g1 = fbm(P * 0.35), g2 = vnoise(P * 3.1);
    vec3 grass = mix(vec3(0.060, 0.115, 0.030), vec3(0.150, 0.215, 0.055), g1); grass *= 0.75 + 0.5 * g2;
    grass = mix(grass, vec3(0.20, 0.17, 0.07), smoothstep(0.62, 0.85, fbm3(P * 0.05 + 11.0)) * 0.55);      // dry patches
    // winding paths: warped distance to a few meandering lines
    vec2 w = P + vec2(fbm3(P * 0.021) - 0.5, fbm3(P * 0.021 + 5.0) - 0.5) * 46.0;
    float d1 = abs(fract(w.x / 118.0 + 0.25) - 0.5) * 118.0, d2 = abs(fract(w.y / 96.0 + 0.1) - 0.5) * 96.0;
    float dd = min(d1, d2);
    float path = 1.0 - smoothstep(2.1, 2.9, dd);
    float rim = min(min(P.x - PARK.x, PARK.z - P.x), min(P.y - PARK.y, PARK.w - P.y));
    path = max(path, 1.0 - smoothstep(5.0, 5.8, rim));                                                  // perimeter walk
    vec3 pc = vec3(0.34, 0.30, 0.25) * (0.8 + 0.4 * n2) * (0.85 + 0.3 * n1);
    gdAlbedo = mix(grass, pc, path); gdRough = mix(0.95, 0.82, path);
    gdNrm = vec3(vnoise(P * 5.0) - 0.5, 0.0, vnoise(P * 5.0 + 9.0) - 0.5) * 0.5 * (1.0 - path) * detail;
    return;
  }
  if (raised || !inGrid || !(ave || st)) {               // ---- SIDEWALK / PLAZA PAVING
    float bx = lx - AVE, bz = lz - ST;
    float edge = inGrid ? min(min(bx, BX - bx), min(bz, BZ - bz)) : 9.0;
    vec2 pv = P / 1.52; vec2 pf = abs(fract(pv) - 0.5); float joint = 1.0 - smoothstep(0.0, 0.018 + fwidth(pv.x), 0.5 - max(pf.x, pf.y));
    float slab = hash12(floor(pv));
    vec3 c = vec3(0.33, 0.32, 0.30) * (0.86 + 0.22 * slab) * (0.8 + 0.35 * n1);
    c *= 1.0 - joint * 0.45 * detail;
    c *= 1.0 - smoothstep(0.55, 0.8, fbm3(P * 0.4 + 2.0)) * 0.35;                                       // gum / grime
    float curb = 1.0 - gaa(0.34, edge); c = mix(c, vec3(0.42, 0.41, 0.40) * (0.9 + 0.2 * n2), curb);
    // tree pits (positions mirrored by the street-tree placer)
    float tz = min(abs(bz - 1.9), abs(bz - (BZ - 1.9))), tx = abs(mod(bx - 9.0 + 5.5, 11.0) - 5.5);
    float pit = (1.0 - gaa(0.72, tz)) * (1.0 - gaa(0.72, tx)) * step(8.0, bx) * step(bx, BX - 8.0);
    if (inGrid) c = mix(c, vec3(0.07, 0.05, 0.035), pit);
    if (!inGrid) { c = vec3(0.37, 0.35, 0.33) * (0.82 + 0.25 * slab) * (0.85 + 0.3 * n1); c *= 1.0 - joint * 0.4 * detail; }
    gdAlbedo = c; gdRough = 0.88 - 0.1 * slab; gdNrm = vec3(0.0); return;
  }
  // ---- ASPHALT
  vec3 a = mix(vec3(0.095, 0.094, 0.095), vec3(0.175, 0.170, 0.165), n1) * (0.82 + 0.36 * n2) * (0.78 + 0.44 * n3);
  float patchN = hash12(floor(P / vec2(7.0, 11.0))); vec2 pf2 = fract(P / vec2(7.0, 11.0));
  float patchM = step(0.86, patchN) * step(0.15, pf2.x) * step(pf2.x, 0.85) * step(0.1, pf2.y) * step(pf2.y, 0.8);
  a = mix(a, a * 0.62 + 0.004, patchM * 0.8);
  float crack = detail > 0.01 ? smoothstep(0.014, 0.0, abs(fbm3(P * 0.9 + 20.0) - 0.5)) * detail : 0.0; a *= 1.0 - crack * 0.22;
  float rough = 0.78 - patchM * 0.12;
  float paint = 0.0; vec3 paintC = vec3(0.72, 0.72, 0.70);
  bool inter = ave && st;
  if (!inter) {
    float wear = smoothstep(0.30, 0.62, vnoise(P * 1.7 + 40.0) * 0.6 + n2 * 0.4);
    if (ave) {
      float c = lx - AVE * 0.5; float along = lz - ST, run = PZ - ST;      // along: 0..BZ beside the block
      float body = step(9.5, along) * step(along, run - 9.5);
      float yel = (band(abs(c), 0.16, 0.06)) * body;
      float dash = band(abs(c), 3.55, 0.07) * dashes(along, 9.0, 0.36) * body;
      float park2 = band(abs(c), 7.2, 0.05) * body;
      float zeb = (band(along, 2.6, 1.6) + band(along, run - 2.6, 1.6)) * step(0.5, fract(lx / 1.25)) * step(0.4, lx) * step(lx, AVE - 0.4);
      float stop = band(along, 5.6, 0.25) * step(c, -0.2) + band(along, run - 5.6, 0.25) * step(0.2, c);
      // wheel tracks
      float tr = 1.0 - smoothstep(0.0, 0.5, abs(abs(abs(c) - 3.55) - 1.7) - 0.75); a *= 1.0 - tr * 0.22; rough -= tr * 0.18;
      paint = max(max(dash, park2), max(zeb, stop)); if (yel > 0.01) { paint = max(paint, yel); paintC = mix(paintC, vec3(0.78, 0.55, 0.08), step(paint - 0.001, yel)); }
      paint *= 0.55 + 0.45 * wear;
    } else {
      float c = lz - ST * 0.5; float along = lx - AVE, run = PX - AVE;
      float body = step(9.5, along) * step(along, run - 9.5);
      float yel = band(abs(c), 0.0, 0.07) * dashes(along, 9.0, 0.5) * body;
      float park2 = band(abs(c), 3.6, 0.05) * body;
      float zeb = (band(along, 2.6, 1.6) + band(along, run - 2.6, 1.6)) * step(0.5, fract(lz / 1.25)) * step(0.4, lz) * step(lz, ST - 0.4);
      float stop = band(along, 5.6, 0.25) * step(0.2, c) + band(along, run - 5.6, 0.25) * step(c, -0.2);
      float tr = 1.0 - smoothstep(0.0, 0.5, abs(abs(abs(c) - 1.8) - 0.85) - 0.3); a *= 1.0 - tr * 0.2; rough -= tr * 0.16;
      paint = max(park2, max(zeb, stop)); if (yel > 0.01) { paint = max(paint, yel); paintC = mix(paintC, vec3(0.78, 0.55, 0.08), step(paint - 0.001, yel)); }
      paint *= 0.55 + 0.45 * wear;
    }
  }
  // manholes
  vec2 mc = floor(P / 23.0); vec2 mo = (hash22(mc) * 0.6 + 0.2) * 23.0; float md = length(P - (mc * 23.0 + mo));
  float mh = (1.0 - gaa(0.46, md)); float ring = band(md, 0.40, 0.035);
  a = mix(a, vec3(0.05, 0.045, 0.04) * (0.8 + 0.6 * step(0.5, fract((P.x + P.y) * 6.0))), mh); a = mix(a, vec3(0.10), ring * mh);
  gdAlbedo = mix(a, paintC * (0.8 + 0.2 * n2), paint * (1.0 - mh));
  gdRough = mix(rough, 0.55, paint) - mh * 0.25; gdMetal = mh * 0.6;
  gdNrm = vec3(vnoise(P * 14.0) - 0.5, 0.0, vnoise(P * 14.0 + 7.0) - 0.5) * 0.22 * detail;
}
`;
};

Ground.makeMaterial = function () {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, envMapIntensity: 0.5 });
  m.userData.tag = 'ground';
  m.onBeforeCompile = (sh) => {
    const Qy = GFX.QUAL[SM.quality];
    for (const k of ['uTime', 'uLamps', 'uHeightMap', 'uHMInfo', 'uSunDirW', 'uShadowFocus']) sh.uniforms[k] = GFX.uni[k];
    sh.vertexShader = sh.vertexShader
      .replace(/void\s+main\s*\(\s*\)\s*\{/, 'varying vec3 vWPos; varying vec3 vWNrm;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace(/void\s+main\s*\(\s*\)\s*\{/, '#define FAR_STEPS ' + Qy.farSteps + '\n' + GLSL.noise + GLSL.farShadow + Ground.glsl() + '\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\n groundMain(); if (abs(vWNrm.y) < 0.5) { gdAlbedo = vec3(0.30, 0.29, 0.28) * (0.8 + 0.3 * vnoise(vWPos.xz * 2.0 + vWPos.y * 3.0)); gdRough = 0.85; gdMetal = 0.0; gdNrm = vec3(0.0); }\n diffuseColor.rgb = gdAlbedo;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(gdRough, 0.08, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = gdMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(normal + (viewMatrix * vec4(gdNrm, 0.0)).xyz);')
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
        { vec3 fsN = normalize(vWNrm); float fsW = smoothstep(uShadowFocus.w * 0.72, uShadowFocus.w * 0.94, max(abs(vWPos.x - uShadowFocus.x), abs(vWPos.z - uShadowFocus.z)));
          float fsh = 1.0; if (fsW > 0.001 && dot(fsN, uSunDirW) > 0.0) fsh = mix(1.0, farShadow(vWPos, fsN), fsW);
          reflectedLight.directDiffuse *= fsh; reflectedLight.directSpecular *= fsh; }`)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n { float cao = canyonAO(vWPos, normalize(vWNrm)) * gdAO; reflectedLight.indirectDiffuse *= cao; reflectedLight.indirectSpecular *= cao * cao; }');
  };
  return MAT(m);
};

Ground.build = function () {
  const mat = Ground.mat = Ground.makeMaterial();
  const M = CITY.MARGIN, x0 = CITY.X0 - M, x1 = -CITY.X0 + M, z0 = CITY.Z0 - M, z1 = -CITY.Z0 + M;
  const G = new GeoB(), white = new C3(1, 1, 1), fa = [0, 0, 1, 1], ex = [1, 0, 0, 0];
  // road bed
  G.flat(x0, x1, z0, z1, 0, white, fa, ex);
  // kerbed slabs: one per block, the whole park, and the esplanade ring
  const SH = 0.16;
  for (const b of CITY.blocks) { if (b.park) continue; G.box(b.x0, b.x1, 0, SH, b.z0, b.z1, white, fa, ex); World.add({ x0: b.x0, x1: b.x1, y0: -1, y1: SH, z0: b.z0, z1: b.z1, kind: 2 }); }
  const P = CITY.PARK; G.box(P.x0, P.x1, 0, SH, P.z0, P.z1, white, fa, ex); World.add({ x0: P.x0, x1: P.x1, y0: -1, y1: SH, z0: P.z0, z1: P.z1, kind: 2 });
  const ring = [[x0, x1, z0, CITY.Z0], [x0, x1, -CITY.Z0, z1], [x0, CITY.X0, CITY.Z0, -CITY.Z0], [-CITY.X0, x1, CITY.Z0, -CITY.Z0]];
  for (const r of ring) { G.box(r[0], r[1], 0, SH, r[2], r[3], white, fa, ex); World.add({ x0: r[0], x1: r[1], y0: -1, y1: SH, z0: r[2], z1: r[3], kind: 2 }); }
  // sea wall
  G.ring(x0, x1, z0, z1, -6, 0.0, white, fa, () => ex);
  const mesh = new THREE.Mesh(G.build(), mat); mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'ground'; mesh.matrixAutoUpdate = false;
  GFX.scene.add(mesh); Ground.mesh = mesh;

  // river
  const wu = Object.assign({ uTime: GFX.uni.uTime, uWaterCol: { value: new V3(0.05, 0.1, 0.14) } }, Sky.uniforms, THREE.UniformsUtils.clone(THREE.UniformsLib.fog));
  const wm = Ground.waterMat = new THREE.ShaderMaterial({
    uniforms: wu, fog: true, toneMapped: false,
    vertexShader: 'varying vec3 vWP;\n#include <fog_pars_vertex>\nvoid main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}',
    fragmentShader: GLSL.noise + GLSL.sky + /* glsl */`
      uniform float uTime; uniform vec3 uWaterCol; varying vec3 vWP;
      #include <fog_pars_fragment>
      void main(){
        vec3 V = normalize(vWP - cameraPosition); vec2 p = vWP.xz; float t = uTime;
        vec2 g = vec2(0.0);
        g += vec2(0.80, 0.60) * 0.050 * cos(dot(vec2(0.80, 0.60), p) * 0.35 + t * 0.9);
        g += vec2(-0.45, 0.89) * 0.040 * cos(dot(vec2(-0.45, 0.89), p) * 0.62 + t * 1.2);
        g += vec2(0.98, -0.20) * 0.030 * cos(dot(vec2(0.98, -0.20), p) * 1.35 + t * 1.7);
        g += vec2(0.30, -0.95) * 0.022 * cos(dot(vec2(0.30, -0.95), p) * 2.60 + t * 2.3);
        g += (vec2(vnoise(p * 0.9 + t * 0.35), vnoise(p * 0.9 + 31.0 - t * 0.3)) - 0.5) * 0.16;
        g += (vec2(vnoise(p * 3.1 - t * 0.6), vnoise(p * 3.1 + 17.0 + t * 0.5)) - 0.5) * 0.09;
        float dist = length(vWP - cameraPosition);
        g *= 1.0 - smoothstep(150.0, 2200.0, dist) * 0.8;
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 R = reflect(V, N); R.y = abs(R.y) + 0.02; R = normalize(R);
        float fres = 0.025 + 0.975 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        vec3 col = mix(uWaterCol, skyBase(R) * 0.92, fres);
        float sd = max(dot(R, uSkySun), 0.0);
        col += uSkySunCol * (pow(sd, 420.0) * 9.0 + pow(sd, 28.0) * 0.45);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  const wg = new THREE.PlaneGeometry(80000, 80000, 1, 1); wg.rotateX(-PI / 2);
  const water = Ground.water = new THREE.Mesh(wg, wm); water.position.y = -2.6; water.name = 'water'; GFX.scene.add(water);
  // pond in the park
  const pg = new THREE.CircleGeometry(1, 40); pg.rotateX(-PI / 2);
  const pond = Ground.pond = new THREE.Mesh(pg, wm); pond.scale.set(62, 1, 38); pond.position.set((P.x0 + P.x1) / 2 + 30, SH + 0.03, (P.z0 + P.z1) / 2 + 40); GFX.scene.add(pond);
  Ground.pondRect = { x: pond.position.x, z: pond.position.z, rx: 62, rz: 38 };
};
Ground.applyTod = function (T) { Ground.waterMat.uniforms.uWaterCol.value.fromArray(T.water); };


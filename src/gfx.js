'use strict';
/* ==== p02_gfx.js ==== */
/* p02: renderer, time-of-day presets, global fog patch, shared GLSL, HDR post chain (bloom + filmic composite). */

const TODS = [
  { name: 'GOLDEN HOUR', sunAz: 258 * DEG, sunEl: 17 * DEG, sunCol: [1.0, 0.64, 0.36], sunInt: 5.2,
    hemiSky: [0.78, 0.74, 0.78], hemiGnd: [0.54, 0.45, 0.38], hemiInt: 1.85,
    fogCol: [0.66, 0.58, 0.60], fogSun: [1.0, 0.64, 0.34], fogD: 0.00056, fogH: 0.0050,
    zen: [0.17, 0.27, 0.50], hor: [0.98, 0.66, 0.42], anti: [0.50, 0.44, 0.60], sunDisc: 60, cloudLit: [1.0, 0.72, 0.5], cloudDark: [0.34, 0.30, 0.42],
    exposure: 1.14, roomAmb: 0.10, lit: 0.28, lamps: 0.55, bloom: 0.62, envInt: 0.9, stars: 0, water: [0.05, 0.10, 0.14] },
  { name: 'NIGHT', sunAz: 140 * DEG, sunEl: 42 * DEG, sunCol: [0.55, 0.68, 1.0], sunInt: 0.85,
    hemiSky: [0.22, 0.29, 0.52], hemiGnd: [0.26, 0.20, 0.17], hemiInt: 2.3,
    fogCol: [0.045, 0.06, 0.12], fogSun: [0.10, 0.13, 0.22], fogD: 0.0011, fogH: 0.0035,
    zen: [0.006, 0.010, 0.030], hor: [0.10, 0.09, 0.16], anti: [0.03, 0.04, 0.09], sunDisc: 6, cloudLit: [0.20, 0.22, 0.32], cloudDark: [0.02, 0.025, 0.05],
    exposure: 1.35, roomAmb: 0.012, lit: 0.58, lamps: 1.0, bloom: 0.95, envInt: 0.7, stars: 1, water: [0.01, 0.02, 0.04] },
  { name: 'MIDDAY', sunAz: 160 * DEG, sunEl: 56 * DEG, sunCol: [1.0, 0.95, 0.86], sunInt: 6.6,
    hemiSky: [0.62, 0.78, 1.0], hemiGnd: [0.50, 0.46, 0.40], hemiInt: 1.9,
    fogCol: [0.66, 0.78, 0.94], fogSun: [0.95, 0.93, 0.88], fogD: 0.00075, fogH: 0.004,
    zen: [0.10, 0.30, 0.78], hor: [0.62, 0.78, 0.96], anti: [0.50, 0.68, 0.94], sunDisc: 45, cloudLit: [1.0, 1.0, 1.0], cloudDark: [0.55, 0.60, 0.70],
    exposure: 0.80, roomAmb: 0.16, lit: 0.05, lamps: 0.0, bloom: 0.34, envInt: 1.0, stars: 0, water: [0.03, 0.12, 0.19] },
];

const GLSL = {};
GLSL.noise = /* glsl */`
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash32(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + 17.7; a *= 0.5; } return s / 0.9375; }
float fbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = p * 2.03 + 17.7; a *= 0.5; } return s / 0.875; }
`;
/* city-scale sun shadows + canyon AO from a top-down building height map (1 texel = 1 m, R8 * 510 m) */
GLSL.farShadow = /* glsl */`
uniform sampler2D uHeightMap; uniform vec4 uHMInfo; uniform vec3 uSunDirW; uniform vec4 uShadowFocus;
float hmH(vec2 xz){ return texture2D(uHeightMap, (xz - uHMInfo.xy) * uHMInfo.zw).r * 510.0; }
float farShadow(vec3 P, vec3 N){
  vec3 p = P + N * 1.6 + vec3(0.0, 0.35, 0.0);
  float sh = 1.0, t = 2.5;
  vec3 L = uSunDirW;
  for (int i = 0; i < FAR_STEPS; i++){
    vec3 q = p + L * t;
    float d = hmH(q.xz) - q.y;
    sh = min(sh, 1.0 - clamp(d / (0.045 * t + 0.8), 0.0, 1.0));
    if (sh < 0.03) break;
    t += 5.0 + t * 0.085;
  }
  return sh;
}
float canyonAO(vec3 P, vec3 N){
  vec3 p = P + N * 1.2; float o = 0.0;
  o += clamp((hmH(p.xz + vec2( 7.0, 0.0)) - p.y) * 0.035, 0.0, 1.0);
  o += clamp((hmH(p.xz + vec2(-7.0, 0.0)) - p.y) * 0.035, 0.0, 1.0);
  o += clamp((hmH(p.xz + vec2(0.0,  7.0)) - p.y) * 0.035, 0.0, 1.0);
  o += clamp((hmH(p.xz + vec2(0.0, -7.0)) - p.y) * 0.035, 0.0, 1.0);
  return 1.0 - o * 0.25 * 0.36;
}
`;

const GFX = {
  renderer: null, scene: null, camera: null, canvas: null,
  w: 1280, h: 720, pr: 1, scale: 1, maxPr: 1.5,
  uni: {
    uTime: { value: 0 }, uSunDirW: { value: new V3(0, 1, 0) }, uSunCol: { value: new V3(1, 1, 1) },
    uHeightMap: { value: null }, uHMInfo: { value: new THREE.Vector4(0, 0, 1, 1) }, uShadowFocus: { value: new THREE.Vector4(0, 0, 0, 100) },
    uLit: { value: 0.3 }, uLamps: { value: 0.5 }, uRoomAmb: { value: 0.1 }, uCamPosW: { value: new V3() }, uWind: { value: 0 },
  },
  todKey: 0, mats: new Set(),
  sun: null, hemi: null, drawCalls: 0, tris: 0,
};
SM.GFX = GFX;

/* every material goes through MAT() so a time-of-day switch can force a recompile (fog constants are baked into the chunk) */
function MAT(m) {
  const base = m.onBeforeCompile ? m.onBeforeCompile.toString() : '';
  const tag = (m.userData && m.userData.tag) || '';
  m.customProgramCacheKey = () => tag + '|' + base.length + '|' + base.slice(0, 96) + '|' + GFX.todKey + '|' + SM.quality;
  GFX.mats.add(m);
  return m;
}

GFX.sunDir = function (t) { const c = Math.cos(t.sunEl); return new V3(Math.sin(t.sunAz) * c, Math.sin(t.sunEl), Math.cos(t.sunAz) * c).normalize(); };

GFX.patchFog = function () {
  const T = TODS[SM.tod], s = GFX.sunDir(T), f = n => n.toFixed(5);
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth;\n varying vec3 vFogWDir;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z;\n vFogWDir = transpose( mat3( viewMatrix ) ) * mvPosition.xyz;\n#endif';
  C.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor;\n varying float vFogDepth;\n varying vec3 vFogWDir;\n #ifdef FOG_EXP2\n uniform float fogDensity;\n #else\n uniform float fogNear;\n uniform float fogFar;\n #endif\n#endif';
  C.fog_fragment = `#ifdef USE_FOG
  {
    float fogL = length( vFogWDir );
    vec3 fogDir = vFogWDir / max( fogL, 1e-4 );
    float fogK = ${f(T.fogH)} * fogDir.y;
    float fogT = abs( fogK ) > 1e-5 ? ( 1.0 - exp( - fogK * fogL ) ) / fogK : fogL;
    float fogTau = ${f(T.fogD)} * exp( - ${f(T.fogH)} * max( cameraPosition.y, 0.0 ) ) * fogT;
    float fogFactor = 1.0 - exp( - fogTau * ( 1.0 + fogTau * 0.35 ) );
    float fogSunAmt = pow( max( dot( fogDir, vec3( ${f(s.x)}, ${f(s.y)}, ${f(s.z)} ) ), 0.0 ), 3.0 );
    vec3 fogC = mix( fogColor, vec3( ${f(T.fogSun[0])}, ${f(T.fogSun[1])}, ${f(T.fogSun[2])} ), fogSunAmt * 0.9 );
    fogC = mix( fogC, fogC * vec3( 0.80, 0.90, 1.12 ), clamp( fogDir.y * 2.5 + 0.1, 0.0, 1.0 ) * 0.5 );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, clamp( fogFactor, 0.0, 1.0 ) );
  }
#endif`;
};

GFX.init = function () {
  const canvas = GFX.canvas = document.getElementById('cv');
  const r = GFX.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: SM.SHOT, stencil: false, depth: false });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NoToneMapping;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.info.autoReset = false;
  r.debug.checkShaderErrors = true;
  GFX.scene = new THREE.Scene();
  GFX.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.15, 40000);
  GFX.camera.position.set(0, 120, 200);
  GFX.scene.add(GFX.camera);

  const q = SM.Q.has('q') ? parseInt(SM.Q.get('q'), 10) : 1; SM.quality = U.clamp(q | 0, 0, 2);
  SM.tod = SM.Q.has('tod') ? U.clamp(parseInt(SM.Q.get('tod'), 10) | 0, 0, 2) : 0;
  GFX.patchFog();

  // lights
  const sun = GFX.sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.06; sun.shadow.radius = 2.2;
  GFX.scene.add(sun); GFX.scene.add(sun.target);
  const hemi = GFX.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  GFX.scene.add(hemi);
  GFX.scene.fog = new THREE.FogExp2(0x888888, 0.001);

  GFX.initPost();
  GFX.applyQuality(true);
  GFX.resize();
  window.addEventListener('resize', () => GFX.resize());
};

GFX.QUAL = [
  { maxPr: 1.0, shadow: 2048, samples: 0, farSteps: 12, range: 85, bloomLv: 4 },
  { maxPr: 1.5, shadow: 4096, samples: 4, farSteps: 22, range: 105, bloomLv: 5 },
  { maxPr: 2.0, shadow: 4096, samples: 4, farSteps: 30, range: 120, bloomLv: 6 },
];
GFX.applyQuality = function (first) {
  const Qy = GFX.QUAL[SM.quality];
  GFX.maxPr = Qy.maxPr; GFX.scale = 1;
  const sh = GFX.sun.shadow;
  if (sh.mapSize.x !== Qy.shadow) { sh.mapSize.set(Qy.shadow, Qy.shadow); if (sh.map) { sh.map.dispose(); sh.map = null; } }
  GFX.shadowRange = Qy.range;
  if (!first) { GFX.todKey++; for (const m of GFX.mats) m.needsUpdate = true; GFX.buildTargets(); }
};

GFX.applyTod = function (rebuildEnv) {
  const T = TODS[SM.tod], s = GFX.sunDir(T);
  GFX.uni.uSunDirW.value.copy(s);
  GFX.uni.uSunCol.value.set(T.sunCol[0], T.sunCol[1], T.sunCol[2]);
  GFX.uni.uLit.value = T.lit; GFX.uni.uLamps.value = T.lamps; GFX.uni.uRoomAmb.value = T.roomAmb;
  GFX.sun.color.setRGB(T.sunCol[0], T.sunCol[1], T.sunCol[2]); GFX.sun.intensity = T.sunInt;
  GFX.hemi.color.setRGB(T.hemiSky[0], T.hemiSky[1], T.hemiSky[2]); GFX.hemi.groundColor.setRGB(T.hemiGnd[0], T.hemiGnd[1], T.hemiGnd[2]); GFX.hemi.intensity = T.hemiInt;
  GFX.scene.fog.color.setRGB(T.fogCol[0], T.fogCol[1], T.fogCol[2]);
  GFX.post.comp.uniforms.uExposure.value = T.exposure;
  GFX.post.comp.uniforms.uBloom.value = T.bloom;
  if (typeof Sky !== 'undefined' && Sky.applyTod) Sky.applyTod(T, rebuildEnv);
  if (typeof City !== 'undefined' && City.applyTod) City.applyTod(T);
};
GFX.setTod = function (i) {
  SM.tod = ((i % TODS.length) + TODS.length) % TODS.length;
  GFX.patchFog(); GFX.todKey++;
  for (const m of GFX.mats) m.needsUpdate = true;
  GFX.scene.traverse(o => { const mm = o.material; if (!mm) return; (Array.isArray(mm) ? mm : [mm]).forEach(m => { if (!GFX.mats.has(m)) MAT(m); m.needsUpdate = true; }); });
  GFX.applyTod(true);
};

/* sun shadow camera follows a focus point, snapped to shadow texels so edges do not crawl */
GFX.updateSun = function (focus) {
  const T = TODS[SM.tod], s = GFX.uni.uSunDirW.value, sun = GFX.sun, R = GFX.shadowRange;
  const cam = sun.shadow.camera;
  if (cam.right !== R) { cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.near = 10; cam.far = 1500; cam.updateProjectionMatrix(); }
  // snap focus in light space
  _m1.lookAt(new V3(0, 0, 0), s.clone().negate(), UP); const inv = _m2.copy(_m1).invert();
  const texel = (2 * R) / sun.shadow.mapSize.x;
  _v1.copy(focus).applyMatrix4(inv); _v1.x = Math.round(_v1.x / texel) * texel; _v1.y = Math.round(_v1.y / texel) * texel; _v1.applyMatrix4(_m1);
  sun.target.position.copy(_v1); sun.position.copy(_v1).addScaledVector(s, 700);
  sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
  GFX.uni.uShadowFocus.value.set(_v1.x, _v1.y, _v1.z, R);
};

/* ---------- post chain ---------- */
GFX.initPost = function () {
  const P = GFX.post = {};
  P.scene = new THREE.Scene(); P.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  P.quad = new THREE.Mesh(g, null); P.quad.frustumCulled = false; P.scene.add(P.quad);
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const mk = (fs, uniforms, extra) => new THREE.ShaderMaterial(Object.assign({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false }, extra || {}));
  P.mk = mk;
  P.FS_PRE = `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh;
    vec3 samp(vec2 o){ vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb; c = min(c, vec3(60.0)); return c; }
    float kw(vec3 c){ return 1.0 / (1.0 + max(c.r, max(c.g, c.b))); }
    void main(){
      vec3 a = samp(vec2(-1.0,-1.0)), b = samp(vec2(1.0,-1.0)), c = samp(vec2(-1.0,1.0)), d = samp(vec2(1.0,1.0));
      float wa = kw(a), wb = kw(b), wc = kw(c), wd = kw(d);
      vec3 col = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
      float br = max(col.r, max(col.g, col.b));
      float knee = uThresh * 0.6; float soft = clamp(br - uThresh + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
      float contrib = max(soft, br - uThresh) / max(br, 1e-4);
      gl_FragColor = vec4(col * contrib, 1.0);
    }`;
  P.FS_DOWN = `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
    void main(){
      vec2 t = uTexel;
      vec3 A = texture2D(tSrc, vUv + t * vec2(-2.0,-2.0)).rgb, B = texture2D(tSrc, vUv + t * vec2(0.0,-2.0)).rgb, C = texture2D(tSrc, vUv + t * vec2(2.0,-2.0)).rgb;
      vec3 D = texture2D(tSrc, vUv + t * vec2(-2.0,0.0)).rgb, E = texture2D(tSrc, vUv).rgb, F = texture2D(tSrc, vUv + t * vec2(2.0,0.0)).rgb;
      vec3 G = texture2D(tSrc, vUv + t * vec2(-2.0,2.0)).rgb, H = texture2D(tSrc, vUv + t * vec2(0.0,2.0)).rgb, I = texture2D(tSrc, vUv + t * vec2(2.0,2.0)).rgb;
      vec3 J = texture2D(tSrc, vUv + t * vec2(-1.0,-1.0)).rgb, K = texture2D(tSrc, vUv + t * vec2(1.0,-1.0)).rgb, L = texture2D(tSrc, vUv + t * vec2(-1.0,1.0)).rgb, M = texture2D(tSrc, vUv + t * vec2(1.0,1.0)).rgb;
      vec3 col = E * 0.125 + (A + C + G + I) * 0.03125 + (B + D + F + H) * 0.0625 + (J + K + L + M) * 0.125;
      gl_FragColor = vec4(col, 1.0);
    }`;
  P.FS_UP = `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uGain;
    void main(){
      vec2 t = uTexel * 1.0;
      vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
      c += (texture2D(tSrc, vUv + vec2(t.x, 0.0)).rgb + texture2D(tSrc, vUv - vec2(t.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, t.y)).rgb + texture2D(tSrc, vUv - vec2(0.0, t.y)).rgb) * 2.0;
      c += texture2D(tSrc, vUv + t).rgb + texture2D(tSrc, vUv - t).rgb + texture2D(tSrc, vUv + vec2(t.x, -t.y)).rgb + texture2D(tSrc, vUv + vec2(-t.x, t.y)).rgb;
      gl_FragColor = vec4(c / 16.0 * uGain, 1.0);
    }`;
  P.comp = mk(`varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tBloom; uniform vec2 uRes;
    uniform float uExposure, uBloom, uTime, uSpeed, uSlowmo, uHurt, uVig, uFade, uGrain, uSat, uContrast;
    uniform vec2 uBlurC;
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){
      const mat3 mi = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
      const mat3 mo = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
      c = mi * c; c = RRTAndODTFit(c); c = mo * c; return clamp(c, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 uv = vUv; vec2 d = uv - uBlurC; float r = length(d);
      vec3 col;
      float sp = uSpeed;
      if (sp > 0.002) {
        // radial speed blur, stronger toward the frame edge, jittered to hide banding
        float j = h12(gl_FragCoord.xy + uTime * 61.0);
        vec3 acc = vec3(0.0); float wsum = 0.0;
        float amt = sp * smoothstep(0.12, 0.85, r) * 0.085;
        for (int i = 0; i < 8; i++){ float k = (float(i) + j) / 8.0; float w = 1.0 - k * 0.6; acc += texture2D(tScene, uv - d * amt * k).rgb * w; wsum += w; }
        col = acc / wsum;
      } else col = texture2D(tScene, uv).rgb;
      // gentle chromatic fringe at the edges
      float ca = (0.0005 + sp * 0.0009 + uSlowmo * 0.002) * r * r * 4.0;
      col.r = mix(col.r, texture2D(tScene, uv - d * ca).r, 0.85);
      col.b = mix(col.b, texture2D(tScene, uv + d * ca).b, 0.85);
      vec3 bl = texture2D(tBloom, uv).rgb;
      col += bl * uBloom;
      col *= uExposure;
      col = aces(col * 1.12);
      // grade (display-referred): contrast, saturation, split tone
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat * (1.0 - uSlowmo * 0.45) * (1.0 - uHurt * 0.5));
      col = (col - 0.5) * uContrast + 0.5;
      col += vec3(0.004, 0.008, 0.020) * (1.0 - l) + vec3(0.020, 0.006, -0.016) * l;
      col = mix(col, col * vec3(0.78, 0.92, 1.18), uSlowmo * 0.55);
      col = mix(col, col * vec3(1.15, 0.72, 0.72), uHurt * 0.6);
      float vg = smoothstep(0.35, 1.05, r * 1.25); col *= 1.0 - vg * vg * uVig;
      col = toSRGB(clamp(col, 0.0, 1.0));
      col += (h12(gl_FragCoord.xy + fract(uTime) * 311.0) - 0.5) * uGrain;
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }`, {
    tScene: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uExposure: { value: 1 }, uBloom: { value: 0.6 }, uTime: { value: 0 },
    uSpeed: { value: 0 }, uSlowmo: { value: 0 }, uHurt: { value: 0 }, uVig: { value: 0.34 }, uFade: { value: 0 }, uGrain: { value: 0.022 }, uSat: { value: 1.13 }, uContrast: { value: 1.07 }, uBlurC: { value: new THREE.Vector2(0.5, 0.5) },
  });
  P.levels = [];
};

GFX.buildTargets = function () {
  const P = GFX.post, r = GFX.renderer, Qy = GFX.QUAL[SM.quality];
  const W = Math.max(8, Math.floor(GFX.w * GFX.pr * GFX.scale)), H = Math.max(8, Math.floor(GFX.h * GFX.pr * GFX.scale));
  if (P.rtScene) P.rtScene.dispose();
  P.rtScene = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: Qy.samples, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  for (const L of P.levels) { L.rt.dispose(); L.down.dispose(); L.up.dispose(); }
  P.levels = [];
  let w = W >> 1, h = H >> 1;
  for (let i = 0; i < Qy.bloomLv; i++) {
    const rt = new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const down = P.mk(i === 0 ? P.FS_PRE : P.FS_DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 1.25 } });
    const up = P.mk(P.FS_UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uGain: { value: 1.0 } }, { blending: THREE.AdditiveBlending, transparent: true });
    P.levels.push({ rt, down, up, w: Math.max(2, w), h: Math.max(2, h) });
    w >>= 1; h >>= 1;
  }
  P.comp.uniforms.uRes.value.set(W, H);
};

GFX.resize = function () {
  let w = window.innerWidth, h = window.innerHeight;
  if (!w || !h) { w = 1280; h = 720; }
  GFX.w = w; GFX.h = h; GFX.pr = Math.min(window.devicePixelRatio || 1, GFX.maxPr);
  if (SM.SHOT) GFX.pr = Math.min(window.devicePixelRatio || 1, 2);
  GFX.renderer.setPixelRatio(GFX.pr); GFX.renderer.setSize(w, h, false);
  GFX.camera.aspect = w / h; GFX.camera.updateProjectionMatrix();
  GFX.buildTargets();
};

GFX.render = function () {
  const r = GFX.renderer, P = GFX.post;
  r.info.reset();
  GFX.uni.uCamPosW.value.copy(GFX.camera.position);
  r.setRenderTarget(P.rtScene); r.clear();
  r.render(GFX.scene, GFX.camera);
  GFX.drawCalls = r.info.render.calls; GFX.tris = r.info.render.triangles;
  // bloom: prefilter + downsample
  let src = P.rtScene.texture, sw = P.rtScene.width, sh = P.rtScene.height;
  for (let i = 0; i < P.levels.length; i++) {
    const L = P.levels[i]; L.down.uniforms.tSrc.value = src; L.down.uniforms.uTexel.value.set(1 / sw, 1 / sh);
    P.quad.material = L.down; r.setRenderTarget(L.rt); r.render(P.scene, P.cam);
    src = L.rt.texture; sw = L.w; sh = L.h;
  }
  // upsample, accumulating into each larger level
  r.autoClear = false;
  for (let i = P.levels.length - 1; i > 0; i--) {
    const L = P.levels[i], D = P.levels[i - 1];
    L.up.uniforms.tSrc.value = L.rt.texture; L.up.uniforms.uTexel.value.set(1 / L.w, 1 / L.h); L.up.uniforms.uGain.value = 0.9;
    P.quad.material = L.up; r.setRenderTarget(D.rt); r.render(P.scene, P.cam);
  }
  r.autoClear = true;
  P.comp.uniforms.tScene.value = P.rtScene.texture; P.comp.uniforms.tBloom.value = P.levels[0].rt.texture; P.comp.uniforms.uTime.value = SM.time;
  P.quad.material = P.comp; r.setRenderTarget(null); r.render(P.scene, P.cam);
};

/* small canvas-texture helper used by several parts */
function canvasTex(w, h, draw, opts) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = (opts && opts.linear) ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = (opts && opts.clamp) ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}


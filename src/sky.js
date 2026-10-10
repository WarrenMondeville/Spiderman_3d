'use strict';
/* ==== p03_sky.js ==== */
/* p03: sky dome (analytic gradient + sun + two cloud decks + stars), PMREM environment with a baked skyline band. */

GLSL.sky = /* glsl */`
uniform vec3 uZen, uHor, uAnti, uSkySun, uSkySunCol, uCloudLit, uCloudDark;
uniform float uSunDisc, uSkyTime, uStars, uEnvPass;
vec3 skyBase(vec3 d){
  float y = max(d.y, 0.0);
  float sd = max(dot(d, uSkySun), 0.0);
  vec2 dh = normalize(d.xz + vec2(1e-5)), sh = normalize(uSkySun.xz + vec2(1e-5));
  float az = dot(dh, sh) * 0.5 + 0.5;
  vec3 horiz = mix(uAnti, uHor, az * az * (3.0 - 2.0 * az));
  float g = pow(1.0 - y, 2.4);
  vec3 c = mix(uZen, horiz, g);
  c = mix(c, c * vec3(1.18, 0.86, 0.80), g * az * 0.6);                       // deeper rose low toward the sun
  c += uSkySunCol * (pow(sd, 4.0) * 0.42 + pow(sd, 22.0) * 0.9 + pow(sd, 120.0) * 1.6) * (0.35 + 0.65 * g);
  return c;
}
`;

const Sky = { mesh: null, mat: null, envRT: null, pmrem: null };

Sky.FS = GLSL.noise + GLSL.sky + /* glsl */`
varying vec3 vDir;
float cloudDens(vec2 uv, float cov){
  float n = fbm(uv) * 0.62 + fbm(uv * 2.7 + 9.1) * 0.26 + vnoise(uv * 7.3) * 0.12;
  return smoothstep(cov, cov + 0.30, n);
}
void main(){
  vec3 d = normalize(vDir);
  vec3 c = skyBase(d);
  float sdRaw = dot(d, uSkySun);
  if (d.y > -0.02) {
    float y = max(d.y, 0.0);
    // stars
    if (uStars > 0.01) {
      vec3 sp = d * 220.0; vec3 ip = floor(sp); float h = hash12(ip.xy + ip.z * 37.7);
      float st = smoothstep(0.9965, 1.0, h) * smoothstep(0.75, 0.2, length(fract(sp) - 0.5) * 1.6);
      c += vec3(0.9, 0.95, 1.0) * st * 2.2 * uStars * smoothstep(0.02, 0.3, y) * (0.6 + 0.4 * sin(uSkyTime * 3.0 + h * 80.0));
    }
    // low cumulus deck
    vec2 uv = d.xz / (y + 0.10) * 0.55 + vec2(uSkyTime * 0.004, uSkyTime * 0.0015);
    float dn = cloudDens(uv, 0.50);
    vec2 sdir = normalize(uSkySun.xz + vec2(1e-5));
    float dn2 = cloudDens(uv + sdir * 0.16, 0.50);
    float lit = clamp(0.55 + (dn - dn2) * 1.6, 0.0, 1.0);
    float sd = max(sdRaw, 0.0);
    vec3 cc = mix(uCloudDark, uCloudLit, lit);
    cc += uSkySunCol * pow(sd, 5.0) * 0.9 * (1.0 - dn * 0.55);           // silver lining toward the sun
    cc = mix(cc, skyBase(vec3(d.x, 0.0, d.z)) , smoothstep(0.30, 0.0, y) * 0.75);  // aerial perspective
    float fade = smoothstep(0.015, 0.16, y);
    c = mix(c, cc, dn * fade * 0.92);
    // high cirrus streaks
    vec2 uv2 = d.xz / (y + 0.25) * vec2(0.35, 1.3) + vec2(uSkyTime * 0.002, 3.3);
    float ci = smoothstep(0.52, 0.95, fbm(uv2 * 1.4) ) * smoothstep(0.05, 0.4, y) * 0.55;
    c = mix(c, mix(uCloudLit, uSkySunCol + uCloudLit * 0.5, pow(sd, 3.0)) * 0.9, ci * (1.0 - dn));
    // sun / moon disc
    float disc = smoothstep(0.99962, 0.99988, sdRaw);
    c += uSkySunCol * disc * mix(uSunDisc, 3.0, uEnvPass) * (1.0 - dn * 0.85);
  } else {
    vec3 gcol = mix(skyBase(vec3(d.x, 0.0, d.z)) * 0.50, (uHor + uZen) * 0.16 + vec3(0.03), smoothstep(0.0, -0.5, d.y));
    c = gcol;
  }
  if (uEnvPass > 0.5) {
    // baked skyline band so glass reflects "a city" near the horizon rather than open sky
    float a = atan(d.z, d.x);
    float hh = 0.04 + 0.20 * hash11(floor(a * 34.0)) * (0.35 + 0.65 * vnoise(vec2(a * 5.0, 1.7)));
    float b = smoothstep(hh, hh - 0.012, d.y);
    vec3 bc = mix(skyBase(vec3(d.x, 0.0, d.z)) * 0.30, uZen * 0.35, 0.4);
    vec2 wuv = vec2(a * 160.0, d.y * 220.0); float wl = step(0.80, hash12(floor(wuv))) * step(0.25, fract(wuv.x)) * step(0.3, fract(wuv.y));
    bc += vec3(1.0, 0.75, 0.45) * wl * 0.5 * step(0.0, d.y);
    c = mix(c, bc, b * step(-0.02, d.y));
  }
  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
}`;

Sky.init = function () {
  const u = Sky.uniforms = {
    uZen: { value: new V3() }, uHor: { value: new V3() }, uAnti: { value: new V3() }, uSkySun: { value: new V3(0, 1, 0) }, uSkySunCol: { value: new V3(1, 1, 1) },
    uCloudLit: { value: new V3(1, 1, 1) }, uCloudDark: { value: new V3(0.4, 0.4, 0.5) }, uSunDisc: { value: 50 }, uSkyTime: { value: 0 }, uStars: { value: 0 }, uEnvPass: { value: 0 },
  };
  Sky.mat = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }',
    fragmentShader: Sky.FS,
  });
  Sky.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), Sky.mat);
  Sky.mesh.scale.setScalar(4800); Sky.mesh.frustumCulled = false; Sky.mesh.renderOrder = -1000;
  GFX.scene.add(Sky.mesh);
  Sky.pmrem = new THREE.PMREMGenerator(GFX.renderer);
};

Sky.applyTod = function (T, rebuildEnv) {
  const u = Sky.uniforms, s = GFX.uni.uSunDirW.value;
  u.uZen.value.fromArray(T.zen); u.uHor.value.fromArray(T.hor); u.uAnti.value.fromArray(T.anti);
  u.uSkySun.value.copy(s); u.uSkySunCol.value.fromArray(T.sunCol);
  u.uCloudLit.value.fromArray(T.cloudLit); u.uCloudDark.value.fromArray(T.cloudDark);
  u.uSunDisc.value = T.sunDisc; u.uStars.value = T.stars;
  if (rebuildEnv !== false) Sky.buildEnv();
};

Sky.buildEnv = function () {
  const es = new THREE.Scene();
  const m = new THREE.Mesh(Sky.mesh.geometry, Sky.mat); m.scale.setScalar(50); es.add(m);
  Sky.uniforms.uEnvPass.value = 1;
  const old = Sky.envRT;
  Sky.envRT = Sky.pmrem.fromScene(es, 0, 0.1, 200);
  Sky.uniforms.uEnvPass.value = 0;
  GFX.scene.environment = Sky.envRT.texture;
  if (old) old.dispose();
};

Sky.update = function (dt) {
  Sky.uniforms.uSkyTime.value += dt;
  Sky.mesh.position.copy(GFX.camera.position);
};


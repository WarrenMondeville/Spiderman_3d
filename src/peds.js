'use strict';
/* ==== p12_peds.js ==== */
/* p12: pedestrians — one instanced low-res body; arms are dropped from the T-pose and the walk cycle is done per-vertex in the
   shader from the rest position, so hundreds of walkers cost one draw call and no skeletons. */

const Peds = { list: [], mesh: null, n: 0 };

Peds.build = function () {
  const built = Body.build({ res: 0.042, handRes: 0.034, hands: 'mitt', jacket: 0.35, pants: 0.7, bulk: 0.97, boots: 0.4 });
  const g = built.geometry; g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
  // a fixed pool that always lives on the blocks around the camera: every walker on screen is one you can actually see
  const R = Peds.R = mulberry(SM.SEED + 1212), L = Peds.list, pool = SM.quality === 0 ? 90 : 170;
  Peds.blocks = CITY.blocks.filter(b => !b.park); const Pk = CITY.PARK; Peds.blocks.push({ x0: Pk.x0 + 2, x1: Pk.x1 - 2, z0: Pk.z0 + 2, z1: Pk.z1 - 2 });
  for (let k = 0; k < pool; k++) L.push({ blk: Peds.blocks[Math.floor(R() * Peds.blocks.length)], s: R() * 1000, dir: R() < 0.5 ? 1 : -1, v: 1.15 + R() * 0.55, inset: 2.5 + R() * 0.9, fresh: true });
  const n = Peds.n = L.length, aPed = new Float32Array(n * 4), aShirt = new Float32Array(n * 3), aPants = new Float32Array(n * 3);
  const shirts = [[0.55, 0.08, 0.08], [0.10, 0.22, 0.50], [0.75, 0.72, 0.66], [0.08, 0.09, 0.10], [0.60, 0.45, 0.12], [0.16, 0.38, 0.24], [0.50, 0.30, 0.50], [0.85, 0.82, 0.78], [0.30, 0.33, 0.38], [0.70, 0.35, 0.16]];
  const pants = [[0.06, 0.08, 0.14], [0.05, 0.05, 0.06], [0.22, 0.19, 0.15], [0.12, 0.16, 0.26], [0.30, 0.30, 0.32]];
  for (let i = 0; i < n; i++) { aPed.set([R() * TAU, L[i].v, Math.floor(R() * 5), 0.92 + R() * 0.14], i * 4); aShirt.set(R.pick(shirts), i * 3); aPants.set(R.pick(pants), i * 3); }
  g.setAttribute('aPed', new THREE.InstancedBufferAttribute(aPed, 4)); g.setAttribute('aShirt', new THREE.InstancedBufferAttribute(aShirt, 3)); g.setAttribute('aPants', new THREE.InstancedBufferAttribute(aPants, 3));
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, envMapIntensity: 0.5 }); m.userData.tag = 'ped';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = GFX.uni.uTime;
    sh.vertexShader = sh.vertexShader.replace(/void\s+main\s*\(\s*\)\s*\{/, `uniform float uTime; attribute vec4 aPed; attribute vec3 aShirt; attribute vec3 aPants; varying vec3 vRest; varying vec3 vShirt; varying vec3 vPants; varying float vSkin;
      vec3 pedP; vec3 pedN;
      void pedRotYZ(inout vec3 p, inout vec3 n, vec2 c, float a){ float cs = cos(a), sn = sin(a); vec2 d = p.yz - c; p.yz = c + vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs); n.yz = vec2(n.y * cs - n.z * sn, n.y * sn + n.z * cs); }
      void pedRotXY(inout vec3 p, inout vec3 n, vec2 c, float a){ float cs = cos(a), sn = sin(a); vec2 d = p.xy - c; p.xy = c + vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs); n.xy = vec2(n.x * cs - n.y * sn, n.x * sn + n.y * cs); }
      void main() {
        vRest = position; vShirt = aShirt; vPants = aPants; vSkin = aPed.z; pedP = position; pedN = normal;
        float ph = uTime * 4.6 * aPed.y + aPed.x, sd = pedP.x > 0.0 ? 1.0 : -1.0;
        if (abs(pedP.x) > 0.17 && pedP.y > 1.30) { pedRotXY(pedP, pedN, vec2(sd * 0.185, 1.43), -sd * 1.40); pedRotYZ(pedP, pedN, vec2(1.43, 0.0), sin(ph + (sd > 0.0 ? 3.14159 : 0.0)) * 0.45);
          if (position.x * sd > 0.46) pedRotYZ(pedP, pedN, vec2(1.43 - 0.28, 0.0), -0.35); }
        else if (pedP.y < 0.93) { float sw = sin(ph + (sd > 0.0 ? 0.0 : 3.14159)); pedRotYZ(pedP, pedN, vec2(0.92, 0.0), sw * 0.42);
          if (position.y < 0.50) { float kb = max(0.0, -cos(ph + (sd > 0.0 ? 0.0 : 3.14159))) * 0.75; float cs = cos(sw * 0.42), sn = sin(sw * 0.42); vec2 knee = vec2(0.92, 0.0) + vec2(-0.415 * cs, -0.415 * sn); pedRotYZ(pedP, pedN, knee, kb); } }
        pedP.y += abs(sin(ph)) * 0.025; pedP *= aPed.w;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(pedN);')
      .replace('#include <begin_vertex>', 'vec3 transformed = pedP;');
    sh.fragmentShader = sh.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/, 'varying vec3 vRest; varying vec3 vShirt; varying vec3 vPants; varying float vSkin;\nvoid main() {')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec3 p = vRest; float ax = abs(p.x); vec3 skin = vSkin < 1.0 ? vec3(0.62, 0.40, 0.30) : vSkin < 2.0 ? vec3(0.45, 0.27, 0.18) : vSkin < 3.0 ? vec3(0.22, 0.13, 0.09) : vSkin < 4.0 ? vec3(0.55, 0.36, 0.24) : vec3(0.32, 0.19, 0.13);
          vec3 hair = vSkin < 2.0 ? vec3(0.10, 0.06, 0.03) : vec3(0.02, 0.02, 0.02); vec3 c = vShirt;
          if (p.y > 1.50 && ax < 0.16) { c = skin; if (p.y > 1.70 || (p.z < 0.0 && p.y > 1.60)) c = hair; }
          else if (ax > 0.52 && p.y > 1.30) c = skin;
          else if (p.y < 0.10) c = vec3(0.03);
          else if (p.y < 0.97 && ax < 0.30) c = vPants;
          diffuseColor.rgb = c; }`);
  };
  MAT(m);
  const mesh = Peds.mesh = new THREE.InstancedMesh(g, m, n); mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; GFX.scene.add(mesh);
  Peds.dummy = new THREE.Object3D(); Peds.update(0.016);
};

/* walk the rectangle of pavement round the block */
Peds.update = function (dt) {
  const d = Peds.dummy, P = GFX.camera.position, mesh = Peds.mesh; let shown = 0;
  for (let i = 0; i < Peds.n; i++) {
    const p = Peds.list[i], b = p.blk, x0 = b.x0 + p.inset, x1 = b.x1 - p.inset, z0 = b.z0 + p.inset, z1 = b.z1 - p.inset, w = x1 - x0, h = z1 - z0, per = 2 * (w + h);
    p.s += p.v * p.dir * dt; let s = ((p.s % per) + per) % per, x, z, ry;
    if (s < w) { x = x0 + s; z = z0; ry = PI / 2; } else if (s < w + h) { x = x1; z = z0 + (s - w); ry = 0; } else if (s < 2 * w + h) { x = x1 - (s - w - h); z = z1; ry = -PI / 2; } else { x = x0; z = z1 - (s - 2 * w - h); ry = PI; }
    if (p.dir < 0) ry += PI;
    const md = Math.abs(x - P.x) + Math.abs(z - P.z), far = md > 340;
    if (far || p.fresh) {   // re-home onto a block near the camera (but not right under it, so nobody pops in beside you)
      for (let t = 0; t < 6; t++) { const nb = Peds.blocks[Math.floor(Peds.R() * Peds.blocks.length)], cx = (nb.x0 + nb.x1) / 2, cz = (nb.z0 + nb.z1) / 2, dd = Math.abs(cx - P.x) + Math.abs(cz - P.z); if (dd < 300 && (dd > 70 || p.fresh)) { p.blk = nb; p.s = Peds.R() * 1000; break; } }
      p.fresh = false;
    }
    // step out of the way of a brawl
    let sc = far ? 0 : 1; if (!far && typeof Enemies !== 'undefined' && Enemies.engaged > 0 && Math.hypot(x - Player.pos.x, z - Player.pos.z) < 9) sc = 0;
    d.position.set(x, 0.16, z); d.rotation.set(0, ry, 0); d.scale.setScalar(sc); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); if (sc) shown++;
  }
  mesh.instanceMatrix.needsUpdate = true; Peds.shown = shown;
};


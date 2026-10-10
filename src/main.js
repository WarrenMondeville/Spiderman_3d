'use strict';
/* ==== p90_main.js ==== */
/* p90: boot sequence, main loop, debug handle. */

const Game = { started: false, last: 0, acc: 0, fpsT: 0, fpsN: 0, fps: 60, frameMs: 16, paused: false, freeCam: null };

Game.boot = async function () {
  try {
    Loader.set(0.04, 'WARMING UP THE RENDERER'); await Loader.yield();
    GFX.init(); IN.init(GFX.canvas); Sky.init();
    Loader.set(0.12, 'SURVEYING THE ISLAND'); await Loader.yield();
    CITY.generate(SM.SEED);
    Loader.set(0.22, 'RAISING ' + CITY.buildings.length + ' BUILDINGS'); await Loader.yield();
    City.build(); City.buildHeightMap(); World.buildFromCity();
    Loader.set(0.34, 'PAVING THE AVENUES'); await Loader.yield();
    Ground.build();
    if (typeof Props !== 'undefined') { Loader.set(0.42, 'WATER TOWERS, FIRE ESCAPES, STREET LIFE'); await Loader.yield(); await Props.build(); }
    if (typeof Traffic !== 'undefined') { Loader.set(0.55, 'RUSH HOUR TRAFFIC'); await Loader.yield(); Traffic.build(); }
    World.finish();
    if (typeof Peds !== 'undefined') { Loader.set(0.58, 'EIGHT MILLION NEW YORKERS (WELL, A FEW HUNDRED)'); await Loader.yield(); Peds.build(); }
    if (typeof FX !== 'undefined') { FX.init(); }
    if (typeof Hero !== 'undefined') { Loader.set(0.62, 'STITCHING THE SUIT'); await Loader.yield(); await Hero.build(); }
    if (typeof Enemies !== 'undefined') { Loader.set(0.80, 'ROUNDING UP THE USUAL SUSPECTS'); await Loader.yield(); await Enemies.build(); }
    if (typeof Crimes !== 'undefined') Crimes.init();
    if (typeof HUD !== 'undefined') HUD.init();
    Loader.set(0.92, 'CATCHING THE LIGHT'); await Loader.yield();
    GFX.applyTod(true);
    Ground.applyTod(TODS[SM.tod]); Suit.applyTod(TODS[SM.tod]);
    if (typeof Props !== 'undefined' && Props.applyTod) Props.applyTod(TODS[SM.tod]);
    if (typeof Player !== 'undefined') Player.init();
    if (typeof Cam !== 'undefined') Cam.init();
    // first frame compiles every program; do it behind the loading card
    GFX.updateSun(new V3(0, 0, 0)); GFX.render();
    Loader.set(1, 'READY'); await Loader.yield();
    SM.ready = true;
    if (typeof Flow !== 'undefined') Flow.start(); else { SM.mode = 'fly'; document.getElementById('load').classList.add('gone'); }
    Game.last = performance.now();
    Game.loop();
    if (SM.TEST && typeof Tests !== 'undefined') Tests.run();
  } catch (e) {
    console.error('BOOT FAILED', e); const m = document.getElementById('loadmsg'); if (m) m.textContent = 'BOOT FAILED — ' + e.message;
    SM.bootError = String(e && e.stack || e);
  }
};

Game.tick = function (now) {
  let dt = (now - Game.last) / 1000; Game.last = now;
  if (dt > 0.1) dt = 0.1; if (dt <= 0) dt = 1 / 120;
  Game.frameMs = U.lerp(Game.frameMs, dt * 1000, 0.05);
  Game.fpsN++; Game.fpsT += dt; if (Game.fpsT > 0.5) { Game.fps = Game.fpsN / Game.fpsT; Game.fpsN = 0; Game.fpsT = 0; }
  // adaptive resolution: hold 60 by trading internal pixels, never gameplay
  if (!SM.SHOT && !document.hidden && SM.ready) {
    Game.arT = (Game.arT || 0) + dt; Game.arAcc = (Game.arAcc || 0) + dt; Game.arN = (Game.arN || 0) + 1;
    if (Game.arT > 1.25) { const ms = Game.arAcc / Game.arN * 1000; Game.arT = 0; Game.arAcc = 0; Game.arN = 0;
      let s = GFX.scale; if (ms > 19.5) s = Math.max(0.55, s - (ms > 28 ? 0.15 : 0.08)); else if (ms < 14.5 && s < 1) s = Math.min(1, s + 0.05);
      if (Math.abs(s - GFX.scale) > 0.001) { GFX.scale = s; GFX.buildTargets(); } }
  }
  Game.frame(dt);
};

Game.frame = function (dt) {
  SM.frame++;
  IN.poll(dt);
  if (typeof Flow !== 'undefined') Flow.update(dt);
  else Game.flyCam(dt);
  SM.time += dt * SM.timeScale; GFX.uni.uTime.value = SM.time;
  Sky.update(dt);
  GFX.render();
  if (SM.DBG) Game.debugText();
  IN.endFrame();
};

/* look-dev camera used before the player exists (and by the harness) */
Game.flyCam = function (dt) {
  const c = GFX.camera, F = Game.freeCam || (Game.freeCam = { yaw: 0.6, pitch: -0.25, pos: new V3(120, 140, 260) });
  F.yaw -= IN.lookX; F.pitch = U.clamp(F.pitch - IN.lookY, -1.5, 1.5);
  const sp = (IN.keys.ShiftLeft ? 160 : 40) * dt;
  const fw = new V3(-Math.sin(F.yaw) * Math.cos(F.pitch), Math.sin(F.pitch), -Math.cos(F.yaw) * Math.cos(F.pitch)), rt = new V3(Math.cos(F.yaw), 0, -Math.sin(F.yaw));
  F.pos.addScaledVector(fw, IN.moveY * sp).addScaledVector(rt, IN.moveX * sp); if (IN.keys.KeyE) F.pos.y += sp; if (IN.keys.KeyQ) F.pos.y -= sp;
  c.position.copy(F.pos); c.lookAt(_v1.copy(F.pos).add(fw));
  GFX.updateSun(_v2.copy(F.pos).addScaledVector(fw, 60).setY(0));
};

Game.debugText = function () {
  const el = document.getElementById('dbg'); el.style.display = 'block';
  const c = GFX.camera.position; let s = `fps ${U.fmt(Game.fps, 0)}  ${U.fmt(Game.frameMs, 1)}ms  calls ${GFX.drawCalls}  tris ${(GFX.tris / 1000) | 0}k  pr ${U.fmt(GFX.pr * GFX.scale, 2)}\ncam ${U.fmt(c.x, 0)} ${U.fmt(c.y, 0)} ${U.fmt(c.z, 0)}  mode ${SM.mode}  build ${SM.BUILD}`;
  if (typeof Player !== 'undefined' && Player.pos) s += '\n' + Player.debugLine();
  el.textContent = s;
};

Game.loop = function () {
  const raf = (now) => { Game.rafAlive = now; if (!Game.manual) Game.tick(now); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  // hidden panes never fire rAF: pump through a MessageChannel, but ONLY while hidden (a visible tab would fight the real rAF)
  const mc = new MessageChannel(); let pumping = false;
  mc.port1.onmessage = () => { if (!document.hidden || Game.manual) { pumping = false; return; } const n = performance.now(); if (n - Game.last > 16) Game.tick(n); mc.port2.postMessage(0); };
  const kick = () => { if (document.hidden && !pumping && !Game.manual) { pumping = true; mc.port2.postMessage(0); } };
  document.addEventListener('visibilitychange', kick); kick();
};

/* debug / harness handle */
window.__sm = {
  get scene() { return GFX.scene; }, get camera() { return GFX.camera; }, get renderer() { return GFX.renderer; },
  SM, GFX, CITY, City, World, IN, Game, TODS,
  step(n = 1, dt = 1 / 60) { Game.manual = true; for (let i = 0; i < n; i++) Game.frame(dt); },
  resume() { Game.manual = false; Game.last = performance.now(); },
  view(px, py, pz, tx, ty, tz, fov) {
    Game.manual = true; SM.mode = 'fly'; GFX.post.comp.uniforms.uSpeed.value = 0; const c = GFX.camera; c.position.set(px, py, pz); c.up.set(0, 1, 0); c.lookAt(tx, ty, tz); if (fov) { c.fov = fov; c.updateProjectionMatrix(); }
    const F = Game.freeCam || (Game.freeCam = { yaw: 0, pitch: 0, pos: new V3() }); F.pos.copy(c.position);
    const d = new V3(tx - px, ty - py, tz - pz).normalize(); F.yaw = Math.atan2(-d.x, -d.z); F.pitch = Math.asin(d.y);
    GFX.updateSun(new V3(tx, 0, tz)); SM.time += 1 / 60; GFX.uni.uTime.value = SM.time; Sky.update(1 / 60); GFX.render();
  },
  shot() { return GFX.canvas.toDataURL('image/jpeg', 0.92); },
};
window.addEventListener('DOMContentLoaded', () => Game.boot());
if (document.readyState !== 'loading') Game.boot();

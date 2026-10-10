'use strict';
/* ==== p80_flow.js ==== */
/* p80: game flow — title, play, pause, photo mode, death / rescue, time-of-day switching, tutorial hints; and the per-frame update order. */

const Flow = { hintStage: 0, hintT: 0, slowT: 0, fadeT: 0, uiHidden: false, playT: 0 };
const $ = id => document.getElementById(id);

Flow.start = function () {
  $('load').classList.add('gone');
  Game.onLockLost = function () { if (SM.mode === 'play') Flow.pause(); };
  if ((SM.SHOT || SM.TEST || SM.Q.has('play')) && !SM.Q.has('title')) Flow.play(true); else Flow.title();
  $('title').addEventListener('click', () => Flow.play(false));
  $('resume').addEventListener('click', () => Flow.resume());
  for (const b of document.querySelectorAll('#qrow button')) b.addEventListener('click', () => { SM.quality = +b.dataset.q; GFX.applyQuality(false); GFX.resize(); Flow.syncPauseUI(); });
  for (const b of document.querySelectorAll('#trow button')) b.addEventListener('click', () => { Flow.switchTod(+b.dataset.t); Flow.syncPauseUI(); });
  window.addEventListener('keydown', e => { if (SM.mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) Flow.play(false); });
};
Flow.title = function () { SM.mode = 'title'; $('title').classList.remove('hidden'); $('hud').classList.remove('on'); };
Flow.play = function (instant) {
  if (SM.mode === 'play') return;
  $('title').classList.add('gone'); setTimeout(() => $('title').classList.add('hidden'), 800);
  SM.mode = 'play'; $('hud').classList.add('on');
  if (!SM.SHOT && !SM.testing) IN.lock(GFX.canvas);
  Cam.snapBehind();
  if (!instant) {   // leap off the spire into the dive that opens the game
    const P = Player; P.vel.set(Math.sin(P.yaw) * 10, 7.5, Math.cos(P.yaw) * 10); P.setState('air'); P.trick = { type: 'flip', t: 0, dur: 0.9 };
    Flow.hint('HOLD <span class="kbd">SHIFT</span> OR <span class="kbd">RIGHT MOUSE</span> TO WEB-SWING', 9);
  }
  Flow.playT = 0;
};
Flow.pause = function () { if (SM.mode !== 'play') return; SM.mode = 'pause'; $('pause').classList.remove('hidden'); Flow.syncPauseUI(); IN.unlock(); };
Flow.resume = function () { $('pause').classList.add('hidden'); SM.mode = 'play'; if (!SM.SHOT) IN.lock(GFX.canvas); Game.last = performance.now(); };
Flow.syncPauseUI = function () { document.querySelectorAll('#qrow button').forEach(b => b.classList.toggle('sel', +b.dataset.q === SM.quality)); document.querySelectorAll('#trow button').forEach(b => b.classList.toggle('sel', +b.dataset.t === SM.tod)); };
Flow.hint = function (html, secs) { const h = $('hint'); h.innerHTML = html; h.classList.add('on'); Flow.hintT = secs || 5; };
Flow.switchTod = function (i) {
  const f = $('fade'); f.classList.add('on');
  setTimeout(() => { GFX.setTod(i === undefined ? SM.tod + 1 : i); Ground.applyTod(TODS[SM.tod]); Suit.applyTod(TODS[SM.tod]); if (typeof Props !== 'undefined' && Props.applyTod) Props.applyTod(TODS[SM.tod]); if (typeof HUD !== 'undefined') HUD.toast(TODS[SM.tod].name); GFX.render(); setTimeout(() => f.classList.remove('on'), 120); }, 380);
};
Flow.slowmo = function (scale, secs) { SM.timeScale = scale; Flow.slowT = secs; };
Flow.onDeath = function () {
  if (typeof HUD !== 'undefined') HUD.banner('', 'KNOCKED OUT', 'GET BACK UP, SPIDER-MAN', 2.6);
  setTimeout(() => { $('fade').classList.add('on'); }, 1700);
  setTimeout(() => { const P = Player; Flow.respawnNear(P.pos); P.hp = P.maxHp; P.dead = false; P.act = null; P.invuln = 2.5; if (typeof Enemies !== 'undefined') Enemies.calm(); $('fade').classList.remove('on'); }, 2500);
};
Flow.respawnNear = function (p) {
  // nearest roof 15..80 m tall
  let best = null, bd = 1e9; World.query(p.x - 120, p.x + 120, p.z - 120, p.z + 120, b => { if (b.kind !== 0 || !b.par || b.y1 < 14 || b.y1 > 90 || (b.x1 - b.x0) < 12 || (b.z1 - b.z0) < 12) return; const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, d = Math.hypot(cx - p.x, cz - p.z); if (d < bd && d > 25) { bd = d; best = b; } });
  if (best) { Player.teleport((best.x0 + best.x1) / 2, best.y1 + PL.H + 0.2, (best.z0 + best.z1) / 2); Player.setState('ground'); } else Player.teleport(Player.lastSafe.x, Player.lastSafe.y + 1, Player.lastSafe.z);
  Cam.inited = false;
};
Flow.rescue = function () {
  if (Flow.rescuing) return; Flow.rescuing = true; $('fade').classList.add('on');
  setTimeout(() => { const s = Player.lastSafe; Player.teleport(s.x, s.y + 0.5, s.z); Player.setState('air'); Cam.inited = false; $('fade').classList.remove('on'); Flow.rescuing = false; if (typeof HUD !== 'undefined') HUD.toast('SPIDERS CAN\'T SWIM'); }, 450);
};

Flow.update = function (dt) {
  // global keys
  if (IN.ap.pause && !SM.SHOT) { if (SM.mode === 'play') Flow.pause(); else if (SM.mode === 'pause') Flow.resume(); else if (SM.mode === 'photo') Flow.photo(false); }
  if (IN.ap.photo && (SM.mode === 'play' || SM.mode === 'photo')) Flow.photo(SM.mode === 'play');
  if (IN.ap.tod && (SM.mode === 'play' || SM.mode === 'photo')) Flow.switchTod();
  if (SM.mode === 'photo' && IN.pressed.KeyH) { Flow.uiHidden = !Flow.uiHidden; $('photo').classList.toggle('hidden', Flow.uiHidden); }
  if (IN.ap.mute && typeof Sfx !== 'undefined') Sfx.toggle();
  // time scaling: hit-stop and slow-motion
  let gdt = dt;
  if (SM.hitStop > 0) { SM.hitStop -= dt; gdt = dt * 0.04; }
  if (Flow.slowT > 0) { Flow.slowT -= dt; if (Flow.slowT <= 0) SM.timeScale = 1; } else SM.timeScale = U.damp(SM.timeScale, 1, 6, dt);
  gdt *= SM.timeScale;
  GFX.post.comp.uniforms.uSlowmo.value = U.damp(GFX.post.comp.uniforms.uSlowmo.value, SM.timeScale < 0.8 ? 1 : 0, 8, dt);
  SM.gdt = gdt;
  if (SM.mode === 'title') { Player.animate(dt); if (typeof Traffic !== 'undefined') Traffic.update(dt); if (typeof Props !== 'undefined') Props.update(dt); FX.update(dt); Cam.update(dt); }
  else if (SM.mode === 'play') {
    Flow.playT += dt;
    Player.update(gdt);
    if (typeof Enemies !== 'undefined') Enemies.update(gdt);
    if (typeof Combat !== 'undefined') Combat.update(gdt);
    if (typeof Crimes !== 'undefined') Crimes.update(gdt);
    if (typeof Traffic !== 'undefined') Traffic.update(gdt);
    if (typeof Props !== 'undefined' && Props.update) Props.update(gdt);
    if (typeof Peds !== 'undefined') Peds.update(gdt);
    FX.update(gdt); Cam.update(dt);
    if (typeof HUD !== 'undefined') HUD.update(dt);
    Flow.tutorial(dt);
  } else if (SM.mode === 'photo') { Cam.update(dt); }
  else if (SM.mode === 'pause') { /* frozen */ }
  if (Flow.hintT > 0) { Flow.hintT -= dt; if (Flow.hintT <= 0) $('hint').classList.remove('on'); }
  GFX.updateSun(SM.mode === 'photo' ? Cam.photo.center : Player.pos);
};
Flow.photo = function (on) { if (on) { SM.mode = 'photo'; Cam.photoEnter(); $('hud').classList.remove('on'); $('photo').classList.remove('hidden'); IN.unlock(); Flow.uiHidden = false; } else { SM.mode = 'play'; $('hud').classList.add('on'); $('photo').classList.add('hidden'); Cam.inited = false; if (!SM.SHOT) IN.lock(GFX.canvas); } };

Flow.tutorial = function (dt) {
  const P = Player, s = Flow.hintStage;
  if (s === 0 && P.swingCount >= 1) { Flow.hintStage = 1; Flow.hint('RELEASE NEAR THE TOP OF THE ARC — <span class="kbd">SPACE</span> FOR A LAUNCH BOOST', 7); }
  else if (s === 1 && P.swingCount >= 5) { Flow.hintStage = 2; Flow.hint('<span class="kbd">F</span> ZIP TO A LEDGE · <span class="kbd">C</span> DIVE · RUN AT WALLS HOLDING <span class="kbd">SHIFT</span>', 8); }
  else if (s === 2 && P.swingCount >= 9 && Flow.hintT <= 0) { Flow.hintStage = 3; if (typeof Crimes !== 'undefined') Crimes.begin(); }
  // stuck nudge: standing around for a long time with nothing happening
  if (P.state === 'ground' && P.hSpeed < 1 && P.combatT <= 0) { Flow.idleT = (Flow.idleT || 0) + dt; if (Flow.idleT > 25 && Flow.hintT <= 0) { Flow.idleT = 0; Flow.hint('JUMP WITH <span class="kbd">SPACE</span>, THEN HOLD <span class="kbd">SHIFT</span> TO SWING', 6); } } else Flow.idleT = 0;
  if (Flow.playT > 75 && Flow.hintStage < 3) { Flow.hintStage = 3; if (typeof Crimes !== 'undefined') Crimes.begin(); }
};

/* ==== city_audio.js: additive, offline soundtrack and sound effects ==== */
// Observes game state and successful healing. Audio never changes game state.
const Sfx = (() => {
  let ctx, master, music, effects, windGain, noiseBuffer, timer, previous;
  let muted = false, nextBeat = 0, beat = 0, lastStep = 0, seed = 7319;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  function tone(freq, end, at, duration, volume, type = 'sine', bus = effects) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, at);
    if (end) o.frequency.exponentialRampToValueAtTime(end, at + duration);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(volume, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    o.connect(g); g.connect(bus); o.start(at); o.stop(at + duration + 0.03);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  function noise(at, duration, volume, frequency, type = 'bandpass', bus = effects) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuffer; f.type = type; f.frequency.value = frequency; f.Q.value = 0.8;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(volume, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    s.connect(f); f.connect(g); g.connect(bus); s.start(at, random() * 0.5); s.stop(at + duration + 0.02);
    s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
  }
  // Original 16-bar synthwave theme: driving drums, bass, arpeggios and a heroic lead.
  function score(at, step) {
    const bar = Math.floor(step / 16) % 16, s = step % 16;
    const roots = [40, 36, 43, 38], root = roots[Math.floor(bar / 2) % 4];
    const minor = root === 40, chord = [0, minor ? 3 : 4, 7, 12];
    const intense = Player.combatT > 0;
    if (s % 4 === 0 || (intense && s === 14)) tone(135, 43, at, 0.23, 0.62, 'sine', music);
    if (s === 4 || s === 12) { noise(at, 0.15, 0.30, 1800, 'highpass', music); tone(180, 90, at, 0.12, 0.15, 'triangle', music); }
    if (s % 2 === 0 || intense) noise(at, s === 14 ? 0.12 : 0.045, s % 4 ? 0.10 : 0.15, 7500, 'highpass', music);
    if (s % 2 === 0) tone(hz(root + (s === 14 ? 7 : 0)), null, at, 0.19, 0.26, 'triangle', music);
    const arp = [0, 1, 2, 1, 3, 2, 1, 2][s % 8];
    tone(hz(root + 24 + chord[arp]), null, at, 0.16, 0.055, 'triangle', music);
    if (s === 0) for (const n of chord.slice(0, 3)) tone(hz(root + 12 + n), null, at, 1.7, 0.05, 'sine', music);
    const phrases = [[76, null, 79, 83, 81, null, 79, 76], [72, null, 76, 79, 83, 81, 79, null], [74, null, 79, 83, 86, null, 83, 81], [78, 81, 86, null, 85, 81, 78, 74]];
    if (s % 2 === 0 && bar >= 2) {
      const n = phrases[Math.floor(bar / 2) % 4][s / 2];
      if (n !== null) { tone(hz(n), null, at, 0.30, 0.12, 'triangle', music); tone(hz(n), null, at + 0.225, 0.28, 0.035, 'sine', music); }
    }
    if (bar % 4 === 3 && s >= 14) noise(at, 0.08, 0.18, 2400, 'bandpass', music);
  }
  function sound(name) {
    if (!ctx || ctx.state !== 'running' || muted || document.hidden || SM.mode !== 'play') return;
    const t = ctx.currentTime;
    if (name === 'web') { noise(t, 0.13, 0.42, 3400); tone(1600, 320, t, 0.14, 0.16, 'triangle'); }
    if (name === 'whoosh') { noise(t, 0.28, 0.32, 1100); tone(240, 620, t, 0.20, 0.07, 'sine'); }
    if (name === 'hit' || name === 'land') { tone(name === 'hit' ? 160 : 100, 38, t, 0.20, 0.40); noise(t, 0.14, 0.34, name === 'hit' ? 1400 : 420); }
    if (name === 'hurt') { tone(190, 52, t, 0.32, 0.27, 'triangle'); noise(t, 0.22, 0.30, 650); }
    if (name === 'sense') { tone(1300, 1800, t, 0.17, 0.09); tone(1600, 2200, t + 0.11, 0.2, 0.06); }
    if (name === 'step') noise(t, 0.07, 0.12, 500);
    if (name === 'reward' || name === 'heal' || name === 'win') {
      const notes = name === 'win' ? [64, 67, 71, 76, 79] : name === 'heal' ? [64, 69, 76] : [83, 88, 95];
      notes.forEach((n, i) => tone(hz(n), null, t + i * 0.085, 0.45, 0.12, 'triangle'));
    }
  }
  function snapshot() { return { state: Player.state, swing: Player.swingCount, act: Player.act, hp: Player.hp, combo: Combat.combo, tokens: Crimes.tokenCount, done: Crimes.done, sense: HUD.senseOn, mode: SM.mode }; }
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime, active = !document.hidden && SM.mode === 'play' && !SM.testing;
    master.gain.setTargetAtTime(active && !muted ? 0.65 : 0, now, 0.08);
    const p = snapshot();
    if (!active || muted) { previous = p; nextBeat = now; return; }
    if (nextBeat < now) nextBeat = now + 0.02;
    while (nextBeat < now + 0.12) { score(nextBeat, beat++); nextBeat += 60 / 128 / 4; }
    windGain.gain.setTargetAtTime(['air', 'swing', 'zip'].includes(p.state) ? Math.min(0.19, Math.max(0, (Player.speed - 8) / 240)) : 0, now, 0.15);
    if (previous && previous.mode === 'play') {
      if (p.swing > previous.swing || (p.act !== previous.act && p.act && p.act.type === 'shoot')) sound('web');
      if (p.state !== previous.state) {
        if (p.state === 'zip') { sound('web'); sound('whoosh'); }
        if (p.state === 'air' && ['swing', 'ground', 'wall', 'perch'].includes(previous.state)) sound('whoosh');
        if (['ground', 'perch'].includes(p.state) && ['air', 'swing', 'zip'].includes(previous.state)) sound('land');
      }
      if (p.act !== previous.act && p.act && ['dodge', 'attack'].includes(p.act.type)) sound('whoosh');
      if (p.combo > previous.combo) sound('hit');
      if (p.hp < previous.hp) sound('hurt');
      if (p.sense && !previous.sense) sound('sense');
      if (p.tokens > previous.tokens) sound('reward');
      if (p.done > previous.done) sound('win');
      if (['ground', 'wall'].includes(p.state) && Player.hSpeed > 2 && now - lastStep > Math.max(0.20, 0.42 - Player.hSpeed * 0.01)) { sound('step'); lastStep = now; }
    }
    previous = p;
  }
  function init() {
    if (!SM.ready) return;
    try {
      if (!ctx) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        ctx = new Audio(); master = ctx.createGain(); master.gain.value = 0;
        const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -14; limiter.ratio.value = 5;
        master.connect(limiter); limiter.connect(ctx.destination);
        music = ctx.createGain(); music.gain.value = 0.48; music.connect(master);
        effects = ctx.createGain(); effects.gain.value = 0.8; effects.connect(master);
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
        const wind = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
        wind.buffer = noiseBuffer; wind.loop = true; filter.type = 'lowpass'; filter.frequency.value = 850;
        windGain = ctx.createGain(); windGain.gain.value = 0;
        wind.connect(filter); filter.connect(windGain); windGain.connect(effects); wind.start();
        previous = snapshot(); nextBeat = ctx.currentTime + 0.03;
        timer = setInterval(() => { try { tick(); } catch (e) { master.gain.value = 0; clearInterval(timer); console.warn('Audio stopped:', e); } }, 40);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) { console.warn('Audio unavailable:', e); }
  }
  // Browser audio begins only after the player's click/key gesture.
  window.addEventListener('pointerdown', init, { passive: true });
  window.addEventListener('keydown', init, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else { nextBeat = ctx.currentTime; previous = snapshot(); ctx.resume().catch(() => {}); }
  });
  return { play(name) { try { sound(name); } catch (e) { console.warn('Sound effect unavailable:', e); } }, toggle() { muted = !muted; init(); if (ctx) master.gain.setTargetAtTime(!muted && !document.hidden && SM.mode === 'play' && !SM.testing ? 0.65 : 0, ctx.currentTime, 0.04); if (HUD.el) HUD.toast(muted ? 'SOUND OFF' : 'SOUND ON'); } };
})();
/* ==== end city_audio.js ==== */


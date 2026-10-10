'use strict';
/* ==== p70_hud.js ==== */
/* p70: HUD — vitals, tracker, minimap, world markers, enemy bars, combo, banners, toasts, contextual prompts, spider-sense. */

const HUD = { mk: {}, bars: [], bannerT: 0, comboShown: 0, mapT: 0, zipT: 0, bossE: null, promptKey: '' };

HUD.init = function () {
  HUD.el = { hp: document.querySelector('#hpbar i'), hpLag: document.querySelector('#hpbar u'), hpbar: $('hpbar'), focus: [...document.querySelectorAll('#focus div')], district: $('district'), obj: $('obj'), sub: $('sub'), spd: $('spd'), alt: $('alt'), prompts: $('prompts'), banner: $('banner'), combo: $('combo'), cn: $('cn'), cs: $('cs'), toast: $('toast'), markers: $('markers'), ehp: $('ehp'), sense: $('sense'), dmg: $('dmg'), boss: $('boss'), bossn: $('bossn'), bossb: $('bossb') };
  for (let i = 0; i < 10; i++) { const d = document.createElement('div'); d.className = 'eb'; d.innerHTML = '<i></i>'; d.style.display = 'none'; HUD.el.ehp.appendChild(d); HUD.bars.push(d); }
  HUD.buildMap();
};
HUD.marker = function (id, cls, glyph) { let m = HUD.mk[id]; if (!m) { m = document.createElement('div'); m.className = 'mk ' + cls; m.innerHTML = `<div class="d"><span>${glyph || ''}</span></div><div class="t"></div>`; HUD.el.markers.appendChild(m); HUD.mk[id] = m; m._t = m.querySelector('.t'); } return m; };
HUD.place = function (m, wp, label, clampEdge) {
  const c = GFX.camera, v = _v1.copy(wp).project(c), w = GFX.w, h = GFX.h; let x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h; const behind = v.z > 1;
  if (behind) { x = w - x; y = h - y; }
  let off = behind || x < 50 || x > w - 50 || y < 60 || y > h - 60;
  if (off && !clampEdge) { m.style.opacity = 0; return; }
  if (off) { const cx = w / 2, cy = h / 2; let dx = x - cx, dy = y - cy; if (behind) { const l = Math.hypot(dx, dy) || 1; dx = dx / l * w; dy = dy / l * w; } const k = Math.min((w / 2 - 56) / Math.abs(dx || 1), (h / 2 - 66) / Math.abs(dy || 1), 1); x = cx + dx * k; y = cy + dy * k; }
  m.style.opacity = 1; m.style.transform = `translate(${x | 0}px, ${y | 0}px) translate(-50%, -50%)`; if (m._t && label !== undefined && m._lab !== label) { m._t.textContent = label; m._lab = label; }
};

HUD.update = function (dt) {
  const P = Player, E = HUD.el;
  const hp = P.hp / P.maxHp * 100; E.hp.style.width = hp + '%'; E.hpLag.style.width = hp + '%'; E.hpbar.classList.toggle('low', hp < 30);
  for (let i = 0; i < 3; i++) { const f = U.sat(P.focus - i); E.focus[i].firstChild.style.width = (f * 100) + '%'; E.focus[i].classList.toggle('full', f >= 1); }
  E.spd.textContent = Math.round(P.speed * 2.237); E.alt.textContent = 'ALT ' + Math.max(0, Math.round(P.pos.y - PL.H)) + ' M';
  HUD.mapT -= dt; if (HUD.mapT <= 0) { HUD.mapT = 0.05; HUD.drawMap(); const dn = DISTRICTS[CITY.districtAt(P.pos.x, P.pos.z)]; if (E.district.textContent !== dn) E.district.textContent = dn;
    const o = Crimes.bossDone ? 'CITY SAFE · PATROL' : Crimes.done >= Crimes.total ? 'SHOWDOWN' : `CRIMES STOPPED <b>${Crimes.done}</b>/${Crimes.total}`; if (HUD._o !== o) { E.obj.innerHTML = o; HUD._o = o; }
    const s = `TOKENS <b>${Crimes.tokenCount}</b>/${Crimes.tokens.length}`; if (HUD._s !== s) { E.sub.innerHTML = s; HUD._s = s; } HUD.prompts(); }
  // crime marker
  const cm = Crimes.marker(), m = HUD.marker('crime', '', '!');
  if (cm) { m.classList.toggle('boss', !!cm.boss); const d = Math.hypot(cm.x - P.pos.x, cm.z - P.pos.z); HUD.place(m, _v2.set(cm.x, cm.y + 2, cm.z), d > 28 ? Math.round(d) + ' M' : '', true); } else m.style.opacity = 0;
  // nearby tokens
  let ti = 0; for (const k of Crimes.tokens) { if (k.got || ti >= 3) continue; const d = Math.hypot(k.x - P.pos.x, k.z - P.pos.z, k.y - P.pos.y); if (d > 170 || d < 8) continue; HUD.place(HUD.marker('tok' + ti, 'tok', ''), _v2.set(k.x, k.y, k.z), Math.round(d) + ' M', false); ti++; }
  for (; ti < 3; ti++) { const q = HUD.mk['tok' + ti]; if (q) q.style.opacity = 0; }
  // zip target reticle
  HUD.zipT -= dt; if (HUD.zipT <= 0) { HUD.zipT = 0.08; P.zipTarget = (P.state === 'zip' || P.combatT > 0 || P.state === 'perch' && P.stateT < 0.3) ? null : Player.findZipTarget(); }
  const zm = HUD.marker('zip', 'zip', ''); if (P.zipTarget && SM.mode === 'play') HUD.place(zm, _v2.set(P.zipTarget.x, P.zipTarget.y, P.zipTarget.z), '', false); else zm.style.opacity = 0;
  // enemy bars
  let bi = 0; for (const e of Enemies.list) { if (bi >= HUD.bars.length) break; if (!e.alive || e.ko || e.boss || e.state === 'idle') continue; const d = e.pos.distanceTo(P.pos); if (d > 32) continue;
    const v = _v1.set(e.pos.x, e.pos.y + 2.05 * e.TY.scale, e.pos.z).project(GFX.camera); if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
    const b = HUD.bars[bi++]; b.style.display = 'block'; b.style.transform = `translate(${((v.x * 0.5 + 0.5) * GFX.w) | 0}px, ${((-v.y * 0.5 + 0.5) * GFX.h) | 0}px) skewX(-20deg)`; b.firstChild.style.width = Math.max(0, e.hp / e.maxHp * 100) + '%'; b.classList.toggle('web', e.state === 'webbed'); }
  for (; bi < HUD.bars.length; bi++) HUD.bars[bi].style.display = 'none';
  if (HUD.bossE) { E.bossb.style.width = Math.max(0, HUD.bossE.hp / HUD.bossE.maxHp * 100) + '%'; }
  // spider-sense sits over the head
  if (HUD.senseOn) { const v = _v1.copy(P.pos).addScaledVector(P.up, 1.15).project(GFX.camera); E.sense.style.left = ((v.x * 0.5 + 0.5) * GFX.w) + 'px'; E.sense.style.top = ((-v.y * 0.5 + 0.5) * GFX.h) + 'px'; E.sense.style.margin = '-70px 0 0 -75px'; E.sense.style.transform = `scale(${1 + Math.sin(SM.time * 40) * 0.06})`; }
  if (HUD.bannerT > 0) { HUD.bannerT -= dt; if (HUD.bannerT <= 0) E.banner.classList.remove('on'); }
  const hurt = U.sat(1 - (SM.time - P.lastHurtT) / 0.8) * 0.9 + (hp < 30 ? 0.35 + Math.sin(SM.time * 5) * 0.12 : 0); E.dmg.style.opacity = hurt; GFX.post.comp.uniforms.uHurt.value = U.sat(hurt * 0.6);
};
HUD.sense = function (on) { if (on === HUD.senseOn) return; HUD.senseOn = on; HUD.el.sense.classList.toggle('on', on); };
HUD.damage = function () { };
HUD.banner = function (t1, t2, t3, secs, cls) { const E = HUD.el; $('b1').textContent = t1; $('b2').textContent = t2; $('b3').textContent = t3 || ''; E.banner.className = 'on ' + (cls || ''); E.banner.querySelector('.t1').style.display = t1 ? '' : 'none'; HUD.bannerT = secs || 4; };
HUD.toast = function (txt) { const d = document.createElement('div'); d.textContent = txt; HUD.el.toast.appendChild(d); while (HUD.el.toast.children.length > 3) HUD.el.toast.removeChild(HUD.el.toast.firstChild); setTimeout(() => { d.style.transition = 'opacity .5s'; d.style.opacity = 0; setTimeout(() => d.remove(), 520); }, 2300); };
HUD.combo = function (n) {
  const E = HUD.el; if (n < 2) { E.combo.classList.remove('on'); return; }
  E.cn.textContent = n; E.combo.classList.add('on'); E.combo.classList.remove('bump'); void E.combo.offsetWidth; E.combo.classList.add('bump');
  E.cs.textContent = n >= 30 ? 'ULTIMATE!' : n >= 20 ? 'AMAZING!' : n >= 12 ? 'SPECTACULAR!' : n >= 6 ? 'SENSATIONAL!' : '';
};
HUD.boss = function (e) { HUD.bossE = e; HUD.el.boss.classList.toggle('on', !!e); if (e) HUD.el.bossn.textContent = e.TY.name; };
HUD.prompts = function () {
  const P = Player, fight = P.combatT > 0; let L;
  if (fight) L = [['LMB', 'ATTACK · HOLD: LAUNCHER'], ['E', 'WEB SHOOTERS'], ['Q', 'DODGE'], P.focus >= 1 ? ['F', 'FINISHER'] : null, P.focus >= 1 && P.hp < P.maxHp * 0.7 ? ['H', 'HEAL'] : null];
  else if (P.state === 'swing') L = [['SPACE', 'LAUNCH'], ['SHIFT', 'RELEASE TO LET GO'], ['A D', 'STEER']];
  else if (P.state === 'air') L = [['SHIFT', 'HOLD: SWING'], ['SPACE', 'WEB ZIP'], ['C', 'DIVE'], P.zipTarget ? ['F', 'ZIP TO POINT'] : null];
  else if (P.state === 'wall') L = [['SHIFT', 'WALL RUN'], ['SPACE', 'LEAP OFF'], ['W S', 'CLIMB']];
  else if (P.state === 'perch') L = [['SPACE', 'LEAP'], ['W', 'STEP OFF']];
  else L = [['SPACE', 'JUMP'], ['SHIFT', 'SPRINT'], P.zipTarget ? ['F', 'ZIP TO POINT'] : null];
  L = L.filter(Boolean); const key = L.map(a => a.join()).join('|'); if (key === HUD.promptKey) return; HUD.promptKey = key;
  HUD.el.prompts.innerHTML = L.map(a => `<div>${a[1]}<span class="kbd">${a[0]}</span></div>`).join('');
};

/* ---------- minimap ---------- */
HUD.buildMap = function () {
  const S = 0.5, pad = 60, W = Math.ceil((CITY.W + pad * 2) * S), H = Math.ceil((CITY.D + pad * 2) * S), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  HUD.map = { c, S, x0: CITY.X0 - pad, z0: CITY.Z0 - pad };
  g.fillStyle = '#10243a'; g.fillRect(0, 0, W, H);
  const X = x => (x - HUD.map.x0) * S, Z = z => (z - HUD.map.z0) * S;
  g.fillStyle = '#3b4250'; g.fillRect(X(CITY.X0 - CITY.MARGIN), Z(CITY.Z0 - CITY.MARGIN), (CITY.W + CITY.MARGIN * 2) * S, (CITY.D + CITY.MARGIN * 2) * S);
  g.fillStyle = '#23272f'; g.fillRect(X(CITY.X0), Z(CITY.Z0), CITY.W * S, CITY.D * S);
  for (const b of CITY.blocks) { g.fillStyle = b.park ? '#2f5a34' : '#4a505c'; g.fillRect(X(b.x0), Z(b.z0), CITY.BX * S, CITY.BZ * S); }
  const Pk = CITY.PARK; g.fillStyle = '#2f5a34'; g.fillRect(X(Pk.x0), Z(Pk.z0), (Pk.x1 - Pk.x0) * S, (Pk.z1 - Pk.z0) * S);
  for (const b of CITY.buildings) for (const t of b.tiers) { const k = U.sat(t.y1 / 260); g.fillStyle = b.landmark ? `rgb(${190 + k * 50 | 0},${170 + k * 40 | 0},${120 + k * 30 | 0})` : `rgb(${96 + k * 90 | 0},${104 + k * 90 | 0},${120 + k * 95 | 0})`; g.fillRect(X(t.x0), Z(t.z0), (t.x1 - t.x0) * S, (t.z1 - t.z0) * S); }
  HUD.mctx = $('minicv').getContext('2d');
};
HUD.drawMap = function () {
  const g = HUD.mctx, M = HUD.map, P = Player, R = 196, zoom = 1.5;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#0c1018'; g.fillRect(0, 0, 392, 392);
  g.translate(R, R); g.rotate(Cam.yaw + PI); g.scale(zoom, zoom);        // camera-forward is up
  const px = (P.pos.x - M.x0) * M.S, pz = (P.pos.z - M.z0) * M.S;
  g.scale(-1, 1); g.drawImage(M.c, -px, -pz);
  const dot = (x, z, col, r) => { g.fillStyle = col; g.beginPath(); g.arc((x - M.x0) * M.S - px, (z - M.z0) * M.S - pz, r, 0, TAU); g.fill(); };
  for (const k of Crimes.tokens) if (!k.got) dot(k.x, k.z, '#ffc44d', 2.2);
  for (const e of Enemies.list) if (e.alive && !e.ko) dot(e.pos.x, e.pos.z, '#ff5050', 2.4);
  const cm = Crimes.marker(); if (cm) { let mx = (cm.x - M.x0) * M.S - px, mz = (cm.z - M.z0) * M.S - pz; const l = Math.hypot(mx, mz), lim = R / zoom - 10; if (l > lim) { mx *= lim / l; mz *= lim / l; } g.fillStyle = cm.boss ? '#b04cff' : '#ff2a2a'; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.save(); g.translate(mx, mz); g.rotate(PI / 4); g.fillRect(-5, -5, 10, 10); g.strokeRect(-5, -5, 10, 10); g.restore(); }
  // player arrow (drawn in screen space so it stays crisp)
  g.setTransform(1, 0, 0, 1, R, R); g.rotate(P.yaw + Cam.yaw); g.fillStyle = '#fff'; g.strokeStyle = '#e8202a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -13); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10); g.closePath(); g.fill(); g.stroke();
};


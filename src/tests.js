'use strict';
/* ==== p85_tests.js ==== */
/* p85: ?test — a self-test that PLAYS the game: stand still and survive, swing a kilometre, run up a wall, zip, win a fight with real inputs. */

const Tests = { results: [] };
Tests.run = async function () {
  const R = Tests.results, ok = (name, cond, info) => { R.push({ name, pass: !!cond, info: info === undefined ? '' : String(info) }); };
  SM.testing = true; Game.manual = true;
  const step = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) Game.frame(dt); };
  const keys = (codes, down) => IN.simKeys(codes, down);
  const release = () => { keys(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space', 'KeyJ', 'KeyE', 'KeyQ', 'KeyF', 'KeyC'], false); IN.mb = [false, false, false]; };
  try {
    ok('boot: no error', !SM.bootError); ok('city: 500+ buildings', CITY.buildings.length > 500, CITY.buildings.length); ok('city: height map', City.hm && City.hm.data.length > 1e6);
    ok('world: boxes indexed', World.boxes.length > 1500, World.boxes.length); ok('hero: mesh built', Hero.built.tris > 40000, Hero.built.tris);
    // materials sane
    let badCol = 0, noAttr = 0; GFX.scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { if (m.color && !(isFinite(m.color.r) && isFinite(m.color.g) && isFinite(m.color.b))) badCol++; if (m.vertexColors && o.geometry && !o.geometry.attributes.color) noAttr++; } });
    ok('materials: finite colours', badCol === 0, badCol); ok('materials: vertexColors have a colour attribute', noAttr === 0, noAttr);
    // real DOM events reach the input layer
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true })); ok('input: real keydown', IN.keys.KeyW === true); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true })); ok('input: real keyup', IN.keys.KeyW === false);
    GFX.canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); ok('input: real mousedown', IN.mb[0] === true); window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })); ok('input: real mouseup', IN.mb[0] === false);
    IN.endFrame();
    // stand still for 30 s
    release(); Player.teleport(CITY.aveX(3), 3, CITY.stZ(9) + 30); step(60 * 30); ok('survive: 30 s idle at street level', Player.hp > 0 && !Player.dead, Player.hp | 0); ok('idle: on the ground', Player.state === 'ground', Player.state); ok('idle: standing on the road surface', Math.abs(Player.feetY()) < 0.3, Player.feetY().toFixed(2));
    // anchors exist in a canyon
    Player.teleport(CITY.aveX(3), 60, CITY.stZ(12)); Player.vel.set(0, 0, -15); Cam.yaw = PI; Player.hSpeed = 15; const a = Player.findAnchor(new V3(0, 0, -1)); ok('swing: anchor found in a canyon', !!a, a ? a.L.toFixed(1) : 'none');
    // swing for 14 s holding SHIFT + W, pulsing release
    const z0 = Player.pos.z; let minY = 1e9, maxSp = 0, swings0 = Player.swingCount; keys(['KeyW'], true);
    for (let i = 0; i < 56; i++) { keys(['ShiftLeft'], i % 6 < 5); step(15); minY = Math.min(minY, Player.pos.y); maxSp = Math.max(maxSp, Player.speed); if (Player.state === 'wall') { keys(['Space'], true); step(2); keys(['Space'], false); } }
    release(); ok('swing: covered 150 m+', Math.hypot(Player.pos.z - z0, Player.pos.x - CITY.aveX(3)) > 150, Math.abs(Player.pos.z - z0).toFixed(0)); ok('swing: several webs fired', Player.swingCount - swings0 >= 4, Player.swingCount - swings0);
    ok('swing: never sank below the street', minY > 0.5, minY.toFixed(1)); ok('swing: real speed', maxSp > 20 && maxSp < 70, maxSp.toFixed(1)); ok('swing: position finite', isFinite(Player.pos.x + Player.pos.y + Player.pos.z));
    // wall run
    // a tall building whose south face fronts a street (not a party wall)
    let b = null; for (const blk of CITY.blocks) { if (blk.park) continue; for (let k = blk.first; k < blk.first + blk.count; k++) { const q = CITY.buildings[k]; if (q.h > 60 && !q.landmark && Math.abs(q.tiers[0].z1 - (blk.z1 - CITY.SWZ)) < 0.01 && q.tiers[0].y1 > 40) { b = q; break; } } if (b) break; }
    const t0 = b.tiers[0]; Player.teleport((t0.x0 + t0.x1) / 2, 12, t0.z1 + 6); Player.setState('air'); Player.vel.set(0, 2, -12); Cam.yaw = PI; keys(['KeyW', 'ShiftLeft'], true); let walled = false, y0 = 0; for (let i = 0; i < 90; i++) { step(1); if (Player.state === 'wall' && !walled) { walled = true; y0 = Player.pos.y; } } ok('wall: hitting a facade starts a wall run', walled, Player.state); ok('wall: climbing', Player.pos.y > y0 + 4, (Player.pos.y - y0).toFixed(1)); release();
    // zip to a roof edge
    Player.teleport((t0.x0 + t0.x1) / 2, t0.y1 - 8, t0.z1 + 9); const c = GFX.camera; c.position.copy(Player.pos); c.lookAt((t0.x0 + t0.x1) / 2, t0.y1 - 2, t0.z1); c.updateMatrixWorld(); const zt = Player.findZipTarget(); ok('zip: finds a perch', !!zt && zt.kind === 'perch', zt ? zt.kind : 'none');
    if (zt) { Player.startZip(zt); step(120); ok('zip: arrives and perches', Player.state === 'perch', Player.state); ok('zip: feet on the parapet', Math.abs(Player.feetY() - zt.y) < 0.2, (Player.feetY() - zt.y).toFixed(2)); }
    // a fight, played with inputs
    const fx = CITY.blockX(3) + CITY.BX / 2, fz = CITY.stZ(9); Player.teleport(fx - 9, 1.2, fz); Player.hp = Player.maxHp; Cam.yaw = PI / 2; Crimes.started = true; const pick = Crimes.pickSpot; Crimes.pickSpot = () => ({ x: fx, y: 0, z: fz, r: 5.2, roof: false, street: true }); Crimes.active = null; Crimes.spawnNext(); Crimes.pickSpot = pick; step(30);
    ok('crime: enemies spawned', Enemies.list.length >= 3, Enemies.list.length);
    // survive 30 s doing nothing in the middle of them
    step(60 * 30); ok('survive: 30 s passive inside a fight', !Player.dead, Player.hp | 0);
    Player.hp = Player.maxHp; Player.dead = false; Player.act = null; let t = 0; while (t < 60 * 60 && Crimes.active && Crimes.active.state !== 'done') { keys(['KeyJ'], t % 12 < 6); keys(['KeyE'], t % 90 === 40); keys(['KeyQ'], !!Enemies.dangerFor() && t % 7 === 0); step(1); t++; if (Player.dead) break; }
    release(); ok('fight: won with attack / web / dodge inputs', Crimes.active && Crimes.active.state === 'done', (t / 60).toFixed(0) + 's hp ' + (Player.hp | 0)); ok('fight: player alive', !Player.dead); ok('fight: combo counted', Combat.best >= 3, Combat.best); ok('crime: counted as stopped', Crimes.done >= 1, Crimes.done);
    // tokens sit above something solid or reachable
    let badTok = 0; for (const k of Crimes.tokens) if (World.floorAt(k.x, k.z, k.y + 1) > k.y) badTok++; ok('tokens: none buried', badTok === 0, badTok);
    ok('render: draws', GFX.drawCalls > 20, GFX.drawCalls);
  } catch (e) { ok('EXCEPTION ' + e.message, false, e.stack); }
  release(); Game.manual = false; Game.last = performance.now(); SM.testing = false;
  const pass = R.filter(r => r.pass).length; SM.testResult = { pass, total: R.length, fails: R.filter(r => !r.pass) };
  console.log('TEST ' + pass + '/' + R.length); for (const r of R) if (!r.pass) console.log('  FAIL ' + r.name + ' :: ' + r.info);
  document.title = 'SPIDER-MAN test ' + pass + '/' + R.length;
};


'use strict';
/* ==== p30_hero.js ==== */
/* p30: the hero rig — builds the body once, owns the solved-pose buffers and applies them with smoothing. */

const Hero = { rig: null, built: null };

function makeRig(inst) {
  return { inst, root: inst.root, bones: inst.bones, mesh: inst.mesh, cur: Anim.newSolved(), target: Anim.newSolved(), tA: Anim.newSolved(), tB: Anim.newSolved(), tC: Anim.newSolved(), first: true };
}
/* push the rig toward a target solved pose. rate = responsiveness (1/s). */
function rigDrive(rig, target, rate, dt) {
  if (rig.first) { Anim.copy(rig.cur, target); rig.first = false; } else Anim.toward(rig.cur, target, 1 - Math.exp(-rate * dt));
  Anim.apply(rig, rig.cur);
}

Hero.build = async function () {
  const t0 = performance.now();
  const res = SM.quality === 0 ? 0.0105 : 0.0082;
  Hero.built = Body.build({ res, handRes: SM.quality === 0 ? 0.0036 : 0.0029 });
  Hero.mat = Suit.heroMaterial();
  const inst = Body.instance(Hero.built, Hero.mat, 1.0);
  inst.root.name = 'hero'; GFX.scene.add(inst.root);
  Hero.rig = makeRig(inst);
  Anim.solve(POSE.idle(0), Hero.rig.target); rigDrive(Hero.rig, Hero.rig.target, 10, 0.016);
  Hero.buildMs = performance.now() - t0;
  console.log('hero: ' + Hero.built.tris + ' tris in ' + Math.round(Hero.buildMs) + ' ms');
};


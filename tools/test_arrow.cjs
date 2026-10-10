// Verify the correct minimap player-arrow rotation.
// Reproduces the canvas 2D transform used in HUD.drawMap and checks that the
// player arrow points the same screen-direction as the map's "player-forward" point.
const rad = d => d * Math.PI / 180;
function lin(a, b, c, d, x, y) { return { x: a * x + c * y, y: b * x + d * y }; }

// Direction (screen) of the map's player-forward point, under:
//   rotate(Cam.yaw + PI) * scale(-1, 1)   (translate/zoom ignored for direction)
function baseDir(Cdeg, Pdeg) {
  const C = rad(Cdeg), P = rad(Pdeg);
  const ca = Math.cos(C + Math.PI), sa = Math.sin(C + Math.PI);
  let a = ca, c = -sa, b = sa, d = ca;   // R(C+PI)
  a *= -1; b *= -1;                       // * Sx(-1,1): flip x column (a,b)
  const v = lin(a, b, c, d, Math.sin(P), Math.cos(P));
  return Math.atan2(v.y, v.x) * 180 / Math.PI;
}
// Screen direction of the arrow tip when rotated by beta (arrow defaults to (0,-1))
function arrowDir(betaDeg) {
  const b = rad(betaDeg);
  const v = lin(Math.cos(b), Math.sin(b), -Math.sin(b), Math.cos(b), 0, -1);
  return Math.atan2(v.y, v.x) * 180 / Math.PI;
}
const diff = (a, b) => ((a - b) % 360 + 540) % 360 - 180;

const cases = [[0,0],[0,90],[0,180],[0,270],[90,0],[90,90],[90,180],[180,90],[270,0],[45,135]];
let ok = true;
for (const [C, P] of cases) {
  const bd = baseDir(C, P);
  const orig = arrowDir(C - P);       // current code: -(P.yaw - Cam.yaw)
  const neu  = arrowDir(P + C);       // proposed fix: P.yaw + Cam.yaw
  const dOrig = diff(bd, orig), dNew = diff(bd, neu);
  if (Math.abs(dNew) > 0.01) ok = false;
  const tag = Math.abs(dNew) < 0.01 ? 'OK ' : 'BAD';
  console.log(`C=${String(C).padStart(3)} P=${String(P).padStart(3)}  base=${bd.toFixed(0).padStart(5)}  orig=${orig.toFixed(0).padStart(5)}(d=${dOrig.toFixed(0).padStart(4)})  new=${neu.toFixed(0).padStart(5)}(d=${dNew.toFixed(0).padStart(4)})  ${tag}`);
}
console.log(ok ? '\n=> NEW formula (P.yaw + Cam.yaw) matches the map in ALL cases' : '\n=> NEW still mismatches');
console.log('   ORIG formula (Cam.yaw - P.yaw) is mirrored (non-zero diff) => this is the bug');

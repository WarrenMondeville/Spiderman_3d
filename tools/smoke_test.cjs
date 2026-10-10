// Load-time smoke test: concatenate three.js + all game modules in original order,
// run once in a vm with minimal browser stubs, prevent Game.boot() from actually
// starting the loop, then assert every cross-module global is defined.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = 'F:/bevy/Spiderman_3d';
const mods = [
  'core.js','gfx.js','sky.js','citygen.js','facade.js',
  'citymesh.js','ground.js','props.js','traffic.js','peds.js',
  'body.js','suit.js','anim.js','hero.js','player.js',
  'camera.js','fx.js','enemies.js','combat.js','crimes.js',
  'hud.js','flow.js','tests.js','main.js',
];

const parts = [fs.readFileSync(path.join(ROOT, 'vendor/three.js'), 'utf8')];
for (const m of mods) parts.push(fs.readFileSync(path.join(ROOT, 'src', m), 'utf8'));
let src = parts.join('\n;\n');

// globals we expect to be defined after load
const EXPECT = ['SM','U','IN','ACTIONS','GFX','Sky','CITY','Player','Cam','Enemies',
  'Combat','Crimes','HUD','Flow','Game','FX','Traffic','Props','TODS','MAT',
  'FS','DISTRICTS','PAL','Loader','V3'];
src += '\n;globalThis.__check = {' + EXPECT.map(n => `${n}: (typeof ${n} !== "undefined" ? ${n} : undefined)`).join(',') + '};\n';

// ---- minimal browser stubs ----
function makeEl() {
  return new Proxy(function(){}, {
    get(t, p) {
      if (p === 'style') return new Proxy({ setProperty(){}, getPropertyValue(){return ''} }, {});
      if (p === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){return false} };
      if (p === 'getContext') return () => makeEl();
      if (p === 'getBoundingClientRect') return () => ({width:1280,height:720,left:0,top:0,right:1280,bottom:720});
      if (p === 'appendChild' || p === 'addEventListener' || p === 'removeEventListener' ||
          p === 'setAttribute' || p === 'removeChild' || p === 'insertBefore' || p === 'remove') return () => {};
      if (p === 'textContent' || p === 'innerHTML') return '';
      if (p === 'width' || p === 'height') return 300;
      if (p === 'readyState') return 'loading';
      if (p === 'hidden') return false;
      if (p === Symbol.toPrimitive) return () => '';
      return makeEl();
    },
    apply() { return makeEl(); },
    set() { return true; },
  });
}
const documentStub = {
  getElementById: () => makeEl(), createElement: () => makeEl(),
  createElementNS: () => makeEl(), addEventListener: () => {}, removeEventListener: () => {},
  body: makeEl(), documentElement: makeEl(), hidden: false, readyState: 'loading',
  querySelector: () => null, querySelectorAll: () => [],
};
const sandbox = {
  console,
  document: documentStub,
  location: { href: 'http://localhost/', search: '', hostname: 'localhost' },
  navigator: { userAgent: 'node', getGamepads: () => [] },
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  setTimeout: () => 0, clearTimeout: () => {},
  MessageChannel, URLSearchParams, TextEncoder, TextDecoder,
  Image: function(){}, ImageData: function(){},
  localStorage: { getItem: () => null, setItem: () => {} },
  AudioContext: function(){ return makeEl(); }, webkitAudioContext: function(){ return makeEl(); },
  addEventListener: () => {}, removeEventListener: () => {},
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

const ctx = vm.createContext(sandbox);

try {
  vm.runInContext(src, ctx, { filename: 'concat.js' });
} catch (e) {
  console.log('LOAD ERROR:', e && e.stack ? e.stack.split('\n').slice(0,4).join('\n') : e);
  process.exit(1);
}

const check = sandbox.__check || {};
const missing = EXPECT.filter(n => check[n] === undefined);
console.log('Loaded OK. Globals present:', EXPECT.length - missing.length, '/', EXPECT.length);
if (missing.length) {
  console.log('MISSING:', missing.join(', '));
  process.exit(2);
}
// sanity: a few should be objects with expected shape
console.log('SM.mode =', check.SM && check.SM.mode);
console.log('Game defined =', typeof check.Game, '| Player defined =', typeof check.Player);
console.log('SM.BUILD =', check.SM && check.SM.BUILD);
console.log('ALL GLOBALS RESOLVED ✔');

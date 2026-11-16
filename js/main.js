// 入口：组装 逻辑(game) + 渲染(renderer) + 输入/HUD
import { Game } from './game/game.js';
import { Renderer } from './render/renderer.js';
import { Input } from './ui/input.js';
import { Hud } from './ui/hud.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);

let game = null, paused = false, running = false, last = performance.now();
const renderer = new Renderer($('game'), { mobile: isTouch });
const hud = new Hud();
const actions = {
  attack: (t) => game && !paused && game.attack(t),
  interact: () => game && !paused && game.interact(),
  build: () => game && !paused && game.toggleBuild(),
  buildType: (i) => game && !paused && game.setBuildType(i),
  eat: () => game && game.eat(),
  drink: () => game && game.drink(),
  heal: () => game && game.heal(),
  bag: () => $('bag').classList.toggle('open'),
  pause: () => setPause(!paused),
  isBuild: () => game && game.buildMode,
};
const input = new Input($('game'), actions, renderer);
input.isTouch = isTouch;

// 按钮（按下即触发，避免移动端延迟）
const tapBtn = (id, fn, hold) => {
  const el = $(id); if (!el) return;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); fn(); if (hold) hold(true); });
  const rel = () => { el.classList.remove('down'); if (hold) hold(false); };
  el.addEventListener('pointerup', rel); el.addEventListener('pointerleave', rel); el.addEventListener('pointercancel', rel);
};
let atkHold = false, atkTimer = 0;
tapBtn('btnAttack', () => actions.attack(null), (v) => { atkHold = v; atkTimer = 0.45; });
tapBtn('btnJump', () => { input.jump = true; });
tapBtn('btnUse', actions.interact);
tapBtn('btnBuild', actions.build);
tapBtn('btnBag', actions.bag);
tapBtn('btnEat', actions.eat); tapBtn('btnDrink', actions.drink);
tapBtn('btnHeal', actions.heal);
hud.bind(() => game);
tapBtn('btnPause', actions.pause);
document.querySelectorAll('.bbtn').forEach((b) => tapBtn2(b, () => actions.buildType(+b.dataset.i)));
$('buildBar').addEventListener('pointerdown', (e) => e.stopPropagation());
function tapBtn2(el, fn) { el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }); }
tapBtn('btnBuildExit', () => game && game.buildMode && game.toggleBuild());

function setPause(v) {
  if (!running) return;
  paused = v; $('pause').classList.toggle('show', paused);
  if (paused && document.pointerLockElement) document.exitPointerLock();
}
$('btnResume').addEventListener('click', () => setPause(false));
$('btnQuit').addEventListener('click', () => { setPause(false); running = false; showTitle(); });
document.addEventListener('pointerlockchange', () => { input.noLock = false; });

function showTitle() { $('title').classList.add('show'); $('end').classList.remove('show'); document.body.classList.remove('playing'); input.enabled = false; }
function start() {
  game = new Game();
  window.__game = game;
  const q = new URLSearchParams(location.search);
  if (q.get('t')) game.T = +q.get('t'); // 测试：快进
  renderer.camYaw = Math.PI; renderer.camPitch = 0.38;
  // 清理旧世界网格
  for (const c of renderer.chunks.values()) { c.solid.dispose(); c.glow.dispose(); }
  renderer.chunks.clear(); renderer.debris.length = 0;
  renderer.heli.setEnabled(false);
  renderer.syncWorld(game.world, 99);
  $('title').classList.remove('show'); $('end').classList.remove('show');
  document.body.classList.add('playing');
  running = true; paused = false; input.enabled = true;
  hud.toast('你在公寓里醒来……外面已经沦陷。');
  setTimeout(() => game && hud.toast('新任务：' + '醒来：走动一下，熟悉操作'), 1200);
}
$('btnStart').addEventListener('click', start);
$('btnAgain').addEventListener('click', start);
$('btnHelp').addEventListener('click', () => $('help').classList.toggle('show'));

function endScreen(win) {
  running = false; input.enabled = false;
  if (document.pointerLockElement) document.exitPointerLock();
  $('endTitle').textContent = win ? '撤离成功' : '失败';
  $('endTitle').className = win ? 'win' : 'lose';
  $('endSub').textContent = win ? '你登上了直升机，离开了新曙光市。' : (game.loseReason || '你倒在了末日之中……');
  $('endStats').innerHTML = `存活 <b>${Math.floor(game.T)}</b> 小时 · 击倒感染者 <b>${game.kills}</b> · 建造工事 <b>${game.placed}</b>`;
  setTimeout(() => $('end').classList.add('show'), 600);
}

function frame() {
  const now = performance.now();
  const raw = Math.min(0.15, (now - last) / 1000); last = now; const dt = Math.min(0.05, raw);
  fitFov();
  if (game && running && !paused) {
    if (atkHold) { atkTimer -= dt; if (atkTimer <= 0) { atkTimer = 0.45; actions.attack(null); } }
    const inp = input.poll(game);
    let rem = raw; // 低帧率时分步更新，保证游戏时间与真实时间一致
    while (rem > 0.0001 && game.state === 'play') { const st = Math.min(0.05, rem); game.update(st, inp); inp.jump = false; rem -= st; }
  }
  if (game) {
    for (const e of game.events) {
      renderer.onEvent(e); hud.onEvent(e);
      if (e.type === 'panel') document.body.classList.toggle('panelOpen', !!e.panel);
      if (e.type === 'end') endScreen(e.win);
      if (e.type === 'hurt' && navigator.vibrate && isTouch) navigator.vibrate(30);
    }
    game.events.length = 0;
    renderer.render(game, running && !paused ? dt : 0);
    if (running) hud.update(game, dt, renderer);
  } else {
    renderer.scene.render();
  }
  requestAnimationFrame(frame);
}

// 标题画面背景：先生成一个世界缓慢环绕
game = new Game(); window.__game = game;
renderer.syncWorld(game.world, 99);
game.player.x = 31; game.player.z = 31; game.T = 11; game.player.dead = true;
let titleSpin = 0;
renderer.camDist = 26; renderer.camPitch = 0.5;
const origRender = renderer.render.bind(renderer);
renderer.render = (g, dt) => {
  if (!running) { titleSpin += 0.0015; renderer.camYaw = titleSpin; renderer.camDist = 26; }
  else renderer.camDist = isTouch ? 7.5 : 6.5;
  origRender(g, dt);
};
addEventListener('resize', () => renderer.resize());
let lastAspect = 0;
function fitFov() {
  const a = innerWidth / innerHeight; if (a === lastAspect) return; lastAspect = a;
  const BABYLON = window.BABYLON;
  if (a < 1) { renderer.cam.fovMode = BABYLON.Camera.FOVMODE_HORIZONTAL_FIXED; renderer.cam.fov = 1.05; }
  else { renderer.cam.fovMode = BABYLON.Camera.FOVMODE_VERTICAL_FIXED; renderer.cam.fov = isTouch ? 1.0 : 0.9; }
}
$('loading').style.display = 'none';
showTitle();
requestAnimationFrame(frame);
window.__start = start;
window.__renderer = renderer;

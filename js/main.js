// 入口：组装 逻辑(game) + 渲染(renderer) + 输入/HUD/音效/存档
import { Game, ENDINGS } from './game/game.js';
import { Renderer } from './render/renderer.js';
import { Input } from './ui/input.js';
import { Hud } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { regionAt } from './game/worldgen.js';
import { Audio } from './audio/audio.js';
import { saveGame, loadSave, clearSave, restore } from './game/save.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);

// ---------- 设置 ----------
const SET_KEY = 'last72_settings';
const settings = Object.assign({ quality: isTouch ? 'mid' : 'high', volume: 0.7, sens: 1, shake: true }, (() => { try { return JSON.parse(localStorage.getItem(SET_KEY) || '{}'); } catch (_) { return {}; } })());
const saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (_) {} };

let game = null, paused = false, running = false, last = performance.now(), saveT = 0, lastSaveHour = 0;
const renderer = new Renderer($('game'), { mobile: isTouch });
const hud = new Hud();
const audio = new Audio();
const minimap = new Minimap($('minimap'), $('bigmapC'));
$('minimap').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); minimap.open = true; $('bigmap').classList.add('show'); });
$('bigmap').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); minimap.open = false; $('bigmap').classList.remove('show'); });
const actions = {
  attack: (t) => game && !paused && game.attack(t),
  interact: () => game && !paused && game.interact(),
  build: () => game && !paused && game.toggleBuild(),
  buildType: (i) => game && !paused && game.setBuildType(i),
  eat: () => game && game.eat(),
  drink: () => game && game.drink(),
  heal: () => game && game.heal(),
  bag: () => { $('bag').classList.toggle('open'); audio.play('ui'); },
  pause: () => setPause(!paused),
  map: () => { minimap.open = !minimap.open; $('bigmap').classList.toggle('show', minimap.open); },
  isBuild: () => game && game.buildMode,
};
const input = new Input($('game'), actions, renderer);
input.isTouch = isTouch;

// 设置面板：同一组控件，在标题/暂停之间移动
const setTpl = $('setTpl'); const setNodes = [...setTpl.children];
function mountSettings(box) { for (const n of setNodes) box.appendChild(n); }
mountSettings($('setBox2'));
$('btnSettings').addEventListener('click', () => mountSettings($('setBox')));
$('btnSettings2').addEventListener('click', () => mountSettings($('setBox2')));
function applySettings() {
  renderer.setQuality(settings.quality);
  renderer.shakeOn = settings.shake;
  audio.setVolume(settings.volume);
  input.sens = settings.sens;
  $('setQ').value = settings.quality; $('setV').value = Math.round(settings.volume * 100); $('setS').value = Math.round(settings.sens * 100); $('setShake').checked = settings.shake;
  $('setVv').textContent = Math.round(settings.volume * 100); $('setSv').textContent = settings.sens.toFixed(2);
}
$('setQ').addEventListener('change', (e) => { settings.quality = e.target.value; saveSettings(); applySettings(); });
$('setV').addEventListener('input', (e) => { settings.volume = +e.target.value / 100; saveSettings(); applySettings(); });
$('setS').addEventListener('input', (e) => { settings.sens = +e.target.value / 100; saveSettings(); applySettings(); });
$('setShake').addEventListener('change', (e) => { settings.shake = e.target.checked; saveSettings(); applySettings(); });

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
tapBtn('btnStay', () => game && game.chooseStay());
tapBtn('btnWake', () => game && game.wake('你起床了'));
hud.bind(() => game);
tapBtn('btnPause', actions.pause);
function tapBtn2(el, fn) { el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }); }
document.querySelectorAll('.bbtn').forEach((b) => tapBtn2(b, () => actions.buildType(+b.dataset.i)));
$('buildBar').addEventListener('pointerdown', (e) => e.stopPropagation());
tapBtn('btnBuildExit', () => game && game.buildMode && game.toggleBuild());

function setPause(v) {
  if (!running) return;
  paused = v; $('pause').classList.toggle('show', paused);
  $('setBox').classList.remove('show');
  if (paused) { if (document.pointerLockElement) document.exitPointerLock(); doSave(true); }
}
function doSave(quiet) {
  if (!game || game.state !== 'play') return;
  const ok = saveGame(game);
  if (!quiet) hud.toast(ok ? '游戏已保存' : '保存失败（存储空间不足）');
}
$('btnResume').addEventListener('click', () => setPause(false));
$('btnSave').addEventListener('click', () => { doSave(false); $('pauseMsg').textContent = '已保存 ' + new Date().toLocaleTimeString(); });
$('btnSettings').addEventListener('click', () => $('setBox').classList.toggle('show'));
$('btnSettings2').addEventListener('click', () => $('setBox2').classList.toggle('show'));
$('btnQuit').addEventListener('click', () => { doSave(true); setPause(false); running = false; showTitle(); });
document.addEventListener('pointerlockchange', () => { input.noLock = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && running && !paused) setPause(true); });

function showTitle() {
  $('title').classList.add('show'); $('end').classList.remove('show'); document.body.classList.remove('playing'); input.enabled = false;
  const sv = loadSave();
  $('btnContinue').style.display = sv ? 'block' : 'none';
  if (sv) $('btnContinue').textContent = `继续游戏（第 ${Math.floor(sv.T)} 小时）`;
  let seen = []; try { seen = JSON.parse(localStorage.getItem('last72_endings') || '[]'); } catch (_) {}
  $('titleEnds').textContent = `已达成结局 ${seen.length} / 5`;
}
function start(fromSave) {
  audio.init();
  game = new Game();
  window.__game = game;
  if (fromSave) { const sv = loadSave(); if (sv) { try { restore(game, sv); } catch (e) { console.warn('读档失败', e); game = new Game(); window.__game = game; } } }
  else clearSave();
  const q = new URLSearchParams(location.search);
  if (q.get('t')) game.T = +q.get('t'); // 测试：快进
  lastSaveHour = Math.floor(game.T);
  renderer.camYaw = Math.PI / 2; renderer.camPitch = 0.38;
  for (const c of renderer.chunks.values()) { c.solid.dispose(); c.glow.dispose(); }
  renderer.chunks.clear(); renderer.debris.length = 0; renderer.fx.length = 0;
  renderer.heli.setEnabled(false);
  renderer.syncWorld(game.world, 999);
  minimap.ver = -1;
  $('title').classList.remove('show'); $('end').classList.remove('show');
  document.body.classList.add('playing');
  running = true; paused = false; input.enabled = true;
  if (!fromSave) {
    hud.toast('你在公寓里醒来……外面已经沦陷。');
    setTimeout(() => game && hud.toast('新任务：醒来：走动一下，熟悉操作'), 1200);
  } else hud.toast('已读取存档');
}
$('btnStart').addEventListener('click', () => start(false));
$('btnContinue').addEventListener('click', () => start(true));
$('btnAgain').addEventListener('click', () => start(false));
$('btnTitle').addEventListener('click', () => showTitle());
$('btnHelp').addEventListener('click', () => $('help').classList.toggle('show'));

function endScreen() {
  running = false; input.enabled = false;
  if (document.pointerLockElement) document.exitPointerLock();
  clearSave();
  audio.play('end');
  const E = ENDINGS[game.ending] || ENDINGS.dead;
  let seen = []; try { seen = JSON.parse(localStorage.getItem('last72_endings') || '[]'); } catch (_) {}
  if (!seen.includes(game.ending)) { seen.push(game.ending); try { localStorage.setItem('last72_endings', JSON.stringify(seen)); } catch (_) {} }
  $('endTitle').textContent = E.title;
  $('endTitle').className = E.win ? 'win' : 'lose';
  $('endSub').textContent = E.text(game);
  const alive = game.npcs.joinedAlive().length;
  $('endStats').innerHTML = `存活 <b>${Math.floor(game.T)}</b> 小时 · 击倒感染者 <b>${game.kills}</b> · 建造工事 <b>${game.placed}</b> · 同伴 <b>${alive}</b>/3`;
  $('endList').innerHTML = Object.entries(ENDINGS).map(([k, v]) => `<span class="${seen.includes(k) ? 'got' : ''}${k === game.ending ? ' cur' : ''}">${seen.includes(k) ? v.name : '？？？'}</span>`).join('');
  $('endArt').className = 'endArt ' + game.ending;
  setTimeout(() => $('end').classList.add('show'), 600);
}

// ---------- 伤害数字 ----------
const dmgBox = $('dmgNums');
function dmgNumber(x, y, z, text, cls) {
  const pt = renderer.project(x, y, z); if (!pt) return;
  if (dmgBox.children.length > 14) dmgBox.firstChild.remove();
  const el = document.createElement('div'); el.className = 'dmg ' + (cls || ''); el.textContent = text;
  el.style.left = pt.x + 'px'; el.style.top = pt.y + 'px';
  dmgBox.appendChild(el); setTimeout(() => el.remove(), 750);
}
const SFX = { swing: 'swing', zhit: 'hit', break: 'break', place: 'place', explode: 'explode', hurt: 'hurt', zdeath: 'zdeath', wave: 'alarm', boss: 'boss', shot: 'shot', craft: 'craft', door: 'door', mission: 'mission', radio: 'radio', fuse: 'fuse', stomp: 'stomp', jump: 'jump', hit: 'harvest', repair: 'place', recruit: 'mission', questItem: 'mission' };

let frameErr = 0;
function frame() {
  try { frameInner(); } catch (e) { if (frameErr++ < 5) console.error('帧错误', e); }
  requestAnimationFrame(frame);
}
function frameInner() {
  const now = performance.now();
  const raw = Math.min(0.15, (now - last) / 1000); last = now; const dt = Math.min(0.05, raw);
  fitFov();
  if (game && running && !paused) {
    if (atkHold) { atkTimer -= dt; if (atkTimer <= 0) { atkTimer = 0.45; actions.attack(null); } }
    const inp = input.poll(game);
    let rem = raw; // 低帧率时分步更新，保证游戏时间与真实时间一致
    while (rem > 0.0001 && game.state === 'play') { const st = Math.min(0.05, rem); game.update(st, inp); inp.jump = false; rem -= st; }
    // 自动存档：每 2 个游戏小时
    if (game.state === 'play' && Math.floor(game.T) >= lastSaveHour + 2) { lastSaveHour = Math.floor(game.T); doSave(true); }
  }
  if (game) {
    for (const e of game.events) {
      renderer.onEvent(e); hud.onEvent(e);
      if (running && SFX[e.type]) audio.play(SFX[e.type], e.type === 'zhit' && !e.big ? 0.8 : 1);
      if (e.type === 'use') audio.play(e.id === 'water' || e.id === 'dirty' ? 'drink' : 'eat');
      if (e.type === 'zhit' && e.dmg && running) dmgNumber(e.x, e.y + 0.4, e.z, e.dmg, e.big ? 'big' : '');
      if (e.type === 'hurt' && running) dmgNumber(game.player.x, game.player.y + 2.1, game.player.z, '-' + Math.round(e.dmg), 'me');
      if (e.type === 'panel') document.body.classList.toggle('panelOpen', !!e.panel);
      if (e.type === 'end') endScreen();
      if (e.type === 'hurt' && navigator.vibrate && isTouch) navigator.vibrate(30);
    }
    game.events.length = 0;
    renderer.render(game, running && !paused ? dt : 0);
    if (running) {
      hud.update(game, dt, renderer); minimap.update(game, dt, renderer.camYaw);
      $('regionTxt').textContent = '区域：' + regionAt(game.player.z).name + (game.weather() !== 'clear' ? (game.weather() === 'rain' ? ' · 雨' : ' · 雾') : '');
      if (!paused) audio.update(game, dt);
      $('flash').style.opacity = renderer.flashT > 0 ? renderer.flashT * 2 : 0; renderer.flashT = Math.max(0, renderer.flashT - dt);
    }
  } else {
    renderer.scene.render();
  }
}

// 标题画面背景：先生成一个世界缓慢环绕
game = new Game(); window.__game = game;
renderer.syncWorld(game.world, 999);
game.player.x = 47; game.player.z = 36; game.player.y = 2; game.T = 11; game.player.dead = true;
let titleSpin = 0;
renderer.camDist = 30; renderer.camPitch = 0.45;
const origRender = renderer.render.bind(renderer);
renderer.render = (g, dt) => {
  if (!running) { titleSpin += 0.0015; renderer.camYaw = titleSpin; renderer.camDist = 30; }
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
applySettings();
$('loading').style.display = 'none';
showTitle();
requestAnimationFrame(frame);
window.__start = start;
window.__renderer = renderer;
window.__audio = audio;

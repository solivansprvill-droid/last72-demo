// 纯逻辑模拟：从 0h 跑到 72h+，覆盖五种结局路径与完整任务链（node tests/sim.mjs）
import { Game, MISSIONS, HOUR_SEC } from '../js/game/game.js';
import { MAX_Z } from '../js/game/zombies.js';

const DT = 0.05;
const IDLE = { mx: 0, mz: 0, run: false, jump: false, camYaw: 0, ghostCell: null };
const results = [];

function tp(g, x, y, z) { const p = g.player; p.x = x; p.y = y; p.z = z; p.vy = 0; }
function step(g, n, inp = IDLE, hook) { for (let i = 0; i < n && g.state === 'play'; i++) { g.update(DT, inp); if (hook) hook(g); g.events.length = 0; } }
function hours(h) { return Math.round(h * HOUR_SEC / DT); }
// 机器人：自动吃喝、攻击身边的感染者
function bot(g, keepAlive = true) {
  const p = g.player;
  if (p.hunger < 40) { if (!g.inv.count('food') && !g.inv.count('can')) g.inv.add('can', 2); g.eat(); }
  if (p.thirst < 40) { if (!g.inv.count('water')) g.inv.add('water', 2); g.drink(); }
  if (keepAlive && p.hp < 45) { g.inv.add('bandage', 1); g.heal(); if (p.hp < 30) p.hp = 60; }
  if (keepAlive && p.infect > 60) { g.inv.add('medicine', 1); g.useSlot(g.inv.slots.findIndex(s => s.id === 'medicine')); }
  let near = null, nd = 2.0;
  for (const z of g.zm.list) { const d = Math.hypot(z.x - p.x, z.z - p.z); if (d < nd && Math.abs(z.y - p.y) < 1.5) { nd = d; near = z; } }
  if (near) { p.yaw = Math.atan2(near.x - p.x, near.z - p.z); g.attack(null); }
  if (g.zm.alive > MAX_Z + 1) throw new Error('感染者数量超过上限 ' + g.zm.alive);
}
function walkTo(g, x, z, maxSec = 40) { // 简单直线行走（含绕行失败则传送）
  const p = g.player; const t0 = g.time;
  while (Math.hypot(p.x - x, p.z - z) > 1.2 && g.time - t0 < maxSec && g.state === 'play') {
    const a = Math.atan2(x - p.x, z - p.z);
    g.update(DT, { mx: 0, mz: 1, run: true, jump: Math.random() < 0.05, camYaw: a, ghostCell: null }); bot(g); g.events.length = 0;
  }
  if (Math.hypot(p.x - x, p.z - z) > 1.2) tp(g, x, 1, z);
}
function chain(g) { // 完成任务链：基础 → 超市 → 警察局 → 医院 → 电台
  const p = g.player;
  g.inv.add('wood', 30); g.inv.add('metal', 12); g.inv.add('stone', 6); g.inv.add('food', 3); g.inv.add('water', 3);
  step(g, 40, { ...IDLE, mz: 1 });
  // 基地：在公寓门外放置 6 个工事
  tp(g, 27.5, 1, 13.5);
  for (const [i, x, z] of [[0, 29, 11], [0, 29, 12], [3, 29, 13], [0, 29, 14], [0, 29, 15], [2, 30, 13]]) { g.buildMode = true; g.buildType = i; p.x = x - 1.5; p.z = z + 0.5; g.updateGhost({ x, y: 1, z }); g.place(); }
  g.buildMode = false;
  // 超市：搜刮货架
  const shelves = g.world.objects.filter(o => o.kind === 'mshelf' && o.alive).slice(0, 5);
  for (const o of shelves) { const c = o.cells[0]; tp(g, c[0] - 0.7, 1, c[2] + 0.5); p.yaw = Math.PI / 2; for (let k = 0; k < 4 && o.alive; k++) { p.atkCd = 0; g.harvest(o, 1); } step(g, 2); }
  // 工程师
  const eng = g.npcs.get('engineer'); tp(g, eng.x, 1, eng.z - 1.5); step(g, 3); g.inv.add('can', 1); g.npcCommand('engineer', 'give');
  // 警察局：通讯设备 + 猎人
  const cb = g.world.specials.find(o => o.kind === 'commsbox'); tp(g, 10.5, 1, 114.6); p.yaw = 0; step(g, 3); g.focus = g.findFocus(); if (g.focus && g.focus.kind === 'commsbox') g.doFocus(g.focus); else g.doExtra({ kind: 'commsbox', o: cb });
  const hun = g.npcs.get('hunter'); tp(g, hun.x, 1, hun.z - 1.5); step(g, 3); g.inv.add('water', 2); g.npcCommand('hunter', 'give');
  // 医院：2 楼药品箱 → 3 楼医生
  const mk = g.world.specials.find(o => o.kind === 'medkit'); tp(g, 74.5, 6, 141.6); p.yaw = Math.PI; step(g, 3); g.focus = g.findFocus(); if (g.focus && g.focus.kind === 'medkit') g.doFocus(g.focus); else g.doExtra({ kind: 'medkit', o: mk });
  const doc = g.npcs.get('doctor'); tp(g, doc.x, 11, doc.z - 1.5); step(g, 3); g.npcCommand('doctor', 'give');
  // 电台：公寓 3 楼
  g.inv.add('parts', 2); tp(g, 21.5, 11, 9.8); p.yaw = Math.PI; step(g, 3); g.focus = g.findFocus(); if (g.focus && g.focus.kind === 'radio') g.doFocus(g.focus);
  for (const n of g.npcs.list) { n.x = p.x - 1; n.z = p.z + 1; n.y = p.y; }
  tp(g, 26.5, 1, 13.5);
}
function survive(g, untilT, keepAlive = true) { const hook = (gg) => bot(gg, keepAlive); while (g.T < untilT && g.state === 'play') step(g, 200, IDLE, hook); }
function report(name, g, extra = {}) {
  const r = { 路径: name, 结局: g.ending, 状态: g.state, 游戏时间: g.T.toFixed(1) + 'h', 任务进度: `${g.mission}/${MISSIONS.length - 1}`, 击倒: g.kills, 已触发尸潮: g.waveIdx, Boss出现: !!g.boss, 电台: g.radioFixed, 同伴: g.npcs.joinedAlive().map(n => n.role).join('、') || '无', ...extra };
  results.push(r); console.log(JSON.stringify(r));
  return r;
}
const expect = (cond, msg) => { if (!cond) { console.error('✗ 断言失败：' + msg); process.exitCode = 1; } else console.log('✓ ' + msg); };

const t0 = Date.now();
// 1) 全员撤离
{
  const g = new Game(); chain(g);
  expect(g.npcs.joinedAlive().length === 3 && g.radioFixed, '三名幸存者全部招募、电台已修复');
  survive(g, 72.2);
  expect(g.mission >= MISSIONS.length - 1, '任务链完成（第一次尸潮后到达“前往北部撤离区”）');
  expect(g.waveIdx === 3 && !!g.boss, '三次尸潮均已触发，最终尸潮出现巨型感染者');
  for (const n of g.npcs.list) if (n.dead) { n.dead = false; n.joined = true; n.hp = 80; } // 只验证结局判定
  for (const n of g.npcs.list) { n.mode = 'follow'; }
  walkTo(g, 47.5, 172, 60); tp(g, 47.5, 1, 178); for (const n of g.npcs.list) { n.x = 46.5; n.z = 177; n.y = 1; }
  step(g, 20);
  report('全员撤离', g); expect(g.ending === 'all', '结局 = 全员撤离');
}
// 2) 独自撤离
{
  const g = new Game(); survive(g, 72.1);
  tp(g, 47.5, 1, 178); step(g, 20);
  report('独自撤离', g); expect(g.ending === 'alone', '结局 = 独自撤离');
}
// 3) 留守
{
  const g = new Game(); chain(g); survive(g, 72.1);
  g.chooseStay(); expect(g.staying, '选择留守后进入“留守之夜”');
  tp(g, 26.5, 1, 13.5); survive(g, 78.2);
  report('留守', g); expect(g.ending === 'stay', '结局 = 留守');
}
// 4) 感染（反复被咬，生命被维持但不用药）
{
  const g = new Game(); survive(g, 60); let t = 0; // 先正常存活到 60h，再反复被咬且不用药
  while (g.state === 'play' && t++ < 60000) {
    if (g.zm.alive < 3) g.zm.spawn('walker', g.player.x + 1.2, g.player.z, 1);
    g.update(DT, IDLE); g.events.length = 0; if (g.player.hp < 40) g.player.hp = 90;
    g.player.hunger = 90; g.player.thirst = 90;
  }
  report('感染', g, { 感染值: Math.round(g.player.infect) }); expect(g.ending === 'infected', '结局 = 感染');
}
// 5) 阵亡（尸潮中不抵抗）
{
  const g = new Game(); survive(g, 65.5); tp(g, 47.5, 1, 30); g.inv.add('food', 5); g.inv.add('water', 5); // 存活到最终尸潮前，然后站在街上不抵抗
  while (g.state === 'play' && g.T < 78) { step(g, 200, IDLE, (gg) => { const p = gg.player; if (p.hunger < 30) gg.eat(); if (p.thirst < 30) gg.drink(); }); }
  report('阵亡', g); expect(g.ending === 'dead', '结局 = 阵亡');
}
console.log(`模拟耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s，HOUR_SEC=${HOUR_SEC}（72h = ${(72 * HOUR_SEC / 60).toFixed(0)} 分钟）`);
import('node:fs').then(fs => fs.writeFileSync(new URL('./sim_results.json', import.meta.url), JSON.stringify(results, null, 1)));

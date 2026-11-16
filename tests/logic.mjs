// 纯逻辑单项测试（node tests/logic.mjs）：攀爬者、爆裂者、巨型感染者、爆炸损毁、楼梯与感染者上楼、性能
import { Game } from '../js/game/game.js';
import { placeStruct, BUILD_BY_ID } from '../js/game/builds.js';
const I = { mx: 0, mz: 0, run: false, jump: false, camYaw: 0, ghostCell: null };
let fail = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fail++; };
const clearCell = (g, x, z) => { for (let y = 1; y < 4; y++) g.world.set(x, y, z, 0); };

{ // 攀爬者翻越 2 格高木墙；游荡者只能拆墙
  const g = new Game(); g.T = 2; const p = g.player; g.zm.list.length = 0; const cx = 47, cz = 182;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue; clearCell(g, cx + dx, cz + dz); placeStruct(g, BUILD_BY_ID.wall, cx + dx, 1, cz + dz); }
  const c = g.zm.spawn('climber', cx + 0.5, cz - 7, 1), w = g.zm.spawn('walker', cx + 3.5, cz - 7, 1);
  let inside = false, climbed = false;
  for (let i = 0; i < 600; i++) { p.x = cx + 0.5; p.z = cz + 0.5; p.y = 1; p.hp = 100; g.update(0.05, I); g.events.length = 0; if (c.climbing) climbed = true; if (Math.abs(c.x - p.x) < 1.6 && Math.abs(c.z - p.z) < 1.6) inside = true; }
  ok(climbed && inside, '攀爬者翻越 2 格木墙进入围栏'); ok(!(Math.abs(w.x - p.x) < 1.6 && Math.abs(w.z - p.z) < 1.6) || g.world.structs.size < 16, '游荡者无法翻墙（只能拆墙）');
}
{ // 爆裂者炸毁木墙
  const g = new Game(); g.T = 2; g.zm.list.length = 0; const z0 = 182;
  for (let x = 40; x <= 44; x++) { clearCell(g, x, z0); placeStruct(g, BUILD_BY_ID.wall, x, 1, z0); }
  const b = g.zm.spawn('bloater', 42.5, z0 - 5, 1); let ex = 0;
  for (let i = 0; i < 400; i++) { g.player.x = 42.5; g.player.z = z0 + 2.5; g.player.hp = 100; g.update(0.05, I); ex += g.events.filter(e => e.type === 'explode').length; g.events.length = 0; }
  const hp = [...g.world.structs.values()].map(s => s.hp);
  ok(ex === 1 && b.hp <= 0, '爆裂者接触工事后爆炸一次'); ok(hp.length < 5 || hp.some(h => h < 120), `附近木墙受损（剩余 ${hp.join(',')}）`);
}
{ // 巨型感染者砸毁路障
  const g = new Game(); g.T = 2; g.zm.list.length = 0; const cx = 47, cz = 182; let n = 0;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { if (!dx && !dz) continue; clearCell(g, cx + dx, cz + dz); placeStruct(g, BUILD_BY_ID.bar, cx + dx, 1, cz + dz); n++; }
  const boss = g.zm.spawn('boss', cx + 0.5, cz - 6, 3); let t = 0;
  for (; t < 1200; t++) { g.player.x = cx + 0.5; g.player.z = cz + 0.5; g.player.y = 1; g.player.hp = 100; g.update(0.05, I); g.events.length = 0; if (g.world.structs.size < n) break; }
  ok(boss.max === 1100 && g.world.structs.size < n, `巨型感染者 ${(t * 0.05).toFixed(1)} 秒砸毁路障`);
}
{ // 爆炸伤害随距离衰减
  const g = new Game(); const z0 = 182;
  for (let x = 40; x <= 48; x++) { clearCell(g, x, z0); placeStruct(g, BUILD_BY_ID.wall, x, 1, z0); }
  g.explode(40.5, 1.5, z0 + 0.5, null);
  const hp = [...g.world.structs.values()].sort((a, b) => a.x - b.x).map(s => `${s.x}:${Math.max(0, s.hp)}`);
  ok(!g.world.structAt(40, z0) && g.world.structAt(48, z0).hp === 120, `爆炸中心工事被毁、远处完好（${hp.join(' ')}）`);
}
{ // 楼梯：玩家上 2、3 楼；感染者追上 3 楼
  const g = new Game(); const p = g.player;
  p.x = 7.5; p.z = 19; p.y = 1; for (let i = 0; i < 120; i++) g.update(0.05, { ...I, mz: 1, camYaw: Math.PI / 2 });
  const y2 = p.y; p.x = 13.5; p.z = 21; for (let i = 0; i < 120; i++) g.update(0.05, { ...I, mz: 1, camYaw: -Math.PI / 2 });
  ok(y2 === 6 && p.y === 11, `玩家沿楼梯到达 2 楼(y=${y2}) 与 3 楼(y=${p.y})`);
  g.zm.list.length = 0; g.T = 2; const z = g.zm.spawn('walker', 30.5, 13.5, 1); let reached = false;
  for (let i = 0; i < 20 * 90; i++) { p.hp = 100; p.x = 20.5; p.z = 12.5; p.y = 11; g.update(0.05, I); g.events.length = 0; if (Math.abs(z.y - p.y) < 1 && Math.hypot(z.x - p.x, z.z - p.z) < 2) { reached = true; break; } }
  ok(reached, '感染者沿楼梯追到 3 楼');
}
{ // 性能：35 个感染者 60 秒逻辑
  const g = new Game(); g.T = 60; const t0 = Date.now(); let maxZ = 0;
  for (let i = 0; i < 1200; i++) { g.player.hp = 100; g.player.hunger = 100; g.player.thirst = 100; g.update(0.05, I); g.events.length = 0; maxZ = Math.max(maxZ, g.zm.alive); }
  const ms = Date.now() - t0; ok(maxZ <= 36 && ms / 1200 < 3, `60 秒逻辑耗时 ${ms}ms（每步 ${(ms / 1200).toFixed(2)}ms），最多 ${maxZ} 个感染者`);
}
console.log(fail ? `失败 ${fail}` : '全部通过'); process.exitCode = fail ? 1 : 0;

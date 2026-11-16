// 截图：白天游戏、夜间尸潮+Boss、NPC 对话（node tests/shots.cjs [m]）
const { chromium } = require(process.env.PW || '/workspace/work/pw/node_modules/playwright');
const SH = require('path').join(__dirname, '..', 'shots');
const m = process.argv[2] === 'm', tag = m ? 'mobile' : 'desktop';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(m ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', x => { if (x.type() === 'error' && !x.text().includes('ERR_FAILED')) errs.push(x.text().slice(0, 120)); });
  await p.route('https://cdn.babylonjs.com/**', r => r.abort());
  await p.goto('http://localhost:8765/index.html'); await p.waitForFunction(() => window.__game, null, { timeout: 90000 });
  await p.evaluate(() => { localStorage.clear(); __start(false); }); await p.waitForTimeout(500);
  // 白天：基地建设
  await p.evaluate(() => { const g = __game; g.T = 5; g.mission = 3; g.player.x = 30.5; g.player.z = 18; g.player.y = 1; g.player.yaw = 2.6; __renderer.camYaw = 2.5; __renderer.camPitch = 0.42;
    for (const [k, v] of Object.entries({ wood: 60, metal: 20, stone: 6, parts: 4, food: 3, water: 3 })) g.inv.add(k, v); g.inv.add('pipe', 1); g.equipSlot(g.inv.slots.findIndex(s => s.id === 'pipe'));
    const put = (i, x, z) => { g.buildType = i; g.buildMode = true; g.player.x = x + 0.5; g.player.z = z + 1.6; g.updateGhost({ x, y: 1, z }); g.place(); };
    for (let z = 9; z <= 17; z++) put(z === 13 ? 3 : 0, 29, z); put(2, 31, 12); put(2, 31, 14); put(7, 33, 16); g.buildMode = true; g.buildType = 1; g.player.x = 30.5; g.player.z = 18.5; g.zm.list.length = 0; g.zm.spawn('walker', 36, 9, 0); g.zm.spawn('runner', 38, 12, 0); });
  await p.waitForTimeout(1500); await p.screenshot({ path: `${SH}/${tag}_day.png` });
  // 夜间最终尸潮 + 巨型感染者
  await p.evaluate(() => { const g = __game; g.buildMode = false; g.T = 66.3; g.waveIdx = 2; g.airdropIdx = 2; g.mission = 9; g.radioFixed = true; g.player.x = 33.5; g.player.z = 12.5; g.player.hp = 85; __renderer.camYaw = 1.45; __renderer.camPitch = 0.62;
    const put = (i, x, z) => { g.buildType = i; g.buildMode = true; g.player.x = x - 1.5; g.player.z = z + 0.5; g.updateGhost({ x, y: 1, z }); g.place(); }; put(8, 31, 10); put(9, 34, 9); put(9, 34, 16); g.buildMode = false;
    const gen = [...g.world.structs.values()].find(s => s.type === 'gen'); gen.fuel = 6; g.player.x = 31.2; g.player.z = 12.5; });
  await p.waitForTimeout(300);
  await p.evaluate(() => { const g = __game; g.boss = g.zm.spawn('boss', 44, 12, 3); if (g.activeWave) g.activeWave.bossSpawned = true; ['walker', 'runner', 'climber', 'bloater', 'walker', 'runner', 'climber', 'walker'].forEach((t, i) => g.zm.spawn(t, 38 + (i % 4) * 1.5, 9 + Math.floor(i / 4) * 5, 3)); });
  await p.waitForTimeout(2600); await p.screenshot({ path: `${SH}/${tag}_night_boss.png` });
  // NPC 对话
  await p.evaluate(() => { const g = __game; g.T = 30; g.zm.list.length = 0; g.activeWave = null; g.boss = null; const n = g.npcs.get('engineer'); g.player.x = n.x - 0.3; g.player.z = n.z - 1.7; g.player.y = 1; g.player.yaw = 0; g.visited.mart = true; g.T = 25; __renderer.camYaw = 0.5; __renderer.camPitch = 0.22; g.update(0.05, { mx: 0, mz: 0, camYaw: 0 }); g.doFocus(g.findFocus()); document.getElementById('banner').className = ''; document.getElementById('toasts').innerHTML = ''; });
  await p.waitForTimeout(900); await p.screenshot({ path: `${SH}/${tag}_npc_dialogue.png` });
  console.log(tag, 'errors', errs.length ? errs.join(' | ') : 'none'); await b.close();
})();

// 浏览器端到端测试：按 tests/cases.json 逐条执行（node tests/e2e.cjs [m]）
// 需要本地静态服务器 http://localhost:8765 与 Playwright（开发环境专用）
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PW || '/workspace/work/pw/node_modules/playwright');
const CASES = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
const SHOTS = process.env.SHOTS || path.join(__dirname, '..', 'shots');
const mobile = process.argv[2] === 'm';
const tag = mobile ? 'mobile' : 'desktop';

// 每条用例的检查函数：在页面中执行，返回 {ok, info}
const CHECK = {
  inv_stack_capacity: () => { const g = __game; g.inv.slots.length = 0; g.inv.add('wood', 45); g.inv.add('stone', 1); return { ok: g.inv.slots.length === 3 && g.inv.count('wood') === 45, info: g.inv.slots.map(s => s.id + s.n).join(',') }; },
  inv_full_reject: () => { const g = __game; g.inv.slots.length = 0; for (let i = 0; i < 16; i++) g.inv.add('stick', 1); const o = g.world.objects.find(o => o.kind === 'crate' && o.alive); o.hits = 1; g.harvest(o, 1); const ok = o.alive; g.inv.slots.length = 0; return { ok, info: 'crate alive=' + o.alive }; },
  equip_weapon: () => { const g = __game; g.inv.slots.length = 0; g.equip = null; g.inv.add('axe', 1); g.inv.add('pipe', 1); g.equipSlot(0); const a = g.weapon().dmg; g.equipSlot(g.inv.slots.findIndex(s => s.id === 'pipe')); const b = g.weapon().dmg; return { ok: a === 44 && b === 28 && g.inv.count('axe') === 1, info: `${a}->${b}` }; },
  craft_all: () => { const g = __game; g.inv.slots.length = 0; g.equip = null; Object.entries({ wood: 20, metal: 15, parts: 2, cloth: 4, dirty: 2, food: 4 }).forEach(([k, v]) => g.inv.add(k, v)); g.player.x = 10.5; g.player.y = 1; g.player.z = 10.6; const r = ['stick', 'pipe', 'axe', 'bandage', 'water', 'can'].map(id => g.craft(id)); return { ok: r.every(Boolean) && g.inv.count('bandage') === 2 && g.inv.count('water') === 2, info: r.join(',') }; },
  craft_no_bench: () => { const g = __game; g.player.x = 47.5; g.player.z = 60; g.inv.add('wood', 5); return { ok: g.craft('stick') === false, info: 'refused' }; },
  build_all: () => { const g = __game; const B = ['wall', 'bar', 'spike', 'door', 'window', 'box', 'bench', 'tower', 'gen', 'lamp']; let x = 39, out = []; g.player.y = 1;
    B.forEach((id, i) => { g.inv.add('wood', 15); g.inv.add('metal', 8); g.inv.add('parts', 2); g.inv.add('stone', 2); const z = 182; g.player.x = x + 0.5; g.player.z = z - 1.5; g.buildMode = true; g.buildType = i; g.updateGhost({ x, y: 1, z }); out.push(g.ghost.ok || g.ghost.reason); g.place(); x += 2; });
    g.buildMode = false; return { ok: out.every(v => v === true), info: out.join(',') }; },
  build_blocked: () => { const g = __game; g.player.x = 39.5; g.player.z = 180.5; g.buildMode = true; g.buildType = 1; g.updateGhost({ x: 39, y: 1, z: 182 }); const r = g.ghost; g.buildMode = false; return { ok: !r.ok && r.reason === '已有其他工事', info: r.reason }; },
  door_toggle: () => { const g = __game; const d = [...g.world.structs.values()].find(s => s.type === 'door'); g.player.x = d.x + 0.5; g.player.z = d.z - 1.2; g.player.yaw = 0; g.focus = g.findFocus(); g.doFocus(g.focus); const a = d.open; g.doFocus(g.findFocus()); return { ok: a === true && d.open === false, info: `${a}->${d.open}` }; },
  chest_deposit_withdraw: () => { const g = __game; const b = [...g.world.structs.values()].find(s => s.type === 'box'); g.player.x = b.x + 0.5; g.player.z = b.z - 1.2; g.player.yaw = 0; g.doFocus(g.findFocus()); g.inv.add('stone', 5); g.storeAll(); const n = b.inv.slots.length; g.takeStored(0); const r = { ok: g.panel && g.panel.kind === 'storage' && n > 0 && b.inv.slots.length === n - 1, info: `box ${n}->${b.inv.slots.length}` }; g.closePanel(); return r; },
  climb_watchtower: () => { const g = __game; const t = [...g.world.structs.values()].find(s => s.type === 'tower'); g.player.x = t.x + 0.5; g.player.z = t.z - 1.6; g.player.y = 1; g.doFocus(g.findFocus()); const up = g.player.y; g.doFocus(g.findFocus()); return { ok: up === 5 && g.player.y === 1 && !g.player.onTower, info: `y ${up}->${g.player.y}` }; },
  generator_fuel_light: () => { const g = __game; g.T = 14; const gen = [...g.world.structs.values()].find(s => s.type === 'gen'), lamp = [...g.world.structs.values()].find(s => s.type === 'lamp'); g.player.x = gen.x + 0.5; g.player.z = gen.z - 1.2; g.player.yaw = 0; g.inv.add('fuel', 1); g.doFocus({ kind: 'gen', s: gen }); g.lampT = 0; g.updatePower(0.05); const z = g.zm.spawn('walker', lamp.x + 1.5, lamp.z + 0.5, 0); g.zm.update(0.05); const r = { ok: gen.fuel >= 5.9 && lamp.lit && g.lampAt(z.x, z.z) === lamp, info: `fuel ${gen.fuel.toFixed(1)} lit ${lamp.lit}` }; z.hp = 0; z.despawn = true; return r; },
  infected_types: () => { const g = __game; g.zm.list.length = 0; const T = ['walker', 'runner', 'climber', 'bloater', 'boss']; T.forEach((t, i) => g.zm.spawn(t, g.player.x + 3 + i, g.player.z + 4, 0)); const ok = T.every(t => g.zm.list.some(z => z.type === t)); for (const z of g.zm.list) if (z.type !== 'boss') g.zm.hurt(z, 999, 0, 0); return { ok, info: g.zm.list.length + ' alive after hits' }; },
  infected_climber: null, infected_bloater: null, infected_boss: null, explosion_damage_structure: null, stair_climb: null, // 由逻辑测试 tests/logic.mjs 覆盖
  sound_attract: () => { const g = __game; g.zm.list.length = 0; const z = g.zm.spawn('walker', g.player.x + 30, g.player.z, 0); g.noise(g.player.x + 18, g.player.z, 15); return { ok: z.state === 'investigate', info: z.state }; },
  npc_dialogue_recruit: () => { const g = __game; const out = []; for (const [id, need] of [['doctor', 'medkit'], ['engineer', 'can'], ['hunter', 'water']]) { const n = g.npcs.get(id); g.player.x = n.x; g.player.y = n.y; g.player.z = n.z - 1.6; g.player.yaw = 0; g.npcs.update(0.05); g.inv.add(need, 2); const f = g.findFocus(); g.doFocus(f); out.push(g.panel && g.panel.kind === 'npc'); g.npcCommand(id, 'give'); out.push(n.joined); g.closePanel(); }
    const eng = g.npcs.get('engineer'); g.player.x = eng.x + 1; g.player.z = eng.z; g.player.y = eng.y; const c = g.buildCost({ cost: { wood: 4 } }).wood; return { ok: out.every(Boolean) && c === 3, info: out.join(',') + ' wall cost ' + c }; },
  npc_commands: () => { const g = __game; const d = g.npcs.get('doctor'); g.player.x = d.x; g.player.z = d.z - 1.5; g.player.y = d.y; g.player.hp = 40; g.player.infect = 40; d.morale = 50;
    g.npcCommand('doctor', 'guard'); const m1 = d.mode; g.npcCommand('doctor', 'work'); const m2 = d.mode; g.npcCommand('doctor', 'follow'); g.inv.add('food', 1); g.npcCommand('doctor', 'feed'); g.npcCommand('doctor', 'treat');
    return { ok: m1 === 'guard' && m2 === 'work' && d.mode === 'follow' && d.morale > 50 && g.player.hp >= 80 && g.player.infect <= 10 && d.healCd > 0, info: `hp ${g.player.hp} inf ${g.player.infect}` }; },
  sleep: () => { const g = __game; g.zm.list.length = 0; g.player.x = 7.5; g.player.y = 1; g.player.z = 9.6; g.player.yaw = Math.PI; g.player.fatigue = 60; g.activeWave = null; const f = g.findFocus(); g.doFocus(f); const s = g.sleeping; return { ok: f && f.kind === 'sleep' && s, info: f && f.label }; },
  infection_value: () => { const g = __game; g.wake(); g.player.infect = 0; g.player.hp = 100; g.player.dead = false; g.state = 'play'; const st0 = g.player.dead; const z = { type: 'walker' }; for (let i = 0; i < 8; i++) g.damagePlayer(1, z); const a = g.player.infect; g.inv.add('medicine', 1); g.useSlot(g.inv.slots.findIndex(s => s.id === 'medicine')); return { ok: a > 0 && g.player.infect === Math.max(0, a - 45), info: `${a}->${g.player.infect}` }; },
  minimap_display: () => { document.getElementById('minimap').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); const ok = document.getElementById('bigmap').classList.contains('show'); document.getElementById('bigmap').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return { ok, info: 'bigmap toggled' }; },
  weather_cycle: () => { const g = __game; g.T = 8.5; const a = g.weather(), sa = g.weatherSense(); g.T = 40; const b = g.weather(); g.T = 20; return { ok: a === 'rain' && b === 'fog' && sa > 0, info: a + '/' + b }; },
  save_load: async () => null, settings_menu: async () => null, pause_menu: async () => null, // 下方单独执行
  audio_synth: () => { const A = __audio; A.init(); for (const t of ['swing', 'hit', 'harvest', 'break', 'place', 'explode', 'hurt', 'zdeath', 'groan', 'alarm', 'boss', 'shot', 'eat', 'drink', 'craft', 'door', 'ui', 'mission', 'radio', 'fuse', 'stomp', 'jump', 'end']) { A.last = {}; A.play(t); } A.update(__game, 0.05); const res = performance.getEntriesByType('resource').filter(r => /\.(mp3|ogg|wav|m4a)/.test(r.name)); return { ok: !!A.ctx && res.length === 0, info: 'ctx ' + (A.ctx && A.ctx.state) }; },
};
const ENDING_SETUP = {
  ending_all: () => { const g = __game; for (const n of g.npcs.list) { n.joined = true; n.dead = false; n.mode = 'follow'; } g.T = 72.05; g.update(0.05, { mx: 0, mz: 0, camYaw: 0 }); g.player.x = 47.5; g.player.z = 179.5; g.player.y = 1; for (const n of g.npcs.list) { n.x = 46.5; n.z = 178; n.y = 1; } },
  ending_alone: () => { const g = __game; g.T = 72.05; g.update(0.05, { mx: 0, mz: 0, camYaw: 0 }); g.player.x = 47.5; g.player.z = 179.5; g.player.y = 1; },
  ending_stay: () => { const g = __game; g.T = 72.05; g.update(0.05, { mx: 0, mz: 0, camYaw: 0 }); g.chooseStay(); g.T = g.evacLeave - 0.001; },
  ending_infected: () => { __game.player.infect = 100; },
  ending_dead: () => { __game.player.hp = -5; },
};
const ENDING_TITLE = { ending_all: '全员撤离', ending_alone: '独自撤离', ending_stay: '留守', ending_infected: '感染', ending_dead: '阵亡' };

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const vp = mobile ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } };
  const ctx = await b.newContext(vp); const p = await ctx.newPage();
  const errs = []; p.on('console', x => { if (x.type() === 'error') errs.push(x.text().slice(0, 300)); }); p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.route('https://cdn.babylonjs.com/**', r => r.abort());
  await p.goto('http://localhost:8765/index.html'); await p.waitForFunction(() => window.__game, null, { timeout: 90000 });
  await p.evaluate(() => { localStorage.clear(); const sc = __renderer.scene; const hook = (m) => { m.onError = (eff, errs) => console.error('MATERR ' + m.name + ' ' + String(errs).slice(0, 80)); }; sc.materials.forEach(hook); sc.onNewMaterialAddedObservable.add(hook); });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${SHOTS}/${tag}_title.png` });
  const res = [];
  const fresh = async () => { await p.evaluate(() => { document.getElementById('end').classList.remove('show'); __start(false); }); await p.waitForTimeout(300); };
  await p.click('#btnStart'); await p.waitForTimeout(700);
  for (const c of CASES) {
    let r; const e0 = errs.length;
    try {
      if (c.id.startsWith('ending_')) {
        await fresh(); await p.evaluate(ENDING_SETUP[c.id]); await p.waitForTimeout(1300);
        const t = await p.evaluate(() => document.getElementById('end').classList.contains('show') ? document.getElementById('endTitle').textContent : '');
        r = { ok: t.includes(ENDING_TITLE[c.id]), info: t };
        if (c.id === 'ending_all') await p.screenshot({ path: `${SHOTS}/${tag}_ending.png` });
        await fresh();
      } else if (c.id === 'save_load') {
        const a = await p.evaluate(() => { const g = __game; g.inv.add('parts', 3); g.mission = 6; g.radioFixed = true; document.getElementById('btnPause').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return JSON.stringify([g.inv.count('parts'), g.world.structs.size, g.mission, g.radioFixed, Math.floor(g.T)]); });
        await p.click('#btnQuit'); await p.waitForTimeout(300); await p.click('#btnContinue'); await p.waitForTimeout(800);
        const bb = await p.evaluate(() => { const g = __game; return JSON.stringify([g.inv.count('parts'), g.world.structs.size, g.mission, g.radioFixed, Math.floor(g.T)]); });
        const A = JSON.parse(a), Bb = JSON.parse(bb); r = { ok: A[0] === Bb[0] && A[1] === Bb[1] && Bb[2] >= A[2] && A[3] === Bb[3] && A[4] === Bb[4], info: a + ' vs ' + bb + '（读档后任务可自动推进）' };
      } else if (c.id === 'settings_menu') {
        await p.evaluate(() => document.getElementById('btnPause').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
        await p.click('#btnSettings'); await p.selectOption('#setQ', 'low'); await p.evaluate(() => { const v = document.getElementById('setV'); v.value = 40; v.dispatchEvent(new Event('input')); });
        await p.waitForTimeout(200); if (!mobile) await p.screenshot({ path: `${SHOTS}/${tag}_settings.png` });
        const s = await p.evaluate(() => ({ ...JSON.parse(localStorage.getItem('last72_settings')), vd: __renderer.viewDist })); r = { ok: s.quality === 'low' && s.volume === 0.4 && s.vd === 44, info: JSON.stringify(s) };
        await p.selectOption('#setQ', mobile ? 'mid' : 'high'); await p.click('#btnResume');
      } else if (c.id === 'pause_menu') {
        const t0 = await p.evaluate(() => { document.getElementById('btnPause').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return __game.T; });
        await p.waitForTimeout(1000); const t1 = await p.evaluate(() => __game.T); await p.click('#btnResume'); await p.waitForTimeout(800); const t2 = await p.evaluate(() => __game.T);
        r = { ok: t1 === t0 && t2 > t1, info: `${t0.toFixed(3)} ${t1.toFixed(3)} ${t2.toFixed(3)}` };
      } else if (c.id === 'touch_joystick_buttons') {
        if (!mobile) { r = { ok: true, skip: true, info: '仅触屏' }; }
        else {
          await p.evaluate(() => { const g = __game; g.player.x = 47.5; g.player.z = 60; g.player.y = 1; g.buildMode = false; g.zm.list.length = 0; });
          const cdp = await ctx.newCDPSession(p); const x0 = 90, y0 = 300; const z0 = await p.evaluate(() => [__game.player.x, __game.player.z]);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
          for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0, y: y0 - i * 10 }] }); await p.waitForTimeout(60); }
          await p.waitForTimeout(700); const z1 = await p.evaluate(() => [__game.player.x, __game.player.z]);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          const moved = Math.hypot(z1[0] - z0[0], z1[1] - z0[1]);
          await p.tap('#btnAttack'); const sw = await p.evaluate(() => __game.player.swing > 0 || __game.player.atkCd > 0);
          await p.tap('#btnBuild'); await p.waitForTimeout(150); const bm = await p.evaluate(() => __game.buildMode); await p.tap('#btnBuild');
          await p.tap('#btnBag'); await p.waitForTimeout(150); const bag = await p.evaluate(() => document.getElementById('bag').classList.contains('open')); await p.tap('#btnBag');
          const ov = await p.evaluate(() => { const a = document.getElementById('minimap').getBoundingClientRect(), c = document.getElementById('controls').getBoundingClientRect(); return a.right > c.left && a.bottom > c.top; });
          r = { ok: moved > 1 && sw && bm && bag && !ov, info: `moved ${moved.toFixed(1)} swing ${sw} build ${bm} bag ${bag}` };
        }
      } else if (CHECK[c.id] === null) { r = { ok: true, skip: true, info: '见 tests/logic.mjs' }; }
      else { r = await p.evaluate(CHECK[c.id]); }
    } catch (e) { r = { ok: false, info: 'EXC ' + e.message.slice(0, 200) }; }
    res.push({ id: c.id, system: c.system, ...r });
    console.log(`${r.ok ? (r.skip ? '－' : '✓') : '✗'} ${c.id} · ${c.system} · ${r.info || ''}${errs.length > e0 ? ' 〔控制台错误 +' + (errs.length - e0) + '〕' : ''}`);
  }
  const bad = errs.filter(e => !e.includes('ERR_FAILED') && !e.includes('cdn.babylonjs'));
  console.log(`[${tag}] 通过 ${res.filter(r => r.ok && !r.skip).length} / 跳过 ${res.filter(r => r.skip).length} / 失败 ${res.filter(r => !r.ok).length} · 控制台错误 ${bad.length}`);
  if (bad.length) console.log(bad.slice(0, 5).join('\n'));
  fs.writeFileSync(path.join(__dirname, `e2e_${tag}.json`), JSON.stringify({ results: res, consoleErrors: bad }, null, 1));
  await b.close();
  process.exit(res.some(r => !r.ok) || bad.length ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });

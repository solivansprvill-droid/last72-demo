// 存档 / 读档（localStorage）：世界由固定种子重新生成，只保存变化
import { Inventory } from './items.js';
import { BUILD_BY_ID, placeStruct, setDoor } from './builds.js';
import { B } from './voxels.js';

export const SAVE_KEY = 'last72_save_v1';

export function serialize(g) {
  const w = g.world, p = g.player;
  const removed = [], extra = [];
  for (const o of w.objects) {
    if (!o.alive && o.cells.length) removed.push(o.id);
    if (o.kind === 'airdrop' && o.alive) extra.push(o.cells[0]);
  }
  const hits = w.objects.filter(o => o.alive && o.hits !== o.maxHits && o.maxHits < 99).map(o => [o.id, o.hits]);
  return {
    v: 1, savedAt: Date.now(), T: g.T, time: g.time,
    player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, hunger: p.hunger, thirst: p.thirst, stamina: p.stamina, fatigue: p.fatigue, infect: p.infect, moved: p.moved },
    inv: g.inv.toJSON(), equip: g.equip,
    mission: g.mission, placed: g.placed, kills: g.kills, waveIdx: g.waveIdx, waves: g.waves.map(x => !!x.warned),
    active: g.activeWave ? { idx: g.activeWave.idx, left: Math.max(4, g.activeWave.count - g.activeWave.spawned + g.zm.list.filter(z => z.wave).length), boss: !!g.activeWave.boss, bossSpawned: !!g.activeWave.bossSpawned } : null,
    airdropIdx: g.airdropIdx, evacActive: g.evacActive, wave1Cleared: g.wave1Cleared, radioFixed: g.radioFixed, martLoot: g.martLoot,
    visited: g.visited, region: g.region, evacLeave: g.evacLeave, staying: g.staying, medkitGiven: !!g.medkitGiven, harvested: g.harvested || 0,
    removed, extra, hits,
    structs: [...w.structs.values()].map(s => ({ type: s.type, x: s.x, y: s.y, z: s.z, hp: s.hp, open: s.open, fuel: s.fuel, inv: s.inv ? s.inv.toJSON() : null })),
    specials: w.specials.map(o => ({ id: o.id, taken: !!o.taken })),
    npcs: g.npcs.toJSON(),
  };
}

export function restore(g, d) {
  const w = g.world, p = g.player;
  g.T = d.T; g.time = d.time;
  Object.assign(p, d.player); p.vy = 0;
  g.inv = Inventory.from(d.inv); g.equip = d.equip;
  for (const k of ['mission', 'placed', 'kills', 'waveIdx', 'airdropIdx', 'evacActive', 'wave1Cleared', 'radioFixed', 'martLoot', 'visited', 'region', 'evacLeave', 'staying', 'medkitGiven', 'harvested']) g[k] = d[k];
  d.waves.forEach((v, i) => { if (g.waves[i]) g.waves[i].warned = v; });
  for (const id of d.removed) { const o = w.objects[id]; if (o && o.alive) w.removeObject(o); }
  for (const [id, h] of d.hits || []) { const o = w.objects[id]; if (o) o.hits = h; }
  for (const [x, y, z] of d.extra || []) { const o = w.newObject('airdrop', 2, 'airdrop', '空投箱'); w.put(o, x, y, z, B.CRATE); }
  for (const s of d.structs) {
    const def = BUILD_BY_ID[s.type]; if (!def) continue;
    const st = placeStruct(g, def, s.x, s.y, s.z, s.hp);
    st.fuel = s.fuel || 0; if (s.inv) st.inv = Inventory.from(s.inv); else if (def.storage) st.inv = new Inventory(def.storage);
    if (def.door && s.open) setDoor(g, st, true);
  }
  for (const sp of d.specials) { const o = w.objects[sp.id]; if (o) o.taken = sp.taken; }
  if (g.radioFixed) { const r = w.specials.find(o => o.kind === 'radio'); if (r) { const c = r.cells[0]; w.set(c[0], c[1], c[2], B.RADIO_ON); w.obj[w.idx(c[0], c[1], c[2])] = r.id; } }
  g.npcs.load(d.npcs);
  if (d.active) {
    const base = d.active.idx < 3 ? g.waves[d.active.idx] : { name: '留守之夜', mix: { walker: 0.4, runner: 0.3, climber: 0.2, bloater: 0.1 } };
    g.activeWave = { ...base, idx: d.active.idx, count: d.active.left, spawned: 0, boss: d.active.boss, bossSpawned: d.active.bossSpawned && false };
  }
  w.version++;
}

export function saveGame(g) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(g))); return true; } catch (e) { return false; } }
export function loadSave() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ } }

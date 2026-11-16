// 游戏核心逻辑（与渲染完全分离，便于移植到 造化 / Babylon 模板）
import { World, W, D, B } from './voxels.js';
import { generateWorld, REGIONS, regionAt, START, EVAC_POS, STREETS, AVE } from './worldgen.js';
import { moveEntity, collides } from './physics.js';
import { Nav } from './nav.js';
import { ZombieManager, MAX_Z, ZTYPES, EXPLODE } from './zombies.js';
import { ITEMS, RECIPES, FIST, Inventory, rollLoot, itemName } from './items.js';
import { BUILDS, BUILD_BY_ID, canPlace, placeStruct, removeStruct, setDoor, setLamp, GEN_RANGE, LAMP_RADIUS, FUEL_HOURS } from './builds.js';

export let HOUR_SEC = 13;            // 1 游戏小时 = 13 秒
export const START_CLOCK = 6;        // 第1天 06:00 醒来
export const EVAC_HOUR = 72;
export const EVAC = EVAC_POS;
export { REGIONS };
export { BUILDS };
export const RES_NAMES = Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.name]));

export const WAVES = [
  { warn: 16, start: 18, count: 12, mix: { walker: 0.75, runner: 0.25 }, name: '第一次尸潮' },
  { warn: 40, start: 42, count: 20, mix: { walker: 0.45, runner: 0.28, climber: 0.17, bloater: 0.1 }, name: '第二次尸潮' },
  { warn: 64, start: 66, count: 28, mix: { walker: 0.33, runner: 0.3, climber: 0.2, bloater: 0.17 }, boss: true, name: '最终尸潮' },
];
function pickMix(mix) { let r = Math.random(), last = 'walker'; for (const k in mix) { last = k; r -= mix[k]; if (r <= 0) return k; } return last; }
export const AIRDROPS = [30, 54];

export const MISSIONS = [
  { id: 'wake', text: '醒来：走动一下，熟悉操作' },
  { id: 'supply', text: '找水和食物：食物×2、水×2（冰箱/物资箱）' },
  { id: 'wood', text: '收集木材：木材×12（砍树、拆家具）' },
  { id: 'base', text: '建立基地：放置 4 个工事（按 建造）' },
  { id: 'wave1', text: '抵御第一次尸潮（第1天 24:00 来袭）' },
  { id: 'mart', text: '超市补给：搜刮大型超市的货架×4', target: { x: 57, z: 64.5, name: '大型超市' } },
  { id: 'police', text: '警察局：找到通讯设备（后方装备室）', target: { x: 10.5, z: 115, name: '警察局装备室' } },
  { id: 'hosp', text: '中心医院：寻找医生和急救药品（楼上）', target: { x: 74.5, z: 140, name: '中心医院' } },
  { id: 'radio', text: '修复电台：带通讯设备+电子零件×2 回公寓 3 楼', target: { x: 21.5, z: 8.5, name: '公寓 3 楼电台' } },
  { id: 'evac', text: '坚守到第 72 小时，前往北部撤离区', target: { x: EVAC_POS.x, z: EVAC_POS.z, name: '北部撤离区' } },
];

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Game {
  constructor(opts = {}) {
    this.world = generateWorld(72);
    this.nav = new Nav(this.world);
    this.climbNav = new Nav(this.world, true);
    this.zm = new ZombieManager(this);
    this.events = [];
    this.player = {
      x: START.x, y: START.y, z: START.z, vy: 0, hw: 0.3, h: 1.75, onGround: false, canStep: true, yaw: 0,
      hp: 100, hunger: 80, thirst: 70, stamina: 100, dead: false, atkCd: 0, swing: 0, walk: 0,
      moved: 0, hurtT: 0, running: false,
    };
    this.inv = new Inventory(16);
    this.equip = null; // {id, n:1, dur}
    this.T = 0; this.time = 0;
    this.buildMode = false; this.buildType = 0; this.ghost = null;
    this.mission = 0; this.placed = 0; this.kills = 0;
    this.waveIdx = 0; this.activeWave = null; this.waveSpawnT = 0;
    this.airdropIdx = 0; this.spawnT = 3;
    this.state = 'play'; this.evacActive = false;
    this.wave1Cleared = false;
    this.waves = WAVES.map(w => ({ ...w }));
    this.panel = null; // {kind:'craft'|'storage', s}
    this.focus = null; this.focusT = 0;
    this.litLamps = [];
    this.lampT = 0;
    this.radioFixed = false; this.martLoot = 0; this.region = 'apt'; this.visited = { apt: true };
    this.evacLeave = 75;
    if (opts.hourSec) HOUR_SEC = opts.hourSec;
  }
  emit(e) { this.events.push(e); }
  toast(text, short) { this.emit({ type: 'toast', text, short }); }
  clockHour() { return (START_CLOCK + this.T) % 24; }
  day() { return Math.floor((START_CLOCK + this.T) / 24) + 1; }
  isNight() { const h = this.clockHour(); return h >= 19.5 || h < 5.5; }
  daylight() {
    const h = this.clockHour();
    if (h >= 7 && h <= 17.5) return 1;
    if (h > 17.5 && h < 20) return 1 - (h - 17.5) / 2.5;
    if (h >= 5 && h < 7) return (h - 5) / 2;
    return 0;
  }
  // 兼容：按名称读取数量
  count(id) { return this.inv.count(id); }
  give(loot) {
    const got = [], lost = [];
    for (const id in loot) {
      const left = this.inv.add(id, loot[id]);
      if (loot[id] - left > 0) got.push(`+${loot[id] - left} ${itemName(id)}`);
      if (left > 0) lost.push(itemName(id));
    }
    if (lost.length) this.toast('背包已满：' + lost.join('、') + ' 放不下');
    return got;
  }

  update(dt, input) {
    if (this.state !== 'play') return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.T += dt / HOUR_SEC;
    const p = this.player;
    this.updatePlayer(dt, input);
    this.nav.update(dt, p.x, p.z);
    this.zm.update(dt);
    this.updatePower(dt);
    this.director(dt);
    this.updateMission();
    if (this.buildMode) this.updateGhost(input.ghostCell);
    this.focusT -= dt; if (this.focusT <= 0) { this.focusT = 0.12; this.focus = this.findFocus(); }
    if (this.panel && !this.panelValid()) this.closePanel();
    if (p.hp <= 0 && !p.dead) { p.dead = true; this.state = 'lose'; this.emit({ type: 'end', win: false }); }
    if (this.evacActive && Math.hypot(p.x - EVAC.x, p.z - EVAC.z) < EVAC.r) { this.state = 'win'; this.emit({ type: 'end', win: true }); }
    this.updateRegion();
    if (this.T >= this.evacLeave && this.state === 'play') { this.state = 'lose'; this.loseReason = '撤离直升机已经离开'; this.emit({ type: 'end', win: false }); }
  }

  updatePlayer(dt, inp) {
    const p = this.player;
    const hr = dt / HOUR_SEC;
    p.hunger = Math.max(0, p.hunger - 2.4 * hr);
    p.thirst = Math.max(0, p.thirst - 3.4 * hr);
    if (p.hunger <= 0 || p.thirst <= 0) { p.hp -= 1.2 * dt; if (Math.random() < dt * 0.3) this.toast(p.hunger <= 0 ? '饥饿正在伤害你！' : '口渴正在伤害你！'); }
    else if (p.hunger > 50 && p.thirst > 50 && p.hp < 100) p.hp = Math.min(100, p.hp + 0.6 * dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    const cy = inp.camYaw;
    let mx = inp.mx, mz = inp.mz; const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const fx = Math.sin(cy), fz = Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
    let vx = fx * mz + rx * mx, vz = fz * mz + rz * mx;
    p.kx = (p.kx || 0) * Math.max(0, 1 - dt * 5); p.kz = (p.kz || 0) * Math.max(0, 1 - dt * 5);
    const moving = ml > 0.1;
    p.running = moving && inp.run && p.stamina > 3;
    const speed = p.running ? 6.6 : 4.2;
    if (p.running) p.stamina = Math.max(0, p.stamina - 16 * dt); else p.stamina = Math.min(100, p.stamina + (moving ? 10 : 18) * dt);
    vx *= speed; vz *= speed;
    if (moving) { const ty = Math.atan2(vx, vz); p.yaw += ang(ty - p.yaw) * Math.min(1, dt * 12); }
    if (inp.jump && p.onGround && p.stamina >= 5) { p.vy = 8.2; p.stamina -= 5; p.onGround = false; this.emit({ type: 'jump' }); }
    const ox = p.x, oz = p.z;
    moveEntity(this.world, p, (vx + p.kx) * dt, (vz + p.kz) * dt, dt);
    p.x = Math.max(0.5, Math.min(W - 0.5, p.x)); p.z = Math.max(0.5, Math.min(D - 0.5, p.z));
    const md = Math.hypot(p.x - ox, p.z - oz);
    p.moved += md; p.walk += md;
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.swing = Math.max(0, p.swing - dt);
    if (p.y < -5) { p.y = 3; p.x = START.x; p.z = START.z; }
    if (p.onTower && (Math.hypot(p.x - p.onTower.x - 0.5, p.z - p.onTower.z - 0.5) > 1.9 || p.y < p.onTower.y + 3.5 || p.onTower.hp <= 0)) p.onTower = null;
  }

  // ---------- 战斗 / 采集 ----------
  weapon() { return this.equip ? { ...ITEMS[this.equip.id].weapon, id: this.equip.id } : { ...FIST, id: null }; }
  wearWeapon(n) {
    if (!this.equip) return;
    this.equip.dur -= n;
    if (this.equip.dur <= 0) { this.toast(`${itemName(this.equip.id)} 损坏了！`); this.equip = null; this.emit({ type: 'equip' }); }
  }
  attack(target) {
    if (this.state !== 'play') return;
    if (this.buildMode) { this.place(); return; }
    const p = this.player;
    if (p.atkCd > 0) return;
    const wp = this.weapon();
    p.atkCd = wp.cd; p.swing = 0.3;
    const weak = p.stamina < 5;
    p.stamina = Math.max(0, p.stamina - 6);
    this.emit({ type: 'swing' });
    let tgtObj = null;
    if (target) {
      const o = this.world.objAt(target.x, target.y, target.z);
      const dd = Math.hypot(target.x + 0.5 - p.x, target.z + 0.5 - p.z);
      if (o && o.loot && dd < 3.2 && target.y < p.y + 3.5 && target.y > p.y - 2) { tgtObj = o; p.yaw = Math.atan2(target.x + 0.5 - p.x, target.z + 0.5 - p.z); }
    }
    let hit = 0;
    if (!tgtObj) {
      for (const zb of this.zm.list) {
        const dx = zb.x - p.x, dz = zb.z - p.z, d = Math.hypot(dx, dz);
        const reach = wp.reach + (zb.big ? 0.8 : 0);
        if (d > reach || Math.abs(zb.y - p.y) > 1.8) continue;
        const a = ang(Math.atan2(dx, dz) - p.yaw);
        if (Math.abs(a) > 1.1 && d > 0.8) continue;
        const dmg = Math.round((weak ? 0.45 : 1) * wp.dmg * (0.9 + Math.random() * 0.2));
        const kb = zb.big ? 1 : 7;
        this.zm.hurt(zb, dmg, dx / (d || 1) * kb, dz / (d || 1) * kb);
        hit++;
      }
    }
    if (hit) { this.wearWeapon(1); this.noise(p.x, p.z, 9); return; }
    const o = tgtObj || this.forwardObject();
    if (o) this.harvest(o, wp.harvest);
  }
  // 声音：战斗、爆炸、发电机会吸引附近感染者前来调查
  noise(x, z, r, quiet) { this.zm.noise(x, z, r); if (!quiet) this.lastNoise = { x, z, r, t: this.time }; }
  explode(x, y, z, src) {
    const { r, dmg, sdmg, zdmg } = EXPLODE, p = this.player;
    const pd = Math.hypot(p.x - x, p.z - z, (p.y + 0.9) - y);
    if (pd < r) { const k = 1 - pd / r; this.damagePlayer(Math.round(dmg * (0.35 + 0.65 * k)), src); const a = Math.atan2(p.x - x, p.z - z); p.kx = Math.sin(a) * 8 * k; p.kz = Math.cos(a) * 8 * k; p.vy = 5 * k; }
    if (this.npcs) for (const n of this.npcs.list) { if (n.dead || !n.met) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < r) this.damageNpc(n, Math.round(dmg * 0.7 * (1 - d / r) + 6), src); }
    for (const zb of this.zm.list) { if (zb === src) continue; const d = Math.hypot(zb.x - x, zb.z - z); if (d < r) this.zm.hurt(zb, Math.round(zdmg * (1 - d / r) + 10), (zb.x - x) * 3, (zb.z - z) * 3); }
    for (const s of [...this.world.structs.values()]) {
      const d = Math.hypot(s.x + 0.5 - x, s.z + 0.5 - z); if (d < r + 0.5 && Math.abs(s.y - y) < 3) this.damageStruct(s, Math.round(sdmg * Math.max(0.3, 1 - d / (r + 0.5))));
    }
    this.emit({ type: 'explode', x, y, z, r });
    this.noise(x, z, 26);
  }
  forwardObject() {
    const p = this.player, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    for (const hgt of [0.5, 1.3, 2.2]) for (let s = 0.3; s <= 1.9; s += 0.2) {
      const x = Math.floor(p.x + fx * s), y = Math.floor(p.y + hgt), z = Math.floor(p.z + fz * s);
      const o = this.world.objAt(x, y, z);
      if (o && o.loot) return o;
    }
    return null;
  }
  harvest(o, power = 1) {
    const c = o.cells[0];
    this.emit({ type: 'hit', x: c[0] + 0.5, y: c[1] + 0.5, z: c[2] + 0.5, block: this.world.get(c[0], c[1], c[2]) });
    if (o.hits - power > 0) { o.hits -= power; this.toast(`${o.name} ${'■'.repeat(o.hits)}${'□'.repeat(Math.max(0, o.maxHits - o.hits))}`, true); if (this.equip) this.wearWeapon(0.3); return; }
    if (!o.rolled) o.rolled = rollLoot(o.loot);
    if (!this.inv.canFit(o.rolled)) { o.hits = 1; this.toast('背包已满！先整理或存入储物箱'); return; }
    o.hits = 0;
    const blocks = o.cells.map(([x, y, z]) => ({ x, y, z, t: this.world.get(x, y, z) }));
    this.world.removeObject(o);
    const got = this.give(o.rolled);
    this.harvested = (this.harvested || 0) + 1;
    if (o.kind === 'mshelf') this.martLoot++;
    this.onHarvest(o);
    this.emit({ type: 'break', blocks });
    this.toast(`${o.name}：${got.join('  ') || '空的'}`);
    this.noise(c[0], c[2], o.kind === 'car' ? 12 : 6);
  }
  onHarvest() {}

  // ---------- 交互 ----------
  // 找出玩家附近最合适的交互目标
  findFocus() {
    const p = this.player, w = this.world;
    if (p.onTower) return { kind: 'tower_down', label: '爬下瞭望塔', s: p.onTower };
    let best = null, bs = 1e9;
    const consider = (score, f) => { if (score < bs) { bs = score; best = f; } };
    const facing = (x, z) => { const a = Math.abs(ang(Math.atan2(x - p.x, z - p.z) - p.yaw)); return a; };
    for (const s of w.structs.values()) {
      const cx = s.x + 0.5, cz = s.z + 0.5, d = Math.hypot(cx - p.x, cz - p.z);
      if (d > 2.6 || Math.abs(s.y - p.y) > 2.5) continue;
      const def = BUILD_BY_ID[s.type];
      const score = d + facing(cx, cz) * 0.8;
      if (def.door) consider(score, { kind: 'door', s, label: s.open ? '关门' : '开门' });
      else if (def.storage) consider(score, { kind: 'storage', s, label: '打开储物箱' });
      else if (def.bench) consider(score, { kind: 'bench', s, label: '使用工作台' });
      else if (def.gen) consider(score, { kind: 'gen', s, label: this.inv.count('fuel') ? `加燃油（剩余 ${Math.ceil(s.fuel)}h）` : `发电机：燃油 ${Math.ceil(s.fuel)}h` });
      else if (def.tower) consider(score, { kind: 'tower', s, label: '登上瞭望塔' });
      else if (s.hp < s.max) consider(score + 0.5, { kind: 'repair', s, label: `修理 ${def.name}（${this.costText(this.repairCost(s))}）` });
    }
    this.extraFocus(consider, facing);
    const o = this.forwardObject();
    if (o) consider(1.2, { kind: 'harvest', o, label: `采集 ${o.name}` });
    return best;
  }
  extraFocus(consider, facing) {
    const p = this.player;
    for (const o of this.world.specials || []) {
      if (!o.alive) continue;
      const c = o.cells[0]; const d = Math.hypot(c[0] + 0.5 - p.x, c[2] + 0.5 - p.z);
      if (d > 2.4 || Math.abs(c[1] - p.y) > 2.5) continue;
      const score = d + facing(c[0] + 0.5, c[2] + 0.5) * 0.8;
      if (o.kind === 'wbench') consider(score, { kind: 'bench', o, label: '使用工作台' });
      else if (o.kind === 'radio') consider(score, { kind: 'radio', o, label: this.radioFixed ? '电台：已联系军方' : '修复电台（通讯设备 + 电子零件×2）' });
      else if (o.kind === 'commsbox') consider(score, { kind: 'commsbox', o, label: o.taken ? '装备柜（已搜空）' : '打开装备柜' });
      else if (o.kind === 'medkit') consider(score, { kind: 'medkit', o, label: o.taken ? '药品柜（已搜空）' : '打开急救药品柜' });
      else if (o.kind === 'sleepbed' && this.sleepLabel) consider(score + 0.3, { kind: 'sleep', o, label: this.sleepLabel() });
    }
  }
  interact() {
    if (this.state !== 'play') return;
    if (this.panel) { this.closePanel(); return; }
    const f = this.findFocus(); this.focus = f;
    if (!f) { this.toast('附近没有可交互的东西', true); return; }
    this.doFocus(f);
  }
  doFocus(f) {
    const p = this.player;
    switch (f.kind) {
      case 'door': setDoor(this, f.s, !f.s.open); this.emit({ type: 'door', open: f.s.open, x: f.s.x, z: f.s.z }); break;
      case 'storage': this.openPanel({ kind: 'storage', s: f.s }); break;
      case 'bench': this.openPanel({ kind: 'craft', s: f.s || f.o }); break;
      case 'gen':
        if (this.inv.count('fuel') > 0) { this.inv.remove('fuel', 1); f.s.fuel += FUEL_HOURS; this.toast(`发电机燃油 +${FUEL_HOURS}h（共 ${Math.ceil(f.s.fuel)}h）`); this.emit({ type: 'gen', x: f.s.x, z: f.s.z }); }
        else this.toast('需要燃油（汽车、加油桶可获得）');
        break;
      case 'tower': {
        const s = f.s; p.x = s.x + 0.5; p.z = s.z + 0.5; p.y = s.y + 4; p.vy = 0; p.onTower = s;
        this.toast('登上瞭望塔：视野更开阔', true); break;
      }
      case 'tower_down': {
        const s = f.s; p.onTower = null;
        const opts = [[0, -1.6], [0, 1.6], [-1.6, 0], [1.6, 0], [-1.6, -1.6], [1.6, 1.6]];
        for (const [dx, dz] of opts) { if (!collides(this.world, s.x + 0.5 + dx, s.y, s.z + 0.5 + dz, p.hw, p.h)) { p.x = s.x + 0.5 + dx; p.z = s.z + 0.5 + dz; p.y = s.y; break; } }
        p.vy = 0; break;
      }
      case 'repair': this.repair(f.s); break;
      case 'harvest': this.harvest(f.o, this.weapon().harvest); break;
      default: this.doExtra(f);
    }
  }
  doExtra(f) {
    const o = f.o;
    if (f.kind === 'radio') {
      if (this.radioFixed) { this.toast('电台：军方确认第 72 小时在北部撤离区接应'); return; }
      if (!this.inv.count('comms') || this.inv.count('parts') < 2) { this.toast('电台损坏：需要 通讯设备 + 电子零件×2'); return; }
      this.inv.remove('comms', 1); this.inv.remove('parts', 2); this.radioFixed = true; this.evacLeave = 78;
      const c = o.cells[0]; this.world.set(c[0], c[1], c[2], B.RADIO_ON); o.cells.length = 0; o.cells.push(c); this.world.obj[this.world.idx(c[0], c[1], c[2])] = o.id;
      this.emit({ type: 'banner', text: '联系上军方了！', sub: '直升机将于第 72 小时降落在北部撤离区，停留到第 78 小时', kind: 'ok' });
      this.emit({ type: 'radio' });
    } else if (f.kind === 'commsbox' || f.kind === 'medkit') {
      if (o.taken) { this.toast('里面已经空了', true); return; }
      const loot = f.kind === 'commsbox' ? { comms: 1, parts: 2, bandage: 1 } : { medkit: 1, medicine: 2, bandage: 2 };
      if (!this.inv.canFit(loot)) { this.toast('背包已满！'); return; }
      o.taken = true; const got = this.give(loot);
      this.toast(`${o.name}：${got.join('  ')}`);
      this.emit({ type: 'questItem', id: f.kind });
    } else if (f.kind === 'sleep' && this.sleep) this.sleep();
  }
  // ---------- 区域 ----------
  updateRegion() {
    const p = this.player, rg = regionAt(p.z);
    if (rg.id === this.region) return;
    this.region = rg.id;
    if (!this.visited[rg.id]) {
      this.visited[rg.id] = true;
      this.emit({ type: 'banner', text: `进入：${rg.name}`, sub: { mart: '货架上可能还有食物和水', police: '装备室里也许有通讯设备', hosp: '小心楼上……', evac: '撤离直升机会在这里降落' }[rg.id] || '', kind: 'ok' });
      this.populate(rg);
    } else this.toast(`进入 ${rg.name}`, true);
  }
  buildingAt(x, z) { for (const b of this.world.buildings || []) if (x >= b.x0 && x < b.x1 + 1 && z >= b.z0 && z < b.z1 + 1) return b; return null; }
  freeCellIn(b, y, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const x = b.x0 + 1 + Math.floor(Math.random() * (b.x1 - b.x0 - 1)), z = b.z0 + 1 + Math.floor(Math.random() * (b.z1 - b.z0 - 1));
      if (!this.world.solid(x, y, z) && !this.world.solid(x, y + 1, z) && this.world.solid(x, y - 1, z) && Math.hypot(x - this.player.x, z - this.player.z) > 8) return [x + 0.5, z + 0.5];
    }
    return null;
  }
  // 首次进入区域：建筑内的感染者
  populate(rg) {
    const n = { mart: 6, police: 5, hosp: 8, evac: 4 }[rg.id] || 0;
    const bs = (this.world.buildings || []).filter(b => regionAt((b.z0 + b.z1) / 2).id === rg.id);
    for (let i = 0; i < n && this.zm.alive < MAX_Z - 4; i++) {
      const b = bs[i % Math.max(1, bs.length)]; if (!b) break;
      const fl = Math.floor(Math.random() * b.floors), y = fl * b.fh + 1;
      const c = this.freeCellIn(b, y); if (!c) continue;
      this.zm.spawn(this.ambientType(), c[0], c[1], 0, y);
    }
  }
  // 感染者上楼：每栋楼每层预计算到楼梯口的距离场
  stairField(b, f) {
    const key = f, w = this.world;
    b.fields = b.fields || {};
    let F = b.fields[key];
    if (F && F.ver === w.version) return F;
    if (F && this.time - F.t < 2) return F;
    const bw = b.x1 - b.x0 + 1, bd = b.z1 - b.z0 + 1, y = f * b.fh + 1;
    const dist = new Int16Array(bw * bd).fill(-1);
    const { sx, sz } = b.stairs, A = f % 2 === 0, lane = A ? sz : sz + 2;
    const ex = (A ? sx - 1 : sx + b.fh) - b.x0;
    const q = [];
    for (const ez of [lane - b.z0, lane + 1 - b.z0]) { dist[ex + ez * bw] = 0; q.push(ex + ez * bw); }
    const open = (x, z) => !w.solid(b.x0 + x, y, b.z0 + z) && !w.solid(b.x0 + x, y + 1, b.z0 + z);
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % bw, z = (i / bw) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= bw || nz >= bd) continue;
        const j = nx + nz * bw; if (dist[j] >= 0 || !open(nx, nz)) continue;
        dist[j] = dist[i] + 1; q.push(j);
      }
    }
    F = { dist, bw, bd, ver: w.version, t: this.time };
    b.fields[key] = F; return F;
  }
  stairPath(zb, p) {
    const b = this.buildingAt(p.x, p.z); if (!b || !b.stairs) return null;
    if (!(zb.x >= b.x0 && zb.x < b.x1 + 1 && zb.z >= b.z0 && zb.z < b.z1 + 1)) return null;
    const fp = Math.floor((p.y - 0.5) / b.fh), fz = Math.floor((zb.y - 0.5) / b.fh);
    if (fz >= fp || fz >= b.floors - 1) return null;
    const { sx, sz } = b.stairs, fh = b.fh, A = fz % 2 === 0, lane = A ? sz : sz + 2;
    const exit = A ? { x: sx + fh + 0.6, z: lane + 1 } : { x: sx - 0.6, z: lane + 1 };
    const onLane = zb.z >= lane - 0.1 && zb.z <= lane + 2.1 && zb.x >= sx - 1 && zb.x <= sx + fh + 1;
    if (onLane) return exit;
    const F = this.stairField(b, fz);
    const cx = Math.floor(zb.x) - b.x0, cz = Math.floor(zb.z) - b.z0;
    let best = cx >= 0 && cz >= 0 && cx < F.bw && cz < F.bd ? F.dist[cx + cz * F.bw] : -1, bx = cx, bz = cz;
    if (best === 0) return { x: (A ? sx - 0.2 : sx + fh + 0.2), z: lane + 1 };
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= F.bw || nz >= F.bd) continue;
      const v = F.dist[nx + nz * F.bw]; if (v < 0) continue;
      if (dx && dz && (F.dist[cx + dx + cz * F.bw] < 0 || F.dist[cx + (cz + dz) * F.bw] < 0)) continue;
      if (best < 0 || v < best) { best = v; bx = nx; bz = nz; }
    }
    return { x: b.x0 + bx + 0.5, z: b.z0 + bz + 0.5 };
  }
  objective() {
    const m = MISSIONS[this.mission];
    if (this.evacActive || this.T > EVAC_HOUR - 4) return { x: EVAC.x, z: EVAC.z, name: this.evacActive ? '北部撤离点' : `撤离点 ${Math.max(0, Math.ceil(EVAC_HOUR - this.T))}h 后开放` };
    return m && m.target ? m.target : null;
  }
  openPanel(pn) { this.panel = pn; if (this.buildMode) this.toggleBuild(); this.emit({ type: 'panel', panel: pn.kind }); }
  closePanel() { this.panel = null; this.emit({ type: 'panel', panel: null }); }
  panelValid() {
    const pn = this.panel, p = this.player; if (!pn) return false;
    const t = pn.s; if (!t) return true;
    if (t.cells && t.hp !== undefined && t.hp <= 0) return false;
    const x = t.x !== undefined ? t.x : t.cells[0][0], z = t.z !== undefined ? t.z : t.cells[0][2];
    return Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) < 3.6;
  }
  nearBench() {
    const p = this.player;
    for (const s of this.world.structs.values()) if (s.type === 'bench' && Math.hypot(s.x + 0.5 - p.x, s.z + 0.5 - p.z) < 3.6) return true;
    for (const o of this.world.specials || []) if (o.alive && o.kind === 'wbench') { const c = o.cells[0]; if (Math.hypot(c[0] + 0.5 - p.x, c[2] + 0.5 - p.z) < 3.6) return true; }
    return false;
  }
  craft(rid) {
    const r = RECIPES.find(x => x.id === rid); if (!r) return false;
    if (!this.nearBench()) { this.toast('需要靠近工作台'); return false; }
    if (!this.inv.has(r.cost)) { this.toast(`材料不足（需 ${this.costText(r.cost)}）`); return false; }
    this.inv.pay(r.cost);
    const left = this.inv.add(r.out, r.n);
    if (left) this.toast('背包已满，成品掉在地上消失了');
    this.crafted = (this.crafted || 0) + 1;
    this.toast(`制作 ${itemName(r.out)}${r.n > 1 ? ' ×' + r.n : ''}`);
    this.emit({ type: 'craft' });
    // 自动装备更好的武器
    if (ITEMS[r.out].weapon && (!this.equip || ITEMS[this.equip.id].weapon.dmg < ITEMS[r.out].weapon.dmg)) this.equipSlot(this.inv.slots.findIndex(s => s.id === r.out));
    return true;
  }
  // 背包物品操作
  useSlot(i) {
    const s = this.inv.slots[i]; if (!s) return;
    const def = ITEMS[s.id];
    if (def.weapon) { this.equipSlot(i); return; }
    if (!def.use) { this.toast(`${def.name}：任务/材料物品`); return; }
    this.applyUse(s.id); this.inv.remove(s.id, 1);
  }
  applyUse(id) {
    const u = ITEMS[id].use, p = this.player, out = [];
    if (u.hunger) { p.hunger = Math.min(100, p.hunger + u.hunger); out.push(`饱食+${u.hunger}`); }
    if (u.thirst) { p.thirst = Math.min(100, p.thirst + u.thirst); out.push(`水分+${u.thirst}`); }
    if (u.hp) { p.hp = Math.min(100, p.hp + u.hp); out.push(`生命+${u.hp}`); }
    if (u.infect && p.infect !== undefined) { p.infect = Math.max(0, Math.min(100, p.infect + u.infect)); out.push(`感染${u.infect > 0 ? '+' : ''}${u.infect}`); }
    this.toast(`${ITEMS[id].verb || '使用'}${ITEMS[id].name}：${out.join(' ')}`);
    this.emit({ type: 'use', id });
  }
  equipSlot(i) {
    const s = this.inv.slots[i]; if (!s || !ITEMS[s.id].weapon) return;
    this.inv.takeSlot(i);
    if (this.equip) this.inv.add(this.equip.id, 1, this.equip.dur);
    this.equip = { id: s.id, n: 1, dur: s.dur ?? ITEMS[s.id].weapon.dur };
    this.toast(`装备 ${itemName(s.id)}`); this.emit({ type: 'equip' });
  }
  unequip() {
    if (!this.equip) return;
    if (this.inv.slots.length >= this.inv.cap) { this.toast('背包已满'); return; }
    this.inv.add(this.equip.id, 1, this.equip.dur); this.equip = null; this.emit({ type: 'equip' });
  }
  dropSlot(i) { const s = this.inv.slots[i]; if (!s) return; this.inv.takeSlot(i); this.toast(`丢弃 ${itemName(s.id)}×${s.n}`, true); }
  // 储物箱
  storeSlot(i) {
    const pn = this.panel; if (!pn || pn.kind !== 'storage') return;
    const box = pn.s.inv || (pn.s.inv = new Inventory(24));
    const s = this.inv.slots[i]; if (!s) return;
    const left = ITEMS[s.id].weapon ? (box.slots.length < box.cap ? (box.add(s.id, 1, s.dur), 0) : 1) : box.add(s.id, s.n);
    if (left === s.n || (ITEMS[s.id].weapon && left)) { this.toast('储物箱已满'); return; }
    if (left) s.n = left; else this.inv.takeSlot(i);
  }
  takeStored(i) {
    const pn = this.panel; if (!pn || pn.kind !== 'storage' || !pn.s.inv) return;
    const box = pn.s.inv, s = box.slots[i]; if (!s) return;
    if (ITEMS[s.id].weapon) { if (this.inv.slots.length >= this.inv.cap) { this.toast('背包已满'); return; } this.inv.add(s.id, 1, s.dur); box.takeSlot(i); return; }
    const left = this.inv.add(s.id, s.n);
    if (left === s.n) { this.toast('背包已满'); return; }
    if (left) s.n = left; else box.takeSlot(i);
  }
  storeAll() { // 一键存入材料
    const pn = this.panel; if (!pn || pn.kind !== 'storage') return;
    for (let i = this.inv.slots.length - 1; i >= 0; i--) { const s = this.inv.slots[i]; if (ITEMS[s.id].cat === 'mat') this.storeSlot(i); }
  }
  repairCost(s) { const def = BUILD_BY_ID[s.type]; const c = {}; for (const k in def.cost) c[k] = Math.ceil(def.cost[k] / 2); return c; }
  canAfford(c) { return this.inv.has(c); }
  pay(c) { this.inv.pay(c); }
  costText(c) { return Object.entries(c).map(([k, v]) => `${itemName(k)}${v}`).join(' '); }
  repair(s) {
    const c = this.repairCost(s);
    if (!this.canAfford(c)) { this.toast(`修理需要 ${this.costText(c)}`); return; }
    this.pay(c); s.hp = s.max; this.markStruct(s);
    this.toast(`已修复 ${BUILD_BY_ID[s.type].name}`);
    this.emit({ type: 'repair' });
  }
  eat() {
    const id = this.player.hunger < 50 && this.inv.count('can') ? 'can' : (this.inv.count('food') ? 'food' : (this.inv.count('can') ? 'can' : null));
    if (!id) { this.toast('没有食物了'); return; }
    this.applyUse(id); this.inv.remove(id, 1);
  }
  drink() {
    const id = this.inv.count('water') ? 'water' : (this.inv.count('dirty') ? 'dirty' : null);
    if (!id) { this.toast('没有水了'); return; }
    this.applyUse(id); this.inv.remove(id, 1);
  }
  heal() {
    const id = this.player.infect > 40 && this.inv.count('medicine') ? 'medicine' : (this.inv.count('bandage') ? 'bandage' : (this.inv.count('medicine') ? 'medicine' : null));
    if (!id) { this.toast('没有绷带或药品'); return; }
    this.applyUse(id); this.inv.remove(id, 1);
  }

  // ---------- 建造 ----------
  toggleBuild() { this.buildMode = !this.buildMode; if (this.buildMode && this.panel) this.closePanel(); this.emit({ type: 'buildMode', on: this.buildMode }); }
  setBuildType(i) { if (i < 0 || i >= BUILDS.length) return; this.buildType = i; if (!this.buildMode) this.toggleBuild(); }
  buildCost(def) { return def.cost; }
  updateGhost(cell) {
    const p = this.player; const def = BUILDS[this.buildType];
    let gx, gz, gy = Math.floor(p.y + 0.05);
    const cd = cell ? Math.hypot(cell.x + 0.5 - p.x, cell.z + 0.5 - p.z) : 99;
    if (cell && cd < 7 && cd > 1.1 && Math.abs((cell.y ?? gy) - gy) <= 1) { gx = cell.x; gz = cell.z; if (cell.y !== undefined) gy = cell.y; }
    else { gx = Math.floor(p.x + Math.sin(p.yaw) * 1.6); gz = Math.floor(p.z + Math.cos(p.yaw) * 1.6); }
    const ex = this.world.structAt(gx, gz, gy);
    let ok = true, reason = '', repair = false;
    if (ex) {
      if (ex.type !== def.id) { ok = false; reason = '已有其他工事'; }
      else if (ex.hp >= ex.max) { ok = false; reason = '耐久已满'; }
      else repair = true;
    } else { reason = canPlace(this, def, gx, gy, gz); ok = !reason; }
    const cost = repair ? this.repairCost(ex) : this.buildCost(def);
    if (ok && !this.canAfford(cost)) { ok = false; reason = `材料不足（需 ${this.costText(cost)}）`; }
    this.ghost = { x: gx, y: gy, z: gz, ok, reason, def, repair, cost };
  }
  overlapsEntity(gx, gz, gy = 1) {
    const hit = (e) => e.x + e.hw > gx && e.x - e.hw < gx + 1 && e.z + e.hw > gz && e.z - e.hw < gz + 1 && e.y < gy + 2 && e.y + e.h > gy;
    if (hit(this.player)) return true;
    if (this.npcs && this.npcs.list.some(n => n.joined !== undefined && hit(n))) return true;
    return this.zm.list.some(hit);
  }
  place() {
    const g = this.ghost; if (!g) return;
    if (!g.ok) { this.toast(g.reason || '无法放置'); return; }
    const def = g.def;
    this.pay(g.cost);
    if (g.repair) { const s = this.world.structAt(g.x, g.z, g.y); s.hp = s.max; this.markStruct(s); this.toast(`已修复 ${def.name}`); return; }
    const s = placeStruct(this, def, g.x, g.y, g.z);
    if (def.storage) s.inv = new Inventory(def.storage);
    this.placed++;
    this.emit({ type: 'place', x: g.x + 0.5, y: g.y, z: g.z + 0.5, id: def.id });
    this.toast(`建造 ${def.name}`, true);
    this.updateGhost(null);
  }
  markStruct(s) { for (const c of s.cells) this.world.markDirty(c[0], c[2]); }
  damageStruct(s, dmg) {
    if (s.hp <= 0) return;
    s.hp -= dmg;
    this.emit({ type: 'structHit', x: s.x + 0.5, y: s.y + 0.2, z: s.z + 0.5, t: s.cells[0][3] });
    if (s.hp <= 0) this.destroyStruct(s);
    else this.markStruct(s);
  }
  destroyStruct(s) {
    const p = this.player;
    if (p.onTower === s) p.onTower = null;
    const blocks = removeStruct(this, s);
    if (s.inv && s.inv.slots.length) this.toast('储物箱被毁，里面的物资散落了！');
    this.emit({ type: 'break', blocks });
    this.toast(`${BUILD_BY_ID[s.type].name} 被摧毁了！`);
  }
  // 发电机 → 照明灯
  updatePower(dt) {
    this.lampT -= dt; if (this.lampT > 0) return;
    const step = 0.5 - this.lampT; this.lampT = 0.5;
    const gens = [], lamps = [];
    for (const s of this.world.structs.values()) { if (s.type === 'gen') gens.push(s); else if (s.type === 'lamp') lamps.push(s); }
    const dark = this.daylight() < 0.6;
    this.litLamps = [];
    const running = new Set();
    for (const l of lamps) {
      const g = dark && gens.find(g => g.fuel > 0 && Math.hypot(g.x - l.x, g.z - l.z) <= GEN_RANGE);
      setLamp(this, l, !!g);
      if (g) { running.add(g); this.litLamps.push(l); }
    }
    for (const g of gens) {
      g.running = running.has(g);
      if (g.running) { g.fuel = Math.max(0, g.fuel - step / HOUR_SEC); this.noise(g.x + 0.5, g.z + 0.5, 8, true); if (g.fuel <= 0) this.toast('发电机燃油耗尽！'); }
    }
  }
  lampAt(x, z) {
    for (const l of this.litLamps) if (Math.hypot(l.x + 0.5 - x, l.z + 0.5 - z) < LAMP_RADIUS) return l;
    return null;
  }
  damagePlayer(dmg) {
    const p = this.player; if (p.dead) return;
    p.hp -= dmg; p.hurtT = 0.4;
    this.emit({ type: 'hurt', dmg });
  }
  onZombieDeath(zb) {
    this.kills++;
    this.emit({ type: 'zdeath', x: zb.x, y: zb.y, z: zb.z, ztype: zb.type, id: zb.id });
    if (Math.random() < 0.3) { const k = Math.random() < 0.5 ? 'metal' : (Math.random() < 0.5 ? 'cloth' : 'food'); if (!this.inv.add(k, 1)) this.toast(`感染者碎裂了，掉落 +1 ${itemName(k)}`, true); }
  }

  // ---------- 时间 / 尸潮 / 刷怪 ----------
  spawnPoint(far = 22) {
    const p = this.player;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, d = far + Math.random() * 14;
      const x = Math.floor(p.x + Math.sin(a) * d), z = Math.floor(p.z + Math.cos(a) * d);
      if (x < 2 || z < 2 || x > W - 3 || z > D - 3) continue;
      if (this.nav.isOpen(x, z) && !this.world.solid(x, 1, z) && !this.world.solid(x, 2, z) && !this.buildingAt(x, z)) return [x + 0.5, z + 0.5];
    }
    // 退回：附近街道两端
    let best = null, bd = 1e9;
    for (const z0 of STREETS) for (const x of [2.5, W - 2.5]) { const d = Math.abs(Math.hypot(x - p.x, z0 + 2.5 - p.z) - far - 8); if (d < bd) { bd = d; best = [x, z0 + 2.5]; } }
    return best;
  }
  director(dt) {
    const T = this.T;
    const wv = this.waves[this.waveIdx];
    if (wv) {
      if (!wv.warned && T >= wv.warn) { wv.warned = true; this.emit({ type: 'banner', text: `⚠ ${wv.name}将在 2 小时后来袭！`, sub: '加固防线，备好食物和水', kind: 'warn' }); }
      if (T >= wv.start) { this.activeWave = { ...wv, idx: this.waveIdx, spawned: 0 }; this.waveIdx++; this.emit({ type: 'banner', text: `${wv.name}来了！`, sub: `约 ${wv.count} 名感染者正在逼近`, kind: 'wave' }); this.emit({ type: 'wave' }); }
    }
    const aw = this.activeWave;
    if (aw) {
      this.waveSpawnT -= dt;
      if (aw.spawned < aw.count && this.waveSpawnT <= 0 && this.zm.alive < MAX_Z) {
        this.waveSpawnT = 1.2;
        const [x, z] = this.spawnPoint(24);
        const zb = this.zm.spawn(pickMix(aw.mix), x + Math.random() - 0.5, z + Math.random() - 0.5, aw.idx + 1);
        if (zb) aw.spawned++;
      }
      if (aw.boss && !aw.bossSpawned && aw.spawned >= 6) {
        aw.bossSpawned = true;
        const [x, z] = this.spawnPoint(24);
        this.boss = this.zm.spawn('boss', x, z, aw.idx + 1);
        this.emit({ type: 'banner', text: '⚠ 巨型感染者出现了！', sub: '它会砸毁路障——用陷阱和照明灯拖住它', kind: 'wave' }); this.emit({ type: 'boss' });
      }
      const remaining = this.zm.list.filter(z => z.wave === aw.idx + 1).length;
      if (aw.spawned >= aw.count && remaining === 0) {
        if (aw.idx === 0) this.wave1Cleared = true;
        this.emit({ type: 'banner', text: `${aw.name}已击退！`, sub: aw.idx < 2 ? '趁天亮补充物资、修理工事' : '坚持住，直升机快到了', kind: 'ok' });
        this.activeWave = null;
      } else if (T > aw.start + 5 && aw.idx === 0 && aw.spawned >= aw.count) { this.wave1Cleared = true; }
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 2.5;
      const d = this.day();
      const target = Math.round((this.isNight() ? 8 + d * 3 : 4 + d * 2) * regionAt(this.player.z).density);
      const ambient = this.zm.list.filter(z => !z.wave).length;
      if (ambient < target && this.zm.alive < MAX_Z - 2 && this.T > 0.6) {
        const [x, z] = this.spawnPoint(22);
        this.zm.spawn(this.ambientType(), x, z, 0);
      }
    }
    if (this.airdropIdx < AIRDROPS.length && T >= AIRDROPS[this.airdropIdx]) {
      this.airdropIdx++;
      const n = this.dropSupplies();
      this.emit({ type: 'banner', text: '空投补给已投放到附近主路！', sub: `${n} 个物资箱落在南北主干道上`, kind: 'ok' });
    }
    if (!this.evacActive && T >= EVAC_HOUR) {
      this.evacActive = true;
      this.emit({ type: 'banner', text: '撤离直升机已抵达北部撤离区！', sub: `直升机将停留到第 ${this.evacLeave} 小时，快去！`, kind: 'evac' });
      this.emit({ type: 'evac' });
    }
  }
  ambientType() {
    const d = this.day(), n = this.isNight(), r = Math.random();
    if (d >= 2 && r < 0.06 * (d - 1)) return 'bloater';
    if (d >= 2 && r < 0.16 * (d - 1)) return 'climber';
    return Math.random() < (n ? 0.3 : 0.12) * d ? 'runner' : 'walker';
  }
  dropSupplies() {
    let n = 0; const pz = Math.max(8, Math.min(D - 30, this.player.z));
    for (let i = 0; i < 60 && n < 6; i++) {
      const x = AVE.x0 + 1 + Math.floor(Math.random() * 8), z = Math.floor(pz - 14 + Math.random() * 28);
      if (this.world.get(x, 1, z) !== B.AIR || this.world.structAt(x, z)) continue;
      const o = this.world.newObject('airdrop', 2, 'airdrop', '空投箱');
      this.world.put(o, x, 1, z, B.CRATE); n++;
      this.emit({ type: 'drop', x: x + 0.5, z: z + 0.5 });
    }
    return n;
  }
  missionDone(m) {
    const inv = this.inv, p = this.player;
    switch (m.id) {
      case 'wake': return p.moved > 4;
      case 'supply': return (inv.count('food') + inv.count('can') >= 2 && inv.count('water') + inv.count('dirty') >= 2) || this.T > 14;
      case 'wood': return inv.count('wood') >= 12 || this.placed >= 3 || this.T > 15;
      case 'base': return this.placed >= 4 || this.T > 18;
      case 'wave1': return this.wave1Cleared;
      case 'mart': return this.martLoot >= 4;
      case 'police': return inv.count('comms') > 0 || this.radioFixed;
      case 'hosp': return inv.count('medkit') > 0 || (this.npcs && this.npcs.get('doctor').joined) || this.medkitGiven;
      case 'radio': return this.radioFixed;
      default: return false;
    }
  }
  updateMission() {
    for (let guard = 0; guard < 3; guard++) {
      const m = MISSIONS[this.mission]; if (!m || !this.missionDone(m)) return;
      this.mission++; const nm = MISSIONS[this.mission];
      if (nm) this.emit({ type: 'mission', text: nm.text });
    }
  }
  survivedHours() { return Math.floor(this.T); }
  structureHint() { return this.focus ? this.focus.label : null; }
}
export { World, collides, RECIPES, ITEMS };

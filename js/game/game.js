// 游戏核心逻辑（与渲染完全分离，便于移植到 造化 / Babylon 模板）
import { World, generateWorld, W, D, B } from './voxels.js';
import { moveEntity, collides } from './physics.js';
import { Nav } from './nav.js';
import { ZombieManager, MAX_Z } from './zombies.js';

export const HOUR_SEC = 13;          // 1 游戏小时 = 13 秒，72h ≈ 15.6 分钟
export const START_CLOCK = 6;        // 第1天 06:00 醒来
export const EVAC_HOUR = 72, EVAC_LEAVE = 77;
export const EVAC = { x: 31.5, z: 57.5, r: 4.5 };

export const BUILDS = [
  { id: 'wall', name: '木墙', cost: { wood: 4 }, hp: 120, h: 2, voxel: B.S_WALL, solid: true },
  { id: 'bar', name: '路障', cost: { wood: 3, metal: 2 }, hp: 280, h: 2, voxel: B.S_BAR, solid: true },
  { id: 'spike', name: '尖刺陷阱', cost: { metal: 2, stone: 2 }, hp: 90, h: 1, voxel: B.S_SPIKE, solid: false },
];
export const RES_NAMES = { wood: '木材', stone: '石料', metal: '金属', food: '食物', water: '水' };

export const WAVES = [
  { warn: 16, start: 18, count: 12, rr: 0.25, name: '第一次尸潮' },
  { warn: 40, start: 42, count: 18, rr: 0.4, name: '第二次尸潮' },
  { warn: 66, start: 68, count: 26, rr: 0.5, name: '最终尸潮' },
];
export const AIRDROPS = [30, 54];

export const MISSIONS = [
  { id: 'wake', text: '醒来：走动一下，熟悉操作' },
  { id: 'supply', text: '找水和食物：食物×2、水×2（冰箱/物资箱/储水桶）' },
  { id: 'wood', text: '收集木材：木材×12（砍树、拆家具）' },
  { id: 'base', text: '建立基地：放置 4 个防御工事（按 建造）' },
  { id: 'wave1', text: '抵御第一次尸潮（约 18h 夜间来袭）' },
  { id: 'hold', text: '坚守：活到第 72 小时' },
  { id: 'evac', text: '撤离：前往北部撤离点！' },
];

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export class Game {
  constructor() {
    this.world = generateWorld(72);
    this.nav = new Nav(this.world);
    this.zm = new ZombieManager(this);
    this.events = [];
    this.player = {
      x: 8.5, y: 1, z: 8.5, vy: 0, hw: 0.3, h: 1.75, onGround: false, canStep: true, yaw: 0,
      hp: 100, hunger: 80, thirst: 70, stamina: 100, dead: false, atkCd: 0, swing: 0, walk: 0,
      moved: 0, hurtT: 0, running: false,
    };
    this.inv = { wood: 0, stone: 0, metal: 0, food: 0, water: 0 };
    this.T = 0; this.time = 0;
    this.buildMode = false; this.buildType = 0; this.ghost = null;
    this.mission = 0; this.placed = 0; this.kills = 0;
    this.waveIdx = 0; this.activeWave = null; this.waveSpawned = 0; this.waveSpawnT = 0;
    this.airdropIdx = 0; this.spawnT = 3;
    this.state = 'play'; this.evacActive = false;
    this.wave1Cleared = false;
    this.waves = WAVES.map(w => ({ ...w }));
  }
  emit(e) { this.events.push(e); }
  clockHour() { return (START_CLOCK + this.T) % 24; }
  day() { return Math.floor((START_CLOCK + this.T) / 24) + 1; }
  isNight() { const h = this.clockHour(); return h >= 19.5 || h < 5.5; }
  // 0 = 深夜, 1 = 正午
  daylight() {
    const h = this.clockHour();
    if (h >= 7 && h <= 17.5) return 1;
    if (h > 17.5 && h < 20) return 1 - (h - 17.5) / 2.5;
    if (h >= 5 && h < 7) return (h - 5) / 2;
    return 0;
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
    this.director(dt);
    this.updateMission();
    if (this.buildMode) this.updateGhost(input.ghostCell);
    if (p.hp <= 0 && !p.dead) { p.dead = true; this.state = 'lose'; this.emit({ type: 'end', win: false }); }
    if (this.evacActive && Math.hypot(p.x - EVAC.x, p.z - EVAC.z) < EVAC.r) { this.state = 'win'; this.emit({ type: 'end', win: true }); }
    if (this.T >= EVAC_LEAVE && this.state === 'play') { this.state = 'lose'; this.loseReason = '撤离直升机已经离开'; this.emit({ type: 'end', win: false }); }
  }

  updatePlayer(dt, inp) {
    const p = this.player;
    // 生存数值
    const hr = dt / HOUR_SEC;
    p.hunger = Math.max(0, p.hunger - 2.4 * hr);
    p.thirst = Math.max(0, p.thirst - 3.4 * hr);
    if (p.hunger <= 0 || p.thirst <= 0) { p.hp -= 1.2 * dt; if (Math.random() < dt) this.emit({ type: 'toast', text: p.hunger <= 0 ? '饥饿正在伤害你！' : '口渴正在伤害你！' }); }
    else if (p.hunger > 50 && p.thirst > 50 && p.hp < 100) p.hp = Math.min(100, p.hp + 0.6 * dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    // 移动（相对相机）
    const cy = inp.camYaw;
    let mx = inp.mx, mz = inp.mz; const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const fx = Math.sin(cy), fz = Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
    let vx = fx * mz + rx * mx, vz = fz * mz + rz * mx;
    const moving = ml > 0.1;
    p.running = moving && inp.run && p.stamina > 3;
    const speed = p.running ? 6.6 : 4.2;
    if (p.running) p.stamina = Math.max(0, p.stamina - 16 * dt); else p.stamina = Math.min(100, p.stamina + (moving ? 10 : 18) * dt);
    vx *= speed; vz *= speed;
    if (moving) { const ty = Math.atan2(vx, vz); let d = ty - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); p.yaw += d * Math.min(1, dt * 12); }
    if (inp.jump && p.onGround && p.stamina >= 5) { p.vy = 8.2; p.stamina -= 5; p.onGround = false; this.emit({ type: 'jump' }); }
    const ox = p.x, oz = p.z;
    moveEntity(this.world, p, vx * dt, vz * dt, dt);
    p.x = Math.max(0.5, Math.min(W - 0.5, p.x)); p.z = Math.max(0.5, Math.min(D - 0.5, p.z));
    const md = Math.hypot(p.x - ox, p.z - oz);
    p.moved += md; p.walk += md;
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.swing = Math.max(0, p.swing - dt);
    if (p.y < -5) { p.y = 3; p.x = 8.5; p.z = 8.5; }
  }

  // ---------- 动作 ----------
  attack(target) {
    if (this.state !== 'play') return;
    if (this.buildMode) { this.place(); return; }
    const p = this.player;
    if (p.atkCd > 0) return;
    p.atkCd = 0.42; p.swing = 0.3;
    const weak = p.stamina < 5;
    p.stamina = Math.max(0, p.stamina - 6);
    this.emit({ type: 'swing' });
    // 若点击了附近可采集方块，则转身面向它
    let tgtObj = null;
    if (target) {
      const o = this.world.objAt(target.x, target.y, target.z);
      const dd = Math.hypot(target.x + 0.5 - p.x, target.z + 0.5 - p.z);
      if (o && o.loot && dd < 3.2 && target.y < p.y + 3.5) { tgtObj = o; p.yaw = Math.atan2(target.x + 0.5 - p.x, target.z + 0.5 - p.z); }
    }
    // 近战：前方扇形
    let hit = 0;
    if (!tgtObj) {
      for (const zb of this.zm.list) {
        const dx = zb.x - p.x, dz = zb.z - p.z, d = Math.hypot(dx, dz);
        if (d > 2.1 || Math.abs(zb.y - p.y) > 1.8) continue;
        let a = Math.atan2(dx, dz) - p.yaw; a = Math.atan2(Math.sin(a), Math.cos(a));
        if (Math.abs(a) > 1.1 && d > 0.8) continue;
        this.zm.hurt(zb, weak ? 10 : 25, dx / (d || 1) * 7, dz / (d || 1) * 7);
        hit++;
      }
    }
    if (hit) return;
    const o = tgtObj || this.forwardObject();
    if (o) this.harvest(o);
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
  harvest(o) {
    o.hits--;
    const c = o.cells[0];
    this.emit({ type: 'hit', x: c[0] + 0.5, y: c[1] + 0.5, z: c[2] + 0.5, block: this.world.get(c[0], c[1], c[2]) });
    if (o.hits > 0) { this.emit({ type: 'toast', text: `${o.name} ${'■'.repeat(o.hits)}${'□'.repeat(o.maxHits - o.hits)}`, short: true }); return; }
    const blocks = o.cells.map(([x, y, z]) => ({ x, y, z, t: this.world.get(x, y, z) }));
    this.world.removeObject(o);
    let loot = o.loot;
    if (loot === 'crate') {
      loot = {}; const keys = ['food', 'water', 'metal', 'wood', 'food', 'water'];
      for (let i = 0; i < rand(2, 3); i++) { const k = keys[rand(0, keys.length - 1)]; loot[k] = [(loot[k]?.[0] || 0) + rand(1, 2), 0]; }
      for (const k in loot) loot[k] = [loot[k][0], loot[k][0]];
    }
    const got = [];
    for (const k in loot) { const n = rand(loot[k][0], loot[k][1]); if (n > 0) { this.inv[k] += n; got.push(`+${n} ${RES_NAMES[k]}`); } }
    this.emit({ type: 'break', blocks });
    this.emit({ type: 'toast', text: `${o.name}：${got.join('  ') || '空的'}` });
  }
  interact() {
    if (this.state !== 'play') return;
    const s = this.nearDamaged();
    if (s) { this.repair(s); return; }
    const o = this.forwardObject();
    if (o) { this.harvest(o); return; }
    this.emit({ type: 'toast', text: '附近没有可交互的东西', short: true });
  }
  nearDamaged() {
    const p = this.player; let best = null, bd = 2.6;
    for (const s of this.world.structs.values()) {
      if (s.hp >= s.max) continue;
      const d = Math.hypot(s.x + 0.5 - p.x, s.z + 0.5 - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  repairCost(s) { const def = BUILDS.find(b => b.id === s.type); const c = {}; for (const k in def.cost) c[k] = Math.ceil(def.cost[k] / 2); return c; }
  canAfford(c) { for (const k in c) if (this.inv[k] < c[k]) return false; return true; }
  pay(c) { for (const k in c) this.inv[k] -= c[k]; }
  costText(c) { return Object.entries(c).map(([k, v]) => `${RES_NAMES[k]}${v}`).join(' '); }
  repair(s) {
    const c = this.repairCost(s);
    if (!this.canAfford(c)) { this.emit({ type: 'toast', text: `修理需要 ${this.costText(c)}` }); return; }
    this.pay(c); s.hp = s.max; this.markStruct(s);
    this.emit({ type: 'toast', text: `已修复 ${BUILDS.find(b => b.id === s.type).name}` });
  }
  eat() {
    if (this.inv.food <= 0) { this.emit({ type: 'toast', text: '没有食物了' }); return; }
    this.inv.food--; this.player.hunger = Math.min(100, this.player.hunger + 35); this.player.hp = Math.min(100, this.player.hp + 5);
    this.emit({ type: 'toast', text: '进食 +35 饱食' });
  }
  drink() {
    if (this.inv.water <= 0) { this.emit({ type: 'toast', text: '没有水了' }); return; }
    this.inv.water--; this.player.thirst = Math.min(100, this.player.thirst + 40);
    this.emit({ type: 'toast', text: '饮水 +40 水分' });
  }
  toggleBuild() { this.buildMode = !this.buildMode; this.emit({ type: 'buildMode', on: this.buildMode }); }
  setBuildType(i) { this.buildType = i; if (!this.buildMode) this.toggleBuild(); }

  updateGhost(cell) {
    const p = this.player; const def = BUILDS[this.buildType];
    let gx, gz;
    const cd = cell ? Math.hypot(cell.x + 0.5 - p.x, cell.z + 0.5 - p.z) : 99;
    if (cell && cd < 7 && cd > 1.1) { gx = cell.x; gz = cell.z; }
    else { gx = Math.floor(p.x + Math.sin(p.yaw) * 1.6); gz = Math.floor(p.z + Math.cos(p.yaw) * 1.6); }
    const ex = this.world.structAt(gx, gz);
    let ok = true, reason = '';
    if (gx < 1 || gz < 1 || gx >= W - 1 || gz >= D - 1) { ok = false; reason = '超出范围'; }
    else if (ex) {
      if (ex.type !== def.id) { ok = false; reason = '已有其他工事'; }
      else if (ex.hp >= ex.max) { ok = false; reason = '耐久已满'; }
    } else {
      if (this.world.get(gx, 1, gz) !== B.AIR || (def.h > 1 && this.world.get(gx, 2, gz) !== B.AIR)) { ok = false; reason = '位置被占用'; }
      else if (def.solid && this.overlapsEntity(gx, gz)) { ok = false; reason = '有人站在这里'; }
    }
    const cost = ex && ex.type === def.id ? this.repairCost(ex) : def.cost;
    if (ok && !this.canAfford(cost)) { ok = false; reason = `材料不足（需 ${this.costText(cost)}）`; }
    this.ghost = { x: gx, z: gz, ok, reason, h: def.h, repair: !!ex, cost };
  }
  overlapsEntity(gx, gz) {
    const hit = (e) => e.x + e.hw > gx && e.x - e.hw < gx + 1 && e.z + e.hw > gz && e.z - e.hw < gz + 1 && e.y < 3;
    if (hit(this.player)) return true;
    return this.zm.list.some(hit);
  }
  place() {
    const g = this.ghost; if (!g) return;
    if (!g.ok) { this.emit({ type: 'toast', text: g.reason || '无法放置' }); return; }
    const def = BUILDS[this.buildType];
    this.pay(g.cost);
    if (g.repair) { const s = this.world.structAt(g.x, g.z); s.hp = s.max; this.markStruct(s); this.emit({ type: 'toast', text: `已修复 ${def.name}` }); return; }
    const s = { type: def.id, x: g.x, z: g.z, hp: def.hp, max: def.hp, h: def.h, voxel: def.voxel };
    this.world.structs.set(g.x + g.z * W, s);
    for (let y = 1; y <= def.h; y++) this.world.set(g.x, y, g.z, def.voxel);
    this.placed++;
    this.emit({ type: 'place', x: g.x + 0.5, z: g.z + 0.5 });
    this.emit({ type: 'toast', text: `建造 ${def.name}`, short: true });
  }
  markStruct(s) { this.world.markDirty(s.x, s.z); }
  damageStruct(s, dmg) {
    s.hp -= dmg;
    this.emit({ type: 'structHit', x: s.x + 0.5, y: 1.2, z: s.z + 0.5, t: s.voxel });
    if (s.hp <= 0) {
      const blocks = [];
      for (let y = 1; y <= s.h; y++) { blocks.push({ x: s.x, y, z: s.z, t: s.voxel }); this.world.set(s.x, y, s.z, B.AIR); }
      this.world.structs.delete(s.x + s.z * W);
      this.emit({ type: 'break', blocks });
      this.emit({ type: 'toast', text: `${BUILDS.find(b => b.id === s.type).name} 被摧毁了！` });
    } else this.markStruct(s);
  }
  damagePlayer(dmg) {
    const p = this.player; if (p.dead) return;
    p.hp -= dmg; p.hurtT = 0.4;
    this.emit({ type: 'hurt' });
  }
  onZombieDeath(zb) {
    this.kills++;
    this.emit({ type: 'zdeath', x: zb.x, y: zb.y, z: zb.z, ztype: zb.type, id: zb.id });
    if (Math.random() < 0.3) { const k = Math.random() < 0.5 ? 'metal' : 'food'; this.inv[k]++; this.emit({ type: 'toast', text: `感染者碎裂了，掉落 +1 ${RES_NAMES[k]}`, short: true }); }
  }

  // ---------- 时间 / 尸潮 / 刷怪 ----------
  spawnPoint(far = 20) {
    const p = this.player;
    const pts = [[2.5, 30.5], [2.5, 33.5], [61.5, 30.5], [61.5, 33.5], [31.5, 1.5], [32.5, 2.5]];
    const cand = pts.filter(([x, z]) => Math.hypot(x - p.x, z - p.z) > far);
    if (Math.random() < 0.5) {
      for (let i = 0; i < 20; i++) {
        const x = 2 + Math.floor(Math.random() * (W - 4)), z = 2 + Math.floor(Math.random() * (D - 14));
        const t0 = this.world.get(x, 0, z);
        if ((t0 === B.GRASS || t0 === B.ROAD || t0 === B.DIRT) && this.nav.isOpen(x, z) && Math.hypot(x - p.x, z - p.z) > far) return [x + 0.5, z + 0.5];
      }
    }
    const list = cand.length ? cand : pts;
    return list[Math.floor(Math.random() * list.length)];
  }
  director(dt) {
    const T = this.T;
    // 尸潮预警 / 开始
    const wv = this.waves[this.waveIdx];
    if (wv) {
      if (!wv.warned && T >= wv.warn) { wv.warned = true; this.emit({ type: 'banner', text: `⚠ ${wv.name}将在 2 小时后来袭！`, sub: '加固防线，备好食物和水', kind: 'warn' }); }
      if (T >= wv.start) { this.activeWave = { ...wv, idx: this.waveIdx, spawned: 0, alive: new Set() }; this.waveIdx++; this.emit({ type: 'banner', text: `${wv.name}来了！`, sub: `约 ${wv.count} 名感染者正在逼近`, kind: 'wave' }); }
    }
    const aw = this.activeWave;
    if (aw) {
      this.waveSpawnT -= dt;
      if (aw.spawned < aw.count && this.waveSpawnT <= 0 && this.zm.alive < MAX_Z) {
        this.waveSpawnT = 1.2;
        const [x, z] = this.spawnPoint(18);
        const zb = this.zm.spawn(Math.random() < aw.rr ? 'runner' : 'walker', x + Math.random() - 0.5, z + Math.random() - 0.5, aw.idx + 1);
        if (zb) { aw.spawned++; aw.alive.add(zb.id); }
      }
      const remaining = this.zm.list.filter(z => z.wave === aw.idx + 1).length;
      if (aw.spawned >= aw.count && remaining === 0) {
        if (aw.idx === 0) this.wave1Cleared = true;
        this.emit({ type: 'banner', text: `${aw.name}已击退！`, sub: aw.idx < 2 ? '趁天亮补充物资、修理工事' : '坚持住，直升机快到了', kind: 'ok' });
        this.activeWave = null;
      } else if (T > aw.start + 5 && aw.idx === 0 && aw.spawned >= aw.count) { this.wave1Cleared = true; }
    }
    // 平时游荡
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 2.5;
      const d = this.day();
      const target = this.isNight() ? 8 + d * 3 : 4 + d * 2;
      const ambient = this.zm.list.filter(z => !z.wave).length;
      if (ambient < target && this.zm.alive < MAX_Z - 2 && this.T > 0.6) {
        const [x, z] = this.spawnPoint(22);
        this.zm.spawn(Math.random() < (this.isNight() ? 0.3 : 0.12) * d ? 'runner' : 'walker', x, z, 0);
      }
    }
    // 空投
    if (this.airdropIdx < AIRDROPS.length && T >= AIRDROPS[this.airdropIdx]) {
      this.airdropIdx++;
      const n = this.dropSupplies();
      this.emit({ type: 'banner', text: '空投补给已投放到主路！', sub: `${n} 个物资箱落在路面上`, kind: 'ok' });
    }
    // 撤离
    if (!this.evacActive && T >= EVAC_HOUR) {
      this.evacActive = true;
      this.emit({ type: 'banner', text: '撤离直升机已抵达北部撤离点！', sub: '直升机只会停留 5 小时，快跑！', kind: 'evac' });
      this.emit({ type: 'evac' });
    }
  }
  dropSupplies() {
    let n = 0;
    for (let i = 0; i < 40 && n < 6; i++) {
      const x = 6 + Math.floor(Math.random() * 52), z = 29 + Math.floor(Math.random() * 6);
      if (this.world.get(x, 1, z) !== B.AIR || this.world.structAt(x, z)) continue;
      const o = this.world.newObject('crate', 2, 'crate', '空投箱');
      this.world.put(o, x, 1, z, B.CRATE); n++;
      this.emit({ type: 'drop', x: x + 0.5, z: z + 0.5 });
    }
    return n;
  }
  updateMission() {
    const m = MISSIONS[this.mission]; if (!m) return;
    const inv = this.inv, p = this.player;
    let done = false;
    switch (m.id) {
      case 'wake': done = p.moved > 4; break;
      case 'supply': done = inv.food >= 2 && inv.water >= 2 || this.T > 14; break;
      case 'wood': done = inv.wood >= 12 || this.placed >= 3 || this.T > 15; break;
      case 'base': done = this.placed >= 4 || this.T > 18; break;
      case 'wave1': done = this.wave1Cleared; break;
      case 'hold': done = this.evacActive; break;
      default: break;
    }
    if (done) { this.mission++; const nm = MISSIONS[this.mission]; if (nm) this.emit({ type: 'mission', text: nm.text }); }
  }
  // 供 HUD 使用
  survivedHours() { return Math.floor(this.T); }
  structureHint() {
    const s = this.nearDamaged(); if (!s) return null;
    const def = BUILDS.find(b => b.id === s.type);
    return `${def.name} 耐久 ${Math.max(0, Math.ceil(s.hp))}/${s.max} · 交互修理（${this.costText(this.repairCost(s))}）`;
  }
}
export { World, collides };

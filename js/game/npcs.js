// 幸存者 NPC：医生 / 工程师 / 猎人（对话、招募、跟随/守卫/工作、饥饿与士气）
import { moveEntity } from './physics.js';
import { itemName } from './items.js';

export const NPC_DEFS = [
  {
    id: 'doctor', name: '林医生', role: '医生', x: 62.5, y: 11, z: 138.5, color: [0.85, 0.88, 0.9],
    need: { medkit: 1 }, needText: '急救药品箱（医院 2 楼）',
    lines: {
      meet: '“别靠近……你没被咬吧？我在这层楼困了两天。楼下那箱急救药品还在的话，我们就能救更多人。”',
      ask: '“去把 2 楼的急救药品箱拿来，我就跟你走。我会处理伤口，也能压住感染。”',
      join: '“好，我跟你走。受了伤随时来找我。”',
      low: '“我……快撑不住了。我们需要食物。”',
    },
    skill: '治疗：靠近时缓慢回复生命；可请求治疗（生命+40，感染-30，冷却 3 小时）',
  },
  {
    id: 'engineer', name: '老周', role: '工程师', x: 87.5, y: 1, z: 66.5, color: [0.85, 0.6, 0.18],
    need: { can: 1 }, needText: '罐头×1',
    lines: {
      meet: '“嘘——小声点！我把自己锁在超市仓库里，外面全是那些东西。”',
      ask: '“我三天没吃上正经饭了。给我一个罐头，我帮你把基地修得固若金汤。”',
      join: '“干活的事交给我。把我安排在基地，我会一刻不停地修墙。”',
      low: '“饿着肚子，我拧不动螺丝了……”',
    },
    skill: '建造：在他附近建造/修理材料 -25%；工作模式下自动修理附近工事',
  },
  {
    id: 'hunter', name: '阿青', role: '猎人', x: 28.5, y: 1, z: 113.5, color: [0.36, 0.48, 0.3],
    need: { water: 2 }, needText: '净水×2',
    lines: {
      meet: '“站住。……你不是它们。我守在警局，是因为这里还有些装备。”',
      ask: '“水快见底了。给我两瓶净水，我的弩就为你所用。”',
      join: '“我在后方掩护你。别挡住我的射击线。”',
      low: '“我得吃点东西，手已经开始抖了。”',
    },
    skill: '远程：自动射击 13 格内的感染者（守卫/工作模式射程更远）',
  },
];
export const MODE_NAMES = { follow: '跟随', guard: '守卫', work: '工作' };

export class NpcManager {
  constructor(game) {
    this.game = game;
    this.list = NPC_DEFS.map(d => ({
      id: d.id, def: d, name: d.name, role: d.role, x: d.x, y: d.y, z: d.z, vy: 0, hw: 0.3, h: 1.75, onGround: false, canStep: true,
      yaw: 0, hp: 100, hunger: 70, morale: 55, met: false, joined: false, dead: false, mode: 'guard', gx: d.x, gz: d.z, gy: d.y,
      atk: 0, walk: 0, swing: 0, healCd: 0, side: 0, lastX: d.x, lastZ: d.z, stuck: 0, ai: Math.random() * 0.3, tx: d.x, tz: d.z, shotT: 0, flash: 0,
    }));
  }
  get(id) { return this.list.find(n => n.id === id); }
  joinedAlive() { return this.list.filter(n => n.joined && !n.dead); }
  near(id, r) { const n = this.get(id), p = this.game.player; return n && n.joined && !n.dead && Math.hypot(n.x - p.x, n.z - p.z) < r && Math.abs(n.y - p.y) < 4; }
  update(dt) {
    const g = this.game, p = g.player, hr = dt / g.hourSec();
    for (const n of this.list) {
      if (n.dead) continue;
      n.flash = Math.max(0, n.flash - dt);
      const d = Math.hypot(p.x - n.x, p.z - n.z);
      if (!n.met && d < 4 && Math.abs(p.y - n.y) < 2.5) { n.met = true; g.emit({ type: 'toast', text: `发现幸存者：${n.role} ${n.name}（交互对话）` }); }
      if (!n.joined) { n.yaw = Math.atan2(p.x - n.x, p.z - n.z); this.physics(n, 0, 0, dt); continue; }
      // 需求
      n.hunger = Math.max(0, n.hunger - 2.2 * hr);
      if (n.hunger < 30) n.morale = Math.max(0, n.morale - 3 * hr);
      else if (n.hunger > 60) n.morale = Math.min(100, n.morale + 0.8 * hr);
      if (g.activeWave) n.morale = Math.max(0, n.morale - 0.6 * hr);
      if (n.hunger < 45) this.autoEat(n);
      if (n.hunger <= 0) n.hp = Math.max(1, n.hp - 0.5 * dt);
      else if (n.hp < 100 && n.hunger > 40) n.hp = Math.min(100, n.hp + 0.15 * dt);
      if (n.morale < 15 && !n.lowWarned) { n.lowWarned = true; g.emit({ type: 'toast', text: `${n.name}士气低落：${n.def.lines.low}` }); }
      if (n.morale > 30) n.lowWarned = false;
      const eff = n.morale < 15 ? 0.5 : 1;
      // 移动
      n.ai -= dt;
      if (n.ai <= 0) {
        n.ai = 0.25;
        let tx = n.gx, tz = n.gz;
        if (n.mode === 'follow') {
          if (d > 38 && !g.zm.list.some(z => Math.hypot(z.x - p.x, z.z - p.z) < 6)) { n.x = p.x - Math.sin(p.yaw) * 1.6; n.z = p.z - Math.cos(p.yaw) * 1.6; n.y = p.y + 0.2; n.vy = 0; }
          const st = p.y - n.y > 1.2 ? g.stairPath(n, p) : null;
          if (st) { tx = st.x; tz = st.z; }
          else if (d > 2.6) {
            const nx = (n.y < 3 && p.y < 3) ? g.nav.next(n.x, n.z) : null;
            if (nx && d > 5) { tx = nx.x + 0.5; tz = nx.z + 0.5; } else { tx = p.x; tz = p.z; }
          } else { tx = n.x; tz = n.z; }
        }
        n.tx = tx; n.tz = tz;
        const moved = Math.hypot(n.x - n.lastX, n.z - n.lastZ); n.lastX = n.x; n.lastZ = n.z;
        if (Math.hypot(tx - n.x, tz - n.z) > 1 && moved < 0.04) { n.stuck += 0.25; if (n.stuck > 0.75) { n.side = Math.random() < 0.5 ? -1 : 1; n.stuck = 0; } } else n.stuck = 0;
      }
      let mx = n.tx - n.x, mz = n.tz - n.z; const ml = Math.hypot(mx, mz);
      if (ml > 0.6) { mx /= ml; mz /= ml; if (n.side) { const sx = mz * n.side, sz = -mx * n.side; mx += sx; mz += sz; n.side *= 0.92; if (Math.abs(n.side) < 0.05) n.side = 0; } } else { mx = 0; mz = 0; }
      const sp = n.mode === 'follow' && d > 6 ? 5.2 : 3.4;
      this.physics(n, mx * sp, mz * sp, dt);
      if (mx || mz) n.yaw = Math.atan2(mx, mz);
      // 技能
      if (n.id === 'hunter') this.hunterShoot(n, dt, eff);
      if (n.id === 'doctor') {
        n.healCd = Math.max(0, n.healCd - hr);
        if (d < 6 && Math.abs(p.y - n.y) < 3 && p.hp < 100) p.hp = Math.min(100, p.hp + 0.9 * eff * dt);
        for (const o of this.list) if (o !== n && o.joined && !o.dead && o.hp < 100 && Math.hypot(o.x - n.x, o.z - n.z) < 6) o.hp = Math.min(100, o.hp + 1.2 * eff * dt);
      }
      if (n.id === 'engineer' && n.mode !== 'follow') {
        n.atk -= dt;
        if (n.atk <= 0) {
          n.atk = 2 / eff;
          let best = null, bd = 12;
          for (const s of g.world.structs.values()) { if (s.hp >= s.max) continue; const sd = Math.hypot(s.x + 0.5 - n.x, s.z + 0.5 - n.z); if (sd < bd) { bd = sd; best = s; } }
          if (best) { best.hp = Math.min(best.max, best.hp + 22); g.markStruct(best); n.swing = 0.3; g.emit({ type: 'repairTick', x: best.x + 0.5, z: best.z + 0.5 }); }
        }
      }
      if (n.id === 'hunter' && n.mode === 'work') { n.forage = (n.forage || 0) + hr; }
      n.swing = Math.max(0, n.swing - dt);
    }
  }
  physics(n, vx, vz, dt) {
    moveEntity(this.game.world, n, vx * dt, vz * dt, dt);
    n.walk += Math.hypot(vx, vz) * dt;
    if (n.y < -5) { n.y = 3; n.x = this.game.player.x; n.z = this.game.player.z; }
  }
  autoEat(n) {
    const g = this.game, p = g.player;
    const nearP = Math.hypot(p.x - n.x, p.z - n.z) < 10;
    const tryInv = (inv) => { for (const id of ['food', 'can']) if (inv.count(id) > 0) { inv.remove(id, 1); n.hunger = Math.min(100, n.hunger + (id === 'can' ? 55 : 35)); n.morale = Math.min(100, n.morale + 8); return true; } return false; };
    if (nearP && tryInv(g.inv)) { g.emit({ type: 'toast', text: `${n.name}吃了一份你背包里的食物`, short: true }); return; }
    for (const s of g.world.structs.values()) if (s.inv && Math.hypot(s.x - n.x, s.z - n.z) < 14 && tryInv(s.inv)) return;
  }
  hunterShoot(n, dt, eff) {
    const g = this.game;
    n.shotT -= dt; if (n.shotT > 0) return;
    const range = (n.mode === 'follow' ? 13 : 17) * (g.daylight() < 0.3 ? 0.85 : 1);
    let best = null, bd = range;
    for (const zb of g.zm.list) { const d = Math.hypot(zb.x - n.x, zb.z - n.z); if (d < bd && Math.abs(zb.y - n.y) < 4 && this.los(n, zb)) { bd = d; best = zb; } }
    if (!best) { n.shotT = 0.4; return; }
    n.shotT = 1.3 / eff; n.yaw = Math.atan2(best.x - n.x, best.z - n.z); n.swing = 0.25;
    g.zm.hurt(best, best.big ? 30 : 24, (best.x - n.x) / bd * 2, (best.z - n.z) / bd * 2);
    if (best.hp <= 0) n.morale = Math.min(100, n.morale + 2);
    g.emit({ type: 'shot', x0: n.x, y0: n.y + 1.4, z0: n.z, x1: best.x, y1: best.y + 1.2, z1: best.z });
    g.noise(n.x, n.z, 12);
  }
  los(a, b) {
    const w = this.game.world, steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
    for (let i = 1; i < steps; i++) { const t = i / steps; if (w.solid(Math.floor(a.x + (b.x - a.x) * t), Math.floor(a.y + 1.4 + (b.y - a.y) * t), Math.floor(a.z + (b.z - a.z) * t))) return false; }
    return true;
  }
  // 交互：返回对话面板数据
  give(n) {
    const g = this.game;
    if (!g.inv.has(n.def.need)) { g.toast(`需要：${n.def.needText}`); return false; }
    g.inv.pay(n.def.need);
    if (n.id === 'doctor') g.medkitGiven = true;
    n.joined = true; n.wasJoined = true; n.mode = 'follow'; n.morale = 70; n.hunger = Math.max(n.hunger, 60);
    g.emit({ type: 'banner', text: `${n.role} ${n.name} 加入了队伍！`, sub: n.def.skill, kind: 'ok' });
    g.emit({ type: 'recruit', id: n.id });
    return true;
  }
  command(n, c) {
    const g = this.game, p = g.player;
    if (c === 'give') return this.give(n);
    if (!n.joined) return false;
    if (c === 'follow') { n.mode = 'follow'; g.toast(`${n.name}：“跟上了。”`, true); }
    if (c === 'guard' || c === 'work') { n.mode = c; n.gx = p.x + Math.sin(p.yaw) * 1.2; n.gz = p.z + Math.cos(p.yaw) * 1.2; n.gy = p.y; g.toast(`${n.name}：“${c === 'guard' ? '我守在这里。' : '交给我。'}”`, true); }
    if (c === 'feed') { const id = g.inv.count('can') ? 'can' : (g.inv.count('food') ? 'food' : null); if (!id) { g.toast('没有食物'); return false; } g.inv.remove(id, 1); n.hunger = Math.min(100, n.hunger + (id === 'can' ? 55 : 35)); n.morale = Math.min(100, n.morale + 12); g.toast(`${n.name}：“谢谢。”（士气↑）`, true); }
    if (c === 'treat' && n.id === 'doctor') {
      if (n.healCd > 0) { g.toast(`${n.name}：“药品还在准备，${Math.ceil(n.healCd)} 小时后再来。”`); return false; }
      p.hp = Math.min(100, p.hp + 40); p.infect = Math.max(0, p.infect - 30); n.healCd = 3; g.toast('林医生为你包扎消毒：生命+40 感染-30'); g.emit({ type: 'use', id: 'medicine' });
    }
    if (c === 'forage' && n.id === 'hunter') { const k = Math.floor(n.forage || 0) >= 3 ? Math.floor(n.forage / 3) : 0; if (!k) { g.toast(`${n.name}：“还没打到东西，过几个小时再来。”`); return false; } n.forage -= k * 3; g.give({ food: k }); g.toast(`${n.name}带回了 ${k} 份食物`); }
    return true;
  }
  toJSON() { return this.list.map(n => ({ id: n.id, x: n.x, y: n.y, z: n.z, hp: n.hp, hunger: n.hunger, morale: n.morale, met: n.met, joined: n.joined, dead: n.dead, mode: n.mode, gx: n.gx, gz: n.gz, gy: n.gy, healCd: n.healCd, forage: n.forage || 0 })); }
  load(arr) { for (const o of arr || []) { const n = this.get(o.id); if (n) Object.assign(n, o); } }
}
export { itemName };

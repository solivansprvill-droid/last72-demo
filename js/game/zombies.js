// 感染者（风格化体素人形，被击倒后碎成方块，无血腥）
import { moveEntity, collides } from './physics.js';
import { W, D } from './voxels.js';

export const ZTYPES = {
  walker: { name: '游荡者', hp: 60, speed: 1.35, dmg: 8, rate: 1.1, bdmg: 12, scale: 1.0 },
  runner: { name: '奔跑者', hp: 38, speed: 3.4, dmg: 6, rate: 0.8, bdmg: 8, scale: 0.92 },
  climber: { name: '攀爬者', hp: 50, speed: 2.5, dmg: 7, rate: 0.9, bdmg: 9, scale: 0.95, climb: true },
  bloater: { name: '爆裂者', hp: 45, speed: 1.05, dmg: 0, rate: 1, bdmg: 0, scale: 1.12, bloat: true },
  boss: { name: '巨型感染者', hp: 1100, speed: 1.2, dmg: 26, rate: 1.7, bdmg: 95, scale: 1.9, big: true },
};
export const MAX_Z = 35;
export const EXPLODE = { r: 3.4, dmg: 38, sdmg: 150, zdmg: 45 };

let ZID = 0;
export class ZombieManager {
  constructor(game) { this.game = game; this.list = []; this.frame = 0; }
  get alive() { return this.list.length; }
  spawn(type, x, z, wave = 0, y = 1) {
    if (this.list.length >= MAX_Z && type !== 'boss') return null;
    const t = ZTYPES[type];
    const zb = {
      id: ++ZID, type, x, y, z, vy: 0, hw: t.big ? 0.45 : 0.3, h: t.big ? 2.9 : 1.7, onGround: false, canStep: true,
      hp: t.hp, max: t.hp, yaw: Math.random() * 6.28, state: 'patrol', wave, big: !!t.big,
      ai: Math.random() * 0.3, atk: 0, tx: x, tz: z, walk: 0, fuse: 0,
      lastX: x, lastZ: z, stuck: 0, side: 0, flash: 0, target: null, spikeT: 0, slow: 0, kx: 0, kz: 0, ix: 0, iz: 0, invT: 0, climbing: false,
    };
    this.list.push(zb);
    return zb;
  }
  // 声音：吸引范围内的感染者前来调查
  noise(x, z, r) {
    for (const zb of this.list) {
      if (zb.state === 'chase' || zb.state === 'attack' || zb.state === 'attackBuilding' || zb.wave) continue;
      const d = Math.hypot(zb.x - x, zb.z - z);
      if (d > r) continue;
      zb.state = 'investigate'; zb.ix = x + (Math.random() - 0.5) * 2; zb.iz = z + (Math.random() - 0.5) * 2; zb.invT = 9;
    }
  }
  // 选择攻击目标（玩家或幸存者）
  pickTarget(zb) {
    const g = this.game, p = g.player;
    let best = p.dead ? null : p, bd = p.dead ? 1e9 : Math.hypot(p.x - zb.x, p.z - zb.z) + (Math.abs(p.y - zb.y) > 2.5 ? 6 : 0);
    if (g.npcs) for (const n of g.npcs.list) {
      if (n.dead || !n.met) continue;
      const d = Math.hypot(n.x - zb.x, n.z - zb.z);
      const lim = p.dead || bd > 25 ? 8 : 2.2;
      if (d < bd - 1 && d < lim && Math.abs(n.y - zb.y) < 2) { bd = d; best = n; }
    }
    return best;
  }
  update(dt) {
    const g = this.game, p = g.player, world = g.world;
    this.frame++;
    const hasClimber = this.list.some(z => z.type === 'climber');
    if (hasClimber && g.climbNav) g.climbNav.update(dt, p.x, p.z);
    for (let k = 0; k < this.list.length; k++) {
      const zb = this.list[k], T = ZTYPES[zb.type];
      const nav = T.climb && g.climbNav ? g.climbNav : g.nav;
      zb.flash = Math.max(0, zb.flash - dt);
      const tg = this.pickTarget(zb) || p;
      const dx = tg.x - zb.x, dz = tg.z - zb.z, d = Math.hypot(dx, dz), dyp = Math.abs(tg.y - zb.y);
      const pd = Math.hypot(p.x - zb.x, p.z - zb.z);
      // 远处的游荡感染者：降低更新频率（性能）
      const far = !zb.wave && pd > 40;
      if (far && (this.frame + zb.id) % 4 !== 0) continue;
      const fdt = far ? dt * 4 : dt;
      zb.ai -= fdt;
      if (zb.ai <= 0) { // 分帧决策
        zb.ai = 0.22 + Math.random() * 0.1;
        const sense = (g.isNight() ? 20 : 13) + (zb.state === 'investigate' ? 4 : 0) - (p.sneak ? 5 : 0) - g.weatherSense();
        const upstairs = p.y - zb.y > 1.2 && !p.onTower;
        const chase = (!p.dead && (zb.wave || pd < sense || zb.state === 'chase' && pd < sense + 8)) || (tg !== p && d < 8);
        if (zb.state === 'attackBuilding' && zb.target && zb.target.hp > 0 && d > 2) {
          // 继续拆
        } else if (chase) {
          zb.target = null;
          if (d < (zb.big ? 1.9 : 1.35) && dyp < (T.climb ? 2.4 : 1.6)) zb.state = 'attack';
          else {
            zb.state = 'chase';
            const stair = upstairs && g.stairPath ? g.stairPath(zb, p) : null;
            if (tg !== p) { zb.tx = tg.x; zb.tz = tg.z; }
            else if (stair) { zb.tx = stair.x; zb.tz = stair.z; }
            else if ((d < 2.6 && dyp < 1.5) || (zb.y > 3 && dyp < 3)) { zb.tx = tg.x; zb.tz = tg.z; }
            else {
              const n = nav.next(zb.x, zb.z);
              if (n) {
                zb.tx = n.x + 0.5; zb.tz = n.z + 0.5;
                if (n.struct && Math.hypot(zb.tx - zb.x, zb.tz - zb.z) < 1.5) {
                  const s = world.structAt(n.x, n.z);
                  if (s) { zb.state = 'attackBuilding'; zb.target = s; }
                }
              } else { zb.tx = tg.x; zb.tz = tg.z; }
            }
          }
        } else if (zb.state === 'investigate') {
          zb.invT -= 0.25;
          zb.tx = zb.ix; zb.tz = zb.iz;
          if (zb.invT <= 0 || Math.hypot(zb.ix - zb.x, zb.iz - zb.z) < 1) { zb.state = 'patrol'; zb.tx = zb.x; zb.tz = zb.z; }
        } else {
          if (zb.state !== 'patrol' || Math.hypot(zb.tx - zb.x, zb.tz - zb.z) < 0.6 || Math.random() < 0.02) {
            zb.state = 'patrol';
            for (let i = 0; i < 6; i++) {
              const tx = Math.floor(zb.x + (Math.random() - 0.5) * 14), tz = Math.floor(zb.z + (Math.random() - 0.5) * 14);
              if (g.nav.isOpen(tx, tz)) { zb.tx = tx + 0.5; zb.tz = tz + 0.5; break; }
            }
          }
        }
        // 卡住检测：前方若是工事则开拆，否则侧移
        const moved = Math.hypot(zb.x - zb.lastX, zb.z - zb.lastZ);
        zb.lastX = zb.x; zb.lastZ = zb.z;
        if ((zb.state === 'chase' || zb.state === 'patrol' || zb.state === 'investigate') && moved < 0.05) {
          zb.stuck += 0.25;
          if (zb.stuck > 0.7) {
            const fx = Math.floor(zb.x + Math.sin(zb.yaw) * (zb.big ? 1.2 : 0.9)), fz = Math.floor(zb.z + Math.cos(zb.yaw) * (zb.big ? 1.2 : 0.9));
            const s = world.structAt(fx, fz, Math.floor(zb.y + 0.1));
            if (s && s.type !== 'spike' && zb.state !== 'patrol') { zb.state = 'attackBuilding'; zb.target = s; }
            else { zb.side = (Math.random() < 0.5 ? -1 : 1) * 0.8; if (zb.state === 'patrol') zb.tx = zb.x + (Math.random() - 0.5) * 6, zb.tz = zb.z + (Math.random() - 0.5) * 6; }
            zb.stuck = 0;
          }
        } else zb.stuck = 0;
      }

      // 行动
      let mx = 0, mz = 0, speed = T.speed * (zb.slow > 0 ? 0.45 : 1);
      if (zb.state === 'patrol') speed *= 0.55;
      if (zb.state === 'investigate') speed *= 0.8;
      zb.slow = Math.max(0, zb.slow - fdt);
      // 通电照明灯：夜间减速，游荡者会避开光源
      if (g.litLamps.length) {
        const l = g.lampAt(zb.x, zb.z);
        if (l) { speed *= zb.big ? 0.75 : 0.5; zb.inLight = true;
          if (!zb.wave && zb.state === 'patrol') { const ax = zb.x - l.x - 0.5, az = zb.z - l.z - 0.5, al = Math.hypot(ax, az) || 1; zb.tx = zb.x + ax / al * 5; zb.tz = zb.z + az / al * 5; }
        } else zb.inLight = false;
      }
      if (zb.state === 'chase' || zb.state === 'patrol' || zb.state === 'investigate') {
        const tx = zb.tx - zb.x, tz = zb.tz - zb.z, tl = Math.hypot(tx, tz);
        if (tl > 0.05) { mx = tx / tl; mz = tz / tl; }
        if (zb.side) { const sx = mz * zb.side, sz = -mx * zb.side; mx += sx; mz += sz; zb.side *= 0.9; if (Math.abs(zb.side) < 0.05) zb.side = 0; }
      }
      zb.atk -= fdt;
      // 爆裂者：靠近目标/工事时引爆
      if (T.bloat) {
        if (zb.fuse > 0) { zb.fuse -= fdt; zb.flash = 0.1; speed *= 0.3; if (zb.fuse <= 0) { zb.hp = 0; zb.exploded = true; g.explode(zb.x, zb.y + 0.8, zb.z, zb); } }
        else if ((d < 1.5 && dyp < 2) || (zb.state === 'attackBuilding' && zb.target && Math.hypot(zb.target.x + 0.5 - zb.x, zb.target.z + 0.5 - zb.z) < 1.6)) { zb.fuse = 0.7; g.emit({ type: 'fuse', x: zb.x, z: zb.z }); }
      }
      if (zb.state === 'attack') {
        zb.yaw = Math.atan2(dx, dz);
        if (d > (zb.big ? 2.3 : 1.6) || dyp > (T.climb ? 2.6 : 1.8)) zb.state = 'chase';
        else if (zb.atk <= 0 && T.dmg) {
          zb.atk = T.rate; zb.swing = 0.35;
          if (tg === p) g.damagePlayer(T.dmg, zb); else g.damageNpc && g.damageNpc(tg, T.dmg, zb);
          if (zb.big) { g.emit({ type: 'stomp', x: zb.x, z: zb.z }); p.vy = 4; g.noise(zb.x, zb.z, 14); }
        }
      } else if (zb.state === 'attackBuilding') {
        const s = zb.target;
        if (!s || s.hp <= 0 || !world.structs.has(s.x + s.z * W + s.y * W * D)) { zb.state = 'chase'; zb.target = null; }
        else {
          const sx = s.x + 0.5 - zb.x, sz = s.z + 0.5 - zb.z, sd = Math.hypot(sx, sz);
          zb.yaw = Math.atan2(sx, sz);
          if (sd > (zb.big ? 1.9 : 1.4)) { mx = sx / sd; mz = sz / sd; }
          else if (zb.atk <= 0 && T.bdmg) {
            zb.atk = T.rate; zb.swing = 0.35; g.damageStruct(s, T.bdmg);
            if (zb.big) { // 巨型感染者：范围砸击
              for (const o of [...world.structs.values()]) if (o !== s && Math.hypot(o.x - s.x, o.z - s.z) < 1.6 && o.y < 3) g.damageStruct(o, T.bdmg * 0.5);
              g.emit({ type: 'stomp', x: s.x + 0.5, z: s.z + 0.5 }); g.noise(zb.x, zb.z, 14);
            } else g.noise(zb.x, zb.z, 6);
          }
          if (d < 1.4 && dyp < 2) zb.state = 'attack';
        }
      }
      // 分离
      for (let j = k + 1; j < this.list.length; j++) {
        const o = this.list[j]; const ox = zb.x - o.x, oz = zb.z - o.z, od = ox * ox + oz * oz;
        const rr = (zb.big || o.big) ? 1.2 : 0.45;
        if (od < rr && od > 0.0001) { const f = (Math.sqrt(rr) + 0.22 - Math.sqrt(od)) * 2; const wz = zb.big ? 0.1 : 1, wo = o.big ? 0.1 : 1; zb.kx += ox * f * wz; zb.kz += oz * f * wz; o.kx -= ox * f * wo; o.kz -= oz * f * wo; }
      }
      const ml = Math.hypot(mx, mz);
      if (ml > 0.01) { mx /= ml; mz /= ml; const ty = Math.atan2(mx, mz); let dy = ty - zb.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); zb.yaw += dy * Math.min(1, fdt * 8); }
      const vx = mx * speed + zb.kx, vz = mz * speed + zb.kz;
      zb.kx *= Math.max(0, 1 - fdt * 6); zb.kz *= Math.max(0, 1 - fdt * 6);
      const blocked = moveEntity(world, zb, vx * fdt, vz * fdt, fdt);
      // 攀爬者：可翻越 1–2 格高的墙、汽车、路障
      zb.climbing = false;
      if (T.climb && blocked && ml > 0.01 && zb.state !== 'attack') {
        const ax = zb.x + mx * 0.45, az = zb.z + mz * 0.45;
        if (!collides(world, ax, zb.y + 2.05, az, zb.hw, zb.h) && !collides(world, zb.x, zb.y + 0.3, zb.z, zb.hw, zb.h)) { zb.vy = 5.2; zb.climbing = true; }
      }
      zb.x = Math.max(0.4, Math.min(W - 0.4, zb.x)); zb.z = Math.max(0.4, Math.min(D - 0.4, zb.z));
      zb.walk += Math.hypot(vx, vz) * fdt;
      if (zb.swing) zb.swing = Math.max(0, zb.swing - fdt);
      // 尖刺陷阱
      const st = world.structAt(Math.floor(zb.x), Math.floor(zb.z), Math.floor(zb.y + 0.1));
      zb.spikeT -= fdt;
      if (st && st.type === 'spike' && zb.spikeT <= 0) {
        zb.spikeT = 0.5; zb.slow = 0.8;
        this.hurt(zb, zb.big ? 20 : 12, 0, 0, true);
        g.damageStruct(st, zb.big ? 20 : 5);
      }
      if (zb.y < -5) zb.hp = 0;
      // 远离玩家的游荡感染者回收
      if (!zb.wave && pd > 70) { zb.hp = 0; zb.despawn = true; }
    }
    // 移除死亡
    for (let k = this.list.length - 1; k >= 0; k--) {
      const zb = this.list[k];
      if (zb.hp <= 0) {
        this.list.splice(k, 1);
        if (zb.despawn) continue;
        if (ZTYPES[zb.type].bloat && !zb.exploded) { zb.exploded = true; g.explode(zb.x, zb.y + 0.8, zb.z, zb); }
        this.game.onZombieDeath(zb);
      }
    }
  }
  hurt(zb, dmg, kx, kz, fromTrap = false) {
    if (zb.hp <= 0) return;
    zb.hp -= dmg; zb.flash = 0.15; zb.kx += kx; zb.kz += kz;
    if (!fromTrap && (zb.state === 'patrol' || zb.state === 'investigate')) zb.state = 'chase';
    this.game.emit({ type: 'zhit', x: zb.x, y: zb.y + (zb.big ? 2.2 : 1.2), z: zb.z, dmg: Math.round(dmg), big: zb.big });
  }
}

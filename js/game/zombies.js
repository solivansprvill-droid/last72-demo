// 感染者（风格化体素人形，被击倒后碎成方块）
import { moveEntity } from './physics.js';
import { W, D } from './voxels.js';

export const ZTYPES = {
  walker: { name: '游荡者', hp: 60, speed: 1.35, dmg: 8, rate: 1.1, bdmg: 12, scale: 1.0 },
  runner: { name: '奔跑者', hp: 38, speed: 3.4, dmg: 6, rate: 0.8, bdmg: 8, scale: 0.9 },
};
export const MAX_Z = 30;

let ZID = 0;
export class ZombieManager {
  constructor(game) { this.game = game; this.list = []; }
  get alive() { return this.list.length; }
  spawn(type, x, z, wave = 0) {
    if (this.list.length >= MAX_Z) return null;
    const t = ZTYPES[type];
    const zb = {
      id: ++ZID, type, x, y: 1, z, vy: 0, hw: 0.3, h: 1.7, onGround: false, canStep: true,
      hp: t.hp, max: t.hp, yaw: Math.random() * 6.28, state: 'patrol', wave,
      ai: Math.random() * 0.3, atk: 0, tx: x, tz: z, moveX: 0, moveZ: 0, walk: 0,
      lastX: x, lastZ: z, stuck: 0, side: 0, flash: 0, target: null, spikeT: 0, slow: 0, kx: 0, kz: 0,
    };
    this.list.push(zb);
    return zb;
  }
  update(dt) {
    const g = this.game, p = g.player, world = g.world, nav = g.nav;
    for (let k = 0; k < this.list.length; k++) {
      const zb = this.list[k], T = ZTYPES[zb.type];
      zb.flash = Math.max(0, zb.flash - dt);
      const dx = p.x - zb.x, dz = p.z - zb.z, d = Math.hypot(dx, dz), dyp = Math.abs(p.y - zb.y);
      zb.ai -= dt;
      if (zb.ai <= 0) { // 分帧决策
        zb.ai = 0.22 + Math.random() * 0.1;
        const sense = g.isNight() ? 20 : 13;
        const chase = !p.dead && (zb.wave || d < sense || zb.state === 'chase' && d < sense + 8);
        if (zb.state === 'attackBuilding' && zb.target && zb.target.hp > 0 && d > 2) {
          // 继续拆
        } else if (chase) {
          zb.target = null;
          if (d < 1.35 && dyp < 2.2) zb.state = 'attack';
          else {
            zb.state = 'chase';
            if (d < 2.6 && dyp < 1.5) { zb.tx = p.x; zb.tz = p.z; }
            else {
              const n = nav.next(zb.x, zb.z);
              if (n) {
                zb.tx = n.x + 0.5; zb.tz = n.z + 0.5;
                if (n.struct && Math.hypot(zb.tx - zb.x, zb.tz - zb.z) < 1.5) {
                  const s = world.structAt(n.x, n.z);
                  if (s) { zb.state = 'attackBuilding'; zb.target = s; }
                }
              } else { zb.tx = p.x; zb.tz = p.z; }
            }
          }
        } else {
          if (zb.state !== 'patrol' || Math.hypot(zb.tx - zb.x, zb.tz - zb.z) < 0.6 || Math.random() < 0.02) {
            zb.state = 'patrol';
            for (let i = 0; i < 6; i++) {
              const tx = Math.floor(zb.x + (Math.random() - 0.5) * 14), tz = Math.floor(zb.z + (Math.random() - 0.5) * 14);
              if (nav.isOpen(tx, tz)) { zb.tx = tx + 0.5; zb.tz = tz + 0.5; break; }
            }
          }
        }
        // 卡住检测：前方若是工事则开拆，否则侧移
        const moved = Math.hypot(zb.x - zb.lastX, zb.z - zb.lastZ);
        zb.lastX = zb.x; zb.lastZ = zb.z;
        if ((zb.state === 'chase' || zb.state === 'patrol') && moved < 0.05) {
          zb.stuck += 0.25;
          if (zb.stuck > 0.7) {
            const fx = Math.floor(zb.x + Math.sin(zb.yaw) * 0.9), fz = Math.floor(zb.z + Math.cos(zb.yaw) * 0.9);
            const s = world.structAt(fx, fz);
            if (s && s.type !== 'spike' && zb.state === 'chase') { zb.state = 'attackBuilding'; zb.target = s; }
            else { zb.side = (Math.random() < 0.5 ? -1 : 1) * 0.8; if (zb.state === 'patrol') zb.tx = zb.x + (Math.random() - 0.5) * 6, zb.tz = zb.z + (Math.random() - 0.5) * 6; }
            zb.stuck = 0;
          }
        } else zb.stuck = 0;
      }

      // 行动
      let mx = 0, mz = 0, speed = T.speed * (zb.slow > 0 ? 0.45 : 1);
      if (zb.state === 'patrol') speed *= 0.55;
      zb.slow = Math.max(0, zb.slow - dt);
      if (zb.state === 'chase' || zb.state === 'patrol') {
        const tx = zb.tx - zb.x, tz = zb.tz - zb.z, tl = Math.hypot(tx, tz);
        if (tl > 0.05) { mx = tx / tl; mz = tz / tl; }
        if (zb.side) { const sx = mz * zb.side, sz = -mx * zb.side; mx += sx; mz += sz; zb.side *= 0.9; if (Math.abs(zb.side) < 0.05) zb.side = 0; }
      }
      zb.atk -= dt;
      if (zb.state === 'attack') {
        zb.yaw = Math.atan2(dx, dz);
        if (d > 1.6 || dyp > 2.2) zb.state = 'chase';
        else if (zb.atk <= 0) { zb.atk = T.rate; zb.swing = 0.35; g.damagePlayer(T.dmg, zb); }
      } else if (zb.state === 'attackBuilding') {
        const s = zb.target;
        if (!s || s.hp <= 0 || !world.structAt(s.x, s.z)) { zb.state = 'chase'; zb.target = null; }
        else {
          const sx = s.x + 0.5 - zb.x, sz = s.z + 0.5 - zb.z, sd = Math.hypot(sx, sz);
          zb.yaw = Math.atan2(sx, sz);
          if (sd > 1.4) { mx = sx / sd; mz = sz / sd; }
          else if (zb.atk <= 0) { zb.atk = T.rate; zb.swing = 0.35; g.damageStruct(s, T.bdmg); }
          if (d < 1.4 && dyp < 2) zb.state = 'attack';
        }
      }
      // 分离
      for (let j = k + 1; j < this.list.length; j++) {
        const o = this.list[j]; const ox = zb.x - o.x, oz = zb.z - o.z, od = ox * ox + oz * oz;
        if (od < 0.45 && od > 0.0001) { const f = (0.67 - Math.sqrt(od)) * 2; zb.kx += ox * f; zb.kz += oz * f; o.kx -= ox * f; o.kz -= oz * f; }
      }
      const ml = Math.hypot(mx, mz);
      if (ml > 0.01) { mx /= ml; mz /= ml; const ty = Math.atan2(mx, mz); let dy = ty - zb.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); zb.yaw += dy * Math.min(1, dt * 8); }
      const vx = mx * speed + zb.kx, vz = mz * speed + zb.kz;
      zb.kx *= Math.max(0, 1 - dt * 6); zb.kz *= Math.max(0, 1 - dt * 6);
      moveEntity(world, zb, vx * dt, vz * dt, dt);
      zb.x = Math.max(0.4, Math.min(W - 0.4, zb.x)); zb.z = Math.max(0.4, Math.min(D - 0.4, zb.z));
      zb.walk += Math.hypot(vx, vz) * dt;
      if (zb.swing) zb.swing = Math.max(0, zb.swing - dt);
      // 尖刺陷阱
      const st = world.structAt(Math.floor(zb.x), Math.floor(zb.z));
      zb.spikeT -= dt;
      if (st && st.type === 'spike' && zb.spikeT <= 0 && zb.y < 1.5) {
        zb.spikeT = 0.5; zb.slow = 0.8;
        this.hurt(zb, 12, 0, 0, true);
        g.damageStruct(st, 5);
      }
      if (zb.y < -5) zb.hp = 0;
    }
    // 移除死亡
    for (let k = this.list.length - 1; k >= 0; k--) {
      const zb = this.list[k];
      if (zb.hp <= 0) { this.list.splice(k, 1); this.game.onZombieDeath(zb); }
    }
  }
  hurt(zb, dmg, kx, kz, fromTrap = false) {
    zb.hp -= dmg; zb.flash = 0.15; zb.kx += kx; zb.kz += kz;
    if (!fromTrap && zb.state === 'patrol') zb.state = 'chase';
    this.game.emit({ type: 'zhit', x: zb.x, y: zb.y + 1.2, z: zb.z });
  }
}

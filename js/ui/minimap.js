// 小地图 + 大地图（2D 画布，俯视方块颜色）
import { W, D, H, B, COLORS } from '../game/voxels.js';
import { REGIONS } from '../game/worldgen.js';

export class Minimap {
  constructor(canvas, big) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.big = big; this.bctx = big.getContext('2d');
    this.base = document.createElement('canvas'); this.base.width = W; this.base.height = D;
    this.bx = this.base.getContext('2d');
    this.ver = -1; this.t = 0;
    this.open = false;
  }
  rebuild(world) {
    const img = this.bx.createImageData(W, D), d = img.data;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      let y = H - 1; while (y > 0 && world.v[x + W * (z + D * y)] === B.AIR) y--;
      const t = world.v[x + W * (z + D * y)];
      const c = COLORS[t] || [0.3, 0.3, 0.3];
      const k = 0.75 + Math.min(1, y / 14) * 0.5;
      const i = (x + (D - 1 - z) * W) * 4; // 北在上
      d[i] = Math.min(255, c[0] * 255 * k); d[i + 1] = Math.min(255, c[1] * 255 * k); d[i + 2] = Math.min(255, c[2] * 255 * k); d[i + 3] = 255;
    }
    this.bx.putImageData(img, 0, 0);
    this.ver = world.version;
  }
  update(game, dt, camYaw) {
    this.t += dt;
    if (this.ver !== game.world.version && (this.t > 3 || this.ver < 0)) { this.rebuild(game.world); this.t = 0; }
    this.draw(this.ctx, this.c, game, camYaw, false);
    if (this.open) this.draw(this.bctx, this.big, game, camYaw, true);
  }
  draw(ctx, cv, game, camYaw, full) {
    const p = game.player, cw = cv.width, chh = cv.height;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0d0e12'; ctx.fillRect(0, 0, cw, chh);
    let s, ox, oz; // 像素/格, 视窗左上角（世界坐标）
    if (full) { s = Math.min(cw / W, chh / D); ox = -(cw / s - W) / 2; oz = D + (chh / s - D) / 2; }
    else { s = cw / 44; ox = p.x - 22; oz = p.z + 22; }
    const X = (x) => (x - ox) * s, Y = (z) => (oz - z) * s;
    ctx.drawImage(this.base, X(0), Y(D), W * s, D * s);
    if (full) { // 区域名
      ctx.font = `${Math.max(10, s * 3.2)}px sans-serif`; ctx.fillStyle = 'rgba(255,230,180,.9)'; ctx.textAlign = 'center';
      for (const r of REGIONS) { ctx.fillText(r.name, X(W * 0.22), Y((r.z0 + r.z1) / 2)); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(X(0), Y(r.z0), W * s, 1); ctx.fillStyle = 'rgba(255,230,180,.9)'; }
    }
    // 感染者
    ctx.fillStyle = '#e0553f';
    for (const zb of game.zm.list) { if (!full && Math.hypot(zb.x - p.x, zb.z - p.z) > 24) continue; const r = zb.big ? 2.2 : 1.2; ctx.fillRect(X(zb.x) - r, Y(zb.z) - r, r * 2, r * 2); }
    // 幸存者
    if (game.npcs) { ctx.fillStyle = '#7fe08a'; for (const n of game.npcs.list) if (!n.dead) ctx.fillRect(X(n.x) - 2, Y(n.z) - 2, 4, 4); }
    // 目标
    const ob = game.objective ? game.objective() : null;
    if (ob) {
      let tx = X(ob.x), ty = Y(ob.z);
      const m = 5; const clamped = tx < m || ty < m || tx > cw - m || ty > chh - m;
      tx = Math.max(m, Math.min(cw - m, tx)); ty = Math.max(m, Math.min(chh - m, ty));
      ctx.fillStyle = '#f0b54a'; ctx.beginPath(); ctx.arc(tx, ty, clamped ? 3.5 : 4.5, 0, 6.3); ctx.fill();
      ctx.strokeStyle = '#1a1408'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // 玩家箭头（朝向相机）
    ctx.translate(X(p.x), Y(p.z)); ctx.rotate(camYaw);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(0, 2); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (!full) { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, cw - 2, chh - 2); ctx.fillStyle = '#f0b54a'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('北', cw / 2, 10); }
  }
}

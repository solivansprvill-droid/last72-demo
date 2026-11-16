// 2D 导航流场：从玩家位置做 Dijkstra，感染者沿梯度下降；防御工事可通过但代价高（需拆除）
import { W, D, B, SOLID } from './voxels.js';

const INF = 1e9;
export const CELL_OPEN = 0, CELL_BLOCK = 1, CELL_STRUCT = 2, CELL_STEP = 3;

export class Nav {
  constructor(world) {
    this.world = world;
    this.kind = new Uint8Array(W * D);
    this.dist = new Float32Array(W * D).fill(INF);
    this.ver = -1; this.timer = 0;
    this.heap = new Int32Array(W * D * 8); this.hk = new Float32Array(W * D * 8);
  }
  rebuildKinds() {
    const w = this.world;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const t1 = w.get(x, 1, z), t2 = w.get(x, 2, z), t3 = w.get(x, 3, z);
      let k = CELL_OPEN;
      const st = w.cellStruct.get(w.idx(x, 1, z));
      if (st && SOLID[t1] && st.type !== 'box' && st.type !== 'bench' && st.type !== 'gen') k = CELL_STRUCT;
      else if (SOLID[t1]) k = (!SOLID[t2] && !SOLID[t3]) ? CELL_STEP : CELL_BLOCK;
      else if (SOLID[t2]) k = CELL_BLOCK;
      this.kind[x + z * W] = k;
    }
    this.ver = w.version;
  }
  cost(i) {
    const k = this.kind[i];
    if (k === CELL_BLOCK) return INF;
    if (k === CELL_STRUCT) { const s = this.world.cellStruct.get(i + W * D); return s && (s.type === 'bar' || s.type === 'tower') ? 22 : 14; }
    if (k === CELL_STEP) return 2.5;
    return 1;
  }
  update(dt, px, pz) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.35;
    if (this.ver !== this.world.version) this.rebuildKinds();
    const dist = this.dist; dist.fill(INF);
    const sx = Math.max(0, Math.min(W - 1, Math.floor(px))), sz = Math.max(0, Math.min(D - 1, Math.floor(pz)));
    // 二叉堆
    const heap = this.heap, hk = this.hk; let n = 0;
    const push = (i, d) => { let c = n++; heap[c] = i; hk[c] = d; while (c > 0) { const p = (c - 1) >> 1; if (hk[p] <= hk[c]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; [hk[p], hk[c]] = [hk[c], hk[p]]; c = p; } };
    const pop = () => { const r = heap[0]; n--; heap[0] = heap[n]; hk[0] = hk[n]; let c = 0; for (;;) { const l = c * 2 + 1, rr = l + 1; let m = c; if (l < n && hk[l] < hk[m]) m = l; if (rr < n && hk[rr] < hk[m]) m = rr; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; [hk[m], hk[c]] = [hk[c], hk[m]]; c = m; } return r; };
    const s = sx + sz * W; dist[s] = 0; push(s, 0);
    const kind = this.kind;
    while (n > 0 && n < heap.length - 8) {
      const d0 = hk[0]; const i = pop();
      if (d0 > dist[i]) continue;
      const x = i % W, z = (i / W) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
        const j = nx + nz * W;
        if (dx && dz) { // 不允许斜穿墙角
          if (kind[x + dx + z * W] !== CELL_OPEN || kind[x + (z + dz) * W] !== CELL_OPEN) continue;
        }
        const c = this.cost(j); if (c >= INF) continue;
        const nd = d0 + c * (dx && dz ? 1.414 : 1);
        if (nd < dist[j]) { dist[j] = nd; push(j, nd); }
      }
    }
  }
  // 返回下一步格子 {x,z,struct}
  next(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= W || cz >= D) return null;
    let best = this.dist[cx + cz * W], bx = -1, bz = -1;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
      if (dx && dz && (this.kind[cx + dx + cz * W] !== CELL_OPEN || this.kind[cx + (cz + dz) * W] !== CELL_OPEN)) continue;
      const d = this.dist[nx + nz * W];
      if (d < best) { best = d; bx = nx; bz = nz; }
    }
    if (bx < 0) return null;
    return { x: bx, z: bz, struct: this.kind[bx + bz * W] === CELL_STRUCT };
  }
  isOpen(x, z) { if (x < 1 || z < 1 || x >= W - 1 || z >= D - 1) return false; return this.kind[x + z * W] === CELL_OPEN; }
}

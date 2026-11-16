// 物品 / 背包 / 合成配方（纯逻辑）
export const ITEMS = {
  wood: { name: '木材', stack: 40, cat: 'mat', color: '#a0703c' },
  stone: { name: '石料', stack: 40, cat: 'mat', color: '#8a8780' },
  metal: { name: '金属', stack: 40, cat: 'mat', color: '#8fa3b8' },
  cloth: { name: '布料', stack: 20, cat: 'mat', color: '#c9b9a0' },
  parts: { name: '电子零件', stack: 20, cat: 'mat', color: '#6fc28a' },
  fuel: { name: '燃油', stack: 10, cat: 'mat', color: '#d6a13a' },
  food: { name: '食物', stack: 10, cat: 'food', color: '#e39a2d', use: { hunger: 30 }, verb: '吃' },
  can: { name: '罐头', stack: 10, cat: 'food', color: '#d8743a', use: { hunger: 55, hp: 5, morale: 0 }, verb: '吃' },
  dirty: { name: '脏水', stack: 10, cat: 'drink', color: '#7f8c6a', use: { thirst: 25, infect: 6 }, verb: '喝' },
  water: { name: '净水', stack: 10, cat: 'drink', color: '#4c8fc9', use: { thirst: 42 }, verb: '喝' },
  bandage: { name: '绷带', stack: 10, cat: 'med', color: '#e8e2d2', use: { hp: 30 }, verb: '包扎' },
  medicine: { name: '药品', stack: 6, cat: 'med', color: '#7fd0c8', use: { infect: -45, hp: 10 }, verb: '服用' },
  stick: { name: '木棍', stack: 1, cat: 'weapon', color: '#a0703c', weapon: { dmg: 18, dur: 45, cd: 0.42, reach: 2.2, harvest: 1 } },
  pipe: { name: '钢管', stack: 1, cat: 'weapon', color: '#9aa3ad', weapon: { dmg: 28, dur: 80, cd: 0.45, reach: 2.3, harvest: 1 } },
  axe: { name: '消防斧', stack: 1, cat: 'weapon', color: '#c9472f', weapon: { dmg: 44, dur: 120, cd: 0.55, reach: 2.4, harvest: 2 } },
  comms: { name: '通讯设备', stack: 1, cat: 'quest', color: '#f0b54a' },
  medkit: { name: '药品箱', stack: 1, cat: 'quest', color: '#7fd0c8' },
};
export const FIST = { dmg: 10, cd: 0.42, reach: 2.0, harvest: 1 };

export const RECIPES = [
  { id: 'stick', out: 'stick', n: 1, cost: { wood: 3 }, desc: '伤害 18 · 耐久 45' },
  { id: 'pipe', out: 'pipe', n: 1, cost: { metal: 4, wood: 1 }, desc: '伤害 28 · 耐久 80' },
  { id: 'axe', out: 'axe', n: 1, cost: { metal: 6, wood: 2, parts: 1 }, desc: '伤害 44 · 采集×2 · 耐久 120' },
  { id: 'bandage', out: 'bandage', n: 2, cost: { cloth: 2 }, desc: '生命 +30' },
  { id: 'water', out: 'water', n: 2, cost: { dirty: 2, wood: 1 }, desc: '煮沸过滤：脏水→净水' },
  { id: 'can', out: 'can', n: 1, cost: { food: 2, metal: 1 }, desc: '饱食 +55，便于保存' },
];

export function itemName(id) { return ITEMS[id] ? ITEMS[id].name : id; }

export class Inventory {
  constructor(cap = 16) { this.cap = cap; this.slots = []; }
  count(id) { let n = 0; for (const s of this.slots) if (s.id === id) n += s.n; return n; }
  // 计算还能放下多少
  room(id) {
    const st = ITEMS[id].stack; let r = (this.cap - this.slots.length) * st;
    for (const s of this.slots) if (s.id === id && st > 1) r += st - s.n;
    return r;
  }
  add(id, n = 1, dur) {
    const st = ITEMS[id].stack;
    if (st > 1) for (const s of this.slots) { if (n <= 0) break; if (s.id === id && s.n < st) { const k = Math.min(n, st - s.n); s.n += k; n -= k; } }
    while (n > 0 && this.slots.length < this.cap) {
      const k = Math.min(n, st); const s = { id, n: k };
      if (ITEMS[id].weapon) s.dur = dur ?? ITEMS[id].weapon.dur;
      this.slots.push(s); n -= k;
    }
    return n; // 放不下的数量
  }
  remove(id, n = 1) {
    for (let i = this.slots.length - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i]; if (s.id !== id) continue;
      const k = Math.min(n, s.n); s.n -= k; n -= k;
      if (s.n <= 0) this.slots.splice(i, 1);
    }
    return n === 0;
  }
  takeSlot(i) { return this.slots.splice(i, 1)[0]; }
  canFit(loot) { // loot: {id:n}
    const free = this.cap - this.slots.length; let need = 0;
    for (const id in loot) {
      const st = ITEMS[id].stack; let n = loot[id];
      for (const s of this.slots) if (s.id === id && st > 1) n -= st - s.n;
      if (n > 0) need += Math.ceil(n / st);
    }
    return need <= free;
  }
  has(cost) { for (const k in cost) if (this.count(k) < cost[k]) return false; return true; }
  pay(cost) { for (const k in cost) this.remove(k, cost[k]); }
  sort() {
    const order = Object.keys(ITEMS);
    this.slots.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    // 合并
    const out = [];
    for (const s of this.slots) {
      const st = ITEMS[s.id].stack, last = out[out.length - 1];
      if (last && last.id === s.id && st > 1 && last.n < st) { const k = Math.min(s.n, st - last.n); last.n += k; s.n -= k; }
      if (s.n > 0) out.push(s);
    }
    this.slots = out;
  }
  toJSON() { return { cap: this.cap, slots: this.slots }; }
  static from(o) { const v = new Inventory(o.cap); v.slots = o.slots.map(s => ({ ...s })); return v; }
}

// 掉落表
const T = {
  crate: [['food', 1, 2, 0.6], ['water', 1, 2, 0.5], ['metal', 1, 2, 0.4], ['wood', 1, 3, 0.4], ['cloth', 1, 2, 0.45], ['bandage', 1, 1, 0.2], ['parts', 1, 1, 0.2], ['can', 1, 1, 0.2]],
  airdrop: [['can', 2, 3, 1], ['water', 2, 3, 1], ['bandage', 1, 2, 0.8], ['medicine', 1, 1, 0.6], ['fuel', 1, 2, 0.7], ['parts', 1, 2, 0.6], ['metal', 2, 4, 0.7]],
  fridge: [['food', 1, 3, 1], ['water', 1, 2, 0.8], ['can', 1, 1, 0.25]],
  shelf: [['wood', 2, 3, 1], ['food', 1, 2, 0.5], ['cloth', 1, 2, 0.5], ['water', 1, 1, 0.3]],
  table: [['wood', 2, 3, 1]],
  bed: [['cloth', 2, 3, 1], ['wood', 1, 2, 0.6]],
  sofa: [['cloth', 2, 3, 1], ['wood', 1, 1, 0.5]],
  barrel: [['dirty', 2, 3, 1]],
  bin: [['metal', 1, 2, 1], ['food', 1, 1, 0.3], ['cloth', 1, 1, 0.3], ['parts', 1, 1, 0.12]],
  tire: [['metal', 1, 1, 1], ['stone', 1, 2, 1]],
  rubble: [['stone', 3, 5, 1], ['metal', 0, 1, 1]],
  tree: [['wood', 5, 7, 1]],
  car: [['metal', 4, 6, 1], ['parts', 0, 1, 0.6], ['fuel', 1, 1, 0.35]],
  mshelf: [['food', 1, 3, 1], ['can', 1, 2, 0.6], ['water', 1, 2, 0.7], ['cloth', 0, 1, 0.4]], // 超市货架
  locker: [['metal', 1, 2, 0.8], ['bandage', 1, 1, 0.4], ['parts', 1, 1, 0.4], ['fuel', 1, 1, 0.3]],
  medcab: [['medicine', 1, 1, 0.8], ['bandage', 1, 2, 1], ['cloth', 1, 1, 0.4]],
  desk: [['wood', 1, 2, 1], ['parts', 1, 1, 0.45]],
  fuelcan: [['fuel', 1, 2, 1]],
  machine: [['parts', 1, 2, 1], ['metal', 1, 2, 1]],
};
export function rollLoot(kind, rnd = Math.random) {
  const t = T[kind]; const out = {};
  if (!t) return out;
  for (const [id, a, b, p] of t) {
    if (rnd() > p) continue;
    const n = a + Math.floor(rnd() * (b - a + 1));
    if (n > 0) out[id] = (out[id] || 0) + n;
  }
  if (!Object.keys(out).length && kind === 'crate') out.wood = 1;
  return out;
}

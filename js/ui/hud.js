// HUD（DOM），只显示游戏状态；面板操作通过 game 的方法完成
import { BUILDS, MISSIONS, EVAC, EVAC_HOUR, RECIPES, ITEMS } from '../game/game.js';
import { MODE_NAMES } from '../game/npcs.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const RES_SHOW = [['wood', '木'], ['stone', '石'], ['metal', '铁'], ['cloth', '布'], ['parts', '件'], ['fuel', '油'], ['food+can', '食'], ['water+dirty', '水']];
const short = (id) => ITEMS[id].name.length > 3 ? ITEMS[id].name.slice(0, 2) : ITEMS[id].name;

export class Hud {
  constructor() {
    this.renderNpc = (game, pn) => this.npcPanel(game, pn);
    this.toasts = []; this.bannerT = 0; this.t = 0; this.sel = -1; this.sig = ''; this.sideSig = '';
    const bb = $('buildBar');
    bb.innerHTML = BUILDS.map((b, i) => `<button class="bbtn" data-i="${i}"><b>${i < 9 ? i + 1 : 0}·${b.name}</b><small>${Object.entries(b.cost).map(([k, v]) => ITEMS[k].name + v).join(' ')}</small></button>`).join('');
    $('res').innerHTML = RES_SHOW.map(([k, n]) => `<span class="r" style="border-color:${ITEMS[k.split('+')[0]].color}">${n}<b data-k="${k}">0</b></span>`).join('');
  }
  bind(getGame) {
    this.getGame = getGame;
    const on = (el, fn) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(e); });
    on($('bagGrid'), (e) => { const s = e.target.closest('.slot'); if (!s) return; const i = +s.dataset.i; const g = getGame();
      if (g.panel && g.panel.kind === 'storage') { g.storeSlot(i); this.sel = -1; } else this.sel = this.sel === i ? -1 : i; this.sig = ''; });
    on($('slotAct'), (e) => { const b = e.target.closest('button'); if (!b) return; const g = getGame(), i = this.sel;
      if (b.dataset.a === 'use') g.useSlot(i); if (b.dataset.a === 'drop') g.dropSlot(i); if (b.dataset.a === 'store') g.storeSlot(i);
      this.sel = -1; this.sig = ''; });
    on($('equipRow'), (e) => { if (e.target.closest('button')) { getGame().unequip(); this.sig = ''; } });
    on($('btnSort'), () => { getGame().inv.sort(); this.sel = -1; this.sig = ''; });
    on($('btnBagClose'), () => $('bag').classList.remove('open'));
    on($('btnSideClose'), () => getGame().closePanel());
    on($('sideBody'), (e) => { const b = e.target.closest('[data-a]'); if (!b) return; const g = getGame();
      if (b.dataset.a === 'craft') g.craft(b.dataset.id);
      if (b.dataset.a === 'take') g.takeStored(+b.dataset.i);
      if (b.dataset.a === 'storeAll') g.storeAll();
      if (b.dataset.a === 'npc') g.npcCommand && g.npcCommand(b.dataset.id, b.dataset.c);
      this.sideSig = ''; this.sig = ''; });
  }
  update(game, dt, renderer) {
    this.t += dt;
    this.bannerT -= dt;
    if (this.bannerT <= 0) $('banner').classList.remove('show');
    $('vignette').style.opacity = game.player.hurtT > 0 ? Math.min(1, game.player.hurtT * 2.5) : (game.player.hp < 30 ? 0.35 + Math.sin(this.t * 4) * 0.15 : 0);
    if ((this._acc = (this._acc || 0) + dt) < 0.1) return; this._acc = 0;
    const p = game.player;
    const h = game.clockHour(); const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10;
    $('clock').textContent = `第${game.day()}天 ${pad(hh)}:${pad(mm)} ${game.isNight() ? '· 夜' : '· 昼'}`;
    $('survived').textContent = `已存活 ${game.survivedHours()}h / 72h`;
    const nextWave = game.waves.find(w => game.T < w.start);
    $('waveInfo').textContent = game.activeWave ? `${game.activeWave.name}进行中 · 场上感染者 ${game.zm.alive}` :
      (nextWave ? `${nextWave.name}：${Math.max(0, Math.ceil(nextWave.start - game.T))}h 后` : (game.T < EVAC_HOUR ? `直升机：${Math.ceil(EVAC_HOUR - game.T)}h 后` : '直升机已到达！'));
    const m = MISSIONS[game.mission];
    $('mission').textContent = m ? (typeof m.text === 'function' ? m.text(game) : m.text) : '';
    const bar = (id, v) => { const el = $(id); if (!el) return; el.style.width = Math.max(0, Math.min(100, v)) + '%'; el.parentElement.classList.toggle('low', v < 25); };
    bar('hpBar', p.hp); bar('foodBar', p.hunger); bar('waterBar', p.thirst); bar('stBar', p.stamina);
    const fb = $('fatBar'); fb.style.width = p.fatigue + '%'; fb.parentElement.classList.toggle('low', p.fatigue > 80);
    const ib = $('infBar'); ib.style.width = p.infect + '%'; ib.parentElement.classList.toggle('low', p.infect > 50);
    $('btnStay').style.display = game.evacActive && !game.staying && game.state === 'play' ? 'block' : 'none';
    document.body.classList.toggle('sleeping', game.sleeping);
    const party = game.npcs.list.filter(n => n.joined || n.dead && n.met && n.wasJoined);
    const psig = party.map(n => n.id + (n.dead ? 'd' : '') + Math.round(n.hp / 5) + n.mode + Math.round(n.morale / 10)).join();
    if (psig !== this.psig) { this.psig = psig; $('party').innerHTML = party.map(n => `<div class="pm${n.dead ? ' dead' : ''}">${n.role} ${n.name} · ${n.dead ? '倒下' : MODE_NAMES[n.mode]}${n.dead ? '' : ` · 士气${Math.round(n.morale)}`}<i style="width:${Math.max(0, n.hp)}%"></i></div>`).join(''); }
    for (const el of document.querySelectorAll('#res b')) el.textContent = el.dataset.k.split('+').reduce((a, k) => a + game.inv.count(k), 0);
    const eq = game.equip;
    $('weaponTxt').textContent = eq ? `${ITEMS[eq.id].name} ${Math.ceil(eq.dur)}/${ITEMS[eq.id].weapon.dur}` : '徒手';
    const bz = game.boss && game.boss.hp > 0 ? game.boss : null;
    $('bossBar').style.display = bz ? 'block' : 'none';
    if (bz) $('bossHp').style.width = (bz.hp / bz.max * 100) + '%';
    this.renderBag(game);
    this.renderSide(game);
    // 建造
    document.body.classList.toggle('building', game.buildMode);
    document.querySelectorAll('.bbtn').forEach((b, i) => { b.classList.toggle('sel', i === game.buildType); b.classList.toggle('na', !game.inv.has(BUILDS[i].cost)); });
    $('btnAttack').textContent = game.buildMode ? '放置' : '攻击';
    let hint = '';
    if (game.buildMode && game.ghost) hint = game.ghost.ok ? `${game.ghost.repair ? '修复' : '放置'} ${game.ghost.def.name}（${game.costText(game.ghost.cost)}）` : game.ghost.reason;
    else if (game.focus) hint = (document.body.classList.contains('touch') ? '交互：' : 'E：') + game.focus.label;
    $('hint').textContent = hint; $('hint').style.display = hint ? 'block' : 'none';
    // 目标 / 撤离指示
    const ev = $('evac');
    const tgt = game.objective ? game.objective() : (game.T > EVAC_HOUR - 6 ? { x: EVAC.x, z: EVAC.z, name: game.evacActive ? '北部撤离点' : `撤离点 ${Math.ceil(EVAC_HOUR - game.T)}h 后开放` } : null);
    if (tgt) {
      const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz);
      const a = Math.atan2(dx, dz) - renderer.camYaw;
      ev.style.display = 'flex';
      $('evacArrow').style.transform = `rotate(${a}rad)`;
      $('evacText').textContent = `${tgt.name} ${Math.round(d)}m`;
    } else ev.style.display = 'none';
  }
  renderBag(game) {
    const open = $('bag').classList.contains('open') || (game.panel && game.panel.kind === 'storage');
    if (game.panel && game.panel.kind === 'storage') $('bag').classList.add('open');
    if (!open) return;
    const inv = game.inv;
    const sig = JSON.stringify([inv.slots, game.equip, this.sel, game.panel && game.panel.kind]);
    if (sig === this.sig) return; this.sig = sig;
    if (this.sel >= inv.slots.length) this.sel = -1;
    $('bagCap').textContent = `${inv.slots.length}/${inv.cap}`;
    let html = '';
    for (let i = 0; i < inv.cap; i++) {
      const s = inv.slots[i];
      if (!s) { html += '<div class="slot empty"></div>'; continue; }
      const d = ITEMS[s.id];
      html += `<div class="slot${i === this.sel ? ' sel' : ''}" data-i="${i}" style="border-bottom-color:${d.color}"><span>${short(s.id)}</span><b>${d.weapon ? Math.ceil(s.dur) : s.n}</b></div>`;
    }
    $('bagGrid').innerHTML = html;
    const eq = game.equip;
    $('equipRow').innerHTML = `装备：<b>${eq ? ITEMS[eq.id].name + `（耐久 ${Math.ceil(eq.dur)}）` : '徒手（伤害10）'}</b>${eq ? '<button class="mini">卸下</button>' : ''}`;
    const s = inv.slots[this.sel];
    if (s) {
      const d = ITEMS[s.id];
      const desc = d.weapon ? `伤害 ${d.weapon.dmg} · 耐久 ${Math.ceil(s.dur)}/${d.weapon.dur}` : d.use ? Object.entries(d.use).filter(([, v]) => v).map(([k, v]) => ({ hunger: '饱食', thirst: '水分', hp: '生命', infect: '感染', morale: '士气' }[k] + (v > 0 ? '+' : '') + v)).join(' ') : (d.cat === 'quest' ? '任务物品' : '材料');
      $('slotAct').innerHTML = `<div class="desc">${d.name}×${s.n}：${desc}</div>` +
        (d.weapon ? '<button data-a="use">装备</button>' : d.use ? `<button data-a="use">${d.verb || '使用'}</button>` : '') +
        (game.panel && game.panel.kind === 'storage' ? '<button data-a="store">存入</button>' : '') +
        (d.cat !== 'quest' ? '<button data-a="drop">丢弃</button>' : '');
    } else $('slotAct').innerHTML = '<div class="desc">点选物品查看/使用</div>';
  }
  renderSide(game) {
    const pn = game.panel, side = $('side');
    side.classList.toggle('open', !!pn);
    if (!pn) { this.sideSig = ''; return; }
    let sig, html = '';
    if (pn.kind === 'craft') {
      sig = 'c' + JSON.stringify(game.inv.slots);
      if (sig === this.sideSig) return;
      $('sideTitle').textContent = '工作台 · 合成';
      html = RECIPES.map(r => { const ok = game.inv.has(r.cost); return `<div class="rec${ok ? '' : ' na'}"><div><b>${ITEMS[r.out].name}${r.n > 1 ? '×' + r.n : ''}</b><small>${r.desc}</small><small class="cost">${game.costText(r.cost)}</small></div><button data-a="craft" data-id="${r.id}" ${ok ? '' : 'disabled'}>制作</button></div>`; }).join('');
    } else if (pn.kind === 'storage') {
      const box = pn.s.inv; sig = 's' + JSON.stringify(box ? box.slots : []);
      if (sig === this.sideSig) return;
      $('sideTitle').textContent = `储物箱 ${box ? box.slots.length : 0}/${box ? box.cap : 24}`;
      html = '<div class="grid g6">' + Array.from({ length: box ? box.cap : 24 }, (_, i) => { const s = box && box.slots[i]; if (!s) return '<div class="slot empty"></div>'; const d = ITEMS[s.id]; return `<div class="slot" data-a="take" data-i="${i}" style="border-bottom-color:${d.color}"><span>${short(s.id)}</span><b>${d.weapon ? Math.ceil(s.dur) : s.n}</b></div>`; }).join('') + '</div>' +
        '<div class="desc">点箱内物品取出 · 点背包物品存入</div><button data-a="storeAll" class="wide">全部材料存入</button>';
    } else if (pn.kind === 'npc' && this.renderNpc) { const r = this.renderNpc(game, pn); sig = r.sig; if (sig === this.sideSig) return; html = r.html; $('sideTitle').textContent = r.title; }
    this.sideSig = sig;
    $('sideBody').innerHTML = html;
  }
  npcPanel(game, pn) {
    const n = pn.s, d = n.def;
    const sig = 'n' + JSON.stringify([n.joined, n.mode, Math.round(n.hp), Math.round(n.hunger), Math.round(n.morale), game.inv.has(d.need), Math.ceil(n.healCd || 0), Math.floor(n.forage || 0)]);
    let html = '';
    if (!n.joined) {
      html = `<div class="npcTalk">${d.lines.meet}</div><div class="npcTalk">${d.lines.ask}</div><div class="npcStat">特长：${d.skill}</div>` +
        `<div class="npcBtns"><button data-a="npc" data-id="${n.id}" data-c="give" ${game.inv.has(d.need) ? '' : 'disabled'}>给予 ${d.needText}（招募）</button></div>`;
    } else {
      const b = (c, t) => `<button data-a="npc" data-id="${n.id}" data-c="${c}" class="${n.mode === c ? 'on' : ''}">${t}</button>`;
      html = `<div class="npcTalk">${n.morale < 15 ? d.lines.low : d.lines.join}</div>` +
        `<div class="npcStat">生命 ${Math.round(n.hp)} · 饱食 ${Math.round(n.hunger)} · 士气 ${Math.round(n.morale)} · 当前：${MODE_NAMES[n.mode]}</div><div class="npcStat">${d.skill}</div>` +
        `<div class="npcBtns">${b('follow', '跟随我')}${b('guard', '在这里守卫')}${b('work', '在这里工作')}<button data-a="npc" data-id="${n.id}" data-c="feed">给他食物</button>` +
        (n.id === 'doctor' ? `<button data-a="npc" data-id="${n.id}" data-c="treat">${n.healCd > 0 ? `治疗（${Math.ceil(n.healCd)}h）` : '请求治疗'}</button>` : '') +
        (n.id === 'hunter' ? `<button data-a="npc" data-id="${n.id}" data-c="forage">领取猎物（${Math.floor((n.forage || 0) / 3)}）</button>` : '') + '</div>';
    }
    return { sig, html, title: `${n.role} · ${n.name}` };
  }
  banner(text, sub, kind) {
    const b = $('banner'); b.className = 'show ' + (kind || '');
    $('bannerText').textContent = text; $('bannerSub').textContent = sub || '';
    this.bannerT = 4.5;
  }
  toast(text, isShort) {
    const box = $('toasts');
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => el.classList.add('out'), isShort ? 900 : 1800);
    setTimeout(() => el.remove(), isShort ? 1300 : 2300);
  }
  onEvent(e) {
    if (e.type === 'toast') this.toast(e.text, e.short);
    if (e.type === 'banner') this.banner(e.text, e.sub, e.kind);
    if (e.type === 'mission') this.toast('新任务：' + e.text);
    if (e.type === 'panel' && e.panel === null && !this._keepBag) { /* 关闭储物箱时不强制关背包 */ }
  }
}

// HUD（DOM），只显示游戏状态
import { BUILDS, MISSIONS, RES_NAMES, EVAC, EVAC_HOUR, WAVES } from '../game/game.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

export class Hud {
  constructor() {
    this.toasts = []; this.bannerT = 0; this.t = 0;
    const bb = $('buildBar');
    bb.innerHTML = BUILDS.map((b, i) => `<button class="bbtn" data-i="${i}"><b>${b.name}</b><small>${Object.entries(b.cost).map(([k, v]) => RES_NAMES[k] + v).join(' ')}</small></button>`).join('');
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
    $('mission').textContent = m ? m.text : '';
    const bar = (id, v) => { const el = $(id); el.style.width = Math.max(0, Math.min(100, v)) + '%'; el.parentElement.classList.toggle('low', v < 25); };
    bar('hpBar', p.hp); bar('foodBar', p.hunger); bar('waterBar', p.thirst); bar('stBar', p.stamina);
    for (const k of ['wood', 'stone', 'metal', 'food', 'water']) $('r_' + k).textContent = game.inv[k];
    $('bagCounts').innerHTML = Object.keys(RES_NAMES).map(k => `<div><span>${RES_NAMES[k]}</span><b>${game.inv[k]}</b></div>`).join('') +
      `<div><span>击倒</span><b>${game.kills}</b></div><div><span>工事</span><b>${game.world.structs.size}</b></div>`;
    // 建造
    document.body.classList.toggle('building', game.buildMode);
    document.querySelectorAll('.bbtn').forEach((b, i) => b.classList.toggle('sel', i === game.buildType));
    $('btnAttack').textContent = game.buildMode ? '放置' : '攻击';
    let hint = '';
    if (game.buildMode && game.ghost) hint = game.ghost.ok ? `${game.ghost.repair ? '修复' : '放置'} ${BUILDS[game.buildType].name}（${game.costText(game.ghost.cost)}）` : game.ghost.reason;
    else hint = game.structureHint() || '';
    $('hint').textContent = hint; $('hint').style.display = hint ? 'block' : 'none';
    // 撤离指示
    const ev = $('evac');
    if (game.T > EVAC_HOUR - 6) {
      const dx = EVAC.x - p.x, dz = EVAC.z - p.z, d = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz) - renderer.camYaw;
      ev.style.display = 'flex';
      $('evacArrow').style.transform = `rotate(${ang}rad)`;
      $('evacText').textContent = game.evacActive ? `北部撤离点 ${Math.round(d)}m` : `撤离点 ${Math.ceil(EVAC_HOUR - game.T)}h 后开放 · ${Math.round(d)}m`;
    } else ev.style.display = 'none';
  }
  banner(text, sub, kind) {
    const b = $('banner'); b.className = 'show ' + (kind || '');
    $('bannerText').textContent = text; $('bannerSub').textContent = sub || '';
    this.bannerT = 4.5;
  }
  toast(text, short) {
    const box = $('toasts');
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => el.classList.add('out'), short ? 900 : 1800);
    setTimeout(() => el.remove(), short ? 1300 : 2300);
  }
  onEvent(e) {
    if (e.type === 'toast') this.toast(e.text, e.short);
    if (e.type === 'banner') this.banner(e.text, e.sub, e.kind);
    if (e.type === 'mission') this.toast('新任务：' + e.text);
  }
}
void WAVES;

// WebAudio 程序化音效（无任何音频采样文件，全部实时合成）
// 初稿：副手模型（Numes GLM-5.3）；主 Agent 审核合并：保留包络防爆音/音量记忆/滤波低吼，采纳其噪声旋翼、滤波扫频、琶音提示音
export class Audio {
  constructor() { this.ctx = null; this.vol = 0.7; this.last = {}; this.groanT = 2; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.vol; this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = 0.5; this.amb.connect(this.master);
    // 白噪声缓冲
    const len = c.sampleRate * 2; this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // 风声（循环噪声 + 低通，缓慢调制）
    this.wind = this.loopNoise(380, 0.0); this.rain = this.loopNoise(2600, 0.0, 'highpass'); this.rain2 = this.loopNoise(900, 0.0);
    // 夜间低频嗡鸣
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 55; const og = c.createGain(); og.gain.value = 0; o.connect(og); og.connect(this.amb); o.start(); this.drone = og;
    // 尸潮时的低频噪声层（副手稿）
    this.horde = this.loopNoise(200, 0.0);
    // 直升机旋翼：带通噪声 + 13Hz LFO 振幅调制（副手稿，比方波更像旋翼扑动）
    const hs = c.createBufferSource(); hs.buffer = this.noiseBuf; hs.loop = true;
    const hf = c.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 400; hf.Q.value = 1.5;
    const throb = c.createGain(); throb.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.frequency.value = 13; const lg = c.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(throb.gain); lfo.start();
    const hg = c.createGain(); hg.gain.value = 0;
    hs.connect(hf); hf.connect(throb); throb.connect(hg); hg.connect(this.amb); hs.start();
    this.heli = { g: hg };
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  loopNoise(freq, gain, type = 'lowpass') {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = gain; src.connect(f); f.connect(g); g.connect(this.amb); src.start();
    return { g, f };
  }
  env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  tone(type, f0, f1, dur, peak = 0.3, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(g); g.connect(this.sfx); this.env(g, t, 0.005, peak, dur); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(freq, dur, peak = 0.3, type = 'lowpass', delay = 0, q = 1, f1 = 0) {
    const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); // 滤波扫频（副手稿）
    s.connect(f); f.connect(g); g.connect(this.sfx); this.env(g, t, 0.004, peak, dur); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  play(type, vol = 1) {
    if (!this.ctx || this.vol <= 0) return;
    const now = this.ctx.currentTime;
    if (this.last[type] && now - this.last[type] < 0.04) return; this.last[type] = now;
    const v = vol;
    switch (type) {
      case 'swing': this.noise(3000, 0.12, 0.14 * v, 'bandpass', 0, 1.5, 600); break;
      case 'hit': this.tone('sine', 150, 60, 0.15, 0.35 * v); this.noise(900, 0.08, 0.2 * v); break;
      case 'harvest': this.tone('triangle', 220, 120, 0.1, 0.2 * v); this.noise(1400, 0.06, 0.15 * v, 'bandpass'); this.tone('triangle', 520, 0, 0.07, 0.08 * v, 0.06); break;
      case 'break': this.noise(2500, 0.3, 0.35 * v, 'lowpass', 0, 2, 200); this.tone('square', 90, 40, 0.25, 0.08 * v); break;
      case 'place': this.tone('triangle', 330, 200, 0.08, 0.25 * v); this.tone('triangle', 260, 160, 0.08, 0.2 * v, 0.07); break;
      case 'explode': this.noise(300, 1.0, 0.7 * v); this.tone('sine', 80, 25, 0.9, 0.6 * v); this.noise(2500, 0.3, 0.25 * v, 'highpass'); break;
      case 'hurt': this.tone('square', 140, 70, 0.18, 0.18 * v); break;
      case 'zdeath': this.noise(700, 0.25, 0.25 * v); this.tone('triangle', 180, 60, 0.2, 0.12 * v); break;
      case 'groan': { const c = this.ctx, t = c.currentTime, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = 85 + Math.random() * 50; l.frequency.value = 5 + Math.random() * 3; lg.gain.value = 10; l.connect(lg); lg.connect(o.frequency);
        f.type = 'lowpass'; f.frequency.value = 520; o.connect(f); f.connect(g); g.connect(this.sfx); this.env(g, t, 0.15, 0.09 * v, 0.8); o.start(t); l.start(t); o.stop(t + 1.1); l.stop(t + 1.1); break; }
      case 'alarm': for (let i = 0; i < 3; i++) { this.tone('sine', 560, 900, 0.55, 0.22 * v, i * 0.7); this.tone('sine', 900, 560, 0.15, 0.15 * v, i * 0.7 + 0.55); } break;
      case 'boss': this.tone('sawtooth', 70, 35, 1.4, 0.35 * v); this.noise(200, 1.2, 0.3 * v); break;
      case 'shot': this.tone('triangle', 900, 300, 0.09, 0.22 * v); this.noise(3000, 0.05, 0.12 * v, 'highpass'); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(1200, 0.05, 0.12 * v, 'bandpass', i * 0.09); break;
      case 'drink': for (let i = 0; i < 3; i++) this.tone('sine', 500 + i * 80, 300, 0.07, 0.15 * v, i * 0.1); break;
      case 'craft': this.tone('square', 660, 440, 0.06, 0.12 * v); this.tone('square', 880, 660, 0.06, 0.1 * v, 0.08); break;
      case 'door': this.tone('sawtooth', 180, 240, 0.25, 0.06 * v); this.noise(400, 0.1, 0.15 * v, 'lowpass', 0.2); break;
      case 'ui': this.tone('sine', 880, 660, 0.05, 0.08 * v); break;
      case 'mission': [523, 659, 784].forEach((f, i) => this.tone('triangle', f, 0, 0.22, 0.18 * v, i * 0.14)); break; // 三音琶音（副手稿，改用音频时钟排程）
      case 'radio': for (let i = 0; i < 4; i++) this.tone('square', 1200, 0, 0.06, 0.08 * v, i * 0.12); this.noise(3000, 0.6, 0.08 * v, 'bandpass', 0.5); break;
      case 'fuse': this.tone('sine', 300, 1200, 0.6, 0.12 * v); break;
      case 'stomp': this.tone('sine', 60, 30, 0.4, 0.5 * v); this.noise(250, 0.3, 0.3 * v); break;
      case 'jump': this.noise(600, 0.06, 0.08 * v); break;
      case 'end': this.tone('sine', 392, 0, 0.4, 0.2 * v); this.tone('sine', 523, 0, 0.6, 0.2 * v, 0.35); break;
      default: break;
    }
  }
  // 每帧：环境音
  update(game, dt) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, w = game.weather ? game.weather() : 'clear';
    const night = 1 - game.daylight();
    this.wind.g.gain.setTargetAtTime(0.05 + 0.05 * night + (w === 'fog' ? 0.04 : 0), t, 0.5);
    this.wind.f.frequency.setTargetAtTime(300 + Math.sin(t * 0.3) * 120, t, 0.5);
    this.rain.g.gain.setTargetAtTime(w === 'rain' ? 0.12 : 0, t, 0.8); this.rain2.g.gain.setTargetAtTime(w === 'rain' ? 0.1 : 0, t, 0.8);
    this.drone.gain.setTargetAtTime(game.activeWave ? 0.06 : 0.02 * night, t, 0.8);
    this.horde.g.gain.setTargetAtTime(game.activeWave ? 0.14 : 0, t, 1.2);
    const p = game.player, heli = game.T > 70.5 && game.state === 'play';
    const hd = heli ? Math.max(0, 1 - Math.hypot(p.x - 47.5, p.z - 179.5) / 150) : 0;
    this.heli.g.gain.setTargetAtTime(0.35 * hd, t, 0.5);
    // 附近感染者低吼
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = 2.5 + Math.random() * 3;
      let near = 99; for (const z of game.zm.list) near = Math.min(near, Math.hypot(z.x - p.x, z.z - p.z));
      if (near < 16) this.play('groan', 1 - near / 18);
    }
  }
}

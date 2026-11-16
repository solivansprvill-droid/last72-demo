// 输入：键鼠 + 触屏（左摇杆 / 右侧拖动转视角 / 点按采集）
export class Input {
  constructor(canvas, actions, renderer) {
    this.canvas = canvas; this.a = actions; this.r = renderer;
    this.keys = {}; this.mx = 0; this.mz = 0; this.run = false; this.jump = false;
    this.joy = null; this.look = null; this.touchRun = false;
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2 };
    this.ghostCell = null; this.tapCell = null; this.enabled = false;
    this.bindKeys(); this.bindPointer();
  }
  bindKeys() {
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'tab'].includes(k)) e.preventDefault();
      if (e.repeat) { this.keys[k] = true; return; }
      this.keys[k] = true;
      if (k === ' ') this.jump = true;
      if (k === 'e') this.a.interact();
      if (k === 'b') this.a.build();
      if (k === '1' || k === '2' || k === '3') this.a.buildType(+k - 1);
      if (k === 'f') this.a.eat();
      if (k === 'g') this.a.drink();
      if (k === 'tab' || k === 'i') this.a.bag();
      if (k === 'escape' || k === 'p') this.a.pause();
      if (k === 'j' || k === 'enter') this.a.attack(null);
    });
    addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    addEventListener('blur', () => { this.keys = {}; });
  }
  bindPointer() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse') {
        if (e.button === 2) { this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, mouse: true }; return; }
        if (e.button === 0) {
          if (!document.pointerLockElement && !this.noLock) { try { c.requestPointerLock(); } catch (_) {} }
          this.a.attack(this.pickTarget(this.aimX(), this.aimY()));
        }
        return;
      }
      // 触屏：屏幕左侧下半部分 = 摇杆，其余 = 视角/点按
      try { c.setPointerCapture(e.pointerId); } catch (_) {}
      if (!this.joy && e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.35) {
        this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
        this.showJoy();
      } else if (!this.look) {
        this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.mouse.x = e.clientX; this.mouse.y = e.clientY;
        if (document.pointerLockElement === c) { this.rotate(e.movementX * 0.0035, e.movementY * 0.0028); return; }
      }
      if (this.joy && e.pointerId === this.joy.id) { this.joy.x = e.clientX; this.joy.y = e.clientY; this.showJoy(); return; }
      if (this.look && e.pointerId === this.look.id) {
        const dx = e.clientX - this.look.x, dy = e.clientY - this.look.y;
        this.look.x = e.clientX; this.look.y = e.clientY; this.look.moved = (this.look.moved || 0) + Math.abs(dx) + Math.abs(dy);
        this.rotate(dx * 0.0065, dy * 0.005);
      }
    });
    const up = (e) => {
      if (this.joy && e.pointerId === this.joy.id) { this.joy = null; this.mx = 0; this.mz = 0; this.touchRun = false; this.showJoy(); }
      if (this.look && e.pointerId === this.look.id) {
        const L = this.look; this.look = null;
        if (!L.mouse && L.moved < 12 && performance.now() - L.t < 350) this.tap(L.sx, L.sy);
      }
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  }
  aimX() { return document.pointerLockElement ? innerWidth / 2 : this.mouse.x; }
  aimY() { return document.pointerLockElement ? innerHeight * 0.55 : this.mouse.y; }
  rotate(dx, dy) {
    this.r.camYaw += dx;
    this.r.camPitch = Math.max(-0.15, Math.min(1.2, this.r.camPitch + dy));
  }
  pickTarget(x, y) { const h = this.r.pick(x, y); return h ? h.block : null; }
  tap(x, y) {
    const h = this.r.pick(x, y);
    if (this.a.isBuild()) { if (h) this.tapCell = { x: h.cell.x, z: h.cell.z }; return; }
    this.a.attack(h ? h.block : null);
  }
  showJoy() {
    const base = document.getElementById('joyBase'), knob = document.getElementById('joyKnob');
    if (!this.joy) { base.style.display = 'none'; return; }
    let dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy; const R = 55, l = Math.hypot(dx, dy);
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    base.style.display = 'block';
    base.style.left = (this.joy.ox - 60) + 'px'; base.style.top = (this.joy.oy - 60) + 'px';
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.mx = dx / R; this.mz = -dy / R; this.touchRun = l > R * 0.95;
  }
  // 每帧读取
  poll(game) {
    let mx = this.mx, mz = this.mz;
    const k = this.keys;
    if (!this.joy) {
      mx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
      mz = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0);
    }
    const run = this.joy ? this.touchRun : !!k.shift;
    const jump = this.jump; this.jump = false;
    // 建造预览格
    let ghostCell = null;
    if (game.buildMode) {
      if (this.tapCell) ghostCell = this.tapCell;
      else if (!this.isTouch) {
        this._gT = (this._gT || 0) + 1;
        if (this._gT % 4 === 0) { const h = this.r.pick(this.aimX(), this.aimY()); this._gc = h ? { x: h.cell.x, z: h.cell.z } : null; }
        ghostCell = this._gc;
      }
    } else this.tapCell = null;
    return { mx, mz, run, jump, camYaw: this.r.camYaw, ghostCell };
  }
}

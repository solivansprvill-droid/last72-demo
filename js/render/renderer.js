// Babylon.js 渲染层：只读取 game 状态并绘制，所有画面均为体素/方块
import { W, D, H, CH, B, COLORS } from '../game/voxels.js';
import { buildChunk, GeoBuilder } from '../game/mesher.js';
import { EVAC, BUILDS } from '../game/game.js';

const BJ = () => window.BABYLON;

function lerp(a, b, t) { return a + (b - a) * t; }
function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

export class Renderer {
  constructor(canvas, opts = {}) {
    const BABYLON = BJ();
    this.canvas = canvas;
    this.mobile = !!opts.mobile;
    this.engine = new BABYLON.Engine(canvas, !this.mobile, { preserveDrawingBuffer: true, stencil: false, powerPreference: 'high-performance' }, false);
    const dpr = window.devicePixelRatio || 1;
    this.engine.setHardwareScalingLevel(1 / Math.min(dpr, this.mobile ? 1.25 : 1.5));
    const scene = this.scene = new BABYLON.Scene(this.engine);
    scene.skipPointerMovePicking = true;
    scene.autoClear = true;
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.02;
    this.cam = new BABYLON.FreeCamera('cam', new BABYLON.Vector3(0, 10, -10), scene);
    this.cam.fov = this.mobile ? 1.0 : 0.9; this.cam.minZ = 0.1; this.cam.maxZ = 140;
    this.camYaw = 0; this.camPitch = 0.38; this.camDist = this.mobile ? 7.5 : 6.5; this.curDist = this.camDist;
    this.hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.35, 1, 0.2), scene);
    this.hemi.specular = new BABYLON.Color3(0, 0, 0);
    this.sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.5, -1, 0.35), scene);
    this.sun.specular = new BABYLON.Color3(0, 0, 0);
    this.torch = new BABYLON.PointLight('torch', new BABYLON.Vector3(0, 3, 0), scene);
    this.torch.diffuse = new BABYLON.Color3(1, 0.78, 0.5); this.torch.specular = new BABYLON.Color3(0, 0, 0); this.torch.range = 12;

    this.mat = new BABYLON.StandardMaterial('vox', scene);
    this.mat.specularColor = new BABYLON.Color3(0, 0, 0);
    this.mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
    this.glowMat = new BABYLON.StandardMaterial('glow', scene);
    this.glowMat.disableLighting = true; this.glowMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
    this.chunks = new Map();
    this.debris = [];
    this.zSlots = new Map();
    this.flashT = 0;
    this._m = { r: new BABYLON.Matrix(), l: new BABYLON.Matrix(), t: new BABYLON.Matrix(), o: new BABYLON.Matrix(), q: new BABYLON.Quaternion() };
    this.buildModels();
  }

  // ---------- 模型 ----------
  meshFrom(name, gb, mat) {
    const BABYLON = BJ();
    const m = new BABYLON.Mesh(name, this.scene);
    const vd = new BABYLON.VertexData();
    const d = gb.data();
    vd.positions = d.positions; vd.normals = d.normals; vd.colors = d.colors; vd.indices = d.indices;
    vd.applyToMesh(m, true);
    m.material = mat || this.mat;
    m.isPickable = false;
    return m;
  }
  thin(mesh, n) {
    mesh._mat = new Float32Array(16 * n); mesh._col = new Float32Array(4 * n).fill(1);
    mesh.thinInstanceSetBuffer('matrix', mesh._mat, 16, false);
    mesh.thinInstanceSetBuffer('color', mesh._col, 4, false);
    mesh.thinInstanceCount = 0;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh._cap = n;
    return mesh;
  }
  buildModels() {
    const BABYLON = BJ();
    const skin = [0.85, 0.66, 0.5], jacket = [0.86, 0.55, 0.16], pants = [0.2, 0.22, 0.27], hair = [0.12, 0.1, 0.09];
    const P = this.player = new BABYLON.TransformNode('player', this.scene);
    const body = new GeoBuilder();
    body.box(-0.3, 0.8, -0.16, 0.3, 1.38, 0.16, jacket);
    body.box(-0.31, 1.2, -0.17, 0.31, 1.26, 0.17, [0.25, 0.27, 0.32]); // 背带
    body.box(-0.2, 1.38, -0.2, 0.2, 1.78, 0.2, skin);
    body.box(-0.21, 1.66, -0.21, 0.21, 1.8, 0.21, hair);
    body.box(-0.21, 1.5, -0.21, 0.21, 1.66, -0.15, hair);
    body.box(-0.12, 1.54, 0.2, -0.05, 1.6, 0.215, [0.1, 0.1, 0.1]); body.box(0.05, 1.54, 0.2, 0.12, 1.6, 0.215, [0.1, 0.1, 0.1]);
    body.box(-0.24, 0.85, -0.3, 0.24, 1.3, -0.16, [0.3, 0.33, 0.28]); // 背包
    this.pBody = this.meshFrom('pBody', body); this.pBody.parent = P;
    const leg = new GeoBuilder(); leg.box(-0.12, -0.8, -0.12, 0.12, 0, 0.12, pants); leg.box(-0.13, -0.8, -0.13, 0.13, -0.68, 0.16, [0.12, 0.12, 0.12]);
    this.pLegL = this.meshFrom('pLegL', leg); this.pLegL.parent = P; this.pLegL.position.set(-0.14, 0.8, 0);
    this.pLegR = this.meshFrom('pLegR', leg); this.pLegR.parent = P; this.pLegR.position.set(0.14, 0.8, 0);
    const arm = new GeoBuilder(); arm.box(-0.1, -0.6, -0.1, 0.1, 0, 0.1, jacket); arm.box(-0.09, -0.72, -0.09, 0.09, -0.6, 0.09, skin);
    this.pArmL = this.meshFrom('pArmL', arm); this.pArmL.parent = P; this.pArmL.position.set(-0.4, 1.36, 0);
    const armR = new GeoBuilder(); armR.box(-0.1, -0.6, -0.1, 0.1, 0, 0.1, jacket); armR.box(-0.09, -0.72, -0.09, 0.09, -0.6, 0.09, skin);
    this.pArmR = this.meshFrom('pArmR', armR); this.pArmR.parent = P; this.pArmR.position.set(0.4, 1.36, 0);
    // 武器模型（挂在右手）
    const wsg = new GeoBuilder(); wsg.box(-0.05, -0.75, -0.05, 0.05, -0.65, 0.85, [0.5, 0.34, 0.2]); wsg.box(-0.065, -0.765, 0.6, 0.065, -0.635, 0.88, [0.42, 0.28, 0.16]);
    const wpg = new GeoBuilder(); wpg.box(-0.05, -0.75, -0.05, 0.05, -0.65, 0.95, [0.55, 0.57, 0.6]); wpg.box(-0.07, -0.77, 0.6, 0.07, -0.63, 0.98, [0.35, 0.36, 0.38]);
    const wag = new GeoBuilder(); wag.box(-0.05, -0.75, -0.05, 0.05, -0.65, 1.0, [0.45, 0.3, 0.18]); wag.box(-0.04, -0.95, 0.72, 0.04, -0.62, 1.02, [0.75, 0.2, 0.15]); wag.box(-0.035, -1.05, 0.74, 0.035, -0.92, 0.98, [0.7, 0.72, 0.75]);
    this.weapons = { stick: this.meshFrom('wStick', wsg), pipe: this.meshFrom('wPipe', wpg), axe: this.meshFrom('wAxe', wag) };
    for (const m of Object.values(this.weapons)) { m.parent = this.pArmR; m.setEnabled(false); }
    this.lampLights = [];
    for (let i = 0; i < 3; i++) { const L = new BABYLON.PointLight('lamp' + i, new BABYLON.Vector3(0, -50, 0), this.scene); L.diffuse = new BABYLON.Color3(1, 0.9, 0.62); L.specular = new BABYLON.Color3(0, 0, 0); L.range = 10; L.intensity = 0; this.lampLights.push(L); }

    // 感染者（风格化体素人形，无血腥）
    const zskin = [0.46, 0.55, 0.45], eye = [0.95, 0.66, 0.2];
    const mkBody = (shirt, pantsC) => {
      const g = new GeoBuilder();
      g.box(-0.3, 0.8, -0.16, 0.3, 1.38, 0.16, shirt);
      g.box(-0.3, 0.8, -0.165, -0.05, 0.95, 0.165, pantsC);
      g.box(-0.2, 1.38, -0.2, 0.2, 1.76, 0.2, zskin);
      g.box(-0.21, 1.66, -0.21, 0.21, 1.78, 0.21, [0.22, 0.24, 0.2]);
      g.box(-0.13, 1.54, 0.2, -0.05, 1.6, 0.215, eye, false); g.box(0.05, 1.54, 0.2, 0.13, 1.6, 0.215, eye, false);
      return g;
    };
    this.zBody = { walker: this.thin(this.meshFrom('zBodyW', mkBody([0.26, 0.33, 0.42], [0.2, 0.22, 0.26])), 32), runner: this.thin(this.meshFrom('zBodyR', mkBody([0.45, 0.16, 0.15], [0.16, 0.16, 0.18])), 32) };
    const zl = new GeoBuilder(); zl.box(-0.12, -0.8, -0.12, 0.12, 0, 0.12, [0.22, 0.23, 0.27]); zl.box(-0.12, -0.8, -0.12, 0.12, -0.7, 0.15, [0.12, 0.12, 0.12]);
    this.zLeg = this.thin(this.meshFrom('zLeg', zl), 64);
    const za = new GeoBuilder(); za.box(-0.09, -0.62, -0.09, 0.09, 0, 0.09, zskin);
    this.zArm = this.thin(this.meshFrom('zArm', za), 64);
    // 碎块
    const cube = new GeoBuilder(); cube.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [1, 1, 1]);
    this.debrisMesh = this.thin(this.meshFrom('debris', cube), 220);
    // 建造预览
    this.ghost = BABYLON.MeshBuilder.CreateBox('ghost', { size: 1 }, this.scene);
    this.ghostMat = new BABYLON.StandardMaterial('gm', this.scene);
    this.ghostMat.alpha = 0.45; this.ghostMat.disableLighting = true; this.ghostMat.emissiveColor = new BABYLON.Color3(0.3, 1, 0.4);
    this.ghost.material = this.ghostMat; this.ghost.isPickable = false; this.ghost.setEnabled(false);
    // 直升机（无标志）
    const hg = new GeoBuilder();
    const hb = [0.24, 0.27, 0.24], stripe = [0.9, 0.6, 0.16], glass = [0.3, 0.45, 0.6];
    hg.box(-1.1, 0, -2, 1.1, 1.8, 1.6, hb); hg.box(-1.0, 0.5, 1.6, 1.0, 1.7, 2.6, glass); hg.box(-1.12, 0.7, -1.6, 1.12, 0.95, 1.4, stripe);
    hg.box(-0.35, 0.9, -6, 0.35, 1.5, -2, hb); hg.box(-0.1, 1.2, -6.2, 0.1, 2.6, -5.4, hb); hg.box(-0.12, 1.4, -6.3, 0.12, 1.7, -5.6, stripe);
    hg.box(-1.4, -0.6, -1.4, -1.2, -0.45, 1.6, [0.15, 0.15, 0.15]); hg.box(1.2, -0.6, -1.4, 1.4, -0.45, 1.6, [0.15, 0.15, 0.15]);
    hg.box(-0.9, -0.45, -0.2, -0.8, 0, 0.0, [0.15, 0.15, 0.15]); hg.box(0.8, -0.45, -0.2, 0.9, 0, 0, [0.15, 0.15, 0.15]);
    hg.box(-0.15, 1.8, -0.15, 0.15, 2.2, 0.15, [0.15, 0.15, 0.15]);
    this.heli = this.meshFrom('heli', hg);
    const rg = new GeoBuilder(); rg.box(-5, 0, -0.18, 5, 0.1, 0.18, [0.12, 0.12, 0.12]); rg.box(-0.18, 0, -5, 0.18, 0.1, 5, [0.12, 0.12, 0.12]);
    this.rotor = this.meshFrom('rotor', rg); this.rotor.parent = this.heli; this.rotor.position.y = 2.2;
    this.heli.position.set(EVAC.x, 40, EVAC.z); this.heli.setEnabled(false);
    // 撤离光柱
    this.beacon = BABYLON.MeshBuilder.CreateBox('beacon', { width: 9, depth: 9, height: 40 }, this.scene);
    const bm = new BABYLON.StandardMaterial('bm', this.scene); bm.disableLighting = true; bm.emissiveColor = new BABYLON.Color3(0.3, 0.75, 1); bm.alpha = 0.12; bm.backFaceCulling = false;
    this.beacon.material = bm; this.beacon.position.set(EVAC.x, 20.5, EVAC.z); this.beacon.isPickable = false; this.beacon.setEnabled(false);
    this.beaconMat = bm;
  }

  // ---------- 世界 ----------
  syncWorld(world, budget = 4) {
    const BABYLON = BJ();
    let n = 0;
    for (const key of world.dirty) {
      if (n++ >= budget) break;
      world.dirty.delete(key);
      const cx = key % 100, cz = Math.floor(key / 100);
      const geo = buildChunk(world, cx, cz);
      let c = this.chunks.get(key);
      if (!c) {
        c = { solid: new BABYLON.Mesh('c' + key, this.scene), glow: new BABYLON.Mesh('g' + key, this.scene) };
        c.solid.material = this.mat; c.glow.material = this.glowMat; c.solid.isPickable = true; c.glow.isPickable = false; c.solid._chunk = true;
        this.chunks.set(key, c);
      }
      for (const [m, d] of [[c.solid, geo.solid], [c.glow, geo.glow]]) {
        if (!d.indices.length) { m.setEnabled(false); continue; }
        m.setEnabled(true);
        const vd = new BABYLON.VertexData();
        vd.positions = d.positions; vd.normals = d.normals; vd.colors = d.colors; vd.indices = d.indices;
        vd.applyToMesh(m, false);
        m.freezeWorldMatrix();
      }
    }
  }

  pick(sx, sy) {
    const r = this.scene.pick(sx, sy, (m) => m._chunk === true);
    if (!r || !r.hit) return null;
    const n = r.getNormal(true) || { x: 0, y: 1, z: 0 };
    const p = r.pickedPoint;
    const inside = { x: Math.floor(p.x - n.x * 0.01), y: Math.floor(p.y - n.y * 0.01), z: Math.floor(p.z - n.z * 0.01) };
    const outside = { x: Math.floor(p.x + n.x * 0.01), y: Math.floor(p.y + n.y * 0.01), z: Math.floor(p.z + n.z * 0.01) };
    return { block: inside, cell: outside, point: p };
  }

  // ---------- 每帧 ----------
  render(game, dt) {
    const BABYLON = BJ();
    this.syncWorld(game.world);
    const p = game.player;
    // 相机
    const tx = p.x, ty = p.y + 1.75, tz = p.z;
    const fx0 = Math.floor(p.x), fz0 = Math.floor(p.z), fy0 = Math.floor(p.y);
    const indoor = game.world.solid(fx0, fy0 + 4, fz0) || game.world.solid(fx0, fy0 + 5, fz0);
    this.effPitch = lerp(this.effPitch ?? this.camPitch, indoor ? Math.min(this.camPitch, 0.12) : this.camPitch, Math.min(1, dt * 4 + (dt === 0 ? 1 : 0)));
    const cp = Math.cos(this.effPitch), sp = Math.sin(this.effPitch);
    const bx = -Math.sin(this.camYaw) * cp, by = sp, bz = -Math.cos(this.camYaw) * cp;
    let dist = this.camDist * (p.onTower ? 1.6 : 1);
    for (let s = 0.4; s <= dist; s += 0.2) {
      const ct = game.world.get(Math.floor(tx + bx * s), Math.floor(ty + by * s), Math.floor(tz + bz * s));
      if (ct !== 0 && ct !== B.LEAF && ct !== B.S_SPIKE) { dist = Math.max(0.6, s - 0.35); break; }
    }
    this.curDist = dist < this.curDist ? dist : lerp(this.curDist, dist, Math.min(1, dt * 5));
    this.cam.position.set(tx + bx * this.curDist, ty + by * this.curDist, tz + bz * this.curDist);
    this.cam.setTarget(new BABYLON.Vector3(tx, ty - 0.25, tz));

    // 昼夜
    const dl = game.daylight();
    const h = game.clockHour();
    const dusk = (h > 16.5 && h < 20) || (h > 4.5 && h < 7.5) ? Math.max(0, 1 - Math.abs(dl - 0.5) * 2) : 0;
    const day = [0.55, 0.6, 0.66], night = [0.035, 0.05, 0.09], duskC = [0.62, 0.38, 0.24];
    let sky = lerp3(night, day, dl); sky = lerp3(sky, duskC, dusk * 0.7);
    if (game.activeWave) sky = lerp3(sky, [0.18, 0.06, 0.06], 0.25);
    this.scene.clearColor = new BABYLON.Color4(sky[0], sky[1], sky[2], 1);
    this.scene.fogColor = new BABYLON.Color3(sky[0], sky[1], sky[2]);
    this.scene.fogDensity = lerp(0.04, 0.017, dl);
    this.hemi.intensity = lerp(0.32, 0.95, dl);
    this.hemi.diffuse = new BABYLON.Color3(...lerp3([0.45, 0.55, 0.85], [1, 0.97, 0.92], dl));
    this.hemi.groundColor = new BABYLON.Color3(...lerp3([0.08, 0.1, 0.16], [0.35, 0.33, 0.32], dl));
    this.sun.intensity = lerp(0.0, 0.55, dl) + dusk * 0.2;
    this.sun.diffuse = new BABYLON.Color3(...lerp3([1, 0.95, 0.85], [1, 0.6, 0.35], dusk));
    this.torch.intensity = lerp(1.25, 0, dl);
    this.torch.position.set(p.x + Math.sin(p.yaw) * 0.6, p.y + 2.3, p.z + Math.cos(p.yaw) * 0.6);
    this.glowMat.emissiveColor = new BABYLON.Color3(...lerp3([1.1, 1, 0.85], [0.75, 0.7, 0.6], dl));

    // 玩家
    const P = this.player;
    P.position.set(p.x, p.y, p.z); P.rotation.y = p.yaw;
    const sw = Math.sin(p.walk * 2.6) * 0.7;
    const mv = Math.hypot(p.x - (this._px ?? p.x), p.z - (this._pz ?? p.z)); this._px = p.x; this._pz = p.z;
    const moving = mv > 0.004;
    this.pLegL.rotation.x = moving ? sw : 0; this.pLegR.rotation.x = moving ? -sw : 0;
    this.pArmL.rotation.x = moving ? -sw * 0.7 : 0;
    this.pArmR.rotation.x = p.swing > 0 ? -2.2 + (0.3 - p.swing) / 0.3 * 2.6 : (game.buildMode ? -0.9 : (moving ? sw * 0.5 : -0.3));
    P.setEnabled(!p.dead);
    const eid = game.equip ? game.equip.id : null;
    for (const k in this.weapons) this.weapons[k].setEnabled(k === eid);
    // 照明灯点光源（最近的 3 盏）
    const lit = (game.litLamps || []).slice().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    this.lampLights.forEach((L, i) => { const l = lit[i]; if (l) { L.position.set(l.x + 0.5, l.y + 2.2, l.z + 0.5); L.intensity = 1.1; } else L.intensity = 0; });

    // 感染者
    this.updateZombies(game, dt);
    // 碎块
    this.updateDebris(game, dt);
    // 建造预览
    const g = game.ghost;
    if (game.buildMode && g) {
      this.ghost.setEnabled(true);
      const cs = g.def.cells; let x0 = 9, x1 = -9, y1 = 0, z0 = 9, z1 = -9;
      for (const c of cs) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]); z0 = Math.min(z0, c[2]); z1 = Math.max(z1, c[2]); }
      const hy = cs.length === 1 && !g.def.block ? 0.5 : y1 + 1.02;
      this.ghost.scaling.set(x1 - x0 + 1.02, hy, z1 - z0 + 1.02);
      this.ghost.position.set(g.x + (x0 + x1) / 2 + 0.5, g.y + hy / 2, g.z + (z0 + z1) / 2 + 0.5);
      this.ghostMat.emissiveColor = g.ok ? (g.repair ? new BABYLON.Color3(0.3, 0.7, 1) : new BABYLON.Color3(0.3, 1, 0.4)) : new BABYLON.Color3(1, 0.3, 0.2);
    } else this.ghost.setEnabled(false);
    // 撤离
    const t = performance.now() / 1000;
    if (game.T > 70.5 && !this.heli.isEnabled()) this.heli.setEnabled(true);
    if (this.heli.isEnabled()) {
      const k = Math.min(1, Math.max(0, (game.T - 70.5) / 1.5));
      const targetY = lerp(40, 4.2, k);
      this.heli.position.y = targetY + Math.sin(t * 2) * 0.15;
      this.heli.rotation.y = 0.6;
      this.rotor.rotation.y += dt * 25;
    }
    this.beacon.setEnabled(game.evacActive);
    if (game.evacActive) this.beaconMat.alpha = 0.1 + Math.sin(t * 3) * 0.05;
    this.scene.render();
  }

  updateZombies(game, dt) {
    const BABYLON = BJ();
    const M = this._m, list = game.zm.list;
    const counts = { walker: 0, runner: 0 }; let nl = 0, na = 0;
    const bufs = {
      walker: this.zBody.walker._mat, runner: this.zBody.runner._mat,
    };
    const leg = this.zLeg, arm = this.zArm;
    const legM = leg._mat, armM = arm._mat;
    const colW = this.zBody.walker._col, colR = this.zBody.runner._col;
    const legC = leg._col, armC = arm._col;
    const scl = new BABYLON.Vector3(1, 1, 1), pos = new BABYLON.Vector3();
    for (const zb of list) {
      const s = zb.type === 'runner' ? 0.92 : 1.0;
      scl.set(s, s, s); pos.set(zb.x, zb.y, zb.z);
      BABYLON.Quaternion.RotationYawPitchRollToRef(zb.yaw, zb.type === 'runner' && zb.state === 'chase' ? 0.18 : 0.05, 0, M.q);
      BABYLON.Matrix.ComposeToRef(scl, M.q, pos, M.r);
      const f = zb.flash > 0 ? 2.2 : 1;
      // 身体
      const bi = counts[zb.type]++;
      M.r.copyToArray(bufs[zb.type], bi * 16);
      const cb = zb.type === 'runner' ? colR : colW; cb[bi * 4] = f; cb[bi * 4 + 1] = f; cb[bi * 4 + 2] = f; cb[bi * 4 + 3] = 1;
      const sw = Math.sin(zb.walk * (zb.type === 'runner' ? 3.2 : 2.4)) * 0.6;
      for (const [px, a] of [[-0.14, sw], [0.14, -sw]]) {
        BABYLON.Matrix.RotationXToRef(a, M.l); BABYLON.Matrix.TranslationToRef(px, 0.8, 0, M.t);
        M.l.multiplyToRef(M.t, M.o); M.o.multiplyToRef(M.r, M.l);
        M.l.copyToArray(legM, nl * 16); legC[nl * 4] = f; legC[nl * 4 + 1] = f; legC[nl * 4 + 2] = f; legC[nl * 4 + 3] = 1; nl++;
      }
      const atk = zb.swing ? Math.sin(zb.swing / 0.35 * Math.PI) * 0.8 : 0;
      for (const [px, a] of [[-0.39, -1.45 + sw * 0.15 - atk], [0.39, -1.45 - sw * 0.15 - atk]]) {
        BABYLON.Matrix.RotationXToRef(a, M.l); BABYLON.Matrix.TranslationToRef(px, 1.34, 0, M.t);
        M.l.multiplyToRef(M.t, M.o); M.o.multiplyToRef(M.r, M.l);
        M.l.copyToArray(armM, na * 16); armC[na * 4] = f; armC[na * 4 + 1] = f; armC[na * 4 + 2] = f; armC[na * 4 + 3] = 1; na++;
      }
    }
    for (const k of ['walker', 'runner']) { const m = this.zBody[k]; m.thinInstanceCount = counts[k]; m.thinInstanceBufferUpdated('matrix'); m.thinInstanceBufferUpdated('color'); }
    leg.thinInstanceCount = nl; arm.thinInstanceCount = na;
    leg.thinInstanceBufferUpdated('matrix'); leg.thinInstanceBufferUpdated('color');
    arm.thinInstanceBufferUpdated('matrix'); arm.thinInstanceBufferUpdated('color');
  }

  spawnDebris(x, y, z, col, n, size = 0.3, power = 3) {
    for (let i = 0; i < n; i++) {
      if (this.debris.length >= this.debrisMesh._cap) this.debris.shift();
      const v = 0.85 + Math.random() * 0.3;
      this.debris.push({
        x: x + (Math.random() - 0.5) * 0.6, y: y + (Math.random() - 0.5) * 0.6, z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * power, vy: Math.random() * power + 1, vz: (Math.random() - 0.5) * power,
        life: 1.4 + Math.random() * 0.8, s: size * (0.7 + Math.random() * 0.6), c: [col[0] * v, col[1] * v, col[2] * v], rot: Math.random() * 3,
      });
    }
  }
  updateDebris(game, dt) {
    const BABYLON = BJ();
    const M = this._m, m = this.debrisMesh;
    const mat = m._mat, col = m._col;
    const scl = new BABYLON.Vector3(), pos = new BABYLON.Vector3();
    let n = 0;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt; if (d.life <= 0) { this.debris.splice(i, 1); continue; }
      d.vy -= 18 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rot += dt * 4;
      if (game.world.solid(Math.floor(d.x), Math.floor(d.y - d.s / 2), Math.floor(d.z))) { d.y = Math.floor(d.y - d.s / 2) + 1 + d.s / 2; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; }
    }
    for (const d of this.debris) {
      const s = d.s * Math.min(1, d.life * 2);
      scl.set(s, s, s); pos.set(d.x, d.y, d.z);
      BABYLON.Quaternion.RotationYawPitchRollToRef(d.rot, d.rot * 0.7, 0, M.q);
      BABYLON.Matrix.ComposeToRef(scl, M.q, pos, M.r);
      M.r.copyToArray(mat, n * 16);
      col[n * 4] = d.c[0]; col[n * 4 + 1] = d.c[1]; col[n * 4 + 2] = d.c[2]; col[n * 4 + 3] = 1;
      n++;
    }
    m.thinInstanceCount = n;
    m.thinInstanceBufferUpdated('matrix'); m.thinInstanceBufferUpdated('color');
  }

  onEvent(e) {
    switch (e.type) {
      case 'break': for (const b of e.blocks) this.spawnDebris(b.x + 0.5, b.y + 0.5, b.z + 0.5, COLORS[b.t] || [0.5, 0.5, 0.5], 3, 0.32); break;
      case 'hit': this.spawnDebris(e.x, e.y, e.z, COLORS[e.block] || [0.5, 0.5, 0.5], 4, 0.18, 2.5); break;
      case 'structHit': this.spawnDebris(e.x, e.y, e.z, COLORS[e.t] || [0.5, 0.4, 0.3], 2, 0.15, 2); break;
      case 'zhit': this.spawnDebris(e.x, e.y, e.z, [0.6, 0.62, 0.58], 3, 0.12, 2.5); break;
      case 'zdeath': { // 碎成方块
        const shirt = e.ztype === 'runner' ? [0.45, 0.16, 0.15] : [0.26, 0.33, 0.42];
        this.spawnDebris(e.x, e.y + 1.5, e.z, [0.46, 0.55, 0.45], 5, 0.26, 3.5);
        this.spawnDebris(e.x, e.y + 1.1, e.z, shirt, 7, 0.28, 3.5);
        this.spawnDebris(e.x, e.y + 0.4, e.z, [0.22, 0.23, 0.27], 5, 0.24, 3);
        break;
      }
      case 'place': this.spawnDebris(e.x, 1.2, e.z, [0.8, 0.7, 0.5], 4, 0.12, 2); break;
      case 'drop': this.spawnDebris(e.x, 4, e.z, COLORS[B.CRATE], 4, 0.2, 2); break;
      default: break;
    }
  }
  resize() { this.engine.resize(); }
}
void W; void D; void H; void CH; void BUILDS;

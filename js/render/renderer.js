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
    this.viewDist = this.mobile ? 56 : 72;
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

    // 幸存者 NPC
    const mkHuman = (name, shirt, pantsC, hairC, extra) => {
      const root = new BABYLON.TransformNode(name, this.scene);
      const b = new GeoBuilder();
      b.box(-0.3, 0.8, -0.16, 0.3, 1.38, 0.16, shirt); b.box(-0.2, 1.38, -0.2, 0.2, 1.78, 0.2, skin);
      b.box(-0.21, 1.66, -0.21, 0.21, 1.8, 0.21, hairC); b.box(-0.21, 1.5, -0.21, 0.21, 1.66, -0.15, hairC);
      b.box(-0.12, 1.54, 0.2, -0.05, 1.6, 0.215, [0.1, 0.1, 0.1]); b.box(0.05, 1.54, 0.2, 0.12, 1.6, 0.215, [0.1, 0.1, 0.1]);
      if (extra) extra(b);
      const body = this.meshFrom(name + 'B', b); body.parent = root;
      const lg = new GeoBuilder(); lg.box(-0.12, -0.8, -0.12, 0.12, 0, 0.12, pantsC); lg.box(-0.13, -0.8, -0.13, 0.13, -0.68, 0.16, [0.12, 0.12, 0.12]);
      const L = this.meshFrom(name + 'L', lg); L.parent = root; L.position.set(-0.14, 0.8, 0);
      const R = this.meshFrom(name + 'R', lg); R.parent = root; R.position.set(0.14, 0.8, 0);
      const ag = new GeoBuilder(); ag.box(-0.1, -0.6, -0.1, 0.1, 0, 0.1, shirt); ag.box(-0.09, -0.72, -0.09, 0.09, -0.6, 0.09, skin);
      const AL = this.meshFrom(name + 'AL', ag); AL.parent = root; AL.position.set(-0.4, 1.36, 0);
      const AR = this.meshFrom(name + 'AR', ag); AR.parent = root; AR.position.set(0.4, 1.36, 0);
      root.setEnabled(false);
      return { root, body, L, R, AL, AR };
    };
    this.npcModels = {
      doctor: mkHuman('npcDoc', [0.88, 0.9, 0.9], [0.3, 0.42, 0.5], [0.2, 0.18, 0.16], (b) => { b.box(-0.31, 0.75, -0.17, 0.31, 0.85, 0.17, [0.88, 0.9, 0.9]); b.box(-0.06, 1.1, 0.16, 0.06, 1.3, 0.18, [0.8, 0.2, 0.18]); b.box(-0.25, 1.2, 0.16, -0.06, 1.25, 0.18, [0.2, 0.22, 0.25]); }),
      engineer: mkHuman('npcEng', [0.36, 0.38, 0.42], [0.25, 0.27, 0.3], [0.5, 0.5, 0.5], (b) => { b.box(-0.31, 0.95, -0.17, 0.31, 1.32, 0.17, [0.92, 0.55, 0.12]); b.box(-0.24, 1.76, -0.24, 0.24, 1.9, 0.24, [0.95, 0.75, 0.15]); b.box(-0.32, 0.8, -0.18, 0.32, 0.88, 0.18, [0.3, 0.22, 0.14]); }),
      hunter: mkHuman('npcHun', [0.3, 0.4, 0.26], [0.26, 0.24, 0.2], [0.1, 0.09, 0.08], (b) => { b.box(-0.24, 0.9, -0.3, 0.24, 1.32, -0.16, [0.36, 0.3, 0.2]); b.box(0.15, 0.85, -0.34, 0.22, 1.7, -0.27, [0.45, 0.32, 0.18]); b.box(-0.22, 1.78, -0.22, 0.22, 1.86, 0.22, [0.24, 0.3, 0.2]); }),
    };
    const cbg = new GeoBuilder(); cbg.box(-0.04, -0.75, -0.05, 0.04, -0.65, 0.8, [0.4, 0.3, 0.18]); cbg.box(-0.3, -0.74, 0.55, 0.3, -0.68, 0.62, [0.3, 0.3, 0.32]);
    const cb = this.meshFrom('xbow', cbg); cb.parent = this.npcModels.hunter.AR;
    this.tracers = [];
    const tm = new BABYLON.StandardMaterial('tm', this.scene); tm.disableLighting = true; tm.emissiveColor = new BABYLON.Color3(1, 0.85, 0.5);
    for (let i = 0; i < 4; i++) { const t = BABYLON.MeshBuilder.CreateBox('tr' + i, { width: 0.05, height: 0.05, depth: 1 }, this.scene); t.material = tm; t.isPickable = false; t.setEnabled(false); this.tracers.push({ m: t, life: 0 }); }
    // 感染者（风格化体素人形，无血腥）
    const zskin = [0.46, 0.55, 0.45], eye = [0.95, 0.66, 0.2];
    const mkBody = (shirt, pantsC, kind) => {
      const g = new GeoBuilder();
      const sk = kind === 'bloater' ? [0.55, 0.6, 0.38] : kind === 'climber' ? [0.5, 0.52, 0.55] : zskin;
      if (kind === 'bloater') { // 臃肿的身体 + 发光囊泡（无血腥）
        g.box(-0.42, 0.75, -0.3, 0.42, 1.45, 0.32, shirt);
        g.box(-0.3, 0.9, 0.3, 0.3, 1.35, 0.42, [0.85, 0.62, 0.2], false);
        g.box(-0.36, 1.2, -0.36, -0.12, 1.42, -0.28, [0.85, 0.62, 0.2], false); g.box(0.2, 0.95, -0.36, 0.38, 1.15, -0.28, [0.85, 0.62, 0.2], false);
      } else g.box(-0.3, 0.8, -0.16, 0.3, 1.38, 0.16, shirt);
      g.box(-0.3, 0.8, -0.165, -0.05, 0.95, 0.165, pantsC);
      g.box(-0.2, 1.38, -0.2, 0.2, 1.76, 0.2, sk);
      g.box(-0.21, 1.66, -0.21, 0.21, 1.78, 0.21, kind === 'boss' ? [0.35, 0.2, 0.18] : [0.22, 0.24, 0.2]);
      g.box(-0.13, 1.54, 0.2, -0.05, 1.6, 0.215, eye, false); g.box(0.05, 1.54, 0.2, 0.13, 1.6, 0.215, eye, false);
      if (kind === 'boss') { g.box(-0.42, 1.1, -0.22, 0.42, 1.42, 0.22, [0.42, 0.24, 0.2]); g.box(-0.46, 1.32, -0.2, -0.28, 1.5, 0.2, [0.3, 0.32, 0.34]); g.box(0.28, 1.32, -0.2, 0.46, 1.5, 0.2, [0.3, 0.32, 0.34]); }
      if (kind === 'climber') { g.box(-0.22, 1.2, -0.22, 0.22, 1.3, -0.16, [0.2, 0.2, 0.22]); }
      return g;
    };
    this.zKinds = ['walker', 'runner', 'climber', 'bloater', 'boss'];
    this.zBody = {
      walker: this.thin(this.meshFrom('zBodyW', mkBody([0.26, 0.33, 0.42], [0.2, 0.22, 0.26], 'walker')), 40),
      runner: this.thin(this.meshFrom('zBodyR', mkBody([0.45, 0.16, 0.15], [0.16, 0.16, 0.18], 'runner')), 40),
      climber: this.thin(this.meshFrom('zBodyC', mkBody([0.34, 0.3, 0.42], [0.18, 0.18, 0.2], 'climber')), 40),
      bloater: this.thin(this.meshFrom('zBodyB', mkBody([0.46, 0.44, 0.26], [0.25, 0.22, 0.16], 'bloater')), 40),
      boss: this.thin(this.meshFrom('zBodyX', mkBody([0.32, 0.26, 0.22], [0.16, 0.15, 0.15], 'boss')), 4),
    };
    const zl = new GeoBuilder(); zl.box(-0.12, -0.8, -0.12, 0.12, 0, 0.12, [0.22, 0.23, 0.27]); zl.box(-0.12, -0.8, -0.12, 0.12, -0.7, 0.15, [0.12, 0.12, 0.12]);
    this.zLeg = this.thin(this.meshFrom('zLeg', zl), 96);
    const za = new GeoBuilder(); za.box(-0.09, -0.62, -0.09, 0.09, 0, 0.09, zskin);
    this.zArm = this.thin(this.meshFrom('zArm', za), 96);
    // 碎块
    const cube = new GeoBuilder(); cube.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [1, 1, 1]);
    this.debrisMesh = this.thin(this.meshFrom('debris', cube), 320);
    // 特效粒子：火焰/火花（自发光）+ 烟雾（受光）+ 雨滴
    this.fx = [];
    this.fxMat = new BABYLON.StandardMaterial('fxm', this.scene); this.fxMat.disableLighting = true; this.fxMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
    this.fxMat.transparencyMode = 0; this.mat.transparencyMode = 0;
    // 自发光粒子按颜色分组（不使用实例颜色，规避部分 Babylon 版本的着色器问题）
    const FXC = { y: [1.2, 0.95, 0.4], o: [1.1, 0.5, 0.12], r: [0.6, 0.2, 0.08], s: [1.3, 1.0, 0.5], rain: [0.55, 0.62, 0.75], c: [0.6, 1.0, 1.3], g: [0.5, 1.3, 0.6] };
    this.fxBins = {};
    for (const k in FXC) {
      const gb = new GeoBuilder(); gb.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, FXC[k], false);
      const m = this.meshFrom('fx_' + k, gb, this.fxMat); m._mat = new Float32Array(16 * (k === 'rain' ? 300 : 200)); m._cap = k === 'rain' ? 300 : 200;
      m.thinInstanceSetBuffer('matrix', m._mat, 16, false); m.thinInstanceCount = 0; m.alwaysSelectAsActiveMesh = true; m._n = 0; this.fxBins[k] = m;
    }
    this.fxSmoke = this.thin(this.meshFrom('fxs', cube), 200);
    this.drops = [];
    this.particleScale = 1; this.fireT = 0;
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
    // 任务目标光柱
    this.objBeam = BABYLON.MeshBuilder.CreateBox('objBeam', { width: 0.7, depth: 0.7, height: 34 }, this.scene);
    const om = new BABYLON.StandardMaterial('om', this.scene); om.disableLighting = true; om.emissiveColor = new BABYLON.Color3(1, 0.68, 0.2); om.alpha = 0.32; om.backFaceCulling = false;
    this.objBeam.material = om; this.objBeam.isPickable = false; this.objBeam.setEnabled(false); this.objMat = om;
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
        c = { solid: new BABYLON.Mesh('c' + key, this.scene), glow: new BABYLON.Mesh('g' + key, this.scene), cx: (cx + 0.5) * CH, cz: (cz + 0.5) * CH };
        c.solid.material = this.mat; c.glow.material = this.glowMat; c.solid.isPickable = true; c.glow.isPickable = false; c.solid._chunk = true;
        this.chunks.set(key, c);
      }
      for (const [m, d] of [[c.solid, geo.solid], [c.glow, geo.glow]]) {
        m._empty = !d.indices.length;
        if (m._empty) { m.setEnabled(false); continue; }
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
    // 区块可见性（按视距流式显示，降低移动端开销）
    if (((this._cull = (this._cull || 0) + 1) % 8) === 0) {
      const cpx = this.cam.position.x, cpz = this.cam.position.z, vd = this.viewDist + CH;
      for (const c of this.chunks.values()) {
        const vis = Math.abs(c.cx - cpx) < vd && Math.abs(c.cz - cpz) < vd;
        if (c.solid._empty !== true) c.solid.setEnabled(vis);
        if (c.glow._empty !== true) c.glow.setEnabled(vis);
      }
    }
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
    this.shake = Math.max(0, (this.shake || 0) - dt * 1.6);
    const sh = this.shakeOn === false ? 0 : this.shake * 0.35;
    const jx = (Math.random() - 0.5) * sh, jy = (Math.random() - 0.5) * sh;
    this.cam.position.set(tx + bx * this.curDist + jx, ty + by * this.curDist + jy, tz + bz * this.curDist);
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
    const wk = game.weather ? game.weather() : 'clear';
    this._fogW = lerp(this._fogW ?? 0, wk === 'fog' ? 1 : wk === 'rain' ? 0.45 : 0, Math.min(1, dt * 0.5 + (dt === 0 ? 1 : 0)));
    this.scene.fogDensity = lerp(0.04, 0.017, dl) + this._fogW * 0.028;
    if (this._fogW > 0.01) { const fc = lerp3(sky, [0.42, 0.44, 0.46], this._fogW * dl * 0.6); this.scene.fogColor = new BABYLON.Color3(fc[0], fc[1], fc[2]); this.scene.clearColor = new BABYLON.Color4(fc[0], fc[1], fc[2], 1); }
    this.hemi.intensity = lerp(0.46, 0.95, dl);
    this.hemi.diffuse = new BABYLON.Color3(...lerp3([0.45, 0.55, 0.85], [1, 0.97, 0.92], dl));
    this.hemi.groundColor = new BABYLON.Color3(...lerp3([0.14, 0.16, 0.24], [0.35, 0.33, 0.32], dl));
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

    // 幸存者
    if (game.npcs) for (const n of game.npcs.list) {
      const M = this.npcModels[n.id]; if (!M) continue;
      const vis = !n.dead && Math.hypot(n.x - p.x, n.z - p.z) < this.viewDist;
      M.root.setEnabled(vis); if (!vis) continue;
      M.root.position.set(n.x, n.y, n.z); M.root.rotation.y = n.yaw;
      const mv2 = Math.hypot(n.x - (n._rx ?? n.x), n.z - (n._rz ?? n.z)); n._rx = n.x; n._rz = n.z;
      const s2 = mv2 > 0.003 ? Math.sin(n.walk * 2.6) * 0.7 : 0;
      M.L.rotation.x = s2; M.R.rotation.x = -s2; M.AL.rotation.x = -s2 * 0.7;
      M.AR.rotation.x = n.swing > 0 ? -1.5 : (n.id === 'hunter' ? -1.1 : s2 * 0.6);
      const fl = n.flash > 0 ? 1.8 : 1; M.body.scaling.set(1, 1, 1); M.body.visibility = 1; void fl;
    }
    for (const t of this.tracers) { if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.m.setEnabled(false); } }
    // 感染者
    this.updateZombies(game, dt);
    // 碎块 / 特效 / 天气
    this.updateDebris(game, dt);
    this.updateFx(game, dt);
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
    const ob = game.objective && game.state === 'play' ? game.objective() : null;
    if (ob && Math.hypot(ob.x - p.x, ob.z - p.z) > 5 && !game.evacActive) { this.objBeam.setEnabled(true); this.objBeam.position.set(ob.x, 17, ob.z); this.objMat.alpha = 0.22 + Math.sin(t * 2.5) * 0.08; }
    else this.objBeam.setEnabled(false);
    if (game.evacActive) this.beaconMat.alpha = 0.1 + Math.sin(t * 3) * 0.05;
    this.scene.render();
  }

  updateZombies(game, dt) {
    const BABYLON = BJ();
    const M = this._m, list = game.zm.list;
    const counts = {}; for (const k of this.zKinds) counts[k] = 0;
    let nl = 0, na = 0;
    const leg = this.zLeg, arm = this.zArm;
    const legM = leg._mat, armM = arm._mat, legC = leg._col, armC = arm._col;
    const scl = new BABYLON.Vector3(1, 1, 1), pos = new BABYLON.Vector3();
    const cam = this.cam.position;
    for (const zb of list) {
      if (Math.abs(zb.x - cam.x) + Math.abs(zb.z - cam.z) > this.viewDist + 8) continue; // 视距外不绘制
      const body = this.zBody[zb.type]; const bi = counts[zb.type];
      if (bi >= body._cap) continue;
      counts[zb.type]++;
      let s = zb.type === 'boss' ? 1.9 : zb.type === 'runner' ? 0.92 : zb.type === 'bloater' ? 1.08 : 1.0;
      if (zb.fuse > 0) s *= 1 + Math.sin(performance.now() / 40) * 0.06 + 0.08;
      scl.set(s, s, s); pos.set(zb.x, zb.y, zb.z);
      const lean = zb.climbing ? -0.5 : (zb.type === 'runner' || zb.type === 'climber') && zb.state === 'chase' ? 0.22 : 0.05;
      BABYLON.Quaternion.RotationYawPitchRollToRef(zb.yaw, lean, 0, M.q);
      BABYLON.Matrix.ComposeToRef(scl, M.q, pos, M.r);
      const f = zb.flash > 0 ? 2.4 : (zb.fuse > 0 ? 1.6 : 1);
      M.r.copyToArray(body._mat, bi * 16);
      const cb = body._col; cb[bi * 4] = f; cb[bi * 4 + 1] = f; cb[bi * 4 + 2] = zb.fuse > 0 ? 0.6 : f; cb[bi * 4 + 3] = 1;
      const sw = Math.sin(zb.walk * (zb.type === 'runner' ? 3.2 : 2.4)) * 0.6;
      for (const [px, a] of [[-0.14, sw], [0.14, -sw]]) {
        if (nl >= leg._cap) break;
        BABYLON.Matrix.RotationXToRef(a, M.l); BABYLON.Matrix.TranslationToRef(px, 0.8, 0, M.t);
        M.l.multiplyToRef(M.t, M.o); M.o.multiplyToRef(M.r, M.l);
        M.l.copyToArray(legM, nl * 16); legC[nl * 4] = f; legC[nl * 4 + 1] = f; legC[nl * 4 + 2] = f; legC[nl * 4 + 3] = 1; nl++;
      }
      const atk = zb.swing ? Math.sin(zb.swing / 0.35 * Math.PI) * 0.8 : 0;
      const up = zb.climbing ? -2.6 : -1.45;
      const ax = zb.type === 'bloater' ? 0.5 : 0.39;
      for (const [px, a] of [[-ax, up + sw * 0.15 - atk], [ax, up - sw * 0.15 - atk]]) {
        if (na >= arm._cap) break;
        BABYLON.Matrix.RotationXToRef(a, M.l); BABYLON.Matrix.TranslationToRef(px, 1.34, 0, M.t);
        M.l.multiplyToRef(M.t, M.o); M.o.multiplyToRef(M.r, M.l);
        M.l.copyToArray(armM, na * 16); armC[na * 4] = f; armC[na * 4 + 1] = f; armC[na * 4 + 2] = f; armC[na * 4 + 3] = 1; na++;
      }
    }
    for (const k of this.zKinds) { const m = this.zBody[k]; m.thinInstanceCount = counts[k]; m.thinInstanceBufferUpdated('matrix'); m.thinInstanceBufferUpdated('color'); }
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

  emitFx(kind, x, y, z, n, o = {}) {
    n = Math.max(1, Math.round(n * this.particleScale));
    for (let i = 0; i < n; i++) {
      if (this.fx.length > 480) this.fx.shift();
      const sp = o.spread ?? 0.3, pw = o.power ?? 1;
      const f = { kind, x: x + (Math.random() - 0.5) * sp, y: y + (Math.random() - 0.5) * sp * 0.5, z: z + (Math.random() - 0.5) * sp, vx: (Math.random() - 0.5) * pw, vy: (o.up ?? 1.5) + Math.random() * pw, vz: (Math.random() - 0.5) * pw, life: (o.life ?? 0.8) * (0.7 + Math.random() * 0.6), s: (o.size ?? 0.18) * (0.7 + Math.random() * 0.6), g: o.grav ?? 0 };
      f.max = f.life; f.bin = o.bin || null;
      this.fx.push(f);
    }
  }
  updateFx(game, dt) {
    const BABYLON = BJ(), M = this._m, p = game.player;
    // 燃烧的废车
    this.fireT -= dt;
    if (this.fireT <= 0 && dt > 0) {
      this.fireT = 0.07;
      for (const f of game.world.fires || []) if (Math.abs(f.x - p.x) + Math.abs(f.z - p.z) < 50) {
        this.emitFx('fire', f.x, f.y, f.z, 2, { spread: 1.2, up: 1.6, power: 0.6, life: 0.7, size: 0.22 });
        if (Math.random() < 0.5) this.emitFx('smoke', f.x, f.y + 1, f.z, 1, { spread: 1, up: 1.2, power: 0.4, life: 2.2, size: 0.35 });
      }
      for (const s of game.world.structs.values()) if (s.type === 'gen' && s.running && Math.random() < 0.25) this.emitFx('smoke', s.x + 0.7, s.y + 1.1, s.z + 0.5, 1, { spread: 0.1, up: 0.8, power: 0.2, life: 1.5, size: 0.15 });
    }
    const sm = this.fxSmoke; let ns = 0; const bins = this.fxBins; for (const k in bins) bins[k]._n = 0;
    const scl = new BABYLON.Vector3(), pos = new BABYLON.Vector3();
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.life -= dt; if (f.life <= 0) { this.fx.splice(i, 1); continue; }
      f.vy -= f.g * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      const k = f.life / f.max;
      const glow = f.kind !== 'smoke';
      const bk = f.bin || (f.kind === 'fire' ? (k > 0.6 ? 'y' : k > 0.3 ? 'o' : 'r') : 's');
      const mesh = glow ? bins[bk] : sm, n = glow ? mesh._n : ns;
      if (n >= mesh._cap) continue;
      const sz = f.kind === 'smoke' ? f.s * (1.6 - k) : f.s * (0.3 + k * 0.7);
      scl.set(sz, sz, sz); pos.set(f.x, f.y, f.z);
      BABYLON.Quaternion.RotationYawPitchRollToRef(f.life * 3, f.life * 2, 0, M.q);
      BABYLON.Matrix.ComposeToRef(scl, M.q, pos, M.r); M.r.copyToArray(mesh._mat, n * 16);
      if (glow) mesh._n++;
      else { const c = 0.32 + k * 0.1; mesh._col[n * 4] = c; mesh._col[n * 4 + 1] = c; mesh._col[n * 4 + 2] = c + 0.02; mesh._col[n * 4 + 3] = 1; ns++; }
    }
    sm.thinInstanceCount = ns; sm.thinInstanceBufferUpdated('matrix'); sm.thinInstanceBufferUpdated('color');
    // 雨
    const raining = (game.weather ? game.weather() : 'clear') === 'rain';
    const want = raining ? Math.round(260 * this.particleScale) : 0, cam = this.cam.position, rm = bins.rain;
    while (this.drops.length < want) this.drops.push({ x: cam.x + (Math.random() - 0.5) * 30, y: cam.y + Math.random() * 16 - 4, z: cam.z + (Math.random() - 0.5) * 30 });
    if (this.drops.length > want) this.drops.length = want;
    let nr = 0;
    for (const d of this.drops) {
      if (nr >= rm._cap) break;
      d.y -= 22 * dt; d.x -= 2 * dt;
      if (d.y < cam.y - 8 || Math.abs(d.x - cam.x) > 16 || Math.abs(d.z - cam.z) > 16) { d.x = cam.x + (Math.random() - 0.5) * 30; d.z = cam.z + (Math.random() - 0.5) * 30; d.y = cam.y + 8 + Math.random() * 6; }
      scl.set(0.035, 0.6, 0.035); pos.set(d.x, d.y, d.z); BABYLON.Matrix.ComposeToRef(scl, this._qid || (this._qid = BABYLON.Quaternion.Identity()), pos, M.r); M.r.copyToArray(rm._mat, nr * 16);
      nr++;
    }
    rm._n = nr;
    for (const k in bins) { const m = bins[k]; m.thinInstanceCount = m._n; if (m._n) m.thinInstanceBufferUpdated('matrix'); }
  }
  project(x, y, z) {
    const BABYLON = BJ(), w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const v = BABYLON.Vector3.Project(new BABYLON.Vector3(x, y, z), BABYLON.Matrix.Identity(), this.scene.getTransformMatrix(), this.cam.viewport.toGlobal(w, h));
    return v.z > 0 && v.z < 1 ? { x: v.x, y: v.y } : null;
  }
  setQuality(q) {
    const dpr = window.devicePixelRatio || 1;
    const cfg = { low: [1, 44, 0.4], mid: [this.mobile ? 1.25 : 1.25, 56, 0.7], high: [this.mobile ? 1.6 : 1.75, 72, 1] }[q] || [1.25, 56, 0.7];
    this.engine.setHardwareScalingLevel(1 / Math.min(dpr, cfg[0]));
    this.viewDist = cfg[1]; this.particleScale = cfg[2]; this.cam.maxZ = cfg[1] + 40; this.quality = q;
  }
  onEvent(e) {
    switch (e.type) {
      case 'hurt': this.shake = Math.max(this.shake || 0, 0.18); break;
      case 'break': for (const b of e.blocks) this.spawnDebris(b.x + 0.5, b.y + 0.5, b.z + 0.5, COLORS[b.t] || [0.5, 0.5, 0.5], 3, 0.32); break;
      case 'hit': this.spawnDebris(e.x, e.y, e.z, COLORS[e.block] || [0.5, 0.5, 0.5], 4, 0.18, 2.5); break;
      case 'structHit': this.spawnDebris(e.x, e.y, e.z, COLORS[e.t] || [0.5, 0.4, 0.3], 2, 0.15, 2); this.emitFx('spark', e.x, e.y + 0.8, e.z, 2, { up: 1, power: 2.5, life: 0.25, size: 0.06, grav: 9 }); break;
      case 'repairTick': this.emitFx('spark', e.x, 1.6, e.z, 3, { up: 1, power: 2, life: 0.3, size: 0.06, grav: 8, bin: 'c' }); break;
      case 'gen': this.emitFx('smoke', e.x + 0.5, 1.6, e.z + 0.5, 4, { up: 1, life: 1.5, size: 0.2 }); break;
      case 'radio': this.emitFx('spark', 21.5, 12.2, 8.5, 12, { up: 2, power: 2, life: 0.8, size: 0.07, bin: 'g' }); break;
      case 'zhit': this.spawnDebris(e.x, e.y, e.z, [0.6, 0.62, 0.58], 3, 0.12, 2.5); this.emitFx('spark', e.x, e.y, e.z, 4, { spread: 0.2, up: 1.5, power: 3, life: 0.3, size: 0.07, grav: 9 }); break;
      case 'explode': { // 风格化方块爆散
        this.emitFx('fire', e.x, e.y, e.z, 26, { spread: 1.5, up: 2.5, power: 6, life: 0.6, size: 0.35 });
        this.emitFx('smoke', e.x, e.y + 0.5, e.z, 12, { spread: 2, up: 1.5, power: 2, life: 2.5, size: 0.5 });
        this.emitFx('spark', e.x, e.y, e.z, 14, { spread: 0.5, up: 4, power: 8, life: 0.6, size: 0.08, grav: 12 });
        this.spawnDebris(e.x, e.y, e.z, [0.95, 0.62, 0.18], 14, 0.3, 9);
        this.spawnDebris(e.x, e.y, e.z, [0.55, 0.6, 0.38], 12, 0.26, 7);
        this.spawnDebris(e.x, e.y + 0.5, e.z, [0.35, 0.34, 0.33], 8, 0.4, 4);
        this.shake = Math.max(this.shake || 0, 0.6 * Math.max(0.2, 1 - Math.hypot(e.x - this.player.position.x, e.z - this.player.position.z) / 18));
        this.flashT = 0.25; break;
      }
      case 'shot': {
        const t = this.tracers.find(x => x.life <= 0) || this.tracers[0];
        const dx = e.x1 - e.x0, dy = e.y1 - e.y0, dz = e.z1 - e.z0, L = Math.hypot(dx, dy, dz);
        t.m.position.set((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, (e.z0 + e.z1) / 2); t.m.scaling.set(1, 1, L);
        t.m.lookAt(new (BJ().Vector3)(e.x1, e.y1, e.z1)); t.m.setEnabled(true); t.life = 0.1;
        this.spawnDebris(e.x1, e.y1, e.z1, [0.6, 0.62, 0.58], 2, 0.1, 2); break;
      }
      case 'npcDown': this.spawnDebris(e.x, e.y + 1, e.z, [0.6, 0.6, 0.6], 6, 0.2, 2); break;
      case 'stomp': this.spawnDebris(e.x, 1.1, e.z, [0.4, 0.38, 0.35], 6, 0.22, 4); this.shake = Math.max(this.shake || 0, 0.25); break;
      case 'zdeath': { // 碎成方块
        const shirt = { runner: [0.45, 0.16, 0.15], climber: [0.34, 0.3, 0.42], bloater: [0.46, 0.44, 0.26], boss: [0.32, 0.26, 0.22] }[e.ztype] || [0.26, 0.33, 0.42];
        if (e.ztype === 'boss') { this.spawnDebris(e.x, e.y + 2.5, e.z, shirt, 30, 0.5, 6); this.shake = 0.6; }
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

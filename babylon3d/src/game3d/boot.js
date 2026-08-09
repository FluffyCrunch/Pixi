// ── Void Rush 3D (Babylon.js) ───────────────────────────────────
// Real-3D tower defense built from the same game data as the 2D version.
// World + camera + shadows, tower placement by clicking the ground, turrets
// that rotate to aim + fire, enemies that take damage/die, progressive waves,
// and a lightweight HTML HUD.
import {
  Engine, Scene, ArcRotateCamera, Vector3, Color3, Color4, Mesh, Matrix,
  HemisphericLight, DirectionalLight, ShadowGenerator, SceneLoader,
  MeshBuilder, StandardMaterial, TransformNode, DynamicTexture, Texture, TrailMesh,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {
  MAP_COLS, MAP_ROWS, MAP_LAYOUT, TILE, PATHS, RIVER_COLS, isWater, isBridge,
  TOWER_TYPES, ENEMY_TYPES, WAVES, BASE_HP, START_GOLD, LEVEL_DMG_MULT, RANGE_MULT, TRAP_DEF, DIFFICULTIES, TOWER_BRANCHES,
} from './data.js';
import { sfx, ensureAudio, music } from './sfx.js';

// ── engine / scene / camera / lights ────────────────────────────
const canvas = document.getElementById('babylon');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
const scene  = new Scene(engine);
scene.clearColor = new Color4(0.53, 0.79, 0.92, 1);

const amb = new HemisphericLight('amb', new Vector3(0, 1, 0), scene);
amb.intensity = 0.78; amb.groundColor = new Color3(0.42, 0.5, 0.36);
const sun = new DirectionalLight('sun', new Vector3(-0.55, -1.1, -0.45), scene);
sun.position = new Vector3(20, 34, 18); sun.intensity = 1.45;
sun.autoCalcShadowZBounds = true;
const shadow = new ShadowGenerator(2048, sun);
shadow.useBlurExponentialShadowMap = true; shadow.blurKernel = 24;
shadow.bias = 0.008; shadow.normalBias = 0.02; shadow.setDarkness(0.4);

const camera = new ArcRotateCamera('cam', -Math.PI / 2 - 0.7, 0.9, 20, new Vector3(0, 0, 0), scene);
camera.attachControl(canvas, true);
camera.wheelPrecision = 12; camera.minZ = 0.1;
camera.lowerBetaLimit = 0.25; camera.upperBetaLimit = 1.4;
camera.lowerRadiusLimit = 8; camera.upperRadiusLimit = 40;

// scene helpers assigned during build()
let pickPlane = null, rangeDisc = null;
let hoverHighlightMat = null, hoveredEntry = null, ghost = null;
let placeableCells = [], highlightPool = [], placementHighlightMat = null;
let trapPlaceableCells = [], trapHighlightPool = [];
const traps = [];
const trapBuilt = new Set();
const trapPlaceableSet = new Set();
let waterFlowTexture = null, waterFlowTexture2 = null;
let caveBeacons = [], beaconT = 0;   // per-lane "wave incoming from here" markers
let dripPoints = [], dripTimer = 0;  // dripping-water points around the floating island's edge
const drips = [];

// ── model loading ───────────────────────────────────────────────
const BASE = '/models3d/';
const templates = {};
async function loadTemplate(name) {
  if (templates[name]) return templates[name];
  const res  = await SceneLoader.ImportMeshAsync('', BASE, name + '.glb', scene);
  const root = res.meshes.find(m => m.name === '__root__') || res.meshes[0];
  root.setEnabled(false);
  templates[name] = root;
  return root;
}
function hsize(node) {
  const { min, max } = node.getHierarchyBoundingVectors();
  return { min, max, w: max.x - min.x, h: max.y - min.y, d: max.z - min.z };
}
let T = 1;
function inst(name, x, z, o = {}) {
  const t = templates[name]; if (!t) return null;
  const m = t.clone(`${name}_${(inst._n = (inst._n || 0) + 1)}`, null);
  m.setEnabled(true);
  m.position.set(x, o.y || 0, z);
  if (o.ry != null) m.rotation.y = o.ry;
  if (o.s) m.scaling.setAll(o.s);
  const kids = m.getChildMeshes();
  if (o.cast !== false) kids.forEach(c => shadow.addShadowCaster(c));
  if (o.receive)        kids.forEach(c => (c.receiveShadows = true));
  if (o.tint) kids.forEach(c => { if (c.material) { c.material = c.material.clone(); c.material.albedoColor = o.tint; } });
  if (o.alpha != null) kids.forEach(c => { if (c.material) { c.material = c.material.clone(); c.material.alpha = o.alpha; } });
  return m;
}
const gx = c => c * T, gz = r => r * T;
const w2c = x => Math.round(x / T), w2r = z => Math.round(z / T);

// stack modular tower parts vertically (each part's base on the previous
// part's top) — fixes the z-fighting from placing them all at the same spot
function stackParts(x, z, parts, scale, collect, startY = 0) {
  let y = startY;
  for (const name of parts) {
    const bb = hsize(templates[name]);
    const m  = inst(name, x, z, { cast: true, s: scale, y: y - bb.min.y * scale });
    if (collect) collect.push(m);
    y += bb.h * scale;
  }
  return y;   // world height of the top
}

function collectCastleMats(model) {
  if (!model) return;
  model.getChildMeshes().forEach(mesh => {
    if (mesh.material) {
      mesh.material = mesh.material.clone(mesh.material.name + '_dmg');
      const c = mesh.material.albedoColor;
      if (c) castleMeshMats.push({ mat: mesh.material, prop: 'albedoColor', r: c.r, g: c.g, b: c.b });
    }
  });
}

// a proper castle: stone platform + central keep + 4 corner turrets
function buildCastle(cx, cz) {
  const base = MeshBuilder.CreateBox('castleBase', { width: T * 2.1, depth: T * 2.1, height: T * 0.34 }, scene);
  const bm = new StandardMaterial('cbm', scene);
  bm.diffuseColor = new Color3(0.64, 0.66, 0.72);
  bm.specularColor = new Color3(1, 1, 1);
  bm.specularPower = 128;
  base.material = bm; base.position.set(cx, tileTop + T * 0.17, cz);
  base.receiveShadows = true; shadow.addShadowCaster(base);
  castleMeshMats.push({ mat: bm, prop: 'diffuseColor', r: 0.64, g: 0.66, b: 0.72 });
  const topB = tileTop + T * 0.34;
  const mainParts = [];
  castleTopY = stackParts(cx, cz, ['tower-square-bottom-a', 'tower-square-middle-a', 'tower-square-top-a', 'tower-square-roof-a'], 1.35, mainParts, topB);
  mainParts.forEach(collectCastleMats);
  castleRoofs.push(mainParts[mainParts.length - 1]);
  const d = T * 0.66;
  for (const [dx, dz] of [[-d, -d], [d, -d], [-d, d], [d, d]]) {
    const cornerParts = [];
    stackParts(cx + dx, cz + dz, ['tower-round-bottom-a', 'tower-round-top-a', 'tower-round-roof-a'], 0.72, cornerParts, topB);
    cornerParts.forEach(collectCastleMats);
    castleRoofs.push(cornerParts[cornerParts.length - 1]);
  }
  for (const cm of castleMeshMats) {
    if ('metallic' in cm.mat) { cm.mat.metallic = 0.45; cm.mat.roughness = 0.3; }
  }
  const poleMat = new StandardMaterial('poleMat', scene);
  poleMat.diffuseColor = new Color3(0.78, 0.75, 0.7);
  poleMat.specularColor = new Color3(1, 1, 1);
  poleMat.specularPower = 96;
  const poleH = T * 0.55;
  const pole = MeshBuilder.CreateCylinder('flagPole', { diameterTop: 0.024, diameterBottom: 0.036, height: poleH, tessellation: 6 }, scene);
  pole.material = poleMat; pole.isPickable = false;
  pole.position.set(cx, castleTopY + poleH / 2, cz);
  shadow.addShadowCaster(pole);
  const flagMat = new StandardMaterial('flagMat', scene);
  flagMat.emissiveColor = new Color3(1, 0.35, 0.24); flagMat.disableLighting = true;
  const flagLength = T * 0.22, flagHeight = T * 0.15, flagThin = T * 0.012;
  const flag = MeshBuilder.CreateCylinder('flag', { diameterTop: 2, diameterBottom: 0.04, height: 1, tessellation: 3 }, scene);
  flag.material = flagMat; flag.isPickable = false;
  flag.scaling.set(flagHeight / 2, flagLength, flagThin);
  flag.rotation.z = -Math.PI / 2;
  flag.position.set(cx - flagLength / 2, castleTopY + poleH * 0.78, cz);
  castleFlag = flag;
}

function applyCastleDamage(frac) {
  castleDamageFrac = frac;
  const bright = 0.35 + 0.65 * frac;
  for (const cm of castleMeshMats) {
    const col = cm.mat[cm.prop];
    col.r = cm.r * bright; col.g = cm.g * bright; col.b = cm.b * bright;
  }
  if (frac <= 0.25 && !castleTiltDone) {
    castleTiltDone = true;
    for (const roof of castleRoofs) {
      if (!roof) continue;
      roof.position.y -= T * 0.08;
      roof.rotation.x = (Math.random() - 0.5) * (10 * Math.PI / 180);
      roof.rotation.y = (Math.random() - 0.5) * (8 * Math.PI / 180);
      roof.rotation.z = (Math.random() - 0.5) * (10 * Math.PI / 180);
    }
  }
}

function spawnCastleSmoke() {
  const smokeMat = new StandardMaterial('castleSmokeMat', scene);
  smokeMat.diffuseColor = new Color3(0.16, 0.16, 0.16); smokeMat.disableLighting = true; smokeMat.alpha = 0.4; smokeMat.backFaceCulling = false;
  const ox = (Math.random() - 0.5) * T * 0.7, oz = (Math.random() - 0.5) * T * 0.7;
  const p = MeshBuilder.CreateSphere('castleSmoke', { diameter: 0.32 + Math.random() * 0.16, segments: 6 }, scene);
  p.material = smokeMat; p.isPickable = false;
  p.position.set(baseWorld.x + ox, castleTopY, baseWorld.z + oz);
  const life = 1600 + Math.random() * 700;
  bursts.push({ mesh: p, mat: smokeMat, vx: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.3, vy: 0.5 + Math.random() * 0.35, life, maxLife: life, kind: 'smoke' });
}

function updateCastleSmoke(dt) {
  if (castleDamageFrac > 0.5 || state.phase === 'over') return;
  castleSmokeTimer -= dt * 1000;
  if (castleSmokeTimer <= 0) {
    castleSmokeTimer = 900 - (0.5 - castleDamageFrac) * 900;
    spawnCastleSmoke();
  }
}

// a stone cave portal (the kit has no cave model, so build one).
// The path leaves toward +x, so the archway opens that way.
let stoneMat = null, mouthMat = null, glowMat = null;
function buildCave(x, z) {
  const y = tileTop;
  if (!stoneMat) {
    stoneMat = new StandardMaterial('cs', scene); stoneMat.diffuseColor = new Color3(0.5, 0.52, 0.56);
    mouthMat = new StandardMaterial('cm', scene); mouthMat.diffuseColor = new Color3(0.02, 0.01, 0.04); mouthMat.emissiveColor = new Color3(0.02, 0.01, 0.04);
    glowMat  = new StandardMaterial('cg', scene); glowMat.emissiveColor = new Color3(0.45, 0.18, 0.7); glowMat.disableLighting = true; glowMat.alpha = 0.5;
  }
  const box = (w, h, d, px, py, pz, mat) => {
    const b = MeshBuilder.CreateBox('cave', { width: w, height: h, depth: d }, scene);
    b.material = mat; b.position.set(px, py, pz); b.receiveShadows = true; shadow.addShadowCaster(b); return b;
  };
  const pillarH = T * 0.85, pw = T * 0.22, gap = T * 0.34;
  // two stone pillars (separated along z) + a lintel across the top
  box(pw, pillarH, pw, x, y + pillarH / 2, z - gap, stoneMat);
  box(pw, pillarH, pw, x, y + pillarH / 2, z + gap, stoneMat);
  box(pw * 1.3, pw, gap * 2 + pw * 1.6, x, y + pillarH + pw * 0.4, z, stoneMat);
  // recessed dark opening + a purple glow just inside
  box(pw * 0.9, pillarH * 0.9, gap * 1.7, x - T * 0.12, y + pillarH * 0.45, z, mouthMat);
  const g = MeshBuilder.CreatePlane('caveglow', { width: gap * 1.5, height: pillarH * 0.8 }, scene);
  g.material = glowMat; g.rotation.y = Math.PI / 2; g.position.set(x + T * 0.06, y + pillarH * 0.45, z); g.isPickable = false;
  // craggy rocks framing the mound
  inst('detail-rocks-large', x - T * 0.55, z, { cast: true, s: 1.5 });
  inst('detail-rocks-large', x - T * 0.15, z - T * 0.62, { cast: true, s: 1.15 });
  inst('detail-rocks-large', x - T * 0.15, z + T * 0.62, { cast: true, s: 1.15 });
  inst('detail-rocks', x + T * 0.45, z - T * 0.5, { cast: true, s: 1.0 });
  inst('detail-rocks', x + T * 0.45, z + T * 0.5, { cast: true, s: 1.0 });
}

// ── game state ──────────────────────────────────────────────────
const state = { gold: START_GOLD, hp: BASE_HP, wave: 0, phase: 'place', selected: null, trapMode: false };
let difficulty = DIFFICULTIES.normal;
const built    = new Set();          // "col,row" occupied by a tower
const blocked  = new Set();          // "col,row" occupied by a tree/rock/crystal
const nearPath = new Set();          // "col,row" touching the path (no building — keeps padding)
const towers   = [];
const enemies  = [];
const shots    = [];
const seenTypes = new Set();
let laneWaypoints = [];
let baseWorld = null;
let tileTop = 0.1;
const castleMeshMats = [];
const castleRoofs = [];
let castleTopY = 0;
let castleDamageFrac = 1;
let castleTiltDone = false;
let castleSmokeTimer = 0;
let castleFlag = null;
let flagT = 0;

function isBuildable(c, r) {
  if (r < 0 || r >= MAP_ROWS || c < 0 || c >= MAP_COLS) return false;
  if (isWater(c, r) || isBridge(c, r)) return false;
  if (MAP_LAYOUT[r][c] !== TILE.EMPTY) return false;
  const k = `${c},${r}`;
  return !built.has(k) && !blocked.has(k) && !nearPath.has(k);
}
function isTrapPlaceable(c, r) {
  const k = `${c},${r}`;
  return trapPlaceableSet.has(k) && !trapBuilt.has(k);
}

// ── enemy ───────────────────────────────────────────────────────
const ENEMY_MODEL = { drone: 'enemy-ufo-a', tank: 'enemy-ufo-b', ghost: 'enemy-ufo-c', bomber: 'enemy-ufo-d' };
class Enemy {
  constructor(type, wps, speedMul, hpMult = 1, bossScale = 1) {
    this.type = type; this.def = ENEMY_TYPES[type];
    this.isBoss = type === 'boss';
    this.bossScale = bossScale;
    this.isMiniBoss = this.isBoss && bossScale < 1;
    this.hp = this.def.hp * hpMult * difficulty.hpMult; this.maxHp = this.hp;
    this.speed = (this.def.speed / 42) * T * speedMul;
    this.baseSpeed = this.speed; this.slowTimer = 0;
    this.wp = wps; this.i = 0; this.dead = false; this.arrived = false;
    const sc = (0.7 + this.def.size / 40) * (this.isBoss ? 1.3 : 1);
    if (this.isBoss) {
      this.root = new TransformNode('bossRoot', scene);
      this.root.position.set(wps[0].x, wps[0].y, wps[0].z);
      this.haloSpin = 0;
      this.enraged = false;
      this._buildBoss();
      if (bossScale !== 1) this.root.scaling.setAll(bossScale);
    } else {
      this.root = inst(ENEMY_MODEL[type] || 'enemy-ufo-a', wps[0].x, wps[0].z, { y: wps[0].y, cast: true, s: sc, alpha: type === 'ghost' ? 0.55 : undefined });
      this.baseY = wps[0].y;
      this.wobble = Math.random() * 10;
      this._buildDeco(sc);
    }
    // HP bar: one billboarded plane painted with a DynamicTexture (always aligned)
    const barW = this.isBoss ? 1.4 : 1.0;
    this.bar = MeshBuilder.CreatePlane('hpbar', { width: barW, height: 0.16 }, scene);
    this.barTex = new DynamicTexture('hptex', { width: this.isBoss ? 176 : 128, height: 20 }, scene, false);
    this.barTex.hasAlpha = true;
    const bm = new StandardMaterial('hpm', scene);
    bm.diffuseTexture = this.barTex; bm.emissiveColor = new Color3(1, 1, 1);
    bm.opacityTexture = this.barTex; bm.disableLighting = true; bm.backFaceCulling = false;
    this.bar.material = bm;
    this.bar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.bar.renderingGroupId = 2; this.bar.isPickable = false;
    if (this.isBoss) {
      this.shieldCycle = 3.7; this.shielded = false;
      this.shield = MeshBuilder.CreateSphere('bossShield', { diameter: 1.15 * bossScale, segments: 12 }, scene);
      const shMat = new StandardMaterial('bossShieldMat', scene);
      shMat.emissiveColor = new Color3(1, 0.88, 0.4); shMat.disableLighting = true; shMat.alpha = 0.32; shMat.backFaceCulling = false;
      this.shield.material = shMat; this.shield.isPickable = false; this.shield.setEnabled(false);
    }
    this._drawBar();
  }
  _buildBoss() {
    const core = MeshBuilder.CreateSphere('bossCore', { diameter: 0.77, segments: 10 }, scene);
    const coreMat = new StandardMaterial('bossCoreMat', scene); coreMat.diffuseColor = new Color3(0.1, 0.045, 0.15);
    core.material = coreMat; core.parent = this.root;
    shadow.addShadowCaster(core);
    const eyeMat = new StandardMaterial('bossEyeMat', scene);
    eyeMat.emissiveColor = new Color3(1, 0.2, 0.33); eyeMat.disableLighting = true;
    for (const sx of [-0.18, 0.18]) {
      const eye = MeshBuilder.CreateSphere('bossEye', { diameter: 0.14, segments: 6 }, scene);
      eye.material = eyeMat; eye.parent = this.root; eye.isPickable = false;
      eye.position.set(sx, 0.06, 0.32);
    }
    const glow = MeshBuilder.CreateSphere('bossGlow', { diameter: 0.96, segments: 10 }, scene);
    this.bossGlowMat = new StandardMaterial('bossGlowMat', scene);
    this.bossGlowMat.emissiveColor = new Color3(1, 0.18, 0.42); this.bossGlowMat.disableLighting = true; this.bossGlowMat.alpha = 0.28;
    glow.material = this.bossGlowMat; glow.parent = this.root; glow.isPickable = false;
    const spikeMat = new StandardMaterial('bossSpikeMat', scene);
    spikeMat.emissiveColor = new Color3(1, 0.84, 0.29); spikeMat.disableLighting = true;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const spike = MeshBuilder.CreateCylinder('bossSpike', { diameterTop: 0.026, diameterBottom: 0.1, height: 0.27, tessellation: 6 }, scene);
      spike.material = spikeMat; spike.parent = this.root; spike.isPickable = false;
      spike.position.set(Math.cos(ang) * 0.26, 0.21, Math.sin(ang) * 0.26);
      spike.rotation.x = 16 * Math.PI / 180; spike.rotation.y = ang;
    }
    this.bossHalo = MeshBuilder.CreateDisc('bossHalo', { radius: 0.51, tessellation: 28 }, scene);
    const haloMat = new StandardMaterial('bossHaloMat', scene);
    haloMat.emissiveColor = new Color3(1, 0.18, 0.42); haloMat.disableLighting = true; haloMat.alpha = 0.28; haloMat.backFaceCulling = false;
    this.bossHalo.material = haloMat; this.bossHalo.parent = this.root; this.bossHalo.isPickable = false;
    this.bossHalo.rotation.x = Math.PI / 2;
    this.bossHalo.position.set(0, -0.26, 0);
  }
  _buildDeco(sc) {
    if (this.type === 'drone') {
      const deco = MeshBuilder.CreateSphere('droneBeacon', { diameter: 0.14, segments: 8 }, scene);
      const m = new StandardMaterial('droneBeaconMat', scene); m.emissiveColor = new Color3(0.56, 0.96, 1); m.disableLighting = true;
      deco.material = m; deco.parent = this.root; deco.isPickable = false;
      deco.position.set(0, 0.3 * sc, 0);
      const finMat = new StandardMaterial('droneFinMat', scene);
      finMat.emissiveColor = new Color3(0.37, 0.85, 0.9); finMat.disableLighting = true; finMat.alpha = 0.85;
      for (const sx of [-1, 1]) {
        const fin = MeshBuilder.CreateCylinder('droneFin', { diameterTop: 0.22 * sc, diameterBottom: 0.02, height: 0.03 * sc, tessellation: 3 }, scene);
        fin.material = finMat; fin.parent = this.root; fin.isPickable = false;
        fin.position.set(sx * 0.34 * sc, 0.02 * sc, 0);
        fin.rotation.z = sx * Math.PI / 2;
      }
    } else if (this.type === 'tank') {
      const deco = MeshBuilder.CreateCylinder('tankCollar', { diameter: 0.64 * sc, height: 0.09 * sc, tessellation: 12 }, scene);
      const m = new StandardMaterial('tankCollarMat', scene); m.diffuseColor = new Color3(0.33, 0.35, 0.4);
      deco.material = m; deco.parent = this.root; deco.isPickable = false;
      deco.position.set(0, 0.14 * sc, 0);
      const barrel = MeshBuilder.CreateCylinder('tankBarrel', { diameterTop: 0.09 * sc, diameterBottom: 0.12 * sc, height: 0.42 * sc, tessellation: 8 }, scene);
      const bm3 = new StandardMaterial('tankBarrelMat', scene); bm3.diffuseColor = new Color3(0.22, 0.23, 0.27);
      barrel.material = bm3; barrel.parent = this.root; barrel.isPickable = false;
      barrel.position.set(0, 0.16 * sc, 0.32 * sc);
      barrel.rotation.x = Math.PI / 2;
      const plateMat = new StandardMaterial('tankPlateMat', scene); plateMat.diffuseColor = new Color3(0.4, 0.42, 0.47);
      for (const angDeg of [45, 135, 225, 315]) {
        const rad = angDeg * Math.PI / 180;
        const plate = MeshBuilder.CreateCylinder('tankPlate', { diameter: 0.16 * sc, height: 0.16 * sc, tessellation: 6 }, scene);
        plate.material = plateMat; plate.parent = this.root; plate.isPickable = false;
        plate.position.set(Math.cos(rad) * 0.3 * sc, 0.06 * sc, Math.sin(rad) * 0.3 * sc);
      }
    } else if (this.type === 'ghost') {
      const deco = MeshBuilder.CreateDisc('ghostHalo', { radius: 0.36 * sc, tessellation: 20 }, scene);
      const m = new StandardMaterial('ghostHaloMat', scene);
      m.emissiveColor = new Color3(0.87, 0.99, 1); m.disableLighting = true; m.alpha = 0.3; m.backFaceCulling = false;
      deco.material = m; deco.parent = this.root; deco.isPickable = false;
      deco.rotation.x = Math.PI / 2;
      deco.position.set(0, -0.18 * sc, 0);
      const wispMat = new StandardMaterial('ghostWispMat', scene);
      wispMat.emissiveColor = new Color3(0.92, 1, 1); wispMat.disableLighting = true; wispMat.alpha = 0.4;
      for (let i = 0; i < 3; i++) {
        const wisp = MeshBuilder.CreateSphere('ghostWisp', { diameter: 0.1 * sc * (1 - i * 0.22), segments: 6 }, scene);
        wisp.material = wispMat; wisp.parent = this.root; wisp.isPickable = false;
        wisp.position.set((i - 1) * 0.1 * sc, -0.08 * sc - i * 0.05 * sc, -0.1 * sc - i * 0.08 * sc);
      }
    } else if (this.type === 'bomber') {
      const cable = MeshBuilder.CreateCylinder('bomberCable', { diameter: 0.028, height: 0.2 * sc, tessellation: 5 }, scene);
      const cm = new StandardMaterial('bomberCableMat', scene); cm.diffuseColor = new Color3(0.16, 0.16, 0.16);
      cable.material = cm; cable.parent = this.root; cable.isPickable = false;
      cable.position.set(0, -0.05 * sc, 0);
      const bomb = MeshBuilder.CreateSphere('bomberBomb', { diameter: 0.22 * sc, segments: 8 }, scene);
      const bm2 = new StandardMaterial('bomberBombMat', scene); bm2.diffuseColor = new Color3(0.08, 0.08, 0.08);
      bomb.material = bm2; bomb.parent = this.root; bomb.isPickable = false;
      bomb.position.set(0, -0.18 * sc, 0);
      const wingMat = new StandardMaterial('bomberWingMat', scene); wingMat.diffuseColor = new Color3(0.35, 0.2, 0.16);
      for (const sx of [-1, 1]) {
        const wing = MeshBuilder.CreateCylinder('bomberWing', { diameterTop: 0.36 * sc, diameterBottom: 0.04 * sc, height: 0.04 * sc, tessellation: 3 }, scene);
        wing.material = wingMat; wing.parent = this.root; wing.isPickable = false;
        wing.position.set(sx * 0.38 * sc, 0.04 * sc, -0.06 * sc);
        wing.rotation.z = sx * Math.PI / 2;
      }
    }
  }
  get pos() { return this.root.position; }
  _drawBar() {
    const f = Math.max(this.hp / this.maxHp, 0);
    const W = this.isBoss ? 176 : 128, H = 20;
    const c = this.barTex.getContext();
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#111'; c.fillRect(0, 0, W, H);
    c.fillStyle = f > 0.5 ? '#35d84a' : f > 0.25 ? '#f0b32a' : '#e23b3b';
    c.fillRect(2, 2, (W - 4) * f, H - 4);
    this.barTex.update();
  }
  applySlow(factor, duration) {
    this.speed = Math.min(this.speed, this.baseSpeed * factor);
    this.slowTimer = Math.max(this.slowTimer, duration);
  }
  update(dt) {
    if (this.dead || this.arrived) return;
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) { this.slowTimer = 0; this.speed = this.baseSpeed; }
    }
    const tgt = this.wp[this.i];
    if (!tgt) { this.arrived = true; return; }
    const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.06) { this.i++; if (this.i >= this.wp.length) this.arrived = true; return; }
    const st = Math.min(this.speed * dt, d);
    this.pos.x += dx / d * st; this.pos.z += dz / d * st;
    const facing = Math.atan2(dx, dz);
    if (this.type === 'drone') {
      this.wobble += dt * 6;
      this.root.rotation.x = Math.sin(this.wobble) * (8 * Math.PI / 180);
      this.root.rotation.y = facing;
      this.root.rotation.z = Math.cos(this.wobble * 0.7) * (12 * Math.PI / 180);
    } else {
      this.root.rotation.y = facing;
    }
    if (this.type === 'ghost') {
      this.wobble += dt * 3;
      this.pos.y = this.baseY + Math.sin(this.wobble) * 0.08;
    }
    this.bar.position.set(this.pos.x, this.pos.y + (this.isBoss ? 0.88 * this.bossScale : 0.95), this.pos.z);
    if (this.isBoss) {
      this.shieldCycle += dt;
      if (this.shieldCycle > 5.5) this.shieldCycle -= 5.5;
      this.shielded = this.shieldCycle < 1.8;
      this.shield.setEnabled(this.shielded);
      this.shield.position.set(this.pos.x, this.pos.y + 0.08 * this.bossScale, this.pos.z);
      this.haloSpin += dt * (this.enraged ? 2.2 : 1);
      this.bossHalo.rotation.y = (this.haloSpin * 70 * Math.PI / 180) % (Math.PI * 2);
    }
  }
  hurt(dmg) {
    if (this.dead) return;
    if (this.isBoss && this.shielded) { sfx.hit(); return; }
    this.hp -= dmg;
    this._drawBar();
    if (this.isBoss && !this.enraged && this.hp > 0 && this.hp / this.maxHp <= 0.15) {
      this.enraged = true;
      this.speed *= 1.8;
      this.baseSpeed *= 1.8;
      this.bossGlowMat.emissiveColor = new Color3(1, 0.1, 0.1);
      this.bossGlowMat.alpha = 0.5;
      sfx.bossGrowl();
    }
    if (this.hp <= 0) { this.dead = true; }
  }
  dispose() {
    this.root.dispose(); this.bar.dispose(); this.barTex.dispose();
    if (this.shield) this.shield.dispose();
  }
}

// ── tower ───────────────────────────────────────────────────────
const TOWER_WEAPON = { laser: 'weapon-turret', cannon: 'weapon-cannon', frost: null, tesla: null };
function buildTeslaCoil(parent, alpha, cast) {
  const rod = MeshBuilder.CreateCylinder('teslaRod', { diameterTop: 0.1, diameterBottom: 0.18, height: 0.55, tessellation: 8 }, scene);
  const rodMat = new StandardMaterial('teslaRodMat', scene);
  rodMat.diffuseColor = new Color3(0.16, 0.16, 0.21); rodMat.alpha = alpha;
  rod.material = rodMat; rod.parent = parent; rod.position.set(0, 0.28, 0);
  if (cast) shadow.addShadowCaster(rod);
  for (let i = 0; i < 3; i++) {
    const ring = MeshBuilder.CreateDisc('teslaRing', { radius: 0.13 - i * 0.02, tessellation: 16 }, scene);
    ring.rotation.x = Math.PI / 2;
    const ringMat = new StandardMaterial('teslaRingMat', scene);
    ringMat.emissiveColor = new Color3(0.75, 0.52, 0.99); ringMat.disableLighting = true; ringMat.alpha = 0.85 * alpha;
    ring.material = ringMat; ring.parent = parent; ring.position.set(0, 0.16 + i * 0.14, 0);
  }
  const orb = MeshBuilder.CreateSphere('teslaOrb', { diameter: 0.28, segments: 8 }, scene);
  const orbMat = new StandardMaterial('teslaOrbMat', scene);
  orbMat.emissiveColor = new Color3(0.95, 0.91, 1); orbMat.disableLighting = true; orbMat.alpha = 0.95 * alpha;
  orb.material = orbMat; orb.parent = parent; orb.position.set(0, 0.58, 0);
  if (cast) shadow.addShadowCaster(orb);
  const halo = MeshBuilder.CreateSphere('teslaHalo', { diameter: 0.48, segments: 8 }, scene);
  const haloMat = new StandardMaterial('teslaHaloMat', scene);
  haloMat.emissiveColor = new Color3(0.75, 0.52, 0.99); haloMat.disableLighting = true; haloMat.alpha = 0.35 * alpha;
  halo.material = haloMat; halo.parent = parent; halo.position.set(0, 0.58, 0);
}
function buildTrapVisual(x, z) {
  const root = new TransformNode('trapRoot', scene);
  root.position.set(x, tileTop, z);
  const spikeMat = new StandardMaterial('spikeMat', scene);
  spikeMat.diffuseColor = new Color3(0.22, 0.2, 0.24);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const spike = MeshBuilder.CreateCylinder('spike', { diameterTop: 0.02, diameterBottom: 0.11, height: 0.22, tessellation: 6 }, scene);
    spike.material = spikeMat; spike.parent = root;
    spike.position.set(Math.cos(ang) * 0.14, 0.11, Math.sin(ang) * 0.14);
    spike.rotation.z = (Math.random() - 0.5) * (20 * Math.PI / 180);
  }
  const baseMat = new StandardMaterial('trapBaseMat', scene);
  baseMat.diffuseColor = new Color3(0.3, 0.27, 0.22);
  const base = MeshBuilder.CreateDisc('trapBase', { radius: 0.22, tessellation: 16 }, scene);
  base.material = baseMat; base.rotation.x = Math.PI / 2; base.parent = root; base.position.set(0, 0.01, 0);
  return root;
}
class Tower {
  constructor(type, c, r) {
    this.type = type; this.def = TOWER_TYPES[type]; this.c = c; this.r = r;
    this.cooldown = 0;
    this.level = 1; this.totalInvested = this.def.cost;
    this.overcharge = false; this.powerShot = false;
    this.branch = null;
    this.baseRange = (this.def.range / 26) * T;    // larger fire radius (towers sit further from the path)
    this.range = this.baseRange;
    const x = gx(c), z = gz(r);
    const tint = new Color3(((this.def.color >> 16) & 255) / 255, ((this.def.color >> 8) & 255) / 255, (this.def.color & 255) / 255);
    // stacked body — turret sits at its true top
    this.meshes = [];
    this.topY = stackParts(x, z, ['tower-square-bottom-a', 'tower-square-middle-a', 'tower-square-top-a'], 1, this.meshes);
    this.turret = new TransformNode('turret', scene);
    this.turret.position.set(x, this.topY, z);
    const wname = TOWER_WEAPON[type];
    if (type === 'tesla') {
      buildTeslaCoil(this.turret, 1, true);
    } else if (wname) {
      const w = inst(wname, 0, 0, { cast: true, s: 0.9 });
      w.parent = this.turret; w.position.set(0, 0, 0);
    } else {
      const cr = inst('tower-round-crystals', 0, 0, { cast: true, s: 0.9, tint });
      cr.parent = this.turret;
    }
    // colored ring marks the type
    const ring = MeshBuilder.CreateTorus('ring', { diameter: 0.8, thickness: 0.06, tessellation: 20 }, scene);
    const rm = new StandardMaterial('rm', scene); rm.emissiveColor = tint; rm.disableLighting = true;
    ring.material = rm; ring.position.set(x, tileTop + 0.02, z);
    this.meshes.push(ring);
    // tag every child mesh so clicking ANY part of the tower selects it
    const tag = node => { if (node.getChildMeshes) node.getChildMeshes().forEach(cm => (cm.__tower = this)); if (node.__tower === undefined) node.__tower = this; };
    this.meshes.forEach(tag);
    this.turret.getChildMeshes().forEach(cm => (cm.__tower = this));
  }
  effDamage() {
    let dmg = (this.def.damage || 0) * LEVEL_DMG_MULT[this.level - 1] * (this.powerShot ? 1.5 : 1);
    if (this.level === 3 && this.branch === 'a') {
      if (this.type === 'cannon') dmg *= 1.7;
      else if (this.type === 'tesla') dmg *= 1.8;
    }
    return dmg;
  }
  effSlow() {
    if (!this.def.slow) return undefined;
    const cap = (this.level === 3 && this.branch === 'a') ? 0.88 : 0.8;
    const reduction = Math.min(cap, (1 - this.def.slow) * LEVEL_DMG_MULT[this.level - 1]);
    return 1 - reduction;
  }
  effFireRate() {
    let rateMult = this.overcharge ? 0.6 : 1;
    if (this.type === 'laser' && this.level === 3 && this.branch === 'b') rateMult *= 0.71;
    return this.def.fireRate * rateMult;
  }
  effRangeDisplay() {
    return Math.round(this.def.range * RANGE_MULT[this.level - 1]);
  }
  upgradeCost() {
    if (this.level >= 3) return null;
    return Math.round(this.def.cost * (this.level === 1 ? 0.9 : 1.6));
  }
  upgrade(branch) {
    const cost = this.upgradeCost();
    if (cost == null || state.gold < cost) return false;
    if (this.level === 2 && branch !== 'a' && branch !== 'b') return false;
    state.gold -= cost;
    this.totalInvested += cost;
    this.level++;
    if (this.level === 3) this.branch = branch;
    this.range = this.baseRange * RANGE_MULT[this.level - 1];
    const tierScale = 0.82;
    const bb = hsize(templates['tower-square-top-a']);
    const tierY = this.topY - bb.min.y * tierScale;
    const tier = inst('tower-square-top-a', this.turret.position.x, this.turret.position.z, { cast: true, s: tierScale, y: tierY });
    this.meshes.push(tier);
    const ringCol = this.level === 2 ? new Color3(0.85, 0.87, 0.91) : new Color3(1, 0.84, 0.29);
    const tierRing = MeshBuilder.CreateTorus('tierRing', { diameter: 0.66 * tierScale, thickness: 0.05, tessellation: 20 }, scene);
    const trm = new StandardMaterial('trm', scene); trm.emissiveColor = ringCol; trm.disableLighting = true;
    tierRing.material = trm; tierRing.position.set(this.turret.position.x, tierY, this.turret.position.z);
    this.meshes.push(tierRing);
    this.topY += bb.h * tierScale;
    this.turret.position.y = this.topY;
    this.turret.scaling.setAll(1 + (this.level - 1) * 0.12);
    floatCoins(new Vector3(this.turret.position.x, this.turret.position.y + 1, this.turret.position.z), -cost);
    sfx.place();
    updateHUD();
    return true;
  }
  dispose() {
    for (const m of this.meshes) m.dispose();
    this.turret.dispose();     // also disposes the weapon child
  }
  update(dt, enemies) {
    if (this.cooldown > 0) this.cooldown -= dt * 1000;
    let best = null, bd = Infinity;
    for (const e of enemies) {
      if (e.dead || e.arrived) continue;
      const d = Math.hypot(e.pos.x - this.turret.position.x, e.pos.z - this.turret.position.z);
      if (d <= this.range && d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    const dx = best.pos.x - this.turret.position.x, dz = best.pos.z - this.turret.position.z;
    this.turret.rotation.y = Math.atan2(dx, dz);
    if (this.cooldown <= 0) {
      this.cooldown = this.effFireRate();
      if (this.type === 'laser') fireBeam(this, best);
      else if (this.type === 'tesla') fireLightning(this, best);
      else fireShot(this, best);
      sfx.shoot(this.type);
    }
  }
}

// ── projectiles + FX (per-tower colours) ────────────────────────
const flashes = [], beams = [];
const col3 = hex => new Color3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
function emissive(name, c, alpha) { const m = new StandardMaterial(name, scene); m.emissiveColor = c; m.disableLighting = true; if (alpha != null) m.alpha = alpha; return m; }
const shotMats = {}, flashMats = {}, beamMats = {};
for (const t of Object.keys(TOWER_TYPES)) {
  const c = col3(TOWER_TYPES[t].color);
  const bright = new Color3(Math.min(1, c.r + 0.35), Math.min(1, c.g + 0.35), Math.min(1, c.b + 0.35));
  shotMats[t]  = emissive('sm_' + t, c);
  flashMats[t] = emissive('fm_' + t, bright, 0.85);
  beamMats[t]  = emissive('bm_' + t, bright);
}
function muzzleOf(tower) {
  const yaw = tower.turret.rotation.y;
  const m = tower.turret.position.clone();
  m.x += Math.sin(yaw) * 0.45; m.z += Math.cos(yaw) * 0.45; m.y += 0.05;
  return m;
}
function spawnFlash(pos, type) {
  const fl = MeshBuilder.CreateSphere('mflash', { diameter: 0.42, segments: 6 }, scene);
  fl.material = flashMats[type]; fl.position.copyFrom(pos); fl.isPickable = false;
  flashes.push({ mesh: fl, life: 110 });
}
function fireShot(tower, enemy) {                 // cannon / frost / tesla — projectile
  const muzzle = muzzleOf(tower);
  spawnFlash(muzzle, tower.type);
  // a bright glowing orb + a soft halo (no TrailMesh — it anchored to the origin)
  const s = MeshBuilder.CreateSphere('shot', { diameter: 0.3, segments: 8 }, scene);
  s.material = shotMats[tower.type]; s.position.copyFrom(muzzle); s.isPickable = false;
  const halo = MeshBuilder.CreateSphere('halo', { diameter: 0.5, segments: 8 }, scene);
  halo.material = flashMats[tower.type]; halo.isPickable = false; halo.parent = s;
  let splash = null, nova = null;
  if (tower.level === 3 && tower.branch === 'b') {
    if (tower.type === 'cannon') splash = { radius: 1.1 * T, mult: 0.55 };
    else if (tower.type === 'frost') nova = { radius: 1.1 * T, factor: tower.effSlow(), duration: 1.5 };
  }
  shots.push({ mesh: s, target: enemy, dmg: tower.effDamage(), slow: tower.effSlow(), speed: (tower.type === 'cannon' ? 20 : 28) * T, splash, nova });
}
function fireBeam(tower, enemy) {                 // laser — instant beam straight to target
  const a = muzzleOf(tower), b = enemy.pos.clone(); b.y += 0.4;
  spawnFlash(a, tower.type);
  const beam = MeshBuilder.CreateTube('beam', { path: [a, b], radius: 0.05, tessellation: 6 }, scene);
  beam.material = beamMats[tower.type]; beam.isPickable = false;
  beams.push({ mesh: beam, life: 80 });
  if (tower.level === 3 && tower.branch === 'a') {
    const dmg = tower.effDamage();
    const dx = b.x - a.x, dz = b.z - a.z, lenSq = dx * dx + dz * dz;
    for (const e of enemies) {
      if (e.dead || e.arrived) continue;
      const t = Math.max(0, Math.min(1, ((e.pos.x - a.x) * dx + (e.pos.z - a.z) * dz) / lenSq));
      const px = a.x + dx * t, pz = a.z + dz * t;
      if (Math.hypot(e.pos.x - px, e.pos.z - pz) <= 0.45) e.hurt(dmg);
    }
  } else {
    enemy.hurt(tower.effDamage());
  }
}
function drawBolt(tower, a, b) {
  const segs = 5;
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 0.001;
  const nx = -dz / len, nz = dx / len;
  const pts = [a];
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const jitter = (Math.random() - 0.5) * Math.sin(t * Math.PI) * 0.5;
    pts.push(new Vector3(a.x + dx * t + nx * jitter, a.y + (b.y - a.y) * t, a.z + dz * t + nz * jitter));
  }
  pts.push(b);
  const core = MeshBuilder.CreateTube('lbolt', { path: pts, radius: 0.035, tessellation: 5 }, scene);
  core.material = beamMats[tower.type]; core.isPickable = false;
  beams.push({ mesh: core, life: 110 });
  const glowMat = new StandardMaterial('lglowMat', scene);
  glowMat.emissiveColor = new Color3(0.75, 0.52, 0.99); glowMat.disableLighting = true; glowMat.alpha = 0.4;
  const glow = MeshBuilder.CreateTube('lglow', { path: pts, radius: 0.09, tessellation: 5 }, scene);
  glow.material = glowMat; glow.isPickable = false;
  beams.push({ mesh: glow, life: 110 });
}
function fireLightning(tower, enemy) {             // tesla — jagged instant bolt
  const a = muzzleOf(tower), b = enemy.pos.clone(); b.y += 0.4;
  spawnFlash(a, tower.type);
  spawnFlash(b, tower.type);
  drawBolt(tower, a, b);
  enemy.hurt(tower.effDamage());
  if (tower.level === 3 && tower.branch === 'b') {
    const chained = [];
    for (const e of enemies) {
      if (e === enemy || e.dead || e.arrived) continue;
      if (Math.hypot(e.pos.x - enemy.pos.x, e.pos.z - enemy.pos.z) <= 2.2 * T) chained.push(e);
      if (chained.length >= 2) break;
    }
    for (const e of chained) {
      const eb = e.pos.clone(); eb.y += 0.4;
      spawnFlash(eb, tower.type);
      drawBolt(tower, b, eb);
      e.hurt(tower.effDamage() * 0.6);
    }
  }
}
function killShot(p) { p.mesh.dispose(); if (p.trail) p.trail.dispose(); }
function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const p = shots[i];
    if (!p.target || p.target.dead || p.target.arrived) { killShot(p); shots.splice(i, 1); continue; }
    // aim at the enemy BODY centre (its origin sits at the base), not the ground
    const t = p.target.pos, dx = t.x - p.mesh.position.x, dy = (t.y + 0.4) - p.mesh.position.y, dz = t.z - p.mesh.position.z;
    const d = Math.hypot(dx, dy, dz), st = p.speed * dt;
    if (d <= st + 0.3) {
      p.target.hurt(p.dmg);
      if (p.slow != null) p.target.applySlow(p.slow, 1.5);
      if (p.splash) {
        for (const e of enemies) {
          if (e === p.target || e.dead || e.arrived) continue;
          if (Math.hypot(e.pos.x - p.target.pos.x, e.pos.z - p.target.pos.z) <= p.splash.radius) e.hurt(p.dmg * p.splash.mult);
        }
      }
      if (p.nova) {
        for (const e of enemies) {
          if (e === p.target || e.dead || e.arrived) continue;
          if (Math.hypot(e.pos.x - p.target.pos.x, e.pos.z - p.target.pos.z) <= p.nova.radius) e.applySlow(p.nova.factor, p.nova.duration);
        }
      }
      sfx.hit();
      killShot(p); shots.splice(i, 1);
    } else {
      p.mesh.position.x += dx / d * st; p.mesh.position.y += dy / d * st; p.mesh.position.z += dz / d * st;
    }
  }
}
function updateFlashes(dt) {
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.life -= dt * 1000;
    if (f.life <= 0) { f.mesh.dispose(); flashes.splice(i, 1); continue; }
    f.mesh.scaling.setAll(0.4 + (f.life / 110) * 1.1);
  }
}
function updateBeams(dt) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i]; b.life -= dt * 1000;
    if (b.life <= 0) { b.mesh.dispose(); beams.splice(i, 1); }
    else b.mesh.visibility = Math.max(0.15, b.life / 80);
  }
}

// ── burst particles (enemy death / base leak) ───────────────────
const bursts = [];
const burstGreen = emissive('bg', new Color3(0.6, 1, 0.55));
function spawnBurst(pos, kind) {
  if (kind === 'leak' || kind === 'spike') { spawnExplosion(pos, kind === 'leak'); return; }
  const mat = burstGreen;
  const n = 12, life = 420, yOff = 0.4;
  for (let i = 0; i < n; i++) {
    const p = MeshBuilder.CreateSphere('burst', { diameter: 0.16, segments: 4 }, scene);
    p.material = mat; p.isPickable = false;
    p.position.set(pos.x, pos.y + yOff, pos.z);
    const a = (i / n) * Math.PI * 2, sp = 2.5 + Math.random() * 2.5;
    bursts.push({ mesh: p, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 2.5, life, maxLife: life, kind: 'spark' });
  }
}
function spawnExplosion(pos, isBase) {
  const sc = isBase ? 1 : 0.55;
  const yBase = isBase ? 1 : 0.4;
  const flashMat = new StandardMaterial('explFlashMat', scene);
  flashMat.emissiveColor = isBase ? new Color3(1, 0.54, 0.29) : new Color3(1, 0.82, 0.48);
  flashMat.disableLighting = true; flashMat.alpha = 0.9;
  const flash = MeshBuilder.CreateSphere('explFlash', { diameter: 0.5 * sc, segments: 8 }, scene);
  flash.material = flashMat; flash.isPickable = false;
  flash.position.set(pos.x, pos.y + yBase, pos.z);
  bursts.push({ mesh: flash, mat: flashMat, vx: 0, vz: 0, vy: 0, life: 180, maxLife: 180, kind: 'flash' });

  const fireMat = new StandardMaterial('explFireMat', scene);
  fireMat.emissiveColor = isBase ? new Color3(1, 0.18, 0.09) : new Color3(1, 0.35, 0.16);
  fireMat.disableLighting = true;
  const n = isBase ? 14 : 9;
  for (let i = 0; i < n; i++) {
    const p = MeshBuilder.CreateSphere('explSpark', { diameter: 0.18 * sc, segments: 4 }, scene);
    p.material = fireMat; p.isPickable = false;
    p.position.set(pos.x, pos.y + yBase - 0.05, pos.z);
    const a = (i / n) * Math.PI * 2, sp = (2.8 + Math.random() * 3) * sc;
    bursts.push({ mesh: p, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: (2.5 + Math.random() * 3) * sc, life: 380, maxLife: 380, kind: 'spark' });
  }

  const m = isBase ? 9 : 5;
  const spread = isBase ? 0.7 : 0.3;
  for (let i = 0; i < m; i++) {
    const smokeMat = new StandardMaterial('explSmokeMat', scene);
    smokeMat.diffuseColor = new Color3(0.23, 0.23, 0.23); smokeMat.disableLighting = true; smokeMat.alpha = 0.5; smokeMat.backFaceCulling = false;
    const p = MeshBuilder.CreateSphere('explSmoke', { diameter: (isBase ? 0.4 : 0.28), segments: 6 }, scene);
    p.material = smokeMat; p.isPickable = false;
    p.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + yBase - 0.1, pos.z + (Math.random() - 0.5) * spread);
    const life = (1300 + Math.random() * 600) * (isBase ? 1 : 0.8);
    bursts.push({
      mesh: p, mat: smokeMat,
      vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6, vy: (isBase ? 1.5 : 0.9) + Math.random() * 0.6,
      life, maxLife: life, kind: 'smoke',
    });
  }
}
function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.life -= dt * 1000;
    if (b.life <= 0) { b.mesh.dispose(); bursts.splice(i, 1); continue; }
    const f = b.life / b.maxLife;
    if (b.kind === 'smoke') {
      b.mesh.position.x += b.vx * dt; b.mesh.position.z += b.vz * dt;
      b.vy *= 0.985; b.mesh.position.y += b.vy * dt;
      b.mesh.scaling.setAll(1.7 - f * 0.7);
      b.mat.alpha = 0.5 * f;
    } else if (b.kind === 'flash') {
      b.mesh.scaling.setAll(0.3 + (1 - f) * 1.5);
      b.mat.alpha = 0.9 * f;
    } else {
      b.mesh.position.x += b.vx * dt; b.mesh.position.z += b.vz * dt;
      b.vy -= 9 * dt; b.mesh.position.y += b.vy * dt;
      b.mesh.scaling.setAll(0.4 + f * 0.9);
    }
  }
}

// ── dripping water off the floating island's rocky underside ────
function spawnDrip(pt) {
  const mat = new StandardMaterial('dripMat', scene);
  mat.emissiveColor = new Color3(0.56, 0.84, 1); mat.disableLighting = true; mat.alpha = 0.75;
  const d = MeshBuilder.CreateSphere('drip', { diameter: 0.07 + Math.random() * 0.04, segments: 5 }, scene);
  d.material = mat; d.isPickable = false;
  d.position.set(pt.x + (Math.random() - 0.5) * 0.15, pt.y, pt.z + (Math.random() - 0.5) * 0.15);
  drips.push({ mesh: d, vy: -0.3 - Math.random() * 0.4, life: 1800 + Math.random() * 600 });
}
function updateDrips(dt) {
  if (!dripPoints.length) return;
  dripTimer -= dt * 1000;
  if (dripTimer <= 0) {
    dripTimer = 200 + Math.random() * 240;
    spawnDrip(dripPoints[(Math.random() * dripPoints.length) | 0]);
  }
  for (let i = drips.length - 1; i >= 0; i--) {
    const d = drips[i]; d.life -= dt * 1000;
    if (d.life <= 0) { d.mesh.dispose(); drips.splice(i, 1); continue; }
    d.vy -= 6 * dt;
    d.mesh.position.y += d.vy * dt;
  }
}
// ── spike traps: placed on path tiles, burst damage then a cooldown ─
function updateTraps(dt) {
  for (const trap of traps) {
    if (trap.cooldown > 0) { trap.cooldown -= dt * 1000; continue; }
    for (const e of enemies) {
      if (e.dead || e.arrived) continue;
      const d = Math.hypot(e.pos.x - trap.x, e.pos.z - trap.z);
      if (d <= TRAP_DEF.radius) {
        e.hurt(TRAP_DEF.damage);
        spawnBurst(e.pos, 'spike');
        sfx.hit();
        trap.cooldown = TRAP_DEF.cooldown;
        break;
      }
    }
  }
}

// ── wave spawner ────────────────────────────────────────────────
const spawner = {
  queue: [], timer: 0, spawning: false, spawned: 0, lanes: 1, speed: 1,
  start() {
    if (state.wave >= WAVES.length) return;
    const wv = WAVES[state.wave];
    this.lanes = Math.min(wv.lanes || 1, laneWaypoints.length);
    this.speed = (wv.speed || 1) * difficulty.speedMult;
    this.queue = []; this.timer = 0; this.spawned = 0; this.spawning = true;
    let maxDelay = 0;
    for (const g of wv.enemies) {
      if (g.type === 'boss') continue;
      let dly = 0;
      for (let i = 0; i < g.count; i++) { this.queue.push({ type: g.type, delay: dly }); dly += g.interval; maxDelay = Math.max(maxDelay, dly); }
    }
    const bossGroup = wv.enemies.find(g => g.type === 'boss');
    if (bossGroup) {
      const miniPerBoss = 3;
      for (let i = 0; i < bossGroup.count; i++) {
        const lane = Math.min(i, this.lanes - 1);
        const bossDelay = maxDelay + 1500 + i * 900;
        for (let m = 0; m < miniPerBoss; m++) {
          this.queue.push({ type: 'boss', delay: bossDelay - (miniPerBoss - m) * 500, hpMult: (bossGroup.hpMult || 1) * 0.16, rewardMult: 0.3, bossScale: 0.55, lane });
        }
        this.queue.push({ type: 'boss', delay: bossDelay, hpMult: bossGroup.hpMult || 1, lane });
      }
    }
    this.queue.sort((a, b) => a.delay - b.delay);
    if (hud.banner) hud.banner.textContent = bossGroup ? '☠ BOSS INCOMING!' : '☠ Enemies Incoming!';
    if (bossGroup) sfx.bossAlert();
    for (const g of wv.enemies) seenTypes.add(g.type);
    state.wave++; state.phase = 'wave'; updateHUD(); music.setMode(bossGroup ? 'boss' : 'war');
  },
  update(dt) {
    if (!this.spawning) return;
    this.timer += dt * 1000;
    while (this.queue.length && this.timer >= this.queue[0].delay) {
      const q = this.queue.shift();
      let lane;
      if (q.type === 'boss') lane = Math.min(q.lane, this.lanes - 1);
      else { lane = this.spawned % this.lanes; this.spawned++; }
      const e = new Enemy(q.type, laneWaypoints[lane], this.speed, q.hpMult || 1, q.bossScale || 1);
      e.rewardMult = q.rewardMult || 1;
      enemies.push(e);
    }
    if (this.spawning && !this.queue.length && enemies.length === 0) {
      this.spawning = false;
      if (state.wave >= WAVES.length) { endGame(true); }
      else {
        for (const t of towers) { t.overcharge = false; t.powerShot = false; }
        state.phase = 'place'; setBanner(false); updateHUD(); music.setMode('peaceful');
      }
    }
  },
};

// procedural ripple/caustic water texture — replaces the old flat-color
// river material with something that actually reads as moving water
function makePathTexture() {
  const size = 128;
  const tex = new DynamicTexture('pathTex', { width: size, height: size }, scene, true);
  const c = tex.getContext();
  const grad = c.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#b97a4a');
  grad.addColorStop(1, '#a5683c');
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 1 + Math.random() * 3;
    c.fillStyle = `rgba(70,45,25,${0.15 + Math.random() * 0.2})`;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 5 + Math.random() * 10;
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(200,165,120,0.18)');
    rg.addColorStop(1, 'rgba(200,165,120,0)');
    c.fillStyle = rg;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  for (let i = 0; i < 5; i++) {
    let x = Math.random() * size, y = Math.random() * size;
    c.strokeStyle = `rgba(55,35,20,${0.2 + Math.random() * 0.15})`;
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y);
    for (let s = 0; s < 4; s++) { x += (Math.random() - 0.5) * 22; y += (Math.random() - 0.5) * 22; c.lineTo(x, y); }
    c.stroke();
  }
  tex.update();
  return tex;
}
function makeGrassTexture() {
  const size = 128;
  const tex = new DynamicTexture('grassTex', { width: size, height: size }, scene, true);
  const c = tex.getContext();
  const grad = c.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#5fae42');
  grad.addColorStop(1, '#4f9938');
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 6 + Math.random() * 12;
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(140,220,110,0.16)');
    rg.addColorStop(1, 'rgba(140,220,110,0)');
    c.fillStyle = rg;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  for (let i = 0; i < 55; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 1 + Math.random() * 2.5;
    c.fillStyle = `rgba(55,120,45,${0.15 + Math.random() * 0.2})`;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * size, y = Math.random() * size, h = 3 + Math.random() * 5;
    c.strokeStyle = `rgba(70,150,55,${0.3 + Math.random() * 0.3})`;
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 2, y - h); c.stroke();
  }
  tex.update();
  return tex;
}
function makeSkyTexture() {
  const w = 1024, h = 512;
  const tex = new DynamicTexture('skyTex', { width: w, height: h }, scene, true);
  const c = tex.getContext();
  c.translate(0, h);
  c.scale(1, -1);
  const grad = c.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1f7bd1');
  grad.addColorStop(0.45, '#4fa3e8');
  grad.addColorStop(0.75, '#a9d8f5');
  grad.addColorStop(1, '#e8f6ff');
  c.fillStyle = grad;
  c.fillRect(0, 0, w, h);
  const horizonY = h * 0.5;
  for (let i = 0; i < 11; i++) {
    const cx = Math.random() * w, cy = h * (0.06 + Math.random() * 0.3);
    const cr = 34 + Math.random() * 46;
    const puffs = 5 + Math.floor(Math.random() * 4);
    for (let p = 0; p < puffs; p++) {
      const ox = (Math.random() - 0.5) * cr * 1.8;
      const oy = -Math.abs(Math.random() - 0.5) * cr * 0.6;
      const rr = cr * (0.45 + Math.random() * 0.55);
      const cg = c.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rr);
      cg.addColorStop(0, 'rgba(255,255,255,0.95)');
      cg.addColorStop(0.7, 'rgba(255,255,255,0.55)');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = cg;
      c.beginPath(); c.ellipse(cx + ox, cy + oy, rr, rr * 0.72, 0, 0, Math.PI * 2); c.fill();
    }
  }
  const waterTop = horizonY + 90;
  const waterGrad = c.createLinearGradient(0, waterTop, 0, h);
  waterGrad.addColorStop(0, 'rgba(255,255,255,0.45)');
  waterGrad.addColorStop(0.12, 'rgba(64,190,205,0.75)');
  waterGrad.addColorStop(1, 'rgba(10,60,95,0.9)');
  c.fillStyle = waterGrad;
  c.fillRect(0, waterTop, w, h - waterTop);
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) {
    const gx = Math.random() * w;
    const gy = waterTop + 8 + Math.random() * (h - waterTop - 16);
    c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + 8 + Math.random() * 16, gy); c.stroke();
  }
  tex.update();
  return tex;
}
function makeWaterTexture(name) {
  const size = 256;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const c = tex.getContext();
  const grad = c.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#1d5480');
  grad.addColorStop(1, '#123a5c');
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);
  c.globalCompositeOperation = 'lighter';
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const baseY = (i + 0.5) * (size / bands);
    const n = 2 + (i % 3);
    const wavelength = size / n;
    const amp = 5 + Math.random() * 9;
    const phase = Math.random() * Math.PI * 2;
    const alpha = 0.05 + Math.random() * 0.07;
    c.strokeStyle = `rgba(200,232,255,${alpha})`;
    c.lineWidth = 2.5 + Math.random() * 2.5;
    c.beginPath();
    for (let x = 0; x <= size; x += 4) {
      const y = baseY + Math.sin((x / wavelength) * Math.PI * 2 + phase) * amp;
      if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  }
  for (let i = 0; i < 30; i++) {
    const y = Math.random() * size, x = Math.random() * size, len = 18 + Math.random() * 60;
    const alpha = 0.03 + Math.random() * 0.06;
    c.strokeStyle = `rgba(190,228,255,${alpha})`;
    c.lineWidth = 1 + Math.random() * 1.5;
    c.beginPath();
    c.moveTo(x, y);
    c.bezierCurveTo(x + len * 0.3, y + (Math.random() * 10 - 5), x + len * 0.7, y + (Math.random() * 10 - 5), x + len, y);
    c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 16 + Math.random() * 38;
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(6,22,38,0.12)');
    rg.addColorStop(1, 'rgba(6,22,38,0)');
    c.fillStyle = rg;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

// ── world build ─────────────────────────────────────────────────
async function build() {
  await Promise.all([
    'tile', 'tile-dirt', 'tile-spawn', 'detail-rocks', 'detail-rocks-large', 'tile-tree', 'tile-crystal',
    'tower-square-bottom-a', 'tower-square-middle-a', 'tower-square-top-a', 'tower-square-roof-a',
    'tower-round-bottom-a', 'tower-round-top-a', 'tower-round-roof-a',
    'tower-round-crystals', 'weapon-cannon', 'weapon-turret', 'weapon-ballista',
    'enemy-ufo-a', 'enemy-ufo-b', 'enemy-ufo-c', 'enemy-ufo-d',
  ].map(loadTemplate));
  T = hsize(templates['tile']).w || 1;
  tileTop = hsize(templates['tile']).max.y;    // top surface height of a ground tile

  // cells orthogonally touching the path can't be built on (keeps a gap)
  for (const lane of PATHS) for (const [c, r] of lane)
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) nearPath.add(`${c + dc},${r + dr}`);

  const pathTex = makePathTexture();
  const pathMat = new StandardMaterial('pathMat', scene);
  pathMat.diffuseTexture = pathTex;
  pathMat.emissiveColor = new Color3(1, 1, 1);
  pathMat.disableLighting = true;
  pathMat.backFaceCulling = false;

  const grassTex = makeGrassTexture();
  const grassMat = new StandardMaterial('grassMat', scene);
  grassMat.diffuseTexture = grassTex;
  grassMat.emissiveColor = new Color3(1, 1, 1);
  grassMat.disableLighting = true;
  grassMat.backFaceCulling = false;

  const cellType = (c, r) => (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) ? MAP_LAYOUT[r][c] : TILE.EMPTY;
  const BORDER = 4;
  for (let r = -BORDER; r < MAP_ROWS + BORDER; r++) {
    for (let c = -BORDER; c < MAP_COLS + BORDER; c++) {
      if (isWater(c, r)) continue;
      const type = cellType(c, r), bridge = isBridge(c, r);
      if (bridge) continue;            // bridge cells get a raised plank instead of a tile
      let name = 'tile', prop = null, tint = null, pathTile = false;
      if (type === TILE.PATH)       { name = 'tile-dirt'; pathTile = true; }
      else if (type === TILE.SPAWN) name = 'tile-spawn';
      else if (type === TILE.EMPTY) {
        const k = (((c * 73856093) ^ (r * 19349663)) >>> 0) % 100;
        // tile-tree / tile-crystal include their OWN ground tile, so use them
        // AS the tile (no overlapping grass = no z-fighting)
        if (k < 6)       { name = 'tile-tree'; tint = new Color3(0.24, 0.6, 0.28); }
        else if (k < 9)  { name = 'tile-crystal'; }
        else if (k < 15) { prop = 'detail-rocks'; }
      }
      inst(name, gx(c), gz(r), { receive: true, cast: name !== 'tile' && name !== 'tile-dirt' && name !== 'tile-spawn', tint });
      if (prop) inst(prop, gx(c), gz(r), { cast: true, y: tileTop * 0.5 });
      if (pathTile) {
        const decal = MeshBuilder.CreateGround('pathDecal', { width: T * 0.98, height: T * 0.98 }, scene);
        decal.material = pathMat; decal.isPickable = false;
        decal.rotation.y = Math.floor(Math.random() * 4) * (Math.PI / 2);
        decal.position.set(gx(c), tileTop + 0.015, gz(r));
      } else if (name === 'tile') {
        const decal = MeshBuilder.CreateGround('grassDecal', { width: T * 0.98, height: T * 0.98 }, scene);
        decal.material = grassMat; decal.isPickable = false;
        decal.rotation.y = Math.floor(Math.random() * 4) * (Math.PI / 2);
        decal.position.set(gx(c), tileTop + 0.015, gz(r));
      }
      // a decorated cell can't hold a tower
      if (name === 'tile-tree' || name === 'tile-crystal' || prop) blocked.add(`${c},${r}`);
    }
  }

  // floating-island underside: a big tapered rock mass under the whole map,
  // a scattered ring of jagged rocks along the visible edge, and a few of
  // those edge points seeded as continuous dripping-water emitters
  const islandCx = ((MAP_COLS - 1) / 2) * T;
  const islandCz = ((MAP_ROWS - 1) / 2) * T;
  const islandMargin = 1;
  const islandRx = ((MAP_COLS + 2 * BORDER - 1) / 2 - islandMargin) * T;
  const islandRz = ((MAP_ROWS + 2 * BORDER - 1) / 2 - islandMargin) * T;
  const islandTopY = tileTop - 0.03;
  const islandThickness = 5.4;
  const islandApexY = islandTopY - islandThickness;
  const islandSegs = 8;
  const islandTopR = 1, islandBotR = 0.05;
  const islandGreen = [0.10, 0.34, 0.13], islandBlack = [0.02, 0.02, 0.02];
  const segThickness = islandThickness / islandSegs;
  const riverGapCx = ((RIVER_COLS[0] + RIVER_COLS[RIVER_COLS.length - 1]) / 2) * T;
  const riverGapHalf = RIVER_COLS.length * T * 1.03 / 2;
  for (let s = 0; s < islandSegs; s++) {
    const f0 = s / islandSegs, f1 = (s + 1) / islandSegs;
    const r0 = islandTopR - (islandTopR - islandBotR) * f0;
    const shade = Math.pow((f0 + f1) / 2, 1.7);
    const cr = islandGreen[0] + (islandBlack[0] - islandGreen[0]) * shade;
    const cg = islandGreen[1] + (islandBlack[1] - islandGreen[1]) * shade;
    const cb = islandGreen[2] + (islandBlack[2] - islandGreen[2]) * shade;
    const segMat = new StandardMaterial('islandSeg' + s, scene);
    segMat.diffuseColor = new Color3(cr, cg, cb);
    const hw = islandRx * r0, hd = islandRz * r0 * 2;
    const y = islandTopY - segThickness * (s + 0.5);
    if (s === 0) {
      const leftEdge = islandCx - hw, rightEdge = islandCx + hw;
      const gapL = riverGapCx - riverGapHalf, gapR = riverGapCx + riverGapHalf;
      const leftW = gapL - leftEdge;
      if (leftW > 0) {
        const seg = MeshBuilder.CreateBox('islandSeg' + s + 'L', { width: leftW, depth: hd, height: segThickness }, scene);
        seg.material = segMat;
        seg.position.set(leftEdge + leftW / 2, y, islandCz);
        shadow.addShadowCaster(seg);
      }
      const rightW = rightEdge - gapR;
      if (rightW > 0) {
        const seg = MeshBuilder.CreateBox('islandSeg' + s + 'R', { width: rightW, depth: hd, height: segThickness }, scene);
        seg.material = segMat;
        seg.position.set(gapR + rightW / 2, y, islandCz);
        shadow.addShadowCaster(seg);
      }
    } else {
      const seg = MeshBuilder.CreateBox('islandSeg' + s, { width: hw * 2, depth: hd, height: segThickness }, scene);
      seg.material = segMat;
      seg.position.set(islandCx, y, islandCz);
      shadow.addShadowCaster(seg);
    }
  }
  const rootMat = new StandardMaterial('rootMat', scene);
  rootMat.diffuseColor = new Color3(0.2, 0.15, 0.1);
  const rootCount = 20;
  for (let i = 0; i < rootCount; i++) {
    const rad = Math.random() * 0.75;
    const ang = Math.random() * Math.PI * 2;
    const rx = islandCx + Math.cos(ang) * islandRx * rad;
    const rz = islandCz + Math.sin(ang) * islandRz * rad;
    const surfY = islandApexY + (islandTopY - islandApexY) * rad;
    const len = 0.6 + Math.random() * 1.6;
    const root = MeshBuilder.CreateCylinder('islandRoot', { diameterTop: 0.04 + Math.random() * 0.04, diameterBottom: 0.01, height: len, tessellation: 5 }, scene);
    root.material = rootMat; root.isPickable = false;
    root.position.set(rx, surfY - len / 2, rz);
    root.rotation.x = (Math.random() - 0.5) * (14 * Math.PI / 180);
    root.rotation.z = (Math.random() - 0.5) * (14 * Math.PI / 180);
    if (i % 3 === 0) dripPoints.push({ x: rx, z: rz, y: surfY - len });
  }
  const rockCount = 36;
  for (let i = 0; i < rockCount; i++) {
    const a = (i / rockCount) * Math.PI * 2 + Math.random() * 0.15;
    const rx = islandCx + Math.cos(a) * islandRx * (0.97 + Math.random() * 0.05);
    const rz = islandCz + Math.sin(a) * islandRz * (0.97 + Math.random() * 0.05);
    const ry = tileTop - 0.15 - Math.random() * 0.9;
    inst('detail-rocks-large', rx, rz, { cast: true, y: ry, s: 0.9 + Math.random() * 0.9 });
    if (i % 4 === 0) dripPoints.push({ x: rx, z: rz, y: tileTop - 0.2 });
  }

  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (isWater(c, r) || isBridge(c, r)) continue;
      if (MAP_LAYOUT[r][c] !== TILE.EMPTY) continue;
      const k = `${c},${r}`;
      if (blocked.has(k) || nearPath.has(k)) continue;
      placeableCells.push({ c, r });
    }
  }

  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (isWater(c, r) || isBridge(c, r)) continue;
      if (MAP_LAYOUT[r][c] !== TILE.PATH) continue;
      trapPlaceableCells.push({ c, r });
      trapPlaceableSet.add(`${c},${r}`);
    }
  }

  // river (rippled water surface over a darker bed, for depth) + bridges
  const riverCx = ((RIVER_COLS[0] + RIVER_COLS[RIVER_COLS.length - 1]) / 2) * T;
  // the row loop below is `-BORDER` (inclusive) to `MAP_ROWS+BORDER` (EXCLUSIVE),
  // so the ground's true row-center is (MAP_ROWS-1)/2, not MAP_ROWS/2 — using
  // the naive MAP_ROWS/2 center was off by half a tile, showing as a gap on
  // one end of the river and an overhang on the other
  const riverZ = ((MAP_ROWS - 1) / 2) * T;
  // must line up with the ground mesh's own extent on every side (which only
  // covers rows/cols out to the border) — anything larger visibly overhangs
  // past the grass into the sky-blue background at the ends
  const riverW = RIVER_COLS.length * T * 1.03;
  const riverL = (MAP_ROWS + BORDER * 2) * T;

  const bedMat = new StandardMaterial('riverBed', scene);
  bedMat.diffuseColor = new Color3(0.06, 0.16, 0.26); bedMat.specularColor = new Color3(0, 0, 0);
  const bed = MeshBuilder.CreateGround('riverBed', { width: riverW, height: riverL }, scene);
  bed.position.set(riverCx, -T * 0.16, riverZ); bed.material = bedMat;

  const waterTex = makeWaterTexture('waterTex');
  waterTex.uScale = 1.4; waterTex.vScale = 12;
  waterFlowTexture = waterTex;
  const riverMat = new StandardMaterial('river', scene);
  riverMat.diffuseTexture = waterTex;
  riverMat.diffuseColor = new Color3(0.55, 0.72, 0.85); riverMat.alpha = 0.82;
  riverMat.specularColor = new Color3(0.5, 0.65, 0.8); riverMat.specularPower = 32;
  const river = MeshBuilder.CreateGround('river', { width: riverW, height: riverL }, scene);
  river.position.set(riverCx, T * 0.05, riverZ); river.material = riverMat; river.receiveShadows = true;

  const waterTex2 = makeWaterTexture('waterTex2');
  waterTex2.uScale = 2.2; waterTex2.vScale = 8;
  waterFlowTexture2 = waterTex2;
  const riverMat2 = new StandardMaterial('river2', scene);
  riverMat2.diffuseTexture = waterTex2;
  riverMat2.diffuseColor = new Color3(0.78, 0.9, 0.97); riverMat2.alpha = 0.22;
  riverMat2.specularColor = new Color3(0.4, 0.55, 0.7); riverMat2.specularPower = 24;
  const river2 = MeshBuilder.CreateGround('river2', { width: riverW, height: riverL }, scene);
  river2.position.set(riverCx, T * 0.08, riverZ); river2.material = riverMat2;

  const woodMat = new StandardMaterial('wood', scene); woodMat.diffuseColor = new Color3(0.55, 0.36, 0.17);
  for (const lane of PATHS) for (const [c, r] of lane) if (RIVER_COLS.includes(c)) {
    const pl = MeshBuilder.CreateBox('bridge', { width: T * 1.02, depth: T * 1.02, height: T * 0.22 }, scene);
    pl.position.set(gx(c), T * 0.11, gz(r));   // clearly above the water/tiles (no z-fight)
    pl.material = woodMat; pl.receiveShadows = true; shadow.addShadowCaster(pl);
  }

  // castle at the base + a cave portal (+ a "wave incoming here" beacon) at each spawn
  const end = PATHS[0][PATHS[0].length - 1];
  baseWorld = new Vector3(gx(end[0]), 0, gz(end[1]));
  buildCastle(baseWorld.x, baseWorld.z);
  caveBeacons = PATHS.map(lane => {
    const [sc0, sr0] = lane[0];
    const x = gx(sc0), z = gz(sr0);
    buildCave(x, z);
    const arrowBaseY = tileTop + 1.05;
    const arrowMat = emissive('beaconArrow', new Color3(1, 0.71, 0.33), 0.95);
    const arrow = MeshBuilder.CreateCylinder('beaconArrow', { diameterTop: 0.44, diameterBottom: 0.028, height: 0.44, tessellation: 4 }, scene);
    arrow.material = arrowMat; arrow.rotation.y = Math.PI / 4;
    arrow.position.set(x, arrowBaseY, z); arrow.isPickable = false; arrow.setEnabled(false);
    const ringMat = emissive('beaconRing', new Color3(1, 0.71, 0.33), 0.5);
    const ring = MeshBuilder.CreateDisc('beaconRing', { radius: 0.42, tessellation: 28 }, scene);
    ring.rotation.x = Math.PI / 2; ring.material = ringMat;
    ring.position.set(x, tileTop + 0.03, z); ring.isPickable = false; ring.setEnabled(false);
    return { arrow, ring, arrowBaseY };
  });

  // lane waypoints (world space)
  const hover = T * 0.45;
  laneWaypoints = PATHS.map(lane => lane.map(([c, r]) => new Vector3(gx(c), hover, gz(r))));

  // invisible pick plane for tower placement
  const pick = MeshBuilder.CreateGround('pick', { width: (MAP_COLS + 8) * T, height: (MAP_ROWS + 8) * T }, scene);
  pick.position.set((MAP_COLS / 2) * T, 0, (MAP_ROWS / 2) * T);
  pick.visibility = 0; pick.isPickable = true;
  pickPlane = pick;

  // placement highlights — one flat glowing pad per buildable cell, all
  // shown at once when a tower type is selected, sharing a single material
  placementHighlightMat = new StandardMaterial('hm', scene);
  placementHighlightMat.emissiveColor = new Color3(0.13, 0.83, 0.93);
  placementHighlightMat.alpha = 0.5; placementHighlightMat.disableLighting = true;
  hoverHighlightMat = new StandardMaterial('hover', scene);
  hoverHighlightMat.emissiveColor = new Color3(1, 1, 1);
  hoverHighlightMat.alpha = 0.7; hoverHighlightMat.disableLighting = true;
  highlightPool = placeableCells.map(({ c, r }) => {
    const h = MeshBuilder.CreateGround('hi', { width: T * 0.94, height: T * 0.94 }, scene);
    h.material = placementHighlightMat; h.isPickable = false;
    h.position.set(gx(c), tileTop + 0.03, gz(r));
    h.setEnabled(false);
    return { mesh: h, c, r };
  });
  trapHighlightPool = trapPlaceableCells.map(({ c, r }) => {
    const h = MeshBuilder.CreateGround('hiTrap', { width: T * 0.6, height: T * 0.6 }, scene);
    h.material = placementHighlightMat; h.isPickable = false;
    h.position.set(gx(c), tileTop + 0.03, gz(r));
    h.setEnabled(false);
    return { mesh: h, c, r };
  });

  // range disc — shown (as the "fire circle") when a placed tower is selected
  const rd = MeshBuilder.CreateDisc('rdisc', { radius: 1, tessellation: 48 }, scene);
  rd.rotation.x = Math.PI / 2;
  const rmat = new StandardMaterial('rmat', scene);
  rmat.emissiveColor = new Color3(1, 0.42, 0.12); rmat.alpha = 0.3; rmat.disableLighting = true; rmat.backFaceCulling = false;
  rd.material = rmat; rd.isPickable = false; rd.setEnabled(false);
  rangeDisc = rd;

  const skyTex = makeSkyTexture();
  const skyMat = new StandardMaterial('skyMat', scene);
  skyMat.diffuseTexture = skyTex;
  skyMat.emissiveColor = new Color3(1, 1, 1);
  skyMat.disableLighting = true;
  skyMat.backFaceCulling = false;
  const sky = MeshBuilder.CreateSphere('sky', { diameter: Math.max(MAP_COLS, MAP_ROWS) * T * 12, segments: 16 }, scene);
  sky.material = skyMat; sky.isPickable = false;
  sky.position.set((MAP_COLS / 2) * T, 0, (MAP_ROWS / 2) * T);

  camera.setTarget(new Vector3((MAP_COLS / 2) * T, 0, (MAP_ROWS / 2) * T));
  camera.radius = MAP_COLS * T * 1.25;
  camera.panningDistanceLimit = Math.max(MAP_COLS, MAP_ROWS) * T * 0.65;

  buildHUD();
  buildIntro();
  updateHUD();
  window.__ready = true;
}

// ── translucent preview tower + range disc, shown at the hovered cell ─
function ghostifyModel(m, alpha) {
  if (!m) return;
  m.getChildMeshes().forEach(c => {
    if (c.material) { c.material = c.material.clone(c.material.name + '_ghost'); c.material.alpha = alpha; }
  });
}
function disposeGhost() {
  if (!ghost) return;
  ghost.root.dispose();
  ghost = null;
}
function buildGhostTower(type) {
  disposeGhost();
  const def = TOWER_TYPES[type];
  const tint = new Color3(((def.color >> 16) & 255) / 255, ((def.color >> 8) & 255) / 255, (def.color & 255) / 255);
  const root = new TransformNode('ghostRoot', scene);
  let y = 0;
  for (const name of ['tower-square-bottom-a', 'tower-square-middle-a', 'tower-square-top-a']) {
    const bb = hsize(templates[name]);
    const m = inst(name, 0, 0, { cast: false, y: y - bb.min.y });
    m.parent = root;
    ghostifyModel(m, 0.5);
    y += bb.h;
  }
  const turret = new TransformNode('ghostTurret', scene);
  turret.parent = root; turret.position.set(0, y, 0);
  const wname = TOWER_WEAPON[type];
  if (type === 'tesla') {
    buildTeslaCoil(turret, 0.5, false);
  } else {
    let weapon;
    if (wname) { weapon = inst(wname, 0, 0, { cast: false, s: 0.9 }); weapon.parent = turret; }
    else { weapon = inst('tower-round-crystals', 0, 0, { cast: false, s: 0.9, tint }); weapon.parent = turret; }
    ghostifyModel(weapon, 0.5);
  }
  const ring = MeshBuilder.CreateTorus('ghostRing', { diameter: 0.8, thickness: 0.06, tessellation: 20 }, scene);
  const rm = new StandardMaterial('grm', scene);
  rm.emissiveColor = tint; rm.disableLighting = true; rm.alpha = 0.4;
  ring.material = rm; ring.parent = root; ring.position.set(0, tileTop + 0.02, 0);
  root.setEnabled(false);
  ghost = { type, root, range: (def.range / 26) * T };
}
function clearHover() {
  if (hoveredEntry) { hoveredEntry.mesh.material = placementHighlightMat; hoveredEntry = null; }
  if (ghost) ghost.root.setEnabled(false);
  if (rangeDisc && !sellTarget) rangeDisc.setEnabled(false);
}
scene.onPointerMove = () => {
  if (state.trapMode) {
    const pr = scene.pick(scene.pointerX, scene.pointerY, m => m === pickPlane);
    const c = pr?.hit ? w2c(pr.pickedPoint.x) : null, r = pr?.hit ? w2r(pr.pickedPoint.z) : null;
    const entry = c != null && trapHighlightPool.find(p => p.c === c && p.r === r && !trapBuilt.has(`${p.c},${p.r}`));
    if (!entry) { clearHover(); return; }
    if (hoveredEntry !== entry) {
      if (hoveredEntry) hoveredEntry.mesh.material = placementHighlightMat;
      entry.mesh.material = hoverHighlightMat;
      hoveredEntry = entry;
    }
    if (ghost) ghost.root.setEnabled(false);
    if (rangeDisc && !sellTarget) rangeDisc.setEnabled(false);
    return;
  }
  if (!state.selected) { clearHover(); return; }
  const pr = scene.pick(scene.pointerX, scene.pointerY, m => m === pickPlane);
  const c = pr?.hit ? w2c(pr.pickedPoint.x) : null, r = pr?.hit ? w2r(pr.pickedPoint.z) : null;
  const entry = c != null && highlightPool.find(p => p.c === c && p.r === r && !built.has(`${p.c},${p.r}`));
  if (!entry) { clearHover(); return; }
  if (hoveredEntry !== entry) {
    if (hoveredEntry) hoveredEntry.mesh.material = placementHighlightMat;
    entry.mesh.material = hoverHighlightMat;
    hoveredEntry = entry;
  }
  if (!ghost || ghost.type !== state.selected) buildGhostTower(state.selected);
  const x = gx(entry.c), z = gz(entry.r);
  ghost.root.position.set(x, 0, z);
  ghost.root.setEnabled(true);
  if (rangeDisc) {
    rangeDisc.scaling.set(ghost.range, ghost.range, 1);
    rangeDisc.position.set(x, tileTop + 0.03, z);
    rangeDisc.setEnabled(true);
  }
};

// ── input: click to place / inspect ───────────────────────────────
scene.onPointerDown = (evt) => {
  if (evt.button !== 0) return;
  if (state.trapMode) {
    const pr = scene.pick(scene.pointerX, scene.pointerY, m => m === pickPlane);
    if (!pr?.hit) return;
    const c = w2c(pr.pickedPoint.x), r = w2r(pr.pickedPoint.z);
    if (!isTrapPlaceable(c, r) || state.gold < TRAP_DEF.cost) return;
    state.gold -= TRAP_DEF.cost; trapBuilt.add(`${c},${r}`);
    { const x = gx(c), z = gz(r); traps.push({ mesh: buildTrapVisual(x, z), x, z, cooldown: 0 }); }
    floatCoins(new Vector3(gx(c), tileTop + 1, gz(r)), -TRAP_DEF.cost);
    sfx.place();
    state.trapMode = false;
    styleCard(hud.trapCard, '#ff8a5c', false);
    hideTrapHighlights();
    clearHover();
    updateHint();
    updateHUD();
    return;
  }
  if (state.selected) {
    // placement mode — pick the flat ground plane to get the target cell
    const pr = scene.pick(scene.pointerX, scene.pointerY, m => m === pickPlane);
    if (!pr?.hit) return;
    const c = w2c(pr.pickedPoint.x), r = w2r(pr.pickedPoint.z);
    const cost = TOWER_TYPES[state.selected].cost;
    if (!isBuildable(c, r) || state.gold < cost) return;
    state.gold -= cost; built.add(`${c},${r}`);
    towers.push(new Tower(state.selected, c, r));
    floatCoins(new Vector3(gx(c), tileTop + 1, gz(r)), -cost);
    sfx.place();
    deselect();                    // one tower per selection
    updateHUD();
  } else {
    // inspect mode — pick the actual tower meshes (works at any height)
    const tp = scene.pick(scene.pointerX, scene.pointerY, m => m.__tower != null);
    if (tp?.hit && tp.pickedMesh && tp.pickedMesh.__tower) { const tw = tp.pickedMesh.__tower; showInfo(tw.def, tw); }
    else hideInfo();
  }
};

// ── cave beacons: mark which lane(s) the current/next wave uses ──
function setCaveBeacon(indices) {
  const on = new Set(indices);
  caveBeacons.forEach((b, i) => {
    const show = on.has(i);
    b.arrow.setEnabled(show);
    b.ring.setEnabled(show);
  });
}
function updateCaveBeacons(dt) {
  beaconT += dt;
  const bob = Math.sin(beaconT * 3) * 0.12;
  const pulse = 0.85 + Math.sin(beaconT * 3) * 0.15;
  for (const b of caveBeacons) {
    if (!b.arrow.isEnabled()) continue;
    b.arrow.position.y = b.arrowBaseY + bob;
    b.ring.scaling.setAll(pulse);
  }
}

// ── main loop ───────────────────────────────────────────────────
function tick(dt) {
  if (!window.__ready || state.phase === 'over') return;
  spawner.update(dt);
  for (const t of towers) t.update(dt, enemies);
  updateShots(dt);
  updateFlashes(dt);
  updateBeams(dt);
  updateBursts(dt);
  updateCaveBeacons(dt);
  updateDrips(dt);
  updateCastleSmoke(dt);
  if (castleFlag) { flagT += dt; castleFlag.rotation.y = Math.sin(flagT * 4) * (12 * Math.PI / 180); }
  updateTraps(dt);
  for (const e of enemies) e.update(dt);
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { const reward = Math.round(e.def.reward * (e.rewardMult || 1)); state.gold += reward; spawnBurst(e.pos, 'die'); floatCoins(e.pos.clone(), reward); e.dispose(); enemies.splice(i, 1); sfx.die(); updateHUD(); }
    else if (e.arrived) { const dmg = e.def.leak || 1; state.hp = Math.max(0, state.hp - dmg); spawnBurst(baseWorld, 'leak'); e.dispose(); enemies.splice(i, 1); sfx.leak(); updateHUD(); pulseHpDamage(dmg); applyCastleDamage(state.hp / BASE_HP); if (state.hp <= 0) endGame(false); }
  }
}
scene.onBeforeRenderObservable.add(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  if (waterFlowTexture) waterFlowTexture.vOffset += dt * 0.06;
  if (waterFlowTexture2) { waterFlowTexture2.uOffset += dt * 0.035; waterFlowTexture2.vOffset -= dt * 0.045; }
  tick(dt);
});
engine.runRenderLoop(() => { if (scene.activeCamera) scene.render(); });
window.addEventListener('resize', () => engine.resize());

// minimal debug hook
window.__voidrush = {
  scene, state, spawner, towers, enemies, tick, isBuildable,
  place: (type, c, r) => { if (isBuildable(c, r)) { towers.push(new Tower(type, c, r)); built.add(`${c},${r}`); } },
};

// ── HTML HUD ────────────────────────────────────────────────────
let hud = {};
const isMobile = window.matchMedia('(max-width: 640px)').matches;
function placementTipSeen() {
  try { return localStorage.getItem('vr_tip_seen') === '1'; } catch { return false; }
}
function markPlacementTipSeen() {
  try { localStorage.setItem('vr_tip_seen', '1'); } catch {}
}
function el(tag, style, txt) { const e = document.createElement(tag); e.style.cssText = style; if (txt != null) e.textContent = txt; return e; }

const ENEMY_ICON_SVG = {
  drone: `<svg width="40" height="40" viewBox="0 0 48 48"><ellipse cx="24" cy="30" rx="16" ry="6" fill="#5fd8e6"/><ellipse cx="24" cy="24" rx="9" ry="7" fill="#8ff5ff"/><circle cx="24" cy="18" r="3" fill="#eafeff"/><ellipse cx="8" cy="30" rx="4" ry="1.6" fill="#3ea8b8"/><ellipse cx="40" cy="30" rx="4" ry="1.6" fill="#3ea8b8"/></svg>`,
  tank: `<svg width="40" height="40" viewBox="0 0 48 48"><ellipse cx="24" cy="30" rx="18" ry="7" fill="#6b7078"/><ellipse cx="24" cy="23" rx="11" ry="8" fill="#8b909a"/><rect x="21" y="8" width="6" height="12" rx="2" fill="#454a52"/><circle cx="12" cy="30" r="3" fill="#454a52"/><circle cx="36" cy="30" r="3" fill="#454a52"/></svg>`,
  ghost: `<svg width="40" height="40" viewBox="0 0 48 48"><ellipse cx="24" cy="26" rx="14" ry="6" fill="#dffcff" opacity=".55"/><ellipse cx="24" cy="20" rx="9" ry="7" fill="#eafeff" opacity=".7"/><circle cx="14" cy="36" r="3" fill="#eafeff" opacity=".4"/><circle cx="24" cy="40" r="2.4" fill="#eafeff" opacity=".3"/><circle cx="33" cy="36" r="2" fill="#eafeff" opacity=".25"/></svg>`,
  bomber: `<svg width="40" height="40" viewBox="0 0 48 48"><ellipse cx="24" cy="22" rx="16" ry="6" fill="#c98a4a"/><ellipse cx="24" cy="17" rx="9" ry="7" fill="#e0a666"/><ellipse cx="8" cy="22" rx="4" ry="1.6" fill="#8a5a2c"/><ellipse cx="40" cy="22" rx="4" ry="1.6" fill="#8a5a2c"/><line x1="24" y1="28" x2="24" y2="36" stroke="#2a2a2a" stroke-width="2"/><circle cx="24" cy="40" r="5" fill="#1a1a1a"/></svg>`,
  boss: `<svg width="40" height="40" viewBox="0 0 48 48"><defs><radialGradient id="bossGlow2" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#ff6a8f"/><stop offset="60%" stop-color="#ff2e6d" stop-opacity=".45"/><stop offset="100%" stop-color="#ff2e6d" stop-opacity="0"/></radialGradient></defs><circle cx="24" cy="24" r="20" fill="url(#bossGlow2)"/><circle cx="24" cy="24" r="10" fill="#1a0c26"/><circle cx="20" cy="22" r="2" fill="#ff3355"/><circle cx="28" cy="22" r="2" fill="#ff3355"/><path d="M24 6 L27 15 L21 15 Z" fill="#ffd54a"/><path d="M10 12 L16 19 L8 20 Z" fill="#ffd54a"/><path d="M38 12 L40 20 L32 19 Z" fill="#ffd54a"/><path d="M8 34 L16 32 L12 40 Z" fill="#ffd54a"/><path d="M40 34 L36 40 L32 32 Z" fill="#ffd54a"/></svg>`,
};

// ── "How to play" intro (shown on load, reopenable via the ? button) ─
function buildIntro() {
  const font = 'font-family:"Baloo 2","Arial Black",Arial,sans-serif;text-shadow:0 2px 4px rgba(0,0,0,.5);letter-spacing:.3px;';
  const scrollStyle = document.createElement('style');
  scrollStyle.textContent = `
.vr-scroll::-webkit-scrollbar { width: 0; height: 0; }
.vr-scroll { scrollbar-width: none; }
.vr-featgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
@media (max-width: 480px) { .vr-featgrid { grid-template-columns: repeat(2, 1fr); } }`;
  document.head.appendChild(scrollStyle);
  const overlay = el('div', `position:fixed;inset:0;background:rgba(5,8,16,.72);display:flex;align-items:center;justify-content:center;z-index:30;${font}`);
  const panel = el('div', `max-width:600px;width:92%;max-height:85vh;overflow-y:auto;overflow-x:hidden;background:rgba(20,16,10,.97);border:3px solid #8b6914;border-radius:20px;padding:clamp(16px,5vw,28px) clamp(14px,5vw,32px);color:#fff;box-shadow:0 10px 40px rgba(0,0,0,.5);`);
  panel.className = 'vr-scroll';
  const fc = (icon, title, text, accent) => `<div style="background:rgba(255,255,255,.05);border:1px solid ${accent}44;border-top:3px solid ${accent};border-radius:12px;padding:clamp(6px,2vw,10px) clamp(4px,1.5vw,8px);text-align:center;min-width:0;">
      <div style="font-size:clamp(17px,5vw,22px);">${icon}</div>
      <div style="font-size:clamp(10px,2.6vw,12px);font-weight:900;color:${accent};margin-top:4px;letter-spacing:.3px;">${title}</div>
      <div style="font-size:clamp(9px,2.3vw,10.5px);font-weight:600;color:#cdd5df;margin-top:3px;line-height:1.3;">${text}</div>
    </div>`;
  panel.innerHTML = `
    <div style="font-size:clamp(24px,7vw,34px);font-weight:900;color:#fcd34d;text-align:center;">🛰 VOID RUSH</div>
    <div style="font-size:clamp(12px,3.5vw,16px);font-weight:700;color:#cdd5df;text-align:center;margin-top:6px;">Defend your castle from waves of alien invaders.</div>
    <div style="height:1px;background:#8b6914;margin:16px 0;opacity:.5;"></div>
    <div style="font-size:clamp(11.5px,3.2vw,14px);font-weight:700;color:#e8e8e8;line-height:1.6;text-align:center;">
      🏰 Enemies march from the caves to your castle. 🛒 Place towers on highlighted tiles to auto-fire at them.
      🪙 Earn gold from kills — ❤️ don't let enemies reach your castle. ▶ Click <b style="color:#fcd34d;">START WAVE</b> when ready.
    </div>
    <div style="font-size:clamp(11px,3vw,13px);font-weight:900;color:#ffe9a8;text-align:center;margin-top:18px;letter-spacing:.5px;">FEATURES</div>
    <div class="vr-featgrid">
      ${fc('⬆', 'UPGRADE', 'Level 1→2→3, pick a branch at 3', '#c084fc')}
      ${fc('⚡', 'POWER-UPS', 'Overcharge or Power Shot, one wave', '#7dd3fc')}
      ${fc('🔺', 'SPIKE TRAPS', 'Place on the path for burst damage', '#ff8a5c')}
      ${fc('☠', 'BOSS WAVES', 'Waves 4/8/12 — periodically shielded', '#ff6a8f')}
      ${fc('🐛', 'ENEMY TYPES', 'Each fights differently — watch for alerts', '#8ff5ff')}
      ${fc('🎯', 'DIFFICULTY', 'Pick below — locks once you start', '#fcd34d')}
      ${fc('⭐', 'VICTORY STARS', 'Rated by HP left after all waves', '#fde68a')}
      ${fc('🗼', 'TOWERS', '4 types, each with unique stats', '#60a5fa')}
      ${fc('🪙', 'ECONOMY', 'Earn gold from kills, spend wisely', '#34d399')}
    </div>
  `;
  const diffSection = el('div', '');
  const diffLabel = el('div', `font-size:clamp(11px,3vw,14px);font-weight:900;color:#ffe9a8;text-align:center;margin-top:18px;letter-spacing:.5px;`, 'DIFFICULTY');
  diffSection.appendChild(diffLabel);
  const diffRow = el('div', `display:flex;gap:clamp(5px,1.5vw,10px);justify-content:center;margin-top:8px;`);
  const diffBtns = {};
  const styleDiff = (key) => {
    for (const [k, b] of Object.entries(diffBtns)) {
      const on = k === key;
      b.style.background = on ? '#3a2c10' : '#171208';
      b.style.borderColor = on ? '#fcd34d' : '#8b6914';
      b.style.boxShadow = on ? '0 0 0 2px #fcd34d88' : 'none';
    }
  };
  for (const key of Object.keys(DIFFICULTIES)) {
    const d = DIFFICULTIES[key];
    const b = el('button', `flex:1;min-width:0;padding:clamp(6px,2vw,10px) clamp(3px,1.5vw,6px);border-radius:12px;background:#171208;border:2px solid #8b6914;color:#fff3d6;font-size:clamp(11px,3vw,15px);font-weight:900;cursor:pointer;${font}`);
    b.innerHTML = `<div>${d.name.toUpperCase()}</div><div style="font-size:clamp(8.5px,2.3vw,11px);font-weight:700;color:#cdd5df;margin-top:3px;">${d.blurb}</div>`;
    b.onclick = () => { difficulty = d; styleDiff(key); };
    diffBtns[key] = b; diffRow.appendChild(b);
  }
  styleDiff('normal');
  diffSection.appendChild(diffRow);
  panel.appendChild(diffSection);
  const lockedMsg = el('div', `font-size:clamp(10.5px,2.8vw,13px);font-weight:700;color:#cdd5df;text-align:center;margin-top:18px;display:none;`, '🔒 Difficulty is locked once a run is in progress — start a new run to change it.');
  panel.appendChild(lockedMsg);
  const canPickDifficulty = () => state.wave === 0 && state.phase === 'place' && towers.length === 0 && trapBuilt.size === 0;
  const btn = el('button', `display:block;margin:22px auto 0;padding:clamp(10px,3vw,14px) clamp(22px,7vw,34px);border-radius:12px;background:#b45309;border:3px solid #fcd34d;color:#fff3d6;font-size:clamp(15px,4.5vw,20px);font-weight:900;cursor:pointer;${font}`, "LET'S GO");
  btn.onclick = () => {
    if (canPickDifficulty()) { state.gold = Math.round(START_GOLD * difficulty.goldMult); updateHUD(); }
    overlay.style.display = 'none'; ensureAudio(); music.start();
  };
  panel.appendChild(btn);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const help = el('button', `position:fixed;top:clamp(8px,2vw,14px);right:clamp(8px,2vw,14px);width:clamp(38px,9vw,52px);height:clamp(38px,9vw,52px);border-radius:50%;background:rgba(26,42,74,.92);border:3px solid #60a5fa;color:#fff;font-size:clamp(17px,4.5vw,24px);font-weight:900;cursor:pointer;z-index:29;${font}`, '?');
  help.onclick = () => {
    const started = state.phase !== 'over' && !canPickDifficulty();
    diffSection.style.display = started ? 'none' : '';
    lockedMsg.style.display = started ? 'block' : 'none';
    overlay.style.display = 'flex';
  };
  document.body.appendChild(help);
}

function buildHUD() {
  const font = 'font-family:"Baloo 2","Arial Black",Arial,sans-serif;text-shadow:0 2px 4px rgba(0,0,0,.5);letter-spacing:.3px;';

  // heart-punch animation, triggered by pulseHpDamage() whenever the base
  // takes a hit, so HP loss is actually noticeable instead of a quiet number
  const styleTag = document.createElement('style');
  styleTag.textContent = `
html, body { -webkit-user-select: none; -moz-user-select: none; user-select: none; -webkit-touch-callout: none; }
@keyframes hpHit {
  0% { transform: scale(1) rotate(0deg); background-color: rgba(90,26,26,.92); box-shadow: 0 0 0 rgba(239,68,68,0); }
  20% { transform: scale(1.22) rotate(-5deg); background-color: rgba(220,38,38,1); box-shadow: 0 0 26px rgba(239,68,68,.95); }
  45% { transform: scale(.94) rotate(4deg); }
  70% { transform: scale(1.08) rotate(-2deg); }
  100% { transform: scale(1) rotate(0deg); background-color: rgba(90,26,26,.92); box-shadow: 0 0 0 rgba(239,68,68,0); }
}
.hp-hit { animation: hpHit .5s ease; }
@keyframes buffPulse {
  0%, 100% { box-shadow: 0 4px 12px rgba(0,0,0,.35), 0 0 0px rgba(255,255,255,0); transform: scale(1); }
  50% { box-shadow: 0 4px 20px rgba(0,0,0,.35), 0 0 18px var(--buffGlow, rgba(255,255,255,.8)); transform: scale(1.045); }
}
.buff-pulse { animation: buffPulse 1.1s ease-in-out infinite; }
@keyframes buffChip {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.4); }
}
.buff-chip { animation: buffChip 1.4s ease-in-out infinite; }
@keyframes swipeHint {
  0%, 100% { transform: translateY(-50%) translateX(0); opacity: .55; }
  50% { transform: translateY(-50%) translateX(6px); opacity: 1; }
}
.vr-shop::-webkit-scrollbar { height: 0; }
.vr-shop { scrollbar-width: none; }
.vr-shopbox { position: fixed; z-index: 10; background: rgba(15,12,8,.55); border: 2px solid rgba(139,105,20,.5); border-radius: 20px; padding: 6px; max-width: min(750px, calc(100vw - clamp(220px, 48vw, 380px))); }
.vr-card { box-sizing: border-box; flex: none; width: clamp(72px,20vw,132px); height: clamp(98px,26vw,172px); border-radius: clamp(10px,3vw,16px); background: #171208; border: clamp(2px,.6vw,3px) solid #8b6914; color: #fff; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: clamp(3px,1vw,6px); padding: clamp(5px,1.5vw,10px) clamp(4px,1.2vw,8px); transition: transform .15s ease, box-shadow .15s ease, background .15s ease; }
.vr-card-icon { width: clamp(34px,9vw,64px); height: clamp(34px,9vw,64px); display: flex; align-items: center; justify-content: center; }
.vr-card-icon img, .vr-card-icon svg { width: clamp(46px,12vw,88px); height: clamp(46px,12vw,88px); }
.vr-card svg { width: clamp(34px,9vw,64px); height: clamp(34px,9vw,64px); }
.vr-card-name { font-size: clamp(9.5px,2.6vw,16px); font-weight: 900; line-height: 1.15; }
.vr-card-cost { font-size: clamp(11px,3vw,19px); font-weight: 900; line-height: 1.15; }
@media (max-width: 640px) {
  .vr-banner { top: auto !important; bottom: clamp(14px,4vw,34px) !important; left: auto !important; right: clamp(10px,3vw,24px) !important; transform: none !important; max-width: min(72vw, 320px) !important; font-size: clamp(12px,3.6vw,16px) !important; padding: clamp(8px,2.2vw,12px) clamp(10px,3vw,18px) !important; }
}`;
  document.head.appendChild(styleTag);

  // a column wrapper stacks the top pills + cave indicator with no manual
  // pixel math, so they never overlap regardless of pill height/font size
  const topWrap = el('div', `position:fixed;top:clamp(6px,2vw,14px);left:clamp(6px,2vw,14px);display:flex;flex-direction:column;align-items:flex-start;gap:clamp(5px,1.5vw,10px);z-index:10;max-width:${isMobile ? '92vw' : '60vw'};${font}`);
  const bar = el('div', `display:flex;flex-wrap:wrap;gap:clamp(6px,2vw,14px);`);
  const pill = (bg, brd) => `display:flex;align-items:center;gap:clamp(4px,1.5vw,10px);padding:clamp(6px,1.8vw,12px) clamp(8px,3vw,24px);border-radius:clamp(10px,3vw,16px);background:${bg};border:clamp(2px,.6vw,3px) solid ${brd};color:#fff;font-size:clamp(15px,4.5vw,30px);font-weight:900;white-space:nowrap;`;
  hud.hp = el('div', pill('rgba(90,26,26,.92)', '#ef4444'));
  hud.hp.innerHTML = `<span id="hpHeart">❤️</span><span id="hpNum">${state.hp}</span>`;
  hud.hpHeart = hud.hp.querySelector('#hpHeart');
  hud.hpNum = hud.hp.querySelector('#hpNum');
  hud.gold = el('div', pill('rgba(74,56,0,.92)', '#fcd34d'), '🪙 ' + state.gold);
  hud.wave = el('div', pill('rgba(26,42,74,.92)', '#60a5fa'), 'WAVE 0/' + WAVES.length);
  bar.append(hud.hp, hud.gold, hud.wave);
  topWrap.appendChild(bar);

  hud.caveInfo = el('div', `padding:clamp(6px,1.8vw,10px) clamp(8px,3vw,20px);border-radius:14px;background:rgba(74,40,10,.92);border:clamp(2px,.6vw,3px) solid #ffb454;color:#ffe3b8;font-size:clamp(12px,3.4vw,18px);font-weight:900;max-width:min(420px,58vw);display:none;`, '');
  topWrap.appendChild(hud.caveInfo);
  hud.newEnemyInfo = el('div', `padding:clamp(6px,1.8vw,10px) clamp(8px,3vw,20px);border-radius:14px;background:rgba(48,20,64,.92);border:clamp(2px,.6vw,3px) solid #c084fc;color:#f3e8ff;font-size:clamp(10.5px,2.8vw,14px);font-weight:700;max-width:min(340px,58vw);display:none;`, '');
  topWrap.appendChild(hud.newEnemyInfo);
  document.body.appendChild(topWrap);

  hud.banner = el('div', `position:fixed;top:clamp(10px,3vw,20px);left:50%;transform:translateX(-50%);padding:clamp(8px,2.5vw,12px) clamp(14px,5vw,32px);border-radius:16px;background:rgba(20,16,10,.92);border:clamp(2px,.6vw,3px) solid #ef4444;color:#ffdada;font-size:clamp(16px,5vw,28px);font-weight:900;z-index:10;display:none;max-width:90vw;text-align:center;${font}`, '☠ Enemies Incoming!');
  hud.banner.className = 'vr-banner';
  document.body.appendChild(hud.banner);

  const CARD_IMG = { laser: 'weapon-turret', cannon: 'weapon-cannon', frost: 'tower-crystals' };
  const shopBox = el('div', `bottom:clamp(6px,2vw,16px);left:clamp(6px,2vw,16px);${font}`);
  shopBox.className = 'vr-shopbox';
  const shopHeader = el('div', `display:flex;justify-content:flex-end;padding:0 2px 2px 2px;`);
  hud.shopToggle = el('button', `padding:2px clamp(8px,2.5vw,12px);border-radius:8px;background:#171208;border:2px solid #8b6914;color:#ffe9a8;font-size:clamp(9px,2.4vw,11px);font-weight:900;cursor:pointer;display:flex;align-items:center;gap:4px;line-height:1.6;${font}`, '▾ Hide');
  hud.shopToggle.title = 'Collapse tower shop';
  shopHeader.appendChild(hud.shopToggle);
  shopBox.appendChild(shopHeader);
  const shop = el('div', `display:flex;gap:clamp(4px,1.5vw,12px);overflow-x:auto;overflow-y:hidden;padding:14px 4px 8px 4px;${font}`);
  shop.className = 'vr-shop';
  const shopMini = el('div', `display:none;flex-wrap:nowrap;gap:6px;padding:2px 4px 8px 4px;overflow-x:auto;overflow-y:hidden;${font}`);
  shopMini.className = 'vr-shop';
  hud.shopToggle.onclick = () => {
    hud.shopCollapsed = !hud.shopCollapsed;
    shop.style.display = hud.shopCollapsed ? 'none' : 'flex';
    shopMini.style.display = hud.shopCollapsed ? 'flex' : 'none';
    hud.shopToggle.innerHTML = hud.shopCollapsed ? '▸ Show' : '▾ Hide';
    hud.shopToggle.title = hud.shopCollapsed ? 'Expand tower shop' : 'Collapse tower shop';
  };
  hud.cards = {};
  hud.miniCards = {};
  const miniPill = (hex) => `flex:none;padding:5px clamp(8px,2.5vw,12px);border-radius:8px;background:#171208;border:2px solid ${hex};color:${hex};font-size:clamp(9px,2.4vw,11px);font-weight:900;cursor:pointer;white-space:nowrap;`;
  for (const type of Object.keys(TOWER_TYPES).sort((a, b) => TOWER_TYPES[a].cost - TOWER_TYPES[b].cost)) {
    const def = TOWER_TYPES[type];
    const hex = '#' + def.color.toString(16).padStart(6, '0');
    const card = el('div', `border-top:clamp(4px,1.2vw,6px) solid ${hex};`);
    card.className = 'vr-card';
    const icon = type === 'tesla'
      ? `<svg viewBox="0 0 64 64" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));">
          <defs>
            <radialGradient id="teslaGlow" cx="50%" cy="34%" r="55%">
              <stop offset="0%" stop-color="#ffffff"/>
              <stop offset="45%" stop-color="#e9d5ff"/>
              <stop offset="100%" stop-color="#c084fc" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <circle cx="32" cy="24" r="24" fill="url(#teslaGlow)"/>
          <rect x="26" y="30" width="12" height="26" rx="3" fill="#2a2a35"/>
          <ellipse cx="32" cy="34" rx="9" ry="3" fill="#c084fc" opacity=".85"/>
          <ellipse cx="32" cy="42" rx="8" ry="2.6" fill="#c084fc" opacity=".65"/>
          <ellipse cx="32" cy="49" rx="7" ry="2.2" fill="#c084fc" opacity=".5"/>
          <circle cx="32" cy="17" r="9.5" fill="#f3e8ff"/>
          <circle cx="32" cy="17" r="9.5" fill="none" stroke="#c084fc" stroke-width="1.6" opacity=".75"/>
          <path d="M30 8 L25 19 L30.5 19 L27 30 L39 15 L32 15 Z" fill="#fff" opacity=".95"/>
        </svg>`
      : `<div class="vr-card-icon"><img src="/assets/kenney/${CARD_IMG[type]}.png" style="object-fit:contain;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));"></div>`;
    card.innerHTML =
      icon +
      `<div class="vr-card-name" style="color:${hex};">${def.name.toUpperCase()}</div>` +
      `<div class="vr-card-cost" style="color:#ffe9a8;">🪙 ${def.cost}</div>`;
    card.onclick = () => selectType(type);
    hud.cards[type] = card; shop.appendChild(card);
    const mini = el('div', miniPill(hex), def.name.toUpperCase());
    mini.onclick = () => { hud.shopToggle.click(); selectType(type); };
    hud.miniCards[type] = mini; shopMini.appendChild(mini);
  }
  const trapCard = el('div', `border-top:clamp(4px,1.2vw,6px) solid #ff8a5c;`);
  trapCard.className = 'vr-card';
  trapCard.innerHTML =
    `<svg viewBox="0 0 64 64" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));">
      <defs>
        <radialGradient id="trapGlow" cx="50%" cy="55%" r="55%">
          <stop offset="0%" stop-color="#ffb38a"/>
          <stop offset="45%" stop-color="#ff8a5c" stop-opacity=".55"/>
          <stop offset="100%" stop-color="#ff8a5c" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="spikeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#787885"/>
          <stop offset="100%" stop-color="#2c2c34"/>
        </linearGradient>
      </defs>
      <circle cx="32" cy="42" r="22" fill="url(#trapGlow)"/>
      <ellipse cx="32" cy="45" rx="17" ry="9" fill="#4a3a2c"/>
      <ellipse cx="32" cy="45" rx="17" ry="9" fill="none" stroke="#2a1f16" stroke-width="2"/>
      <g transform="rotate(0 32 45)"><path d="M32 18 L28 45 L36 45 Z" fill="url(#spikeGrad)"/></g>
      <g transform="rotate(60 32 45)"><path d="M32 18 L28 45 L36 45 Z" fill="url(#spikeGrad)"/></g>
      <g transform="rotate(120 32 45)"><path d="M32 18 L28 45 L36 45 Z" fill="url(#spikeGrad)"/></g>
      <g transform="rotate(180 32 45)"><path d="M32 18 L28 45 L36 45 Z" fill="url(#spikeGrad)"/></g>
      <g transform="rotate(240 32 45)"><path d="M32 18 L28 45 L36 45 Z" fill="url(#spikeGrad)"/></g>
      <g transform="rotate(300 32 45)"><path d="M32 18 L28 45 L36 45 Z" fill="url(#spikeGrad)"/></g>
    </svg>` +
    `<div class="vr-card-name" style="color:#ff8a5c;">SPIKE TRAP</div>` +
    `<div class="vr-card-cost" style="color:#ffe9a8;">🪙 ${TRAP_DEF.cost}</div>`;
  trapCard.onclick = () => selectTrap();
  hud.trapCard = trapCard; shop.appendChild(trapCard);
  const trapMini = el('div', miniPill('#ff8a5c'), 'SPIKE TRAP');
  trapMini.onclick = () => { hud.shopToggle.click(); selectTrap(); };
  hud.trapMini = trapMini; shopMini.appendChild(trapMini);
  shopBox.appendChild(shop);
  shopBox.appendChild(shopMini);
  if (isMobile) {
    const swipeHint = el('div', `position:absolute;top:50%;right:6px;transform:translateY(-50%);width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.55);border:2px solid rgba(255,255,255,.5);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:900;pointer-events:none;z-index:2;animation:swipeHint 1.3s ease-in-out infinite;`, '›');
    shopBox.appendChild(swipeHint);
  }
  document.body.appendChild(shopBox);

  hud.start = el('button', `position:fixed;bottom:clamp(14px,4vw,34px);right:clamp(10px,3vw,24px);padding:clamp(10px,3vw,20px) clamp(16px,5vw,38px);border-radius:clamp(10px,3vw,16px);background:#b45309;border:clamp(2px,.6vw,3px) solid #fcd34d;color:#fff3d6;font-size:clamp(15px,4.5vw,28px);font-weight:900;cursor:pointer;z-index:10;${font}`, 'START WAVE');
  hud.start.onclick = () => { ensureAudio(); if (state.phase === 'place' && state.wave < WAVES.length) { setBanner(true); sfx.wave(); spawner.start(); } };
  document.body.appendChild(hud.start);


  // hint + tower info panel share one right-anchored column, tucked under
  // the help button and out of the way of the map's central play area
  // (a bottom-center panel used to force camera rotation just to see what
  // was underneath it while placing a tower)
  const sidePanel = el('div', `position:fixed;top:clamp(78px,17vw,90px);right:clamp(6px,2vw,14px);display:flex;flex-direction:column;align-items:flex-end;gap:clamp(8px,2.5vw,16px);z-index:11;max-width:min(380px,94vw);${font}`);
  sidePanel.className = 'vr-sidepanel';

  // placement prompt (shown while a tower type is selected)
  hud.hint = isMobile
    ? el('div', `padding:clamp(4px,1.2vw,7px) clamp(4px,1.5vw,8px);color:#bcd4ea;font-size:clamp(9.5px,2.4vw,12px);font-weight:700;display:none;text-align:left;`)
    : el('div', `padding:clamp(8px,2.5vw,12px) clamp(12px,4vw,26px);border-radius:14px;background:rgba(20,30,50,.94);border:clamp(2px,.6vw,3px) solid #60a5fa;color:#dbeafe;font-size:clamp(13px,3.8vw,20px);font-weight:900;display:none;`);
  if (!isMobile) sidePanel.appendChild(hud.hint);

  // tower info panel — cinematic glass card: gradient + blur + a glow that
  // matches the tower's own color, with a soft fade/scale-in transition
  const infoGap = isMobile ? 'clamp(3px,1vw,5px)' : 'clamp(6px,1.8vw,10px)';
  const infoPad = isMobile ? 'clamp(6px,2vw,10px) clamp(3px,1vw,6px)' : 'clamp(12px,3.5vw,20px) clamp(14px,5vw,34px)';
  hud.info = el('div', `position:relative;display:${isMobile ? 'none' : 'flex'};flex-direction:column;align-items:center;gap:${infoGap};padding:${infoPad};border-radius:clamp(12px,3.5vw,20px);background:linear-gradient(160deg, rgba(32,25,16,.97), rgba(10,8,5,.98));backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:2px solid #8b6914;min-width:${isMobile ? 'min(260px,80vw)' : 'min(320px,86vw)'};box-sizing:border-box;box-shadow:0 16px 44px rgba(0,0,0,.55);opacity:0;transform:translateY(10px) scale(.96);pointer-events:none;transition:opacity .2s ease, transform .2s ease, border-color .2s ease, box-shadow .2s ease;`);
  hud.infoName = el('div', `font-size:${isMobile ? 'clamp(14px,4vw,20px)' : 'clamp(17px,5vw,27px)'};font-weight:900;letter-spacing:.5px;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6);text-align:center;`, 'TOWER');
  hud.infoAccent = el('div', `width:clamp(40px,10vw,64px);height:3px;border-radius:2px;background:#fff;opacity:.85;`);
  hud.infoStats = el('div', `display:flex;gap:clamp(4px,1.5vw,8px);flex-wrap:wrap;justify-content:center;font-size:clamp(11px,3vw,15px);font-weight:900;color:#e7ecf3;`, '');
  const row = el('div', `display:flex;flex-wrap:wrap;gap:${isMobile ? 'clamp(3px,1vw,7px)' : 'clamp(6px,2vw,14px)'};align-items:center;justify-content:center;margin-top:${isMobile ? '1px' : '4px'};`);
  hud.levelChip = el('div', `padding:clamp(5px,1.5vw,9px) clamp(8px,2.5vw,16px);border-radius:10px;background:rgba(255,255,255,.06);border:1px solid rgba(192,132,252,.4);font-size:clamp(11px,3vw,16px);font-weight:900;color:#e9d5ff;display:none;`, '');
  hud.sellBtn = el('button', `padding:clamp(6px,2vw,11px) clamp(12px,4vw,22px);border-radius:12px;background:linear-gradient(160deg,#9a2b2b,#6b1616);border:2px solid #ef8a8a;color:#ffe1e1;font-size:clamp(12px,3.4vw,18px);font-weight:900;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);${font}`, 'SELL');
  hud.sellBtn.onclick = () => sellTower();
  hud.closeBtn = el('button', `position:absolute;top:clamp(6px,2vw,10px);right:clamp(6px,2vw,10px);width:clamp(26px,7vw,34px);height:clamp(26px,7vw,34px);border-radius:50%;background:linear-gradient(160deg,#3d3d3d,#222);border:2px solid #777;color:#eee;font-size:clamp(13px,3.6vw,18px);font-weight:900;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:0;${font}`, '✕');
  hud.closeBtn.onclick = () => hideInfo();
  row.append(hud.levelChip, hud.sellBtn);
  const upRow = el('div', `display:flex;flex-wrap:wrap;gap:${isMobile ? 'clamp(3px,1vw,7px)' : 'clamp(4px,1.5vw,10px)'};align-items:center;justify-content:center;margin-top:${isMobile ? '0px' : '2px'};`);
  hud.upgradeBtn = el('button', `padding:clamp(6px,2vw,10px) clamp(8px,3vw,18px);border-radius:12px;background:linear-gradient(160deg,#7c3aed,#4c1d95);border:2px solid #c084fc;color:#f3e8ff;font-size:clamp(11px,3vw,16px);font-weight:900;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);display:none;${font}`, 'UPGRADE');
  hud.upgradeBtn.onclick = () => { if (sellTarget && sellTarget.upgrade()) showInfo(sellTarget.def, sellTarget); };
  hud.overchargeBtn = el('button', `padding:clamp(6px,2vw,10px) clamp(7px,2.5vw,16px);border-radius:12px;background:linear-gradient(160deg,#0284c7,#0c4a6e);border:2px solid #7dd3fc;color:#e0f2fe;font-size:clamp(10px,2.8vw,15px);font-weight:900;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);display:none;${font}`, 'OVERCHARGE');
  hud.overchargeBtn.style.setProperty('--buffGlow', 'rgba(125,211,252,.9)');
  hud.overchargeBtn.onclick = () => {
    if (!sellTarget || sellTarget.overcharge) return;
    const cost = Math.round(sellTarget.def.cost * 0.35);
    if (state.gold < cost) return;
    state.gold -= cost; sellTarget.overcharge = true;
    floatCoins(new Vector3(sellTarget.turret.position.x, sellTarget.turret.position.y + 1, sellTarget.turret.position.z), -cost);
    sfx.place(); updateHUD(); showInfo(sellTarget.def, sellTarget);
  };
  hud.powerShotBtn = el('button', `padding:clamp(6px,2vw,10px) clamp(7px,2.5vw,16px);border-radius:12px;background:linear-gradient(160deg,#dc2626,#7f1d1d);border:2px solid #fca5a5;color:#fee2e2;font-size:clamp(10px,2.8vw,15px);font-weight:900;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);display:none;${font}`, 'POWER SHOT');
  hud.powerShotBtn.style.setProperty('--buffGlow', 'rgba(252,165,165,.9)');
  hud.powerShotBtn.onclick = () => {
    if (!sellTarget || sellTarget.powerShot) return;
    const cost = Math.round(sellTarget.def.cost * 0.35);
    if (state.gold < cost) return;
    state.gold -= cost; sellTarget.powerShot = true;
    floatCoins(new Vector3(sellTarget.turret.position.x, sellTarget.turret.position.y + 1, sellTarget.turret.position.z), -cost);
    sfx.place(); updateHUD(); showInfo(sellTarget.def, sellTarget);
  };
  upRow.append(hud.upgradeBtn, hud.overchargeBtn, hud.powerShotBtn);
  const branchRow = el('div', `display:flex;flex-wrap:wrap;gap:${isMobile ? 'clamp(3px,1vw,7px)' : 'clamp(4px,1.5vw,10px)'};align-items:stretch;justify-content:center;margin-top:${isMobile ? '0px' : '2px'};`);
  hud.branchABtn = el('button', `padding:clamp(5px,1.5vw,9px) clamp(6px,2vw,12px);border-radius:12px;background:linear-gradient(160deg,#7c3aed,#4c1d95);border:2px solid #c084fc;color:#f3e8ff;font-size:clamp(9px,2.5vw,12px);font-weight:900;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);display:none;max-width:min(150px,42vw);line-height:1.3;${font}`, '');
  hud.branchABtn.onclick = () => { if (sellTarget && sellTarget.upgrade('a')) showInfo(sellTarget.def, sellTarget); };
  hud.branchBBtn = el('button', `padding:clamp(5px,1.5vw,9px) clamp(6px,2vw,12px);border-radius:12px;background:linear-gradient(160deg,#7c3aed,#4c1d95);border:2px solid #c084fc;color:#f3e8ff;font-size:clamp(9px,2.5vw,12px);font-weight:900;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);display:none;max-width:min(150px,42vw);line-height:1.3;${font}`, '');
  hud.branchBBtn.onclick = () => { if (sellTarget && sellTarget.upgrade('b')) showInfo(sellTarget.def, sellTarget); };
  branchRow.append(hud.branchABtn, hud.branchBBtn);
  hud.info.append(hud.closeBtn, hud.infoName, hud.infoAccent, hud.infoStats, row, upRow, branchRow);
  if (isMobile) { topWrap.appendChild(hud.info); topWrap.appendChild(hud.hint); }
  else { sidePanel.appendChild(hud.info); document.body.appendChild(sidePanel); }

  window.addEventListener('keydown', e => { if (e.key === 'Escape') { selectType(null); hideInfo(); } });
}
function showPlacementHighlights() {
  if (!state.selected || !placementHighlightMat) return;
  const ok = state.gold >= TOWER_TYPES[state.selected].cost;
  placementHighlightMat.emissiveColor = ok ? new Color3(0.13, 0.83, 0.93) : new Color3(1, 0.3, 0.3);
  for (const p of highlightPool) p.mesh.setEnabled(!built.has(`${p.c},${p.r}`));
}
function hidePlacementHighlights() {
  for (const p of highlightPool) p.mesh.setEnabled(false);
}
function showTrapHighlights() {
  if (!state.trapMode || !placementHighlightMat) return;
  const ok = state.gold >= TRAP_DEF.cost;
  placementHighlightMat.emissiveColor = ok ? new Color3(0.13, 0.83, 0.93) : new Color3(1, 0.3, 0.3);
  for (const p of trapHighlightPool) p.mesh.setEnabled(!trapBuilt.has(`${p.c},${p.r}`));
}
function hideTrapHighlights() {
  for (const p of trapHighlightPool) p.mesh.setEnabled(false);
}
function styleCard(card, hex, selected) {
  if (selected) {
    card.style.transform = 'translateY(-6px) scale(1.05)';
    card.style.boxShadow = `0 0 0 3px ${hex}, 0 10px 26px ${hex}88`;
    card.style.background = '#241c0e';
  } else {
    card.style.transform = 'none';
    card.style.boxShadow = 'none';
    card.style.background = '#171208';
  }
}
function selectType(type) {
  ensureAudio();
  hideInfo();
  if (state.trapMode) { state.trapMode = false; styleCard(hud.trapCard, '#ff8a5c', false); hideTrapHighlights(); }
  state.selected = (state.selected === type) ? null : type;
  for (const [t, card] of Object.entries(hud.cards || {}))
    styleCard(card, '#' + TOWER_TYPES[t].color.toString(16).padStart(6, '0'), t === state.selected);
  updateHint();
  if (state.selected) { showInfo(TOWER_TYPES[state.selected], null); showPlacementHighlights(); }   // preview stats while placing
  else hidePlacementHighlights();
}
function selectTrap() {
  ensureAudio();
  hideInfo();
  if (state.selected) {
    state.selected = null;
    for (const [t, card] of Object.entries(hud.cards || {}))
      styleCard(card, '#' + TOWER_TYPES[t].color.toString(16).padStart(6, '0'), false);
    hidePlacementHighlights();
  }
  state.trapMode = !state.trapMode;
  styleCard(hud.trapCard, '#ff8a5c', state.trapMode);
  updateHint();
  if (state.trapMode) showTrapHighlights(); else hideTrapHighlights();
}
function updateShopAffordability() {
  for (const [t, card] of Object.entries(hud.cards || {})) {
    const affordable = state.gold >= TOWER_TYPES[t].cost;
    card.style.opacity = affordable ? '1' : '.55';
    const costEl = card.querySelector('.vr-card-cost');
    if (costEl) costEl.style.color = affordable ? '#ffe9a8' : '#ff6b6b';
  }
  if (hud.trapCard) {
    const affordable = state.gold >= TRAP_DEF.cost;
    hud.trapCard.style.opacity = affordable ? '1' : '.55';
    const costEl = hud.trapCard.querySelector('.vr-card-cost');
    if (costEl) costEl.style.color = affordable ? '#ffe9a8' : '#ff6b6b';
  }
  for (const [t, mini] of Object.entries(hud.miniCards || {})) {
    mini.style.opacity = state.gold >= TOWER_TYPES[t].cost ? '1' : '.55';
  }
  if (hud.trapMini) hud.trapMini.style.opacity = state.gold >= TRAP_DEF.cost ? '1' : '.55';
}
function updateHint() {
  if (!hud.hint) return;
  if (state.trapMode) {
    if (state.gold < TRAP_DEF.cost) {
      hud.hint.textContent = `❌ Not enough coins — Spike Trap costs 🪙 ${TRAP_DEF.cost}`;
      hud.hint.style.borderColor = '#ef4444'; hud.hint.style.color = '#ffdada';
    } else if (isMobile && placementTipSeen()) {
      hud.hint.style.display = 'none';
      return;
    } else {
      hud.hint.textContent = `📍 Click a highlighted path tile to place a Spike Trap   ·   Esc to cancel`;
      hud.hint.style.borderColor = '#60a5fa'; hud.hint.style.color = '#dbeafe';
      if (isMobile) markPlacementTipSeen();
    }
    hud.hint.style.display = 'block';
    return;
  }
  if (!state.selected) { hud.hint.style.display = 'none'; return; }
  const def = TOWER_TYPES[state.selected];
  if (state.gold < def.cost) {
    hud.hint.textContent = `❌ Not enough coins — ${def.name} costs 🪙 ${def.cost}`;
    hud.hint.style.borderColor = '#ef4444'; hud.hint.style.color = '#ffdada';
  } else if (isMobile && placementTipSeen()) {
    hud.hint.style.display = 'none';
    return;
  } else {
    hud.hint.textContent = `📍 Click a highlighted tile to place your ${def.name} tower   ·   Esc to cancel`;
    hud.hint.style.borderColor = '#60a5fa'; hud.hint.style.color = '#dbeafe';
    if (isMobile) markPlacementTipSeen();
  }
  hud.hint.style.display = 'block';
}
function deselect() {
  state.selected = null;
  for (const card of Object.values(hud.cards || {})) styleCard(card, null, false);
  if (hud.hint) hud.hint.style.display = 'none';
  hidePlacementHighlights();
  clearHover();
  hideInfo();
}
function setBanner(on) { if (hud.banner) hud.banner.style.display = on ? 'block' : 'none'; }
const LANE_NAMES = ['Cave 1', 'Cave 2', 'Cave 3'];
function updateCaveIndicator() {
  if (!hud.caveInfo) return;
  if (state.phase === 'over') { hud.caveInfo.style.display = 'none'; setCaveBeacon([]); return; }
  let lanes, label;
  if (state.phase === 'wave') {
    // wave already in progress — this is the CURRENT wave's spawn lanes
    lanes = Array.from({ length: spawner.lanes }, (_, i) => i);
    label = `⚔ Incoming from ${lanes.map(i => LANE_NAMES[i] || `Cave ${i + 1}`).join(' & ')}`;
  } else {
    // between waves — preview where the upcoming wave will spawn from.
    // "Wave N arrives from ..." reads right for wave 1 too, unlike "next wave".
    const wv = WAVES[state.wave];
    if (!wv) { hud.caveInfo.style.display = 'none'; setCaveBeacon([]); return; }
    const n = Math.min(wv.lanes || 1, laneWaypoints.length);
    lanes = Array.from({ length: n }, (_, i) => i);
    label = `⚠ Wave ${state.wave + 1} arrives from ${lanes.map(i => LANE_NAMES[i] || `Cave ${i + 1}`).join(' & ')}`;
  }
  hud.caveInfo.textContent = label;
  hud.caveInfo.style.display = 'block';
  setCaveBeacon(lanes);
}
function updateNewEnemyPrompt() {
  if (!hud.newEnemyInfo) return;
  if (state.phase !== 'place') { hud.newEnemyInfo.style.display = 'none'; return; }
  const wv = WAVES[state.wave];
  if (!wv) { hud.newEnemyInfo.style.display = 'none'; return; }
  const fresh = [...new Set(wv.enemies.map(g => g.type))].filter(t => !seenTypes.has(t));
  if (!fresh.length) { hud.newEnemyInfo.style.display = 'none'; return; }
  hud.newEnemyInfo.innerHTML = fresh.map(t => {
    const def = ENEMY_TYPES[t];
    const icon = ENEMY_ICON_SVG[t] || '';
    const label = t === 'boss' ? `☠ BOSS: ${def.name.toUpperCase()}` : `NEW ENEMY: ${def.name.toUpperCase()}`;
    return `<div style="display:flex;gap:10px;align-items:center;">` +
      `<div style="flex:none;width:40px;height:40px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));">${icon}</div>` +
      `<div><b style="color:#e9d5ff;">${label}</b><div>${def.blurb}</div></div></div>`;
  }).join('<div style="height:8px;"></div>');
  hud.newEnemyInfo.style.display = 'block';
}
function updateHUD() {
  if (!hud.hp) return;
  if (hud.hpNum) hud.hpNum.textContent = state.hp;
  hud.gold.textContent = '🪙 ' + state.gold;
  hud.wave.textContent = `WAVE ${Math.min(state.wave, WAVES.length)}/${WAVES.length}`;
  hud.start.style.display = (state.phase === 'place' && state.wave < WAVES.length) ? 'block' : 'none';
  updateShopAffordability();
  updateHint();
  updateCaveIndicator();
  updateNewEnemyPrompt();
  if (state.selected) showPlacementHighlights();
  if (state.trapMode) showTrapHighlights();
  if (sellTarget) showInfo(sellTarget.def, sellTarget);
}

// ── tower info panel (placement preview OR placed-tower inspect) ─
let sellTarget = null;
function showInfo(def, tower) {                  // tower null => placement preview
  sellTarget = tower;
  const hex = '#' + def.color.toString(16).padStart(6, '0');
  hud.infoName.textContent = def.name.toUpperCase() + ' TOWER';
  hud.infoName.style.color = hex;
  hud.infoName.style.textShadow = `0 0 18px ${hex}99, 0 2px 8px rgba(0,0,0,.6)`;
  hud.infoAccent.style.background = `linear-gradient(90deg, transparent, ${hex}, transparent)`;
  hud.info.style.borderColor = hex;
  hud.info.style.boxShadow = `0 16px 44px rgba(0,0,0,.55), 0 0 30px ${hex}4d`;
  const chip = (icon, label) => `<span style="display:inline-flex;align-items:center;gap:clamp(3px,1vw,6px);padding:clamp(4px,1.2vw,7px) clamp(6px,2vw,13px);border-radius:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);white-space:nowrap;">${icon} ${label}</span>`;
  const buffChip = (icon, label, glow) => `<span class="buff-chip" style="display:inline-flex;align-items:center;gap:clamp(3px,1vw,6px);padding:clamp(4px,1.2vw,7px) clamp(6px,2vw,13px);border-radius:10px;background:${glow}26;border:1px solid ${glow};color:#fff;white-space:nowrap;">${icon} ${label}</span>`;
  const chips = [];
  if (def.damage) chips.push(chip('⚔', tower ? Math.round(tower.effDamage()) : def.damage));
  const slowVal = tower ? tower.effSlow() : def.slow;
  if (slowVal) chips.push(chip('❄', `${Math.round((1 - slowVal) * 100)}% SLOW`));
  chips.push(chip('◎', `RANGE ${tower ? tower.effRangeDisplay() : def.range}`));
  chips.push(chip('⟳', `${(1000 / (tower ? tower.effFireRate() : def.fireRate)).toFixed(1)}/s`));
  if (tower && tower.overcharge) chips.push(buffChip('⚡', 'OVERCHARGED', '#7dd3fc'));
  if (tower && tower.powerShot) chips.push(buffChip('🎯', 'POWER SHOT', '#fca5a5'));
  if (tower && tower.branch) chips.push(buffChip('🌟', TOWER_BRANCHES[tower.type][tower.branch].name.toUpperCase(), '#c084fc'));
  hud.infoStats.innerHTML = chips.join('');
  hud.sellBtn.style.display  = tower ? '' : 'none';
  hud.closeBtn.style.display = '';
  if (tower) {
    hud.sellBtn.textContent = `SELL +🪙${Math.floor(tower.totalInvested * 0.6)}`;
    hud.levelChip.style.display = '';
    hud.levelChip.textContent = `LEVEL ${tower.level}`;
    const upCost = tower.upgradeCost();
    if (upCost != null && tower.level === 1) {
      hud.upgradeBtn.style.display = '';
      hud.upgradeBtn.textContent = `UPGRADE 🪙${upCost}`;
      hud.upgradeBtn.disabled = state.gold < upCost;
      hud.upgradeBtn.style.opacity = state.gold < upCost ? '.5' : '1';
      hud.branchABtn.style.display = 'none';
      hud.branchBBtn.style.display = 'none';
    } else if (upCost != null && tower.level === 2) {
      hud.upgradeBtn.style.display = 'none';
      const branches = TOWER_BRANCHES[tower.type];
      const afford = state.gold >= upCost;
      hud.branchABtn.style.display = '';
      hud.branchABtn.textContent = `${branches.a.name} 🪙${upCost}`;
      hud.branchABtn.title = branches.a.desc;
      hud.branchABtn.disabled = !afford;
      hud.branchABtn.style.opacity = afford ? '1' : '.5';
      hud.branchBBtn.style.display = '';
      hud.branchBBtn.textContent = `${branches.b.name} 🪙${upCost}`;
      hud.branchBBtn.title = branches.b.desc;
      hud.branchBBtn.disabled = !afford;
      hud.branchBBtn.style.opacity = afford ? '1' : '.5';
    } else {
      hud.upgradeBtn.style.display = 'none';
      hud.branchABtn.style.display = 'none';
      hud.branchBBtn.style.display = 'none';
    }
    const puCost = Math.round(def.cost * 0.35);
    hud.overchargeBtn.style.display = '';
    hud.overchargeBtn.textContent = tower.overcharge ? '⚡ OVERCHARGE ✓' : `⚡ OVERCHARGE 🪙${puCost}`;
    hud.overchargeBtn.disabled = tower.overcharge || state.gold < puCost;
    hud.overchargeBtn.style.opacity = tower.overcharge ? '.6' : (state.gold < puCost ? '.5' : '1');
    hud.overchargeBtn.classList.toggle('buff-pulse', !tower.overcharge && state.gold >= puCost);
    hud.powerShotBtn.style.display = '';
    hud.powerShotBtn.textContent = tower.powerShot ? '🎯 POWER SHOT ✓' : `🎯 POWER SHOT 🪙${puCost}`;
    hud.powerShotBtn.disabled = tower.powerShot || state.gold < puCost;
    hud.powerShotBtn.style.opacity = tower.powerShot ? '.6' : (state.gold < puCost ? '.5' : '1');
    hud.powerShotBtn.classList.toggle('buff-pulse', !tower.powerShot && state.gold >= puCost);
  } else {
    hud.levelChip.style.display = 'none';
    hud.upgradeBtn.style.display = 'none';
    hud.branchABtn.style.display = 'none';
    hud.branchBBtn.style.display = 'none';
    hud.overchargeBtn.style.display = 'none';
    hud.powerShotBtn.style.display = 'none';
    hud.overchargeBtn.classList.remove('buff-pulse');
    hud.powerShotBtn.classList.remove('buff-pulse');
  }
  if (isMobile) hud.info.style.display = 'flex';
  hud.info.style.opacity = '1';
  hud.info.style.transform = 'translateY(0) scale(1)';
  hud.info.style.pointerEvents = 'auto';
  const rd = rangeDisc;
  if (tower && rd) { rd.scaling.set(tower.range, tower.range, 1); rd.position.set(gx(tower.c), tileTop + 0.03, gz(tower.r)); rd.setEnabled(true); }
  else if (rd) rd.setEnabled(false);
}
function hideInfo() {
  sellTarget = null;
  if (hud.info) {
    if (isMobile) hud.info.style.display = 'none';
    hud.info.style.opacity = '0';
    hud.info.style.transform = 'translateY(10px) scale(.96)';
    hud.info.style.pointerEvents = 'none';
  }
  if (rangeDisc) rangeDisc.setEnabled(false);
}
function sellTower() {
  if (!sellTarget) return;
  const refund = Math.floor(sellTarget.totalInvested * 0.6);
  state.gold += refund;
  floatCoins(new Vector3(gx(sellTarget.c), tileTop + 1, gz(sellTarget.r)), refund);
  built.delete(`${sellTarget.c},${sellTarget.r}`);
  sellTarget.dispose();
  const i = towers.indexOf(sellTarget); if (i >= 0) towers.splice(i, 1);
  sfx.place();
  hideInfo(); updateHUD();
}

// ── floating +/- coin text (world position -> screen) ───────────
function screenOf(world) {
  const p = Vector3.Project(world, Matrix.Identity(), scene.getTransformMatrix(),
    camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
  const sx = canvas.clientWidth / engine.getRenderWidth();
  const sy = canvas.clientHeight / engine.getRenderHeight();
  return { x: p.x * sx, y: p.y * sy };
}
function floatCoins(world, amount) {
  if (!world) return;
  const pos = screenOf(world);
  const pos1 = amount >= 0;
  const d = document.createElement('div');
  d.textContent = `${pos1 ? '+' : ''}${amount} 🪙`;
  d.style.cssText = `position:fixed;left:${pos.x}px;top:${pos.y}px;transform:translate(-50%,-50%);` +
    `color:${pos1 ? '#7CFC6A' : '#ff6b6b'};font-family:"Baloo 2","Arial Black",sans-serif;font-size:22px;font-weight:900;letter-spacing:.3px;` +
    `text-shadow:0 2px 4px #000;pointer-events:none;z-index:15;transition:transform .8s ease-out,opacity .8s ease-out;`;
  document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.transform = 'translate(-50%,-140%)'; d.style.opacity = '0'; });
  setTimeout(() => d.remove(), 850);
}
function pulseHpDamage(amount) {
  if (!hud.hp) return;
  hud.hp.classList.remove('hp-hit');
  void hud.hp.offsetWidth;
  hud.hp.classList.add('hp-hit');
  if (hud.hpHeart) {
    hud.hpHeart.textContent = '💔';
    setTimeout(() => { if (hud.hpHeart) hud.hpHeart.textContent = '❤️'; }, 400);
  }
  const rect = hud.hp.getBoundingClientRect();
  const d = document.createElement('div');
  d.textContent = `-${amount}`;
  d.style.cssText = `position:fixed;left:${rect.right - 8}px;top:${rect.top + rect.height / 2}px;transform:translate(-50%,-50%);` +
    `color:#ff6b6b;font-family:"Baloo 2","Arial Black",sans-serif;font-size:24px;font-weight:900;letter-spacing:.3px;` +
    `text-shadow:0 2px 4px #000;pointer-events:none;z-index:25;transition:transform .8s ease-out,opacity .8s ease-out;`;
  document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.transform = 'translate(-50%,-170%)'; d.style.opacity = '0'; });
  setTimeout(() => d.remove(), 850);
}
const VICTORY_QUOTES = [
  'The realm stands, and the horde retreats into the dark.',
  'Not one crystal was lost. The kingdom sings your name.',
  'Void Rush, conquered. The stars themselves applaud.',
  'Your walls held. Your will held stronger.',
  'Peace returns to the floating isle — for now.',
];
const DEFEAT_QUOTES = [
  'The castle falls, but legends are built on second tries.',
  'The horde broke through... this time.',
  'Even the mightiest walls crumble. Rebuild, and rise again.',
  'The void claims the isle. Will you claim it back?',
  'Defeat is just a rough draft of victory.',
];
function endGame(win) {
  state.phase = 'over'; setBanner(false); sfx.over(win); music.setMode('off');
  const o = el('div', `position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.6);color:#fff;z-index:20;padding:16px;text-align:center;font-family:"Baloo 2","Arial Black",sans-serif;text-shadow:0 2px 4px rgba(0,0,0,.5);letter-spacing:.3px;`);
  const titleColor = win ? '#4ade80' : '#f87171';
  const quotes = win ? VICTORY_QUOTES : DEFEAT_QUOTES;
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  // victory-only star rating, based on HP % remaining when the last wave clears
  let starsHtml = '';
  if (win) {
    const frac = state.hp / BASE_HP;
    const stars = frac >= 0.7 ? 3 : frac >= 0.35 ? 2 : 1;
    const glyphs = [1, 2, 3].map(i => `<span style="font-size:clamp(28px,9vw,44px);color:${i <= stars ? '#fcd34d' : 'rgba(255,255,255,.25)'};text-shadow:${i <= stars ? '0 0 16px #fcd34d99' : 'none'};">★</span>`).join('');
    starsHtml = `<div style="margin-top:10px;">${glyphs}</div><div style="margin-top:6px;font-size:clamp(12px,3.5vw,16px);font-weight:700;color:#cdd5df;">HP remaining: ${Math.round(frac * 100)}%</div>`;
  }
  o.innerHTML = `<div style="font-size:clamp(34px,11vw,64px);font-weight:900;letter-spacing:1px;color:${titleColor};text-shadow:0 0 30px ${titleColor}88, 0 4px 10px rgba(0,0,0,.6);">${win ? 'VICTORY!' : 'DEFEATED'}</div>${starsHtml}<div style="margin-top:14px;max-width:min(80vw,420px);font-size:clamp(13px,3.5vw,17px);font-weight:600;font-style:italic;color:#e5e9f0;">"${quote}"</div>`;
  const btn = el('button', `margin-top:20px;padding:clamp(10px,3vw,14px) clamp(20px,6vw,30px);border-radius:12px;background:#166534;border:2px solid #4ade80;color:#fff;font-size:clamp(14px,4.5vw,20px);font-weight:900;cursor:pointer;`, 'PLAY AGAIN');
  btn.onclick = () => location.reload();
  o.appendChild(btn); document.body.appendChild(o);
}

build().catch(err => { window.__bootErr = String(err && (err.stack || err.message || err)); console.error(err); });

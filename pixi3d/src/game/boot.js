import * as PIXI from 'pixi.js';
import {
  Camera, CameraOrbitControl, Model, Mesh3D, StandardMaterial, Color,
  Light, LightingEnvironment, ShadowCastingLight, ShadowQuality,
  Container3D, Sprite3D, SpriteBillboardType, Plane, Point3D, TextureTransform,
} from 'pixi3d/pixi7';
import { loadGlb } from './glb-loader.js';
import {
  MAP_COLS, MAP_ROWS, MAP_LAYOUT, TILE, PATHS, RIVER_COLS, isWater, isBridge,
  TOWER_TYPES, ENEMY_TYPES, WAVES, BASE_HP, START_GOLD, LEVEL_DMG_MULT, RANGE_MULT, TRAP_DEF, DIFFICULTIES, TOWER_BRANCHES,
} from './data.js';
import { sfx, ensureAudio, music } from './sfx.js';

const RAD2DEG = 180 / Math.PI;

const canvas = document.getElementById('app');
const app = new PIXI.Application({
  view: canvas, resizeTo: window, antialias: true, autoDensity: true,
  resolution: window.devicePixelRatio || 1, backgroundColor: 0x87ceeb,
});
const renderer = app.renderer;
const pipeline = renderer.plugins.pipeline;

const camera = Camera.main;
camera.fieldOfView = 45;
const control = new CameraOrbitControl(canvas, camera);
control.angles.x = 58; control.angles.y = 205;
control.distance = 20;

const sun = new Light();
sun.type = 'directional'; sun.intensity = 3.2;
sun.rotationQuaternion.setEulerAngles(52, -35, 0);
LightingEnvironment.main.lights.push(sun);
app.stage.addChild(sun);
const fill = new Light();
fill.type = 'directional'; fill.intensity = 1.1;
fill.color = new Color(0.62, 0.7, 0.86);
fill.rotationQuaternion.setEulerAngles(-35, 150, 0);
LightingEnvironment.main.lights.push(fill);
app.stage.addChild(fill);

const shadowLight = new ShadowCastingLight(renderer, sun, { shadowTextureSize: 1024, quality: ShadowQuality.medium });
shadowLight.softness = 1.2; shadowLight.shadowArea = 26; shadowLight.followCamera = true;

function yaw(container, radians) { container.rotationQuaternion.setEulerAngles(0, radians * RAD2DEG, 0); }
function solidMat(r, g, b) { const m = new StandardMaterial(); m.baseColor = new Color(r, g, b); return m; }
function unlitMat(hex, alpha = 1) {
  const m = new StandardMaterial(); m.unlit = true; m.baseColor = Color.fromHex(hex);
  if (alpha < 1) { m.baseColor.a = alpha; m.alphaMode = 'blend'; }
  return m;
}
function brighten(hex, amt) {
  const r = (hex >> 16 & 255) / 255, g = (hex >> 8 & 255) / 255, b = (hex & 255) / 255;
  const cl = v => Math.min(1, v + amt);
  return (Math.round(cl(r) * 255) << 16) | (Math.round(cl(g) * 255) << 8) | Math.round(cl(b) * 255);
}
function makePathTexture() {
  const size = 128;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const c = cnv.getContext('2d');
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
  return cnv;
}
function makeGrassTexture() {
  const size = 128;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const c = cnv.getContext('2d');
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
  return cnv;
}
function makeSkyTexture() {
  const w = 1024, h = 512;
  const cnv = document.createElement('canvas');
  cnv.width = w; cnv.height = h;
  const c = cnv.getContext('2d');
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
  return cnv;
}
function makeWaterTexture() {
  const size = 256;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const c = cnv.getContext('2d');
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
  return cnv;
}

let rangeDisc = null, groundPlane = null;
let placeableCells = [], highlightPool = [], placementHighlightMat = null;
let hoverHighlightMat = null, hoveredEntry = null, ghost = null;
let caveBeacons = [], beaconT = 0;
let dripPoints = [], dripTimer = 0;
const drips = [];
let waterFlowTransform = null, waterFlowTransform2 = null;
let minZoom = 5, maxZoom = 50;
let trapPlaceableCells = [], trapHighlightPool = [];
const traps = [];
const trapBuilt = new Set();
const trapPlaceableSet = new Set();

const BASE = '/models3d/';
const assets = {};
async function loadTemplate(name) {
  if (assets[name]) return assets[name];
  const asset = await loadGlb(BASE + name + '.glb');
  assets[name] = asset;
  return asset;
}
const bboxCache = {};
function hsize(name) {
  if (bboxCache[name]) return bboxCache[name];
  const probe = Model.from(assets[name]);
  app.stage.addChild(probe);
  const bb = probe.getBoundingBox();
  const out = { min: bb.min, max: bb.max, w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y, d: bb.max.z - bb.min.z };
  app.stage.removeChild(probe);
  probe.destroy({ children: true });
  bboxCache[name] = out;
  return out;
}
let T = 1;
function inst(name, x, z, o = {}) {
  const asset = assets[name]; if (!asset) return null;
  const m = Model.from(asset);
  m.position.set(x, o.y || 0, z);
  if (o.ry != null) yaw(m, o.ry);
  if (o.s) m.scale.set(o.s);
  if (o.tint) m.meshes.forEach(mesh => { if (mesh.material) mesh.material.baseColor = o.tint; });
  if (o.alpha != null) m.meshes.forEach(mesh => { if (mesh.material) { mesh.material.baseColor.a = o.alpha; mesh.material.alphaMode = 'blend'; } });
  pipeline.enableShadows(m, shadowLight);
  (o.parent || app.stage).addChild(m);
  return m;
}
const gx = c => c * T, gz = r => r * T;
const w2c = x => Math.round(x / T), w2r = z => Math.round(z / T);

function stackParts(x, z, parts, scale, collect, startY = 0) {
  let y = startY;
  for (const name of parts) {
    const bb = hsize(name);
    const m = inst(name, x, z, { s: scale, y: y - bb.min.y * scale });
    if (collect) collect.push(m);
    y += bb.h * scale;
  }
  return y;
}

function collectCastleMats(model) {
  if (!model) return;
  model.meshes.forEach(mesh => {
    if (mesh.material && mesh.material.baseColor) {
      const c = mesh.material.baseColor;
      castleMeshMats.push({ mat: mesh.material, r: c.r, g: c.g, b: c.b });
    }
  });
}

function buildCastle(cx, cz) {
  const baseMat = solidMat(0.56, 0.58, 0.62);
  const base = Mesh3D.createCube(baseMat);
  base.scale.set(T * 1.8 / 2, T * 0.28 / 2, T * 1.8 / 2);
  base.position.set(cx, tileTop + T * 0.14, cz);
  pipeline.enableShadows(base, shadowLight);
  app.stage.addChild(base);
  castleMeshMats.push({ mat: baseMat, r: 0.56, g: 0.58, b: 0.62 });
  castleTopY = tileTop + T * 1.4;
  const topB = tileTop + T * 0.28;
  const mainParts = [];
  stackParts(cx, cz, ['tower-square-bottom-a', 'tower-square-middle-a', 'tower-square-top-a', 'tower-square-roof-a'], 1.05, mainParts, topB);
  mainParts.forEach(collectCastleMats);
  castleRoofs.push(mainParts[mainParts.length - 1]);
  const d = T * 0.52;
  for (const [dx, dz] of [[-d, -d], [d, -d], [-d, d], [d, d]]) {
    const cornerParts = [];
    stackParts(cx + dx, cz + dz, ['tower-round-bottom-a', 'tower-round-top-a', 'tower-round-roof-a'], 0.6, cornerParts, topB);
    cornerParts.forEach(collectCastleMats);
    castleRoofs.push(cornerParts[cornerParts.length - 1]);
  }
}

function applyCastleDamage(frac) {
  castleDamageFrac = frac;
  const bright = 0.35 + 0.65 * frac;
  for (const cm of castleMeshMats) {
    cm.mat.baseColor.r = cm.r * bright;
    cm.mat.baseColor.g = cm.g * bright;
    cm.mat.baseColor.b = cm.b * bright;
  }
  if (frac <= 0.25 && !castleTiltDone) {
    castleTiltDone = true;
    for (const roof of castleRoofs) {
      if (!roof) continue;
      roof.position.y -= T * 0.08;
      roof.rotationQuaternion.setEulerAngles((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 10);
    }
  }
}

function spawnCastleSmoke() {
  const smokeMat = unlitMat(0x2a2a2a, 0.4);
  const p = Mesh3D.createSphere(smokeMat);
  const ox = (Math.random() - 0.5) * T * 0.7, oz = (Math.random() - 0.5) * T * 0.7;
  p.position.set(baseWorld.x + ox, castleTopY, baseWorld.z + oz);
  app.stage.addChild(p);
  const life = 1600 + Math.random() * 700;
  bursts.push({ mesh: p, mat: smokeMat, vx: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.3, vy: 0.5 + Math.random() * 0.35, life, maxLife: life, base: 0.16 + Math.random() * 0.08, kind: 'smoke' });
}

function updateCastleSmoke(dt) {
  if (castleDamageFrac > 0.5 || state.phase === 'over') return;
  castleSmokeTimer -= dt * 1000;
  if (castleSmokeTimer <= 0) {
    castleSmokeTimer = 900 - (0.5 - castleDamageFrac) * 900;
    spawnCastleSmoke();
  }
}

let stoneMat = null, mouthMat = null, glowMat = null;
function buildCave(x, z) {
  const y = tileTop;
  if (!stoneMat) {
    stoneMat = solidMat(0.5, 0.52, 0.56);
    mouthMat = unlitMat(0x050208);
    glowMat = unlitMat(0x732eb3, 0.5);
  }
  const box = (w, h, d, px, py, pz, mat) => {
    const b = Mesh3D.createCube(mat);
    b.scale.set(w / 2, h / 2, d / 2);
    b.position.set(px, py, pz);
    pipeline.enableShadows(b, shadowLight);
    app.stage.addChild(b);
    return b;
  };
  const pillarH = T * 0.85, pw = T * 0.22, gap = T * 0.34;
  box(pw, pillarH, pw, x, y + pillarH / 2, z - gap, stoneMat);
  box(pw, pillarH, pw, x, y + pillarH / 2, z + gap, stoneMat);
  box(pw * 1.3, pw, gap * 2 + pw * 1.6, x, y + pillarH + pw * 0.4, z, stoneMat);
  box(pw * 0.9, pillarH * 0.9, gap * 1.7, x - T * 0.12, y + pillarH * 0.45, z, mouthMat);
  const g = Mesh3D.createQuad(glowMat);
  g.scale.set(gap * 1.5 / 2, pillarH * 0.8 / 2, 1);
  g.rotationQuaternion.setEulerAngles(0, 90, 0);
  g.position.set(x + T * 0.06, y + pillarH * 0.45, z);
  app.stage.addChild(g);
  inst('detail-rocks-large', x - T * 0.55, z, { s: 1.5 });
  inst('detail-rocks-large', x - T * 0.15, z - T * 0.62, { s: 1.15 });
  inst('detail-rocks-large', x - T * 0.15, z + T * 0.62, { s: 1.15 });
  inst('detail-rocks', x + T * 0.45, z - T * 0.5, { s: 1.0 });
  inst('detail-rocks', x + T * 0.45, z + T * 0.5, { s: 1.0 });
}

const state = { gold: START_GOLD, hp: BASE_HP, wave: 0, phase: 'place', selected: null, trapMode: false };
let difficulty = DIFFICULTIES.normal;
const built = new Set();
const blocked = new Set();
const nearPath = new Set();
const towers = [];
const enemies = [];
const shots = [];
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
      this.root = new Container3D();
      this.root.position.set(wps[0].x, wps[0].y, wps[0].z);
      app.stage.addChild(this.root);
      this.haloSpin = 0;
      this.enraged = false;
      this._buildBoss();
      if (bossScale !== 1) this.root.scale.set(bossScale);
    } else {
      this.root = inst(ENEMY_MODEL[type] || 'enemy-ufo-a', wps[0].x, wps[0].z, { y: wps[0].y, s: sc, alpha: type === 'ghost' ? 0.55 : undefined });
      this.baseY = wps[0].y;
      this.wobble = Math.random() * 10;
      this._buildDeco(sc);
    }
    this.barCanvas = document.createElement('canvas');
    this.barCanvas.width = this.isBoss ? 176 : 128; this.barCanvas.height = 20;
    this.barTexture = PIXI.Texture.from(this.barCanvas);
    this.bar = new Sprite3D(this.barTexture);
    this.bar.billboardType = SpriteBillboardType.spherical;
    this.bar.pixelsPerUnit = 128;
    app.stage.addChild(this.bar);
    if (this.isBoss) {
      this.shieldCycle = 3.7; this.shielded = false;
      this.shield = Mesh3D.createSphere(unlitMat(0xffe066, 0.32));
      this.shield.scale.set(0.58 * bossScale);
      this.shield.visible = false;
      app.stage.addChild(this.shield);
    }
    this._drawBar();
  }
  _buildBoss() {
    const core = Mesh3D.createSphere(solidMat(0.1, 0.045, 0.15));
    core.scale.set(0.38);
    pipeline.enableShadows(core, shadowLight);
    this.root.addChild(core);
    const eyeMat = unlitMat(0xff3355);
    for (const sx of [-0.18, 0.18]) {
      const eye = Mesh3D.createSphere(eyeMat);
      eye.scale.set(0.07);
      eye.position.set(sx, 0.06, 0.32);
      this.root.addChild(eye);
    }
    this.bossGlowMat = unlitMat(0xff2e6d, 0.28);
    const glow = Mesh3D.createSphere(this.bossGlowMat);
    glow.scale.set(0.48);
    this.root.addChild(glow);
    const spikeMat = unlitMat(0xffd54a);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const spike = Mesh3D.createCylinder(spikeMat, { radiusTop: 0.013, radiusBottom: 0.05, height: 0.27, radialSegments: 6 });
      spike.position.set(Math.cos(ang) * 0.26, 0.21, Math.sin(ang) * 0.26);
      spike.rotationQuaternion.setEulerAngles(16, ang * RAD2DEG, 0);
      this.root.addChild(spike);
    }
    this.bossHalo = Mesh3D.createCircle(unlitMat(0xff2e6d, 0.28), { radius: 0.51, segments: 28 });
    this.bossHalo.rotationQuaternion.setEulerAngles(-90, 0, 0);
    this.bossHalo.position.set(0, -0.26, 0);
    this.root.addChild(this.bossHalo);
  }
  _buildDeco(sc) {
    if (this.type === 'drone') {
      this.deco = Mesh3D.createSphere(unlitMat(0x8ff5ff, 0.95));
      this.deco.scale.set(0.07);
      this.deco.position.set(0, 0.3 * sc, 0);
      this.root.addChild(this.deco);
      const finMat = unlitMat(0x5fd8e6, 0.85);
      for (const sx of [-1, 1]) {
        const fin = Mesh3D.createCylinder(finMat, { radiusTop: 0.11 * sc, radiusBottom: 0.01, height: 0.03 * sc, radialSegments: 3 });
        fin.position.set(sx * 0.34 * sc, 0.02 * sc, 0);
        fin.rotationQuaternion.setEulerAngles(0, 0, sx * 90);
        this.root.addChild(fin);
      }
    } else if (this.type === 'tank') {
      this.deco = Mesh3D.createCylinder(solidMat(0.33, 0.35, 0.4), { radiusTop: 0.32 * sc, radiusBottom: 0.32 * sc, height: 0.09 * sc, radialSegments: 12 });
      this.deco.position.set(0, 0.14 * sc, 0);
      this.root.addChild(this.deco);
      const barrel = Mesh3D.createCylinder(solidMat(0.22, 0.23, 0.27), { radiusTop: 0.045 * sc, radiusBottom: 0.06 * sc, height: 0.42 * sc, radialSegments: 8 });
      barrel.position.set(0, 0.16 * sc, 0.32 * sc);
      barrel.rotationQuaternion.setEulerAngles(90, 0, 0);
      this.root.addChild(barrel);
      const plateMat = solidMat(0.4, 0.42, 0.47);
      for (const ang of [45, 135, 225, 315]) {
        const rad = ang * Math.PI / 180;
        const plate = Mesh3D.createCylinder(plateMat, { radiusTop: 0.08 * sc, radiusBottom: 0.08 * sc, height: 0.16 * sc, radialSegments: 6 });
        plate.position.set(Math.cos(rad) * 0.3 * sc, 0.06 * sc, Math.sin(rad) * 0.3 * sc);
        this.root.addChild(plate);
      }
    } else if (this.type === 'ghost') {
      this.deco = Mesh3D.createCircle(unlitMat(0xdffcff, 0.3), { radius: 0.36 * sc, segments: 20 });
      this.deco.rotationQuaternion.setEulerAngles(-90, 0, 0);
      this.deco.position.set(0, -0.18 * sc, 0);
      this.root.addChild(this.deco);
      const wispMat = unlitMat(0xeafeff, 0.4);
      for (let i = 0; i < 3; i++) {
        const wisp = Mesh3D.createSphere(wispMat);
        wisp.scale.set(0.05 * sc * (1 - i * 0.22));
        wisp.position.set((i - 1) * 0.1 * sc, -0.08 * sc - i * 0.05 * sc, -0.1 * sc - i * 0.08 * sc);
        this.root.addChild(wisp);
      }
    } else if (this.type === 'bomber') {
      const cable = Mesh3D.createCylinder(solidMat(0.16, 0.16, 0.16), { radiusTop: 0.014, radiusBottom: 0.014, height: 0.2 * sc, radialSegments: 5 });
      cable.position.set(0, -0.05 * sc, 0);
      this.root.addChild(cable);
      const bomb = Mesh3D.createSphere(solidMat(0.08, 0.08, 0.08));
      bomb.scale.set(0.11 * sc);
      bomb.position.set(0, -0.18 * sc, 0);
      this.root.addChild(bomb);
      const wingMat = solidMat(0.35, 0.2, 0.16);
      for (const sx of [-1, 1]) {
        const wing = Mesh3D.createCylinder(wingMat, { radiusTop: 0.18 * sc, radiusBottom: 0.02 * sc, height: 0.04 * sc, radialSegments: 3 });
        wing.position.set(sx * 0.38 * sc, 0.04 * sc, -0.06 * sc);
        wing.rotationQuaternion.setEulerAngles(0, 0, sx * 90);
        this.root.addChild(wing);
      }
    }
  }
  get pos() { return this.root.position; }
  _drawBar() {
    const f = Math.max(this.hp / this.maxHp, 0);
    const ctx = this.barCanvas.getContext('2d'); const W = this.isBoss ? 176 : 128, H = 20;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = f > 0.5 ? '#35d84a' : f > 0.25 ? '#f0b32a' : '#e23b3b';
    ctx.fillRect(2, 2, (W - 4) * f, H - 4);
    this.barTexture.baseTexture.update();
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
    this.root.position.x += dx / d * st; this.root.position.z += dz / d * st;
    const facing = Math.atan2(dx, dz);
    if (this.type === 'drone') {
      this.wobble += dt * 6;
      this.root.rotationQuaternion.setEulerAngles(Math.sin(this.wobble) * 8, facing * RAD2DEG, Math.cos(this.wobble * 0.7) * 12);
    } else {
      yaw(this.root, facing);
    }
    if (this.type === 'ghost') {
      this.wobble += dt * 3;
      this.root.position.y = this.baseY + Math.sin(this.wobble) * 0.08;
    }
    this.bar.position.set(this.pos.x, this.pos.y + (this.isBoss ? 0.88 * this.bossScale : 0.95), this.pos.z);
    if (this.isBoss) {
      this.shieldCycle += dt;
      if (this.shieldCycle > 5.5) this.shieldCycle -= 5.5;
      this.shielded = this.shieldCycle < 1.8;
      this.shield.visible = this.shielded;
      this.shield.position.set(this.pos.x, this.pos.y + 0.08 * this.bossScale, this.pos.z);
      this.haloSpin += dt * (this.enraged ? 2.2 : 1);
      this.bossHalo.rotationQuaternion.setEulerAngles(-90, (this.haloSpin * 70) % 360, 0);
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
      this.bossGlowMat.baseColor = Color.fromHex(0xff1a1a);
      this.bossGlowMat.baseColor.a = 0.5;
      sfx.bossGrowl();
    }
    if (this.hp <= 0) { this.dead = true; }
  }
  dispose() {
    this.root.destroy({ children: true }); this.bar.destroy();
    if (this.shield) this.shield.destroy();
  }
}

const TOWER_WEAPON = { laser: 'weapon-turret', cannon: 'weapon-cannon', frost: null, tesla: null };
function buildTeslaCoil(parent, alpha, cast) {
  const rod = Mesh3D.createCylinder(unlitMat(0x2a2a35, alpha), { radiusTop: 0.05, radiusBottom: 0.09, height: 0.55, radialSegments: 8 });
  rod.position.set(0, 0.28, 0);
  if (cast) pipeline.enableShadows(rod, shadowLight);
  parent.addChild(rod);
  for (let i = 0; i < 3; i++) {
    const ring = Mesh3D.createCircle(unlitMat(0xc084fc, 0.85 * alpha), { radius: 0.13 - i * 0.02, segments: 16 });
    ring.rotationQuaternion.setEulerAngles(-90, 0, 0);
    ring.position.set(0, 0.16 + i * 0.14, 0);
    parent.addChild(ring);
  }
  const orb = Mesh3D.createSphere(unlitMat(0xf3e8ff, 0.95 * alpha));
  orb.scale.set(0.14);
  orb.position.set(0, 0.58, 0);
  if (cast) pipeline.enableShadows(orb, shadowLight);
  parent.addChild(orb);
  const halo = Mesh3D.createSphere(unlitMat(0xc084fc, 0.35 * alpha));
  halo.scale.set(0.24);
  halo.position.set(0, 0.58, 0);
  parent.addChild(halo);
}
function buildTrapVisual(x, z) {
  const root = new Container3D();
  root.position.set(x, tileTop, z);
  app.stage.addChild(root);
  const spikeMat = solidMat(0.22, 0.2, 0.24);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const spike = Mesh3D.createCylinder(spikeMat, { radiusTop: 0.01, radiusBottom: 0.055, height: 0.22, radialSegments: 6 });
    spike.position.set(Math.cos(ang) * 0.14, 0.11, Math.sin(ang) * 0.14);
    spike.rotationQuaternion.setEulerAngles(0, 0, (Math.random() - 0.5) * 20);
    root.addChild(spike);
  }
  const base = Mesh3D.createCircle(solidMat(0.3, 0.27, 0.22), { radius: 0.22, segments: 16 });
  base.rotationQuaternion.setEulerAngles(-90, 0, 0);
  base.position.set(0, 0.01, 0);
  root.addChild(base);
  return root;
}
class Tower {
  constructor(type, c, r) {
    this.type = type; this.def = TOWER_TYPES[type]; this.c = c; this.r = r;
    this.cooldown = 0; this.facing = 0;
    this.level = 1; this.totalInvested = this.def.cost;
    this.overcharge = false; this.powerShot = false;
    this.branch = null;
    this.baseRange = (this.def.range / 26) * T;
    this.range = this.baseRange;
    const x = gx(c), z = gz(r);
    const tint = Color.fromHex(this.def.color);
    this.meshes = [];
    this.topY = stackParts(x, z, ['tower-square-bottom-a', 'tower-square-middle-a', 'tower-square-top-a'], 1, this.meshes);
    this.turret = new Container3D();
    this.turret.position.set(x, this.topY, z);
    app.stage.addChild(this.turret);
    const wname = TOWER_WEAPON[type];
    if (type === 'tesla') buildTeslaCoil(this.turret, 1, true);
    else if (wname) inst(wname, 0, 0, { s: 0.9, parent: this.turret });
    else inst('tower-round-crystals', 0, 0, { s: 0.9, tint, parent: this.turret });
    const ring = Mesh3D.createCircle(unlitMat(this.def.color), { radius: 0.4, segments: 24 });
    ring.rotationQuaternion.setEulerAngles(-90, 0, 0);
    ring.position.set(x, tileTop + 0.02, z);
    app.stage.addChild(ring);
    this.meshes.push(ring);
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
    const bb = hsize('tower-square-top-a');
    const tierTint = Color.fromHex(this.level === 2 ? 0xd8dee8 : 0xffd54a);
    const tier = inst('tower-square-top-a', this.turret.position.x, this.turret.position.z, { s: tierScale, y: this.topY - bb.min.y * tierScale, tint: tierTint });
    this.meshes.push(tier);
    this.topY += bb.h * tierScale;
    this.turret.position.y = this.topY;
    this.turret.scale.set(1 + (this.level - 1) * 0.12);
    floatCoins({ x: this.turret.position.x, y: this.turret.position.y + 1, z: this.turret.position.z }, -cost);
    sfx.place();
    updateHUD();
    return true;
  }
  dispose() {
    for (const m of this.meshes) m.destroy({ children: true });
    this.turret.destroy({ children: true });
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
    this.facing = Math.atan2(dx, dz);
    yaw(this.turret, this.facing);
    if (this.cooldown <= 0) {
      this.cooldown = this.effFireRate();
      if (this.type === 'laser') fireBeam(this, best);
      else if (this.type === 'tesla') fireLightning(this, best);
      else fireShot(this, best);
      sfx.shoot(this.type);
    }
  }
}

const flashes = [], beams = [], bursts = [];
function muzzleOf(tower) {
  return {
    x: tower.turret.position.x + Math.sin(tower.facing) * 0.45,
    y: tower.turret.position.y + 0.05,
    z: tower.turret.position.z + Math.cos(tower.facing) * 0.45,
  };
}
function spawnFlash(pos, type) {
  const fl = Mesh3D.createSphere(unlitMat(brighten(TOWER_TYPES[type].color, 0.35), 0.85));
  fl.position.set(pos.x, pos.y, pos.z);
  app.stage.addChild(fl);
  flashes.push({ mesh: fl, life: 110, base: 0.21 });
}
function fireShot(tower, enemy) {
  const muzzle = muzzleOf(tower);
  spawnFlash(muzzle, tower.type);
  const s = Mesh3D.createSphere(unlitMat(TOWER_TYPES[tower.type].color));
  s.scale.set(0.15);
  s.position.set(muzzle.x, muzzle.y, muzzle.z);
  const halo = Mesh3D.createSphere(unlitMat(brighten(TOWER_TYPES[tower.type].color, 0.35), 0.85));
  halo.scale.set(0.25);
  s.addChild(halo);
  app.stage.addChild(s);
  let splash = null, nova = null;
  if (tower.level === 3 && tower.branch === 'b') {
    if (tower.type === 'cannon') splash = { radius: 1.1 * T, mult: 0.55 };
    else if (tower.type === 'frost') nova = { radius: 1.1 * T, factor: tower.effSlow(), duration: 1.5 };
  }
  shots.push({ mesh: s, target: enemy, dmg: tower.effDamage(), slow: tower.effSlow(), speed: (tower.type === 'cannon' ? 20 : 28) * T, splash, nova });
}
function fireBeam(tower, enemy) {
  const a = muzzleOf(tower), b = { x: enemy.pos.x, y: enemy.pos.y + 0.4, z: enemy.pos.z };
  spawnFlash(a, tower.type);
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.max(Math.hypot(dx, dz), 0.05);
  const beam = Mesh3D.createCylinder(unlitMat(brighten(TOWER_TYPES[tower.type].color, 0.35)),
    { radiusTop: 0.045, radiusBottom: 0.045, height: len, radialSegments: 6 });
  beam.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  beam.rotationQuaternion.setEulerAngles(90, Math.atan2(dx, dz) * RAD2DEG, 0);
  app.stage.addChild(beam);
  beams.push({ mesh: beam, life: 80 });
  if (tower.level === 3 && tower.branch === 'a') {
    const dmg = tower.effDamage(), lenSq = dx * dx + dz * dz;
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
function drawBolt(a, b) {
  const segs = 5;
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 0.001;
  const nx = -dz / len, nz = dx / len;
  const pts = [a];
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const jitter = (Math.random() - 0.5) * Math.sin(t * Math.PI) * 0.5;
    pts.push({ x: a.x + dx * t + nx * jitter, y: a.y + (b.y - a.y) * t, z: a.z + dz * t + nz * jitter });
  }
  pts.push(b);
  const coreMat = unlitMat(0xf3e8ff, 0.95), glowMat = unlitMat(0xc084fc, 0.4);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const sdx = p1.x - p0.x, sdz = p1.z - p0.z;
    const slen = Math.max(Math.hypot(sdx, sdz), 0.05);
    const ang = Math.atan2(sdx, sdz) * RAD2DEG;
    const my = (p0.y + p1.y) / 2, mx = (p0.x + p1.x) / 2, mz = (p0.z + p1.z) / 2;
    const core = Mesh3D.createCylinder(coreMat, { radiusTop: 0.035, radiusBottom: 0.035, height: slen, radialSegments: 5 });
    core.position.set(mx, my, mz);
    core.rotationQuaternion.setEulerAngles(90, ang, 0);
    app.stage.addChild(core);
    beams.push({ mesh: core, life: 110 });
    const glow = Mesh3D.createCylinder(glowMat, { radiusTop: 0.09, radiusBottom: 0.09, height: slen, radialSegments: 5 });
    glow.position.set(mx, my, mz);
    glow.rotationQuaternion.setEulerAngles(90, ang, 0);
    app.stage.addChild(glow);
    beams.push({ mesh: glow, life: 110 });
  }
}
function fireLightning(tower, enemy) {
  const a = muzzleOf(tower), b = { x: enemy.pos.x, y: enemy.pos.y + 0.4, z: enemy.pos.z };
  spawnFlash(a, tower.type);
  spawnFlash(b, tower.type);
  drawBolt(a, b);
  enemy.hurt(tower.effDamage());
  if (tower.level === 3 && tower.branch === 'b') {
    const chained = [];
    for (const e of enemies) {
      if (e === enemy || e.dead || e.arrived) continue;
      if (Math.hypot(e.pos.x - enemy.pos.x, e.pos.z - enemy.pos.z) <= 2.2 * T) chained.push(e);
      if (chained.length >= 2) break;
    }
    for (const e of chained) {
      const eb = { x: e.pos.x, y: e.pos.y + 0.4, z: e.pos.z };
      spawnFlash(eb, tower.type);
      drawBolt(b, eb);
      e.hurt(tower.effDamage() * 0.6);
    }
  }
}
function killShot(p) { p.mesh.destroy({ children: true }); }
function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const p = shots[i];
    if (!p.target || p.target.dead || p.target.arrived) { killShot(p); shots.splice(i, 1); continue; }
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
    if (f.life <= 0) { f.mesh.destroy(); flashes.splice(i, 1); continue; }
    f.mesh.scale.set(f.base * (0.4 + (f.life / 110) * 1.1));
  }
}
function updateBeams(dt) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i]; b.life -= dt * 1000;
    if (b.life <= 0) { b.mesh.destroy(); beams.splice(i, 1); }
    else b.mesh.material.baseColor.a = Math.max(0.15, b.life / 80);
  }
}

function spawnBurst(pos, kind) {
  if (kind === 'leak' || kind === 'spike') { spawnExplosion(pos, kind === 'leak'); return; }
  const mat = unlitMat(0x99ff8c);
  const n = 12, life = 420, base = 0.08, yOff = 0.4;
  for (let i = 0; i < n; i++) {
    const p = Mesh3D.createSphere(mat);
    p.position.set(pos.x, pos.y + yOff, pos.z);
    app.stage.addChild(p);
    const a = (i / n) * Math.PI * 2, sp = 2.5 + Math.random() * 2.5;
    bursts.push({ mesh: p, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 2.5, life, maxLife: life, base, kind: 'spark' });
  }
}
function spawnExplosion(pos, isBase) {
  const sc = isBase ? 1 : 0.55;
  const yBase = isBase ? 1 : 0.4;
  const flashMat = unlitMat(isBase ? 0xff8a4a : 0xffd27a, 0.9);
  const flash = Mesh3D.createSphere(flashMat);
  flash.position.set(pos.x, pos.y + yBase, pos.z);
  app.stage.addChild(flash);
  bursts.push({ mesh: flash, mat: flashMat, vx: 0, vz: 0, vy: 0, life: 180, maxLife: 180, base: 0.55 * sc, kind: 'flash' });

  const fireMat = unlitMat(isBase ? 0xff2d16 : 0xff5a2a);
  const n = isBase ? 14 : 9;
  for (let i = 0; i < n; i++) {
    const p = Mesh3D.createSphere(fireMat);
    p.position.set(pos.x, pos.y + yBase - 0.05, pos.z);
    app.stage.addChild(p);
    const a = (i / n) * Math.PI * 2, sp = (2.8 + Math.random() * 3) * sc;
    bursts.push({ mesh: p, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: (2.5 + Math.random() * 3) * sc, life: 380, maxLife: 380, base: 0.09 * sc, kind: 'spark' });
  }

  const m = isBase ? 9 : 5;
  const spread = isBase ? 0.7 : 0.3;
  for (let i = 0; i < m; i++) {
    const smokeMat = unlitMat(0x3a3a3a, 0.5);
    const p = Mesh3D.createSphere(smokeMat);
    p.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + yBase - 0.1, pos.z + (Math.random() - 0.5) * spread);
    app.stage.addChild(p);
    const life = (1300 + Math.random() * 600) * (isBase ? 1 : 0.8);
    bursts.push({
      mesh: p, mat: smokeMat,
      vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6, vy: (isBase ? 1.5 : 0.9) + Math.random() * 0.6,
      life, maxLife: life, base: (isBase ? 0.22 : 0.14) + Math.random() * 0.08, kind: 'smoke',
    });
  }
}
function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.life -= dt * 1000;
    if (b.life <= 0) { b.mesh.destroy(); bursts.splice(i, 1); continue; }
    const f = b.life / b.maxLife;
    if (b.kind === 'smoke') {
      b.mesh.position.x += b.vx * dt; b.mesh.position.z += b.vz * dt;
      b.vy *= 0.985; b.mesh.position.y += b.vy * dt;
      b.mesh.scale.set(b.base * (1.7 - f * 0.7));
      b.mat.baseColor.a = 0.5 * f;
    } else if (b.kind === 'flash') {
      b.mesh.scale.set(b.base * (0.3 + (1 - f) * 1.5));
      b.mat.baseColor.a = 0.9 * f;
    } else {
      b.mesh.position.x += b.vx * dt; b.mesh.position.z += b.vz * dt;
      b.vy -= 9 * dt; b.mesh.position.y += b.vy * dt;
      b.mesh.scale.set(b.base * (0.4 + f * 0.9));
    }
  }
}
function spawnDrip(pt) {
  const d = Mesh3D.createSphere(unlitMat(0x8fd6ff, 0.75));
  d.scale.set(0.035 + Math.random() * 0.02);
  d.position.set(pt.x + (Math.random() - 0.5) * 0.15, pt.y, pt.z + (Math.random() - 0.5) * 0.15);
  app.stage.addChild(d);
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
    if (d.life <= 0) { d.mesh.destroy(); drips.splice(i, 1); continue; }
    d.vy -= 6 * dt;
    d.mesh.position.y += d.vy * dt;
  }
}
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

async function build() {
  await Promise.all([
    'tile', 'tile-dirt', 'tile-spawn', 'detail-rocks', 'detail-rocks-large', 'tile-tree', 'tile-crystal',
    'tower-square-bottom-a', 'tower-square-middle-a', 'tower-square-top-a', 'tower-square-roof-a',
    'tower-round-bottom-a', 'tower-round-top-a', 'tower-round-roof-a',
    'tower-round-crystals', 'weapon-cannon', 'weapon-turret', 'weapon-ballista',
    'enemy-ufo-a', 'enemy-ufo-b', 'enemy-ufo-c', 'enemy-ufo-d',
  ].map(loadTemplate));
  const tileBB = hsize('tile');
  T = tileBB.w || 1;
  tileTop = tileBB.max.y;

  for (const lane of PATHS) for (const [c, r] of lane)
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) nearPath.add(`${c + dc},${r + dr}`);

  const pathTex = PIXI.Texture.from(makePathTexture());
  pathTex.transform = new TextureTransform();
  const pathMat = unlitMat(0xffffff);
  pathMat.baseColorTexture = pathTex;

  const grassTex = PIXI.Texture.from(makeGrassTexture());
  grassTex.transform = new TextureTransform();
  const grassMat = unlitMat(0xffffff);
  grassMat.baseColorTexture = grassTex;

  const cellType = (c, r) => (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) ? MAP_LAYOUT[r][c] : TILE.EMPTY;
  const BORDER = 4;
  for (let r = -BORDER; r < MAP_ROWS + BORDER; r++) {
    for (let c = -BORDER; c < MAP_COLS + BORDER; c++) {
      if (isWater(c, r)) continue;
      const type = cellType(c, r), bridge = isBridge(c, r);
      if (bridge) continue;
      let name = 'tile', prop = null, tint = null, pathTile = false;
      if (type === TILE.PATH) { name = 'tile-dirt'; pathTile = true; }
      else if (type === TILE.SPAWN) name = 'tile-spawn';
      else if (type === TILE.EMPTY) {
        const k = (((c * 73856093) ^ (r * 19349663)) >>> 0) % 100;
        if (k < 6) { name = 'tile-tree'; tint = new Color(0.24, 0.6, 0.28); }
        else if (k < 9) { name = 'tile-crystal'; }
        else if (k < 15) { prop = 'detail-rocks'; }
      }
      inst(name, gx(c), gz(r), { tint });
      if (prop) inst(prop, gx(c), gz(r), { y: tileTop * 0.5 });
      if (pathTile) {
        const decal = Mesh3D.createPlane(pathMat);
        decal.scale.set(T * 0.98 / 2, 1, T * 0.98 / 2);
        decal.rotationQuaternion.setEulerAngles(0, Math.floor(Math.random() * 4) * 90, 0);
        decal.position.set(gx(c), tileTop + 0.015, gz(r));
        app.stage.addChild(decal);
      } else if (name === 'tile') {
        const decal = Mesh3D.createPlane(grassMat);
        decal.scale.set(T * 0.98 / 2, 1, T * 0.98 / 2);
        decal.rotationQuaternion.setEulerAngles(0, Math.floor(Math.random() * 4) * 90, 0);
        decal.position.set(gx(c), tileTop + 0.015, gz(r));
        app.stage.addChild(decal);
      }
      if (name === 'tile-tree' || name === 'tile-crystal' || prop) blocked.add(`${c},${r}`);
    }
  }

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
    const mat = solidMat(cr, cg, cb);
    const hw = islandRx * r0, hd = islandRz * r0;
    const y = islandTopY - segThickness * (s + 0.5);
    if (s === 0) {
      const leftEdge = islandCx - hw, rightEdge = islandCx + hw;
      const gapL = riverGapCx - riverGapHalf, gapR = riverGapCx + riverGapHalf;
      const leftW = gapL - leftEdge;
      if (leftW > 0) {
        const seg = Mesh3D.createCube(mat);
        seg.scale.set(leftW / 2, segThickness / 2, hd);
        seg.position.set(leftEdge + leftW / 2, y, islandCz);
        pipeline.enableShadows(seg, shadowLight);
        app.stage.addChild(seg);
      }
      const rightW = rightEdge - gapR;
      if (rightW > 0) {
        const seg = Mesh3D.createCube(mat);
        seg.scale.set(rightW / 2, segThickness / 2, hd);
        seg.position.set(gapR + rightW / 2, y, islandCz);
        pipeline.enableShadows(seg, shadowLight);
        app.stage.addChild(seg);
      }
    } else {
      const seg = Mesh3D.createCube(mat);
      seg.scale.set(hw, segThickness / 2, hd);
      seg.position.set(islandCx, y, islandCz);
      pipeline.enableShadows(seg, shadowLight);
      app.stage.addChild(seg);
    }
  }
  const rootMat = solidMat(0.2, 0.15, 0.1);
  const rootCount = 20;
  for (let i = 0; i < rootCount; i++) {
    const rad = Math.random() * 0.75;
    const ang = Math.random() * Math.PI * 2;
    const rx = islandCx + Math.cos(ang) * islandRx * rad;
    const rz = islandCz + Math.sin(ang) * islandRz * rad;
    const surfY = islandApexY + (islandTopY - islandApexY) * rad;
    const len = 0.6 + Math.random() * 1.6;
    const root = Mesh3D.createCylinder(rootMat, { radiusTop: 0.02 + Math.random() * 0.02, radiusBottom: 0.005, height: len, radialSegments: 5 });
    root.position.set(rx, surfY - len / 2, rz);
    root.rotationQuaternion.setEulerAngles((Math.random() - 0.5) * 14, Math.random() * 360, (Math.random() - 0.5) * 14);
    app.stage.addChild(root);
    if (i % 3 === 0) dripPoints.push({ x: rx, z: rz, y: surfY - len });
  }
  const rockCount = 36;
  for (let i = 0; i < rockCount; i++) {
    const a = (i / rockCount) * Math.PI * 2 + Math.random() * 0.15;
    const rx = islandCx + Math.cos(a) * islandRx * (0.97 + Math.random() * 0.05);
    const rz = islandCz + Math.sin(a) * islandRz * (0.97 + Math.random() * 0.05);
    const ry = tileTop - 0.15 - Math.random() * 0.9;
    inst('detail-rocks-large', rx, rz, { y: ry, s: 0.9 + Math.random() * 0.9 });
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

  const riverCx = ((RIVER_COLS[0] + RIVER_COLS[RIVER_COLS.length - 1]) / 2) * T;
  const riverZ = ((MAP_ROWS - 1) / 2) * T;
  const riverHalfW = RIVER_COLS.length * T * 1.03 / 2;
  const riverHalfL = (MAP_ROWS + BORDER * 2) * T / 2;

  const bedMat = solidMat(0.06, 0.16, 0.26);
  const bed = Mesh3D.createPlane(bedMat);
  bed.scale.set(riverHalfW, 1, riverHalfL);
  bed.position.set(riverCx, -T * 0.16, riverZ);
  app.stage.addChild(bed);

  const waterTex = PIXI.Texture.from(makeWaterTexture());
  waterTex.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
  waterTex.transform = new TextureTransform();
  waterTex.transform.scale.set(1.4, 12);
  waterFlowTransform = waterTex.transform;
  const riverMat = new StandardMaterial();
  riverMat.baseColor = new Color(0.55, 0.72, 0.85, 0.82); riverMat.alphaMode = 'blend';
  riverMat.metallic = 0; riverMat.roughness = 0.55;
  riverMat.baseColorTexture = waterTex;
  const river = Mesh3D.createPlane(riverMat);
  river.scale.set(riverHalfW, 1, riverHalfL);
  river.position.set(riverCx, T * 0.05, riverZ);
  pipeline.enableShadows(river, shadowLight);
  app.stage.addChild(river);

  const waterTex2 = PIXI.Texture.from(makeWaterTexture());
  waterTex2.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
  waterTex2.transform = new TextureTransform();
  waterTex2.transform.scale.set(2.2, 8);
  waterFlowTransform2 = waterTex2.transform;
  const riverMat2 = new StandardMaterial();
  riverMat2.baseColor = new Color(0.78, 0.9, 0.97, 0.22); riverMat2.alphaMode = 'blend';
  riverMat2.metallic = 0; riverMat2.roughness = 0.5;
  riverMat2.baseColorTexture = waterTex2;
  const river2 = Mesh3D.createPlane(riverMat2);
  river2.scale.set(riverHalfW, 1, riverHalfL);
  river2.position.set(riverCx, T * 0.08, riverZ);
  app.stage.addChild(river2);

  const woodMat = solidMat(0.55, 0.36, 0.17);
  for (const lane of PATHS) for (const [c, r] of lane) if (RIVER_COLS.includes(c)) {
    const pl = Mesh3D.createCube(woodMat);
    pl.scale.set(T * 1.02 / 2, T * 0.22 / 2, T * 1.02 / 2);
    pl.position.set(gx(c), T * 0.11, gz(r));
    pipeline.enableShadows(pl, shadowLight);
    app.stage.addChild(pl);
  }

  const end = PATHS[0][PATHS[0].length - 1];
  baseWorld = { x: gx(end[0]), y: 0, z: gz(end[1]) };
  buildCastle(baseWorld.x, baseWorld.z);
  caveBeacons = PATHS.map(lane => {
    const [sc0, sr0] = lane[0];
    const x = gx(sc0), z = gz(sr0);
    buildCave(x, z);
    const arrowBaseY = tileTop + 1.05;
    const arrow = Mesh3D.createCylinder(unlitMat(0xffb454, 0.95), { radiusTop: 0.22, radiusBottom: 0.014, height: 0.44, radialSegments: 4 });
    arrow.rotationQuaternion.setEulerAngles(0, 45, 0);
    arrow.position.set(x, arrowBaseY, z);
    arrow.visible = false;
    app.stage.addChild(arrow);
    const ring = Mesh3D.createCircle(unlitMat(0xffb454, 0.5), { radius: 0.42, segments: 28 });
    ring.rotationQuaternion.setEulerAngles(-90, 0, 0);
    ring.position.set(x, tileTop + 0.03, z);
    ring.visible = false;
    app.stage.addChild(ring);
    return { arrow, ring, arrowBaseY };
  });

  const hover = T * 0.45;
  laneWaypoints = PATHS.map(lane => lane.map(([c, r]) => ({ x: gx(c), y: hover, z: gz(r) })));

  groundPlane = Plane.from(new Point3D(0, tileTop, 0), new Point3D(0, 1, 0));

  placementHighlightMat = unlitMat(0x22d3ee, 0.5);
  hoverHighlightMat = unlitMat(0xffffff, 0.7);
  highlightPool = placeableCells.map(({ c, r }) => {
    const h = Mesh3D.createPlane(placementHighlightMat);
    h.scale.set(T * 0.94 / 2, 1, T * 0.94 / 2);
    h.position.set(gx(c), tileTop + 0.03, gz(r));
    h.visible = false;
    app.stage.addChild(h);
    return { mesh: h, c, r };
  });
  trapHighlightPool = trapPlaceableCells.map(({ c, r }) => {
    const h = Mesh3D.createPlane(placementHighlightMat);
    h.scale.set(T * 0.6 / 2, 1, T * 0.6 / 2);
    h.position.set(gx(c), tileTop + 0.03, gz(r));
    h.visible = false;
    app.stage.addChild(h);
    return { mesh: h, c, r };
  });

  rangeDisc = Mesh3D.createCircle(unlitMat(0xff6b1f, 0.3), { radius: 1, segments: 48 });
  rangeDisc.rotationQuaternion.setEulerAngles(-90, 0, 0);
  rangeDisc.visible = false;
  app.stage.addChild(rangeDisc);

  const skyTex = PIXI.Texture.from(makeSkyTexture());
  skyTex.transform = new TextureTransform();
  const skyMat = unlitMat(0xffffff);
  skyMat.baseColorTexture = skyTex;
  skyMat.doubleSided = true;
  const sky = Mesh3D.createSphere(skyMat);
  sky.scale.set(Math.max(MAP_COLS, MAP_ROWS) * T * 6);
  sky.position.set((MAP_COLS / 2) * T, 0, (MAP_ROWS / 2) * T);
  app.stage.addChild(sky);

  control.target = { x: (MAP_COLS / 2) * T, y: 0, z: (MAP_ROWS / 2) * T };
  control.distance = MAP_COLS * T * 1.25;
  minZoom = T * 8;
  maxZoom = Math.max(MAP_COLS, MAP_ROWS) * T * 1.8;

  buildHUD();
  buildIntro();
  updateHUD();
  window.__ready = true;
}

function screenToGroundCell(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left, y = clientY - rect.top;
  const ray = camera.screenToRay(x, y);
  if (!ray) return null;
  const t = groundPlane.rayCast(ray);
  if (!isFinite(t)) return null;
  const p = ray.getPoint(t);
  return { c: w2c(p.x), r: w2r(p.z) };
}
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function pickTowerAtScreen(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left, sy = clientY - rect.top;
  let best = null, bestDist = 46;
  for (const t of towers) {
    const baseS = camera.worldToScreen(gx(t.c), tileTop, gz(t.r));
    const topS = camera.worldToScreen(gx(t.c), t.topY + 1.1, gz(t.r));
    const d = distToSegment(sx, sy, baseS.x, baseS.y, topS.x, topS.y);
    if (d < bestDist) { bestDist = d; best = t; }
  }
  return best;
}
function ghostifyModel(m, alpha) {
  if (!m) return;
  m.meshes.forEach(mesh => { if (mesh.material) { mesh.material.alphaMode = 'blend'; mesh.material.baseColor.a = alpha; } });
  pipeline.disableShadows(m);
}
function disposeGhost() {
  if (!ghost) return;
  ghost.root.destroy({ children: true });
  ghost = null;
}
function buildGhostTower(type) {
  disposeGhost();
  const def = TOWER_TYPES[type];
  const tint = Color.fromHex(def.color);
  const root = new Container3D();
  root.visible = false;
  app.stage.addChild(root);
  let y = 0;
  for (const name of ['tower-square-bottom-a', 'tower-square-middle-a', 'tower-square-top-a']) {
    const bb = hsize(name);
    const m = inst(name, 0, 0, { y: y - bb.min.y, parent: root });
    ghostifyModel(m, 0.5);
    y += bb.h;
  }
  const turret = new Container3D();
  turret.position.set(0, y, 0);
  root.addChild(turret);
  const wname = TOWER_WEAPON[type];
  if (type === 'tesla') {
    buildTeslaCoil(turret, 0.5, false);
  } else {
    const weapon = wname
      ? inst(wname, 0, 0, { s: 0.9, parent: turret })
      : inst('tower-round-crystals', 0, 0, { s: 0.9, tint, parent: turret });
    ghostifyModel(weapon, 0.5);
  }
  const ring = Mesh3D.createCircle(unlitMat(def.color, 0.35), { radius: 0.4, segments: 24 });
  ring.rotationQuaternion.setEulerAngles(-90, 0, 0);
  ring.position.set(0, tileTop + 0.02, 0);
  root.addChild(ring);
  ghost = { type, root, range: (def.range / 26) * T };
}
function clearHover() {
  if (hoveredEntry) { hoveredEntry.mesh.material = placementHighlightMat; hoveredEntry = null; }
  if (ghost) ghost.root.visible = false;
  if (rangeDisc && !sellTarget) rangeDisc.visible = false;
}
canvas.addEventListener('pointermove', (e) => {
  if (state.trapMode) {
    const hit = screenToGroundCell(e.clientX, e.clientY);
    const entry = hit && trapHighlightPool.find(p => p.c === hit.c && p.r === hit.r && !trapBuilt.has(`${p.c},${p.r}`));
    if (!entry) { clearHover(); return; }
    if (hoveredEntry !== entry) {
      if (hoveredEntry) hoveredEntry.mesh.material = placementHighlightMat;
      entry.mesh.material = hoverHighlightMat;
      hoveredEntry = entry;
    }
    if (ghost) ghost.root.visible = false;
    if (rangeDisc && !sellTarget) rangeDisc.visible = false;
    return;
  }
  if (!state.selected) { clearHover(); return; }
  const hit = screenToGroundCell(e.clientX, e.clientY);
  const entry = hit && highlightPool.find(p => p.c === hit.c && p.r === hit.r && !built.has(`${p.c},${p.r}`));
  if (!entry) { clearHover(); return; }
  if (hoveredEntry !== entry) {
    if (hoveredEntry) hoveredEntry.mesh.material = placementHighlightMat;
    entry.mesh.material = hoverHighlightMat;
    hoveredEntry = entry;
  }
  if (!ghost || ghost.type !== state.selected) buildGhostTower(state.selected);
  const x = gx(entry.c), z = gz(entry.r);
  ghost.root.position.set(x, 0, z);
  ghost.root.visible = true;
  if (rangeDisc) {
    rangeDisc.scale.set(ghost.range, ghost.range, 1);
    rangeDisc.position.set(x, tileTop + 0.03, z);
    rangeDisc.visible = true;
  }
});
let downPos = null;
canvas.addEventListener('pointerdown', (e) => { if (e.button === 0) downPos = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || !downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 6) return;
  if (state.trapMode) {
    const hit = screenToGroundCell(e.clientX, e.clientY);
    if (!hit) return;
    if (!isTrapPlaceable(hit.c, hit.r) || state.gold < TRAP_DEF.cost) return;
    state.gold -= TRAP_DEF.cost; trapBuilt.add(`${hit.c},${hit.r}`);
    { const x = gx(hit.c), z = gz(hit.r); traps.push({ mesh: buildTrapVisual(x, z), x, z, cooldown: 0 }); }
    floatCoins({ x: gx(hit.c), y: tileTop + 1, z: gz(hit.r) }, -TRAP_DEF.cost);
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
    const hit = screenToGroundCell(e.clientX, e.clientY);
    if (!hit) return;
    const cost = TOWER_TYPES[state.selected].cost;
    if (!isBuildable(hit.c, hit.r) || state.gold < cost) return;
    state.gold -= cost; built.add(`${hit.c},${hit.r}`);
    towers.push(new Tower(state.selected, hit.c, hit.r));
    floatCoins({ x: gx(hit.c), y: tileTop + 1, z: gz(hit.r) }, -cost);
    sfx.place();
    deselect();
    updateHUD();
  } else {
    const tw = pickTowerAtScreen(e.clientX, e.clientY);
    if (tw) showInfo(tw.def, tw); else hideInfo();
  }
});

function setCaveBeacon(indices) {
  const on = new Set(indices);
  caveBeacons.forEach((b, i) => {
    const show = on.has(i);
    b.arrow.visible = show;
    b.ring.visible = show;
  });
}
function updateCaveBeacons(dt) {
  beaconT += dt;
  const bob = Math.sin(beaconT * 3) * 0.12;
  const pulse = 0.85 + Math.sin(beaconT * 3) * 0.15;
  for (const b of caveBeacons) {
    if (!b.arrow.visible) continue;
    b.arrow.position.y = b.arrowBaseY + bob;
    b.ring.scale.set(pulse);
  }
}

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
  updateTraps(dt);
  for (const e of enemies) e.update(dt);
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { const reward = Math.round(e.def.reward * (e.rewardMult || 1)); state.gold += reward; spawnBurst(e.pos, 'die'); floatCoins({ ...e.pos }, reward); e.dispose(); enemies.splice(i, 1); sfx.die(); updateHUD(); }
    else if (e.arrived) { const dmg = e.def.leak || 1; state.hp = Math.max(0, state.hp - dmg); spawnBurst(baseWorld, 'leak'); e.dispose(); enemies.splice(i, 1); sfx.leak(); updateHUD(); pulseHpDamage(dmg); applyCastleDamage(state.hp / BASE_HP); if (state.hp <= 0) endGame(false); }
  }
}
app.ticker.add(() => {
  control.distance = Math.min(maxZoom, Math.max(minZoom, control.distance));
  const dt = Math.min(app.ticker.deltaMS / 1000, 0.05);
  if (waterFlowTransform) waterFlowTransform.offset.y += dt * 0.06;
  if (waterFlowTransform2) { waterFlowTransform2.offset.x += dt * 0.035; waterFlowTransform2.offset.y -= dt * 0.045; }
  tick(dt);
});

window.__voidrush = {
  app, camera, state, spawner, towers, enemies, tick, isBuildable,
  place: (type, c, r) => { if (isBuildable(c, r)) { towers.push(new Tower(type, c, r)); built.add(`${c},${r}`); } },
};

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
  boss: `<svg width="40" height="40" viewBox="0 0 48 48"><defs><radialGradient id="bossGlow" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#ff6a8f"/><stop offset="60%" stop-color="#ff2e6d" stop-opacity=".45"/><stop offset="100%" stop-color="#ff2e6d" stop-opacity="0"/></radialGradient></defs><circle cx="24" cy="24" r="20" fill="url(#bossGlow)"/><circle cx="24" cy="24" r="10" fill="#1a0c26"/><circle cx="20" cy="22" r="2" fill="#ff3355"/><circle cx="28" cy="22" r="2" fill="#ff3355"/><path d="M24 6 L27 15 L21 15 Z" fill="#ffd54a"/><path d="M10 12 L16 19 L8 20 Z" fill="#ffd54a"/><path d="M38 12 L40 20 L32 19 Z" fill="#ffd54a"/><path d="M8 34 L16 32 L12 40 Z" fill="#ffd54a"/><path d="M40 34 L36 40 L32 32 Z" fill="#ffd54a"/></svg>`,
};

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
    <div style="font-size:clamp(12px,3.5vw,16px);font-weight:700;color:#cdd5df;text-align:center;margin-top:6px;">Defend your castle from alien invaders.</div>
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

  const font = 'font-family:"Baloo 2","Arial Black",Arial,sans-serif;text-shadow:0 2px 4px rgba(0,0,0,.5);letter-spacing:.3px;';
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

  let panOffset = 0;
  const panMax = T * 3;
  const panStep = T * 1;
  const applyPan = () => { control.target.x = (MAP_COLS / 2) * T + panOffset; };
  const makePanBtn = side => el('button', `position:fixed;top:50%;${side}:clamp(6px,2vw,14px);transform:translateY(-50%);width:clamp(34px,8vw,46px);height:clamp(34px,8vw,46px);border-radius:50%;background:rgba(20,16,10,.5);border:2px solid rgba(255,255,255,.4);color:#fff;font-size:clamp(15px,4vw,20px);font-weight:900;cursor:pointer;z-index:9;display:flex;align-items:center;justify-content:center;padding:0;${font}`, side === 'left' ? '◀' : '▶');
  const panLeftBtn = makePanBtn('left');
  const panRightBtn = makePanBtn('right');
  panLeftBtn.onclick = () => { panOffset = Math.max(-panMax, panOffset - panStep); applyPan(); };
  panRightBtn.onclick = () => { panOffset = Math.min(panMax, panOffset + panStep); applyPan(); };
  document.body.appendChild(panLeftBtn);
  document.body.appendChild(panRightBtn);

  const sidePanel = el('div', `position:fixed;top:clamp(78px,17vw,90px);right:clamp(6px,2vw,14px);display:flex;flex-direction:column;align-items:flex-end;gap:clamp(8px,2.5vw,16px);z-index:11;max-width:min(380px,94vw);${font}`);
  sidePanel.className = 'vr-sidepanel';

  hud.hint = isMobile
    ? el('div', `padding:clamp(4px,1.2vw,7px) clamp(4px,1.5vw,8px);color:#bcd4ea;font-size:clamp(9.5px,2.4vw,12px);font-weight:700;display:none;text-align:left;`)
    : el('div', `padding:clamp(8px,2.5vw,12px) clamp(12px,4vw,26px);border-radius:14px;background:rgba(20,30,50,.94);border:clamp(2px,.6vw,3px) solid #60a5fa;color:#dbeafe;font-size:clamp(13px,3.8vw,20px);font-weight:900;display:none;`);
  if (!isMobile) sidePanel.appendChild(hud.hint);

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
    floatCoins({ x: gx(sellTarget.c), y: tileTop + 1, z: gz(sellTarget.r) }, -cost);
    sfx.place(); updateHUD(); showInfo(sellTarget.def, sellTarget);
  };
  hud.powerShotBtn = el('button', `padding:clamp(6px,2vw,10px) clamp(7px,2.5vw,16px);border-radius:12px;background:linear-gradient(160deg,#dc2626,#7f1d1d);border:2px solid #fca5a5;color:#fee2e2;font-size:clamp(10px,2.8vw,15px);font-weight:900;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);display:none;${font}`, 'POWER SHOT');
  hud.powerShotBtn.style.setProperty('--buffGlow', 'rgba(252,165,165,.9)');
  hud.powerShotBtn.onclick = () => {
    if (!sellTarget || sellTarget.powerShot) return;
    const cost = Math.round(sellTarget.def.cost * 0.35);
    if (state.gold < cost) return;
    state.gold -= cost; sellTarget.powerShot = true;
    floatCoins({ x: gx(sellTarget.c), y: tileTop + 1, z: gz(sellTarget.r) }, -cost);
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
  const col = placementHighlightMat.baseColor;
  if (ok) { col.r = 0.13; col.g = 0.83; col.b = 0.93; } else { col.r = 1; col.g = 0.3; col.b = 0.3; }
  for (const p of highlightPool) p.mesh.visible = !built.has(`${p.c},${p.r}`);
}
function hidePlacementHighlights() {
  for (const p of highlightPool) p.mesh.visible = false;
}
function showTrapHighlights() {
  if (!state.trapMode || !placementHighlightMat) return;
  const ok = state.gold >= TRAP_DEF.cost;
  const col = placementHighlightMat.baseColor;
  if (ok) { col.r = 0.13; col.g = 0.83; col.b = 0.93; } else { col.r = 1; col.g = 0.3; col.b = 0.3; }
  for (const p of trapHighlightPool) p.mesh.visible = !trapBuilt.has(`${p.c},${p.r}`);
}
function hideTrapHighlights() {
  for (const p of trapHighlightPool) p.mesh.visible = false;
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
  if (state.selected) { showInfo(TOWER_TYPES[state.selected], null); showPlacementHighlights(); }
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
    lanes = Array.from({ length: spawner.lanes }, (_, i) => i);
    label = `⚔ Incoming from ${lanes.map(i => LANE_NAMES[i] || `Cave ${i + 1}`).join(' & ')}`;
  } else {
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

let sellTarget = null;
function showInfo(def, tower) {
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
  hud.sellBtn.style.display = tower ? '' : 'none';
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
  if (tower && rangeDisc) { rangeDisc.scale.set(tower.range, tower.range, 1); rangeDisc.position.set(gx(tower.c), tileTop + 0.03, gz(tower.r)); rangeDisc.visible = true; }
  else if (rangeDisc) rangeDisc.visible = false;
}
function hideInfo() {
  sellTarget = null;
  if (hud.info) {
    if (isMobile) hud.info.style.display = 'none';
    hud.info.style.opacity = '0';
    hud.info.style.transform = 'translateY(10px) scale(.96)';
    hud.info.style.pointerEvents = 'none';
  }
  if (rangeDisc) rangeDisc.visible = false;
}
function sellTower() {
  if (!sellTarget) return;
  const refund = Math.floor(sellTarget.totalInvested * 0.6);
  state.gold += refund;
  floatCoins({ x: gx(sellTarget.c), y: tileTop + 1, z: gz(sellTarget.r) }, refund);
  built.delete(`${sellTarget.c},${sellTarget.r}`);
  sellTarget.dispose();
  const i = towers.indexOf(sellTarget); if (i >= 0) towers.splice(i, 1);
  sfx.place();
  hideInfo(); updateHUD();
}

function screenOf(world) {
  const p = camera.worldToScreen(world.x, world.y, world.z);
  return { x: p.x, y: p.y };
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

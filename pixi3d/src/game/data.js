
export const TILE = { EMPTY: 0, PATH: 1, BASE: 2, SPAWN: 3 };

export const MAP_COLS   = 20;
export const MAP_ROWS   = 16;
export const RIVER_COLS = [9, 10];

const PATH_CORNERS = [
  [[0, 3],  [4, 3],  [4, 6],  [8, 6],  [8, 2],  [14, 2], [14, 6], [19, 6], [19, 8]],
  [[0, 8],  [5, 8],  [5, 11], [11, 11],[11, 8], [16, 8], [19, 8]],
  [[0, 13], [6, 13], [6, 9],  [12, 9], [12, 13],[17, 13],[17, 8], [19, 8]],
];

function expand(corners) {
  const cells = [];
  for (let i = 0; i < corners.length - 1; i++) {
    let [c, r] = corners[i];
    const [c1, r1] = corners[i + 1];
    const dc = Math.sign(c1 - c), dr = Math.sign(r1 - r);
    if (i === 0) cells.push([c, r]);
    while (c !== c1 || r !== r1) {
      if (c !== c1) c += dc; else r += dr;
      cells.push([c, r]);
    }
  }
  return cells;
}

export const PATHS = PATH_CORNERS.map(expand);

export const MAP_LAYOUT = (() => {
  const g = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(TILE.EMPTY));
  for (const path of PATHS) for (const [c, r] of path) if (g[r]?.[c] !== undefined) g[r][c] = TILE.PATH;
  for (const path of PATHS) { const [sc, sr] = path[0]; g[sr][sc] = TILE.SPAWN; }
  const end = PATHS[0][PATHS[0].length - 1];
  g[end[1]][end[0]] = TILE.BASE;
  return g;
})();

const pathKey = new Set();
for (const p of PATHS) for (const [c, r] of p) pathKey.add(`${c},${r}`);
const bridgeCells = new Set();
const waterCells  = new Set();
for (const c of RIVER_COLS) {
  for (let r = -12; r < MAP_ROWS + 12; r++) {
    const key = `${c},${r}`;
    if (pathKey.has(key)) bridgeCells.add(key);
    else waterCells.add(key);
  }
}
export const isWater  = (c, r) => waterCells.has(`${c},${r}`);
export const isBridge = (c, r) => bridgeCells.has(`${c},${r}`);

export const TOWER_TYPES = {
  laser:  { name: 'Laser',  color: 0x00d4ff, cost: 85,  damage: 15, range: 120, fireRate: 400 },
  cannon: { name: 'Cannon', color: 0xff6b35, cost: 130, damage: 60, range: 100, fireRate: 1400 },
  frost:  { name: 'Frost',  color: 0x7dd3fc, cost: 65,  damage: 0,  range: 110, fireRate: 800, slow: 0.45 },
  tesla:  { name: 'Tesla',  color: 0xc084fc, cost: 165, damage: 25, range: 130, fireRate: 900 },
};

export const ENEMY_TYPES = {
  drone:  { name: 'Drone',  hp: 60,  speed: 80, reward: 9,  size: 14, leak: 1, blurb: 'Fast & fragile — quick and low HP. Comes in large swarms.' },
  tank:   { name: 'Tank',   hp: 340, speed: 35, reward: 26, size: 20, leak: 6, blurb: 'Heavily armored — very high HP, slow-moving. Needs sustained damage.' },
  ghost:  { name: 'Ghost',  hp: 135, speed: 70, reward: 18, size: 14, leak: 2, blurb: 'Elusive phantom — moderate HP, fast and hard to pin down.' },
  bomber: { name: 'Bomber', hp: 120, speed: 55, reward: 21, size: 16, leak: 4, blurb: 'Heavy payload — deals major damage to your base if it gets through.' },
  boss:   { name: 'Overlord', hp: 500, speed: 30, reward: 150, size: 30, leak: 20, blurb: 'Massive overlord — huge HP pool, periodically shields itself from all damage, and enrages (moves much faster) below 15% HP.' },
};

export const WAVES = [
  { lanes: 1, speed: 0.9,  enemies: [{ type: 'drone', count: 6,  interval: 900 }] },
  { lanes: 1, speed: 1.0,  enemies: [{ type: 'drone', count: 12, interval: 700 }] },
  { lanes: 1, speed: 1.1,  enemies: [{ type: 'drone', count: 16, interval: 550 }, { type: 'tank', count: 2, interval: 2800 }] },
  { lanes: 1, speed: 1.15, enemies: [{ type: 'boss', count: 1, interval: 0, hpMult: 4 }] },
  { lanes: 2, speed: 1.15, enemies: [{ type: 'drone', count: 20, interval: 450 }, { type: 'ghost', count: 6, interval: 1200 }] },
  { lanes: 2, speed: 1.22, enemies: [{ type: 'drone', count: 26, interval: 380 }, { type: 'ghost', count: 10, interval: 850 }, { type: 'tank', count: 6, interval: 1800 }] },
  { lanes: 2, speed: 1.28, enemies: [{ type: 'ghost', count: 16, interval: 600 }, { type: 'tank', count: 11, interval: 1100 }] },
  { lanes: 2, speed: 1.32, enemies: [{ type: 'boss', count: 2, interval: 0, hpMult: 6.5 }] },
  { lanes: 3, speed: 1.32, enemies: [{ type: 'drone', count: 30, interval: 270 }, { type: 'ghost', count: 16, interval: 600 }, { type: 'tank', count: 9, interval: 1400 }] },
  { lanes: 3, speed: 1.4,  enemies: [{ type: 'tank', count: 17, interval: 850 }, { type: 'bomber', count: 11, interval: 1400 }] },
  { lanes: 3, speed: 1.5,  enemies: [{ type: 'ghost', count: 25, interval: 400 }, { type: 'tank', count: 15, interval: 850 }, { type: 'drone', count: 30, interval: 220 }] },
  { lanes: 3, speed: 1.62, enemies: [{ type: 'boss', count: 3, interval: 0, hpMult: 9 }] },
];

export const BASE_HP    = 100;
export const START_GOLD = 160;

export const LEVEL_DMG_MULT = [1, 1.5, 2.2];
export const RANGE_MULT = [1, 1.12, 1.22];
export const TRAP_DEF = { cost: 55, damage: 35, radius: 0.5, cooldown: 1400 };

export const DIFFICULTIES = {
  easy:   { name: 'Easy',   blurb: 'More gold, slower waves',        goldMult: 1.3, speedMult: 0.85, hpMult: 0.85 },
  normal: { name: 'Normal', blurb: 'Balanced',                       goldMult: 1,   speedMult: 1,    hpMult: 1 },
  hard:   { name: 'Hard',   blurb: 'Less gold, faster & tougher',    goldMult: 0.8, speedMult: 1.15, hpMult: 1.25 },
};

export const TOWER_BRANCHES = {
  laser:  { a: { name: 'Piercing Beam',   desc: 'Beam pierces every enemy in its path' },
            b: { name: 'Rapid Beam',      desc: '+40% fire rate' } },
  cannon: { a: { name: 'Siege Shell',     desc: '+70% damage' },
            b: { name: 'Cluster Shot',    desc: 'Splash damage to nearby enemies on impact' } },
  frost:  { a: { name: 'Deep Freeze',     desc: 'Near-total slow on target' },
            b: { name: 'Frost Nova',      desc: 'Slows enemies near the target too' } },
  tesla:  { a: { name: 'Overcharge Arc',  desc: '+80% damage' },
            b: { name: 'Chain Lightning', desc: 'Bolt jumps to 2 nearby enemies' } },
};

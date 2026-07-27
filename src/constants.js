export const TILE = {
  EMPTY: 0,
  PATH:  1,
  BASE:  2,
  SPAWN: 3,
};

export const MAP_LAYOUT = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [3,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,2],
];

export const MAP_COLS = MAP_LAYOUT[0].length; // 20
export const MAP_ROWS = MAP_LAYOUT.length;    // 12

// compute tile size to fill screen edge to edge
const TOP_H    = 64;
const BOTTOM_H = 130;

export function calcTileSize() {
  const availW = window.innerWidth;
  const availH = window.innerHeight - TOP_H - BOTTOM_H;
  const byW    = Math.floor(availW  / MAP_COLS);
  const byH    = Math.floor(availH  / MAP_ROWS);
  // use the smaller so both axes fit — no gaps, no overflow
  return Math.max(40, Math.min(byW, byH));
}

// these are recalculated at runtime in MapScene
export let TILE_SIZE    = 64;
export let MAP_PIXEL_W  = MAP_COLS * TILE_SIZE;
export let MAP_PIXEL_H  = MAP_ROWS * TILE_SIZE;

export function updateTileSize() {
  // size purely by width so map always fills full width
  const availW = window.innerWidth;
  TILE_SIZE    = Math.floor(availW / MAP_COLS);
  MAP_PIXEL_W  = MAP_COLS * TILE_SIZE;
  MAP_PIXEL_H  = MAP_ROWS * TILE_SIZE;
}

// ── towers ─────────────────────────────────────────────────────
export const TOWER_TYPES = {
  laser:  { name: 'Laser',  color: 0x00d4ff, cost: 80,  damage: 15, range: 120, fireRate: 400,  pierce: true },
  cannon: { name: 'Cannon', color: 0xff6b35, cost: 120, damage: 60, range: 100, fireRate: 1400, splash: 50   },
  frost:  { name: 'Frost',  color: 0x7dd3fc, cost: 60,  damage: 0,  range: 110, fireRate: 800,  slow: 0.45   },
  tesla:  { name: 'Tesla',  color: 0xc084fc, cost: 150, damage: 25, range: 130, fireRate: 900,  chain: 4     },
};

// ── enemies ────────────────────────────────────────────────────
export const ENEMY_TYPES = {
  drone:  { name: 'Drone',  color: 0xff4444, hp: 60,  speed: 80, reward: 10, size: 14 },
  tank:   { name: 'Tank',   color: 0x888888, hp: 300, speed: 35, reward: 30, size: 20 },
  ghost:  { name: 'Ghost',  color: 0xaaaaff, hp: 120, speed: 70, reward: 20, size: 14, phaseImmune: true },
  bomber: { name: 'Bomber', color: 0xff8800, hp: 100, speed: 55, reward: 25, size: 16, deathSplash: 80   },
};

// ── waves ──────────────────────────────────────────────────────
export const WAVES = [
  { enemies: [{ type:'drone',  count:8,  interval:800  }] },
  { enemies: [{ type:'drone',  count:12, interval:600  }, { type:'tank',   count:2, interval:3000 }] },
  { enemies: [{ type:'drone',  count:10, interval:500  }, { type:'ghost',  count:4, interval:1500 }] },
  { enemies: [{ type:'tank',   count:5,  interval:2000 }, { type:'ghost',  count:6, interval:1000 }] },
  { enemies: [{ type:'drone',  count:20, interval:300  }, { type:'bomber', count:3, interval:4000 },
              { type:'tank',   count:4,  interval:2000 }] },
];

// ── game ───────────────────────────────────────────────────────
export const BASE_HP        = 20;
export const START_GOLD     = 200;
export const BOMB_SPAWN_CHANCE = 0;
export const BOMB_RADIUS    = 1;
export const SCORE_BOMB     = 0;

export const SWAP_DURATION  = 180;
export const FALL_DURATION  = 220;
export const FLASH_DURATION = 300;
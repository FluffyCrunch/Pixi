export const GRID_COLS = 8;
export const GRID_ROWS = 8;
export const GEM_TYPES = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

export const GEM_COLOURS = {
  red:    0xe74c3c,
  blue:   0x3498db,
  green:  0x2ecc71,
  yellow: 0xf1c40f,
  purple: 0x9b59b6,
  orange: 0xf97316, 
};;

export const GAME_TIME    = 60;

export const SCORE_MATCH3 = 100;
export const SCORE_MATCH4 = 250;
export const SCORE_MATCH5 = 500;
export const SCORE_BOMB   = 400;

export const SWAP_DURATION  = 180;
export const FALL_DURATION  = 220;
export const FLASH_DURATION = 300;

export const BOMB_SPAWN_CHANCE = 0.04;
export const BOMB_RADIUS       = 1;

// responsive cell size — fits grid within 92% of the smaller screen dimension
export function calcCellSize() {
  const minDim    = Math.min(window.innerWidth, window.innerHeight);
  const available = minDim * 0.88;
  const size      = Math.floor(available / GRID_COLS);
  // clamp between 44px (small phone) and 80px (desktop)
  return Math.max(44, Math.min(80, size));
}

export function getGridDimensions() {
  const cell = calcCellSize();
  return {
    CELL_SIZE:    cell,
    GRID_PIXEL_W: GRID_COLS * cell,
    GRID_PIXEL_H: GRID_ROWS * cell,
  };
}
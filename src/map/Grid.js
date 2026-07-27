import { MAP_LAYOUT, MAP_COLS, MAP_ROWS,
         TILE, TILE_SIZE } from '../constants.js';

export class Grid {
  constructor() {
    // track what's on each tile
    // null = empty buildable, 'tower' = occupied
    this.state = Array.from(
      { length: MAP_ROWS },
      (_, row) => Array.from(
        { length: MAP_COLS },
        (_, col) => ({
          type:  MAP_LAYOUT[row][col],
          tower: null,
        })
      )
    );
  }

  // can we build on this tile?
  isBuildable(col, row) {
    if (col < 0 || col >= MAP_COLS) return false;
    if (row < 0 || row >= MAP_ROWS) return false;
    const cell = this.state[row][col];
    return cell.type === TILE.EMPTY && cell.tower === null;
  }

  // place a tower reference on a tile
  placeTower(col, row, tower) {
    this.state[row][col].tower = tower;
  }

  // remove tower from tile
  removeTower(col, row) {
    this.state[row][col].tower = null;
  }

  // convert screen position to tile col/row
  screenToTile(screenX, screenY, offsetX, offsetY) {
    const col = Math.floor((screenX - offsetX) / TILE_SIZE);
    const row = Math.floor((screenY - offsetY) / TILE_SIZE);
    return { col, row };
  }

  // convert tile to world pixel centre
  tileToWorld(col, row, offsetX, offsetY) {
    return {
      x: offsetX + col * TILE_SIZE + TILE_SIZE / 2,
      y: offsetY + row * TILE_SIZE + TILE_SIZE / 2,
    };
  }
}
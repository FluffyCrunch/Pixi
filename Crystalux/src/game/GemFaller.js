import { GRID_COLS, GRID_ROWS } from '../constants.js';

export class GemFaller {
  constructor(grid, tween) {
    this.grid  = grid;
    this.tween = tween;
  }

  async applyGravity() {
    const CELL_SIZE = this.grid.CELL_SIZE;
    const promises  = [];

    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = GRID_ROWS - 1; row >= 0; row--) {
        if (this.grid.cells[col][row] !== null) continue;
        for (let above = row - 1; above >= 0; above--) {
          const gem = this.grid.cells[col][above];
          if (!gem) continue;
          this.grid.cells[col][row]   = gem;
          this.grid.cells[col][above] = null;
          gem.col = col;
          gem.row = row;
          promises.push(
            this.tween.to(gem, { y: row * CELL_SIZE }, 220)
          );
          break;
        }
      }
    }

    await Promise.all(promises);
  }

  async spawnNew() {
    const CELL_SIZE = this.grid.CELL_SIZE;
    const GEM_TYPES = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
    const promises  = [];

    for (let col = 0; col < GRID_COLS; col++) {
      let spawnOffset = 0;
      for (let row = 0; row < GRID_ROWS; row++) {
        if (this.grid.cells[col][row] !== null) continue;
        spawnOffset++;
        const type = GEM_TYPES[
          Math.floor(Math.random() * GEM_TYPES.length)
        ];
        const gem  = this.grid._spawnGem(col, row, type);
        gem.y      = -spawnOffset * CELL_SIZE;
        promises.push(
          this.tween.to(gem, { y: row * CELL_SIZE }, 220)
        );
      }
    }

    await Promise.all(promises);
  }
}
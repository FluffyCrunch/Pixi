import { Container } from 'pixi.js';
import { GRID_COLS, GRID_ROWS, GEM_TYPES,
         BOMB_SPAWN_CHANCE,
         getGridDimensions } from '../constants.js';
import { Gem } from './Gem.js';

export class Grid {
  constructor(app) {
    this.app       = app;
    this.container = new Container();

    // calculate responsive dimensions
    const { CELL_SIZE, GRID_PIXEL_W, GRID_PIXEL_H } = getGridDimensions();
    this.CELL_SIZE    = CELL_SIZE;
    this.GRID_PIXEL_W = GRID_PIXEL_W;
    this.GRID_PIXEL_H = GRID_PIXEL_H;

    this.cells = Array.from(
      { length: GRID_COLS },
      () => new Array(GRID_ROWS).fill(null)
    );

    this.container.x = (app.screen.width  - GRID_PIXEL_W) / 2;
    this.container.y = (app.screen.height - GRID_PIXEL_H) / 2;

    this._populate();
  }

  _populate() {
    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        this._spawnGem(col, row);
      }
    }
  }

  _randomType(col, row) {
    let type;
    for (let i = 0; i < 20; i++) {
      type = GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)];
      const left  = this.cells[col - 1]?.[row]?.type;
      const left2 = this.cells[col - 2]?.[row]?.type;
      if (left === type && left2 === type) continue;
      const up  = this.cells[col]?.[row - 1]?.type;
      const up2 = this.cells[col]?.[row - 2]?.type;
      if (up === type && up2 === type) continue;
      break;
    }
    return type;
  }

  _spawnGem(col, row, type = null, forceBomb = false) {
    const isBomb = forceBomb ||
      (type !== null && Math.random() < BOMB_SPAWN_CHANCE);

    const gem = new Gem(
      type ?? this._randomType(col, row),
      isBomb,
      this.CELL_SIZE   // pass cell size into gem
    );
    gem.col = col;
    gem.row = row;
    gem.x   = col * this.CELL_SIZE;
    gem.y   = row * this.CELL_SIZE;

    this.cells[col][row] = gem;
    this.container.addChild(gem);
    return gem;
  }

  cellToPixel(col, row) {
    return {
      x: col * this.CELL_SIZE,
      y: row * this.CELL_SIZE,
    };
  }

  getGem(col, row) {
    return this.cells[col]?.[row] ?? null;
  }

  removeGem(col, row) {
    const gem = this.cells[col][row];
    if (!gem) return;
    this.container.removeChild(gem);
    this.cells[col][row] = null;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
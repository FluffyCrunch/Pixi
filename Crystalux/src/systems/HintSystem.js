import { GRID_COLS, GRID_ROWS } from '../constants.js';

export class HintSystem {
  constructor(grid, solver, gridOffsetX, gridOffsetY) {
    this.grid       = grid;
    this.solver     = solver;
    this.offsetX    = gridOffsetX;
    this.offsetY    = gridOffsetY;

    this._idleTime  = 0;
    this._threshold = 5000;
    this._hintGems  = [];
    this._active    = false;
    this._pulseTime = 0;
  }

  update(ticker, isIdle) {
    if (!isIdle) {
      this._idleTime = 0;
      this._clear();
      return;
    }

    this._idleTime += ticker.deltaMS;

    if (this._idleTime < this._threshold) {
      this._clear();
      return;
    }

    if (!this._active) {
      this._findAndShow();
    }

    if (this._active) {
      this._pulseTime += ticker.deltaMS / 1000;
      const alpha = 0.4 + 0.5 * Math.abs(Math.sin(this._pulseTime * 3));
      for (const gem of this._hintGems) {
        if (gem && !gem.destroyed) {
          gem._hintRing.alpha = alpha;
        }
      }
    }
  }

  resetIdle() {
    this._idleTime = 0;
    this._clear();
  }

  _findAndShow() {
    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        if (col + 1 < GRID_COLS) {
          if (this.solver.wouldMatch(
            this.grid.cells, col, row, col + 1, row
          )) {
            this._highlight(col, row, col + 1, row);
            return;
          }
        }
        if (row + 1 < GRID_ROWS) {
          if (this.solver.wouldMatch(
            this.grid.cells, col, row, col, row + 1
          )) {
            this._highlight(col, row, col, row + 1);
            return;
          }
        }
      }
    }
  }

  _highlight(colA, rowA, colB, rowB) {
    this._clear();

    const gemA = this.grid.getGem(colA, rowA);
    const gemB = this.grid.getGem(colB, rowB);

    if (!gemA || !gemB) return;

    for (const gem of [gemA, gemB]) {
      gem.showHint(true);
      this._hintGems.push(gem);
    }

    this._active    = true;
    this._pulseTime = 0;
  }

  _clear() {
    for (const gem of this._hintGems) {
      if (gem && !gem.destroyed) gem.showHint(false);
    }
    this._hintGems = [];
    this._active   = false;
  }
}
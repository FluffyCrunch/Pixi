import { TOWER_TYPES } from '../constants.js';
import * as constants from '../constants.js';
import { Tower } from '../entities/Tower.js';

export class TowerSystem {
  constructor(entityLayer, grid, mapX, mapY) {
    this.layer  = entityLayer;
    this.grid   = grid;
    this.mapX   = mapX;
    this.mapY   = mapY;
    this.towers = [];
    this.onFire = null;
  }

  placeTower(type, col, row) {
    if (!this.grid.isBuildable(col, row)) return false;
    const TS    = constants.TILE_SIZE;
    const tower = new Tower(type, col, row);
    tower.x     = this.mapX + col * TS + TS / 2;
    tower.y     = this.mapY + row * TS + TS / 2;
    this.grid.placeTower(col, row, tower);
    this.towers.push(tower);
    this.layer.addChild(tower);
    return true;
  }

  update(ticker, enemies) {
    for (const tower of this.towers) {
      tower.update(ticker);
      if (!tower.isReady() || enemies.length === 0) continue;
      const target = this._findTarget(tower, enemies);
      if (!target) { tower.target = null; continue; }
      tower.target = target;
      tower.aimAt(target.x, target.y);
      tower.resetCooldown();
      if (this.onFire) this.onFire(tower, target, enemies);
    }
  }

  _findTarget(tower, enemies) {
    let nearest = null, nearestD = Infinity;
    for (const e of enemies) {
      if (e.isDead() || e.hasArrived()) continue;
      const d = Math.hypot(e.x - tower.x, e.y - tower.y);
      if (d <= tower.def.range && d < nearestD) { nearestD = d; nearest = e; }
    }
    return nearest;
  }

  getTowers()  { return this.towers; }
  destroy() {
    for (const t of this.towers) this.layer.removeChild(t);
    this.towers = [];
  }
}
import { MAP_LAYOUT, MAP_COLS, MAP_ROWS,
         TILE, TILE_SIZE } from '../constants.js';

export class PathFinder {
  constructor() {
    this.waypoints = []; // array of { x, y } world positions
    this._extract();
  }

  _extract() {
    // find spawn point
    let startCol = 0, startRow = 0;
    outer:
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        if (MAP_LAYOUT[row][col] === TILE.SPAWN) {
          startCol = col;
          startRow = row;
          break outer;
        }
      }
    }

    // walk the path in order using BFS
    const visited = new Set();
    let col = startCol;
    let row = startRow;

    while (true) {
      visited.add(`${col},${row}`);
      this.waypoints.push(this._toWorld(col, row));

      const tile = MAP_LAYOUT[row]?.[col];
      if (tile === TILE.BASE) break;

      // check 4 neighbours — pick the unvisited path/base tile
      const neighbours = [
        { col: col + 1, row },
        { col: col - 1, row },
        { col, row: row + 1 },
        { col, row: row - 1 },
      ];

      let moved = false;
      for (const n of neighbours) {
        if (n.col < 0 || n.col >= MAP_COLS) continue;
        if (n.row < 0 || n.row >= MAP_ROWS) continue;
        if (visited.has(`${n.col},${n.row}`)) continue;

        const t = MAP_LAYOUT[n.row]?.[n.col];
        if (t === TILE.PATH || t === TILE.BASE) {
          col   = n.col;
          row   = n.row;
          moved = true;
          break;
        }
      }

      if (!moved) break;
    }
  }

  // convert tile col/row to world pixel centre
  _toWorld(col, row) {
    return {
      x: col * TILE_SIZE + TILE_SIZE / 2,
      y: row * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  getWaypoints() {
    return this.waypoints;
  }
}
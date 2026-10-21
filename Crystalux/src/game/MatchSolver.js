import { GRID_COLS, GRID_ROWS, BOMB_RADIUS } from '../constants.js';

export class MatchSolver {
  findMatches(grid) {
    const matched = new Set();

    // horizontal
    for (let row = 0; row < GRID_ROWS; row++) {
      let runStart = 0;
      let runType  = grid[0]?.[row]?.type;

      for (let col = 1; col <= GRID_COLS; col++) {
        const type = grid[col]?.[row]?.type;
        if (type === runType && col < GRID_COLS) continue;

        const runLen = col - runStart;
        if (runLen >= 3) {
          for (let k = runStart; k < col; k++) {
            matched.add(`${k},${row}`);
          }
        }
        runStart = col;
        runType  = type;
      }
    }

    // vertical
    for (let col = 0; col < GRID_COLS; col++) {
      let runStart = 0;
      let runType  = grid[col]?.[0]?.type;

      for (let row = 1; row <= GRID_ROWS; row++) {
        const type = grid[col]?.[row]?.type;
        if (type === runType && row < GRID_ROWS) continue;

        const runLen = row - runStart;
        if (runLen >= 3) {
          for (let k = runStart; k < row; k++) {
            matched.add(`${col},${k}`);
          }
        }
        runStart = row;
        runType  = type;
      }
    }

    // expand matches for any bombs in the matched set
    const extra = new Set();
    for (const key of matched) {
      const [col, row] = key.split(',').map(Number);
      const gem        = grid[col]?.[row];
      if (!gem?.isBomb) continue;

      // add all cells in bomb radius
      for (let dc = -BOMB_RADIUS; dc <= BOMB_RADIUS; dc++) {
        for (let dr = -BOMB_RADIUS; dr <= BOMB_RADIUS; dr++) {
          const nc = col + dc;
          const nr = row + dr;
          if (nc >= 0 && nc < GRID_COLS &&
              nr >= 0 && nr < GRID_ROWS) {
            extra.add(`${nc},${nr}`);
          }
        }
      }
    }

    for (const key of extra) matched.add(key);

    return [...matched].map(key => {
      const [col, row] = key.split(',').map(Number);
      return { col, row };
    });
  }

  // check if swapping would create a match
  wouldMatch(grid, colA, rowA, colB, rowB) {
    const temp        = grid[colA][rowA];
    grid[colA][rowA]  = grid[colB][rowB];
    grid[colB][rowB]  = temp;

    const matches = this.findMatches(grid);

    grid[colB][rowB]  = grid[colA][rowA];
    grid[colA][rowA]  = temp;

    return matches.length > 0;
  }

  // check if any bombs are in the match list
  hasBomb(grid, matches) {
    return matches.some(({ col, row }) => grid[col]?.[row]?.isBomb);
  }
}
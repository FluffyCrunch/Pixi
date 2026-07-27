import { Container, Sprite, Assets, Graphics } from 'pixi.js';
import * as C from '../constants.js';
import { MAP_LAYOUT, MAP_COLS, MAP_ROWS,
         TILE, TILE_SIZE } from '../constants.js';

const TILE_SPRITES = {
  [TILE.EMPTY]: 'tile-grass',
  [TILE.PATH]:  'tile-dirt',
  [TILE.BASE]:  'tile-end',
  [TILE.SPAWN]: 'tile-spawn',
};

export class TileRenderer {
  constructor() {
    this.container = new Container();
    this._built    = false;
  }

  build() {
    if (this._built) return;
    this._built = true;

    const TS        = C.TILE_SIZE; // read once after updateTileSize() has run
    const baseLayer = new Container();
    const decoLayer = new Container();

    for (let row = 0; row < C.MAP_ROWS; row++) {
      for (let col = 0; col < C.MAP_COLS; col++) {
        const type    = C.MAP_LAYOUT[row][col];
        const alias   = TILE_SPRITES[type] ?? 'tile-grass';
        const texture = Assets.get(alias);
        const x       = col * TS;
        const y       = row * TS;

        if (texture) {
          const spr    = new Sprite(texture);
          spr.width    = TS;
          spr.height   = TS;
          spr.x        = x;
          spr.y        = y;
          baseLayer.addChild(spr);
        } else {
          const g = new Graphics();
          const colors = {
            [C.TILE.EMPTY]: 0x5a9e3a,
            [C.TILE.PATH]:  0xc8854a,
            [C.TILE.BASE]:  0x8899aa,
            [C.TILE.SPAWN]: 0x3a2a1a,
          };
          g.rect(x, y, TS, TS).fill({ color: colors[type] ?? 0x5a9e3a });
          baseLayer.addChild(g);
        }

        // decorations on grass
        if (type === C.TILE.EMPTY && Math.random() < 0.05) {
          const da = Math.random() < 0.6 ? 'tile-tree' : 'tile-rock';
          const dt = Assets.get(da);
          if (dt) {
            const d    = new Sprite(dt);
            d.width    = TS * 0.75;
            d.height   = TS * 0.75;
            d.x        = x + TS * 0.125;
            d.y        = y + TS * 0.125;
            decoLayer.addChild(d);
          }
        }
      }
    }

    // subtle grid lines
    const grid = new Graphics();
    for (let col = 0; col <= C.MAP_COLS; col++) {
      grid.moveTo(col * TS, 0)
          .lineTo(col * TS, C.MAP_ROWS * TS)
          .stroke({ width: 0.5, color: 0x000000, alpha: 0.12 });
    }
    for (let row = 0; row <= C.MAP_ROWS; row++) {
      grid.moveTo(0, row * TS)
          .lineTo(C.MAP_COLS * TS, row * TS)
          .stroke({ width: 0.5, color: 0x000000, alpha: 0.12 });
    }

    this.container.addChild(baseLayer);
    this.container.addChild(decoLayer);
    this.container.addChild(grid);
    baseLayer.cacheAsTexture(true);
  }

  update() {} // no animation needed

  destroy() {
    this.container.destroy({ children: true });
  }
}
import { Container, Graphics } from 'pixi.js';

const GEM_COLOURS = {
  red:    0xe74c3c,
  blue:   0x3498db,
  green:  0x2ecc71,
  yellow: 0xf1c40f,
  purple: 0x9b59b6,
  orange: 0xf97316,
};

const GEM_GLOW = {
  red:    0xff8a80,
  blue:   0x82b1ff,
  green:  0x69f0ae,
  yellow: 0xffff8d,
  purple: 0xea80fc,
  orange: 0xfed7aa,
};

export class Gem extends Container {
  constructor(type, isBomb = false, cellSize = 72) {
    super();
    this.type     = type;
    this.isBomb   = isBomb;
    this.cellSize = cellSize;
    this.col      = 0;
    this.row      = 0;
    this.selected = false;
    this._fuseT   = 0;
    this._build();
  }

  _build() {
    const CELL_SIZE = this.cellSize;
    const PAD       = Math.floor(CELL_SIZE * 0.08);
    const size      = CELL_SIZE - PAD * 2;
    const colour    = this.isBomb ? 0x0d0d1a : GEM_COLOURS[this.type];
    const glow      = this.isBomb ? 0xff4500 : GEM_GLOW[this.type];

    // glow halo
    this._glow = new Graphics();
    this._glow
      .roundRect(-4, -4, size + PAD * 2 + 8, size + PAD * 2 + 8, 18)
      .fill({ color: glow, alpha: 0.35 });
    this._glow.x       = PAD - 4;
    this._glow.y       = PAD - 4;
    this._glow.visible = false;
    this.addChild(this._glow);

    this._body = new Graphics();

    if (this.isBomb) {
      const cx = size / 2;
      const cy = size / 2;

      // outer dark shell with red border
      this._body
        .roundRect(0, 0, size, size, 14)
        .fill({ color: 0x0d0d1a, alpha: 1 })
        .stroke({ width: 2.5, color: 0xff4500, alpha: 1 });

      // outer glow ring
      this._body
        .circle(cx, cy, size * 0.38)
        .fill({ color: 0xff4500, alpha: 0.08 });

      // crack lines radiating from centre
      const crackAngles = [
        0, 0.7, 1.4, 2.2, 3.0, 3.8, 4.7, 5.5
      ];
      for (const angle of crackAngles) {
        const len  = size * (0.18 + Math.random() * 0.14);
        const x1   = cx + Math.cos(angle) * size * 0.12;
        const y1   = cy + Math.sin(angle) * size * 0.12;
        const x2   = cx + Math.cos(angle) * len;
        const y2   = cy + Math.sin(angle) * len;
        this._body
          .moveTo(x1, y1)
          .lineTo(x2, y2)
          .stroke({ width: 1, color: 0xff4500, alpha: 0.6 });
      }

      // mid ring
      this._body
        .circle(cx, cy, size * 0.22)
        .fill({ color: 0xff4500, alpha: 0.12 })
        .stroke({ width: 1, color: 0xff4500, alpha: 0.5 });

      // bright pulsing core
      this._body
        .circle(cx, cy, size * 0.13)
        .fill({ color: 0xff6b35, alpha: 0.95 });

      // hot white centre
      this._body
        .circle(cx, cy, size * 0.06)
        .fill({ color: 0xffffff, alpha: 0.9 });

      // BOMB label at bottom
      // (skip text — use a simple X mark instead)
      this._body
        .moveTo(cx - size * 0.12, cy - size * 0.12)
        .lineTo(cx + size * 0.12, cy + size * 0.12)
        .stroke({ width: 2, color: 0xff4500, alpha: 0.5 });
      this._body
        .moveTo(cx + size * 0.12, cy - size * 0.12)
        .lineTo(cx - size * 0.12, cy + size * 0.12)
        .stroke({ width: 2, color: 0xff4500, alpha: 0.5 });

    } else {
      // normal gem
      this._body
        .roundRect(0, 0, size, size, 12)
        .fill({ color: colour, alpha: 0.92 });

      this._body
        .roundRect(4, 4, size - 8, size * 0.38, 8)
        .fill({ color: 0xffffff, alpha: 0.22 });

      this._body
        .roundRect(4, size * 0.72, size - 8, size * 0.2, 6)
        .fill({ color: 0x000000, alpha: 0.15 });
    }

    this._body.x = PAD;
    this._body.y = PAD;
    this.addChild(this._body);

    // fuse spark container — bomb only
    if (this.isBomb) {
      this._fuse = new Graphics();
      this.addChild(this._fuse);
    }

    // selection ring
    this._ring = new Graphics();
    this._ring
      .roundRect(1, 1, CELL_SIZE - 2, CELL_SIZE - 2, 14)
      .stroke({ width: 2.5, color: 0xffffff, alpha: 0.95 });
    this._ring.visible = false;
    this.addChild(this._ring);

    // hint ring
    this._hintRing = new Graphics();
    this._hintRing
      .roundRect(-3, -3, CELL_SIZE + 6, CELL_SIZE + 6, 16)
      .stroke({ width: 3, color: 0x34d399, alpha: 1 });
    this._hintRing.visible = false;
    this._hintRing.alpha   = 0;
    this.addChild(this._hintRing);
  }

  updateFuse(ticker) {
    if (!this.isBomb || !this._fuse) return;
    this._fuseT += ticker.deltaMS / 1000;

    const CELL_SIZE = this.cellSize;
    const PAD       = Math.floor(CELL_SIZE * 0.08);
    const size      = CELL_SIZE - PAD * 2;
    const cx        = PAD + size / 2;
    const cy        = PAD + size / 2;

    // fuse tip — top right of gem
    const fuseX = cx + size * 0.22;
    const fuseY = cy - size * 0.38;

    this._fuse.clear();

    // fuse wire — short curved line
    this._fuse
      .moveTo(cx + size * 0.13, cy - size * 0.13)
      .lineTo(fuseX, fuseY)
      .stroke({ width: 1.5, color: 0x888888, alpha: 0.7 });

    // outer spark glow
    const sparkA = 0.3 + 0.4 * Math.abs(Math.sin(this._fuseT * 7));
    const sparkR = 5 + 3 * Math.abs(Math.sin(this._fuseT * 5));
    this._fuse
      .circle(fuseX, fuseY, sparkR * 1.8)
      .fill({ color: 0xff4500, alpha: sparkA * 0.4 });

    // main spark
    this._fuse
      .circle(fuseX, fuseY, sparkR)
      .fill({ color: 0xfbbf24, alpha: 0.9 });

    // bright core
    this._fuse
      .circle(fuseX, fuseY, sparkR * 0.4)
      .fill({ color: 0xffffff, alpha: 1 });

    // spark particles — 3 tiny dots flying off
    for (let i = 0; i < 3; i++) {
      const angle  = this._fuseT * 4 + i * 2.1;
      const dist   = (4 + i * 2) * Math.abs(Math.sin(this._fuseT * 3 + i));
      const px     = fuseX + Math.cos(angle) * dist;
      const py     = fuseY + Math.sin(angle) * dist;
      const pa     = 0.8 - i * 0.2;
      this._fuse
        .circle(px, py, 1.5)
        .fill({ color: 0xfbbf24, alpha: pa });
    }
  }

  setSelected(val) {
    this.selected      = val;
    this._ring.visible = val;
    this._glow.visible = val;
    this.scale.set(val ? 1.07 : 1.0);
  }

  showHint(val) {
    this._hintRing.visible = val;
    this._hintRing.alpha   = val ? 1 : 0;
  }

  flash() {
    this.scale.set(1.3);
    this.alpha = 0.6;
    setTimeout(() => {
      if (!this.destroyed) {
        this.scale.set(1.0);
        this.alpha = 1.0;
      }
    }, 100);
  }

  get colour() {
    return this.isBomb ? 0xff6b35 : GEM_COLOURS[this.type];
  }
}
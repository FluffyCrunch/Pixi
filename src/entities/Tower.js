import { Container, Sprite, Assets, Graphics } from 'pixi.js';
import { TOWER_TYPES, TILE_SIZE } from '../constants.js';

// which sprites to stack per tower type
// Kenney towers = base + bottom + top (weapon sits on top)
const TOWER_SPRITE_MAP = {
  laser:  { bottom: 'tower-bottom-a', top: 'tower-top-a', weapon: 'weapon-turret'   },
  cannon: { bottom: 'tower-bottom-b', top: 'tower-top-b', weapon: 'weapon-cannon'   },
  frost:  { bottom: 'tower-bottom-c', top: 'tower-crystals', weapon: null           },
  tesla:  { bottom: 'tower-bottom-a', top: 'tower-top-c', weapon: 'weapon-ballista' },
};

export class Tower extends Container {
  constructor(type, col, row) {
    super();
    this.towerType = type;
    this.def       = TOWER_TYPES[type];
    this.col       = col;
    this.row       = row;
    this.cooldown  = 0;
    this.target    = null;
    this._pulseT   = 0;

    this._build();
  }

  _build() {
    const map   = TOWER_SPRITE_MAP[this.towerType];
    const scale = TILE_SIZE / 128; // kenney previews ~128px wide

    // base platform
    const baseTex = Assets.get('tower-base');
    if (baseTex) {
      const base = new Sprite(baseTex);
      base.anchor.set(0.5, 0.9);
      base.scale.set(scale * 1.1);
      this.addChild(base);
    }

    // bottom section
    const botTex = Assets.get(map.bottom);
    if (botTex) {
      const bot = new Sprite(botTex);
      bot.anchor.set(0.5, 0.9);
      bot.scale.set(scale);
      this.addChild(bot);
    }

    // top section
    const topTex = Assets.get(map.top);
    if (topTex) {
      this._topSpr = new Sprite(topTex);
      this._topSpr.anchor.set(0.5, 1.0);
      this._topSpr.scale.set(scale * 0.85);
      this._topSpr.y = -TILE_SIZE * 0.18;
      this.addChild(this._topSpr);
    }

    // weapon on top — this rotates to aim
    if (map.weapon) {
      const weapTex = Assets.get(map.weapon);
      if (weapTex) {
        this._weapon = new Sprite(weapTex);
        this._weapon.anchor.set(0.5, 0.8);
        this._weapon.scale.set(scale * 0.7);
        this._weapon.y = -TILE_SIZE * 0.42;
        this.addChild(this._weapon);
      }
    }

    // range ring — shown on hover
    this._rangeRing = new Graphics();
    this._rangeRing.circle(0, 0, this.def.range)
      .stroke({ width: 1.5, color: this.def.color, alpha: 0.4 })
      .fill({ color: this.def.color, alpha: 0.05 });
    this._rangeRing.visible = false;
    this.addChild(this._rangeRing);
  }

  aimAt(x, y) {
    if (this._weapon) {
      this._weapon.rotation = Math.atan2(y - this.y, x - this.x)
                            + Math.PI / 2;
    }
  }

  showRange(val) {
    this._rangeRing.visible = val;
  }

  update(ticker) {
    this._pulseT += ticker.deltaMS / 1000;
    if (this.cooldown > 0) this.cooldown -= ticker.deltaMS;

    // idle weapon drift
    if (!this.target && this._weapon) {
      this._weapon.rotation += 0.003;
    }
  }

  isReady()       { return this.cooldown <= 0; }
  resetCooldown() { this.cooldown = this.def.fireRate; }
}
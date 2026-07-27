import { Container, Graphics, Sprite,
         Assets, BitmapText } from 'pixi.js';
import { TOWER_TYPES } from '../constants.js';
import { installFont } from '../utils/fonts.js';

const CARD_BOTTOM = {
  laser:  'tower-bottom-a',
  cannon: 'tower-bottom-b',
  frost:  'tower-bottom-c',
  tesla:  'tower-bottom-a',
};

export class TowerCard extends Container {
  constructor(type, x, y, onSelect) {
    super();
    this.towerType = type;
    this.def       = TOWER_TYPES[type];
    this.x         = x;
    this.y         = y;
    this._onSelect = onSelect;
    this._selected = false;
    this._build();
  }

  _build() {
    const W = 100;
    const H = 110;

    installFont('CardFont', {
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize:   36,
      fill:       '#ffffff',
      fontWeight: 'bold',
    }, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 $');

    // background
    this._bg = new Graphics();
    this._drawBg(false);
    this.addChild(this._bg);

    // tower sprite preview
    const alias = CARD_BOTTOM[this.towerType] ?? 'tower-bottom-a';
    const texture = Assets.get(alias);
    if (texture) {
      const spr = new Sprite(texture);
      spr.anchor.set(0.5, 0.85);
      const sc  = 54 / Math.max(spr.width, spr.height);
      spr.scale.set(sc);
      spr.x = W / 2;
      spr.y = 62;
      this.addChild(spr);
    }

    // tower name
    const name = new BitmapText({
      text:  this.def.name.toUpperCase(),
      style: { fontFamily: 'CardFont', fontSize: 36 },
    });
    name.scale.set(0.26);
    name.tint  = this.def.color;
    name.x     = W / 2 - name.width / 2;
    name.y     = 68;
    this.addChild(name);

    // cost with coin
    const costRow = new Container();
    costRow.x = W / 2;
    costRow.y = 86;

    const coin = new Graphics();
    coin.circle(-18, 0, 7).fill(0xfbbf24);
    coin.circle(-18, 0, 4).fill(0xf59e0b);
    costRow.addChild(coin);

    const costTxt = new BitmapText({
      text:  `${this.def.cost}`,
      style: { fontFamily: 'CardFont', fontSize: 36 },
    });
    costTxt.scale.set(0.3);
    costTxt.tint  = 0xfde68a;
    costTxt.x     = -8;
    costTxt.y     = -costTxt.height / 2;
    costRow.addChild(costTxt);
    this.addChild(costRow);

    // stat badge
    const stat = new BitmapText({
      text:  this._statLine(),
      style: { fontFamily: 'CardFont', fontSize: 36 },
    });
    stat.scale.set(0.20);
    stat.alpha = 0.5;
    stat.x     = W / 2 - stat.width / 2;
    stat.y     = 100;
    this.addChild(stat);

    // interaction
    this.eventMode = 'static';
    this.cursor    = 'pointer';

    this.on('pointerover',  () => this._drawBg(true));
    this.on('pointerout',   () => this._drawBg(this._selected));
    this.on('pointerdown',  () => {
      this._onSelect(this.towerType);
    });
  }

  _drawBg(hover) {
    this._bg.clear();
    const W = 100, H = 110;
    const borderColor = hover ? this.def.color : 0x8b6914;
    const fillColor   = hover ? 0x2a1e0e : 0x1a1208;

    this._bg.roundRect(0, 0, W, H, 10)
            .fill({ color: fillColor, alpha: 0.97 })
            .stroke({ width: hover ? 2.5 : 1.5,
                      color: borderColor, alpha: 0.9 });

    // top colour accent
    this._bg.roundRect(0, 0, W, 4, 10)
            .fill({ color: this.def.color, alpha: 0.8 });
  }

  _statLine() {
    const d = this.def;
    if (d.splash)  return `AoE ${d.splash}px`;
    if (d.slow)    return `SLOW ${Math.round((1-d.slow)*100)}%`;
    if (d.chain)   return `CHAIN x${d.chain}`;
    if (d.pierce)  return `PIERCE`;
    return `DMG ${d.damage}`;
  }

  setSelected(val) {
    this._selected = val;
    this._drawBg(val);
  }

  setAffordable(val) {
    this.alpha = val ? 1 : 0.45;
  }
}
import { Container, Graphics, BitmapText } from 'pixi.js';
import { TOWER_TYPES } from '../constants.js';

export class TowerInfoPanel {
  constructor(uiLayer) {
    this.layer   = uiLayer;
    this._panel  = null;
    this.visible = false;

    this.onSell = null; // callback(tower)
  }

  show(tower, screenX, screenY, appW) {
    this.hide();
    this.visible = true;

    const def  = TOWER_TYPES[tower.towerType];
    const panW = 140;
    const panH = 110;

    let px = screenX + 10;
    let py = screenY - panH / 2;

    // clamp
    if (px + panW > appW - 8) px = screenX - panW - 10;
    py = Math.max(56, py);

    this._panel = new Container();
    this._panel.x = px;
    this._panel.y = py;
    this.layer.addChild(this._panel);

    // background
    const bg = new Graphics();
    bg.roundRect(0, 0, panW, panH, 10)
      .fill({ color: 0x06060f, alpha: 0.97 })
      .stroke({ width: 1.5, color: def.color, alpha: 0.7 });
    this._panel.addChild(bg);

    // tower name
    const name = new BitmapText({
      text:  def.name.toUpperCase(),
      style: { fontFamily: 'VWFont', fontSize: 48 },
    });
    name.scale.set(0.22);
    name.tint  = def.color;
    name.x     = panW / 2 - name.width / 2;
    name.y     = 10;
    this._panel.addChild(name);

    // divider
    const div = new Graphics();
    div.rect(10, 28, panW - 20, 0.5)
      .fill({ color: def.color, alpha: 0.3 });
    this._panel.addChild(div);

    // stats
    const stats = this._buildStats(def);
    let sy = 34;
    for (const line of stats) {
      const txt = new BitmapText({
        text:  line,
        style: { fontFamily: 'VWFont', fontSize: 48 },
      });
      txt.scale.set(0.17);
      txt.alpha = 0.6;
      txt.x     = 12;
      txt.y     = sy;
      this._panel.addChild(txt);
      sy += 13;
    }

    // sell button
    const sellW  = panW - 20;
    const sellH  = 26;
    const sellX  = 10;
    const sellY  = panH - sellH - 8;
    const sellGold = Math.floor(def.cost * 0.6);

    const sellBtn = new Graphics();
    sellBtn.roundRect(sellX, sellY, sellW, sellH, 6)
      .fill({ color: 0x3a1a1a, alpha: 0.95 })
      .stroke({ width: 1, color: 0xff6666, alpha: 0.7 });
    sellBtn.eventMode = 'static';
    sellBtn.cursor    = 'pointer';
    this._panel.addChild(sellBtn);

    const sellTxt = new BitmapText({
      text:  `SELL  +$${sellGold}`,
      style: { fontFamily: 'VWFont', fontSize: 48 },
    });
    sellTxt.scale.set(0.18);
    sellTxt.tint  = 0xff9999;
    sellTxt.x     = sellX + sellW / 2 - sellTxt.width / 2;
    sellTxt.y     = sellY + sellH / 2 - sellTxt.height / 2;
    this._panel.addChild(sellTxt);

    sellBtn.on('pointerover', () => { sellBtn.alpha = 0.7; });
    sellBtn.on('pointerout',  () => { sellBtn.alpha = 1; });
    sellBtn.on('pointerdown', () => {
      if (this.onSell) this.onSell(tower, sellGold);
    });
  }

  _buildStats(def) {
    const lines = [];
    lines.push(`DMG    ${def.damage}`);
    lines.push(`RANGE  ${def.range}`);
    lines.push(`RATE   ${(1000 / def.fireRate).toFixed(1)}/s`);
    if (def.splash)  lines.push(`SPLASH ${def.splash}px`);
    if (def.slow)    lines.push(`SLOW   ${Math.round((1 - def.slow) * 100)}%`);
    if (def.chain)   lines.push(`CHAIN  x${def.chain}`);
    if (def.pierce)  lines.push(`PIERCE`);
    return lines;
  }

  hide() {
    if (this._panel) {
      this.layer.removeChild(this._panel);
      this._panel = null;
    }
    this.visible = false;
  }
}
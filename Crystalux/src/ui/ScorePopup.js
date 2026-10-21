import { Container, BitmapFont, BitmapText, TextStyle } from 'pixi.js';

BitmapFont.install({
  name:  'PopupFont',
  style: new TextStyle({
    fontFamily: 'monospace',
    fontSize:   80,
    fill:       '#ffffff',
    fontWeight: 'bold',
  }),
  chars:      '0123456789+',
  resolution: 2,
});

export class ScorePopup {
  constructor(container) {
    this.container = container;
    this._pool     = [];
  }

  show(x, y, points) {
    // reuse or create
    let text = this._pool.find(t => !t.visible);
    if (!text) {
      text = new BitmapText({
        text:  '',
        style: { fontFamily: 'PopupFont', fontSize: 80 },
      });
      text.scale.set(0.28);
      text.anchor  = { x: 0.5, y: 0.5 };
      this.container.addChild(text);
      this._pool.push(text);
    }

    text.text    = `+${points}`;
    text.x       = x;
    text.y       = y;
    text.alpha   = 1;
    text.visible = true;
    text._vy     = -1.2;  // float upward
    text._life   = 0;
    text._max    = 700;
  }

  update(ticker) {
    for (const t of this._pool) {
      if (!t.visible) continue;

      t._life += ticker.deltaMS;
      t.y     += t._vy;
      t.alpha  = 1 - (t._life / t._max);

      if (t._life >= t._max) t.visible = false;
    }
  }
}
import { Container, BitmapFont, BitmapText, TextStyle } from 'pixi.js';

BitmapFont.install({
  name:  'CommentFont',
  style: new TextStyle({
    fontFamily: 'Georgia, serif',
    fontSize:   100,
    fill:       '#ffffff',
    fontWeight: 'bold',
    fontStyle:  'italic',
  }),
  chars:      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz !x0123456789',
  resolution: 2,
});

// what to show and at what colour per trigger
const MESSAGES = {
  match4:   { text: 'NICE!',        color: 0xa78bfa },
  match5:   { text: 'GREAT!',       color: 0x67e8f9 },
  megamatch:{ text: 'MEGA MATCH!',  color: 0xfbbf24 },
  chain2:   { text: 'COMBO x2',     color: 0xf472b6 },
  chain3:   { text: 'COMBO x3',     color: 0xfb923c },
  chain4:   { text: 'ON FIRE!',     color: 0xef4444 },
  bomb:     { text: 'BOOM!',        color: 0xff6b35 },
};

export class CommentaryLabel {
  constructor(app, container) {
    this.app       = app;
    this.container = container;
    this._label    = null;
    this._state    = 'idle'; // idle | in | hold | out
    this._t        = 0;
    this._build();
  }

  _build() {
    this._label       = new BitmapText({
      text:  '',
      style: { fontFamily: 'CommentFont', fontSize: 100 },
    });
    this._label.scale.set(0.38);
    this._label.anchor = { x: 0.5, y: 0.5 };
    this._label.alpha  = 0;
    this._label.x      = this.app.screen.width / 2;
    this._label.y      = this.app.screen.height / 2 - 340;
    this.container.addChild(this._label);
  }

  // trigger — pass a key from MESSAGES
  show(key) {
    const msg = MESSAGES[key];
    if (!msg) return;

    this._label.text  = msg.text;
    this._label.tint  = msg.color;
    this._label.scale.set(0.20); // start small — scales up
    this._label.alpha = 0;
    this._label.x     = this.app.screen.width / 2;

    this._state = 'in';
    this._t     = 0;
  }

  // convenience — pick the right key based on match count and chain
  trigger(matchCount, chainCount) {
    if (chainCount >= 4)      return this.show('chain4');
    if (chainCount === 3)     return this.show('chain3');
    if (chainCount === 2)     return this.show('chain2');
    if (matchCount >= 6)      return this.show('megamatch');
    if (matchCount >= 5)      return this.show('match5');
    if (matchCount >= 4)      return this.show('match4');
    // match3 — show nothing, keep it clean
  }

  update(ticker) {
    if (this._state === 'idle') return;

    this._t += ticker.deltaMS;

    if (this._state === 'in') {
      // scale up + fade in over 220ms
      const p = Math.min(this._t / 220, 1);
      // overshoot spring scale
      const s = p < 0.7
        ? p / 0.7
        : 1 + Math.sin((p - 0.7) / 0.3 * Math.PI) * 0.12;

      this._label.scale.set(0.38 * s);
      this._label.alpha = p;

      if (p >= 1) {
        this._state = 'hold';
        this._t     = 0;
      }

    } else if (this._state === 'hold') {
      // hold for 700ms
      if (this._t >= 700) {
        this._state = 'out';
        this._t     = 0;
      }

    } else if (this._state === 'out') {
      // float up + fade out over 380ms
      const p = Math.min(this._t / 380, 1);
      this._label.alpha = 1 - p;
      this._label.y    -= 0.6;

      if (p >= 1) {
        this._state   = 'idle';
        this._label.y = this.app.screen.height / 2 - 340;
      }
    }
  }
}
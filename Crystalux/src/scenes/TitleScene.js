import { Container, Graphics, BitmapFont,
         BitmapText, TextStyle } from 'pixi.js';
import { buildBackground } from '../systems/BackgroundBuilder.js';
import { GEM_TYPES }       from '../constants.js';

const GEM_COLOURS = {
  red:    0xe74c3c,
  blue:   0x3498db,
  green:  0x2ecc71,
  yellow: 0xf1c40f,
  purple: 0x9b59b6,
  orange: 0xf97316,
};

export class TitleScene {
  constructor(app, manager) {
    this.app       = app;
    this.manager   = manager;
    this.container = new Container();
    this._floaters = [];
    this._time     = 0;
    this._build();
  }

  _build() {
    const W = this.app.screen.width;
    const H = this.app.screen.height;

    // background
    const bgContainer = new Container();
    this.container.addChild(bgContainer);
    buildBackground(this.app, bgContainer);

    // floating gem decorations
    const floatContainer = new Container();
    this.container.addChild(floatContainer);
    this._buildFloaters(floatContainer, W, H);

    // install fonts
    BitmapFont.install({
      name:  'TitleMain',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize:   120,
        fill:       '#ffffff',
        fontWeight: 'bold',
        fontStyle:  'italic',
      }),
      chars:      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
      resolution: 2,
    });

    BitmapFont.install({
      name:  'TitleSub',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize:   40,
        fill:       '#a5b4fc',
      }),
      chars:      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ',
      resolution: 2,
    });

    BitmapFont.install({
      name:  'TitleBtn',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize:   60,
        fill:       '#ffffff',
        fontWeight: 'bold',
      }),
      chars:      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ',
      resolution: 2,
    });

    // glow behind title
    const titleGlow = new Graphics();
    titleGlow.ellipse(W / 2, H / 2 - 90, 340, 80)
      .fill({ color: 0x7c3aed, alpha: 0.18 });
    this.container.addChild(titleGlow);

    // title text
    const title = new BitmapText({
      text:  'CRYSTALUX',
      style: { fontFamily: 'TitleMain', fontSize: 120 },
    });
    title.scale.set(0.5);
    title.x = (W - title.width) / 2;
    title.y = H / 2 - 160;
    this.container.addChild(title);
    this._title = title;

    // decorative line under title
    const line = new Graphics();
    const lw   = 320;
    line.rect((W - lw) / 2, H / 2 - 96, lw, 2)
      .fill({ color: 0x7c3aed, alpha: 0.6 });
    this.container.addChild(line);

    // subtitle
    const sub = new BitmapText({
      text:  'match  •  combo  •  conquer',
      style: { fontFamily: 'TitleSub', fontSize: 40 },
    });
    sub.scale.set(0.4);
    sub.alpha = 0.6;
    sub.x     = (W - sub.width) / 2;
    sub.y     = H / 2 - 72;
    this.container.addChild(sub);

    // play button with glow ring
    const btnW = 240, btnH = 64;
    const btnX = (W - btnW) / 2;
    const btnY = H / 2 + 20;

    // outer glow ring
    this._btnGlow = new Graphics();
    this._btnGlow.roundRect(btnX - 4, btnY - 4, btnW + 8, btnH + 8, 18)
      .fill({ color: 0x7c3aed, alpha: 0.3 });
    this.container.addChild(this._btnGlow);

    // button body
    const btnBg = new Graphics();
    btnBg.roundRect(btnX, btnY, btnW, btnH, 14)
      .fill({ color: 0x5b21b6, alpha: 1 })
      .stroke({ width: 1.5, color: 0xa78bfa, alpha: 0.8 });
    btnBg.eventMode = 'static';
    btnBg.cursor    = 'pointer';

    // button shine
    btnBg.roundRect(btnX + 8, btnY + 6, btnW - 16, btnH * 0.35, 8)
      .fill({ color: 0xffffff, alpha: 0.12 });

    this.container.addChild(btnBg);

    const btnText = new BitmapText({
      text:  'PLAY',
      style: { fontFamily: 'TitleBtn', fontSize: 60 },
    });
    btnText.scale.set(0.36);
    btnText.x = btnX + (btnW - btnText.width)  / 2;
    btnText.y = btnY + (btnH - btnText.height) / 2;
    this.container.addChild(btnText);

    btnBg.on('pointerover', () => {
      btnBg.alpha        = 0.85;
      this._btnGlow.alpha = 0.5;
    });
    btnBg.on('pointerout', () => {
      btnBg.alpha        = 1;
      this._btnGlow.alpha = 0.3;
    });
    btnBg.on('pointerdown', async () => {
      // unlock audio on first user gesture
      if (this.manager.audio) {
        await this.manager.audio.unlock();
        this.manager.audio.startBGM('bgm', 0.2);
      }
      const { GameScene } = await import('./GameScene.js');
      this.manager.goto(GameScene);
    });

    // hint at bottom
    BitmapFont.install({
      name:  'TitleHint',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize:   32,
        fill:       '#6366f1',
      }),
      chars:      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz •',
      resolution: 2,
    });

    const hint = new BitmapText({
      text:  'swap adjacent gems  •  match 3 or more  •  score as high as you can',
      style: { fontFamily: 'TitleHint', fontSize: 32 },
    });
    hint.scale.set(0.32);
    hint.alpha = 0.45;
    hint.x     = (W - hint.width) / 2;
    hint.y     = H - 42;
    this.container.addChild(hint);

    this._btnGlowRef = this._btnGlow;
    this._time       = 0;
  }

  _buildFloaters(container, W, H) {
    const types  = GEM_TYPES;
    const count  = 14;

    for (let i = 0; i < count; i++) {
      const type   = types[i % types.length];
      const colour = GEM_COLOURS[type];
      const size   = 28 + Math.random() * 32;
      const x      = Math.random() * W;
      const y      = Math.random() * H;
      const speed  = 0.15 + Math.random() * 0.25;
      const phase  = Math.random() * Math.PI * 2;
      const drift  = (Math.random() - 0.5) * 0.4;

      const g = new Graphics();
      g.roundRect(0, 0, size, size, size * 0.18)
        .fill({ color: colour, alpha: 0.12 })
        .stroke({ width: 1, color: colour, alpha: 0.25 });

      // highlight
      g.roundRect(3, 3, size - 6, size * 0.35, 4)
        .fill({ color: 0xffffff, alpha: 0.08 });

      g.x    = x;
      g.y    = y;
      g.pivot.set(size / 2, size / 2);

      container.addChild(g);
      this._floaters.push({ g, speed, phase, drift, x, y, size });
    }
  }

  async enter() {
    // register update so floaters animate during entry
    this._tickFn = (ticker) => this.update(ticker);
    this.app.ticker.add(this._tickFn);

    return new Promise(resolve => {
      const tick = (ticker) => {
        this.container.alpha += ticker.deltaMS / 600;
        if (this.container.alpha >= 1) {
          this.container.alpha = 1;
          this.app.ticker.remove(tick);
          resolve();
        }
      };
      this.app.ticker.add(tick);
    });
  }

  async exit() {
    if (this._tickFn) this.app.ticker.remove(this._tickFn);

    return new Promise(resolve => {
      const tick = (ticker) => {
        this.container.alpha -= ticker.deltaMS / 350;
        if (this.container.alpha <= 0) {
          this.container.alpha = 0;
          this.app.ticker.remove(tick);
          resolve();
        }
      };
      this.app.ticker.add(tick);
    });
  }

  update(ticker) {
    this._time += ticker.deltaMS / 1000;
    const t     = this._time;

    // pulse button glow
    if (this._btnGlow) {
      this._btnGlow.alpha = 0.2 + 0.18 * Math.sin(t * 2.2);
    }

    // pulse title brightness
    if (this._title) {
      this._title.alpha = 0.88 + 0.12 * Math.sin(t * 1.4);
    }

    // animate floating gems
    for (const f of this._floaters) {
      f.g.y        = f.y + Math.sin(t * f.speed + f.phase) * 22;
      f.g.x        = f.x + Math.cos(t * f.speed * 0.6 + f.phase) * 12;
      f.g.rotation = t * f.drift;
      f.g.alpha    = 0.08 + 0.06 * Math.sin(t * f.speed + f.phase);
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
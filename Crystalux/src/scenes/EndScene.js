import { Container, Graphics, BitmapFont,
         BitmapText, TextStyle } from 'pixi.js';
import { buildBackground } from '../systems/BackgroundBuilder.js';
import { GEM_COLOURS }     from '../constants.js';

export class EndScene {
  constructor(app, manager, data = {}) {
    this.app        = app;
    this.manager    = manager;
    this.container  = new Container();
    this.finalScore = data.score ?? 0;
    this._time      = 0;
    this._displayed = 0;
    this._countDone = false;
    this._build();
  }

  _build() {
    const W = this.app.screen.width;
    const H = this.app.screen.height;

    // background
    const bgContainer = new Container();
    this.container.addChild(bgContainer);
    buildBackground(this.app, bgContainer);

    // dark overlay on top of bg
    const overlay = new Graphics();
    overlay.rect(0, 0, W, H)
      .fill({ color: 0x000000, alpha: 0.55 });
    this.container.addChild(overlay);

    // panel
    const pw = 460, ph = 380;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;

    // panel glow
    const panelGlow = new Graphics();
    panelGlow.roundRect(px - 8, py - 8, pw + 16, ph + 16, 26)
      .fill({ color: 0x7c3aed, alpha: 0.15 });
    this.container.addChild(panelGlow);

    const panel = new Graphics();
    panel.roundRect(px, py, pw, ph, 20)
      .fill({ color: 0x0f0a2a, alpha: 0.97 })
      .stroke({ width: 1.5, color: 0x7c3aed, alpha: 0.6 });
    this.container.addChild(panel);

    // install fonts
    BitmapFont.install({
      name:  'EndTitle',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize:   80,
        fill:       '#ffffff',
        fontWeight: 'bold',
        fontStyle:  'italic',
      }),
      chars:      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz !',
      resolution: 2,
    });

    BitmapFont.install({
      name:  'EndSub',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize:   40,
        fill:       '#a5b4fc',
      }),
      chars:      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ',
      resolution: 2,
    });

    BitmapFont.install({
      name:  'EndScore',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize:   140,
        fill:       '#ffffff',
        fontWeight: 'bold',
      }),
      chars:      '0123456789',
      resolution: 2,
    });

    BitmapFont.install({
      name:  'EndBtn',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize:   50,
        fill:       '#ffffff',
        fontWeight: 'bold',
      }),
      chars:      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ',
      resolution: 2,
    });

    // GAME OVER heading
    const over = new BitmapText({
      text:  'GAME OVER',
      style: { fontFamily: 'EndTitle', fontSize: 80 },
    });
    over.scale.set(0.46);
    over.x = px + (pw - over.width) / 2;
    over.y = py + 28;
    this.container.addChild(over);

    // divider line
    const div = new Graphics();
    div.rect(px + 40, py + 84, pw - 80, 1)
      .fill({ color: 0x7c3aed, alpha: 0.4 });
    this.container.addChild(div);

    // SCORE label
    const scoreLbl = new BitmapText({
      text:  'FINAL SCORE',
      style: { fontFamily: 'EndSub', fontSize: 40 },
    });
    scoreLbl.scale.set(0.32);
    scoreLbl.alpha = 0.5;
    scoreLbl.x    = px + (pw - scoreLbl.width) / 2;
    scoreLbl.y    = py + 100;
    this.container.addChild(scoreLbl);

    // score number — counts up
    this._scoreDisplay = new BitmapText({
      text:  '0',
      style: { fontFamily: 'EndScore', fontSize: 140 },
    });
    this._scoreDisplay.scale.set(0.38);
    this._scoreDisplay.x = px + (pw - this._scoreDisplay.width) / 2;
    this._scoreDisplay.y = py + 122;
    this.container.addChild(this._scoreDisplay);

    // star rating
    this._starsContainer = new Container();
    this._starsContainer.x = px + pw / 2;
    this._starsContainer.y = py + 250;
    this.container.addChild(this._starsContainer);
    this._buildStars(this.finalScore);

    // rating label
    const ratingLabel = this._getRatingText(this.finalScore);
    const rating = new BitmapText({
      text:  ratingLabel,
      style: { fontFamily: 'EndSub', fontSize: 40 },
    });
    rating.scale.set(0.36);
    rating.alpha = 0.75;
    rating.x     = px + (pw - rating.width) / 2;
    rating.y     = py + 278;
    this.container.addChild(rating);

    // play again button
    const btnW = 240, btnH = 58;
    const btnX = px + (pw - btnW) / 2;
    const btnY = py + 306;

    const btnGlow = new Graphics();
    btnGlow.roundRect(btnX - 4, btnY - 4, btnW + 8, btnH + 8, 18)
      .fill({ color: 0x7c3aed, alpha: 0.25 });
    this.container.addChild(btnGlow);
    this._btnGlow = btnGlow;

    const btnBg = new Graphics();
    btnBg.roundRect(btnX, btnY, btnW, btnH, 14)
      .fill({ color: 0x5b21b6, alpha: 1 })
      .stroke({ width: 1.5, color: 0xa78bfa, alpha: 0.8 });

    btnBg.roundRect(btnX + 8, btnY + 6, btnW - 16, btnH * 0.35, 8)
      .fill({ color: 0xffffff, alpha: 0.1 });

    btnBg.eventMode = 'static';
    btnBg.cursor    = 'pointer';
    this.container.addChild(btnBg);

    const btnText = new BitmapText({
      text:  'PLAY AGAIN',
      style: { fontFamily: 'EndBtn', fontSize: 50 },
    });
    btnText.scale.set(0.34);
    btnText.x = btnX + (btnW - btnText.width)  / 2;
    btnText.y = btnY + (btnH - btnText.height) / 2;
    this.container.addChild(btnText);

    btnBg.on('pointerover',  () => { btnBg.alpha = 0.8; });
    btnBg.on('pointerout',   () => { btnBg.alpha = 1;   });
    btnBg.on('pointerdown', async () => {
      // dynamic import breaks the circular dependency
      const { GameScene } = await import('./GameScene.js');
      this.manager.goto(GameScene);
    });

    // store for update
    this._px = px;
    this._pw = pw;
  }

  _buildStars(score) {
    const count  = score >= 2000 ? 3
                 : score >= 800  ? 2
                 :                 1;
    const size   = 28;
    const gap    = 14;
    const total  = 3;
    const startX = -(total * (size + gap)) / 2 + size / 2;

    for (let i = 0; i < total; i++) {
      const filled = i < count;
      const g      = new Graphics();

      // draw star shape
      const pts  = 5;
      const or_  = size / 2;
      const ir   = or_ * 0.42;
      const cx   = startX + i * (size + gap);
      const cy   = 0;

      g.moveTo(cx, cy - or_);
      for (let p = 0; p < pts * 2; p++) {
        const angle = (p * Math.PI / pts) - Math.PI / 2;
        const r     = p % 2 === 0 ? or_ : ir;
        g.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      }
      g.closePath();

      if (filled) {
        g.fill({ color: 0xfbbf24, alpha: 1 })
         .stroke({ width: 1, color: 0xfef08a, alpha: 0.8 });
      } else {
        g.fill({ color: 0xffffff, alpha: 0.12 })
         .stroke({ width: 1, color: 0xffffff, alpha: 0.2 });
      }

      // pop-in animation — start small
      g.scale.set(0);
      this._starsContainer.addChild(g);

      // stagger each star's pop-in
      const delay = 600 + i * 180;
      setTimeout(() => {
        if (!g.destroyed) {
          this._popIn(g);
        }
      }, delay);
    }
  }

  _popIn(target) {
    let t = 0;
    const tick = (ticker) => {
      t += ticker.deltaMS / 280;
      if (t >= 1) {
        target.scale.set(1);
        this.app.ticker.remove(tick);
        return;
      }
      // overshoot spring
      const s = 1 + Math.sin(t * Math.PI) * 0.35;
      target.scale.set(Math.min(t * 1.4, 1) * s);
    };
    this.app.ticker.add(tick);
  }

  _getRatingText(score) {
    if (score >= 2000) return 'EXCELLENT';
    if (score >= 1200) return 'GREAT WORK';
    if (score >= 800)  return 'WELL DONE';
    if (score >= 400)  return 'KEEP GOING';
    return 'NICE TRY';
  }

  async enter() {
    this.container.alpha = 0;

    return new Promise(resolve => {
      const tick = (ticker) => {
        this.container.alpha += ticker.deltaMS / 550;
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
    this._time += ticker.deltaMS;

    // score count-up over first 1200ms
    if (!this._countDone) {
      const progress  = Math.min(this._time / 1200, 1);
      const eased     = 1 - Math.pow(1 - progress, 3); // ease out cubic
      this._displayed = Math.round(eased * this.finalScore);
      this._scoreDisplay.text = String(this._displayed);

      // recentre score text as digits grow
      this._scoreDisplay.x =
        this._px + (this._pw - this._scoreDisplay.width) / 2;

      if (progress >= 1) this._countDone = true;
    }

    // pulse button glow
    if (this._btnGlow) {
      this._btnGlow.alpha = 0.15 + 0.15 * Math.sin(this._time / 1000 * 2);
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
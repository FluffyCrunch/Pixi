import { Container, Graphics, BitmapText } from 'pixi.js';

export class WaveAnnouncer {
  constructor(app, uiLayer) {
    this.app      = app;
    this.layer    = uiLayer;
    this._active  = false;
  }

  show(waveNumber, totalWaves) {
    if (this._active) return;
    this._active = true;

    const W = this.app.screen.width;
    const H = this.app.screen.height;

    const wrap = new Container();
    wrap.alpha = 0;
    this.layer.addChild(wrap);

    // dark bar
    const bar = new Graphics();
    bar.rect(0, H / 2 - 38, W, 76)
      .fill({ color: 0x000000, alpha: 0.72 });
    wrap.addChild(bar);

    // accent lines
    bar.rect(0, H / 2 - 38, W, 2)
      .fill({ color: 0x4a90d9, alpha: 0.7 });
    bar.rect(0, H / 2 + 36, W, 2)
      .fill({ color: 0x4a90d9, alpha: 0.7 });

    // WAVE X text
    const waveTxt = new BitmapText({
      text:  `WAVE ${waveNumber}`,
      style: { fontFamily: 'VWFont', fontSize: 48 },
    });
    waveTxt.scale.set(0.7);
    waveTxt.x     = W / 2 - waveTxt.width / 2;
    waveTxt.y     = H / 2 - waveTxt.height / 2 - 8;
    waveTxt.tint  = 0x4a90d9;
    wrap.addChild(waveTxt);

    // OF X subtitle
    const subTxt = new BitmapText({
      text:  `of ${totalWaves}`,
      style: { fontFamily: 'VWFont', fontSize: 48 },
    });
    subTxt.scale.set(0.28);
    subTxt.alpha = 0.5;
    subTxt.x     = W / 2 - subTxt.width / 2;
    subTxt.y     = H / 2 + 14;
    wrap.addChild(subTxt);

    // animate — fade in, hold, fade out
    let elapsed = 0;
    const FADE_IN  = 400;
    const HOLD     = 900;
    const FADE_OUT = 500;
    const TOTAL    = FADE_IN + HOLD + FADE_OUT;

    const tick = (ticker) => {
      elapsed += ticker.deltaMS;

      if (elapsed < FADE_IN) {
        wrap.alpha = elapsed / FADE_IN;
      } else if (elapsed < FADE_IN + HOLD) {
        wrap.alpha = 1;
      } else {
        wrap.alpha = Math.max(1 - (elapsed - FADE_IN - HOLD) / FADE_OUT, 0);
      }

      if (elapsed >= TOTAL) {
        this.app.ticker.remove(tick);
        this.layer.removeChild(wrap);
        this._active = false;
      }
    };

    this.app.ticker.add(tick);
  }
}
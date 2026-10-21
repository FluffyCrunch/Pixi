import { BitmapFont, BitmapText, TextStyle, Container } from 'pixi.js';

export class HUD {
  constructor(container) {
    BitmapFont.install({
      name: 'HUDFont',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize:   13,
        fill:       'rgba(255,255,255,0.5)',
      }),
      chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.:/ |',
    });

    this.fpsText = new BitmapText({
      text:  'FPS: --',
      style: { fontFamily: 'HUDFont', fontSize: 13 },
    });
    this.fpsText.x = 14;
    this.fpsText.y = 14;

    this.countText = new BitmapText({
      text:  'PARTICLES: --',
      style: { fontFamily: 'HUDFont', fontSize: 13 },
    });
    this.countText.x = 14;
    this.countText.y = 30;

    this.hintText = new BitmapText({
      text:  'CLICK TO BURST  |  MOVE TO ATTRACT PARTICLES',
      style: { fontFamily: 'HUDFont', fontSize: 11 },
    });
    this.hintText.alpha = 0;
    this._hintTimer     = 0;
    this._hintVisible   = false;

    container.addChild(this.fpsText);
    container.addChild(this.countText);
    container.addChild(this.hintText);

    this._container = container;
    this._app       = null; // set after construction
  }

  setApp(app) {
    this._app = app;
    this._positionHint();
  }

  _positionHint() {
    if (!this._app) return;
    this.hintText.x = Math.round(
      (this._app.screen.width - this.hintText.width) / 2
    );
    this.hintText.y = this._app.screen.height - 30;
  }

  update(fps, activeCount) {
    this.fpsText.text   = `FPS: ${Math.round(fps)}`;
    this.countText.text = `PARTICLES: ${activeCount}`;

    if (!this._hintVisible) {
      this._hintTimer += 16;
      if (this._hintTimer > 1500) {
        this._hintVisible   = true;
        this.hintText.alpha = 0;
      }
    } else if (this.hintText.alpha < 0.45) {
      this.hintText.alpha = Math.min(
        this.hintText.alpha + 0.008, 0.45
      );
    }
  }
}
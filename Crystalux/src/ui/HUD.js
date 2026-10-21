import { Container, Graphics, BitmapFont,
         BitmapText, TextStyle } from 'pixi.js';
import { GRID_COLS, GRID_ROWS, getGridDimensions } from '../constants.js';

export class HUD {
  constructor(app, container) {
    this.app       = app;
    this.container = container;
    this.score     = 0;
    this.timeLeft  = 60;
    this._elapsed  = 0;
    this._done     = false;
    this._lastTick = 61;
    this._isMuted  = false;
    this._time     = 0;
    this.onTimeUp  = null;
    this._onTick   = null;
    this._audioRef = null;

    // shake state
    this._shakeX        = 0;
    this._shakeMag      = 0;
    this._timerPanelOriginX = 0;

    BitmapFont.install({
      name:  'UILabel',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize:   48,
        fill:       '#ffffff',
        fontWeight: 'bold',
      }),
      chars:      'SCOREABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz: !TIME',
      resolution: 2,
    });

    BitmapFont.install({
      name:  'UINumber',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize:   120,
        fill:       '#ffffff',
        fontWeight: 'bold',
      }),
      chars:      '0123456789',
      resolution: 2,
    });

    this._build();
  }

  _build() {
    const { GRID_PIXEL_W } = getGridDimensions(); 
    const W  = this.app.screen.width;
    const H  = this.app.screen.height;
    const gx = (W - GRID_PIXEL_W) / 2;

    const panelW = 180;
    const panelH = 70;
    const panelY = 16;

    // ── score panel ───────────────────────────────────────────────
    const scorePanelX = gx;

    const scorePanel = new Graphics();
    scorePanel
      .roundRect(scorePanelX, panelY, panelW, panelH, 12)
      .fill({ color: 0x1a1a3a, alpha: 0.85 })
      .stroke({ width: 1, color: 0x7c3aed, alpha: 0.3 });
    this.container.addChild(scorePanel);

    const scoreLabel = new BitmapText({
      text:  'SCORE',
      style: { fontFamily: 'UILabel', fontSize: 48 },
    });
    scoreLabel.scale.set(0.20);
    scoreLabel.x     = scorePanelX + 14;
    scoreLabel.y     = panelY + 10;
    scoreLabel.alpha = 0.5;
    this.container.addChild(scoreLabel);

    this._scoreText = new BitmapText({
      text:  '0',
      style: { fontFamily: 'UINumber', fontSize: 120 },
    });
    this._scoreText.scale.set(0.30);
    this._scoreText.x = scorePanelX + 14;
    this._scoreText.y = panelY + 28;
    this.container.addChild(this._scoreText);

    // ── timer panel ───────────────────────────────────────────────
    const timerPanelX = W - gx - panelW;
    this._timerPanelOriginX = timerPanelX;

    // wrap timer panel in a container so we can shake it
    this._timerContainer = new Container();
    this._timerContainer.x = 0;
    this._timerContainer.y = 0;
    this.container.addChild(this._timerContainer);

    const timerPanel = new Graphics();
    timerPanel
      .roundRect(timerPanelX, panelY, panelW, panelH, 12)
      .fill({ color: 0x1a1a3a, alpha: 0.85 })
      .stroke({ width: 1, color: 0x7c3aed, alpha: 0.3 });
    this._timerContainer.addChild(timerPanel);
    this._timerPanel = timerPanel;

    const timerLabel = new BitmapText({
      text:  'TIME',
      style: { fontFamily: 'UILabel', fontSize: 48 },
    });
    timerLabel.scale.set(0.20);
    timerLabel.x     = timerPanelX + 14;
    timerLabel.y     = panelY + 10;
    timerLabel.alpha = 0.5;
    this._timerContainer.addChild(timerLabel);

    this._timerText = new BitmapText({
      text:  '60',
      style: { fontFamily: 'UINumber', fontSize: 120 },
    });
    this._timerText.scale.set(0.30);
    this._timerText.x = timerPanelX + 14;
    this._timerText.y = panelY + 28;
    this._timerContainer.addChild(this._timerText);

    // ── tick flash label ──────────────────────────────────────────
    // brief "!" that flashes on each tick
    BitmapFont.install({
      name:  'TickFlash',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize:   60,
        fill:       '#ef4444',
        fontWeight: 'bold',
      }),
      chars:      '!',
      resolution: 2,
    });

    this._tickFlash       = new BitmapText({
      text:  '!',
      style: { fontFamily: 'TickFlash', fontSize: 60 },
    });
    this._tickFlash.scale.set(0.7);
    this._tickFlash.x     = timerPanelX + panelW + 6;
    this._tickFlash.y     = panelY + 8;
    this._tickFlash.alpha = 0;
    this._tickFlashT      = 0;
    this.container.addChild(this._tickFlash);

    // ── timer bar ─────────────────────────────────────────────────
    const barY = H - 40;

    // track background
    const barBg = new Graphics();
    barBg
      .roundRect(gx, barY, GRID_PIXEL_W, 12, 6)
      .fill({ color: 0xffffff, alpha: 0.06 })
      .stroke({ width: 1, color: 0x7c3aed, alpha: 0.15 });
    this.container.addChild(barBg);

    // glow layer behind the bar
    this._barGlow = new Graphics();
    this.container.addChild(this._barGlow);

    // bar fill
    this._bar = new Graphics();
    this.container.addChild(this._bar);

    this._barW    = GRID_PIXEL_W;
    this._barY    = barY;
    this._gx      = gx;

    // ── mute button ───────────────────────────────────────────────
    const muteSize = 44;
    const muteX    = W - 60;
    const muteY    = 20;

    this._muteGlow = new Graphics();
    this._muteGlow
      .roundRect(muteX - 3, muteY - 3, muteSize + 6, muteSize + 6, 14)
      .fill({ color: 0x7c3aed, alpha: 0.2 });
    this.container.addChild(this._muteGlow);

    const muteBtn = new Graphics();
    muteBtn
      .roundRect(muteX, muteY, muteSize, muteSize, 12)
      .fill({ color: 0x0f0a2a, alpha: 0.92 })
      .stroke({ width: 1.5, color: 0x7c3aed, alpha: 0.6 });
    muteBtn.eventMode = 'static';
    muteBtn.cursor    = 'pointer';
    this.container.addChild(muteBtn);

    this._speakerIcon = new Graphics();
    this._drawSpeaker(this._speakerIcon, muteX + 10, muteY + 10, false);
    this.container.addChild(this._speakerIcon);

    muteBtn.on('pointerover', () => {
      muteBtn.alpha        = 0.75;
      this._muteGlow.alpha = 0.4;
    });
    muteBtn.on('pointerout', () => {
      muteBtn.alpha        = 1.0;
      this._muteGlow.alpha = 0.2;
    });
    muteBtn.on('pointerdown', () => {
      if (this._audioRef) {
        this._isMuted = this._audioRef.toggleMute();
        this._speakerIcon.clear();
        this._drawSpeaker(
          this._speakerIcon, muteX + 10, muteY + 10, this._isMuted
        );
      }
    });
  }

  _drawSpeaker(g, x, y, muted) {
    const c = muted ? 0x6b7280 : 0xffffff;
    g.rect(x, y + 6, 8, 12).fill({ color: c, alpha: 1 });
    g.moveTo(x + 8, y + 6)
     .lineTo(x + 16, y + 2)
     .lineTo(x + 16, y + 22)
     .lineTo(x + 8, y + 18)
     .closePath()
     .fill({ color: c, alpha: 1 });

    if (!muted) {
      g.arc(x + 18, y + 12, 5, -0.7, 0.7)
       .stroke({ width: 2, color: c, alpha: 0.8 });
      g.arc(x + 18, y + 12, 9, -0.7, 0.7)
       .stroke({ width: 2, color: c, alpha: 0.5 });
    } else {
      g.moveTo(x + 18, y + 6).lineTo(x + 26, y + 18)
       .stroke({ width: 2.5, color: 0xef4444, alpha: 1 });
      g.moveTo(x + 26, y + 6).lineTo(x + 18, y + 18)
       .stroke({ width: 2.5, color: 0xef4444, alpha: 1 });
    }
  }

  setAudio(audio) {
    this._audioRef = audio;
  }

  _redrawBar(fraction) {
    this._bar.clear();
    this._barGlow.clear();

    const w = Math.max(this._barW * fraction, 0);

    // bar grows taller as time runs low
    const barH = fraction > 0.4
      ? 12
      : fraction > 0.2
        ? 16
        : 20;

    // shift bar up as it grows taller so bottom edge stays fixed
    const barY = this._barY + (12 - barH);

    const color = fraction > 0.4
      ? 0x7c3aed   // purple
      : fraction > 0.2
        ? 0xf59e0b  // amber
        : 0xef4444; // red

    if (w > 0) {
      this._bar
        .roundRect(this._gx, barY, w, barH, barH / 2)
        .fill({ color, alpha: 0.92 });
    }

    // glow under bar — intensity increases as time runs out
    if (fraction <= 0.4) {
      const glowIntensity = (0.4 - fraction) / 0.4;
      const glowAlpha     = 0.06 + 0.12 * glowIntensity
                          + 0.10 * Math.sin(this._time * (4 + glowIntensity * 6));
      const glowH         = barH + 10;

      if (w > 0) {
        this._barGlow
          .roundRect(this._gx, barY - 5, w + 4, glowH, glowH / 2)
          .fill({ color, alpha: glowAlpha });
      }
    }
  }

  _triggerShake() {
    this._shakeMag = 5;
  }

  addScore(points) {
    this.score           += points;
    this._scoreText.text  = String(this.score);
  }

  update(ticker) {
    if (this._done) return;

    this._elapsed += ticker.deltaMS;
    this._time    += ticker.deltaMS / 1000;

    const secondsLeft = Math.max(
      this.timeLeft - Math.floor(this._elapsed / 1000), 0
    );

    // ── tick callback ─────────────────────────────────────────────
    if (secondsLeft <= 10 && secondsLeft !== this._lastTick) {
      this._lastTick = secondsLeft;
      if (this._onTick) this._onTick();

      // flash the "!" label
      this._tickFlash.alpha = 1;
      this._tickFlashT      = 0;

      // shake timer panel when under 5 seconds
      if (secondsLeft <= 5) this._triggerShake();
    }

    // ── tick flash fade ───────────────────────────────────────────
    if (this._tickFlash.alpha > 0) {
      this._tickFlashT      += ticker.deltaMS;
      this._tickFlash.alpha  = Math.max(
        1 - this._tickFlashT / 300, 0
      );
    }

    // ── timer panel shake ─────────────────────────────────────────
    if (this._shakeMag > 0.2) {
      this._timerContainer.x = (Math.random() - 0.5) * this._shakeMag * 2;
      this._timerContainer.y = (Math.random() - 0.5) * this._shakeMag;
      this._shakeMag        *= 0.82; // decay
    } else {
      this._timerContainer.x = 0;
      this._timerContainer.y = 0;
      this._shakeMag         = 0;
    }

    // ── timer text ────────────────────────────────────────────────
    this._timerText.text = String(secondsLeft);

    // pulse timer text scale when low
    if (secondsLeft <= 10) {
      this._timerText.tint = 0xef4444;
      const pulse = 1 + 0.06 * Math.sin(this._time * 8);
      this._timerText.scale.set(0.30 * pulse);
    }

    // ── bar redraw ────────────────────────────────────────────────
    this._redrawBar(secondsLeft / this.timeLeft);

    // ── mute glow pulse ───────────────────────────────────────────
    if (this._muteGlow) {
      this._muteGlow.alpha = this._isMuted
        ? 0.05
        : 0.12 + 0.08 * Math.sin(this._time * 1.8);
    }

    // ── time up ───────────────────────────────────────────────────
    if (secondsLeft === 0 && !this._done) {
      this._done   = true;
      this._onTick = null;
      if (this.onTimeUp) this.onTimeUp(this.score);
    }
  }
}
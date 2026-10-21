import { Container, Graphics } from 'pixi.js';
import { Grid }             from '../game/Grid.js';
import { MatchSolver }      from '../game/MatchSolver.js';
import { GemFaller }        from '../game/GemFaller.js';
import { TweenSystem }      from '../systems/TweenSystem.js';
import { ParticlePool }     from '../systems/ParticlePool.js';
import { HUD }              from '../ui/HUD.js';
import { ScorePopup }       from '../ui/ScorePopup.js';
import { CommentaryLabel }  from '../ui/CommentaryLabel.js';
import { HintSystem }       from '../systems/HintSystem.js';
import { buildBackground }  from '../systems/BackgroundBuilder.js';
import { EndScene }         from '../scenes/EndScene.js';
import {
  GRID_COLS, GRID_ROWS,
  FLASH_DURATION, SWAP_DURATION,
  SCORE_MATCH3, SCORE_MATCH4,
  SCORE_MATCH5, SCORE_BOMB,
} from '../constants.js';

const STATE = {
  IDLE:  'IDLE',
  SWAP:  'SWAP',
  MATCH: 'MATCH',
  FALL:  'FALL',
};

export class GameScene {
  constructor(app, manager) {
    this.app       = app;
    this.manager   = manager;
    this.container = new Container();

    this.tween    = new TweenSystem();
    this.solver   = new MatchSolver();
    this.state    = STATE.IDLE;
    this.selected = null;

    this._build();
    this._setupInput();
  }

  _build() {
    const W = this.app.screen.width;
    const H = this.app.screen.height;

    // ── background ────────────────────────────────────────────────
    const bgContainer = new Container();
    this.container.addChild(bgContainer);
    buildBackground(this.app, bgContainer);

    // ── grid — build first so we get responsive dimensions ────────
    this.grid   = new Grid(this.app);
    this.faller = new GemFaller(this.grid, this.tween);
    this.container.addChild(this.grid.container);

    // pull responsive dimensions from grid instance
    const CELL_SIZE    = this.grid.CELL_SIZE;
    const GRID_PIXEL_W = this.grid.GRID_PIXEL_W;
    const GRID_PIXEL_H = this.grid.GRID_PIXEL_H;

    const gridX = (W - GRID_PIXEL_W) / 2;
    const gridY = (H - GRID_PIXEL_H) / 2;

    this._gridX    = gridX;
    this._gridY    = gridY;
    this._cellSize = CELL_SIZE;

    // reposition grid container now we know the offset
    this.grid.container.x = gridX;
    this.grid.container.y = gridY;

    // ── grid panel ────────────────────────────────────────────────
    const panel = new Graphics();
    panel.roundRect(
      gridX - 12, gridY - 12,
      GRID_PIXEL_W + 24, GRID_PIXEL_H + 24, 16
    ).fill({ color: 0x1a1a3a, alpha: 0.9 });

    for (let col = 0; col <= GRID_COLS; col++) {
      panel.moveTo(gridX + col * CELL_SIZE, gridY)
           .lineTo(gridX + col * CELL_SIZE, gridY + GRID_PIXEL_H)
           .stroke({ width: 0.5, color: 0xffffff, alpha: 0.07 });
    }
    for (let row = 0; row <= GRID_ROWS; row++) {
      panel.moveTo(gridX, gridY + row * CELL_SIZE)
           .lineTo(gridX + GRID_PIXEL_W, gridY + row * CELL_SIZE)
           .stroke({ width: 0.5, color: 0xffffff, alpha: 0.07 });
    }
    this.container.addChildAt(panel, 1); // behind grid, above background
    panel.cacheAsTexture(true);

    // ── particle layer ────────────────────────────────────────────
    const particleContainer = new Container();
    this.container.addChild(particleContainer);
    this.particles = new ParticlePool(200, particleContainer);
    this.particles.init(this.app);

    // ── HUD layer ─────────────────────────────────────────────────
    const hudContainer = new Container();
    this.container.addChild(hudContainer);
    this.hud = new HUD(this.app, hudContainer);
    this.hud.setAudio(this.manager.audio);
    this.hud.onTimeUp = (score) => {
      this.manager.audio?.stopBGM();
      this.manager.goto(EndScene, { score });
    };
    this.hud._onTick = () => {
      this.manager.audio?.play('tick', 0.6);
    };

    // ── score popup layer ─────────────────────────────────────────
    const popupContainer = new Container();
    this.container.addChild(popupContainer);
    this.popup = new ScorePopup(popupContainer);

    // ── commentary label ──────────────────────────────────────────
    const commentContainer = new Container();
    this.container.addChild(commentContainer);
    this.commentary = new CommentaryLabel(this.app, commentContainer);

    // ── hint system ───────────────────────────────────────────────
    this.hints = new HintSystem(
      this.grid,
      this.solver,
      this._gridX,
      this._gridY
    );
  }

  _setupInput() {
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea   = this.app.screen;

    this._onPointerDown = (e) => {
      // any tap resets idle hint timer
      this.hints.resetIdle();

      if (this.state !== STATE.IDLE) return;

      const lx  = e.global.x - this._gridX;
      const ly  = e.global.y - this._gridY;
      const col = Math.floor(lx / this._cellSize);
      const row = Math.floor(ly / this._cellSize);

      if (col < 0 || col >= GRID_COLS ||
          row < 0 || row >= GRID_ROWS) {
        this._deselect();
        return;
      }

      const gem = this.grid.getGem(col, row);
      if (!gem) return;

      if (!this.selected) {
        this._select(gem);
      } else if (this.selected === gem) {
        this._deselect();
      } else {
        const dc = Math.abs(gem.col - this.selected.col);
        const dr = Math.abs(gem.row - this.selected.row);

        if ((dc === 1 && dr === 0) || (dc === 0 && dr === 1)) {
          this.manager.audio?.play('swap', 0.5);
          this._attemptSwap(this.selected, gem);
        } else {
          this._deselect();
          this._select(gem);
        }
      }
    };

    this.app.stage.on('pointerdown', this._onPointerDown);
  }

  _select(gem) {
    this.selected = gem;
    gem.setSelected(true);
  }

  _deselect() {
    if (this.selected) {
      this.selected.setSelected(false);
      this.selected = null;
    }
  }

  async _attemptSwap(gemA, gemB) {
    this.state = STATE.SWAP;
    this._deselect();

    await this._swapTween(gemA, gemB);
    this._swapData(gemA, gemB);

    const matches = this.solver.findMatches(this.grid.cells);

    if (matches.length === 0) {
      await this._swapTween(gemA, gemB);
      this._swapData(gemA, gemB);
      this.state = STATE.IDLE;
      return;
    }

    await this._processMatches(matches);
    this.state = STATE.IDLE;
  }

  async _swapTween(gemA, gemB) {
    const ax = gemA.x, ay = gemA.y;
    const bx = gemB.x, by = gemB.y;
    await this.tween.parallel(
      this.tween.to(gemA, { x: bx, y: by }, SWAP_DURATION),
      this.tween.to(gemB, { x: ax, y: ay }, SWAP_DURATION)
    );
  }

  _swapData(gemA, gemB) {
    const colA = gemA.col, rowA = gemA.row;
    const colB = gemB.col, rowB = gemB.row;
    this.grid.cells[colA][rowA] = gemB;
    this.grid.cells[colB][rowB] = gemA;
    gemA.col = colB; gemA.row = rowB;
    gemB.col = colA; gemB.row = rowA;
  }

  async _processMatches(matches, chainCount = 0) {
    this.state = STATE.MATCH;

    const count    = matches.length;
    const hasBomb  = this.solver.hasBomb(this.grid.cells, matches);

    const basePoints = count >= 5 ? SCORE_MATCH5
                     : count >= 4 ? SCORE_MATCH4
                     :              SCORE_MATCH3;
    const points = hasBomb ? basePoints + SCORE_BOMB : basePoints;

    if (hasBomb) {
      this.commentary.show('bomb');
    } else {
      this.commentary.trigger(count, chainCount);
    }

    const pitch = 1.0 + chainCount * 0.18;
    this.manager.audio?.play('match', 0.7, pitch);

    this.hud.addScore(points);

    matches.forEach(({ col, row }) => {
      const gem = this.grid.getGem(col, row);
      if (!gem) return;
      gem.flash();

      const wx     = this._gridX + gem.x + this._cellSize / 2;
      const wy     = this._gridY + gem.y + this._cellSize / 2;
      const burst  = gem.isBomb ? 18 : 6;
      const colour = gem.isBomb ? 0xff6b35 : gem.colour;
      this.particles.burst(wx, wy, burst, colour);
    });

    const avgX = matches.reduce((s, m) => s + m.col, 0) / matches.length;
    const avgY = matches.reduce((s, m) => s + m.row, 0) / matches.length;
    const popX = this._gridX + avgX * this._cellSize + this._cellSize / 2;
    const popY = this._gridY + avgY * this._cellSize;
    this.popup.show(popX, popY, points);

    await this._wait(FLASH_DURATION);

    matches.forEach(({ col, row }) => this.grid.removeGem(col, row));

    this.state = STATE.FALL;
    await this.faller.applyGravity();
    await this.faller.spawnNew();

    const chain = this.solver.findMatches(this.grid.cells);
    if (chain.length > 0) await this._processMatches(chain, chainCount + 1);
  }

  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async enter() {
    if (this.manager.audio && !this.manager.audio._bgmNode) {
      this.manager.audio.startBGM('bgm', 0.2);
    }

    this.container.alpha = 0;
    return new Promise(resolve => {
      const tick = (ticker) => {
        this.container.alpha += ticker.deltaMS / 400;
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
    this.hud._onTick  = null;
    this.hud.onTimeUp = null;
    this.manager.audio?.stopAll();
    this.app.stage.off('pointerdown', this._onPointerDown);

    return new Promise(resolve => {
      const tick = (ticker) => {
        this.container.alpha -= ticker.deltaMS / 300;
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
    this.tween.update(ticker);
    this.hud.update(ticker);
    this.particles.update(ticker);
    this.popup.update(ticker);
    this.commentary.update(ticker);
    this.hints.update(ticker, this.state === 'IDLE');

    // animate fuse on bomb gems
    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        const gem = this.grid.getGem(col, row);
        if (gem?.isBomb) gem.updateFuse(ticker);
      }
    }
  }

  destroy() {
    this.hints._clear?.();
    this.grid.destroy();
    this.container.destroy({ children: true });
  }
} 
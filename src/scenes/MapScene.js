import { Container, Graphics, BitmapFont,
         BitmapText, TextStyle } from 'pixi.js';
import { TileRenderer }     from '../map/TileRenderer.js';
import { Grid }             from '../map/Grid.js';
import { PathFinder }       from '../map/PathFinder.js';
import { WaveSpawner }      from '../systems/WaveSpawner.js';
import { TowerSystem }      from '../systems/TowerSystem.js';
import { ProjectileSystem } from '../systems/ProjectileSystem.js';
import { TowerCard }        from '../ui/TowerCard.js';
import { TowerInfoPanel }   from '../ui/TowerInfoPanel.js';
import { WaveAnnouncer }    from '../ui/WaveAnnouncer.js';
import { installFont }      from '../utils/fonts.js';
import {
  MAP_LAYOUT, MAP_COLS, MAP_ROWS,
  TILE, WAVES, BASE_HP, START_GOLD, TOWER_TYPES,
  updateTileSize, TILE_SIZE, MAP_PIXEL_W, MAP_PIXEL_H,
} from '../constants.js';

const TOP_H    = 64;
const BOTTOM_H = 130;

export class MapScene {
  constructor(app, manager) {
    this.app       = app;
    this.manager   = manager;
    this.container = new Container();

    this.gold      = START_GOLD;
    this.baseHP    = BASE_HP;
    this._phase    = 'place';
    this._btnPulse = 0;
    this._time     = 0;

    this._infoPanelTower = null;
    this._pendingType    = null;

    // recalculate tile size to fill the screen
    updateTileSize();

    const W = this.app.screen.width;
    const H = this.app.screen.height;

    // map fills full width
    // centre vertically in the space between bars
    const availH  = H - TOP_H - BOTTOM_H;
    this._mapX    = 0;
    this._mapY    = TOP_H + Math.max(0, Math.floor((availH - MAP_PIXEL_H) / 2));

    // fill entire area with grass green — matches tile colour
    const bg = new Graphics();
    bg.rect(0, 0, W, H).fill(0x5a9e3a);
    this.container.addChild(bg);

    this._build();
    this._setupInput();
  }

  _build() {
    const W = this.app.screen.width;
    const H = this.app.screen.height;

    // map starts at left edge, below top bar
    // fills full width, all available height
    this._mapX = 0;
    this._mapY = TOP_H;

    // import updated constants after calling updateTileSize()
    const { TILE_SIZE: TS, MAP_PIXEL_W: MPW, MAP_PIXEL_H: MPH } = this._getDims();

    // ── background fill — same colour as tiles ────────────────────
    const bg = new Graphics();
    bg.rect(0, 0, W, H).fill(0x3a6b1a);
    this.container.addChild(bg);

    // ── render layers ─────────────────────────────────────────────
    this._layers = {
      background:  new Container(),
      entities:    new Container(),
      projectiles: new Container(),
      effects:     new Container(),
      ui:          new Container(),
    };
    for (const l of Object.values(this._layers)) {
      this.container.addChild(l);
    }

    // ── tile map — fills from top bar to bottom bar ───────────────
    this.tileRenderer = new TileRenderer();
    this.tileRenderer.build();
    this.tileRenderer.container.x = this._mapX;
    this.tileRenderer.container.y = this._mapY;
    this._layers.background.addChild(this.tileRenderer.container);

    // ── hover + selection ─────────────────────────────────────────
    this._hoverHighlight     = new Graphics();
    this._selectionHighlight = new Graphics();
    this._layers.background.addChild(this._hoverHighlight);
    this._layers.background.addChild(this._selectionHighlight);

    // ── grid + path ───────────────────────────────────────────────
    this.grid       = new Grid();
    this.pathFinder = new PathFinder();
    this._buildBaseIndicator();

    // ── systems ───────────────────────────────────────────────────
    this.towerSystem = new TowerSystem(
      this._layers.entities, this.grid, this._mapX, this._mapY
    );
    this.projSystem = new ProjectileSystem(
      this._layers.projectiles, this._layers.effects
    );
    this.projSystem.onEnemyKilled = (enemy) => {
      this.gold += enemy.reward;
      this._updateHUD();
      this._showGoldPopup(enemy.x, enemy.y, enemy.reward);
    };
    this.towerSystem.onFire = (tower, target, allEnemies) => {
      this.projSystem.fire(tower, target, allEnemies);
    };

    this.spawner = new WaveSpawner(
      this._layers.entities,
      this.pathFinder.getWaypoints(),
      this._mapX, this._mapY
    );
    this.spawner.onEnemyReached = () => {
      this.baseHP = Math.max(this.baseHP - 1, 0);
      this._redrawBaseHP();
      this._flashBaseHP();
      this._updateHUD();
      if (this.baseHP <= 0) this._gameOver();
    };
    this.spawner.onWaveComplete = () => {
      if (this._phase === 'gameover') return;
      setTimeout(() => {
        if (this._phase === 'gameover') return;
        this._phase             = 'between';
        this._startBtn.visible  = true;
        this._startGlow.visible = true;
        this._updateHUD();
      }, 1800);
    };
    this.spawner.onAllComplete = () => {
      this._phase = 'win';
      this._showWin();
    };
    this.spawner.onBomberExplode = (x, y, radius) => {
      for (const t of this.towerSystem.getTowers()) {
        if (Math.hypot(t.x - x, t.y - y) <= radius) this._shakeTower(t);
      }
      this._showExplosion(x, y);
    };

    this.waveAnnouncer = new WaveAnnouncer(this.app, this._layers.ui);
    this.infoPanel     = new TowerInfoPanel(this._layers.ui);
    this.infoPanel.onSell = (tower, sellGold) => {
      this.grid.removeTower(tower.col, tower.row);
      this.towerSystem.towers = this.towerSystem.towers.filter(t => t !== tower);
      this._layers.entities.removeChild(tower);
      this.gold += sellGold;
      this._updateHUD();
      this.infoPanel.hide();
      this._infoPanelTower = null;
    };

    this._installFonts();
    this._buildTopBar(W, H);
    this._buildBottomBar(W, H);
  }

  _getDims() {
    // re-import after updateTileSize was called
    // use the module-level exports which were mutated
    const mod = { TILE_SIZE, MAP_PIXEL_W, MAP_PIXEL_H };
    return mod;
  }

  _installFonts() {
    installFont('GameFont', {
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize:   72, fill: '#ffffff', fontWeight: 'bold',
    }, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 :/$!.+x/');

    installFont('LabelFont', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize:   30, fill: '#ffe0a0', fontWeight: 'bold',
    }, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /');

    installFont('HintFont', {
      fontFamily: 'Arial, sans-serif',
      fontSize:   26, fill: '#a0b8c0',
    }, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .esc0123456789');

    installFont('BtnFont', {
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize:   52, fill: '#ffffff', fontWeight: 'bold',
    }, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ');

    installFont('BaseFont', {
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize:   32, fill: '#ffffff', fontWeight: 'bold',
    }, 'BASE');

    installFont('CardFont', {
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize:   36, fill: '#ffffff', fontWeight: 'bold',
    }, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 $');
  }

  _buildBaseIndicator() {
    let baseCol = 0, baseRow = 0;
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        if (MAP_LAYOUT[row][col] === TILE.BASE) { baseCol = col; baseRow = row; }
      }
    }

    const bx = this._mapX + baseCol * TILE_SIZE + TILE_SIZE / 2;
    const by = this._mapY + baseRow * TILE_SIZE;

    this._baseIndicator   = new Container();
    this._baseIndicator.x = bx;
    this._baseIndicator.y = by - 8;
    this._layers.ui.addChild(this._baseIndicator);

    const barW = 64, barH = 8;

    this._baseBarGlow = new Graphics();
    this._baseBarGlow
      .roundRect(-barW / 2 - 3, -barH / 2 - 3, barW + 6, barH + 6, 5)
      .fill({ color: 0x22c55e, alpha: 0.25 });
    this._baseIndicator.addChild(this._baseBarGlow);

    const barBg = new Graphics();
    barBg.roundRect(-barW / 2, -barH / 2, barW, barH, 4)
         .fill({ color: 0x111111, alpha: 0.85 })
         .stroke({ width: 1.5, color: 0x22c55e, alpha: 0.7 });
    this._baseIndicator.addChild(barBg);

    this._baseHPFill = new Graphics();
    this._baseIndicator.addChild(this._baseHPFill);

    const lbl = new BitmapText({
      text:  'BASE',
      style: { fontFamily: 'BaseFont', fontSize: 32 },
    });
    lbl.scale.set(0.32);
    lbl.x = -lbl.width / 2;
    lbl.y = -28;
    this._baseIndicator.addChild(lbl);

    this._baseBarW   = barW;
    this._baseBarH   = barH;
    this._baseFlashT = 0;
    this._redrawBaseHP();
  }

  _redrawBaseHP() {
    if (!this._baseHPFill) return;
    this._baseHPFill.clear();
    const fraction = Math.max(this.baseHP / BASE_HP, 0);
    const w        = this._baseBarW * fraction;
    const color    = fraction > 0.5 ? 0x22c55e
                   : fraction > 0.25 ? 0xf59e0b : 0xef4444;
    if (w > 0) {
      this._baseHPFill
        .roundRect(-this._baseBarW / 2, -this._baseBarH / 2,
                   w, this._baseBarH, 4)
        .fill({ color, alpha: 1 });
    }
  }

  _flashBaseHP() { this._baseFlashT = 500; }

  _buildTopBar(W, H) {
    // warm wood top bar
    const topBg = new Graphics();
    topBg.rect(0, 0, W, TOP_H).fill(0x3a2810);
    topBg.rect(0, 0, W, 3).fill({ color: 0xf0c040, alpha: 0.5 });
    topBg.rect(0, TOP_H - 3, W, 3).fill({ color: 0x1a1008, alpha: 0.8 });
    this._layers.ui.addChild(topBg);

    // ── HP panel ──────────────────────────────────────────────────
    const hpPanel = new Graphics();
    hpPanel.roundRect(10, 8, 140, TOP_H - 16, 10)
           .fill({ color: 0x5a1a1a, alpha: 0.95 })
           .stroke({ width: 2, color: 0xef4444, alpha: 0.8 });
    this._layers.ui.addChild(hpPanel);

    this._drawHeart(this._layers.ui, 33, TOP_H / 2, 10);

    this._hpTxt = new BitmapText({
      text:  `${this.baseHP}`,
      style: { fontFamily: 'GameFont', fontSize: 72 },
    });
    this._hpTxt.scale.set(0.50);
    this._hpTxt.tint  = 0xffcccc;
    this._hpTxt.x     = 56;
    this._hpTxt.y     = TOP_H / 2 - this._hpTxt.height / 2;
    this._layers.ui.addChild(this._hpTxt);

    // ── GOLD panel ────────────────────────────────────────────────
    const goldPanel = new Graphics();
    goldPanel.roundRect(160, 8, 160, TOP_H - 16, 10)
             .fill({ color: 0x4a3800, alpha: 0.95 })
             .stroke({ width: 2, color: 0xfcd34d, alpha: 0.8 });
    this._layers.ui.addChild(goldPanel);

    this._drawCoin(this._layers.ui, 184, TOP_H / 2, 12);

    this._goldTxt = new BitmapText({
      text:  `${this.gold}`,
      style: { fontFamily: 'GameFont', fontSize: 72 },
    });
    this._goldTxt.scale.set(0.50);
    this._goldTxt.tint  = 0xfde68a;
    this._goldTxt.x     = 206;
    this._goldTxt.y     = TOP_H / 2 - this._goldTxt.height / 2;
    this._layers.ui.addChild(this._goldTxt);

    // ── WAVE panel ────────────────────────────────────────────────
    const wavePW = 240;
    const wavePX = W / 2 - wavePW / 2;
    const wavePanel = new Graphics();
    wavePanel.roundRect(wavePX, 8, wavePW, TOP_H - 16, 10)
             .fill({ color: 0x1a2a4a, alpha: 0.95 })
             .stroke({ width: 2, color: 0x60a5fa, alpha: 0.8 });
    this._layers.ui.addChild(wavePanel);

    // skull
    const sk = new Graphics();
    sk.circle(wavePX + 24, TOP_H / 2, 11).fill(0xdddddd);
    sk.circle(wavePX + 19, TOP_H / 2 + 2, 3.5).fill(0x1a2a4a);
    sk.circle(wavePX + 29, TOP_H / 2 + 2, 3.5).fill(0x1a2a4a);
    sk.rect(wavePX + 17, TOP_H / 2 + 8, 5, 4).fill(0xdddddd);
    sk.rect(wavePX + 24, TOP_H / 2 + 8, 5, 4).fill(0xdddddd);
    this._layers.ui.addChild(sk);

    const waveLbl = new BitmapText({
      text:  'WAVE',
      style: { fontFamily: 'LabelFont', fontSize: 30 },
    });
    waveLbl.scale.set(0.28);
    waveLbl.x     = wavePX + 42;
    waveLbl.y     = 12;
    this._layers.ui.addChild(waveLbl);

    this._waveTxt = new BitmapText({
      text:  `0 / ${WAVES.length}`,
      style: { fontFamily: 'GameFont', fontSize: 72 },
    });
    this._waveTxt.scale.set(0.50);
    this._waveTxt.tint  = 0x93c5fd;
    this._waveTxt.x     = wavePX + 42;
    this._waveTxt.y     = 26;
    this._layers.ui.addChild(this._waveTxt);

    // VOIDWATCH watermark
    const titleTxt = new BitmapText({
      text:  'VOIDWATCH',
      style: { fontFamily: 'GameFont', fontSize: 72 },
    });
    titleTxt.scale.set(0.36);
    titleTxt.alpha = 0.2;
    titleTxt.x     = W - titleTxt.width - 16;
    titleTxt.y     = TOP_H / 2 - titleTxt.height / 2;
    this._layers.ui.addChild(titleTxt);
  }

  _drawHeart(layer, cx, cy, r) {
    const g = new Graphics();
    g.circle(cx - r * 0.5, cy - r * 0.2, r * 0.65).fill(0xef4444);
    g.circle(cx + r * 0.5, cy - r * 0.2, r * 0.65).fill(0xef4444);
    g.moveTo(cx - r, cy + r * 0.1)
     .lineTo(cx, cy + r * 1.2)
     .lineTo(cx + r, cy + r * 0.1)
     .closePath().fill(0xef4444);
    layer.addChild(g);
  }

  _drawCoin(layer, cx, cy, r) {
    const g = new Graphics();
    g.circle(cx, cy, r).fill(0xfbbf24);
    g.circle(cx, cy, r * 0.65).fill(0xf59e0b);
    g.circle(cx - r * 0.22, cy - r * 0.22, r * 0.25).fill({ color: 0xfef08a, alpha: 0.6 });
    layer.addChild(g);
  }

  _buildBottomBar(W, H) {
    const botBg = new Graphics();
    botBg.rect(0, H - BOTTOM_H, W, BOTTOM_H).fill(0x2a1e0e);
    botBg.rect(0, H - BOTTOM_H, W, 3).fill({ color: 0xf0c040, alpha: 0.5 });
    this._layers.ui.addChild(botBg);

    const towersLbl = new BitmapText({
      text:  'TOWERS',
      style: { fontFamily: 'LabelFont', fontSize: 30 },
    });
    towersLbl.scale.set(0.34);
    towersLbl.x = 18;
    towersLbl.y = H - BOTTOM_H + 6;
    this._layers.ui.addChild(towersLbl);

    const hint = new BitmapText({
      text:  'select a tower then click the map  .  esc to cancel',
      style: { fontFamily: 'HintFont', fontSize: 26 },
    });
    hint.scale.set(0.26);
    hint.alpha = 0.5;
    hint.x     = 18;
    hint.y     = H - 18;
    this._layers.ui.addChild(hint);

    const types   = Object.keys(TOWER_TYPES);
    const cardW   = 106;
    const cardGap = 10;
    const cardY   = H - BOTTOM_H + 22;

    this._cards = [];
    types.forEach((type, i) => {
      const card = new TowerCard(
        type, 18 + i * (cardW + cardGap), cardY,
        (t) => this._selectTowerType(t)
      );
      this._layers.ui.addChild(card);
      this._cards.push(card);
    });

    this._buildStartBtn(W, H);
  }

  _buildStartBtn(W, H) {
    const btnW = 190, btnH = 58;
    const btnX = W - btnW - 20;
    const btnY = H - BOTTOM_H / 2 - btnH / 2;

    this._startGlow = new Graphics();
    this._startGlow
      .roundRect(btnX - 6, btnY - 6, btnW + 12, btnH + 12, 16)
      .fill({ color: 0xf0c040, alpha: 1 });
    this._startGlow.alpha = 0.3;
    this._layers.ui.addChild(this._startGlow);

    this._startBtn = new Graphics();
    this._startBtn
      .roundRect(btnX, btnY, btnW, btnH, 10)
      .fill({ color: 0xb45309, alpha: 1 })
      .stroke({ width: 2.5, color: 0xfcd34d, alpha: 0.9 });
    this._startBtn
      .roundRect(btnX + 10, btnY + 6, btnW - 20, btnH * 0.28, 6)
      .fill({ color: 0xffffff, alpha: 0.15 });
    this._startBtn.eventMode = 'static';
    this._startBtn.cursor    = 'pointer';
    this._layers.ui.addChild(this._startBtn);

    const btnTxt = new BitmapText({
      text:  'START WAVE',
      style: { fontFamily: 'BtnFont', fontSize: 52 },
    });
    btnTxt.scale.set(0.32);
    btnTxt.tint = 0xfef3c7;
    btnTxt.x    = btnX + btnW / 2 - btnTxt.width / 2;
    btnTxt.y    = btnY + btnH / 2 - btnTxt.height / 2;
    this._layers.ui.addChild(btnTxt);

    this._startBtn.on('pointerover', () => {
      this._startBtn.tint   = 0xffe090;
      this._startGlow.alpha = 0.55;
    });
    this._startBtn.on('pointerout', () => {
      this._startBtn.tint   = 0xffffff;
      this._startGlow.alpha = 0.3;
    });
    this._startBtn.on('pointerdown', () => {
      if (this._phase !== 'place' && this._phase !== 'between') return;
      if (this.baseHP <= 0) return;
      this._cancelPlacement();
      this._hideInfoPanel();
      this._startWave();
    });
  }

  _selectTowerType(type) {
    this._pendingType = type;
    for (const card of this._cards) {
      card.setSelected(card.towerType === type);
    }
  }

  _cancelPlacement() {
    this._pendingType = null;
    for (const card of this._cards) card.setSelected(false);
    this._selectionHighlight.clear();
    this._hoverHighlight.clear();
  }

  _placeTowerAt(col, row) {
    if (!this._pendingType) return;
    const cost = TOWER_TYPES[this._pendingType].cost;
    if (!this.grid.isBuildable(col, row)) return;
    if (this.gold < cost) return;
    this.gold -= cost;
    this.towerSystem.placeTower(this._pendingType, col, row);
    this._updateHUD();
  }

  _showInfoPanel(tower) {
    this._cancelPlacement();
    this.infoPanel.show(tower, tower.x, tower.y, this.app.screen.width);
    tower.showRange(true);
    this._infoPanelTower = tower;
  }

  _hideInfoPanel() {
    this.infoPanel.hide();
    if (this._infoPanelTower) {
      this._infoPanelTower.showRange(false);
      this._infoPanelTower = null;
    }
  }

  _updateHUD() {
    this._waveTxt.text = `${this.spawner.waveIndex} / ${WAVES.length}`;
    this._goldTxt.text = `${this.gold}`;
    this._hpTxt.text   = `${this.baseHP}`;
    for (const card of this._cards) {
      card.setAffordable(this.gold >= TOWER_TYPES[card.towerType].cost);
    }
  }

  _startWave() {
    this._phase             = 'wave';
    this._startBtn.visible  = false;
    this._startGlow.visible = false;
    this.waveAnnouncer.show(this.spawner.waveIndex + 1, WAVES.length);
    this.spawner.startWave();
    this._updateHUD();
  }

  _showGoldPopup(x, y, amount) {
    const txt = new BitmapText({
      text:  `+${amount}`,
      style: { fontFamily: 'GameFont', fontSize: 72 },
    });
    txt.scale.set(0.28);
    txt.tint  = 0xfcd34d;
    txt.x     = x - txt.width / 2;
    txt.y     = y - 24;
    this._layers.effects.addChild(txt);
    let elapsed = 0;
    const tick  = (ticker) => {
      elapsed  += ticker.deltaMS;
      txt.y    -= 0.5;
      txt.alpha = Math.max(1 - elapsed / 800, 0);
      if (elapsed >= 800) {
        this.app.ticker.remove(tick);
        this._layers.effects.removeChild(txt);
      }
    };
    this.app.ticker.add(tick);
  }

  _showExplosion(x, y) {
    const g = new Graphics();
    this._layers.effects.addChild(g);
    let t = 0;
    const tick = (ticker) => {
      t    += ticker.deltaMS;
      const r = 10 + t * 0.15;
      const a = Math.max(0.9 - t / 500, 0);
      g.clear();
      g.circle(x, y, r * 1.8).fill({ color: 0xff6600, alpha: a * 0.25 });
      g.circle(x, y, r).fill({ color: 0xff8800, alpha: a });
      if (t >= 500) {
        this.app.ticker.remove(tick);
        this._layers.effects.removeChild(g);
      }
    };
    this.app.ticker.add(tick);
  }

  _shakeTower(tower) {
    const ox = tower.x, oy = tower.y;
    let t = 0;
    const tick = (ticker) => {
      t += ticker.deltaMS;
      tower.x = ox + (Math.random() - 0.5) * 5;
      tower.y = oy + (Math.random() - 0.5) * 5;
      if (t >= 280) { tower.x = ox; tower.y = oy; this.app.ticker.remove(tick); }
    };
    this.app.ticker.add(tick);
  }

  _buildEndOverlay(isWin) {
    this._startBtn.visible  = false;
    this._startGlow.visible = false;
    this._cancelPlacement();
    this._hideInfoPanel();

    const W = this.app.screen.width;
    const H = this.app.screen.height;

    const overlay = new Graphics();
    overlay.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.75 });
    this._layers.ui.addChild(overlay);

    installFont('EndFont', {
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize:   140, fill: '#ffffff', fontWeight: 'bold',
    }, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz !');

    installFont('EndSubFont', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize:   40, fill: '#e2e8f0',
    }, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz !');

    const pw = 520, ph = 280;
    const px = W / 2 - pw / 2;
    const py = H / 2 - ph / 2;
    const ac = isWin ? 0x22c55e : 0xef4444;

    const panel = new Graphics();
    panel.roundRect(px, py, pw, ph, 20)
         .fill({ color: isWin ? 0x1a3a1a : 0x3a1a1a, alpha: 0.97 })
         .stroke({ width: 3, color: ac, alpha: 0.9 });
    panel.roundRect(px, py, pw, 5, 20).fill({ color: ac, alpha: 1 });
    this._layers.ui.addChild(panel);

    const mainTxt = new BitmapText({
      text:  isWin ? 'VICTORY!' : 'DEFEATED',
      style: { fontFamily: 'EndFont', fontSize: 140 },
    });
    mainTxt.scale.set(0.52);
    mainTxt.tint  = isWin ? 0x4ade80 : 0xf87171;
    mainTxt.x     = W / 2 - mainTxt.width / 2;
    mainTxt.y     = py + 28;
    this._layers.ui.addChild(mainTxt);

    const subTxt = new BitmapText({
      text:  isWin ? 'All waves survived!' : 'Your base was destroyed!',
      style: { fontFamily: 'EndSubFont', fontSize: 40 },
    });
    subTxt.scale.set(0.34); subTxt.alpha = 0.65;
    subTxt.x = W / 2 - subTxt.width / 2;
    subTxt.y = py + 130;
    this._layers.ui.addChild(subTxt);

    const btnW = 220, btnH = 56;
    const btnX = W / 2 - btnW / 2;
    const btnY = py + 196;

    const btn = new Graphics();
    btn.roundRect(btnX, btnY, btnW, btnH, 12)
       .fill({ color: isWin ? 0x166534 : 0x7f1d1d, alpha: 1 })
       .stroke({ width: 2.5, color: ac, alpha: 0.9 });
    btn.eventMode = 'static'; btn.cursor = 'pointer';
    this._layers.ui.addChild(btn);

    const btnTxt = new BitmapText({
      text:  'PLAY AGAIN',
      style: { fontFamily: 'BtnFont', fontSize: 52 },
    });
    btnTxt.scale.set(0.32); btnTxt.tint = ac;
    btnTxt.x = btnX + btnW / 2 - btnTxt.width / 2;
    btnTxt.y = btnY + btnH / 2 - btnTxt.height / 2;
    this._layers.ui.addChild(btnTxt);

    btn.on('pointerover', () => { btn.alpha = 0.75; });
    btn.on('pointerout',  () => { btn.alpha = 1; });
    btn.on('pointerdown', () => { this.manager.goto(MapScene); });
  }

  _gameOver() { this._phase = 'gameover'; this._buildEndOverlay(false); }
  _showWin()  { this._buildEndOverlay(true); }

  _setupInput() {
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea   = this.app.screen;

    this._onPointerMove = (e) => {
      if (this._phase === 'gameover' || this._phase === 'win') return;

      // ignore if hovering over bottom bar
      if (e.global.y > this.app.screen.height - BOTTOM_H) return;

      const lx  = e.global.x - this._mapX;
      const ly  = e.global.y - this._mapY;
      const col = Math.floor(lx / TILE_SIZE);
      const row = Math.floor(ly / TILE_SIZE);

      this._hoverHighlight.clear();
      if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return;

      if (this._pendingType && this.grid.isBuildable(col, row)) {
        const can   = this.gold >= TOWER_TYPES[this._pendingType].cost;
        const color = can ? 0x22c55e : 0xef4444;
        this._hoverHighlight
          .rect(this._mapX + col * TILE_SIZE + 2,
                this._mapY + row * TILE_SIZE + 2,
                TILE_SIZE - 4, TILE_SIZE - 4)
          .fill({ color, alpha: 0.35 })
          .stroke({ width: 2, color, alpha: 1 });
      } else if (!this._pendingType && this.grid.isBuildable(col, row)) {
        this._hoverHighlight
          .rect(this._mapX + col * TILE_SIZE + 2,
                this._mapY + row * TILE_SIZE + 2,
                TILE_SIZE - 4, TILE_SIZE - 4)
          .fill({ color: 0xffffff, alpha: 0.1 })
          .stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
      }
    };

    this._onPointerDown = (e) => {
      if (this._phase === 'gameover' || this._phase === 'win') return;

      // ── clicks in the bottom bar area — ignore for map logic ──
      // this prevents tower card clicks from cancelling placement
      if (e.global.y > this.app.screen.height - BOTTOM_H) return;

      // ── clicks in top bar — ignore ────────────────────────────
      if (e.global.y < TOP_H) return;

      const lx  = e.global.x - this._mapX;
      const ly  = e.global.y - this._mapY;
      const col = Math.floor(lx / TILE_SIZE);
      const row = Math.floor(ly / TILE_SIZE);

      // outside map columns/rows — cancel
      if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) {
        this._cancelPlacement();
        this._hideInfoPanel();
        return;
      }

      const cell = this.grid.state[row]?.[col];
      if (!cell) return;

      if (cell.tower) {
        this._cancelPlacement();
        if (this._infoPanelTower === cell.tower) this._hideInfoPanel();
        else this._showInfoPanel(cell.tower);
      } else if (this.grid.isBuildable(col, row)) {
        this._hideInfoPanel();
        if (this._pendingType) this._placeTowerAt(col, row);
      } else {
        this._cancelPlacement();
        this._hideInfoPanel();
      }
    };

    this._onKeyDown = (e) => {
      if (e.key === 'Escape') {
        this._cancelPlacement();
        this._hideInfoPanel();
      }
    };

    this.app.stage.on('pointermove', this._onPointerMove);
    this.app.stage.on('pointerdown', this._onPointerDown);
    window.addEventListener('keydown', this._onKeyDown);
  }

  async enter() {
    this.container.alpha = 0;
    return new Promise(resolve => {
      const tick = (ticker) => {
        this.container.alpha += ticker.deltaMS / 500;
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
    this.app.stage.off('pointermove', this._onPointerMove);
    this.app.stage.off('pointerdown', this._onPointerDown);
    window.removeEventListener('keydown', this._onKeyDown);
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
    this._time += ticker.deltaMS;
    const enemies = this.spawner.getEnemies();
    this.spawner.update(ticker);
    this.towerSystem.update(ticker, enemies);
    this.projSystem.update(ticker, enemies);

    if (this._baseFlashT > 0) {
      this._baseFlashT      -= ticker.deltaMS;
      this._baseBarGlow.alpha = 0.4 + 0.3 * Math.abs(Math.sin(this._time * 0.02));
      this._baseBarGlow.tint  = 0xff4444;
    } else {
      this._baseBarGlow.alpha = 0.2;
      this._baseBarGlow.tint  = 0xffffff;
    }

    if (this._startGlow?.visible) {
      this._btnPulse      += ticker.deltaMS / 1000;
      this._startGlow.alpha =
        0.2 + 0.3 * Math.abs(Math.sin(this._btnPulse * 2.0));
    }
  }

  destroy() {
    this.tileRenderer.destroy();
    this.towerSystem.destroy();
    this.projSystem.destroy();
    this.container.destroy({ children: true });
  }
}
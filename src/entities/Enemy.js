import { Container, Sprite, Assets, Graphics } from 'pixi.js';
import { ENEMY_TYPES } from '../constants.js';

// map enemy type to kenney sprite
const ENEMY_SPRITE_MAP = {
  drone:  'enemy-a',  // small UFO
  tank:   'enemy-b',  // larger UFO
  ghost:  'enemy-c',  // different UFO style
  bomber: 'enemy-d',  // bomber UFO
};

export class Enemy extends Container {
  constructor(type, waypoints) {
    super();
    this.enemyType  = type;
    this.def        = ENEMY_TYPES[type];
    this.waypoints  = waypoints;

    this.hp         = this.def.hp;
    this.maxHp      = this.def.hp;
    this.speed      = this.def.speed;
    this.reward     = this.def.reward;
    this.slowTimer  = 0;
    this.slowFactor = 1;

    this._wpIndex   = 0;
    this._arrived   = false;
    this.dead       = false;
    this._rewarded  = false;
    this._counted   = false;
    this._removed   = false;
    this._pulseT    = 0;

    this.onDeathSplash = null;

    this._build();
    this._setPosition();
  }

  _build() {
    const alias   = ENEMY_SPRITE_MAP[this.enemyType] ?? 'enemy-a';
    const texture = Assets.get(alias);

    if (texture) {
      this._sprite = new Sprite(texture);
      // scale enemy to roughly half a tile
      const targetSize = this.def.size * 3.2;
      const sc         = targetSize / Math.max(this._sprite.width, this._sprite.height);
      this._sprite.scale.set(sc);
      this._sprite.anchor.set(0.5, 0.7);
      this.addChild(this._sprite);
    }

    // slow ice overlay
    this._iceOverlay = new Graphics();
    this._iceOverlay.circle(0, 0, this.def.size * 1.4)
      .fill({ color: 0x7dd3fc, alpha: 0.4 });
    this._iceOverlay.visible = false;
    this.addChild(this._iceOverlay);

    // health bar
    const barW = this.def.size * 3;
    const barH = 5;
    const barY = -(this.def.size * 2.2);

    const hpBg = new Graphics();
    hpBg.roundRect(-barW / 2, barY, barW, barH, 2)
        .fill({ color: 0x1a1a1a, alpha: 0.85 });
    this.addChild(hpBg);

    this._hpBar = new Graphics();
    this.addChild(this._hpBar);

    this._barW = barW;
    this._barY = barY;
    this._barH = barH;
    this._redrawHP();
  }

  _redrawHP() {
    this._hpBar.clear();
    const fraction = Math.max(this.hp / this.maxHp, 0);
    const w        = this._barW * fraction;
    const color    = fraction > 0.5 ? 0x22c55e
                   : fraction > 0.25 ? 0xf59e0b : 0xef4444;
    if (w > 0) {
      this._hpBar.roundRect(-this._barW / 2, this._barY, w, this._barH, 2)
                 .fill({ color, alpha: 1 });
    }
  }

  _setPosition() {
    if (!this.waypoints.length) return;
    this.x = this.waypoints[0].x;
    this.y = this.waypoints[0].y;
  }

  update(ticker) {
    if (this.dead || this._arrived) return;
    this._pulseT += ticker.deltaMS / 1000;
    const dt      = ticker.deltaMS / 1000;

    if (this.slowTimer > 0) {
      this.slowTimer          -= ticker.deltaMS;
      this._iceOverlay.visible = true;
      if (this.slowTimer <= 0) {
        this.slowFactor          = 1;
        this._iceOverlay.visible = false;
      }
    }

    const effectiveSpeed = this.speed * this.slowFactor;
    const target         = this.waypoints[this._wpIndex];
    if (!target) { this._arrived = true; return; }

    const dx   = target.x - this.x;
    const dy   = target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 2) {
      this._wpIndex++;
      if (this._wpIndex >= this.waypoints.length) {
        this._arrived = true; return;
      }
    } else {
      const step = effectiveSpeed * dt;
      this.x    += (dx / dist) * step;
      this.y    += (dy / dist) * step;

      // flip sprite to face direction of travel
      if (this._sprite) {
        this._sprite.scale.x = dx < 0
          ? -Math.abs(this._sprite.scale.x)
          :  Math.abs(this._sprite.scale.x);
      }
    }

    // hover bob
    if (this._sprite) {
      this._sprite.y = Math.sin(this._pulseT * 3) * 2;
    }
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp -= amount;
    this._redrawHP();

    // flash red
    if (this._sprite) {
      this._sprite.tint = 0xff6666;
      setTimeout(() => {
        if (this._sprite && !this.destroyed) {
          this._sprite.tint = 0xffffff;
        }
      }, 80);
    }

    if (this.hp <= 0) {
      this.dead = true;
      if (this.enemyType === 'bomber' && this.onDeathSplash) {
        this.onDeathSplash(this.x, this.y, this.def.deathSplash || 80);
      }
    }
  }

  applySlow(factor, duration) {
    if (this.def.phaseImmune) return;
    this.slowFactor = factor;
    this.slowTimer  = duration;
  }

  hasArrived() { return this._arrived; }
  isDead()     { return this.dead; }
}
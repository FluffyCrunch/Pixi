import { Container, Sprite, Assets, Graphics } from 'pixi.js';

const AMMO_MAP = {
  laser:  'ammo-bullet',
  cannon: 'ammo-cannonball',
  frost:  'ammo-arrow',
  tesla:  'ammo-boulder',
};

export class Projectile extends Container {
  constructor(type, x, y, target, def) {
    super();
    this.projType = type;
    this.x        = x;
    this.y        = y;
    this.target   = target;
    this.def      = def;
    this.speed    = 380;
    this.dead     = false;

    this._build();
  }

  _build() {
    const alias   = AMMO_MAP[this.projType] ?? 'ammo-bullet';
    const texture = Assets.get(alias);

    if (texture) {
      this._spr = new Sprite(texture);
      this._spr.anchor.set(0.5);
      const sc  = 28 / Math.max(this._spr.width, this._spr.height);
      this._spr.scale.set(sc);
      this.addChild(this._spr);
    } else {
      // fallback dot
      const g = new Graphics();
      g.circle(0, 0, 4).fill(0xffffff);
      this.addChild(g);
    }
  }

  update(ticker) {
    if (this.dead) return;
    if (!this.target || this.target.isDead() || this.target.hasArrived()) {
      this.dead = true; return;
    }

    const dt = ticker.deltaMS / 1000;
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const d  = Math.sqrt(dx * dx + dy * dy);

    this.rotation = Math.atan2(dy, dx);

    if (d < this.speed * dt + 6) {
      this.dead = true;
      this.target.takeDamage(this.def.damage);
    } else {
      this.x += (dx / d) * this.speed * dt;
      this.y += (dy / d) * this.speed * dt;
    }
  }

  isDead() { return this.dead; }
}
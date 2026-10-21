import { Container, Sprite, Graphics, Texture } from 'pixi.js';

class Particle extends Sprite {
  constructor() {
    super(Texture.EMPTY);
    this.anchor.set(0.5);
    this.visible = false;
    this.vx      = 0;
    this.vy      = 0;
    this.life    = 0;
    this.maxLife = 1;
  }
}

export class ParticlePool {
  constructor(size, container) {
    this.container = container;
    this.size      = size;
    this.particles = [];
  }

  // call once after app is ready — generates texture and builds pool
  init(app) {
    const g = new Graphics();
    g.circle(8, 8, 8).fill({ color: 0xffffff, alpha: 1 });
    this.texture = app.renderer.generateTexture(g);

    this.particles = Array.from({ length: this.size }, () => {
      const p = new Particle();
      p.texture = this.texture;
      this.container.addChild(p);
      return p;
    });
  }

  burst(x, y, count, tint) {
    let spawned = 0;
    for (const p of this.particles) {
      if (p.visible) continue;
      if (spawned >= count) break;

      p.visible  = true;
      p.x        = x;
      p.y        = y;
      p.life     = 0;
      p.maxLife  = 400 + Math.random() * 300;
      p.tint     = tint;
      p.alpha    = 1;

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3;
      p.vx       = Math.cos(angle) * speed;
      p.vy       = Math.sin(angle) * speed;
      p.scale.set(0.4 + Math.random() * 0.5);

      spawned++;
    }
  }

  update(ticker) {
    const dt = ticker.deltaMS / 1000;

    for (const p of this.particles) {
      if (!p.visible) continue;

      p.vy   += 3 * dt;
      p.vx   *= 0.96;
      p.vy   *= 0.96;
      p.x    += p.vx * dt * 60;
      p.y    += p.vy * dt * 60;

      p.life += ticker.deltaMS;
      const t = Math.min(p.life / p.maxLife, 1);
      p.alpha = 1 - t;
      p.scale.set((0.4 + Math.random() * 0.1) * (1 - t * 0.5));

      if (p.life >= p.maxLife) p.visible = false;
    }
  }
}
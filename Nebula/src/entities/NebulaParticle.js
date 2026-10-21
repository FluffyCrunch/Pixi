import { Sprite } from 'pixi.js';

export class NebulaParticle extends Sprite {
  constructor(texture) {
    super(texture);
    this.anchor.set(0.5);

    this.vx       = 0;
    this.vy       = 0;
    this.life     = 0;
    this.maxLife  = 1;
    this.baseScale = 1;
    this.isBurst  = false;
    this.visible  = false;
  }

  reset(canvasWidth, canvasHeight) {
    this.x = Math.random() * canvasWidth;
    this.y = Math.random() * canvasHeight;

    this.vx       = (Math.random() - 0.5) * 0.4;
    this.vy       = (Math.random() - 0.5) * 0.4;
    this.life     = 0;
    this.maxLife  = 4000 + Math.random() * 6000;
    this.baseScale = 0.3 + Math.random() * 0.7;
    this.isBurst  = false;

    this.alpha = 0;
    this.tint  = 0x4a90d9;
    this.scale.set(this.baseScale);
    this.visible = true;
  }
}
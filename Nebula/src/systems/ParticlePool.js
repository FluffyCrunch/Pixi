import { NebulaParticle } from '../entities/NebulaParticle.js';

const COLOUR_STOPS = [
  { t: 0.0, r: 0x4a, g: 0x90, b: 0xd9 },
  { t: 0.5, r: 0x7c, g: 0x3a, b: 0xed },
  { t: 1.0, r: 0xe2, g: 0x2d, b: 0x72 },
];

const BURST_COLOURS = [
  0xc084fc, // soft violet
  0xe879f9, // light magenta
  0xa78bfa, // muted purple
  0xf0abfc, // pale pink-purple
];

function lerpColour(t) {
  let a = COLOUR_STOPS[0];
  let b = COLOUR_STOPS[1];
  for (let i = 0; i < COLOUR_STOPS.length - 1; i++) {
    if (t <= COLOUR_STOPS[i + 1].t) {
      a = COLOUR_STOPS[i];
      b = COLOUR_STOPS[i + 1];
      break;
    }
  }
  const range = b.t - a.t;
  const local = range === 0 ? 0 : (t - a.t) / range;
  const r  = Math.round(a.r + (b.r - a.r) * local);
  const g  = Math.round(a.g + (b.g - a.g) * local);
  const b2 = Math.round(a.b + (b.b - a.b) * local);
  return (r << 16) | (g << 8) | b2;
}

function noise(x, y, t) {
  return Math.sin(x * 0.05 + t) * Math.cos(y * 0.05 + t * 0.7) * 0.5;
}

export class ParticlePool {
  constructor(size, texture, container) {
    this.particles = Array.from({ length: size }, () => {
      const p = new NebulaParticle(texture);
      container.addChild(p);
      return p;
    });
    this._recycleIndex = 0;
    this.activeCount   = 0;
  }

  spawn(x, y) {
    const p = this.particles.find(p => !p.visible);
    if (!p) return;
    p.reset(window.innerWidth, window.innerHeight);
    if (x !== undefined) { p.x = x; p.y = y; }
  }

  forceSpawn(x, y, index, total) {
    let p = this.particles.find(p => !p.visible);
    if (!p) {
      p = this.particles[this._recycleIndex % this.particles.length];
      this._recycleIndex++;
    }

    p.reset(window.innerWidth, window.innerHeight);

    p.x = x;
    p.y = y;

    const angle = (index / total) * Math.PI * 2;

    const rand  = Math.random();
    const speed = rand < 0.2
      ? 0.5 + Math.random() * 0.8          // ~20% slow — tight cluster near centre
      : rand < 0.85
        ? 5.0 + Math.random() * 2.5        // ~65% mid — clear gap from slow group
        : 10.0 + Math.random() * 3.5;      // ~15% fast — shoot well beyond mid

    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;

    p.baseScale = 0.35 + Math.random() * 0.45 + speed * 0.04;
    p.scale.set(p.baseScale);

    p.maxLife   = 1200 + Math.random() * 800;
    p.isBurst   = true;
    p.life      = 0;

    p.tint = BURST_COLOURS[
      Math.floor(Math.random() * BURST_COLOURS.length)
    ];
  }

  update(ticker, mouseX, mouseY, cursorVX, cursorVY) {
    const dt = ticker.deltaMS / 1000;
    const t  = ticker.elapsedMS / 1000;
    let active = 0;

    const cursorSpeed = Math.sqrt(
      cursorVX * cursorVX + cursorVY * cursorVY
    );

    const ATTRACT_RADIUS = Math.min(80 + cursorSpeed * 2, 140);
    const BASE_STRENGTH  = 1.8 + cursorSpeed * 0.1;

    for (const p of this.particles) {
      if (!p.visible) continue;
      active++;

      if (p.isBurst) {
        p.vy += 2.8 * dt;

        p.vx *= 0.93;
        p.vy *= 0.93;

        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;

        p.life += ticker.deltaMS;
        const lt = Math.min(p.life / p.maxLife, 1);

        p.alpha = lt < 0.02
          ? lt / 0.02        // near-instant flash on
          : 1 - lt;          // slow linear fade all the way out

        p.scale.set(p.baseScale * (1 - lt * 0.6));

        if (p.life >= p.maxLife) p.visible = false;

      } else {
        const dx   = mouseX - p.x;
        const dy   = mouseY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        if (dist < ATTRACT_RADIUS) {
          const strength = (1 - dist / ATTRACT_RADIUS) * BASE_STRENGTH;
          p.vx += (dx / dist) * strength * dt;
          p.vy += (dy / dist) * strength * dt;

          if (cursorSpeed > 3) {
            const nudge = (1 - dist / ATTRACT_RADIUS) * 0.12;
            p.vx += cursorVX * nudge;
            p.vy += cursorVY * nudge;
          }
        }

        const nx = noise(p.x, p.y, t * 0.3) * 0.04;
        const ny = noise(p.x + 100, p.y + 100, t * 0.3) * 0.04;
        p.vx += nx;
        p.vy += ny;

        p.vx *= 0.97;
        p.vy *= 0.97;

        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 6) {
          p.vx = (p.vx / speed) * 6;
          p.vy = (p.vy / speed) * 6;
        }

        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;

        if (p.x < 0)                  p.x = window.innerWidth;
        if (p.x > window.innerWidth)  p.x = 0;
        if (p.y < 0)                  p.y = window.innerHeight;
        if (p.y > window.innerHeight) p.y = 0;

        p.life += ticker.deltaMS;
        const lt = Math.min(p.life / p.maxLife, 1);

        p.alpha = lt < 0.1
          ? lt / 0.1
          : lt > 0.8
            ? 1 - (lt - 0.8) / 0.2
            : 1;

        p.scale.set(p.baseScale * (0.5 + lt * 0.5));
        p.tint = lerpColour(lt);

        if (p.life >= p.maxLife) p.visible = false;
      }
    }

    this.activeCount = active;
  }
}
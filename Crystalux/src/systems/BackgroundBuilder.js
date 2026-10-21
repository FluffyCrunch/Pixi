import { Container, Graphics, Sprite, Texture } from 'pixi.js';

export function buildBackground(app, container) {
  const W = app.screen.width;
  const H = app.screen.height;

  // ── base gradient ─────────────────────────────────────────────
  // deep space — dark blue at top fading to deep purple at bottom
  const base = new Graphics();
  base.rect(0, 0, W, H).fill(0x04040f);
  container.addChild(base);

  // gradient overlay — top strip
  base.rect(0, 0, W, H * 0.5)
    .fill({ color: 0x0a0520, alpha: 0.6 });

  // gradient overlay — bottom strip
  base.rect(0, H * 0.5, W, H * 0.5)
    .fill({ color: 0x100a2a, alpha: 0.4 });

  // ── large glow orbs ───────────────────────────────────────────
  const orbs = [
    { x: W * 0.15, y: H * 0.25, r: 220, color: 0x3b0764, alpha: 0.18 },
    { x: W * 0.82, y: H * 0.65, r: 280, color: 0x1e3a8a, alpha: 0.15 },
    { x: W * 0.50, y: H * 0.80, r: 180, color: 0x4c1d95, alpha: 0.12 },
    { x: W * 0.72, y: H * 0.18, r: 150, color: 0x0e7490, alpha: 0.10 },
  ];

  for (const orb of orbs) {
    // three layered circles per orb — soft glow effect
    for (let i = 3; i >= 1; i--) {
      const g = new Graphics();
      g.circle(orb.x, orb.y, orb.r * (i / 3) * 1.6)
        .fill({ color: orb.color, alpha: orb.alpha / i });
      container.addChild(g);
    }
  }

  // ── star field — three depth layers ───────────────────────────
  const starLayer = new Graphics();

  // layer 1 — tiny distant stars
  for (let i = 0; i < 280; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 0.3 + Math.random() * 0.5;
    const a = 0.2 + Math.random() * 0.4;
    starLayer.circle(x, y, r).fill({ color: 0xffffff, alpha: a });
  }

  // layer 2 — medium stars with slight blue tint
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 0.6 + Math.random() * 0.9;
    const a = 0.3 + Math.random() * 0.4;
    starLayer.circle(x, y, r)
      .fill({ color: 0xc7d2fe, alpha: a });
  }

  // layer 3 — bright foreground stars with glow halo
  for (let i = 0; i < 24; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    starLayer.circle(x, y, 2.8)
      .fill({ color: 0xffffff, alpha: 0.07 });
    starLayer.circle(x, y, 1.2)
      .fill({ color: 0xffffff, alpha: 0.95 });
  }

  container.addChild(starLayer);

  // ── nebula colour clouds ───────────────────────────────────────
  const clouds = [
    { x: W * 0.2,  y: H * 0.3,  w: W * 0.4, h: H * 0.3,
      color: 0x7c3aed, alpha: 0.04 },
    { x: W * 0.5,  y: H * 0.5,  w: W * 0.5, h: H * 0.4,
      color: 0x1d4ed8, alpha: 0.04 },
    { x: W * 0.0,  y: H * 0.6,  w: W * 0.35, h: H * 0.35,
      color: 0x9d174d, alpha: 0.03 },
  ];

  for (const c of clouds) {
    const g = new Graphics();
    g.ellipse(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, c.h / 2)
      .fill({ color: c.color, alpha: c.alpha });
    container.addChild(g);
  }

  // cache entire background — never redrawn
  container.cacheAsTexture(true);

  return container;
}
import { Graphics, Container } from 'pixi.js';

export function buildSceneBackground(app, container) {
  const W = app.screen.width;
  const H = app.screen.height;

  // ── sky gradient ──────────────────────────────────────────────
  const sky = new Graphics();
  // deep blue sky top
  sky.rect(0, 0, W, H * 0.55).fill(0x1a6eb5);
  // lighter horizon
  sky.rect(0, H * 0.35, W, H * 0.2).fill(0x5ba3d9);
  // warm horizon glow
  sky.rect(0, H * 0.48, W, H * 0.08).fill(0xf0a050);
  container.addChild(sky);

  // ── sun ───────────────────────────────────────────────────────
  const sun = new Graphics();
  sun.circle(W * 0.82, H * 0.18, 48).fill({ color: 0xffe066, alpha: 1 });
  // sun rays
  for (let i = 0; i < 12; i++) {
    const a  = (i / 12) * Math.PI * 2;
    const x1 = W * 0.82 + Math.cos(a) * 54;
    const y1 = H * 0.18 + Math.sin(a) * 54;
    const x2 = W * 0.82 + Math.cos(a) * 72;
    const y2 = H * 0.18 + Math.sin(a) * 72;
    sun.moveTo(x1, y1).lineTo(x2, y2)
       .stroke({ width: 3, color: 0xffe066, alpha: 0.5 });
  }
  sun.circle(W * 0.82, H * 0.18, 200)
     .fill({ color: 0xfff0a0, alpha: 0.06 });
  container.addChild(sun);

  // ── clouds ────────────────────────────────────────────────────
  const clouds = new Graphics();
  const cloudData = [
    { x: W * 0.15, y: H * 0.10, s: 1.2 },
    { x: W * 0.42, y: H * 0.07, s: 0.9 },
    { x: W * 0.65, y: H * 0.13, s: 1.4 },
    { x: W * 0.88, y: H * 0.06, s: 1.0 },
  ];
  for (const c of cloudData) {
    const r = 28 * c.s;
    clouds.circle(c.x,        c.y,      r      ).fill({ color: 0xffffff, alpha: 0.88 });
    clouds.circle(c.x + r,    c.y + 4,  r * 0.8).fill({ color: 0xffffff, alpha: 0.88 });
    clouds.circle(c.x - r,    c.y + 6,  r * 0.7).fill({ color: 0xffffff, alpha: 0.88 });
    clouds.circle(c.x + r*1.6,c.y + 10, r * 0.5).fill({ color: 0xffffff, alpha: 0.85 });
  }
  container.addChild(clouds);

  // ── distant mountains ─────────────────────────────────────────
  const mountains = new Graphics();
  const mtnData = [
    { x: W * 0.05, h: H * 0.28, w: W * 0.18, color: 0x3a6b8a },
    { x: W * 0.18, h: H * 0.22, w: W * 0.14, color: 0x4a7a9b },
    { x: W * 0.55, h: H * 0.25, w: W * 0.16, color: 0x3a6b8a },
    { x: W * 0.70, h: H * 0.20, w: W * 0.12, color: 0x4a7a9b },
  ];
  for (const m of mtnData) {
    mountains.moveTo(m.x - m.w, H * 0.52)
             .lineTo(m.x,       H * 0.52 - m.h)
             .lineTo(m.x + m.w, H * 0.52)
             .closePath()
             .fill({ color: m.color, alpha: 0.7 });
    // snow cap
    mountains.moveTo(m.x - m.w * 0.15, H * 0.52 - m.h * 0.75)
             .lineTo(m.x,               H * 0.52 - m.h)
             .lineTo(m.x + m.w * 0.15, H * 0.52 - m.h * 0.75)
             .closePath()
             .fill({ color: 0xffffff, alpha: 0.8 });
  }
  container.addChild(mountains);

  // ── rolling hills ─────────────────────────────────────────────
  const hills = new Graphics();
  // back hill — lighter green
  hills.moveTo(0, H * 0.62)
       .bezierCurveTo(W * 0.15, H * 0.48, W * 0.35, H * 0.44, W * 0.5, H * 0.5)
       .bezierCurveTo(W * 0.65, H * 0.56, W * 0.85, H * 0.44, W, H * 0.5)
       .lineTo(W, H).lineTo(0, H).closePath()
       .fill({ color: 0x4a9e4a, alpha: 1 });

  // front hill — darker green
  hills.moveTo(0, H * 0.75)
       .bezierCurveTo(W * 0.2, H * 0.62, W * 0.4, H * 0.58, W * 0.55, H * 0.66)
       .bezierCurveTo(W * 0.7, H * 0.74, W * 0.85, H * 0.60, W, H * 0.65)
       .lineTo(W, H).lineTo(0, H).closePath()
       .fill({ color: 0x3a8a3a, alpha: 1 });
  container.addChild(hills);

  // ── ground ────────────────────────────────────────────────────
  const ground = new Graphics();
  ground.rect(0, H * 0.68, W, H * 0.32).fill(0x5aaa3a);
  // grass texture strips
  for (let i = 0; i < 8; i++) {
    ground.rect(0, H * 0.68 + i * 12, W, 6)
          .fill({ color: 0x4a9a2a, alpha: 0.3 });
  }
  container.addChild(ground);

  // ── trees (left side) ─────────────────────────────────────────
  const trees = new Graphics();
  const treePositions = [
    { x: W * 0.04, y: H * 0.62, s: 1.1 },
    { x: W * 0.10, y: H * 0.65, s: 0.9 },
    { x: W * 0.16, y: H * 0.61, s: 1.3 },
    { x: W * 0.22, y: H * 0.64, s: 1.0 },
    { x: W * 0.92, y: H * 0.62, s: 1.1 },
    { x: W * 0.96, y: H * 0.65, s: 0.85 },
  ];
  for (const t of treePositions) {
    const h = 44 * t.s;
    const w = 18 * t.s;
    // trunk
    trees.rect(t.x - 3, t.y, 6, h * 0.45)
         .fill({ color: 0x7a4a1a, alpha: 1 });
    // foliage layers
    trees.moveTo(t.x, t.y - h)
         .lineTo(t.x + w, t.y - h * 0.3)
         .lineTo(t.x - w, t.y - h * 0.3)
         .closePath()
         .fill({ color: 0x2d8a2d, alpha: 1 });
    trees.moveTo(t.x, t.y - h * 0.75)
         .lineTo(t.x + w * 1.2, t.y)
         .lineTo(t.x - w * 1.2, t.y)
         .closePath()
         .fill({ color: 0x3aaa3a, alpha: 1 });
  }
  container.addChild(trees);

  // ── ambient dark vignette to help map readability ─────────────
  const vignette = new Graphics();
  vignette.rect(0, 0, W, H)
    .fill({ color: 0x000000, alpha: 0.15 });
  container.addChild(vignette);

  container.cacheAsTexture(true);
  return container;
}
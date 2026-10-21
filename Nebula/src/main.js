import { Application, Assets, Graphics } from 'pixi.js';
import { buildLayers, buildBackground,
         buildShaders }                  from './systems/RenderSystem.js';
import { ParticlePool }                  from './systems/ParticlePool.js';
import { InputSystem }                   from './systems/InputSystem.js';
import { HUD }                           from './ui/HUD.js';

async function main() {
  const app = new Application();
  await app.init({
    resizeTo:    window,
    autoDensity: true,
    resolution:  window.devicePixelRatio || 1,
    antialias:   true,
    background:  0x000000,
  });
  document.body.appendChild(app.canvas);

  await Assets.init({ manifest: '/assets/manifest.json' });
  const particleTexture = generateParticleTexture(app);

  const { backgroundContainer,
          particleContainer,
          uiContainer } = buildLayers(app);

  buildBackground(app, backgroundContainer);

  const { nebulaFilter } = buildShaders(app, particleContainer);

  const pool  = new ParticlePool(2000, particleTexture, particleContainer);
  const input = new InputSystem(app.canvas, app);
  const hud   = new HUD(uiContainer);
  hud.setApp(app);

  for (let i = 0; i < 600; i++) pool.spawn();

  window.addEventListener('resize', () => {
    app.stage.hitArea = app.screen;
    hud._positionHint();
  });

  const TARGET_COUNT = 600;

  app.ticker.add((ticker) => {
    const t = ticker.elapsedMS / 1000;

    if (input.consume()) {
      const BURST_COUNT = 20;
      for (let i = 0; i < BURST_COUNT; i++) {
        pool.forceSpawn(input.x, input.y, i, BURST_COUNT);
      }
    }

    const deficit = TARGET_COUNT - pool.activeCount;
    if (deficit > 50) {
      for (let i = 0; i < 4; i++) pool.spawn();
    } else if (deficit > 0) {
      if (Math.random() < 0.6) pool.spawn();
    }

    pool.update(ticker, input.x, input.y, input.vx, input.vy);
    nebulaFilter.resources.uniforms.uniforms.uTime = t;
    hud.update(ticker.FPS, pool.activeCount);
  });
}

function generateParticleTexture(app) {
  const g = new Graphics();
  g.circle(32, 32, 32).fill({ color: 0xffffff, alpha: 0.12 });
  g.circle(32, 32, 22).fill({ color: 0xffffff, alpha: 0.25 });
  g.circle(32, 32, 12).fill({ color: 0xffffff, alpha: 1.00 });
  return app.renderer.generateTexture(g);
}

main();
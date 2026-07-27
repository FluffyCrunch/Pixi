import { Application, Assets } from 'pixi.js';
import { SceneManager }        from './systems/SceneManager.js';
import { MapScene }            from './scenes/MapScene.js';

async function main() {
  const app = new Application();
  await app.init({
    resizeTo:    window,
    autoDensity: true,
    resolution:  window.devicePixelRatio || 1,
    antialias:   true,
    background:  0x2d5a1b,
  });
  document.body.appendChild(app.canvas);

  await Assets.init({ manifest: '/assets/manifest.json' });

  // load ALL game assets before entering first scene
  await Assets.loadBundle('game');

  const manager = new SceneManager(app);
  app.ticker.add((ticker) => { manager.update(ticker); });
  await manager.goto(MapScene);
}

main();
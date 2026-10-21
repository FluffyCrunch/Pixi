import { Application, Assets } from 'pixi.js';
import { SceneManager }        from './systems/SceneManager.js';
import { AudioSystem }         from './systems/AudioSystem.js';
import { TitleScene }          from './scenes/TitleScene.js';

async function main() {
  const app = new Application();
  await app.init({
    resizeTo:    window,
    autoDensity: true,
    resolution:  window.devicePixelRatio || 1,
    antialias:   true,
    background:  0x04040f,
  });
  document.body.appendChild(app.canvas);

  await Assets.init({ manifest: '/assets/manifest.json' });

  // load audio files directly via fetch
  const audio = new AudioSystem();
  await audio.load({
    swap:  '/assets/audio/swap.mp3',
    match: '/assets/audio/match.mp3',
    bgm:   '/assets/audio/bgm.mp3',
    tick:  '/assets/audio/tick.mp3',
  });

  const manager = new SceneManager(app);

  // make audio available to all scenes via manager
  manager.audio = audio;

  app.ticker.add((ticker) => {
    manager.update(ticker);
  });

  await manager.goto(TitleScene);
}

main();
import { Container } from 'pixi.js';

export function buildRenderLayers(app) {
  const background  = new Container(); // static map
  const path        = new Container(); // path overlay
  const entities    = new Container(); // towers + enemies
  const projectiles = new Container(); // bullets, beams
  const effects     = new Container(); // particles, explosions
  const ui          = new Container(); // HUD, placement UI

  app.stage.addChild(background);
  app.stage.addChild(path);
  app.stage.addChild(entities);
  app.stage.addChild(projectiles);
  app.stage.addChild(effects);
  app.stage.addChild(ui);

  return { background, path, entities, projectiles, effects, ui };
}
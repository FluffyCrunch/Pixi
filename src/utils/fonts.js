import { BitmapFont, TextStyle, Cache } from 'pixi.js';

export function installFont(name, style, chars, resolution = 2) {
  if (Cache.has(`${name}-bitmap`)) return;
  BitmapFont.install({
    name,
    style: new TextStyle(style),
    chars,
    resolution,
  });
}
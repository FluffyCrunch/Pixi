import { Container, Filter, GlProgram, Sprite,
         Texture, Graphics } from 'pixi.js';

const vertexSrc = `
  in vec2 aPosition;
  out vec2 vTextureCoord;
  uniform vec4 uInputSize;
  uniform vec4 uOutputFrame;
  uniform vec4 uOutputTexture;

  vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (-2.0 / uOutputTexture.y) + 1.0;
    return vec4(position, 0.0, 1.0);
  }

  vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
  }

  void main(void) {
    gl_Position   = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
  }
`;

const fragmentSrc = `
  in vec2 vTextureCoord;
  out vec4 finalColor;
  uniform sampler2D uTexture;
  uniform float uTime;

  void main() {
    vec2 uv = vTextureCoord;
    float split = sin(uTime * 0.7) * 0.006;
    float r = texture(uTexture, uv + vec2(split,  0.0)).r;
    float g = texture(uTexture, uv).g;
    float b = texture(uTexture, uv - vec2(split,  0.0)).b;
    float a = texture(uTexture, uv).a;
    float pulse = 0.82 + 0.18 * sin(uTime * 1.4);
    finalColor = vec4(r, g, b, a) * pulse;
  }
`;

export function buildLayers(app) {
  const backgroundContainer = new Container();
  const particleContainer   = new Container();
  const uiContainer         = new Container();

  app.stage.addChild(backgroundContainer);
  app.stage.addChild(particleContainer);
  app.stage.addChild(uiContainer);

  return { backgroundContainer, particleContainer, uiContainer };
}

export function buildBackground(app, container) {
  const W = app.screen.width;
  const H = app.screen.height;
  const g = new Graphics();

  for (let i = 0; i < 800; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 0.4 + Math.random() * 0.6;
    const a = 0.15 + Math.random() * 0.25;
    g.circle(x, y, r).fill({ color: 0xffffff, alpha: a });
  }

  for (let i = 0; i < 340; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 0.8 + Math.random() * 1.0;
    const a = 0.2 + Math.random() * 0.3;
    g.circle(x, y, r).fill({ color: 0xaac4ff, alpha: a });
  }

  for (let i = 0; i < 150; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    g.circle(x, y, 3).fill({ color: 0xffffff, alpha: 0.06 });
    g.circle(x, y, 1.2).fill({ color: 0xffffff, alpha: 0.9 });
  }

  const texture = app.renderer.generateTexture(g);
  const star    = new Sprite(texture);
  container.addChild(star);

  container.cacheAsTexture(true);

  return container;
}

export function buildShaders(app, particleContainer) {
  const nebulaFilter = new Filter({
    glProgram: GlProgram.from({
      vertex:   vertexSrc,
      fragment: fragmentSrc,
    }),
    resources: {
      uniforms: {
        uTime: { value: 0.0, type: 'f32' },
      },
    },
  });

  particleContainer.filters = [nebulaFilter];

  return { nebulaFilter };
}
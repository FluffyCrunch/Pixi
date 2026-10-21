precision mediump float;

varying vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uTime;

void main() {
  vec2 uv = vTextureCoord;

  /* chromatic aberration —
     split R and B channels by a tiny time-driven offset
     gives that colourful fringe glow around each particle */
  float split = sin(uTime * 0.7) * 0.008;

  float r = texture2D(uTexture, uv + vec2(split,  0.0)).r;
  float g = texture2D(uTexture, uv).g;
  float b = texture2D(uTexture, uv - vec2(split,  0.0)).b;
  float a = texture2D(uTexture, uv).a;

  /* brightness pulse — subtle breathe over time */
  float pulse = 0.82 + 0.18 * sin(uTime * 1.4);

  gl_FragColor = vec4(r, g, b, a) * pulse;
}
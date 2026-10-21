export class AudioSystem {
  constructor() {
    this._ctx     = null;
    this._buffers = {};
    this._bgmNode = null;
    this._bgmGain = null;
    this._muted   = false;
  }

  // call this on first user gesture
  _ensureContext() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
    return this._ctx;
  }

  async load(files) {
    // pre-fetch and store raw array buffers
    // we can't decode until context exists
    this._rawBuffers = {};
    await Promise.all(
      Object.entries(files).map(async ([key, url]) => {
        try {
          const res  = await fetch(url);
          this._rawBuffers[key] = await res.arrayBuffer();
        } catch (e) {
          console.warn(`Audio fetch failed: ${key}`, e);
        }
      })
    );
  }

  async _decodeAll() {
    if (!this._rawBuffers) return;
    const ctx = this._ensureContext();
    await Promise.all(
      Object.entries(this._rawBuffers).map(async ([key, arr]) => {
        try {
          // clone the buffer since decodeAudioData consumes it
          this._buffers[key] = await ctx.decodeAudioData(arr.slice(0));
        } catch (e) {
          console.warn(`Audio decode failed: ${key}`, e);
        }
      })
    );
    this._rawBuffers = null; // free memory
  }

  // call once on first user interaction
  async unlock() {
    if (this._unlocked) return;
    this._unlocked = true;
    await this._decodeAll();
  }

  play(key, volume = 1.0, pitch = 1.0) {
    if (this._muted || !this._ctx) return;
    const buffer = this._buffers[key];
    if (!buffer) return;

    const source            = this._ctx.createBufferSource();
    const gainNode          = this._ctx.createGain();
    source.buffer           = buffer;
    source.playbackRate.value = pitch;
    gainNode.gain.value     = volume;
    source.connect(gainNode);
    gainNode.connect(this._ctx.destination);
    source.start(0);
  }

  startBGM(key, volume = 0.25) {
    if (this._bgmNode) this.stopBGM();
    if (!this._ctx) return;
    const buffer = this._buffers[key];
    if (!buffer) return;

    this._bgmGain            = this._ctx.createGain();
    this._bgmGain.gain.value = 0;
    this._bgmGain.connect(this._ctx.destination);

    this._bgmNode        = this._ctx.createBufferSource();
    this._bgmNode.buffer = buffer;
    this._bgmNode.loop   = true;
    this._bgmNode.connect(this._bgmGain);
    this._bgmNode.start(0);

    this._bgmGain.gain.linearRampToValueAtTime(
      volume, this._ctx.currentTime + 2
    );
  }

  stopBGM(fadeDuration = 1.5) {
    if (!this._bgmNode || !this._bgmGain) return;
    const now = this._ctx.currentTime;
    this._bgmGain.gain.linearRampToValueAtTime(0, now + fadeDuration);
    const node = this._bgmNode;
    setTimeout(() => { try { node.stop(); } catch (_) {} },
      fadeDuration * 1000);
    this._bgmNode = null;
    this._bgmGain = null;
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this._bgmGain) {
      this._bgmGain.gain.value = this._muted ? 0 : 0.25;
    }
    return this._muted;
  }

  stopAll() {
    this.stopBGM(0.3);
    if (this._ctx) {
      this._ctx.suspend().then(() => {
        this._ctx.resume();
      });
    }
  }
}
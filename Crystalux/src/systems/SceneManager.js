export class SceneManager {
  constructor(app) {
    this.app         = app;
    this.current     = null;
    this.audio       = null;
    this._navigating = false; // prevent concurrent navigation
  }

  async goto(SceneClass, data = {}) {
    // prevent double navigation — e.g. timer fires while transition running
    if (this._navigating) return;
    this._navigating = true;

    try {
      if (this.current) {
        // safely call exit
        if (typeof this.current.exit === 'function') {
          await this.current.exit();
        }

        // safely remove from stage
        if (this.current.container) {
          this.app.stage.removeChild(this.current.container);
        }

        // safely destroy
        if (typeof this.current.destroy === 'function') {
          this.current.destroy();
        }

        this.current = null;
      }

      const scene = new SceneClass(this.app, this, data);
      this.app.stage.addChild(scene.container);

      if (typeof scene.enter === 'function') {
        await scene.enter();
      }

      this.current = scene;

    } finally {
      // always release the lock even if something throws
      this._navigating = false;
    }
  }

  update(ticker) {
    if (this.current && typeof this.current.update === 'function') {
      this.current.update(ticker);
    }
  }
}
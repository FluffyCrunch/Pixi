export class TweenSystem {
  constructor() {
    this.tweens = [];
  }

  // animates target properties over duration ms
  // returns a Promise that resolves when complete
  to(target, props, duration) {
    return new Promise(resolve => {
      const start = {};
      for (const k in props) start[k] = target[k];

      this.tweens.push({
        target,
        props,
        start,
        duration,
        elapsed: 0,
        resolve,
      });
    });
  }

  // run multiple tweens in parallel, resolve when all done
  parallel(...tweenPromises) {
    return Promise.all(tweenPromises);
  }

  update(ticker) {
    this.tweens = this.tweens.filter(tw => {
      tw.elapsed += ticker.deltaMS;
      const t    = Math.min(tw.elapsed / tw.duration, 1);

      // ease in-out quad
      const ease = t < 0.5
        ? 2 * t * t
        : -1 + (4 - 2 * t) * t;

      for (const k in tw.props) {
        tw.target[k] = tw.start[k] +
          (tw.props[k] - tw.start[k]) * ease;
      }

      if (t >= 1) {
        // snap to exact final values
        for (const k in tw.props) tw.target[k] = tw.props[k];
        tw.resolve();
        return false; // remove from list
      }

      return true; // keep going
    });
  }
}
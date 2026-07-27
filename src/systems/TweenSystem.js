export class TweenSystem {
  constructor() {
    this.tweens = [];
  }

  to(target, props, duration) {
    return new Promise(resolve => {
      const start = {};
      for (const k in props) start[k] = target[k];
      this.tweens.push({ target, props, start, duration, elapsed: 0, resolve });
    });
  }

  parallel(...promises) {
    return Promise.all(promises);
  }

  update(ticker) {
    this.tweens = this.tweens.filter(tw => {
      tw.elapsed += ticker.deltaMS;
      const t    = Math.min(tw.elapsed / tw.duration, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      for (const k in tw.props) {
        tw.target[k] = tw.start[k] + (tw.props[k] - tw.start[k]) * ease;
      }

      if (t >= 1) {
        for (const k in tw.props) tw.target[k] = tw.props[k];
        tw.resolve();
        return false;
      }
      return true;
    });
  }
}
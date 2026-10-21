export class InputSystem {
  constructor(canvas, app) {
    this.x        = app.screen.width  / 2;
    this.y        = app.screen.height / 2;
    this.vx       = 0; // cursor velocity
    this.vy       = 0;
    this.clicking = false;

    this._prevX   = this.x;
    this._prevY   = this.y;

    const getPos = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (clientX - r.left) * (app.screen.width  / r.width),
        y: (clientY - r.top)  * (app.screen.height / r.height),
      };
    };

    canvas.addEventListener('mousemove', e => {
      const pos  = getPos(e.clientX, e.clientY);
      this.vx    = pos.x - this.x;
      this.vy    = pos.y - this.y;
      this.x     = pos.x;
      this.y     = pos.y;
    });

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const pos  = getPos(e.touches[0].clientX, e.touches[0].clientY);
      this.vx    = pos.x - this.x;
      this.vy    = pos.y - this.y;
      this.x     = pos.x;
      this.y     = pos.y;
    }, { passive: false });

    canvas.addEventListener('click', () => {
      this.clicking = true;
    });

    canvas.addEventListener('touchend', e => {
      if (e.changedTouches.length > 0) {
        const pos = getPos(
          e.changedTouches[0].clientX,
          e.changedTouches[0].clientY
        );
        this.x = pos.x;
        this.y = pos.y;
      }
      this.clicking = true;
    });
  }

  consume() {
    const c       = this.clicking;
    this.clicking = false;
    return c;
  }
}
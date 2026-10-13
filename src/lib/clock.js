// Relógio de reprodução (play/pause/seek/loop + eventos). Subclasses implementam draw().

export class Clock {
  constructor() {
    this.t = 0;
    this.playing = false;
    this.loop = true;
    this.listeners = { frame: [], end: [], state: [] };
    this._raf = 0;
    this._last = 0;
    this._tick = this._tick.bind(this);
  }

  on(evt, fn) {
    this.listeners[evt].push(fn);
    return () => (this.listeners[evt] = this.listeners[evt].filter((f) => f !== fn));
  }

  _emit(evt, ...args) {
    for (const fn of this.listeners[evt]) fn(...args);
  }

  get duration() {
    return 1;
  }

  draw() {}

  seek(t) {
    this.t = Math.min(Math.max(t, 0), this.duration);
    this.draw();
    this._emit('frame', this.t);
  }

  play() {
    if (this.playing) return;
    if (this.t >= this.duration) this.t = 0;
    this.playing = true;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
    this._emit('state', true);
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this._raf);
    this._emit('state', false);
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  _tick(now) {
    this.t += (now - this._last) / 1000;
    this._last = now;
    if (this.t >= this.duration) {
      if (this.loop) this.t %= this.duration;
      else {
        this.seek(this.duration);
        this.pause();
        this._emit('end');
        return;
      }
    }
    this.seek(this.t);
    this._raf = requestAnimationFrame(this._tick);
  }

  destroy() {
    this.pause();
    for (const k in this.listeners) this.listeners[k] = [];
  }
}

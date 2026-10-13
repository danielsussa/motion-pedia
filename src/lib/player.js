import { Clock } from './clock.js';
import { preload } from './assets.js';

// Player de motion em canvas. O motion sempre desenha em coordenadas lógicas (ex.: 1920×1080);
// `scale` só muda a resolução do canvas.
export class Player extends Clock {
  constructor(canvas, { scale = 1 } = {}) {
    super();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = scale;
  }

  // `ready` resolve quando imagens/áudios dos parâmetros terminam de carregar (o frame é redesenhado).
  load(motion, params, size) {
    this.motion = motion;
    this.params = params;
    this.resize(size);
    this._preload();
  }

  _preload() {
    const params = this.params;
    this.ready = preload(this.motion.params, params).then(() => this.params === params && this._rebuild());
    return this.ready;
  }

  resize({ w, h }) {
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.scale);
    this.canvas.height = Math.round(h * this.scale);
    this._rebuild();
  }

  setParams(params) {
    this.params = params;
    this._rebuild();
    this._preload();
  }

  get duration() {
    return this.motion.duration;
  }

  _env() {
    return { w: this.w, h: this.h, p: this.params, px: this.scale, duration: this.duration };
  }

  _rebuild() {
    this.state = this.motion.setup ? this.motion.setup(this._env()) : null;
    this.seek(this.t);
  }

  draw() {
    const { ctx } = this;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.save();
    this.motion.render(ctx, this.t, {
      ...this._env(),
      state: this.state,
      progress: this.t / this.duration,
    });
    ctx.restore();
  }
}

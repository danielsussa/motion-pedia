import { Clock } from './clock.js';

// Player de composição: monta a composição num quadro de tamanho fixo (ex.: 1920×1080)
// e escala via CSS para caber no host.
export class CompPlayer extends Clock {
  constructor(host, comp, params, { scale = 1 } = {}) {
    super();
    this.comp = comp;
    this.params = params;
    const { w, h } = comp.size;
    this.host = host;
    this.frame = document.createElement('div');
    this.frame.className = 'comp-frame';
    Object.assign(this.frame.style, {
      position: 'relative',
      width: `${w}px`,
      height: `${h}px`,
      overflow: 'hidden',
      transformOrigin: '0 0',
    });
    host.append(this.frame);
    this.setScale(scale);
    this._mount();
  }

  get duration() {
    return this.comp.duration;
  }

  setScale(s) {
    this.scale = s;
    this.frame.style.transform = `scale(${s})`;
    this.host.style.width = `${this.comp.size.w * s}px`;
    this.host.style.height = `${this.comp.size.h * s}px`;
  }

  _mount() {
    this.frame.replaceChildren();
    this.inst = this.comp.mount(this.frame, this.params);
    this.seek(this.t);
  }

  setParams(params) {
    this.params = params;
    this._mount();
  }

  draw() {
    this.inst.update(this.t);
  }

  destroy() {
    super.destroy();
    this.inst?.destroy?.();
    this.frame.remove();
  }
}

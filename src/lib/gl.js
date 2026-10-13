// Shaders de fragmento num ÚNICO contexto WebGL2 compartilhado (o Chrome mantém só ~16 contextos vivos;
// a galeria teria dezenas). O shader desenha num canvas oculto e o resultado é copiado para o ctx 2D.
//
// Uso no render(): shader(ctx, FRAG, { u_time: t, u_color: p.color }, env)
// O FRAG declara só os próprios uniforms + main(). Já existem: u_res (px reais), u_time, out vec4 outColor.
// Inclua GLSL_NOISE para ter snoise(vec3) (simplex 3D, ~[-1,1]).
// Imagem ou canvas como uniform vira sampler2D (ex.: { u_img: asset(p.photo) } + `uniform sampler2D u_img;`).
// Para enquadrar em cover no shader, passe também o retângulo de coverRect() (lib/image.js) normalizado.
import { hexToRgb } from './anim.js';

let canvas = null;
let gl = null;
const programs = new Map();

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const HEADER = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
out vec4 outColor;
`;

export const GLSL_NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

function init() {
  canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw new Error('WebGL2 indisponível');
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
}

function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`GLSL: ${gl.getShaderInfoLog(sh)}`);
  return sh;
}

function program(frag) {
  let p = programs.get(frag);
  if (p) return p;
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, HEADER + frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`GLSL link: ${gl.getProgramInfoLog(prog)}`);
  p = { prog, loc: new Map(), pos: gl.getAttribLocation(prog, 'a_pos') };
  programs.set(frag, p);
  return p;
}

// Texturas: imagens ficam em cache (sobem uma vez); canvas sobe de novo a cada chamada (conteúdo muda).
const texCache = new WeakMap();
function texture(src, unit) {
  const isCanvas = typeof HTMLCanvasElement !== 'undefined' && (src instanceof HTMLCanvasElement || src instanceof OffscreenCanvas);
  let tex = texCache.get(src);
  gl.activeTexture(gl.TEXTURE0 + unit);
  if (tex && !isCanvas) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    return;
  }
  if (!tex) {
    tex = gl.createTexture();
    texCache.set(src, tex);
  }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
const isTexSource = (v) => typeof v === 'object' && v !== null && !Array.isArray(v) && 'width' in v;

// Valores aceitos: número → float; [a,b] → vec2; [a,b,c] → vec3; [a,b,c,d] → vec4; '#rrggbb' → vec3 (0..1); boolean → float 0/1;
// imagem/canvas → sampler2D (uv 0..1 com origem embaixo à esquerda, como gl_FragCoord/u_res).
function setUniform(p, name, v, unit) {
  if (!p.loc.has(name)) p.loc.set(name, gl.getUniformLocation(p.prog, name));
  const l = p.loc.get(name);
  if (l == null) return;
  if (isTexSource(v)) {
    texture(v, unit);
    gl.uniform1i(l, unit);
    return;
  }
  if (typeof v === 'string') v = hexToRgb(v).map((c) => c / 255);
  if (typeof v === 'boolean') v = v ? 1 : 0;
  if (typeof v === 'number') gl.uniform1f(l, v);
  else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
  else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
  else if (v.length === 4) gl.uniform4f(l, v[0], v[1], v[2], v[3]);
}

export function shader(ctx, frag, uniforms, { w, h, px = 1 }) {
  if (!gl) init();
  const W = Math.max(1, Math.round(w * px));
  const H = Math.max(1, Math.round(h * px));
  if (canvas.width < W || canvas.height < H) {
    canvas.width = Math.max(canvas.width, W);
    canvas.height = Math.max(canvas.height, H);
  }
  const p = program(frag);
  gl.viewport(0, 0, W, H);
  gl.useProgram(p.prog);
  gl.enableVertexAttribArray(p.pos);
  gl.vertexAttribPointer(p.pos, 2, gl.FLOAT, false, 0, 0);
  setUniform(p, 'u_res', [W, H]);
  let unit = 0;
  for (const [k, v] of Object.entries(uniforms)) setUniform(p, k, v, isTexSource(v) ? unit++ : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  // o viewport fica no canto inferior esquerdo do canvas compartilhado
  ctx.drawImage(canvas, 0, canvas.height - H, W, H, 0, 0, w, h);
}

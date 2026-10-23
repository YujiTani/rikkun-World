// 動く見本の土台: 場面（空・草・人・妖怪）・時間割・描き係（Painter）・道具
import * as THREE from 'three';
export const SLASH = await fetch('/src/fx/nijiSlash3.json').then(r => r.json());
export const PATH = await fetch('/src/fx/bladePath.json').then(r => r.json());
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = x => 1 - (1 - clamp(x)) * (1 - clamp(x));
export const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
export function H(...v) { let h = 2166136261; for (const x of v) { h ^= Math.imul(Math.round(x * 997) + 12345, 2654435761); h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16; } return ((h >>> 0) % 100003) / 100003; }
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
const KS = 1.4;   // 刀の 通り道を 1.4 倍（射程 2.2 に 合わせる。人の 刀・うでも 同じ 倍率）
const wv = (p, l) => V(-p[0] * KS, 1.25 + (p[1] - 1.25) * KS, p[2] * KS + l);   // 軸 right,up,forward -> world（x は右を -x に）

// ---- 時間割（3 段を続けて）。窓は doc §0 の表（今の帯の窓）
export const SEGS = [
  { tech: 'katana_thrust', name: 'つき', t0: 0, t1: 40, w: [2, 6], G: 2, hitT: 2 },
  { tech: 'katana_kiriage', name: 'きりあげ', t0: 8, t1: 44, w: [19, 22], G: 3, hitT: 0 },
  { tech: 'katana_kesa', name: 'けさ', t0: 12, t1: 60, w: [28, 34], G: 6, hitT: 0 },
];
let acc = 0; for (const s of SEGS) { s.n = s.t1 - s.t0 + 1; s.g0 = acc; acc += s.n; }
export const TOTAL = acc + 18;
const LK = [[0, 0], [7, .75], [SEGS[1].g0 + 2, .75], [SEGS[1].g0 + 10, 1.0], [SEGS[2].g0 + 2, 1.0], [SEGS[2].g0 + 10, 1.05], [acc + 1, 1.05], [TOTAL, 0]];
export function lunge(f) {
  if (f <= 0) return 0;
  for (let i = 0; i < LK.length - 1; i++) { const [a, va] = LK[i], [b, vb] = LK[i + 1]; if (f <= b) return lerp(va, vb, smooth((f - a) / (b - a))); }
  return 0;
}
export const MON_FRONT = 2.0;
export function swordWorld(i) { const ps = poseAt(i); return { tip: wv(ps.tip, ps.lunge), base: wv(ps.base, ps.lunge) }; }
export function stageName(i) { return i < SEGS[1].g0 ? '1 つき' : i < SEGS[2].g0 ? '2 きりあげ' : '3 けさ'; }

function tickPose(seg, tau) {
  const arr = PATH[seg.tech].perTick; tau = clamp(tau, 0, arr.length - 1);
  const k = Math.min(arr.length - 2, Math.floor(tau)), f = tau - k;
  const m = (a, b) => a.map((v, j) => lerp(v, b[j], f));
  return { tip: m(arr[k].tip, arr[k + 1].tip), base: m(arr[k].base, arr[k + 1].base) };
}
export function poseAt(i) {
  let si = 0; for (let k = 0; k < SEGS.length; k++) if (i >= SEGS[k].g0) si = k;
  const s = SEGS[si]; const j = Math.min(i - s.g0, s.n - 1);
  const cur = tickPose(s, s.t0 + j);
  const prevSeg = SEGS[(si + 2) % 3];
  const prev = tickPose(prevSeg, prevSeg.t1);
  const b = smooth(j / 5);
  const m = (a, c) => a.map((v, q) => lerp(v, c[q], b));
  return { tip: m(prev.tip, cur.tip), base: m(prev.base, cur.base), lunge: lunge(i) };
}

// ---- 環境（1 つのわざの、窓の中の刃先・刃元の世界座標）
export function buildEnv(idx, seed) {
  const seg = SEGS[idx], [w0, w1] = seg.w, L = w1 - w0, tips = [], bases = [];
  for (let t = w0; t <= w1; t++) {
    const l = lunge(seg.g0 + (t - seg.t0)); const pt = PATH[seg.tech].perTick[t];
    tips.push(wv(pt.tip, l)); bases.push(wv(pt.base, l));
  }
  const sw = tips[L].clone().sub(tips[0]).normalize();
  const at = (arr, u) => { const x = clamp(u) * L, k = Math.min(L - 1, Math.floor(x)); return arr[k].clone().lerp(arr[k + 1], x - k); };
  const E = {
    seg, idx, L, G: seg.G, tips, bases, seed: seed * 10 + idx, swing: sw,
    start: seg.g0 + w0 - seg.t0,           // 窓のはじまりのコマ
    lin: u => at(tips, u), linB: u => at(bases, u),
    dirAt(u) { const d = at(tips, u + .12).sub(at(tips, u - .12)); return d.length() < 1e-4 ? sw.clone() : d.normalize(); },
    hitT: seg.hitT,
  };
  const ht = tips[Math.min(L, seg.hitT)];
  E.hitPos = V(clamp(ht.x, -.4, .4), clamp(ht.y, .45, 1.65), MON_FRONT - .03);
  return E;
}
export function envT(E, i) { return i - E.start; }   // 窓のはじまりから 数えた ステップ
export const HIT_FRAMES = () => SEGS.map((s, k) => s.g0 + s.w[0] - s.t0 + s.hitT);

// ---- 描き係
const colCache = {};
export const col = h => colCache[h] || (colCache[h] = (() => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; })());
export class Painter {
  constructor(scene, camera, max = 120000) {
    this.camera = camera; this.bufs = {};
    for (const [name, add, ro, dt] of [['n', false, 10, false], ['a', true, 12, false], ['d', false, 4, true], ['e', true, 4.5, true]]) {
      const pos = new Float32Array(max * 3), colr = new Float32Array(max * 4);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(colr, 4).setUsage(THREE.DynamicDrawUsage));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: dt, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
      m.frustumCulled = false; m.renderOrder = ro; scene.add(m);
      this.bufs[name] = { pos, colr, n: 0, g };
    }
    this.mode = 'n'; this.pool = []; this.pi = 0; this.bpool = []; this.bi = 0; this.scene = scene;
    this.camR = V(1, 0, 0); this.camU = V(0, 1, 0); this.eye = V();
  }
  begin() {
    this.bufs.n.n = 0; this.bufs.a.n = 0; this.bufs.d.n = 0; this.bufs.e.n = 0; this.deep = false; this.pi = 0; this.bi = 0; this.camera.updateMatrixWorld();
    const e = this.camera.matrixWorld.elements; this.camR.set(e[0], e[1], e[2]); this.camU.set(e[4], e[5], e[6]); this.eye.set(e[12], e[13], e[14]);
    this.mode = 'n';
  }
  end() {
    for (const b of Object.values(this.bufs)) { b.g.setDrawRange(0, b.n); b.g.attributes.position.needsUpdate = true; b.g.attributes.color.needsUpdate = true; }
    for (let k = this.pi; k < this.pool.length; k++) this.pool[k].visible = false; for (let k = this.bi; k < this.bpool.length; k++) this.bpool[k].mesh.visible = false;
  }
  add(on) { this.mode = this.deep ? (on ? 'e' : 'd') : (on ? 'a' : 'n'); return this; }
  _v(p, c, a) { const b = this.bufs[this.mode], i = b.n++; b.pos[i * 3] = p.x; b.pos[i * 3 + 1] = p.y; b.pos[i * 3 + 2] = p.z; b.colr[i * 4] = c[0]; b.colr[i * 4 + 1] = c[1]; b.colr[i * 4 + 2] = c[2]; b.colr[i * 4 + 3] = a; }
  tri(a, b, c, ca, cb, cc, aa, ab, ac) { this._v(a, ca, aa); this._v(b, cb, ab); this._v(c, cc, ac); }
  // 板（カメラ向き）
  quad(p, size, hex, a = 1, rot = 0) {
    const [w, h] = Array.isArray(size) ? size : [size, size]; const c = col(hex);
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const rx = this.camR.clone().multiplyScalar(cs).addScaledVector(this.camU, sn).multiplyScalar(w / 2);
    const ry = this.camU.clone().multiplyScalar(cs).addScaledVector(this.camR, -sn).multiplyScalar(h / 2);
    const A = p.clone().sub(rx).sub(ry), B = p.clone().add(rx).sub(ry), C = p.clone().add(rx).add(ry), D = p.clone().sub(rx).add(ry);
    this.tri(A, B, C, c, c, c, a, a, a); this.tri(A, C, D, c, c, c, a, a, a);
  }
  disc(p, r, hex, a = 1, soft = false, n = 10) {
    const c = col(hex);
    for (let k = 0; k < n; k++) {
      const t0 = k / n * 6.2832, t1 = (k + 1) / n * 6.2832;
      const q0 = p.clone().addScaledVector(this.camR, Math.cos(t0) * r).addScaledVector(this.camU, Math.sin(t0) * r);
      const q1 = p.clone().addScaledVector(this.camR, Math.cos(t1) * r).addScaledVector(this.camU, Math.sin(t1) * r);
      this.tri(p, q0, q1, c, c, c, a, soft ? 0 : a, soft ? 0 : a);
    }
  }
  // 帯（カメラ向き）。w: 数 | 配列 | 関数(0..1)。hex: 色 | 配列。a: 数 | 配列。soft: ふちを 0 に（グロー）
  ribbon(pts, w, hex, a = 1, o = {}) {
    const n = pts.length; if (n < 2) return;
    const side = [], W = [], C = [], A = [];
    for (let k = 0; k < n; k++) {
      const t = (k === 0 ? pts[1].clone().sub(pts[0]) : k === n - 1 ? pts[n - 1].clone().sub(pts[n - 2]) : pts[k + 1].clone().sub(pts[k - 1]));
      const vd = pts[k].clone().sub(this.eye).normalize();
      let s = t.cross(vd); if (s.length() < 1e-6) s = this.camR.clone(); s.normalize();
      side.push(s);
      W.push(typeof w === 'function' ? w(k / (n - 1), k) : Array.isArray(w) ? w[k] : w);
      C.push(col(Array.isArray(hex) ? hex[k] : hex));
      A.push(typeof a === 'function' ? a(k / (n - 1), k) : Array.isArray(a) ? a[k] : a);
    }
    for (let k = 0; k < n - 1; k++) {
      if (o.skip && o.skip(k)) continue;
      const L0 = pts[k].clone().addScaledVector(side[k], -W[k] / 2), R0 = pts[k].clone().addScaledVector(side[k], W[k] / 2);
      const L1 = pts[k + 1].clone().addScaledVector(side[k + 1], -W[k + 1] / 2), R1 = pts[k + 1].clone().addScaledVector(side[k + 1], W[k + 1] / 2);
      if (o.soft) {
        const c0 = pts[k], c1 = pts[k + 1];
        this.tri(L0, c0, L1, C[k], C[k], C[k + 1], 0, A[k], 0); this.tri(c0, c1, L1, C[k], C[k + 1], C[k + 1], A[k], A[k + 1], 0);
        this.tri(c0, R0, c1, C[k], C[k], C[k + 1], A[k], 0, A[k + 1]); this.tri(R0, R1, c1, C[k], C[k + 1], C[k + 1], 0, 0, A[k + 1]);
      } else {
        this.tri(L0, R0, L1, C[k], C[k], C[k + 1], A[k], A[k], A[k + 1]); this.tri(R0, R1, L1, C[k], C[k + 1], C[k + 1], A[k], A[k + 1], A[k + 1]);
      }
    }
  }
  // 格子 P[j][i]（j=よこ, i=ながれ）。cf(j,i) -> [hex, alpha]
  grid(P, cf) {
    for (let j = 0; j < P.length - 1; j++) for (let i = 0; i < P[0].length - 1; i++) {
      const q = [[j, i], [j + 1, i], [j + 1, i + 1], [j, i + 1]].map(([a, b]) => { const [h, al] = cf(a, b); return [P[a][b], col(h), al]; });
      this.tri(q[0][0], q[1][0], q[2][0], q[0][1], q[1][1], q[2][1], q[0][2], q[1][2], q[2][2]);
      this.tri(q[0][0], q[2][0], q[3][0], q[0][1], q[2][1], q[3][1], q[0][2], q[2][2], q[3][2]);
    }
  }
  flatRing(c, r, wd, hex, a = 1) {
    const cc = col(hex), n = 28;
    for (let k = 0; k < n; k++) {
      const t0 = k / n * 6.2832, t1 = (k + 1) / n * 6.2832, q = (t, rr) => V(c.x + Math.cos(t) * rr, .03, c.z + Math.sin(t) * rr);
      this.tri(q(t0, r - wd / 2), q(t0, r + wd / 2), q(t1, r + wd / 2), cc, cc, cc, a, a, a); this.tri(q(t0, r - wd / 2), q(t1, r + wd / 2), q(t1, r - wd / 2), cc, cc, cc, a, a, a);
    }
  }
  sprite(tex, p, size, a = 1, o = {}) {
    let m = this.pool[this.pi];
    if (!m) { m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false })); this.scene.add(m); this.pool.push(m); }
    this.pi++; m.visible = true; m.material.map = tex; m.material.opacity = a;
    const bl = o.add ? THREE.AdditiveBlending : THREE.NormalBlending; if (m.material.blending !== bl) { m.material.blending = bl; m.material.needsUpdate = true; }
    m.renderOrder = o.add ? 13 : 11;
    m.position.copy(p); m.quaternion.copy(this.camera.quaternion); if (o.rot) m.rotateZ(o.rot); const [w, h] = Array.isArray(size) ? size : [size, size]; m.scale.set(w, h, 1);
  }
  // 絵つきの 帯（筆・かすれ）。w: 関数(0..1)。tex は よこ ながれ。rep: 絵を くりかえす 回数。ro: 描く 順
  brush(pts, w, tex, o = {}) {
    const n = pts.length; if (n < 2) return;
    let it = this.bpool[this.bi];
    if (!it) { const M = 64, g = new THREE.BufferGeometry(); const pos = new Float32Array(M * 2 * 3), uv = new Float32Array(M * 2 * 2), c = new Float32Array(M * 2 * 4), idx = []; for (let k = 0; k < M - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(c, 4)); g.setIndex(idx);
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide })); mesh.frustumCulled = false; this.scene.add(mesh); it = { mesh, pos, uv, c, g, M }; this.bpool.push(it); }
    this.bi++; const m = it.mesh; m.visible = true; m.material.map = tex;
    const bl = o.add ? THREE.AdditiveBlending : THREE.NormalBlending; if (m.material.blending !== bl) { m.material.blending = bl; m.material.needsUpdate = true; }
    m.renderOrder = o.ro ?? (o.add ? 12 : 9);
    const N = Math.min(n, it.M); const rep = o.rep || 1; const al = o.a ?? 1;
    for (let k = 0; k < N; k++) {
      const t = k === 0 ? pts[1].clone().sub(pts[0]) : k === N - 1 ? pts[N - 1].clone().sub(pts[N - 2]) : pts[k + 1].clone().sub(pts[k - 1]);
      const vd = pts[k].clone().sub(this.eye).normalize(); let s = t.cross(vd); if (s.length() < 1e-6) s = this.camR.clone(); s.normalize();
      const u = k / (N - 1), ww = w(u, k) / 2, ak = typeof al === 'function' ? al(u, k) : al;
      for (let q = 0; q < 2; q++) { const p = pts[k].clone().addScaledVector(s, (q ? 1 : -1) * ww), i = k * 2 + q; it.pos[i * 3] = p.x; it.pos[i * 3 + 1] = p.y; it.pos[i * 3 + 2] = p.z; it.uv[i * 2] = u * rep + (o.scroll || 0); it.uv[i * 2 + 1] = q; const cc = o.tint ? col(o.tint) : [1, 1, 1]; it.c[i * 4] = cc[0]; it.c[i * 4 + 1] = cc[1]; it.c[i * 4 + 2] = cc[2]; it.c[i * 4 + 3] = ak; }
    }
    it.g.setDrawRange(0, (N - 1) * 6); it.g.attributes.position.needsUpdate = true; it.g.attributes.uv.needsUpdate = true; it.g.attributes.color.needsUpdate = true;
  }
}
// 顔: cam の向きに そった ベクトル
export function perpTo(P, d, p) { const vd = p.clone().sub(P.eye).normalize(); const s = d.clone().cross(vd); if (s.length() < 1e-6) return P.camR.clone(); return s.normalize(); }
export function camDir(P, ang) { return P.camR.clone().multiplyScalar(Math.cos(ang)).addScaledVector(P.camU, Math.sin(ang)); }

// ---- ピクセル絵の テクスチャ作り（Nearest）
export function pixTex(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const im = g.createImageData(w, h);
  fn((x, y, hex, a = 1) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const cc = new THREE.Color(hex).convertLinearToSRGB(); const i = (y * w + x) * 4; im.data[i] = Math.round(cc.r * 255); im.data[i + 1] = Math.round(cc.g * 255); im.data[i + 2] = Math.round(cc.b * 255); im.data[i + 3] = Math.round(a * 255); });
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}
// 網（ディザ）: level 0..3 でぬける
export function dither(x, y, level) { if (level <= 0) return true; if (level === 1) return !((x & 1) === 0 && (y & 1) === 0); if (level === 2) return ((x + y) & 1) === 1; return (x & 1) === 0 && (y & 1) === 0; }

// ---- 場面
function skyTexture() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#4aa8f0'); gr.addColorStop(1, '#bfe7ff'); g.fillStyle = gr; g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function groundTexture() {
  const c = document.createElement('canvas'); c.width = 2; c.height = 2; const g = c.getContext('2d');
  g.fillStyle = '#74c64c'; g.fillRect(0, 0, 2, 2); g.fillStyle = '#62b840'; g.fillRect(0, 0, 1, 1); g.fillRect(1, 1, 1, 1);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 20); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
const zAxis = V(0, 0, 1);
function between(m, a, b, wx, wy) { const d = b.clone().sub(a), len = d.length(); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(zAxis, d.normalize()); m.scale.set(wx, wy, len); }
const unit = (c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: c })); return m; };

export function makePanel(canvas, size = 300, dpr = 2, hgt = size) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(dpr); renderer.setSize(size, hgt, false); canvas.style.width = size + 'px'; canvas.style.height = hgt + 'px';
  const scene = new THREE.Scene(); scene.background = skyTexture();
  const camera = new THREE.PerspectiveCamera(46, size / hgt, .1, 100);
  camera.position.set(-2.95, 1.5, -0.8); camera.lookAt(0.45, 1.15, 1.3);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(-1, 3, -1.5); scene.add(dl);
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ map: groundTexture() })); gnd.rotation.x = -Math.PI / 2; scene.add(gnd);
  // 人
  const hero = new THREE.Group(); scene.add(hero);
  const add = (m, x, y, z) => { m.position.set(x, y, z); hero.add(m); return m; };
  add(box(.2, .8, .22, 0x2f3b6e), -.12, .4, 0); add(box(.2, .8, .22, 0x2f3b6e), .12, .4, 0);
  add(box(.5, .55, .28, 0xf4ead0), 0, 1.07, 0); add(box(.52, .08, .3, 0xd84a3a), 0, .82, 0);
  add(box(.3, .3, .3, 0xf0c8a0), 0, 1.5, 0); add(box(.32, .12, .32, 0x3a2a22), 0, 1.68, -.01);
  const armR = unit(0xf4ead0), armL = unit(0xf4ead0), blade = unit(0xe4ecf4), grip = unit(0x4a2c1c), tsuba = unit(0xd8b040); hero.add(armR, armL, blade, grip, tsuba);
  // 妖怪（箱）
  const mon = new THREE.Group(); scene.add(mon);
  const addM = (m, x, y, z) => { m.position.set(x, y, z); mon.add(m); };
  addM(box(.85, .9, .6, 0xe0553a), 0, .85, 0); addM(box(.7, .5, .5, 0xe0553a), 0, 1.55, 0); addM(box(.3, .4, .3, 0xb03a28), -.25, .2, 0); addM(box(.3, .4, .3, 0xb03a28), .25, .2, 0);
  addM(box(.12, .22, .12, 0xfff2c0), -.22, 1.9, 0); addM(box(.12, .22, .12, 0xfff2c0), .22, 1.9, 0);
  addM(box(.16, .16, .05, 0xffffff), -.17, 1.6, -.26); addM(box(.16, .16, .05, 0xffffff), .17, 1.6, -.26);
  addM(box(.07, .1, .05, 0x222222), -.17, 1.58, -.28); addM(box(.07, .1, .05, 0x222222), .17, 1.58, -.28);
  addM(box(.3, .08, .05, 0x601810), 0, 1.4, -.26); addM(box(.28, .5, .2, 0xc9452e), -.6, .95, 0); addM(box(.28, .5, .2, 0xc9452e), .6, .95, 0);
  const slashTex = new THREE.TextureLoader().load('/art/LEGEND-FX/proto/slash3_white_hi.png'); slashTex.magFilter = THREE.NearestFilter; slashTex.minFilter = THREE.NearestFilter; slashTex.colorSpace = THREE.SRGBColorSpace; slashTex.repeat.set(1 / 6, 1 / 6);
  const slashMesh = new THREE.Mesh(new THREE.PlaneGeometry(SLASH.plateBlocks, SLASH.plateBlocks * 132 / 192), new THREE.MeshBasicMaterial({ map: slashTex, transparent: true, alphaTest: .5, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  slashMesh.renderOrder = 5; slashMesh.visible = false; scene.add(slashMesh);
  const painter = new Painter(scene, camera);
  const jolts = HIT_FRAMES();
  return {
    scene, camera, painter, renderer,
    render(i, drawFx) {
      const ps = poseAt(i), l = ps.lunge; hero.position.set(0, 0, l);
      const tip = wv(ps.tip, 0), base = wv(ps.base, 0), dir = tip.clone().sub(base).normalize();
      const hand = base.clone().addScaledVector(dir, -.08), hand2 = base.clone().addScaledVector(dir, -.2);
      between(blade, base, tip, .035, .05); between(grip, base.clone().addScaledVector(dir, -.24), base, .05, .05); between(tsuba, base.clone().addScaledVector(dir, .0), base.clone().addScaledVector(dir, .03), .12, .12);
      between(armR, V(-.28, 1.3, 0), hand, .12, .12); between(armL, V(.28, 1.3, 0), hand2, .12, .12);
      let dz = 0, sq = 1; for (const jf of jolts) { const a = i - jf; if (a >= 0 && a < 9) { dz += .16 * Math.pow(1 - a / 9, 2); sq = Math.min(sq, 1 - .06 * (1 - a / 9)); } }
      mon.position.set(0, 0, MON_FRONT + .3 + dz); mon.scale.y = sq;
      updateSlash(i, slashMesh, slashTex, camera);
      painter.begin(); drawFx(painter, i); painter.end();
      renderer.render(scene, camera);
    },
  };
}
// 各わざの 環境を つくって、わざごとに fx(P, E, T) を呼ぶ
export function runVariant(variant, seed) {
  const envs = SEGS.map((_, k) => buildEnv(k, seed));
  return (P, i) => { for (const E of envs) { const T = envT(E, i); if (T >= -(variant.pre || 1) && T <= E.L + (variant.life || 14)) variant.draw(P, E, T, i); } };
}

// ---- 白い 斬撃の 土台（虹の 斬撃 v3 を 白に。nijiFx.ts の slashStep と 同じ 出し方）
const SPAWN = [2, 17, 26];   // firstStage の ステップ数（出る → 2 ステップ後の 決めが 当たりの 1 ステップ目）
const NAMES = ['thrust', 'kiriage', 'kesa'];
function updateSlash(i, mesh, tex, camera) {
  mesh.visible = false;
  for (let k = SEGS.length - 1; k >= 0; k--) {
    const s = SEGS[k], sf = s.g0 + SPAWN[k] - s.t0, age = i - sf; if (age < 0) continue;
    const steps = SLASH.techs[NAMES[k]].steps; let a = age, f = -1;
    for (let q = 0; q < steps.length; q++) { if (a < steps[q]) { f = q; break; } a -= steps[q]; }
    if (f < 0) continue;
    const l = lunge(sf), cam = camera.position, at = V(0, 1.4, l + 2.2), base = V(0, 1.4, l);
    const cx = at.x - cam.x, cz = at.z - cam.z, ll = Math.hypot(cx, cz);
    const ang = Math.acos(clamp(cz / ll, -1, 1)) * 180 / Math.PI;
    const view = (ang <= 35 || ang >= 145) ? 'flat' : (ang >= 55 && ang <= 125) ? 'side' : 'side';
    const mirror = cx / ll < 0;
    const sn = Math.sin(ang * Math.PI / 180), dist = 2.2 - .9 * sn, scale = 1 - .45 * sn, kk = dist / 2.2;
    const tip = V(base.x + (at.x - base.x) * kk, base.y - .1, base.z + (at.z - base.z) * kk);
    const row = SLASH.rows[NAMES[k]][view], ce = SLASH.techs[NAMES[k]].centroid[view][f];
    const u = SLASH.plateBlocks / 192 * scale, ccx = mirror ? 192 - 3 * ce[0] : 3 * ce[0];
    camera.updateMatrixWorld(); const e = camera.matrixWorld.elements;
    const pos = tip.clone().addScaledVector(V(e[0], e[1], e[2]), -(ccx - 96) * u).addScaledVector(V(e[4], e[5], e[6]), (3 * ce[1] - 66) * u);
    const d = pos.distanceTo(cam), kb = (d + 2.5) / d;
    mesh.position.copy(cam).addScaledVector(pos.sub(cam), kb); mesh.scale.setScalar(scale * kb);
    mesh.quaternion.copy(camera.quaternion);
    tex.repeat.set((mirror ? -1 : 1) / 6, 1 / 6); tex.offset.set((mirror ? f + 1 : f) / 6, 1 - (row + 1) / 6);
    mesh.visible = true; return;
  }
}

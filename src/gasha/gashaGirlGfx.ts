/**
 * #308 gashaGirl.ts を 分けた もの: 少女の 絵（canvas で 作る 光・輪・炎・渦）と、それを 貼る 材料・形を 作る 係。
 */
import {
  AdditiveBlending, CanvasTexture, CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, NormalBlending, PlaneGeometry, SRGBColorSpace,
  type Material, type Object3D,
} from 'three';
import { mulberry } from './gashaGirlMath';

export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** 白っぽい ふち ぼかしの 光の 玉（色は 材料の color で つける） */
function makeGlowTex(): CanvasTexture {
  return canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
}

/** 白〜灰の 輪（中は うすく うまっている） */
function makeRingTex(): CanvasTexture {
  return canvasTex(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(0.55, 'rgba(255,255,255,0.09)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.95)'); g.addColorStop(0.88, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  });
}

/** たてに 細長い とがった 炎の 絵（下が ふとい） */
function makeFlameTex(outer: string, mid: string, core: string, seed: number): CanvasTexture {
  return canvasTex(64, 256, (c) => {
    let rs = seed;
    const layers: [string, number][] = [[outer, 1], [mid, 0.62], [core, 0.28]];
    const curve = 9 + seed % 3;
    for (const [col, w] of layers) {
      c.shadowColor = col; c.shadowBlur = 8;
      const g = c.createLinearGradient(0, 256, 0, 0);
      g.addColorStop(0, col); g.addColorStop(0.7, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(32 - w * 24, 252);
      c.bezierCurveTo(32 - w * 28, 170, 32 - w * 8 + curve, 70, 32 + curve * 1.5, 8);
      c.bezierCurveTo(32 + w * 8 + curve, 70, 32 + w * 28, 170, 32 + w * 24, 252);
      c.closePath(); c.fill();
      rs = mulberry(rs)[0];
    }
  });
}

/** 上から 見た 渦の 炎（オレンジ〜黄〜白の 帯 6 本、外は ちぎれた 舌と 火の粉） */
function makeVortexTex(): CanvasTexture {
  const N = 512, R = 240;
  return canvasTex(N, N, (c) => {
    let rs = 12345;
    const rnd = () => { const [s, v] = mulberry(rs); rs = s; return v; };
    c.translate(N / 2, N / 2);
    c.globalCompositeOperation = 'lighter';
    const ARMS = 6;
    for (let k = 0; k < ARMS; k++) {
      const th0 = (k / ARMS) * Math.PI * 2;
      for (let i = 0; i < 150; i++) {
        const u = 0.08 + (i / 150) * 0.92;
        const th = th0 + u * 4.2 + Math.sin(u * 18 + k) * 0.06;
        const r = u * R;
        const w = 4 + 20 * u * (0.7 + 0.3 * Math.sin(u * 9 + k * 2));
        const tear = u > 0.65 && rnd() < (u - 0.55) * 1.2; // 外ほど ちぎれる
        const x = Math.cos(th) * r, y = Math.sin(th) * r;
        const a = tear ? 0.08 : 1;
        for (const [col, s] of [['rgba(255,90,10,0.30)', 1], ['rgba(255,190,50,0.45)', 0.6], ['rgba(255,255,225,0.6)', 0.26]] as const) {
          c.fillStyle = col.replace(/[\d.]+\)$/, `${parseFloat(col.slice(col.lastIndexOf(',') + 1)) * a})`);
          c.beginPath(); c.arc(x, y, w * s, 0, Math.PI * 2); c.fill();
        }
        if (u > 0.7 && rnd() < 0.18) { // 外へ のびる 舌
          c.strokeStyle = 'rgba(255,150,30,0.6)'; c.lineWidth = 2 + rnd() * 3;
          c.beginPath(); c.moveTo(x, y);
          c.quadraticCurveTo(Math.cos(th + 0.3) * (r + 18), Math.sin(th + 0.3) * (r + 18), Math.cos(th + 0.45) * (r + 36 * rnd()), Math.sin(th + 0.45) * (r + 36 * rnd()));
          c.stroke();
        }
      }
    }
    for (let i = 0; i < 60; i++) { // 火の粉
      const a = rnd() * Math.PI * 2, r = (0.5 + rnd() * 0.5) * R;
      c.fillStyle = 'rgba(255,200,90,0.8)'; c.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2, 2);
    }
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 30); // 中心の 白い 光
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,200,100,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 30, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'destination-in'; // ふちを 消す
    const m = c.createRadialGradient(0, 0, R * 0.8, 0, 0, N / 2);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = m; c.fillRect(-N / 2, -N / 2, N, N);
  });
}

export interface GirlGfx {
  glowTex: CanvasTexture; ringTex: CanvasTexture; vortexTex: CanvasTexture; bladeTex: CanvasTexture; flameTex: CanvasTexture;
  /** 足し合わせ(光る) の 材料 */
  basic(map: CanvasTexture, color?: number, opacity?: number): MeshBasicMaterial;
  /** 通常合成（重なっても 飽和しない） */
  basicN(map: CanvasTexture, color?: number, opacity?: number): MeshBasicMaterial;
  disc: CircleGeometry;
  /** 地面に 寝かせた 円板を 親に 足す（見えない） */
  flat(mat: Material, parent: Object3D): Mesh;
  /** 十字に 立てた 2 枚の 板を 親に 足す（見えない） */
  crossed(mat: Material, parent: Object3D): Group;
}

/** 絵と 材料と 形を 作る（作る 順番は もとの build と おなじ） */
export function createGirlGfx(): GirlGfx {
  const glowTex = makeGlowTex(), ringTex = makeRingTex(), vortexTex = makeVortexTex();
  const bladeTex = makeFlameTex('rgba(160,80,255,1)', 'rgba(200,150,255,1)', 'rgba(240,216,255,1)', 3);
  const flameTex = makeFlameTex('rgba(255,90,10,1)', 'rgba(255,200,60,1)', 'rgba(255,255,230,1)', 7);
  const basic = (map: CanvasTexture, color = 0xffffff, opacity = 1): MeshBasicMaterial => new MeshBasicMaterial({
    map, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  /** 通常合成（重なっても 飽和しない） */
  const basicN = (map: CanvasTexture, color = 0xffffff, opacity = 1): MeshBasicMaterial => new MeshBasicMaterial({
    map, color, transparent: true, opacity, blending: NormalBlending, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const disc = new CircleGeometry(1, 48).rotateX(-Math.PI / 2);
  const plane = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const flat = (mat: Material, parent: Object3D): Mesh => { const m = new Mesh(disc, mat); m.renderOrder = 3; m.visible = false; parent.add(m); return m; };
  const crossed = (mat: Material, parent: Object3D): Group => {
    const g = new Group();
    const a = new Mesh(plane, mat), b = new Mesh(plane, mat);
    b.rotation.y = Math.PI / 2; a.renderOrder = b.renderOrder = 4;
    g.add(a, b); g.visible = false; parent.add(g);
    return g;
  };
  return { glowTex, ringTex, vortexTex, bladeTex, flameTex, basic, basicN, disc, flat, crossed };
}

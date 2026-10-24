/**
 * #293 試作: つかれて 休む とき の「くるくる目」（目が まわっている 渦巻き。オーナー 2026-10-24）。
 * 目の 箱の 前に 置く 小さい 円板（クリーム色）に 黒い 渦巻きの 帯。ふだんは 見せない（hidden）。ゆっくり 回す（gashaBigActor.ts が 毎コマ rotate）。
 * 頭の 座標（もとの 座標。+x = 左、+y = 上、+z = 前）。数は gashaBigTuning.ts の tired.swirl*。
 */
import { BufferGeometry, CircleGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import { TUNE as T } from './gashaBigTuning';

/** 渦巻きの 帯（アルキメデスの 渦。平らな 帯の 三角形）。半径 r の 円板の 中に 入る */
export function spiralGeometry(r: number, turns: number, width: number, segs = 72): BufferGeometry {
  const pos: number[] = [];
  const a0 = 0.35; // 中心に ぽっかり 穴を あけない
  const rr = (t: number) => r * (0.12 + 0.82 * t);
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const th0 = a0 + t0 * turns * Math.PI * 2, th1 = a0 + t1 * turns * Math.PI * 2;
    const p = (th: number, t: number, s: number) => [Math.cos(th) * (rr(t) + s), Math.sin(th) * (rr(t) + s), 0] as const;
    const w = width / 2;
    const a = p(th0, t0, -w), b = p(th0, t0, w), c = p(th1, t1, -w), d = p(th1, t1, w);
    pos.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

export interface SwirlEyes {
  /** 頭の 関節に つける 親（頭の 向きの まま。ふだんは visible = false） */
  root: Group;
  /** 左右の 目の 渦（回す 対象。x が + = 左） */
  eyes: Group[];
  dispose(): void;
}

export function buildSwirlEyes(headQuat: { x: number; y: number; z: number; w: number }): SwirlEyes {
  const K = T.tired;
  const root = new Group();
  root.name = 'gashaSwirl';
  root.quaternion.set(headQuat.x, headQuat.y, headQuat.z, headQuat.w);
  root.visible = false;
  const disc = new CircleGeometry(K.swirlRadius, 24);
  const bone = new MeshBasicMaterial({ color: 0xfff6e4, side: DoubleSide, fog: false });
  const ink = new MeshBasicMaterial({ color: 0x2a1e1a, side: DoubleSide, fog: false });
  const spiral = spiralGeometry(K.swirlRadius, K.swirlTurns, K.swirlWidth);
  const eyes: Group[] = [];
  for (const s of [-1, 1]) {
    const g = new Group();
    g.name = s > 0 ? 'swirlL' : 'swirlR';
    g.position.set(s * 4.9, 9.4, 11.6);
    const d = new Mesh(disc, bone), sp = new Mesh(spiral, ink);
    sp.position.z = 0.05;
    d.frustumCulled = sp.frustumCulled = false;
    d.renderOrder = 7; sp.renderOrder = 8;
    g.add(d, sp);
    root.add(g);
    eyes.push(g);
  }
  return { root, eyes, dispose: () => { disc.dispose(); spiral.dispose(); bone.dispose(); ink.dispose(); } };
}

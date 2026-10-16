import * as THREE from 'three';
import { boxGeo } from './common';
import type { YokaiTitle } from '../contracts';

/**
 * 二つ名の 頭の印と、ヌシの ふんわり光（DESIGN 13.2、BALANCE §2.5）。
 *  - たいしょう = はちまき（きなり の帯 ＋ あい の結び目と はし 2 本）
 *  - ヌシ = かんむり（金・濃い金・とげ 5 本・水色の玉）＋ ふんわり光（からだを つつむ 光の箱 1 枚）
 * 印は 頭の グループの 子にする（首・かさ の動きに ついてくる）。ぬりかべ・おやぶん・なし は 印なし。
 */
export type NickMarkKind = 'hachimaki' | 'crown';

export interface NickMarks {
  group: THREE.Group;
  kind: NickMarkKind;
}

/** 頭の グループの中での 印の位置の めやす（箱の大きさ・高さ） */
interface HeadSpec {
  /** はちまき: 帯の中心の高さ・横と奥行き */
  bandY: number;
  bandW: number;
  bandD: number;
  /** かんむり: 台の下の高さ・横と奥行き */
  crownY: number;
  crownW: number;
  crownD: number;
}
const HEADS: Record<string, HeadSpec> = {
  // かさの 2 段め（y 1.43）・てっぺん（y 1.6）
  karakasa: { bandY: 1.43, bandW: 0.74, bandD: 0.74, crownY: 1.6, crownW: 0.4, crownD: 0.4 },
  // ちょうちん: どうの 上（ふたの上・えの まわり。つり手の グループの 中心から見た高さ）
  chochin: { bandY: -0.27, bandW: 0.5, bandD: 0.5, crownY: -0.3, crownW: 0.44, crownD: 0.44 },
  // ろくろくび: 頭（0〜0.5）の おでこ・まげの 上
  rokurokubi: { bandY: 0.465, bandW: 0.55, bandD: 0.55, crownY: 0.7, crownW: 0.4, crownD: 0.4 },
};

const KINARI = 0xfff6e0;
const AI = 0x3d5a9e;
const GOLD = 0xffd23f;
const GOLD_DEEP = 0xd9a520;
const ORB = 0x5fd3ff;

function box(g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, color: number): void {
  const m = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, y, z);
  g.add(m);
}

/** 頭の印。おやぶん・二つ名なし・ぬりかべ は null。顔は 前（-Z）なので 結び目は うしろ（+Z） */
export function buildNickMarks(kind: string, title: YokaiTitle): NickMarks | null {
  const s = HEADS[kind];
  if (!s || (title !== 'taisho' && title !== 'nushi')) return null;
  const group = new THREE.Group();
  group.name = 'nickMarks';
  if (title === 'taisho') {
    const h = 0.08;
    box(group, s.bandW, h, s.bandD, 0, s.bandY, 0, KINARI);
    const z = s.bandD / 2 + 0.03;
    box(group, 0.1, 0.1, 0.06, 0, s.bandY, z, AI);
    box(group, 0.04, 0.22, 0.03, -0.05, s.bandY - 0.14, z + 0.04, AI);
    box(group, 0.04, 0.22, 0.03, 0.05, s.bandY - 0.16, z + 0.05, AI);
    return { group, kind: 'hachimaki' };
  }
  const { crownW: w, crownD: d, crownY: y } = s;
  box(group, w, 0.08, d, 0, y + 0.04, 0, GOLD);
  box(group, w + 0.02, 0.04, d + 0.02, 0, y + 0.02, 0, GOLD_DEEP);
  const top = y + 0.08;
  // かどの とげ 4 本 ＋ 前の 高い とげ 1 本
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) box(group, 0.07, 0.12, 0.07, (sx * (w - 0.07)) / 2, top + 0.06, (sz * (d - 0.07)) / 2, GOLD);
  box(group, 0.08, 0.2, 0.08, 0, top + 0.1, -(d - 0.08) / 2, GOLD);
  // 前に 水色の玉
  box(group, 0.08, 0.08, 0.05, 0, y + 0.04, -d / 2 - 0.03, ORB);
  return { group, kind: 'crown' };
}

/** ヌシの ふんわり光（DESIGN 13.2）。すけ 9% を中心に 6%〜12% の あいだを 周期 2.5 秒で なめらかに */
export const NUSHI_GLOW = {
  color: 0xfff0b0,
  period: 2.5,
  minOpacity: 0.06,
  maxOpacity: 0.12,
  /** 地面から うかせる 高さ（体の高さの 割合） */
  liftRatio: 0.1,
} as const;

/** 光の すけ（t 秒）。周期 2.5 秒で なめらかに（点滅しない） */
export function nushiGlowOpacity(t: number): number {
  const mid = (NUSHI_GLOW.minOpacity + NUSHI_GLOW.maxOpacity) / 2;
  const amp = (NUSHI_GLOW.maxOpacity - NUSHI_GLOW.minOpacity) / 2;
  return mid + amp * Math.sin((2 * Math.PI * t) / NUSHI_GLOW.period);
}

/** からだを つつむ 光の箱 1 枚。地面から 高さの 1 割 うかせ、うしろを 書かない・たし算 */
export function createNushiGlow(size: { width: number; height: number; depth: number }): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color: NUSHI_GLOW.color,
    transparent: true,
    opacity: nushiGlowOpacity(0),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  // 夜の暗さを かけない（applyDollBrightness は skip を見る）
  mat.userData = { base: NUSHI_GLOW.color, skip: true };
  const h = size.height * (1 - NUSHI_GLOW.liftRatio);
  const m = new THREE.Mesh(boxGeo(size.width, h, size.depth), mat);
  m.position.y = size.height * NUSHI_GLOW.liftRatio + h / 2;
  m.name = 'nushiGlow';
  m.renderOrder = 2;
  return m;
}

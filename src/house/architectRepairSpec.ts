import type { Part, Prim, V3 } from '../animals/models/chickenSpec';
import data from '../town/repairFinal.json';
import { ARCH_COL, architectSpec } from './architectSpec';

/**
 * なおしに 出て いる 間（るす）だけの 建築士さんの 形。休みの 形（architectSpec）から、はちまきの わと うしろの 結び目 3 こを はずし、
 * ねじりはちまき・たすき・左前の 結び目を 足す。足す 部品の 数・色は 設計 JSON（repairFinal.json の architect）から 読む（手で 書きなおさない）。
 * 木づちは 休みの 形の まま。骨は 同じ なので、同じ 骨に 2 つの メッシュを かぶせて 入れかえられる。
 */
const PAL = data.palette as Record<string, string>;
const colorOf = (name: string): number => parseInt((PAL[name] ?? '#FF00FF').slice(1), 16);

interface Add {
  bone: string;
  shape: string;
  color: string;
  center?: number[];
  outer?: number[];
  hole?: number;
  box?: number[];
}

export function architectRepairSpec(): Part[] {
  const parts = architectSpec().map((p) => ({ ...p, prims: p.prims.slice() }));
  const head = parts.find((p) => p.name === 'head')!;
  // はずす: わ（ring）と、うしろの 結び目（z が 4.4 より うしろの 白い 箱 3 こ）
  head.prims = head.prims.filter((q) => !(q.k === 'ring' || (q.k === 'box' && q.a[2] >= 4.4 && q.col === ARCH_COL.hachi)));
  for (const a of data.architect.add as Add[]) {
    const part = parts.find((p) => p.name === a.bone)!;
    let prim: Prim;
    if (a.shape === 'ring') prim = { k: 'ring', c: a.center as V3, ro: a.outer as V3, ri: a.hole!, col: colorOf(a.color) };
    else {
      const b = a.box!;
      // たすきは 胴の 面を ぬる 箱（えりより あとに ぬる）
      prim = { k: 'box', a: [b[0]!, b[1]!, b[2]!], b: [b[3]!, b[4]!, b[5]!], col: colorOf(a.color), ...(a.bone === 'body' ? { paint: true } : {}) };
    }
    part.prims.push(prim);
  }
  return parts;
}

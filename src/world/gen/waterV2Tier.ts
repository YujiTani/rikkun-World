import { hash01 } from './random';
import type { FallPlan, Shelf, Stage } from './waterV2Types';
import { basinCells, basinNorm, Edit, waterLeaks, type Dir, type Ground } from './waterV2Kit';
import { WATER_TUNE as T } from './waterV2Table';

/**
 * 段々の 滝（ひな段）: 高い かべ（落差 tier.min 以上）を、台地の ふちを けずって 2〜4 段に わける。
 *   いちばん 下の 落ち口は もとの へりの まま。そこから うしろへ、段ごとに おく行き 4〜6・はば（滝の はば + 2 の 水 + 岩 1 マスずつ）の
 *   「たな」を ほり、その 底に 浅い たまりを 作る。上の 段ほど 台地の 内がわへ 引っこむ（水源の 池は いちばん 上の 落ち口の うしろ）。
 *   たなの まわりは もとの 岩を のこして 水を うける。落ち口の 列だけ 切って わきどころを おく。
 * 組めたか は 「水が もれない」で きめる（もれる なら 次の 形を ためす。どれも だめなら 1 段のまま）。
 */

const TI = T.tier;
const FALL = T.fall;

/** 水源の 池（うしろ rows 列。ふちの 列つき）。lip 列の 先頭が (lx, lz)、向き d、はば w、水面 top。置けなければ null */
export function sourceFor(g: Ground, lx: number, lz: number, d: Dir, w: number, top: number, free: (x: number, z: number) => boolean, hiSlack: number = FALL.sourceSlack[1], loSlack: number = FALL.sourceSlack[0]): { source: [number, number][]; sourceRing: [number, number][] } | null {
  const px = -d[1];
  const pz = d[0];
  const source: [number, number][] = [];
  const sourceRing: [number, number][] = [];
  const rows = FALL.sourceRows;
  const lo = loSlack;
  const hi = hiSlack;
  for (let r = 0; r <= rows + 1; r++) {
    for (let k = -2; k <= w + 1; k++) {
      const x = lx + k * px - r * d[0];
      const z = lz + k * pz - r * d[1];
      const inside = r >= 1 && r <= rows && k >= -1 && k <= w && !(r === rows && (k === -1 || k === w));
      if (r === 0 && k >= 0 && k < w) continue; // 落ち口の 列
      const h = g(x, z);
      if (h < 0 || !free(x, z)) return null;
      if (inside) {
        if (h < top + lo || h > top + hi) return null;
        source.push([x, z]);
      } else sourceRing.push([x, z]);
    }
  }
  return { source, sourceRing };
}

/** base（1 段）を ひな段に した 滝。作れなければ null */
export function notchUp(g: Ground, seed: number, base: FallPlan, free: (x: number, z: number) => boolean, build: (ed: Edit, g: Ground, seed: number, p: FallPlan) => void): FallPlan | null {
  const drop = base.top - base.level;
  if (drop < TI.min) return null;
  const nMax = Math.min(TI.maxStages, Math.floor(drop / TI.dropMin));
  const nMin = Math.max(2, Math.ceil(drop / TI.dropMax));
  if (nMax < nMin) return null;
  const key = base.lip[0]![0] * 7919 + base.lip[0]![1];
  const first = nMin + Math.floor(hash01(seed, key, 0, 9) * (nMax - nMin + 1));
  const order = [first];
  for (let n = nMax; n >= nMin; n--) if (n !== first) order.push(n);
  for (const n of order) {
    for (let t = 0; t < TI.attempts; t++) {
      const p = carve(g, seed + t * 101, key + t, base, n, free);
      if (p === null) continue;
      const ed = new Edit();
      build(ed, g, seed, p);
      if (waterLeaks(ed.blocks(), g).length === 0) return p;
    }
  }
  return null;
}

/** n 段の ひな段を 計画する（置けない 所が あれば null） */
function carve(g: Ground, seed: number, key: number, base: FallPlan, n: number, free: (x: number, z: number) => boolean): FallPlan | null {
  const d = base.d;
  const px = -d[1];
  const pz = d[0];
  const w = base.lip.length;
  const T0 = base.top;
  const drop = T0 - base.level;
  // 段ごとの 落差（上の 段から。余りは 上の 段に 足す）
  const each = Math.floor(drop / n);
  const extra = drop - each * n;
  const levels: number[] = [T0];
  for (let i = 0; i < n; i++) levels.push(levels[i]! - each - (i < extra ? 1 : 0));
  // たなの おく行き と 落ち口の 位置 u（いちばん 下の 落ち口 = 0、うしろは マイナス）
  const rows: number[] = [];
  for (let k = 1; k < n; k++) rows.push(TI.shelfRows[0] + Math.floor(hash01(seed, key, k, 1) * (TI.shelfRows[1] - TI.shelfRows[0] + 1)));
  const u: number[] = new Array<number>(n).fill(0);
  for (let k = n - 1; k >= 1; k--) u[k - 1] = u[k]! - (rows[k - 1]! + 1);
  const [x0, z0] = base.lip[0]!;
  const at = (uu: number, v: number): [number, number] => [x0 + uu * d[0] + v * px, z0 + uu * d[1] + v * pz];
  const stages: Stage[] = [];
  const shelfCells: [number, number][] = [];
  for (let j = 0; j < n; j++) {
    const lip: [number, number][] = [];
    const front: [number, number][] = [];
    for (let v = 0; v < w; v++) {
      lip.push(at(u[j]!, v));
      front.push(at(u[j]! + 1, v));
    }
    let shelf: Shelf | null = null;
    if (j < n - 1) {
      const level = levels[j + 1]!;
      const depth = TI.shelfDepth[0] + Math.floor(hash01(seed, key, j, 2) * (TI.shelfDepth[1] - TI.shelfDepth[0] + 1));
      const cells: [number, number][] = [];
      // 落ち口の すぐ うしろ（わきどころの 列）は 水に せず 岩の ぜき: わきどころの うしろが たまりだと、水が へった ぶん わきどころが 勝手に 水を 足してしまう
      const weir = (uu: number, v: number): boolean => uu === u[j + 1]! - 1 && v >= 0 && v < w;
      for (let uu = u[j]! + 1; uu <= u[j + 1]! - 1; uu++) for (let v = -1; v <= w; v++) if (!weir(uu, v)) cells.push(at(uu, v));
      shelf = { cells, level, depth, rim: [] };
      shelfCells.push(...cells);
      // たなの まわり（岩の ふち・落ち口の 列の よこ）: 水面より 高ければ もとの 岩、いつも 岩の かべを 置く（水面の 1 つ 上まで）。水の 列は 台地を ほる ので 水面より 高い 地面
      for (let uu = j === 0 ? u[0]! : u[j]! + 1; uu <= u[j + 1]!; uu++) {
        for (let v = -2; v <= w + 1; v++) {
          const [x, z] = at(uu, v);
          const h = g(x, z);
          if (h < 0 || !free(x, z)) return null;
          const lipRow = (uu === u[j + 1]! || (j === 0 && uu === u[0]!)) && v >= 0 && v < w;
          const water = uu > u[j]! && uu < u[j + 1]! && v >= -1 && v <= w && !weir(uu, v);
          if (lipRow) continue;
          if (water) {
            if (h < level + 1) return null;
          } else {
            if (h < level - TI.rimFill) return null;
            shelf.rim.push([x, z]); // 山の 中が ほら穴でも ぬけない ように、かべは 岩を 置く
          }
        }
      }
    }
    // 落ち口の 列の 地面は わきどころの 高さ いじょう
    for (const [x, z] of lip) if (g(x, z) < levels[j]! || !free(x, z)) return null;
    stages.push({ lip, front, top: levels[j]!, pool: j === n - 1 ? base.pool : null, shelf });
  }
  // いちばん 上の 落ち口の うしろに 水源の 池
  const src = sourceFor(g, stages[0]!.lip[0]![0], stages[0]!.lip[0]![1], d, w, T0, free, TI.sourceHigh, TI.sourceLow);
  if (src === null) return null;
  // 滝つぼ（下）が たなに かからない
  const wet = new Set(basinCells(base.pool).filter((q) => basinNorm(base.pool, q.x, q.z) <= 1).map((q) => q.x * 100003 + q.z));
  if (shelfCells.some(([x, z]) => wet.has(x * 100003 + z))) return null;
  if (src.source.some(([x, z]) => wet.has(x * 100003 + z))) return null;
  return { ...base, stages, lip: stages[0]!.lip, front: stages[0]!.front, top: T0, source: src.source, sourceRing: src.sourceRing };
}

import { GEN_CONFIG as C } from './config';
import { cellReady, isStepCell, stepCellAhead } from './countryFeatures';
import type { ShaftWorld } from './mineShafts';
import { terrainFor } from './terrain';
import { WATER_TUNE } from './waterV2Table';

/**
 * 山の 水の 計画の 先読み（#187）。山の 物の 計算（とくに 水の 計画）は 1 つで 0.3〜3 秒 かかる ので、プレイヤーが 山に 着く 前に
 * 近い 山から 1 コマ 数ミリ秒ずつ 計算 しておく。計算する のは 「いつ」だけで、できる 世界は かわらない（着いた とき まだ 終わって いなければ
 * sitesOfCell が のこりを その場で 計算する）。2P は 2 人ぶんの 中心を 渡す。
 */

const A = WATER_TUNE.ahead;
const B = C.biome;

interface Near {
  i: number;
  j: number;
  d: number;
}

// 近くの 山の 一覧（中心の 16 マス 升目が かわった ときだけ 作りなおす。毎コマ 配列を 作らない）
let listSig = Number.NaN;
let listSeed = Number.NaN;
let list: Near[] = [];
let at = 0;

function rebuild(seed: number, centers: readonly { x: number; z: number }[]): void {
  const T = terrainFor(seed);
  list = [];
  at = 0;
  const seen = new Set<number>();
  for (const c of centers) {
    const x0 = c.x - A.reach;
    const x1 = c.x + A.reach;
    const z0 = c.z - A.reach;
    const z1 = c.z + A.reach;
    // sitesIn と 同じ 升目の はんい（山の 点は 2×2 の まん中 → 1 升目 ひろく 見る）
    const i0 = Math.floor((x0 - B.pointMin - B.pointSpan - C.anchor.x) / B.cell) - 1;
    const i1 = Math.floor((x1 - B.pointMin - C.anchor.x) / B.cell);
    const j0 = Math.floor((z0 - B.pointMin - B.pointSpan - C.anchor.z) / B.cell) - 1;
    const j1 = Math.floor((z1 - B.pointMin - C.anchor.z) / B.cell);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (!isStepCell(T, i, j)) continue;
        const cell = T.map.cell(i, j);
        const d = Math.min(...centers.map((q) => Math.max(Math.abs(q.x - cell.px), Math.abs(q.z - cell.pz))));
        const k = i * 100003 + j;
        if (d > A.reach || seen.has(k)) continue;
        seen.add(k);
        list.push({ i, j, d });
      }
    }
  }
  list.sort((a, b) => a.d - b.d);
}

/**
 * 近い 山から 水の 計画を 少し すすめる。毎コマ 呼んで よい（すべて 終わった ら すぐ 返る）。
 * 1 コマの 上限は A.ms ミリ秒（少なくとも 1 歩は すすめる）。count = true なら 時間を 見ず A.steps 歩 だけ（E2E の count）。
 */
export function planWaterAhead(seed: number, shafts: ShaftWorld, centers: readonly { x: number; z: number }[], count: boolean): void {
  if (centers.length === 0) return;
  let sig = 0;
  for (const c of centers) sig = sig * 1000003 + (Math.floor(c.x / 16) + 4096) * 8192 + Math.floor(c.z / 16) + 4096;
  if (sig !== listSig || seed !== listSeed) {
    listSig = sig;
    listSeed = seed;
    rebuild(seed, centers);
  }
  const T = terrainFor(seed);
  const t0 = count ? 0 : performance.now();
  let steps = 0;
  while (at < list.length) {
    const n = list[at]!;
    if (cellReady(T, n.i, n.j, shafts) || stepCellAhead(T, n.i, n.j, shafts, A.run)) {
      at++;
      continue;
    }
    steps++;
    if (count ? steps >= A.steps : performance.now() - t0 >= A.ms) return;
  }
}

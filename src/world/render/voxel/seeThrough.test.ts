import { describe, expect, it } from 'vitest';
import { hasLook, occludes } from '../../../proto/voxel/looks';
import { MICRO_PARAMS, sampleSurface, newSample, type ColumnSource } from '../../../proto/voxel/terrain/microSurface';
import { scanColumn, type ColumnInfo } from '../../../proto/voxel/terrain/worldColumns';
import { isOpaqueIndex } from '../../blocks/blockTypes';
import { generateIsland } from '../../gen/generateIsland';
import { ArrayVoxelWorld } from '../../VoxelWorld';
import { SectionMesher } from './sectionMesher';

/**
 * 「段差の下が空の色にすけて見える」(issue #142、docs/tickets/SEETHRU.md)。
 * 調べた数え方（/mnt/project-files/vox-e/see-through-investigation.md 付録）をテストにしたもの:
 *   小ブロック段（micro）でセクションを作り、「見えるはずの小ブロックの面」が 全部 作られているかを数える。
 *
 * 見えるはずの面（= 穴の候補）の決め方は、メッシュの中身（格子・active）を見ずに、世界と小ブロック地形の式だけで決める:
 *   X = 固くてとなりの面をかくす種類のブロックで、その列の地面の表面ブロックではないもの
 *       （崖の下の段・れんがの下の草・おいたブロックの下）。
 *   T = X のとなりの「地面の表面ブロック」（草・土）。T の中は、小ブロック地形の高さ S より上が 空いている。
 *   X の T がわの面は、見えない面（Look の約束 3: 見えない面の外がわの層は ぜんぶ つまっている）なので 9×9 すべてがつまっている。
 *   その 1 小ブロックの向こう（T の中）が S より上で空いていれば、その 1 小ブロックの面は 作られていなければならない。
 *   → 作られていない面の数 = 「ぬけている小ブロックの面」。1 つでもある X の数 = 「穴のあるブロック」。
 * 期待はどちらも 0。
 */

const N = 9;
/** 面の向き: 上, 下, +x, -x, +z, -z（sectionMesher の DIR と同じ） */
const DIR: readonly (readonly [number, number, number])[] = [
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const AXIS_OF = [1, 1, 0, 0, 2, 2] as const;
/** 面の置き場の添字の幅（セクションの中の小ブロック座標は 0〜153） */
const P = 154;

function closed(k: number): boolean {
  return hasLook(k) ? occludes(k) : isOpaqueIndex(k);
}

/** 世界の列の情報を 1 回ずつだけ調べる（ColumnSource にもなる） */
class Columns implements ColumnSource {
  private readonly cache = new Map<number, ColumnInfo>();
  private readonly hCache = new Map<number, number>();
  private readonly tmp = newSample();
  constructor(private readonly world: ArrayVoxelWorld) {}

  info(bx: number, bz: number): ColumnInfo {
    const key = (bx + 4096) * 8192 + (bz + 4096);
    let c = this.cache.get(key);
    if (!c) {
      c = { ty: -1, kind: 0, reach: 0, rockOk: false };
      scanColumn(this.world, bx, bz, c);
      this.cache.set(key, c);
    }
    return c;
  }
  surfaceY(bx: number, bz: number): number {
    return this.info(bx, bz).ty;
  }
  reach(bx: number, bz: number): number {
    return this.info(bx, bz).reach;
  }
  rockOk(bx: number, bz: number): boolean {
    return this.info(bx, bz).rockOk;
  }
  /** 小ブロック (mx, mz) の列の S（小ブロック地形の高さ） */
  surfaceH(mx: number, mz: number): number {
    const key = (mx + 40000) * 100000 + (mz + 40000);
    let h = this.hCache.get(key);
    if (h === undefined) {
      sampleSurface(mx, mz, this, this.tmp);
      h = this.tmp.h;
      this.hCache.set(key, h);
    }
    return h;
  }
}

export interface HoleCount {
  /** ぬけている小ブロックの面（1/81 ブロック面）の数 */
  faces: number;
  /** 穴のあるブロック（X）の数 */
  blocks: number;
  /** 向きごとのぬけている面の数（上, 下, +x, -x, +z, -z） */
  byDir: number[];
  /** 調べた「見えるはずの小ブロックの面」の数（0 だと テストが何も調べていない） */
  checked: number;
}

const covered = new Uint8Array(6 * P * P * P);

/** セクション (cx, sy, cz) を小ブロック段で作って、見えるはずの面が全部あるか数える */
function countHoles(world: ArrayVoxelWorld, mesher: SectionMesher, cols: Columns, cx: number, sy: number, cz: number): HoleCount {
  const out: HoleCount = { faces: 0, blocks: 0, byDir: [0, 0, 0, 0, 0, 0], checked: 0 };
  const data = mesher.build(cx, sy, cz, 'micro');
  // 作られた四角を 面の置き場（向き, 面の高さ, u, v）ごとに 1 小ブロックずつ印にする
  covered.fill(0);
  for (const piece of data.pieces) {
    for (let q = 0; q + 3 < piece.vertexCount; q += 4) {
      const f = piece.data[q * 4 + 3] & 7;
      const ax = AXIS_OF[f];
      const a = ax === 0 ? 1 : 0;
      const b = ax === 2 ? 1 : 2;
      const plane = piece.positions[q * 3 + ax];
      let a0 = 9999;
      let a1 = -1;
      let b0 = 9999;
      let b1 = -1;
      for (let i = 0; i < 4; i++) {
        const va = piece.positions[(q + i) * 3 + a];
        const vb = piece.positions[(q + i) * 3 + b];
        if (va < a0) a0 = va;
        if (va > a1) a1 = va;
        if (vb < b0) b0 = vb;
        if (vb > b1) b1 = vb;
      }
      for (let u = a0; u < a1; u++) for (let v = b0; v < b1; v++) covered[((f * P + plane) * P + u) * P + v] = 1;
    }
  }
  const ox = cx * 16;
  const oy = sy * 16;
  const oz = cz * 16;
  for (let ly = 0; ly < 16; ly++) {
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const wx = ox + lx;
        const wy = oy + ly;
        const wz = oz + lz;
        const k = world.getIndex(wx, wy, wz);
        if (k <= 0 || !closed(k)) continue;
        if (cols.info(wx, wz).ty === wy) continue; // その列の地面の表面ブロック（小ブロック地形が描く）
        let blockHas = false;
        for (let f = 0; f < 6; f++) {
          const nx = wx + DIR[f][0];
          const ny = wy + DIR[f][1];
          const nz = wz + DIR[f][2];
          const nk = world.getIndex(nx, ny, nz);
          if (nk <= 0 || !closed(nk)) continue;
          if (cols.info(nx, nz).ty !== ny) continue; // となりが 地面の表面ブロック (T) のときだけ
          const ax = AXIS_OF[f];
          const plus = (f & 1) === 0;
          const a = ax === 0 ? 1 : 0;
          const b = ax === 2 ? 1 : 2;
          const base = [lx * N, ly * N, lz * N];
          const abs = [wx * N, wy * N, wz * N];
          for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
              const c = [0, 0, 0];
              c[ax] = plus ? N - 1 : 0;
              c[a] = i;
              c[b] = j;
              // となりの小ブロック（T の中）が S より上で 空いているか
              const mx = abs[0] + c[0] + DIR[f][0];
              const my = abs[1] + c[1] + DIR[f][1];
              const mz = abs[2] + c[2] + DIR[f][2];
              if (my < cols.surfaceH(mx, mz)) continue;
              out.checked++;
              const plane = base[ax] + c[ax] + (plus ? 1 : 0);
              if (covered[((f * P + plane) * P + base[a] + c[a]) * P + base[b] + c[b]] === 0) {
                out.faces++;
                out.byDir[f]++;
                blockHas = true;
              }
            }
          }
        }
        if (blockHas) out.blocks++;
      }
    }
  }
  return out;
}

/** 世界の全セクションを小ブロック段で作って数える（空のセクションは とばす） */
function countWorld(world: ArrayVoxelWorld, sizeX: number, sizeZ: number): HoleCount {
  const cols = new Columns(world);
  const mesher = new SectionMesher(world);
  const total: HoleCount = { faces: 0, blocks: 0, byDir: [0, 0, 0, 0, 0, 0], checked: 0 };
  const ny = Math.ceil(world.size.y / 16);
  for (let sy = 0; sy < ny; sy++) {
    for (let cz = 0; cz < Math.ceil(sizeZ / 16); cz++) {
      for (let cx = 0; cx < Math.ceil(sizeX / 16); cx++) {
        const h = countHoles(world, mesher, cols, cx, sy, cz);
        total.faces += h.faces;
        total.blocks += h.blocks;
        total.checked += h.checked;
        for (let f = 0; f < 6; f++) total.byDir[f] += h.byDir[f];
      }
    }
  }
  return total;
}

// ------------------------------------------------------------ 手作りの地形

const SIZE = 48;

/** 平らな高さ関数から 48×48 の地面を作る（y=0 は bedrock、下は stone、その上に dirt、てっぺんは grass） */
function terrain(topAt: (x: number, z: number) => number): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld({ x: SIZE, y: 48, z: SIZE });
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      const t = topAt(x, z);
      w.setBlock(x, 0, z, 'bedrock');
      w.fill(x, 1, z, x, t - 3, z, 'stone');
      w.fill(x, t - 2, z, x, t - 1, z, 'dirt');
      w.setBlock(x, t, z, 'grass');
    }
  }
  return w;
}

const TOP = 20;

describe('段差の下の面（#142）: 見えるはずの小ブロックの面が 全部ある', () => {
  // ---- 数え方そのものが 動いているか（0 を返すだけのテストにしない）
  it('数え方の確認: 平らな地面では「調べた面」が 0（段差が無い）で、段差があると調べた面が ふえる', () => {
    const flat = terrain(() => TOP);
    const cliff = terrain((x) => (x < 24 ? TOP : TOP + 2));
    expect(countWorld(flat, SIZE, SIZE).checked).toBe(0);
    expect(countWorld(cliff, SIZE, SIZE).checked).toBeGreaterThan(100);
  });

  // ---- 崖: 1・2・3 ブロックの高さの段差（x の向き・z の向き）
  for (const diff of [1, 2, 3]) {
    for (const axis of ['x', 'z'] as const) {
      it(`崖 ${diff} ブロック（${axis} の向き）: 崖のいちばん下の固いブロックの面が ぬけていない`, () => {
        const w = terrain((x, z) => ((axis === 'x' ? x : z) < 24 ? TOP : TOP + diff));
        const h = countWorld(w, SIZE, SIZE);
        expect(h.checked).toBeGreaterThan(0);
        expect(h.faces, `ぬけている面 ${h.faces}（向きごと ${h.byDir}）`).toBe(0);
        expect(h.blocks).toBe(0);
      });
    }
  }

  it('崖が 2 段・3 段（1 ブロックずつ 3 回・4 回さがる階段）: どの段のいちばん下も ぬけていない', () => {
    for (const steps of [2, 3]) {
      const w = terrain((x) => TOP + Math.min(steps, Math.floor(x / 12)));
      const h = countWorld(w, SIZE, SIZE);
      expect(h.checked, `${steps} 段`).toBeGreaterThan(0);
      expect(h.faces, `${steps} 段: ぬけている面 ${h.faces}（向きごと ${h.byDir}）`).toBe(0);
    }
  });

  it('くぼみ（深さ 1・2 の四角い穴。4 つの向きがある）: ぬけていない', () => {
    for (const depth of [1, 2]) {
      const w = terrain((x, z) => (x >= 16 && x < 32 && z >= 16 && z < 32 ? TOP - depth : TOP));
      const h = countWorld(w, SIZE, SIZE);
      expect(h.checked, `深さ ${depth}`).toBeGreaterThan(0);
      expect(h.faces, `深さ ${depth}: ぬけている面 ${h.faces}（向きごと ${h.byDir}）`).toBe(0);
    }
  });

  // ---- 建物の下・置いたブロックの下
  it('建物の下: 草の上の れんが のかべの下の草ブロックの横の面が ぬけていない（かべの列は地形ではない）', () => {
    const w = terrain(() => TOP);
    w.fill(20, TOP + 1, 10, 20, TOP + 3, 37, 'brick'); // z 方向に長い 高さ 3 のかべ
    const cols = new Columns(w);
    expect(cols.info(20, 20).ty).toBe(-1); // かべの列は 小ブロック地形にならない（前提）
    expect(cols.info(21, 20).ty).toBe(TOP);
    const h = countWorld(w, SIZE, SIZE);
    expect(h.checked).toBeGreaterThan(0);
    expect(h.faces, `ぬけている面 ${h.faces}（向きごと ${h.byDir}）`).toBe(0);
  });

  it('置いたブロックの下: 地面に 石を 1〜2 つ積むと、その下の草・土の横の面が ぬけていない', () => {
    const w = terrain(() => TOP);
    w.setBlock(24, TOP + 1, 24, 'stone');
    w.fill(30, TOP + 1, 24, 30, TOP + 2, 24, 'stone');
    w.fill(10, TOP + 1, 10, 13, TOP + 1, 13, 'dirt'); // 4×4 の高まり
    const h = countWorld(w, SIZE, SIZE);
    expect(h.checked).toBeGreaterThan(0);
    expect(h.faces, `ぬけている面 ${h.faces}（向きごと ${h.byDir}）`).toBe(0);
  });

  // ---- 上の面（小ブロック地形の下限 minAboveBase を 0 にしたとき）
  it('上の面: アートが minAboveBase を 0 にしても、表面ブロックの下のブロックの上の面が ぬけない', () => {
    // 今の数では S がブロックの底まで下がることは めったに無いので、くぼ地も深くして 底まで下がる所を作る
    const p = MICRO_PARAMS as unknown as { minAboveBase: number; mound: { hollowDepth: number }; soil: { sink: number } };
    const saved = { min: p.minAboveBase, hollow: p.mound.hollowDepth, sink: p.soil.sink };
    p.minAboveBase = 0;
    p.mound.hollowDepth = 12;
    p.soil.sink = 9;
    try {
      const w = terrain(() => TOP);
      const h = countWorld(w, SIZE, SIZE);
      expect(h.checked, 'S がブロックの底まで下がる所が無いと、上の面は調べられない').toBeGreaterThan(0);
      expect(h.byDir[0], `上の面のぬけ ${h.byDir[0]}（向きごと ${h.byDir}）`).toBe(0);
      expect(h.faces).toBe(0);
    } finally {
      p.minAboveBase = saved.min;
      p.mound.hollowDepth = saved.hollow;
      p.soil.sink = saved.sink;
    }
  });

  // ---- 「ほったら でこぼこになる」
  it('ほったら でこぼこ（いまも成り立つ。実装後もこわさない）: 表面ブロックを 1 つほると、下のブロックが新しい表面になって 小ブロック地形（でこぼこ）で描かれる', () => {
    const w = terrain(() => TOP);
    const m = new SectionMesher(w);
    // (24, 20, 24) の草をほる → (24, 19, 24) の土が表面。セクション (1,1,1)（y 16〜31）の中。ブロック 24 = セクションの中の 72〜80
    const topPlanes = (): Set<number> => {
      const d = m.build(1, 1, 1, 'micro');
      const planes = new Set<number>();
      for (const p of d.pieces) {
        for (let q = 0; q + 3 < p.vertexCount; q += 4) {
          if ((p.data[q * 4 + 3] & 7) !== 0) continue; // 上の面だけ
          const xs = [0, 1, 2, 3].map((i) => p.positions[(q + i) * 3]);
          const zs = [0, 1, 2, 3].map((i) => p.positions[(q + i) * 3 + 2]);
          const inX = Math.min(...xs) >= 72 && Math.max(...xs) <= 81;
          const inZ = Math.min(...zs) >= 72 && Math.max(...zs) <= 81;
          if (inX && inZ) planes.add(p.positions[q * 3 + 1]);
        }
      }
      return planes;
    };
    const before = topPlanes(); // 草の表面: ブロックの底は (20-16)*9 = 36
    expect(Math.min(...before)).toBeGreaterThanOrEqual((TOP - 16) * N + MICRO_PARAMS.minAboveBase);
    w.setBlock(24, TOP, 24, 'air');
    expect(new Columns(w).info(24, 24).ty).toBe(TOP - 1); // 土が新しい表面
    const planes = topPlanes();
    const lo = (TOP - 1 - 16) * N; // 土ブロックの底（セクションの中の高さ）
    // 土の表面は ブロックの底から minAboveBase 以上、上のへり + reach まで
    for (const y of planes) {
      expect(y).toBeGreaterThanOrEqual(lo + MICRO_PARAMS.minAboveBase);
      expect(y).toBeLessThanOrEqual(lo + N + MICRO_PARAMS.reachAir);
    }
    // ぜんぶ同じ高さ（平らな箱の上）ではない = でこぼこ
    expect(planes.size, `でこぼこの高さ ${[...planes]}`).toBeGreaterThanOrEqual(2);
  });

  it('ほったあとも すけない: 広くほって 1 ブロックの段差ができても、まわりの草の下の面が ぬけていない', () => {
    const w = terrain(() => TOP);
    w.fill(19, TOP, 19, 29, TOP, 29, 'air'); // 11×11 をほる
    const cols = new Columns(w);
    expect(cols.info(24, 24).ty).toBe(TOP - 1);
    const h = countHoles(w, new SectionMesher(w), cols, 1, 1, 1);
    expect(h.checked).toBeGreaterThan(0);
    expect(h.faces, `ほったあと: ぬけている面 ${h.faces}（向きごと ${h.byDir}）`).toBe(0);
  });
});

describe('いつもの島（seed 20261012）: 小ブロック段の全セクションで ぬけている面が 0', () => {
  it('ぬけている小ブロックの面 0・穴のあるブロック 0（調べた時は 10,048 面。このテストの数え方では 1,072 ブロック）', () => {
    const w = new ArrayVoxelWorld();
    generateIsland(20261012, w);
    const h = countWorld(w, 128, 128);
    console.log(`SEETHRU island: checked=${h.checked} 穴のある面=${h.faces} 穴のあるブロック=${h.blocks} 向きごと=${h.byDir}`);
    expect(h.checked, '調べた面が 0 だと何も確かめていない').toBeGreaterThan(10_000);
    expect(h.faces, `ぬけている小ブロックの面（向きごと ${h.byDir}）`).toBe(0);
    expect(h.blocks, '穴のあるブロック').toBe(0);
  }, 120_000);
});

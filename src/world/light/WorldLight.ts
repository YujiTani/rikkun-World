import type { LightField } from '../../contracts';
import type { ArrayVoxelWorld } from '../VoxelWorld';
import { LIGHT_CONFIG as C } from './config';
import { combinedBrightness, isDarkForSpawn } from './curve';
import { EMISSION, OPACITY } from './opacity';
import { skyDarkness, type SkyDarkness } from './skyDarkness';

/**
 * 世界の光（マイクラと同じ仕組み）。
 * - 空の光: 上から まっすぐ 15。はっぱ・みず は 1 弱め、固いブロックの下は 0。横には 1 マスごとに 1 弱まって広がる。
 * - ブロックの光: たいまつ 14 から 1 マスごとに 1 弱まって広がる。
 * - ブロックが変わったら、変わった所のまわり（最大 15 マス）だけ計算し直す（update()）。
 *   光が変わったチャンクは、描画側に作り直しを伝える（world.markDirty）。
 */
export class WorldLight implements LightField {
  private readonly sx: number;
  private readonly sy: number;
  private readonly sz: number;
  private readonly sky: Uint8Array;
  private readonly block: Uint8Array;
  private readonly oldSky: Uint8Array;
  private readonly oldBlock: Uint8Array;
  /** 最後の update() で計算し直したマスの数（計測・テスト用） */
  lastRecomputeCells = 0;
  /** 最初の全部の光の計算にかかったミリ秒（M5 AC14。世界を作る時間と合わせて 2,500 以下） */
  readonly initMs: number;

  constructor(
    private readonly world: ArrayVoxelWorld,
    private readonly darkness: SkyDarkness = skyDarkness,
  ) {
    this.sx = world.size.x;
    this.sy = world.size.y;
    this.sz = world.size.z;
    const n = this.sx * this.sy * this.sz;
    this.sky = new Uint8Array(n);
    this.block = new Uint8Array(n);
    this.oldSky = new Uint8Array(n);
    this.oldBlock = new Uint8Array(n);
    const t0 = performance.now();
    this.world.takeChangeBox();
    this.recompute(0, 0, 0, this.sx - 1, this.sy - 1, this.sz - 1, false);
    this.initMs = performance.now() - t0;
  }

  private idx(x: number, y: number, z: number): number {
    return (y * this.sz + z) * this.sx + x;
  }

  skyLight(x: number, y: number, z: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y >= this.sy) return C.maxLevel;
    if (y < 0) return 0;
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return C.maxLevel;
    return this.sky[this.idx(x, y, z)];
  }

  blockLight(x: number, y: number, z: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    return this.block[this.idx(x, y, z)];
  }

  /** 今の時刻をふくめた明るさ（空の光 - 夜の弱まり と ブロックの光 の大きいほう） */
  level(x: number, y: number, z: number): number {
    return Math.max(this.skyLight(x, y, z) - this.darkness.value, this.blockLight(x, y, z), 0);
  }

  /** 見た目の明るさ 0〜1（ブロックの光は 3 だんかい）。人形・妖怪・落とし物の明るさに使う */
  brightness(x: number, y: number, z: number): number {
    return combinedBrightness(this.skyLight(x, y, z), this.darkness.value, this.blockLight(x, y, z));
  }

  /** 妖怪が出てよい暗い所か（空の光 7 以下で、たいまつの 8 マス以内ではない） */
  isDarkForSpawn(x: number, y: number, z: number): boolean {
    return isDarkForSpawn(this.skyLight(x, y, z), this.darkness.value, this.blockLight(x, y, z));
  }

  /** メッシュ用の読み出し（世界の中の整数の座標だけ） */
  skyAt(x: number, y: number, z: number): number {
    return this.sky[this.idx(x, y, z)];
  }
  blockAt(x: number, y: number, z: number): number {
    return this.block[this.idx(x, y, z)];
  }

  /** ブロックが変わっていたら、まわりだけ光を計算し直す。毎コマ呼んでよい（変化が無ければすぐ終わる） */
  update(): void {
    const b = this.world.takeChangeBox();
    if (!b) {
      this.lastRecomputeCells = 0;
      return;
    }
    const r = C.maxLevel;
    this.recompute(
      Math.max(0, b.x0 - r),
      0,
      Math.max(0, b.z0 - r),
      Math.min(this.sx - 1, b.x1 + r),
      this.sy - 1,
      Math.min(this.sz - 1, b.z1 + r),
      true,
    );
  }

  /** 箱の中だけ計算し直す。箱の外の値は変わらないものとして、へりから入ってくる光を数える */
  private recompute(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, markDirty: boolean): void {
    const { sx, sy, sz, sky, block, world } = this;
    if (markDirty) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const o = this.idx(x0, y, z);
          this.oldSky.set(sky.subarray(o, o + (x1 - x0 + 1)), o);
          this.oldBlock.set(block.subarray(o, o + (x1 - x0 + 1)), o);
        }
      }
    }
    let cells = 0;
    // 1. ブロックの光のもと（たいまつ）と、空の光の まっすぐ下がる分
    const skyQ: number[] = [];
    const blockQ: number[] = [];
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        let s: number = C.maxLevel;
        for (let y = sy - 1; y >= 0; y--) {
          const i = this.idx(x, y, z);
          const t = world.getIndex(x, y, z);
          s = Math.max(0, s - OPACITY[t]);
          sky[i] = s;
          const e = EMISSION[t];
          block[i] = e;
          if (s > 1) skyQ.push(i);
          if (e > 1) blockQ.push(i);
          cells++;
        }
      }
    }
    this.lastRecomputeCells = cells;
    // 2. 箱のへりに入ってくる、外からの光
    const edge = (x: number, y: number, z: number, nx: number, nz: number): void => {
      if (nx < 0 || nz < 0 || nx >= sx || nz >= sz) return;
      const t = world.getIndex(x, y, z);
      if (OPACITY[t] >= 15) return;
      const cost = Math.max(1, OPACITY[t]);
      const i = this.idx(x, y, z);
      const j = this.idx(nx, y, nz);
      const ss = sky[j] - cost;
      if (ss > sky[i]) {
        sky[i] = ss;
        skyQ.push(i);
      }
      const bb = block[j] - cost;
      if (bb > block[i]) {
        block[i] = bb;
        blockQ.push(i);
      }
    };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        edge(x, y, z0, x, z0 - 1);
        edge(x, y, z1, x, z1 + 1);
      }
      for (let z = z0; z <= z1; z++) {
        edge(x0, y, z, x0 - 1, z);
        edge(x1, y, z, x1 + 1, z);
      }
    }
    // 3. 1 マスごとに 1 弱めて広げる
    this.spread(sky, skyQ, x0, y0, z0, x1, y1, z1);
    this.spread(block, blockQ, x0, y0, z0, x1, y1, z1);
    // 4. 光が変わったチャンクを、描画側に知らせる
    if (markDirty) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            const i = this.idx(x, y, z);
            if (sky[i] !== this.oldSky[i] || block[i] !== this.oldBlock[i]) world.markDirty(x, z, 2); // 面の角の光は 2 マス先まで読む
          }
        }
      }
    }
  }

  private spread(
    arr: Uint8Array,
    q: number[],
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
  ): void {
    const { sx, sz, world } = this;
    const layer = sx * sz;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const v = arr[i];
      if (v <= 1) continue;
      const x = i % sx;
      const z = Math.floor(i / sx) % sz;
      const y = Math.floor(i / layer);
      for (let d = 0; d < 6; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        const nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || nz < z0 || nz > z1) continue;
        const op = OPACITY[world.getIndex(nx, ny, nz)];
        if (op >= 15) continue;
        const nv = v - Math.max(1, op);
        const j = i + (nx - x) + (ny - y) * layer + (nz - z) * sx;
        if (nv > arr[j]) {
          arr[j] = nv;
          q.push(j);
        }
      }
    }
    q.length = 0;
  }
}

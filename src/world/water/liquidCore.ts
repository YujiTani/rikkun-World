import type { BlockId, SectionData } from '../../contracts';
import { AIR } from '../blocks/blockTypes';
import type { LiquidKind } from '../blocks/liquids';
import { sectionToArray } from '../sections';

/**
 * WATER-1 §4.2・§4.3 の 流れ（セル・オートマトン＋起こす リスト）を 液体の 種類（blocks/liquids.ts）ごとに 動かす 芯。
 * 水も マグマも これ 1 つ（WATERFALL-1 §4.3）。乱数は 使わない。
 */

/** 液体の 係が 世界に 求める もの（`ArrayVoxelWorld` が 満たす） */
export interface LiquidWorld {
  getIndex(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: BlockId): boolean;
  section(cx: number, sy: number, cz: number): SectionData | undefined;
  readonly size: { readonly y: number };
  onBlockChange: ((x: number, y: number, z: number, prev: number, next: number) => void) | null;
}

export interface LiquidCore {
  readonly kind: LiquidKind;
  /** マスを リストの うしろへ（同じ マスは 1 つ だけ） */
  wake(x: number, y: number, z: number): void;
  /** 量 n を 書く（0 = air） */
  write(x: number, y: number, z: number, n: number): void;
  /** 入れるか: air なら 0、量 1〜7 なら その 量、入れない なら −1 */
  room(index: number): number;
  /** 置いた ブロックに 押された 量を まわりへ */
  displace(x: number, y: number, z: number, amount: number): void;
  /** 1 マス 計算する（apply が false なら 動くか だけ） */
  calc(x: number, y: number, z: number, apply: boolean): boolean;
  /** tick が 間かくの ステップなら 1 パス */
  update(tick: number): void;
  queue(): number;
  passes(): number;
  computed(): number;
  wakeMovable(cx: number, cz: number, lx0: number, lx1: number, lz0: number, lz1: number): void;
  forgetColumn(id: number): void;
}

/** 横の 4 方向（北 −z・東 +x・南 +z・西 −x の 順） */
export const DX = [0, 1, 0, -1] as const;
export const DZ = [-1, 0, 1, 0] as const;
/** 押し出す 順（上 → 北 → 東 → 南 → 西 → 下） */
export const PUSH_DX = [0, 0, 1, 0, -1, 0] as const;
export const PUSH_DY = [1, 0, 0, 0, 0, -1] as const;
export const PUSH_DZ = [0, -1, 0, 1, 0, 0] as const;

/** リストの マスの 形（§4.3）: key = chunk × 131072 + local。local は 17 ビット */
const LOCAL = 131072;
const COLS = 4096;
const COL_BIAS = 2048;
export const chunkId = (cx: number, cz: number): number => (cx + COL_BIAS) * COLS + (cz + COL_BIAS);
const keyOf = (x: number, y: number, z: number): number => chunkId(x >> 4, z >> 4) * LOCAL + ((y << 8) | ((z & 15) << 4) | (x & 15));

/**
 * 液体の 芯を 作る。react は 流れる 前に 見る 決まり（マグマが 水に ふれたら かたまる など）。true を 返すと その マスは それで おわり
 */
export function createLiquidCore(world: LiquidWorld, kind: LiquidKind, react?: (x: number, y: number, z: number, apply: boolean) => boolean): LiquidCore {
  const MAX = 8;
  const amt = kind.amount;
  let q: number[] = [];
  let head = 0;
  const inQ = new Set<number>();
  let passCount = 0;
  let computedCount = 0;

  const room = (index: number): number => {
    if (index === AIR) return 0;
    const a = amt(index);
    return a > 0 && a < MAX ? a : -1;
  };
  const wake = (x: number, y: number, z: number): void => {
    const k = keyOf(x, y, z);
    if (inQ.has(k)) return;
    inQ.add(k);
    q.push(k);
  };
  const write = (x: number, y: number, z: number, n: number): void => {
    world.setBlock(x, y, z, kind.id(n));
  };

  function calc(x: number, y: number, z: number, apply: boolean): boolean {
    let a = amt(world.getIndex(x, y, z));
    if (a === 0) return false;
    if (react && react(x, y, z, apply)) return true;
    // 1) 下が 入れる → 下へ（入りきる ぶん）。おわり
    const below = room(world.getIndex(x, y - 1, z));
    if (below >= 0) {
      if (apply) {
        const mv = Math.min(a, MAX - below);
        write(x, y, z, a - mv);
        write(x, y - 1, z, below + mv);
      }
      return true;
    }
    // 2) 低い 所（その マスの 下が 入れる）を 北東南西に search マスまで さがし、いちばん 近い 方へ 1 つぶ
    const S = kind.search;
    let bestK = S + 1;
    let bestD = -1;
    for (let d = 0; d < 4; d++) {
      for (let k = 1; k <= S && k < bestK; k++) {
        const nx = x + DX[d] * k;
        const nz = z + DZ[d] * k;
        if (room(world.getIndex(nx, y, nz)) < 0) break;
        if (room(world.getIndex(nx, y - 1, nz)) >= 0) {
          bestK = k;
          bestD = d;
          break;
        }
      }
    }
    if (bestD >= 0) {
      const nx = x + DX[bestD];
      const nz = z + DZ[bestD];
      const nb = room(world.getIndex(nx, y, nz));
      if (nb < a) {
        if (apply) {
          write(x, y, z, a - 1);
          write(nx, y, nz, nb + 1);
        }
        return true;
      }
    }
    // 3) 横の となりに 差が 2 以上 → 1 つぶ(北東南西の 順。a は そのつど へる)
    let moved = false;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const nz = z + DZ[d];
      const nb = room(world.getIndex(nx, y, nz));
      if (nb >= 0 && a - nb >= 2) {
        if (!apply) return true;
        a--;
        write(x, y, z, a);
        write(nx, y, nz, nb + 1);
        moved = true;
      }
    }
    return moved;
  }

  function displace(x: number, y: number, z: number, amount: number): void {
    let rest = amount;
    for (let i = 0; i < 6 && rest > 0; i++) {
      const nx = x + PUSH_DX[i];
      const ny = y + PUSH_DY[i];
      const nz = z + PUSH_DZ[i];
      const nb = room(world.getIndex(nx, ny, nz));
      if (nb < 0) continue;
      const add = Math.min(rest, MAX - nb);
      write(nx, ny, nz, nb + add);
      rest -= add;
    }
  }

  function runPass(): void {
    const n = Math.min(kind.passMax, q.length - head);
    passCount++;
    // この パスで 計算する n マスを 先に 取り出す(リストからは 外す)。パスの 中で 起きた マスは 次の パスの うしろに 入る
    const from = head;
    head += n;
    for (let i = from; i < head; i++) inQ.delete(q[i]);
    // WATERFALL-1 §4.3: パスの 中は 下の マスから（同じ 高さは リストの 順）。落ちる 列で 上の つぶが 下の つぶに 追いついて まとまらない（滝が とぎれない）
    const batch = q.slice(from, head);
    batch.sort((ka, kb) => (ka % LOCAL >> 8) - (kb % LOCAL >> 8));
    for (let i = 0; i < batch.length; i++) {
      const key = batch[i];
      const local = key % LOCAL;
      const chunk = Math.floor(key / LOCAL);
      const cx = Math.floor(chunk / COLS) - COL_BIAS;
      const cz = (chunk % COLS) - COL_BIAS;
      const x = cx * 16 + (local & 15);
      const z = cz * 16 + ((local >> 4) & 15);
      const y = local >> 8;
      if (amt(world.getIndex(x, y, z)) === 0) continue; // 手放した列・なくなった マス
      computedCount++;
      calc(x, y, z, true);
    }
    if (head > 4096 && head * 2 > q.length) {
      q = q.slice(head);
      head = 0;
    }
  }

  function wakeMovable(cx: number, cz: number, lx0: number, lx1: number, lz0: number, lz1: number): void {
    const ox = cx * 16;
    const oz = cz * 16;
    for (let sy = 0; sy * 16 < world.size.y; sy++) {
      const sec = world.section(cx, sy, cz);
      if (sec === undefined) return;
      if (sec.kind === 'uniform') {
        if (amt(sec.block) === 0) continue;
      } else if (sec.kind === 'palette') {
        let any = false;
        for (let k = 0; k < sec.palette.length; k++) if (amt(sec.palette[k]) > 0) any = true;
        if (!any) continue;
      }
      const d = sectionToArray(sec);
      for (let ly = 0; ly < 16; ly++) {
        for (let lz = lz0; lz <= lz1; lz++) {
          for (let lx = lx0; lx <= lx1; lx++) {
            if (amt(d[(ly << 8) | (lz << 4) | lx]) === 0) continue;
            const x = ox + lx;
            const y = sy * 16 + ly;
            const z = oz + lz;
            if (calc(x, y, z, false)) wake(x, y, z);
          }
        }
      }
    }
  }

  return {
    kind,
    wake,
    write,
    room,
    displace,
    calc,
    update(tick) {
      if (inQ.size === 0 || tick % kind.tickSteps !== 0) return;
      runPass();
    },
    queue: () => inQ.size,
    passes: () => passCount,
    computed: () => computedCount,
    wakeMovable,
    forgetColumn(id) {
      const keep: number[] = [];
      for (let i = head; i < q.length; i++) {
        if (Math.floor(q[i] / LOCAL) === id) inQ.delete(q[i]);
        else keep.push(q[i]);
      }
      q = keep;
      head = 0;
    },
  };
}

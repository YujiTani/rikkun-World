import type { BlockId, SectionData } from '../../contracts';
import { AIR } from '../blocks/blockTypes';
import { WATER_MAX, WATER_PASS_MAX, WATER_SEARCH, WATER_TICK_STEPS, isWaterIndex, waterAmount, waterId } from '../blocks/water';
import { sectionToArray } from '../sections';

/**
 * WATER-1（docs/design/WATER-1.md §4.2・§4.3）: 水の 流れ。マスごとの 量（1〜8）を セル・オートマトンで 動かす。
 * 起こす リスト（チッキング・キュー）は `world.onBlockChange`（`setBlock` の 1 か所）だけから 入る。乱数は 使わない。
 */

/** 水の 係が 世界に 求める もの（`ArrayVoxelWorld` が 満たす） */
export interface WaterWorld {
  getIndex(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: BlockId): boolean;
  section(cx: number, sy: number, cz: number): SectionData | undefined;
  readonly size: { readonly y: number };
  onBlockChange: ((x: number, y: number, z: number, prev: number, next: number) => void) | null;
}

export interface WaterSystemDeps {
  world: WaterWorld;
  /** ゲームの ステップ番号 */
  tick: () => number;
}

export interface WaterSystem {
  /** ゲームの 1 ステップごとに 1 回 */
  update(): void;
  /** マスを 量 n（0 = air、1〜8）に する。ふつうの `setBlock` と 同じく 起こす */
  set(x: number, y: number, z: number, n: number): void;
  /** 量 0〜8（水でも air でも ない マスは −1） */
  amount(x: number, y: number, z: number): number;
  queue(): number;
  passes(): number;
  total(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number;
  /** 箱の 中の 水が どれも 動かなければ true（書かない） */
  stable(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean;
  pause(on: boolean): void;
  /** ゆれの 時間（秒。ステップ ÷ 60。pause() の あいだも ゲームが 止まって いれば かわらない） */
  waveTime(): number;
  /** これまでに 計算した マスの 数（ふえる だけ。`work.read().water` の もと） */
  computed(): number;
  onColumnLoaded(cx: number, cz: number, how: 'generated' | 'saved'): void;
  onColumnUnloaded(cx: number, cz: number): void;
}

/** 横の 4 方向（北 −z・東 +x・南 +z・西 −x の 順） */
const DX = [0, 1, 0, -1] as const;
const DZ = [-1, 0, 1, 0] as const;
/** 押し出す 順（上 → 北 → 東 → 南 → 西 → 下） */
const PUSH_DX = [0, 0, 1, 0, -1, 0] as const;
const PUSH_DY = [1, 0, 0, 0, 0, -1] as const;
const PUSH_DZ = [0, -1, 0, 1, 0, 0] as const;

/** リストの マスの 形（§4.3）: key = chunk × 131072 + local。local は 17 ビット */
const LOCAL = 131072;
const COLS = 4096;
const COL_BIAS = 2048;
const chunkId = (cx: number, cz: number): number => (cx + COL_BIAS) * COLS + (cz + COL_BIAS);
const keyOf = (x: number, y: number, z: number): number => chunkId(x >> 4, z >> 4) * LOCAL + ((y << 8) | ((z & 15) << 4) | (x & 15));

/** 水が 入れるか: air なら 0、量 1〜7 なら その 量。入れない（量 8・ほかの ブロック・世界の外 −1）は −1 */
function room(index: number): number {
  if (index === AIR) return 0;
  const a = waterAmount(index);
  return a > 0 && a < WATER_MAX ? a : -1;
}

export function createWaterSystem(deps: WaterSystemDeps): WaterSystem {
  const { world, tick } = deps;
  let q: number[] = [];
  let head = 0;
  const inQ = new Set<number>();
  /** 保存から 読んだ 列（chunkId） */
  const saved = new Set<number>();
  let passCount = 0;
  let computedCount = 0;
  let paused = false;

  const wake = (x: number, y: number, z: number): void => {
    const k = keyOf(x, y, z);
    if (inQ.has(k)) return;
    inQ.add(k);
    q.push(k);
  };

  /** 1 マス分の 量を 書く(0 は air)。書くと フックが まわりを 起こす */
  const write = (x: number, y: number, z: number, n: number): void => {
    world.setBlock(x, y, z, waterId(n));
  };

  /** 量 a の マスを 1 回 計算する。apply が false なら 書かずに「動くか」だけ 返す（stable・読みこみ用） */
  function calc(x: number, y: number, z: number, apply: boolean): boolean {
    let a = waterAmount(world.getIndex(x, y, z));
    if (a === 0) return false;
    // 1) 下が 入れる → 下へ（入りきる ぶん）。おわり
    const below = room(world.getIndex(x, y - 1, z));
    if (below >= 0) {
      if (apply) {
        const mv = Math.min(a, WATER_MAX - below);
        write(x, y, z, a - mv);
        write(x, y - 1, z, below + mv);
      }
      return true;
    }
    // 2) 低い 所（その マスの 下が 入れる）を 北東南西に 7 マスまで さがし、いちばん 近い 方へ 1 つぶ
    let bestK = WATER_SEARCH + 1;
    let bestD = -1;
    for (let d = 0; d < 4; d++) {
      for (let k = 1; k <= WATER_SEARCH && k < bestK; k++) {
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

  /** 水の マスに ブロックを 置いた: 量 amount を 上 → 北 → 東 → 南 → 西 → 下 の 順に 入れる 所へ 押し出す。入りきらない 分は 消える */
  function displace(x: number, y: number, z: number, amount: number): void {
    let rest = amount;
    for (let i = 0; i < 6 && rest > 0; i++) {
      const nx = x + PUSH_DX[i];
      const ny = y + PUSH_DY[i];
      const nz = z + PUSH_DZ[i];
      const nb = room(world.getIndex(nx, ny, nz));
      if (nb < 0) continue;
      const add = Math.min(rest, WATER_MAX - nb);
      write(nx, ny, nz, nb + add);
      rest -= add;
    }
  }

  // ---- 起こす(setBlock の 1 か所) ----
  world.onBlockChange = (x, y, z, prev, next) => {
    if (isWaterIndex(next)) wake(x, y, z);
    for (let i = 0; i < 6; i++) {
      const nx = x + PUSH_DX[i];
      const ny = y + PUSH_DY[i];
      const nz = z + PUSH_DZ[i];
      if (isWaterIndex(world.getIndex(nx, ny, nz))) wake(nx, ny, nz);
    }
    // 水の マスに 水でも air でも ない ブロックを 置いた: 水を 押し出す
    if (next !== AIR && !isWaterIndex(next)) {
      const pa = waterAmount(prev);
      if (pa > 0) displace(x, y, z, pa);
    }
  };

  function runPass(): void {
    const n = Math.min(WATER_PASS_MAX, q.length - head);
    passCount++;
    // この パスで 計算する n マスを 先に 取り出す(リストからは 外す)。パスの 中で 起きた マスは、取り出し ずみ でも 次の パスの うしろに 入る
    const from = head;
    head += n;
    for (let i = from; i < head; i++) inQ.delete(q[i]);
    for (let i = from; i < head; i++) {
      const key = q[i];
      const local = key % LOCAL;
      const chunk = Math.floor(key / LOCAL);
      const cx = Math.floor(chunk / COLS) - COL_BIAS;
      const cz = (chunk % COLS) - COL_BIAS;
      const x = cx * 16 + (local & 15);
      const z = cz * 16 + ((local >> 4) & 15);
      const y = local >> 8;
      if (waterAmount(world.getIndex(x, y, z)) === 0) continue; // 手放した列・水が なくなった マス
      computedCount++;
      calc(x, y, z, true);
    }
    if (head > 4096 && head * 2 > q.length) {
      q = q.slice(head);
      head = 0;
    }
  }

  /** 箱の 中の セクションごとの 水を 見て、動く かも しれない 水を 起こす(読みこみ用)。x・z は 列の 中の 範囲 */
  function wakeMovable(cx: number, cz: number, lx0: number, lx1: number, lz0: number, lz1: number): void {
    const ox = cx * 16;
    const oz = cz * 16;
    for (let sy = 0; sy * 16 < world.size.y; sy++) {
      const sec = world.section(cx, sy, cz);
      if (sec === undefined) return;
      if (sec.kind === 'uniform') {
        if (!isWaterIndex(sec.block)) continue;
      } else if (sec.kind === 'palette') {
        let any = false;
        for (let k = 0; k < sec.palette.length; k++) if (isWaterIndex(sec.palette[k])) any = true;
        if (!any) continue;
      }
      const d = sectionToArray(sec);
      for (let ly = 0; ly < 16; ly++) {
        for (let lz = lz0; lz <= lz1; lz++) {
          for (let lx = lx0; lx <= lx1; lx++) {
            if (!isWaterIndex(d[(ly << 8) | (lz << 4) | lx])) continue;
            const x = ox + lx;
            const y = sy * 16 + ly;
            const z = oz + lz;
            if (calc(x, y, z, false)) wake(x, y, z);
          }
        }
      }
    }
  }

  const loaded = (cx: number, cz: number): boolean => world.section(cx, 0, cz) !== undefined;

  return {
    update() {
      if (paused || inQ.size === 0 || tick() % WATER_TICK_STEPS !== 0) return;
      runPass();
    },
    set(x, y, z, n) {
      write(x, y, z, Math.max(0, Math.min(WATER_MAX, Math.floor(n))));
    },
    amount(x, y, z) {
      const i = world.getIndex(x, y, z);
      if (i < 0) return -1;
      if (i === AIR) return 0;
      const a = waterAmount(i);
      return a > 0 ? a : -1;
    },
    queue: () => inQ.size,
    passes: () => passCount,
    total(x0, y0, z0, x1, y1, z1) {
      let sum = 0;
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) sum += waterAmount(world.getIndex(x, y, z));
      return sum;
    },
    stable(x0, y0, z0, x1, y1, z1) {
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (calc(x, y, z, false)) return false;
      return true;
    },
    pause(on) {
      paused = on;
    },
    waveTime: () => tick() / 60,
    computed: () => computedCount,
    onColumnLoaded(cx, cz, how) {
      if (how === 'saved') {
        saved.add(chunkId(cx, cz));
        wakeMovable(cx, cz, 0, 15, 0, 15); // 保存から 読んだ 列: 動く かも しれない 水 ぜんぶ
      }
      // となりの 保存から 読んだ 列の さかいの 1 列
      if (loaded(cx + 1, cz) && saved.has(chunkId(cx + 1, cz))) wakeMovable(cx + 1, cz, 0, 0, 0, 15);
      if (loaded(cx - 1, cz) && saved.has(chunkId(cx - 1, cz))) wakeMovable(cx - 1, cz, 15, 15, 0, 15);
      if (loaded(cx, cz + 1) && saved.has(chunkId(cx, cz + 1))) wakeMovable(cx, cz + 1, 0, 15, 0, 0);
      if (loaded(cx, cz - 1) && saved.has(chunkId(cx, cz - 1))) wakeMovable(cx, cz - 1, 0, 15, 15, 15);
    },
    onColumnUnloaded(cx, cz) {
      const id = chunkId(cx, cz);
      saved.delete(id);
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

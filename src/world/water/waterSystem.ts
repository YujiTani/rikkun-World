import { AIR } from '../blocks/blockTypes';
import { LIQUID_KINDS } from '../blocks/liquids';
import { magmaAmount } from '../blocks/magma';
import { WATER_MAX, waterAmount } from '../blocks/water';
import { PUSH_DX, PUSH_DY, PUSH_DZ, chunkId, createLiquidCore, type LiquidWorld } from './liquidCore';
import { createSprings } from './springs';

/**
 * WATER-1（docs/design/WATER-1.md §4.2・§4.3）: 水の 流れ。マスごとの 量（1〜8）を セル・オートマトンで 動かす。
 * 起こす リスト（チッキング・キュー）は `world.onBlockChange`（`setBlock` の 1 か所）だけから 入る。乱数は 使わない。
 */

type WaterWorld = LiquidWorld;

/** 窓口 `window.__rikkun.water`（WATER-1 §6.1）が 出す もの */
export type WaterHook = Pick<WaterSystem, 'set' | 'amount' | 'queue' | 'passes' | 'total' | 'stable' | 'pause' | 'waveTime' | 'magma' | 'springCount' | 'springLink'>;

export interface WaterSystemDeps {
  world: WaterWorld;
  /** ゲームの ステップ番号 */
  tick: () => number;
  /** 世界の シード（たきつぼの 確率。WATERFALL-1 §4.2）。なければ 0 */
  seed?: number;
}

/** WATERFALL-1: マグマ（水と 同じ しくみ。窓口 `__rikkun.water.magma`） */
interface MagmaHook {
  set(x: number, y: number, z: number, n: number): void;
  amount(x: number, y: number, z: number): number;
  queue(): number;
  total(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number;
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
  /** WATERFALL-1: マグマ */
  readonly magma: MagmaHook;
  /** WATERFALL-1: わきみずの 数と、わきみずに つながった たきつぼ（なければ null） */
  springCount(): number;
  springLink(x: number, y: number, z: number): { x: number; y: number; z: number } | null;
}

const KOKUYOUSEKI = 'kokuyouseki';

export function createWaterSystem(deps: WaterSystemDeps): WaterSystem {
  const { world, tick } = deps;
  /** 保存から 読んだ 列（chunkId） */
  const saved = new Set<number>();
  let paused = false;
  /** マグマが かたまる 間は 押し出さない（マグマは きえる） */
  let solidifying = false;
  const W = createLiquidCore(world, LIQUID_KINDS.water);
  // WATERFALL-1 §4.4: マグマが 水に ふれたら（上下 北東南西）こくようせきに なる。水は へらない
  const M = createLiquidCore(world, LIQUID_KINDS.magma, (x, y, z, apply) => {
    for (let i = 0; i < 6; i++) {
      if (waterAmount(world.getIndex(x + PUSH_DX[i], y + PUSH_DY[i], z + PUSH_DZ[i])) === 0) continue;
      if (apply) {
        solidifying = true;
        world.setBlock(x, y, z, KOKUYOUSEKI);
        solidifying = false;
      }
      return true;
    }
    return false;
  });
  const springs = createSprings(world, W, M, deps.seed ?? 0);

  // ---- 起こす(setBlock の 1 か所) ----
  world.onBlockChange = (x, y, z, prev, next) => {
    const wn = waterAmount(next);
    const mn = magmaAmount(next);
    if (wn > 0) W.wake(x, y, z);
    else if (mn > 0) M.wake(x, y, z);
    for (let i = 0; i < 6; i++) {
      const nx = x + PUSH_DX[i];
      const ny = y + PUSH_DY[i];
      const nz = z + PUSH_DZ[i];
      const ni = world.getIndex(nx, ny, nz);
      if (waterAmount(ni) > 0) W.wake(nx, ny, nz);
      else if (magmaAmount(ni) > 0) M.wake(nx, ny, nz);
    }
    // 液体の マスに ほかの ブロックを 置いた: 押し出す
    if (next !== AIR && wn === 0 && mn === 0) {
      const pa = waterAmount(prev);
      if (pa > 0) W.displace(x, y, z, pa);
      const pm = magmaAmount(prev);
      if (pm > 0 && !solidifying) M.displace(x, y, z, pm);
    }
    springs.onChange(x, y, z, prev, next);
  };

  const loaded = (cx: number, cz: number): boolean => world.section(cx, 0, cz) !== undefined;
  const wakeBoth = (cx: number, cz: number, lx0: number, lx1: number, lz0: number, lz1: number): void => {
    W.wakeMovable(cx, cz, lx0, lx1, lz0, lz1);
    M.wakeMovable(cx, cz, lx0, lx1, lz0, lz1);
  };
  const amountOf = (amt: (i: number) => number) => (x: number, y: number, z: number): number => {
    const i = world.getIndex(x, y, z);
    if (i < 0) return -1;
    if (i === AIR) return 0;
    const a = amt(i);
    return a > 0 ? a : -1;
  };
  const totalOf = (amt: (i: number) => number) => (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number => {
    let sum = 0;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) sum += amt(world.getIndex(x, y, z));
    return sum;
  };

  return {
    update() {
      if (paused) return;
      const t = tick();
      W.update(t);
      M.update(t);
      springs.update(t);
    },
    set(x, y, z, n) {
      W.write(x, y, z, Math.max(0, Math.min(WATER_MAX, Math.floor(n))));
    },
    amount: amountOf(waterAmount),
    queue: () => W.queue(),
    passes: () => W.passes(),
    total: totalOf(waterAmount),
    stable(x0, y0, z0, x1, y1, z1) {
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (W.calc(x, y, z, false)) return false;
      return true;
    },
    pause(on) {
      paused = on;
    },
    waveTime: () => tick() / 60,
    computed: () => W.computed() + M.computed(),
    magma: {
      set(x, y, z, n) {
        M.write(x, y, z, Math.max(0, Math.min(8, Math.floor(n))));
      },
      amount: amountOf(magmaAmount),
      queue: () => M.queue(),
      total: totalOf(magmaAmount),
    },
    springCount: () => springs.count(),
    springLink: (x, y, z) => springs.linkOf(x, y, z),
    onColumnLoaded(cx, cz, how) {
      if (how === 'saved') {
        springs.onColumnLoaded(cx, cz); // わきみずは 生成では 置かない → 保存から 読んだ 列だけ さがす
        saved.add(chunkId(cx, cz));
        wakeBoth(cx, cz, 0, 15, 0, 15); // 保存から 読んだ 列: 動く かも しれない 液体 ぜんぶ
      }
      // となりの 保存から 読んだ 列の さかいの 1 列
      if (loaded(cx + 1, cz) && saved.has(chunkId(cx + 1, cz))) wakeBoth(cx + 1, cz, 0, 0, 0, 15);
      if (loaded(cx - 1, cz) && saved.has(chunkId(cx - 1, cz))) wakeBoth(cx - 1, cz, 15, 15, 0, 15);
      if (loaded(cx, cz + 1) && saved.has(chunkId(cx, cz + 1))) wakeBoth(cx, cz + 1, 0, 15, 0, 0);
      if (loaded(cx, cz - 1) && saved.has(chunkId(cx, cz - 1))) wakeBoth(cx, cz - 1, 0, 15, 15, 15);
    },
    onColumnUnloaded(cx, cz) {
      const id = chunkId(cx, cz);
      saved.delete(id);
      W.forgetColumn(id);
      M.forgetColumn(id);
      springs.onColumnUnloaded(cx, cz);
    },
  };
}

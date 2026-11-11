import type { AnimalEvent, DayPhase, ItemId, ThrowAim, Vec3 } from '../contracts';
import { createLiveSettings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { AnimalManager } from './AnimalManager';
import { coopBlocks } from './coop';

/**
 * COOP-1 5c（docs/design/COOP-1.md 1.15 §3.7 (d)・§8・§12.0）の 先行テストの 共通の 道具（テスト専用。本番から import しない）。
 * 世界は 床 y=8 の ArrayVoxelWorld。1P は (20.5, 9, 20.5)、2P は 1P の ちょうど +X 方向 に OFFSET マス はなれた 所。
 * 同じ 場面を 1P と 2P で 動かして 結果を くらべる ために、2P の 場所は 1P の 場所 ＋ (OFFSET, 0, 0) に そろえる。
 *
 * ---- 実装への 約束（仕様 §8「つなぎ目の 約束」の とおり。名前は 開発が かえて よいが、かえたら 依頼文と 仕様に 書く）----
 *   AnimalManagerOptions.playerOf(who: 1 | 2): { position: Vec3 } | null   … 2P が いない とき who 2 は null
 *     （今の `getPlayer`・`partner` を まとめて よい。この 道具は 3 つとも 渡す ので どちらの 作りでも 動く）
 *   AnimalDeps.addItem(item, who)・AnimalDeps.tryAddItem?(item, who)       … 入れ先の 人。1P の 呼び出しは who を 省く か 1
 *   AnimalEvent の 省ける `by?: 2`                                          … 2P の 口を 通した 出来事だけ。1P の 物には `by` の キーが ない
 */
const SIZE = 120;
/** 2P は 1P の +X に この マス はなれた 所に 立つ（くらべる ときは この 分だけ ずらして 読む） */
export const OFFSET = 40;

export type Who = 1 | 2;
type Pl = { position: Vec3 };

export interface DuoSetupOpts {
  /** false なら 2P は いない（playerOf(2) は null） */
  p2?: boolean;
  phase?: DayPhase;
  seed?: number;
  /** playerOf を 渡さない（今までの 1 人の 作り方。getPlayer だけ） */
  legacy?: boolean;
}

export function setupDuo(opts: DuoSetupOpts = {}) {
  const world = new ArrayVoxelWorld({ x: SIZE, y: 40, z: SIZE });
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) world.setBlock(x, 8, z, 'grass');
  const st = { day: 0, phase: (opts.phase ?? 'day') as DayPhase };
  const p1: Pl = { position: { x: 20.5, y: 9, z: 20.5 } };
  const hasP2 = opts.p2 !== false;
  const pl2 = { cur: hasP2 ? ({ position: { x: 20.5 + OFFSET, y: 9, z: 20.5 } } as Pl) : (null as Pl | null) };
  const who = (w: Who): Pl => (w === 1 ? p1 : pl2.cur!);
  const settings = createLiveSettings();
  settings.animalAutoSpawn = false;
  // GOLD-1 の まち（5 分）は この テストの 邪魔に なる ので 0
  settings.natsukiBugWaitTicks = 0;
  settings.natsukiPetWaitTicks = 0;
  /** 入れた 物の 記録（人ごと）と、いっぱい の 印（人ごと） */
  const added: { item: ItemId; who: Who }[] = [];
  const tried: { item: ItemId; who: Who }[] = [];
  const bag = { 1: { full: false, room: Infinity }, 2: { full: false, room: Infinity } };
  const dropped: { at: Vec3; item: ItemId }[] = [];
  const eggs: Vec3[] = [];
  const deps: Record<string, unknown> = {
    seed: opts.seed ?? 7,
    settings,
    dropEgg: (at: Vec3) => eggs.push({ ...at }),
    addItem: (item: ItemId, w?: Who) => {
      const k = w ?? 1;
      if (bag[k].full) return false;
      added.push({ item, who: k });
      return true;
    },
    tryAddItem: (item: ItemId, w?: Who) => {
      const k = w ?? 1;
      if (bag[k].full || bag[k].room <= 0) return false;
      bag[k].room--;
      tried.push({ item, who: k });
      return true;
    },
    day: () => st.day,
    phase: () => st.phase,
    countryAt: () => ({ kind: 'harappa' }),
    placeCoopBlocks: (x: number, y: number, z: number, dir: 0 | 1 | 2 | 3) => {
      for (const b of coopBlocks(x, y, z, dir)) world.setBlock(b.x, b.y, b.z, b.block);
      return true;
    },
    removeCoopBlocks: (x: number, y: number, z: number, dir: 0 | 1 | 2 | 3) => {
      for (const b of coopBlocks(x, y, z, dir)) world.setBlock(b.x, b.y, b.z, 'air');
    },
    dropItem: (at: Vec3, item: ItemId) => dropped.push({ at: { ...at }, item }),
  };
  const options: Record<string, unknown> = { world, getPlayer: () => p1, deps };
  if (!opts.legacy) {
    options.partner = () => pl2.cur;
    options.playerOf = (w: Who) => (w === 1 ? p1 : pl2.cur);
  }
  // 型は 約束の 形（playerOf など）を まだ 持たない ので 一度 ゆるめる（約束の 型の エラーは 許す）
  const m = new AnimalManager(options as never);
  const step = (n: number) => {
    for (let i = 0; i < n; i++) m.update();
  };
  const ev = <T extends AnimalEvent['type']>(type: T) => m.events().filter((e): e is Extract<AnimalEvent, { type: T }> => e.type === type);
  const one = (id: number) => m.list().find((a) => a.id === id)!;
  const full = settings.animalFollowTicks;
  /** その 人の 足もとから (dx, dz) の 所に なかま（follow まんたん）を 置く。2 ステップ 進めて 落ち着かせる */
  const friend = (w: Who, dx = -1, dz = 0, o: Record<string, unknown> = {}) => {
    const p = who(w).position;
    const id = m.spawn(p.x + dx, 9, p.z + dz, { friend: true, follow: full, ...o })!;
    step(2);
    return id;
  };
  const wild = (w: Who, dx = -1, dz = 0) => {
    const p = who(w).position;
    const id = m.spawn(p.x + dx, 9, p.z + dz)!;
    step(2);
    return id;
  };
  const coop = (x = 60, z = 60, dir: 0 | 1 | 2 | 3 = 0) => {
    const r = m.placeCoop(x, 9, z, dir);
    if (typeof r !== 'number') throw new Error('置けない: ' + r);
    return m.coops().find((c) => c.id === r)!;
  };
  const kid = (c: { id: number; x: number; z: number }, o: Record<string, unknown> = {}, dx = 0, dz = 0) =>
    m.spawn(c.x + 0.5 + dx, 9, c.z + 0.5 + dz, { friend: true, home: c.id, stage: 'adult', raised: true, ...o })!;
  const stand = (w: Who, x: number, z: number) => {
    who(w).position.x = x;
    who(w).position.z = z;
  };
  /** 東（+x）を 向いて、その マスを ねらう 着地点の 入力 */
  const aimEast = (w: Who, place: Vec3 | null): ThrowAim => {
    const p = who(w).position;
    return { place, eye: { x: p.x, y: p.y + 1.6, z: p.z }, dirX: 1, dirZ: 0 };
  };
  const hold = settings.carryHoldTicks;
  return { m, world, st, p1, pl2, who, settings, added, tried, bag, dropped, eggs, step, ev, one, full, friend, wild, coop, kid, stand, aimEast, hold };
}
export type DuoS = ReturnType<typeof setupDuo>;

/** 数を 小数 6 けたに 丸める（1P と 2P で 場所が ちがう 分の 桁落ちを ならす。入れ子の 中も） */
export function r6<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x)));
}

/** 出来事の 列から 人の しるし（by）を 取りのぞき、場所を その 人の ぶん ずらして 読む（1P と 2P の くらべ用） */
export function normalize(events: readonly AnimalEvent[], dx: number): unknown[] {
  return r6(
    events.map((e) => {
      const o: Record<string, unknown> = { ...e };
      delete o.by;
      if (typeof o.x === 'number') o.x = o.x - dx;
      const to = o.to as Vec3 | undefined;
      if (to) o.to = { ...to, x: to.x - dx };
      return o;
    }),
  );
}

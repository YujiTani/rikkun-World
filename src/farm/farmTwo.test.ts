import { describe, expect, it } from 'vitest';
import { createM7Settings, type FarmEvent, type FarmPlacement, type Vec3 } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createFarmSystem, type FarmSystemImpl } from './FarmSystem';

/**
 * COOP-1 5a（docs/design/COOP-1.md 1.14 §3.7 (a)「ふるい はたけ」・§10・AC124・AC130）の 先行テスト（赤）。ふるい はたけの かかし に 近づく 実績 `visitOldFarm` は
 * **2 人の どちらか** が 近づけば 出る（入る たびに 1 つ。2 人とも 中に いる あいだは 出なおさない）。畑は 世界に 1 つ（`FarmSystem` 1 つ）。
 *
 * ---- 実装への 約束（名前・形）----
 *   src/contracts/farm.ts   `FarmStepContext` に 省ける `p2Pos?: Vec3`（2P の 足もと。2P が いない ときは 渡さない）。
 *     `farm.update({ playerPos, p2Pos })` … かかし の 近さ（横 VISIT_RANGE ＋ 0.5 以内・たて 8 以内。今の 判定）を 2 人分 見て、どちらかが 近ければ「近い」。
 *     「近い」に かわった ステップに `visitOldFarm` を 1 つ（`by` は 書かない。実績は 共有）。2P の 足もとが 渡されない とき（1 人）は 今と まったく 同じ。
 *   `FarmEvent` の 型に 省ける `by?: 2` を 足す（`as FarmEvent` なしで 書ける ことを このファイルの 型で 見る）。
 *   FarmSystemImpl に 小さい 口 `actAs<T>(by: 2, fn: () => T): T`（2P の 呼び出しを 包む。`duo/p2Farm.ts` が 使う。AC120・AC125）:
 *     fn の あいだ ① `emit` した 出来事に `by: 2`（もう `by` が ある 物は そのまま）② `noteHint` は 畑の lastHint を 書かない（出来事 hint は `by: 2` で 出す）
 *     ③ `pourAt` は 畑の lastPour を 書かず、2P の 分を 別に もつ（`lastPourCells(2)`）。`lastPourCells()` は 1P の まいた マス のまま。
 *     fn の 戻り値を そのまま 返す。fn が 例外を 投げても もとに もどる（そのあとの 1P の 呼び出しに `by` は つかない）。入れ子は 内側の あと 外側の まま。
 *   `lastPourCells(by?: 2): readonly Vec3[]` … by: 2 なら 2P の さいごに まいた マス（まだ なければ 空）。
 */

const KAKASHI: Vec3 = { x: 20, y: 8, z: 20 };
const NEAR: Vec3 = { x: KAKASHI.x + 1.5, y: KAKASHI.y, z: KAKASHI.z + 0.5 };
const FAR: Vec3 = { x: 3.5, y: 8, z: 3.5 };
const DAY = 91800;

function make(): { farm: FarmSystemImpl; visits: () => number; step: (p1: Vec3, p2?: Vec3) => void } {
  const world = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
  world.fill(0, 0, 0, 31, 7, 31, 'dirt');
  const state = { tick: 0 };
  const farm = createFarmSystem({
    world,
    light: { skyLight: () => 15, blockLight: () => 0, level: () => 15 },
    seed: 1,
    dayLength: () => DAY,
    settings: createM7Settings(),
    tick: () => state.tick,
    fillTansu: () => undefined,
    placement: () => ({ wild: [], oldFarm: null }),
  });
  const placement: FarmPlacement = {
    wild: [],
    oldFarm: { blocks: [], tansu: { x: 18, y: 8, z: 18 }, tansuItems: [], kakashi: { ...KAKASHI }, box: { x0: 16, z0: 16, x1: 24, z1: 24, y0: 7, y1: 14 }, tier: 0 },
  };
  farm.noteNewWorldPlaced(placement);
  let visits = 0;
  return {
    farm,
    visits: () => {
      visits += farm.drainEvents().filter((e) => e.type === 'visitOldFarm').length;
      return visits;
    },
    step: (p1, p2) => {
      state.tick++;
      farm.update(p2 ? { playerPos: { ...p1 }, p2Pos: { ...p2 } } : { playerPos: { ...p1 } });
    },
  };
}

describe('AC124: かかし の 近さは 2 人の どちらか', () => {
  it('1 人（2P の 足もとを 渡さない）: 今まで どおり。入る たびに 1 つ・中に いる あいだは 出なおさない', () => {
    const m = make();
    m.step(FAR);
    expect(m.visits()).toBe(0);
    m.step(NEAR);
    m.step(NEAR);
    m.step(NEAR);
    expect(m.visits()).toBe(1);
    m.step(FAR);
    m.step(NEAR);
    expect(m.visits(), '出て また 入ると もう 1 つ').toBe(2);
  });

  it('2P だけが 近づいても 出る（1P は 遠い）。中に いる あいだは 出なおさない', () => {
    const m = make();
    m.step(FAR, FAR);
    expect(m.visits()).toBe(0);
    m.step(FAR, NEAR);
    m.step(FAR, NEAR);
    expect(m.visits()).toBe(1);
    m.step(FAR, FAR);
    m.step(FAR, NEAR);
    expect(m.visits(), '2P が 出て また 入ると もう 1 つ').toBe(2);
  });

  it('2 人とも 中に いる あいだは 出なおさない（1P が 先に 入って あとから 2P が 入る・1P だけ 出て 2P が のこる）', () => {
    const m = make();
    m.step(NEAR, FAR);
    expect(m.visits(), '1P が 入った').toBe(1);
    m.step(NEAR, NEAR);
    expect(m.visits(), '2P も 入っても 出なおさない').toBe(1);
    m.step(FAR, NEAR);
    m.step(FAR, NEAR);
    expect(m.visits(), '1P が 出ても 2P が 中に いる あいだは 出なおさない').toBe(1);
    m.step(FAR, FAR);
    m.step(NEAR, FAR);
    expect(m.visits(), '2 人とも 出てから 入ると もう 1 つ').toBe(2);
  });

  it('横の 近さは 今の 判定と 同じ（2P も 同じ 式で ほどよく はなれていれば 出ない）', () => {
    const m = make();
    m.step(FAR, { x: KAKASHI.x + 20, y: KAKASHI.y, z: KAKASHI.z });
    m.step(FAR, { x: KAKASHI.x, y: KAKASHI.y + 30, z: KAKASHI.z });
    expect(m.visits()).toBe(0);
  });

  it('出来事 visitOldFarm に `by` は 書かない（実績は 共有）', () => {
    const m = make();
    m.step(FAR, NEAR);
    const e = m.farm.peekEvents().find((x) => x.type === 'visitOldFarm');
    expect(e).toBeDefined();
    expect('by' in e!).toBe(false);
  });
});

describe('AC130: 出来事の 型（省ける `by?: 2`）', () => {
  it('`by: 2` を 書いた 出来事も `farm.emit` で そのまま 集まる（型に `by` が ある）', () => {
    const m = make();
    const e: FarmEvent = { type: 'till', tick: 1, x: 1, y: 2, z: 3, by: 2 };
    const p: FarmEvent = { type: 'pour', tick: 1, x: 1, y: 2, z: 3, item: 'watering_can', tiles: 1, by: 2 };
    const one: FarmEvent = { type: 'till', tick: 1, x: 1, y: 2, z: 3 };
    m.farm.emit(e);
    m.farm.emit(p);
    m.farm.emit(one);
    const got = m.farm.drainEvents();
    expect(got).toEqual([e, p, one]);
    expect('by' in got[2]!).toBe(false);
  });
});

describe('actAs: 畑の 中で 2P の 呼び出しを 見分ける（AC120・AC125）', () => {
  const ground = (): { farm: FarmSystemImpl; world: ArrayVoxelWorld; cells: Vec3[]; ev: () => FarmEvent[] } => {
    const world = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
    world.fill(0, 0, 0, 31, 7, 31, 'dirt');
    const farm = createFarmSystem({
      world,
      light: { skyLight: () => 15, blockLight: () => 0, level: () => 15 },
      seed: 1,
      dayLength: () => DAY,
      settings: createM7Settings(),
      tick: () => 0,
      fillTansu: () => undefined,
      placement: () => ({ wild: [], oldFarm: null }),
    });
    const cells: Vec3[] = [];
    for (const z of [4, 6, 8]) {
      expect(farm.till(5, 7, z)).toBe(true);
      cells.push({ x: 5, y: 7, z });
    }
    farm.drainEvents();
    return { farm, world, cells, ev: () => farm.drainEvents() };
  };

  it('fn の あいだに emit した 出来事に by: 2。外の 出来事には つかない。戻り値は そのまま', () => {
    const { farm, ev } = ground();
    const r = farm.actAs(2, () => {
      farm.emit({ type: 'till', tick: 1, x: 1, y: 2, z: 3 });
      return 'ok';
    });
    farm.emit({ type: 'till', tick: 1, x: 1, y: 2, z: 4 });
    expect(r).toBe('ok');
    const got = ev();
    expect(got.map((e) => ('by' in e ? e.by : undefined))).toEqual([2, undefined]);
    expect('by' in got[1]!).toBe(false);
  });

  it('畑の 中で 出る 出来事（plant・harvest・pour）にも by: 2。もう by が ある 物は そのまま', () => {
    const { farm, cells, ev } = ground();
    const c = cells[0]!;
    farm.actAs(2, () => {
      expect(farm.plant(c.x, c.y, c.z, 'tomato')).toBe(true);
      farm.setStage(c.x, c.y + 1, c.z, 3);
      farm.harvest(c.x, c.y + 1, c.z);
      farm.pourAt(c, 'watering_can', 1, 0);
    });
    const got = ev().filter((e) => e.type === 'plant' || e.type === 'harvest' || e.type === 'pour');
    expect(got.map((e) => e.type)).toEqual(['plant', 'harvest', 'pour']);
    expect(got.every((e) => 'by' in e && e.by === 2)).toBe(true);
  });

  it('noteHint は 畑の lastHint を 書かない（出来事 hint は by: 2 で 出る）。外の noteHint は 今まで どおり lastHint を 書く', () => {
    const { farm, ev } = ground();
    farm.actAs(2, () => farm.noteHint('fill', { x: 1, y: 2, z: 3 }));
    expect(farm.lastHint()).toBeNull();
    const h = ev().filter((e) => e.type === 'hint');
    expect(h.length).toBe(1);
    expect('by' in h[0]! && h[0]!.by).toBe(2);
    farm.noteHint('bucket', { x: 1, y: 2, z: 3 });
    expect(farm.lastHint()).toBe('bucket');
    expect('by' in ev().filter((e) => e.type === 'hint')[0]!).toBe(false);
  });

  it('pourAt: 1P → 2P の じゅんで まいても 畑の lastPourCells() は 1P の まま・2P の 分は lastPourCells(2)。2P → 1P でも 同じ', () => {
    for (const order of [[1, 2], [2, 1]] as const) {
      const { farm, cells } = ground();
      expect(farm.lastPourCells(2), 'まだ 2P は まいて いない').toEqual([]);
      for (const who of order) {
        const c = cells[who === 1 ? 0 : 1]!;
        if (who === 2) farm.actAs(2, () => farm.pourAt(c, 'watering_can', 1, 0));
        else farm.pourAt(c, 'watering_can', 1, 0);
      }
      expect(farm.lastPourCells(), `${order.join('→')}: 1P の 分`).toEqual([cells[0]]);
      expect(farm.lastPourCells(2), `${order.join('→')}: 2P の 分`).toEqual([cells[1]]);
      // 2P の はたけも ちゃんと ぬれる
      expect(farm.soil(5, 7, 6)?.wet).toBe(true);
    }
  });

  it('fn が 例外を 投げても もとに もどる。入れ子は 外側の まま', () => {
    const { farm, ev } = ground();
    expect(() => farm.actAs(2, () => { throw new Error('x'); })).toThrow('x');
    farm.emit({ type: 'till', tick: 1, x: 1, y: 2, z: 3 });
    expect('by' in ev()[0]!, '例外の あとの 1P の 出来事に by は つかない').toBe(false);
    farm.actAs(2, () => {
      farm.actAs(2, () => undefined);
      farm.emit({ type: 'till', tick: 1, x: 1, y: 2, z: 3 });
    });
    const e = ev()[0]!;
    expect('by' in e && e.by).toBe(2);
  });
});

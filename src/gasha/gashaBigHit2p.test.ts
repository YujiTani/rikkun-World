import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { buildBig, worldHits } from './gashaBig';
import { BIG_ID_BASE, BigHit, damageOf, type BoxLike, type HitEnv, type HitPlayer, type HitSources, type YokaiWorldLike } from './gashaBigHit';
import { TUNE as T } from './gashaBigTuning';
import type { BladeShapeInfo, Vec3, YokaiRayHit } from '../contracts';

/**
 * COOP-1 4d-3（docs/design/COOP-1.md §3.6 (c)・§8 の 4d-3 の 行・§9.10・AC108・AC110）: がしゃどくろが 受ける 攻撃の 口（BigHit）の 2 人分。実装の 前に 書いた 赤の テスト。
 *
 * ---- 開発への 約束（`src/gasha/gashaBigHit.ts`。名前は 開発が かえて よいが、かえたら 依頼文と 仕様に 書く）----
 *   [AC108・不具合 ②] 矢・パンチの 割りこみ（install）は YokaiManager.damage の 引数を ぜんぶ わたす:
 *       (id, amount, from, knock?, by?, who?)。本物の 妖怪への ダメージの 6 番目 `who` を 落とさない。
 *       割りこみは 同じ 妖怪の 世界に 何体 出ても 1 重（本物の damage は 1 回だけ 呼ばれる。ダメージも 1 つの からだに 1 回）。
 *   [AC110] HitEnv.players?(): readonly HitPlayer[]  … 攻撃を 当てる 人の 一覧（毎ステップ 読み直す）。HitPlayer = { who: 1 | 2; sources: HitSources; defIgnore?(): number; onStrike?(i): void }。
 *       players が あれば 刀・波・雷・ドームの 当たりは 人ごとに 見る（1 振り・波 id・ドームの 間かくの 覚えも 人ごと。同じ 名前でも ぶつからない）。
 *       手甲の 防御無視は 当てた 人の defIgnore（HitEnv.defIgnore は 1 人用。players が ある ときは 使わない）。矢・パンチ（ray）には かけない。
 *       yokai・sound は 今の とおり HitEnv.sources（2 人で 共通）。players が ない ときは 今の とおり（AC113）。
 *   BigHit.damage(part, amount, at?, source?, who?: 1 | 2 = 1)、LastHit に `who`（最後の 一撃の 人 = とどめの 止め・ゆれを 受ける 相手）。がしゃどくろを たおしても けいけんちは 出ない（今の まま。仕様 §3.6 (c)・AC110・AC113）。実績は 2 人で 1 つ。
 */

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
function bodyBoxes(): { boxes: BoxLike[]; model: ReturnType<typeof buildBig> } {
  const model = buildBig();
  model.group.position.set(0, 0, 0);
  model.group.scale.setScalar(model.scale);
  const boxes = worldHits(model).map((h) => ({ name: h.name, c: h.center, ax: [...h.axes[0], ...h.axes[1], ...h.axes[2]], half: h.half }));
  return { boxes, model };
}

/** 手の 真ん中を 通る 刀（capsule）。swing 名で 1 振りを 見分ける */
function bladeOn(hand: BoxLike, swing: string, damage: number): HitSources {
  const hc = v(hand.c[0]!, hand.c[1]!, hand.c[2]!);
  return { blade: () => ({ shape: { kind: 'capsule', from: hc, to: v(hc.x, hc.y + 0.5, hc.z), radius: 0.5 } as BladeShapeInfo, damage, swing, frame: 1 }) };
}

function rig(env: Partial<HitEnv> = {}) {
  const { boxes, model } = bodyBoxes();
  const bh = new BigHit({ scene: new Scene(), angry: () => {}, ...env } as HitEnv);
  bh.bind(boxes, model);
  const hand = boxes.find((b) => b.name === 'handL')!;
  return { bh, boxes, hand };
}

/** 本物の 妖怪の 世界の まね: damage に 来た 引数を ぜんぶ 記録する */
function fakeYokai() {
  const calls: unknown[][] = [];
  const real: YokaiWorldLike = {
    raycast: (): YokaiRayHit | null => null,
    damage: ((...a: unknown[]) => { calls.push(a); return 3; }) as YokaiWorldLike['damage'],
  };
  return { real, calls };
}

describe('不具合 ②（AC108）: 矢・パンチの 割りこみが だれが 当てたか（who）を 落とさない', () => {
  it('ふつうの 妖怪への damage は 6 番目の who まで そのまま わたす（2P が たおした けいけんちが 1P に 入らない）', () => {
    const { real, calls } = fakeYokai();
    rig({ sources: { yokai: () => real } });
    const from = v(1, 2, 3);
    const knock = { dx: 1 };
    (real.damage as (...a: unknown[]) => unknown)(7, 3, from, knock, 'player', 2);
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual([7, 3, from, knock, 'player', 2]);
    (real.damage as (...a: unknown[]) => unknown)(8, 2, from, undefined, 'player', 1);
    expect(calls[1]).toEqual([8, 2, from, undefined, 'player', 1]);
    (real.damage as (...a: unknown[]) => unknown)(9, 1, from); // 引数が 少ない 呼び方も そのまま（足さない）
    expect(calls[2]).toEqual([9, 1, from]);
  });

  it('割りこみは 何体 出ても 1 重: 同じ 世界に 2 つ 目の からだを つないでも、本物の damage は 1 回だけ 呼ばれる（who つき）', () => {
    const { real, calls } = fakeYokai();
    rig({ sources: { yokai: () => real } });
    rig({ sources: { yokai: () => real } });
    rig({ sources: { yokai: () => real } });
    (real.damage as (...a: unknown[]) => unknown)(7, 3, v(0, 0, 0), undefined, 'player', 2);
    expect(calls.length).toBe(1);
    expect(calls[0]!.length).toBe(6);
    expect(calls[0]![5]).toBe(2);
  });

  it('がしゃどくろ自身への ダメージは 本物の damage に 行かず、何体 つないでも ダメージは 1 回ぶん（2 重に ならない）', () => {
    const { real, calls } = fakeYokai();
    const a = rig({ sources: { yokai: () => real } });
    const b = rig({ sources: { yokai: () => real } });
    const i = a.boxes.findIndex((x) => x.name === 'handL');
    const lost = () => (T.hit.hp - a.bh.hp) + (T.hit.hp - b.bh.hp);
    const dealt = damageOf('hand', 80);
    expect(dealt).toBeGreaterThan(0);
    (real.damage as (...a: unknown[]) => unknown)(BIG_ID_BASE + i, 80, v(0, 0, 0), undefined, 'player', 2);
    expect(calls).toEqual([]);
    expect(lost()).toBeCloseTo(dealt, 5); // 2 つの からだの どちらか 1 つに 1 回
    expect(T.hit.hp - b.bh.hp).toBeCloseTo(dealt, 5); // 新しく bind した 方に 入る（古い 方は 無傷）
    expect(a.bh.hp).toBe(T.hit.hp);
  });

  it('矢・パンチで 当てた 人（who）が LastHit に のこる。2P の 最後の 一撃は 2P（既定は 1P）', () => {
    const { real } = fakeYokai();
    const r = rig({ sources: { yokai: () => real } });
    const i = r.boxes.findIndex((x) => x.name === 'handL');
    (real.damage as (...a: unknown[]) => unknown)(BIG_ID_BASE + i, 60, v(0, 0, 0), undefined, 'player', 2);
    expect(r.bh.last?.source).toBe('ray');
    expect(r.bh.last?.who).toBe(2);
    (real.damage as (...a: unknown[]) => unknown)(BIG_ID_BASE + i, 60, v(0, 0, 0));
    expect(r.bh.last?.who).toBe(1);
    r.bh.damage('hand', 60, null, 'test', 2);
    expect(r.bh.last?.who).toBe(2);
    r.bh.damage('hand', 60);
    expect(r.bh.last?.who).toBe(1);
  });
});

describe('2P の こうげきが 当たる（AC110）: 人ごとの 当たりの 口（HitEnv.players）', () => {
  it('2P の 刀が 手に 当たる: 1P と 同じ 式の ダメージ。最後の 一撃は 2P', () => {
    const base = rig();
    const hand = base.hand;
    const r = rig({
      players: () => [
        { who: 1, sources: {} },
        { who: 2, sources: bladeOn(hand, 'kesa:0', 50) },
      ] as HitPlayer[],
    });
    r.bh.step(1 / 60);
    expect(r.bh.last?.part).toBe('hand');
    expect(r.bh.last?.source).toBe('blade');
    expect(r.bh.last?.who).toBe(2);
    expect(T.hit.hp - r.bh.hp).toBeCloseTo(damageOf('hand', 50, 0), 5);
  });

  it('手甲の 防御無視は 当てた 人の そうび: 2P の defIgnore が 2P の 刀に 効き、1 人用の env.defIgnore（1P）は 2P に 効かない', () => {
    const hand = rig().hand;
    const r = rig({
      defIgnore: () => 99,
      players: () => [
        { who: 1, sources: {}, defIgnore: () => 0 },
        { who: 2, sources: bladeOn(hand, 'kesa:0', 50), defIgnore: () => 20 },
      ] as HitPlayer[],
    });
    r.bh.step(1 / 60);
    expect(T.hit.hp - r.bh.hp).toBeCloseTo(damageOf('hand', 50, 20), 5);
    expect(damageOf('hand', 50, 20)).toBeGreaterThan(damageOf('hand', 50, 0)); // 防御無視で 本当に 大きく なる 数を えらんだ
    // 1P の 刀は 1P の defIgnore
    const r1 = rig({
      players: () => [{ who: 1, sources: bladeOn(hand, 'kesa:0', 50), defIgnore: () => 25 }, { who: 2, sources: {}, defIgnore: () => 0 }] as HitPlayer[],
    });
    r1.bh.step(1 / 60);
    expect(r1.bh.last?.who).toBe(1);
    expect(T.hit.hp - r1.bh.hp).toBeCloseTo(damageOf('hand', 50, 25), 5);
  });

  it('同じ ステップに 同じ 名前の 振りでも 2 人とも 当たる（1 振りの 覚えは 人ごと）。次の ステップは どちらも もう 当たらない', () => {
    const hand = rig().hand;
    const r = rig({
      players: () => [
        { who: 1, sources: bladeOn(hand, 'kesa:0', 50) },
        { who: 2, sources: bladeOn(hand, 'kesa:0', 50) },
      ] as HitPlayer[],
    });
    r.bh.step(1 / 60);
    expect(r.bh.hits).toBe(2);
    expect(T.hit.hp - r.bh.hp).toBeCloseTo(damageOf('hand', 50, 0) * 2, 5);
    r.bh.step(1 / 60);
    expect(r.bh.hits).toBe(2);
  });

  it('真空波・らせん: 2 人の 波の id が 同じ（1 と 1）でも 2 人とも 当たる。つらぬいても 人ごとに 1 回', () => {
    const { hand } = rig();
    const z0 = hand.c[2]! + hand.half[2]! + 3;
    const wave = (): HitSources['waves'] => () => [{ id: 1, position: v(hand.c[0]!, hand.c[1]!, z0 - Math.min(10, tick) * 0.5), radius: 0.5, damage: 1.8 }];
    let tick = 0;
    const r = rig({ players: () => [{ who: 1, sources: { waves: wave() } }, { who: 2, sources: { waves: wave() } }] as HitPlayer[] });
    for (tick = 0; tick <= 12; tick++) r.bh.step(1 / 60);
    expect(r.bh.hits).toBe(2);
    expect(T.hit.hp - r.bh.hp).toBeGreaterThan(0);
    expect(r.bh.last?.source).toBe('wave');
  });

  it('ドーム: 間かくの 覚えも 人ごと（同じ ステップに 2 人とも 当たり、間かくの 間は どちらも 当たらない）', () => {
    const { hand } = rig();
    const dome = (): HitSources['dome'] => () => ({ center: v(hand.c[0]!, hand.c[1]!, hand.c[2]!), radius: 7, damage: 10, everySteps: 60 });
    const r = rig({ players: () => [{ who: 1, sources: { dome: dome() } }, { who: 2, sources: { dome: dome() } }] as HitPlayer[] });
    r.bh.step(1 / 60);
    expect(r.bh.hits).toBe(2);
    for (let i = 0; i < 30; i++) r.bh.step(1 / 60);
    expect(r.bh.hits).toBe(2);
    for (let i = 0; i < 40; i++) r.bh.step(1 / 60);
    expect(r.bh.hits).toBe(4);
  });

  it('2P が やめて 一覧から 消えたら、その人の 刀は 当たらなく なる（いる 間は 当たる）。消す 前に 新しい 振りに かわって いても 当たらない。一覧が 空でも こわれない', () => {
    const hand = rig().hand;
    let swing = 'a';
    let list: HitPlayer[] = [{ who: 1, sources: {} }, { who: 2, sources: { blade: () => bladeOn(hand, swing, 50).blade!() } }];
    const r = rig({ players: () => list });
    r.bh.step(1 / 60);
    expect(r.bh.hits).toBe(1); // いる 間は 当たる
    swing = 'b'; // 新しい 振り（古い sources を 持ちつづける 実装なら ここで また 当たる）
    list = [{ who: 1, sources: {} }];
    r.bh.step(1 / 60);
    expect(r.bh.hits).toBe(1);
    list = [];
    expect(() => r.bh.step(1 / 60)).not.toThrow();
  });

  it('雷（strikes）: 2P の 落とした 雷も 当たる（2P の defIgnore が 効く）。同じ ステップに 2 人の 雷が 落ちれば 2 回', () => {
    const { hand } = rig();
    const c = v(hand.c[0]!, hand.c[1]!, hand.c[2]!);
    let on2 = true;
    const r = rig({
      players: () => [
        { who: 1, sources: {}, defIgnore: () => 0 },
        { who: 2, sources: { strikes: () => (on2 ? [{ center: c, radius: 5, damage: 50 }] : []) }, defIgnore: () => 20 },
      ] as HitPlayer[],
    });
    r.bh.step(1 / 60);
    expect(r.bh.last?.source).toBe('strike');
    expect(r.bh.last?.who).toBe(2);
    expect(T.hit.hp - r.bh.hp).toBeCloseTo(damageOf(r.bh.last!.part, 50, 20), 5);
    on2 = false;
    const both = rig({
      players: () => [
        { who: 1, sources: { strikes: () => [{ center: c, radius: 5, damage: 50 }] } },
        { who: 2, sources: { strikes: () => [{ center: c, radius: 5, damage: 50 }] } },
      ] as HitPlayer[],
    });
    both.bh.step(1 / 60);
    expect(both.bh.hits).toBe(2);
  });

  it('手甲の 追い打ち（onStrike）は 当てた 人の 口へ（1P の 口には 行かない）', () => {
    const hand = rig().hand;
    const got: string[] = [];
    const r = rig({
      onStrike: () => { got.push('env'); },
      players: () => [
        { who: 1, sources: {}, onStrike: () => { got.push('p1'); } },
        { who: 2, sources: bladeOn(hand, 'a', 50), onStrike: () => { got.push('p2'); } },
      ] as HitPlayer[],
    });
    r.bh.step(1 / 60);
    expect(got).toEqual(['p2']);
  });
});

describe('1 人の とき（AC113）: players が なければ 今の とおり', () => {
  it('env.sources の 刀が 当たり、LastHit の who は 1', () => {
    const hand = rig().hand;
    const r = rig({ sources: bladeOn(hand, 'kesa:0', 50) });
    r.bh.step(1 / 60);
    expect(r.bh.last?.part).toBe('hand');
    expect(r.bh.last?.who).toBe(1);
    expect(T.hit.hp - r.bh.hp).toBeCloseTo(damageOf('hand', 50, 0), 5);
  });

  it('八咫烏の ほのお（bursts）: 2P の 球は 2P の 当てた ことに なる（last.who = 2）', () => {
    const { bh, hand } = rig({ players: () => [{ who: 1, sources: {} }, { who: 2, sources: { bursts: () => [{ center: v(hand.c[0]!, hand.c[1]!, hand.c[2]!), radius: 2, damage: 6 }] } }] });
    bh.step(1 / 60);
    expect(bh.last?.who).toBe(2);
    expect(bh.last?.source).toBe('burst');
  });
});

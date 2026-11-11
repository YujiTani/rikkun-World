import { describe, expect, it } from 'vitest';
import type { BladeEvent, BowEvent, CombatEvent, DigEvent, ItemId, WearEvent } from '../contracts';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { AchievementSystem } from '../achievements/AchievementSystem';
import { InventoryImpl } from '../inventory/Inventory';
import { createP2Wear } from './p2Wear';
import { P2State } from './p2State';
import { createP2Craft } from './p2Craft';
import { StorageSystem } from '../storage/StorageSystem';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createDropPicked, createP2Feed, feedArrowEvents, routeDropPicked } from './p2Feed';

/**
 * COOP-1 5b（docs/design/COOP-1.md 1.14 §3.7 (c)・§8 の 5b の 行・AC132・AC150）の 先行テスト（赤）。2P の 出来事を 実績へ わたす 中身。
 * いま 2P の ほった／ひろった／たたかった／刀・弓／へった の 出来事は 音や 絵に なるだけで 実績（AchievementSystem）に 入らない。
 * 実績は 2 人で 共有（同じ AchievementSystem に 1 回ずつ）。2P の ログは 出さない（§13）。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/p2Feed.ts（新しく。`game/wire/duoPlay.ts` は これを 呼ぶ 行だけ）
 *     type P2FeedSink = Pick<AchievementSystem, 'feedDig' | 'feedCombat' | 'feedBlade' | 'feedArrow' | 'feedWear'>
 *       … AchievementSystem.feedBlade は `feedBlade(events, who: 1 | 2 = 1)` に する（3 段コンボの 途中経過 comboHit を 人ごとに もつ。1P の 呼び出しは そのまま）
 *     createP2Feed(sink: P2FeedSink): P2Feed
 *     P2Feed = {
 *       tapDig(drain: () => DigEvent[]): () => DigEvent[]   … 2P の ほる係の 出来事の とり出し口を 包む。包んだ 口が 呼ばれる たびに、とり出した 出来事を
 *                                                            sink.feedDig に **1 回** わたして、同じ 配列を そのまま 返す（空なら feedDig は 呼ばない）。
 *                                                            配線は `createP2DigFx({ ..., events: feed.tapDig(() => dig.drainEvents()) })`（DigFx が 毎ステップ 取る）
 *       combat(events: readonly CombatEvent[]): void        … sink.feedCombat(events) を 1 回（空なら 呼ばない）。配列は かえない（音〔l.sounds.combat〕にも 同じ 配列を 使う）
 *       blade(events: readonly BladeEvent[]): void          … sink.feedBlade(events, 2) を 1 回（空なら 呼ばない）
 *       arrows(events: readonly BowEvent[]): void           … feedArrowEvents(sink, events)
 *       wear(events: readonly WearEvent[]): void            … sink.feedWear(events) を 1 回（空なら 呼ばない）
 *     }
 *     feedArrowEvents(sink: Pick<AchievementSystem, 'feedArrow'>, events: readonly BowEvent[]): void
 *       … arrowShot ごとに feedArrow('shot')・arrowHit ごとに feedArrow('hit')。ほかは 何もしない。**1P の step.ts も この 関数を 使う**（式の コピーを 作らない）
 *     type DropPicked = (item: ItemId, count: number, fromYokai: boolean) => void
 *     createDropPicked(d: { notifyPickup(item: ItemId, count: number): void; noteSeedFound(item: ItemId, at: Vec3): void; position(): Vec3; extra?: DropPicked }): DropPicked
 *       … 落とし物を ひろった ときの 知らせ（1P の ui.ts の onDropPicked と 同じ 中身を 1 つに）。(notifyPickup は 実績 obtain:*・pickup:* の もと)
 *         順番は 今の 1P（ui.ts:181）と 同じ: ① fromYokai が true で item が たね（SEED_ITEM の どれか）なら noteSeedFound(item, position()) ② notifyPickup(item, count) を 1 回 ③ extra（1P は ホットバーの ぽん）。
 *         **1P の ui.ts も これで 作る**（2P の ぶんは extra なし）
 *     routeDropPicked(d: { p1: DropPicked; p2: DropPicked }): (item: ItemId, count: number, fromYokai: boolean, who: 1 | 2) => void
 *       … who 1 は p1・who 2 は p2 を 1 回。`game/wire/inventory.ts` の DropField.onPickup が これを 使う（今の `if (who === 1)` を やめる）
 *   src/duo/p2Wear.ts   P2WearDeps に `onEvents?: (events: WearEvent[]) => void`
 *     … step() で とり出した もちもの→そうびの 出来事を まとめた 配列を、1 つ以上 あった ステップに **1 回**（空なら 呼ばない）。音・お知らせ・かけらは 今の まま。
 *       配線は `onEvents: feed.wear`。1P の WeaponFx の onWear と 同じ 形。
 *   1 人の ときは かわらない（AC130・AC146）: 2P が いない あいだは どれも 呼ばれない（配線が live の ときだけ 呼ぶ）。
 */

const T = 1;
const pos = { x: 0, y: 0, z: 0 };
const mk = (): AchievementSystem => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));

const DIG: DigEvent[] = [
  { type: 'break', tick: T, block: { x: 1, y: 1, z: 1 }, id: 'dirt', gotItem: true, count: 1 },
  { type: 'break', tick: T, block: { x: 2, y: 1, z: 1 }, id: 'stone', gotItem: true, count: 1 },
  { type: 'place', tick: T, block: { x: 3, y: 1, z: 1 }, id: 'dirt' },
];
const COMBAT = [
  { type: 'playerHit', tick: T, by: 'karakasa', amount: 2, blocked: true },
  { type: 'fallHurt', tick: T, amount: 1 },
  { type: 'death', tick: T, dropped: [] },
  { type: 'pickup', tick: T, bagId: 1 },
] as unknown as CombatEvent[];
const BLADE: BladeEvent[] = [1, 2, 3].flatMap((step): BladeEvent[] => [
  { type: 'techStart', tick: T, tech: 'slash' as never, step: step as never },
  { type: 'techHit', tick: T, tech: 'slash' as never, yokaiId: 1, damage: 1, knock: 0, up: 0, position: pos, step: step as never },
]);
const BOW: BowEvent[] = [
  { type: 'arrowShot', tick: T, stage: 1, speed: 1, position: pos, velocity: pos },
  { type: 'arrowShot', tick: T, stage: 2, speed: 1, position: pos, velocity: pos },
  { type: 'arrowHit', tick: T, yokaiId: 1, damage: 1, position: pos },
  { type: 'noArrow', tick: T },
  { type: 'pickup', tick: T },
];
const WEAR: WearEvent[] = [
  { type: 'wearLow', tick: T, item: 'katana' as ItemId, slot: 0 },
  { type: 'toolBreak', tick: T, item: 'katana' as ItemId, slot: 0 },
  { type: 'toolBreak', tick: T, item: 'yoroi' as ItemId, slot: 'body' },
];

describe('AC132: 2P の ほった 出来事が 実績へ（1P の feedDig と 同じ だけ ふえる）', () => {
  it('包んだ 口から 出た 出来事を feedDig に 1 回 わたし、同じ 配列を 返す。実績の 数は 1P に 同じ 出来事を わたした ときと 同じ', () => {
    const calls: Array<readonly DigEvent[]> = [];
    const feed = createP2Feed({ withWho: (_w, fn) => fn(), feedDig: (e) => void calls.push(e), feedCombat() {}, feedBlade() {}, feedArrow() {}, feedWear() {} });
    const tapped = feed.tapDig(() => DIG);
    expect(tapped()).toBe(DIG);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(DIG);

    const one = mk();
    const two = mk();
    one.feedDig(DIG); // 1P の 道
    createP2Feed(two).tapDig(() => DIG)(); // 2P の 道
    expect(two.stats()).toEqual(one.stats());
    expect(two.stats()['break:dirt']).toBe(1);
    expect(two.stats()['break:*']).toBe(2);
    expect(two.stats()['place:*']).toBe(1);
  });

  it('空の ときは feedDig を 呼ばない・呼ぶ たびに 1 回ずつ（たまって 2 回 数えない）', () => {
    let feeds = 0;
    const feed = createP2Feed({ withWho: (_w, fn) => fn(), feedDig: () => void feeds++, feedCombat() {}, feedBlade() {}, feedArrow() {}, feedWear() {} });
    let queue: DigEvent[] = [];
    const tapped = feed.tapDig(() => {
      const q = queue;
      queue = [];
      return q;
    });
    expect(tapped()).toEqual([]);
    expect(feeds).toBe(0);
    queue = [DIG[0]!];
    tapped();
    tapped();
    expect(feeds).toBe(1);
  });
});

describe('AC132: 落とし物を ひろった 知らせ（obtain:*・pickup:*・妖怪の たね）を 2P も', () => {
  const SEED = 'seed_onion' as ItemId;
  function parts() {
    const log: string[] = [];
    const mkDrop = (name: string, at: { x: number; y: number; z: number }, extra?: (i: ItemId, c: number, y: boolean) => void) =>
      createDropPicked({
        notifyPickup: (i, c) => void log.push(`${name}:pickup:${i}:${c}`),
        noteSeedFound: (i, p) => void log.push(`${name}:seed:${i}:${p.x}`),
        position: () => at,
        ...(extra ? { extra } : {}),
      });
    return { log, mkDrop };
  }

  it('ひろった 数が notifyPickup に 1 回。妖怪の おとしものの たねだけ noteSeedFound（その 人の 場所で。notifyPickup より 先 = 今の 1P と 同じ 順）', () => {
    const { log, mkDrop } = parts();
    const drop = mkDrop('p2', { x: 7, y: 0, z: 0 });
    drop('dirt' as ItemId, 3, false);
    drop(SEED, 1, false); // 妖怪の おとしものでは ない
    drop('dirt' as ItemId, 1, true); // 妖怪の おとしものでも たねでは ない
    drop(SEED, 2, true);
    expect(log).toEqual(['p2:pickup:dirt:3', `p2:pickup:${SEED}:1`, 'p2:pickup:dirt:1', `p2:seed:${SEED}:7`, `p2:pickup:${SEED}:2`]);
  });

  it('extra（1P の ホットバーの ぽん）は 最後に 1 回。2P は extra なし', () => {
    const { log, mkDrop } = parts();
    mkDrop('p1', { x: 1, y: 0, z: 0 }, (i, c) => void log.push(`p1:hotbar:${i}:${c}`))('dirt' as ItemId, 2, false);
    expect(log).toEqual(['p1:pickup:dirt:2', 'p1:hotbar:dirt:2']);
  });

  it('who で 行き先が かわる: 1 は p1・2 は p2 だけ（どちらも 1 回）。いまは who 2 が すてられている', () => {
    const log: string[] = [];
    const route = routeDropPicked({ p1: (i, c) => void log.push(`p1:${i}:${c}`), p2: (i, c) => void log.push(`p2:${i}:${c}`) });
    route('dirt' as ItemId, 1, false, 1);
    route('stone' as ItemId, 2, false, 2);
    expect(log).toEqual(['p1:dirt:1', 'p2:stone:2']);
  });

  it('実績: 2P が ひろった 物は 2P の notifyPickup → 2P の つくる の step → feedCraft の 道で obtain:*・pickup:* に 入る(1P の 道と 同じ 数)', () => {
    const world = new ArrayVoxelWorld({ x: 16, y: 16, z: 16 });
    const mkCraft = (a: AchievementSystem) =>
      createP2Craft({ world, inventory: new InventoryImpl(), tansu: new StorageSystem({ world, inventory: new InventoryImpl(), player: () => pos, scatter: () => undefined, inventoryOpen: () => false, openScreen: () => undefined, closeScreen: () => undefined }), position: () => pos, tansuRange: () => 8, requestSave: () => undefined, feedCraft: (e) => a.feedCraft(e) });
    const one = mk();
    const two = mk();
    const c1 = mkCraft(one);
    const c2 = mkCraft(two);
    // 1P の 道（今の ui.ts）: craft.notifyPickup → 毎ステップ feedCraft
    createDropPicked({ notifyPickup: (i, c) => c1.craft.notifyPickup(i, c), noteSeedFound() {}, position: () => pos })('dirt' as ItemId, 3, false);
    c1.step();
    // 2P の 道: routeDropPicked(who 2) → 2P の notifyPickup → p2Craft.step が feedCraft
    const p2 = createDropPicked({ notifyPickup: (i, c) => c2.craft.notifyPickup(i, c), noteSeedFound() {}, position: () => pos });
    routeDropPicked({ p1: () => undefined, p2 })('dirt' as ItemId, 3, false, 2);
    expect(two.stats()['obtain:dirt'], 'step の 前は まだ').toBeUndefined();
    c2.step();
    expect(two.stats()['obtain:dirt']).toBe(3);
    expect(two.stats()['pickup:*']).toBe(3);
    expect(two.stats()).toEqual(one.stats());
  });
});

describe('AC150: 2P の combat・blade・arrow・wear の 出来事が 実績へ 1 回ずつ', () => {
  it('combat: 同じ 配列を feedCombat に 1 回。配列は かえない（音にも 同じ 配列）。実績は 1P と 同じ', () => {
    const calls: Array<readonly CombatEvent[]> = [];
    const feed = createP2Feed({ withWho: (_w, fn) => fn(), feedDig() {}, feedCombat: (e) => void calls.push(e), feedBlade() {}, feedArrow() {}, feedWear() {} });
    const copy = [...COMBAT];
    feed.combat(COMBAT);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(copy);
    expect(COMBAT).toEqual(copy);
    feed.combat([]);
    expect(calls).toHaveLength(1);

    const one = mk();
    const two = mk();
    one.feedCombat(COMBAT);
    createP2Feed(two).combat(COMBAT);
    expect(two.stats()).toEqual(one.stats());
    expect(two.stats()['guard']).toBe(1);
    expect(two.stats()['death']).toBe(1);
  });

  it('blade: feedBlade に 1 回。3 段 ぜんぶ 当てると bladeCombo3 が 1P と 同じに ふえる', () => {
    const one = mk();
    const two = mk();
    one.feedBlade(BLADE);
    createP2Feed(two).blade(BLADE);
    expect(two.stats()['bladeCombo3']).toBe(1);
    expect(two.stats()).toEqual(one.stats());
  });

  it('blade: sink には who 2 で わたる(feedBlade(events, 2))', () => {
    const got: Array<unknown[]> = [];
    const feed = createP2Feed({ withWho: (_w, fn) => fn(), feedDig() {}, feedCombat() {}, feedBlade: ((e: unknown, who: unknown) => void got.push([e, who])) as never, feedArrow() {}, feedWear() {} });
    feed.blade(BLADE);
    expect(got).toEqual([[BLADE, 2]]);
  });

  it('blade: 1P と 2P が まざって 打っても それぞれの 3 段だけ 数える(途中経過は 人ごと)', () => {
    const s = mk();
    const p2 = createP2Feed(s);
    const step = (n: number, kind: 'techStart' | 'techHit'): BladeEvent[] => [BLADE.find((e) => e.type === kind && (e as { step?: number }).step === n)!];
    s.feedBlade(step(1, 'techStart')); // 1P 1 段目
    s.feedBlade(step(1, 'techHit'));
    p2.blade(BLADE.slice(0, 2)); // 2P 1 段目（2P の techStart が 1P の 途中経過を けさない）
    p2.blade(BLADE.slice(2, 4)); // 2P 2 段目
    s.feedBlade([...step(2, 'techStart'), ...step(2, 'techHit')]); // 1P 2 段目
    p2.blade(BLADE.slice(4)); // 2P 3 段目 → 2P の コンボ 1
    expect(s.stats()['bladeCombo3']).toBe(1);
    s.feedBlade([...step(3, 'techStart'), ...step(3, 'techHit')]); // 1P 3 段目 → 1P の コンボ
    expect(s.stats()['bladeCombo3']).toBe(2);
  });

  it('arrow: 矢を うつ／当てるが 1 つずつ。noArrow・pickup は 数えない。1P の step.ts と 同じ 関数', () => {
    const one = mk();
    const two = mk();
    feedArrowEvents(one, BOW); // 1P の 道（step.ts も これ）
    createP2Feed(two).arrows(BOW); // 2P の 道
    expect(two.stats()['arrowShot']).toBe(2);
    expect(two.stats()['arrowHit']).toBe(1);
    expect(two.stats()).toEqual(one.stats());
  });

  it('wear: 道具が こわれた(toolBroken)・そうびが こわれた(armorBroken) が 1P と 同じに ふえる', () => {
    const one = mk();
    const two = mk();
    one.feedWear(WEAR);
    createP2Feed(two).wear(WEAR);
    expect(two.stats()['toolBroken']).toBe(1);
    expect(two.stats()['armorBroken']).toBe(1);
    expect(two.stats()).toEqual(one.stats());
  });

  it('2 人分は 同じ 実績に たしあわさる（共有）', () => {
    const s = mk();
    s.feedArrow('shot'); // 1P
    createP2Feed(s).arrows(BOW); // 2P
    expect(s.stats()['arrowShot']).toBe(3);
  });
});

describe('AC150: createP2Wear の onEvents（へった／こわれたを 実績へ わたす 口）', () => {
  const sound = { playTones: () => undefined } as never;
  function setup() {
    const p2 = new P2State();
    const batches: WearEvent[][] = [];
    const wear = createP2Wear({
      inventory: p2.inventory,
      armor: p2.armor,
      sound,
      notice: { low() {}, broken() {} },
      nameOf: (i) => i,
      handPos: () => pos,
      onEvents: (e) => void batches.push([...e]),
    });
    return { p2, batches, wear };
  }
  function wearTool(inv: InventoryImpl, item: ItemId, left: number): void {
    inv.setSlot(0, { item, count: 1 });
    inv.select(0);
    inv.setDurability(0, left);
    inv.wearHeld(1);
  }

  it('こわれた ステップに 1 回だけ、toolBreak を ふくむ 配列で よばれる。次の ステップは 空なので よばれない', () => {
    const { p2, batches, wear } = setup();
    wearTool(p2.inventory, 'katana' as ItemId, 1);
    wear.step();
    expect(batches).toHaveLength(1);
    expect(batches[0]!.some((e) => e.type === 'toolBreak')).toBe(true);
    wear.step();
    expect(batches).toHaveLength(1);
  });

  it('何も ない ステップは よばれない', () => {
    const { batches, wear } = setup();
    wear.step();
    wear.step();
    expect(batches).toEqual([]);
  });
});

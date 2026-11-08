import { describe, expect, it } from 'vitest';
import {
  CROP_KINDS,
  LIVE_SETTING_DEFAULTS,
  SEED_ITEM,
  VEG_ITEM,
  createM7Settings,
  type CropKind,
  type CropStage,
  type FarmEvent,
  type ItemId,
  type LockStatus,
  type PlayerState,
} from '../contracts';
import { AchievementSystem } from '../achievements/AchievementSystem';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { itemDef } from '../content/items/registry';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { createDigConfig } from '../dig/config';
import { DigSystemImpl } from '../dig/DigSystem';
import { createFarmSystem, type FarmSystemImpl } from '../farm/FarmSystem';
import { createBucket } from '../farm/bucket';
import { Pet } from '../farm/pet';
import { createWatering } from '../farm/watering';
import { FarmFx } from '../fx/farmFx';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { magmaId } from '../world/blocks/magma';
import { createRng } from '../world/gen/random';
import { createP2Dig } from './p2Dig';
import { createP2Farm, type P2Farm } from './p2Farm';
import { P2State } from './p2State';

/**
 * COOP-1 5a（2P の 畑。docs/design/COOP-1.md 1.14 の §3.7 (a)・§8・§9.11・§10、AC115〜AC124・AC129・AC130・AC145）の 先行テスト（赤）。
 * 畑は 世界に 1 つ（本物の `createFarmSystem`）。1P も 2P も 本物の `DigSystemImpl` で 動かし、2P の ほる係は `createP2Dig`。
 * 数は ぜんぶ 設定の 表（`createM7Settings()`・`LIVE_SETTING_DEFAULTS`・アイテムの 登録表）から 読む。1P と 2P で 同じ 部品を 使う 約束 =
 * 同じ 場面を 1P と 2P で 動かして 結果を くらべる（式の コピーが あれば 食いちがう）。
 *
 * ---- 実装への 約束（名前・形。仕様 §8「つなぎ目の 約束」に 合わせた。かえたら 依頼文と 仕様に 書く）----
 *   src/contracts/farm.ts
 *     `FarmEvent` の 1 つ 1 つに 省ける `by?: 2`（2P が 起こした 物だけ `by: 2`。1P の 物・作物が 自分で 育つ 物には `by` を 書かない。`'by' in e` が false）。
 *     `FarmStepContext` に 省ける `p2Pos?: Vec3`（2P の 足もと。2P が いない ときは 渡さない）。かかし の 近さは 2 人の どちらか（→ src/farm/farmTwo.test.ts）。
 *   src/duo/p2Farm.ts   `createP2Farm(d: P2FarmDeps): P2Farm`   （2P が 畑で 使う 物を まとめる 包み。FarmSystem.ts・duoPlay.ts には 中身を 足さない）
 *     P2FarmDeps = {
 *       farm: FarmSystemImpl;                 // 世界に 1 つの 畑（1P と 同じ 物）
 *       pet: PetPort;                         // 世界に 1 つの ごきげん（作物の 物。1P と 同じ 物）
 *       world: VoxelWorld;                    // バケツが 水を よみかきする
 *       inventory: InventoryImpl;             // 2P の もちもの（p2.inventory）。じょうろの 水・バケツは ここ
 *       vitals: DigVitalsPort;                // 2P の ハート（2P の combat）
 *       settings: M7Settings;
 *       tick: () => number;
 *       live: () => Pick<LiveSettings, 'animalEggHeal' | 'meatHeal'>;   // 1P が `live.animalEggHeal` を 読む のと 同じ 設定
 *       aimed: () => Vec3 | null;             // 2P の ねらっている マス（`dig.target()?.block`）
 *     }
 *     P2Farm = {
 *       m4: Pick<DigM4Deps, 'farm' | 'water' | 'bucket' | 'pet' | 'vitals' | 'emitFarm' | 'eggHeal' | 'meatHeal'>;   // 2P の ほる係の m4 に そのまま 広げる（`m4: { ...p2Farm.m4, … }`）
 *       lastPourCells(): readonly Vec3[];     // 2P が さいごに まいた マス（しぶき用。畑の `lastPourCells()` は 1P の 物の まま）
 *       aim(): FarmAim | null;                // 2P の ねらいの `farm.aim`（= `shared.p2FarmAim()`）。ねらい なし・畑でない → null
 *     }
 *     - m4.farm・m4.emitFarm・m4.water・m4.bucket が 出す 出来事は ぜんぶ `by: 2`。畑の `lastHint` は 書かない（2P の 合図は 出来事 `hint`〔by: 2〕だけ）。
 *     - 畑の 中で 出る 出来事（till・plant・harvest・pourAt の pour…）に `by: 2` を つけ、2P の pour が 1P の `lastPour` を 上書き しない ために、
 *       FarmSystemImpl に 小さい 口を 足す（包みは 2P の 呼び出しを ぜんぶ これで 包む。形は src/farm/farmTwo.test.ts の 頭の 約束）:
 *         `farm.actAs<T>(by: 2, fn: () => T): T` … fn の あいだ: emit に `by: 2`（もう `by` が ある 出来事は そのまま）・`noteHint` は lastHint を 書かない（出来事 hint は 出す）・
 *         `pourAt` は 畑の lastPour を 書かず 2P の 分を 別に もつ。`farm.lastPourCells(by?: 2)`（by: 2 なら 2P の さいごの マス。`P2Farm.lastPourCells()` は これ）。
 *         fn が 例外を 投げても もとに もどる。1P の 呼び出し（actAs の 外）は 今まで どおり。
 *     - 水は 2P の もちもの（p2.inventory）の じょうろ・バケツ。ハートは 2P の vitals。やさいは とった 人の もちもの（ほる係が 入れる）。
 *     - 1P の 呼び出しの 出来事に `by` は つかない・畑の 乱数の 順は かわらない（2P が 何も しない 間は 今と 同じ）。
 *
 * 出来事の 人は `farm.drainEvents()` に 1 つの 列で 集まる（畑は 世界に 1 つ）。音は FarmFx が 1 回ずつ（→ src/fx/farmFx.by.test.ts）。
 */

const EYE = 1.62;
const DAY = 91800;
/** はたけ の マス・作物 の マス・西となり（水を おく）。列 i は z を 2 ずつ ずらす（0 = 1P の 列、1 = 2P の 列） */
const S = { x: 12, y: 7, z: 8 } as const;
const C = { x: 12, y: 8, z: 8 } as const;
const SIDE = { x: 11, y: 7, z: 8 } as const;
const rowZ = (i: number): number => S.z + 2 * i;
/** くさの ままの マス（x。はたけの 手前） */
const G = 10;
type Who = 1 | 2;
const rowOf = (who: Who): number => who - 1;
const live = { animalEggHeal: LIVE_SETTING_DEFAULTS.animalEggHeal + 1, meatHeal: LIVE_SETTING_DEFAULTS.meatHeal + 1 };

interface Opts {
  /** false なら 2P の 部品を 作らない（1 人の ときの くらべ用） */
  p2?: boolean;
  wet?: boolean;
  /** 列を はたけに する 数（既定 3: 1P・2P・予備） */
  rows?: number;
  grassSeedChance?: number;
}

function scene(o: Opts = {}) {
  const rows = o.rows ?? 3;
  const world = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
  world.fill(0, 0, 0, 31, S.y - 1, 31, 'dirt');
  world.fill(0, S.y, 0, 31, S.y, 31, 'grass');
  const settings = createM7Settings();
  if (o.grassSeedChance !== undefined) settings.farmGrassSeedChance = o.grassSeedChance;
  const state = { tick: 0 };
  const pet = new Pet({ settings, dayLength: () => DAY });
  const farm: FarmSystemImpl = createFarmSystem({
    world,
    light: { skyLight: () => 15, blockLight: () => 0, level: () => 15 },
    seed: 1,
    dayLength: () => DAY,
    settings,
    tick: () => state.tick,
    fillTansu: () => undefined,
    placement: () => ({ wild: [], oldFarm: null }),
    pet,
  });
  for (let i = 0; i < rows; i++) {
    const z = rowZ(i);
    world.setBlock(SIDE.x, SIDE.y, z, o.wet ? 'water' : 'air'); // 西となり: 水（ぬれた）か あな（かわいた）。ここ ごしに はたけの 横を ねらえる
    expect(farm.till(S.x, S.y, z), `はたけ ${i}`).toBe(true);
  }
  farm.drainEvents();

  const mkPlayer = (z: number): PlayerState => ({ position: { x: S.x - 3.5, y: S.y + 1, z }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false });
  const players: Record<Who, PlayerState> = { 1: mkPlayer(rowZ(0) + 0.5), 2: mkPlayer(rowZ(1) + 0.5) };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const a1 = new ActionState();
  const a2 = new ActionState();
  const inv1 = new InventoryImpl();
  inv1.select(0);
  const p2 = new P2State();
  p2.inventory.select(0);
  const inv2 = p2.inventory;
  const hp = { 1: { now: 10, max: 100 }, 2: { now: 10, max: 100 } };
  const vit = (who: Who) => ({ hp: () => hp[who].now, maxHp: () => hp[who].max, heal: (n: number) => { const g = Math.max(0, Math.min(n, hp[who].max - hp[who].now)); hp[who].now += g; return g; } });
  const scattered: Array<{ who: Who; item: string; count: number }> = [];
  const picked: Array<{ who: Who; item: string; count: number }> = [];

  const dig1 = new DigSystemImpl(world as never, () => players[1], a1, lock, inv1, () => EYE, createDigConfig(), createRng(1), null, {
    farm,
    pet,
    w2: W2_SETTING_DEFAULTS,
    water: createWatering({ farm, inventory: inv1, settings, tick: () => state.tick }),
    bucket: createBucket({ inventory: inv1, emit: (e) => farm.emit(e), tick: () => state.tick, world }),
    vitals: vit(1),
    emitFarm: (e) => farm.emit(e),
    nowTick: () => state.tick,
    eggHeal: () => live.animalEggHeal,
    meatHeal: () => live.meatHeal,
    onPickup: (item, count) => void picked.push({ who: 1, item, count }),
    scatterItem: (_pos, item, count) => void scattered.push({ who: 1, item, count }),
  });
  let dig2: DigSystemImpl | null = null;
  let p2farm: P2Farm | null = null;
  if (o.p2 !== false) {
    p2farm = createP2Farm({ farm, pet, world, inventory: inv2, vitals: vit(2), settings, tick: () => state.tick, live: () => live, aimed: () => dig2?.target()?.block ?? null });
    dig2 = createP2Dig({
      world,
      p2,
      actions: a2,
      position: () => players[2],
      lock,
      eyeHeight: () => EYE,
      partner: () => players[1].position,
      config: createDigConfig(),
      rng: createRng(1),
      m4: {
        ...p2farm.m4,
        w2: W2_SETTING_DEFAULTS,
        nowTick: () => state.tick,
        onPickup: (item, count) => void picked.push({ who: 2, item, count }),
        scatterItem: (_pos, item, count) => void scattered.push({ who: 2, item, count }),
      },
    });
  }
  const digOf = (who: Who): DigSystemImpl => (who === 1 ? dig1 : dig2!);
  const actOf = (who: Who): ActionState => (who === 1 ? a1 : a2);
  const invOf = (who: Who): InventoryImpl => (who === 1 ? inv1 : inv2);

  const all: FarmEvent[] = [];
  const collect = (): void => void all.push(...farm.drainEvents());
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      dig1.update();
      dig2?.update();
      a1.endFrame();
      a2.endFrame();
      collect();
    }
  };
  /** 押して すぐ はなす（1 回の クリック）。そのあと 少し すすめる */
  const tap = (who: Who, btn: 'primary' | 'secondary' = 'secondary', after = 2): void => {
    const a = actOf(who);
    a.press(btn);
    digOf(who).update();
    a.release(btn);
    a.endFrame();
    collect();
    tick(after);
  };
  /** 2 人が 同じ ステップに 押す（1P の ほる係が 先に 更新される） */
  const tapBoth = (btn: 'primary' | 'secondary', after = 2): void => {
    a1.press(btn);
    a2.press(btn);
    dig1.update();
    dig2?.update();
    a1.release(btn);
    a2.release(btn);
    a1.endFrame();
    a2.endFrame();
    collect();
    tick(after);
  };
  /** 押しつづける n ステップ（はなして おわる） */
  const hold = (who: Who, btn: 'primary' | 'secondary', n: number): void => {
    const a = actOf(who);
    a.press(btn);
    for (let i = 0; i < n; i++) {
      digOf(who).update();
      a.endFrame();
      collect();
    }
    a.release(btn);
    a.endFrame();
    tick(1);
  };
  /** 目から 点を 見る */
  const lookAt = (who: Who, px: number, py: number, pz: number): void => {
    const p = players[who].position;
    const dx = px - p.x;
    const dy = py - (p.y + EYE);
    const dz = pz - p.z;
    players[who].yawDeg = (Math.atan2(dx, -dz) * 180) / Math.PI;
    players[who].pitchDeg = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
    tick(2);
  };
  /** その 列の 前に 立って ねらう（ねらいは とどく きょりに ある） */
  const aim = (who: Who, a: 'crop' | 'soil' | 'top' | 'water', row = rowOf(who)): void => {
    const z = rowZ(row);
    players[who].position.z = z + 0.5;
    if (a === 'crop') lookAt(who, C.x + 0.5, C.y + 0.5, z + 0.5);
    else if (a === 'soil') lookAt(who, S.x + 0.02, S.y + 0.5, z + 0.5);
    else if (a === 'water') lookAt(who, SIDE.x + 0.9, SIDE.y + 0.9, z + 0.5); // 水の 上の 面ごしに 水を ねらう
    else lookAt(who, S.x + 0.5, S.y + 0.9, z + 0.5);
  };
  /** (px, py, pz) を ねらう。その マスの 列の 前に 立つ */
  const aimCell = (who: Who, px: number, py: number, pz: number): void => {
    players[who].position.z = Math.floor(pz) + 0.5;
    lookAt(who, px, py, pz);
  };
  const sky = (who: Who): void => {
    players[who].yawDeg = 90;
    players[who].pitchDeg = 45;
    tick(2);
  };
  const plant = (row: number, kind: CropKind, stage: CropStage): void => {
    expect(farm.plant(S.x, S.y, rowZ(row), kind)).toBe(true);
    expect(farm.setStage(C.x, C.y, rowZ(row), stage)).toBe(true);
    farm.drainEvents();
  };
  const give = (who: Who, item: string, count = 1, extra: { water?: number } = {}): void => {
    const inv = invOf(who);
    inv.setSlot(0, { item: item as ItemId, count, ...extra });
    inv.select(0);
  };
  const events = (type?: FarmEvent['type']): FarmEvent[] => all.filter((e) => type === undefined || e.type === type);
  const clear = (): void => {
    collect();
    all.length = 0;
  };
  const crop = (row: number) => farm.crop(C.x, C.y, rowZ(row));
  const total = (who: Who): number => invOf(who).slots().reduce((n, s) => n + (s ? s.count : 0), 0);
  const grow = (n: number): void => {
    for (let i = 0; i < n; i++) {
      state.tick++;
      farm.update({ playerPos: { ...players[1].position }, ...(dig2 ? { p2Pos: { ...players[2].position } } : {}) });
      collect();
    }
  };
  /** ZR を 押しつづけて ひびが MAX に なる まで → 押し直して こわす */
  const breakBlock = (who: Who, max = 4000): boolean => {
    const a = actOf(who);
    const d = digOf(who);
    a.press('primary');
    let ready = false;
    for (let i = 0; i < max && !ready; i++) {
      d.update();
      a.endFrame();
      collect();
      ready = d.state().ready;
    }
    a.release('primary');
    a.endFrame();
    d.update();
    a.endFrame();
    a.press('primary');
    d.update();
    a.release('primary');
    a.endFrame();
    collect();
    tick(2);
    return ready;
  };
  tick(2);
  return { world, farm, pet, settings, state, p2, inv1, inv2, hp, players, dig1, get dig2() { return dig2!; }, get p2farm() { return p2farm!; }, scattered, picked, all, tick, tap, tapBoth, hold, lookAt, aim, aimCell, sky, plant, give, events, clear, crop, total, grow, breakBlock, invOf, digOf };
}
type Rig = ReturnType<typeof scene>;

const WHOS: readonly Who[] = [1, 2];
/** 2P の 出来事か（1P の 物には `by` が 書いて ない） */
const byOf = (e: FarmEvent): unknown => (e as { by?: unknown }).by;
const noBy = (e: FarmEvent): boolean => !('by' in e);
const only = <T extends FarmEvent>(r: Rig, type: T['type']): T => {
  const es = r.events(type);
  expect(es.length, `出来事 ${type} の 数`).toBe(1);
  return es[0] as T;
};
const inRange = (n: number, [lo, hi]: readonly [number, number]): boolean => n >= lo && n <= hi;

// ================================================================== AC115・AC116・AC117
describe('AC115: 2P の 収穫（みのった 作物を ZR で とる）', () => {
  for (const kind of CROP_KINDS)
    it(`${kind}: 作物は 消え はたけは のこる・やさいと たねは 2P の もちもの・1P は かわらない・出来事 harvest は by: 2 の 1 つ`, () => {
      const r = scene();
      r.plant(1, kind, 3);
      expect(r.crop(1)?.ripe).toBe(true);
      r.aim(2, 'crop');
      expect(r.dig2.target()?.block).toEqual({ x: C.x, y: C.y, z: rowZ(1) });
      const before1 = r.total(1);
      r.tap(2, 'primary');
      expect(r.crop(1), '作物が 消える').toBeNull();
      expect(r.world.getBlock(C.x, C.y, rowZ(1)), '上は くうき').toBe('air');
      expect(r.farm.soil(S.x, S.y, rowZ(1)), 'はたけは のこる').not.toBeNull();
      const h = only<Extract<FarmEvent, { type: 'harvest' }>>(r, 'harvest');
      expect(byOf(h)).toBe(2);
      expect(h.kind).toBe(kind);
      // 1P が とった ときと 同じ 数（設定の 表の 範囲）が 2P の もちものへ
      expect(inRange(h.veg, r.settings.farmYield[kind]), 'やさいの 数は 表の 範囲').toBe(true);
      expect(inRange(h.seeds, r.settings.farmSeedYield), 'たねの 数は 表の 範囲').toBe(true);
      expect(r.inv2.count(VEG_ITEM[kind])).toBe(h.veg);
      expect(r.inv2.count(SEED_ITEM[kind])).toBe(h.seeds);
      expect(r.total(1), '1P の もちものは かわらない').toBe(before1);
      expect(r.dig2.drainEvents().some((e) => e.type === 'break'), 'ほった ブロックとしての「こわれた」は 出ない').toBe(false);
      expect(r.p2.level, '2P の けいけんちは 出ない').toEqual({ level: 1, xp: 0 });
    });

  it('1P と 2P で 同じ 場面 → 同じ 形の 結果（数は 表の 範囲・出来事の 形は 同じ・`by` だけ ちがう）', () => {
    const r = scene();
    r.plant(0, 'tomato', 3);
    r.plant(1, 'tomato', 3);
    r.aim(1, 'crop');
    r.aim(2, 'crop');
    r.tap(1, 'primary');
    r.tap(2, 'primary');
    const hs = r.events('harvest') as Array<Extract<FarmEvent, { type: 'harvest' }>>;
    expect(hs.length).toBe(2);
    const strip = (e: Extract<FarmEvent, { type: 'harvest' }>) => ({ type: e.type, kind: e.kind, wet: e.wet, happy: e.happy ?? false, ranged: inRange(e.veg, r.settings.farmYield[e.kind]) && inRange(e.seeds, r.settings.farmSeedYield) });
    expect(strip(hs[1]!)).toEqual(strip(hs[0]!));
    expect(noBy(hs[0]!), '1P の 出来事に by は つかない').toBe(true);
    expect(byOf(hs[1]!)).toBe(2);
    expect(r.inv1.count(VEG_ITEM.tomato)).toBe(hs[0]!.veg);
  });

  it('2 人が 同じ ステップに 同じ 作物を とる → 1P が 先。とれた 人（1P）だけ もらう・2P は 何も 起きない（まだの 音の 出来事も 出ない）（§10）', () => {
    const r = scene();
    r.plant(0, 'pumpkin', 3);
    r.aim(1, 'crop', 0);
    r.aim(2, 'crop', 0);
    expect(r.dig2.target()?.block).toEqual({ x: C.x, y: C.y, z: rowZ(0) });
    r.clear();
    r.tapBoth('primary');
    const hs = r.events('harvest');
    expect(hs.length, '収穫は 1 つ').toBe(1);
    expect(noBy(hs[0]!), '1P が 先').toBe(true);
    expect(r.inv1.count(VEG_ITEM.pumpkin)).toBe((hs[0] as Extract<FarmEvent, { type: 'harvest' }>).veg);
    expect(r.total(2), '2P は もらわない').toBe(0);
    expect(r.events().filter((e) => byOf(e) === 2), '2P の 出来事は 出ない').toEqual([]);
    expect(r.p2farm.aim(), 'ねらいが 空に なる').toBeNull();
  });
});

describe('AC116: まだ の 作物・やせいの やさい・もちものが いっぱい', () => {
  it('まだの 作物は そのまま・notRipe は 押した 1 回に 1 つ（by: 2）・押しつづけても ふえない・もちものは かわらない', () => {
    const r = scene();
    r.plant(1, 'tomato', 1);
    r.aim(2, 'crop');
    r.clear();
    r.hold(2, 'primary', 600);
    expect(r.crop(1)?.stage, '作物は そのまま').toBe(1);
    const n = r.events('notRipe');
    expect(n.length, '押しつづけても 1 つ').toBe(1);
    expect(byOf(n[0]!)).toBe(2);
    expect(r.total(2)).toBe(0);
    expect(r.total(1)).toBe(0);
    // はなして もう 1 回 押すと もう 1 つ
    r.tap(2, 'primary');
    expect(r.events('notRipe').length).toBe(2);
  });

  it('やせいの やさい: とると たね（1P と 同じ 数）が 2P へ・出来事 wild は by: 2', () => {
    for (const kind of CROP_KINDS) {
      const r = scene();
      r.world.setBlock(C.x, C.y, rowZ(1), `wild_${kind}`);
      r.aim(2, 'crop');
      r.clear();
      r.tap(2, 'primary');
      const w = only<Extract<FarmEvent, { type: 'wild' }>>(r, 'wild');
      expect(byOf(w), kind).toBe(2);
      expect(inRange(w.seeds, r.settings.farmSeedYield), `${kind}: たねの 数は 表の 範囲`).toBe(true);
      expect(r.inv2.count(SEED_ITEM[kind]), kind).toBe(w.seeds);
      expect(r.total(1), kind).toBe(0);
    }
  });

  it('もちものが いっぱいの 2P が 収穫: 入りきらない 分は その 場に 落ちる（1P と 同じ。落とし物は 2P の 分として 数える）', () => {
    const r = scene();
    r.plant(1, 'onion', 3);
    for (let i = 0; i < r.inv2.slots().length; i++) r.inv2.setSlot(i, { item: 'stone' as ItemId, count: 1 });
    r.inv2.select(0);
    r.aim(2, 'crop');
    r.clear();
    r.tap(2, 'primary');
    const h = only<Extract<FarmEvent, { type: 'harvest' }>>(r, 'harvest');
    expect(r.inv2.count(VEG_ITEM.onion), '入らない').toBe(0);
    const drop = (item: string) => r.scattered.filter((s) => s.who === 2 && s.item === item).reduce((n, s) => n + s.count, 0);
    expect(drop(VEG_ITEM.onion)).toBe(h.veg);
    expect(drop(SEED_ITEM.onion)).toBe(h.seeds);
    expect(r.scattered.filter((s) => s.who === 1)).toEqual([]);
  });
});

describe('AC117: こわす（作物・はたけ・くさ）', () => {
  it('みのった 作物の 下の はたけを 2P が こわす → 作物の 中身が 2P の もちものへ・作物の 記録は 消える・出来事 harvest は by: 2', () => {
    const r = scene();
    r.plant(1, 'tomato', 3);
    r.aim(2, 'soil');
    expect(r.dig2.target()?.block).toEqual({ x: S.x, y: S.y, z: rowZ(1) });
    r.clear();
    expect(r.breakBlock(2), 'ひびが MAX に なった').toBe(true);
    expect(r.world.getBlock(S.x, S.y, rowZ(1)), 'はたけが なくなった').toBe('air');
    expect(r.crop(1), '作物の 記録は 消える').toBeNull();
    const h = only<Extract<FarmEvent, { type: 'harvest' }>>(r, 'harvest');
    expect(byOf(h)).toBe(2);
    expect(r.inv2.count(VEG_ITEM.tomato)).toBe(h.veg);
    expect(r.inv2.count(SEED_ITEM.tomato)).toBe(h.seeds);
    expect(r.total(1), '1P は かわらない').toBe(0);
  });

  it('みのる 前の 作物ごと はたけを こわす → たね 1 こ（2P の もちもの）', () => {
    const r = scene();
    r.plant(1, 'eggplant', 1);
    r.aim(2, 'soil');
    expect(r.breakBlock(2)).toBe(true);
    expect(r.crop(1)).toBeNull();
    expect(r.inv2.count(SEED_ITEM.eggplant)).toBe(1);
    expect(r.events('harvest')).toEqual([]);
    expect(r.total(1)).toBe(0);
  });

  it('くさの 上の やせいの やさいを 2P が こわす → 1P と 同じ 数の たね（wild は by: 2）', () => {
    const r = scene({ grassSeedChance: 0 });
    const z = rowZ(2);
    r.world.setBlock(G - 1, S.y, z, 'air'); // 手前に あな（ここ ごしに くさの 横を ねらう）
    r.world.setBlock(G, C.y, z, 'wild_pumpkin');
    r.aimCell(2, G + 0.02, S.y + 0.5, z + 0.5);
    r.clear();
    expect(r.dig2.target()?.block, 'くさを ねらう').toEqual({ x: G, y: S.y, z });
    expect(r.breakBlock(2)).toBe(true);
    const w = only<Extract<FarmEvent, { type: 'wild' }>>(r, 'wild');
    expect(byOf(w)).toBe(2);
    expect(r.inv2.count(SEED_ITEM.pumpkin)).toBe(w.seeds);
    expect(r.total(1)).toBe(0);
  });

  it('くさを こわして たね（くじ）が 出たら 2P の もちもの・出来事 seedFound は by: 2・1P は かわらない（くじは 畑の 乱数 1 つ）', () => {
    const r = scene({ grassSeedChance: 1 });
    const z = rowZ(2);
    r.aimCell(2, G + 0.5, S.y + 0.9, z + 0.5);
    r.clear();
    expect(r.dig2.target()?.block).toEqual({ x: G, y: S.y, z });
    expect(r.breakBlock(2)).toBe(true);
    const seeds = Object.values(SEED_ITEM).reduce((n, id) => n + r.inv2.count(id), 0);
    expect(seeds, 'くさの たね').toBe(1);
    const f = r.events('seedFound').filter((e) => (e as Extract<FarmEvent, { type: 'seedFound' }>).from === 'grass');
    expect(f.length).toBe(1);
    expect(byOf(f[0]!)).toBe(2);
    expect(Object.values(SEED_ITEM).reduce((n, id) => n + r.inv1.count(id), 0)).toBe(0);
  });
});

// ================================================================== AC118
describe('AC118: たがやす（人ごとに 数える）', () => {
  const grass = (z: number) => ({ x: G, y: S.y, z });

  it('くわ 1 回 → はたけ（till は by: 2）・くわの たいきゅうは その人の くわが 同じ だけ へる（1P でも 同じ）', () => {
    expect(W2_SETTING_DEFAULTS.toolWear.kuwa.till, 'たがやして へる 量は 表から').toBeGreaterThan(0);
    const wear: Record<Who, number> = { 1: 0, 2: 0 };
    for (const who of WHOS) {
      const r = scene();
      const z = rowZ(2);
      r.give(who, 'kuwa', 1);
      r.aimCell(who, G + 0.5, S.y + 0.9, z + 0.5);
      expect(r.digOf(who).target()?.block).toEqual(grass(z));
      r.clear();
      r.tap(who);
      expect(r.world.getBlock(G, S.y, z), `${who}P`).toBe('farmland');
      const t = only<Extract<FarmEvent, { type: 'till' }>>(r, 'till');
      expect(who === 2 ? byOf(t) === 2 : noBy(t), `${who}P の by`).toBe(true);
      wear[who] = r.invOf(who).slots()[0]?.wear ?? 0;
      expect(wear[who], `${who}P の くわが へった`).toBe(W2_SETTING_DEFAULTS.toolWear.kuwa.till);
      expect(r.invOf(who === 1 ? 2 : 1).slots()[0], 'もう 1 人の もちものは かわらない').toBeNull();
    }
    expect(wear[2], '2P の へりは 1P と 同じ').toBe(wear[1]);
  });

  it('すで: farmHandTillPresses 回で はたけ。1 〜 (回数-1) 回目は tillPress（count つき・by: 2）', () => {
    const r = scene();
    const z = rowZ(2);
    const need = r.settings.farmHandTillPresses;
    r.aimCell(2, G + 0.5, S.y + 0.9, z + 0.5);
    r.clear();
    for (let i = 1; i < need; i++) {
      r.tap(2);
      expect(r.world.getBlock(G, S.y, z), `${i} 回目では まだ`).toBe('grass');
    }
    r.tap(2);
    expect(r.world.getBlock(G, S.y, z), `${need} 回目で はたけ`).toBe('farmland');
    const presses = r.events('tillPress') as Array<Extract<FarmEvent, { type: 'tillPress' }>>;
    expect(presses.map((e) => e.count)).toEqual(Array.from({ length: need - 1 }, (_, i) => i + 1));
    expect(presses.every((e) => byOf(e) === 2)).toBe(true);
    expect(byOf(only(r, 'till'))).toBe(2);
  });

  it('1P と 2P が 同じ マスを 交互に 押しても 回数は 合わせない（人ごと）。先に 回数に とどいた 人の 押しで はたけに なる', () => {
    const r = scene();
    const z = rowZ(2);
    const need = r.settings.farmHandTillPresses;
    expect(need, 'この テストは 2 回 以上 いる').toBeGreaterThanOrEqual(2);
    r.aimCell(1, G + 0.5, S.y + 0.9, z + 0.5);
    r.aimCell(2, G + 0.5, S.y + 0.9, z + 0.5);
    expect(r.dig1.target()?.block).toEqual(grass(z));
    expect(r.dig2.target()?.block).toEqual(grass(z));
    r.clear();
    // 1P・2P・1P・2P …（どちらも need - 1 回まで）。合計は need を こえるが はたけに ならない
    for (let i = 1; i < need; i++) {
      r.tap(1);
      r.tap(2);
    }
    expect(r.world.getBlock(G, S.y, z), '人ごとに 数える ので まだ').toBe('grass');
    const presses = r.events('tillPress') as Array<Extract<FarmEvent, { type: 'tillPress' }>>;
    expect(presses.filter((e) => noBy(e)).map((e) => e.count)).toEqual(Array.from({ length: need - 1 }, (_, i) => i + 1));
    expect(presses.filter((e) => byOf(e) === 2).map((e) => e.count)).toEqual(Array.from({ length: need - 1 }, (_, i) => i + 1));
    // 2P が 先に とどく
    r.tap(2);
    expect(r.world.getBlock(G, S.y, z)).toBe('farmland');
    const t = only(r, 'till');
    expect(byOf(t)).toBe(2);
    expect(r.farm.soil(G, S.y, z)).not.toBeNull();
  });
});

// ================================================================== AC119
describe('AC119: たねまき・いしばい', () => {
  for (const kind of CROP_KINDS)
    it(`${kind} の たね: 空の はたけを 押す → 作物（段 0）・2P の たね 1 へる・1P は かわらない・plant は by: 2`, () => {
      const r = scene();
      r.give(2, SEED_ITEM[kind], 3);
      r.aim(2, 'top');
      r.clear();
      r.tap(2);
      expect(r.crop(1)).toMatchObject({ kind, stage: 0 });
      expect(r.inv2.count(SEED_ITEM[kind])).toBe(2);
      const p = only<Extract<FarmEvent, { type: 'plant' }>>(r, 'plant');
      expect(byOf(p)).toBe(2);
      expect(p.kind).toBe(kind);
      expect(r.total(1)).toBe(0);
    });

  it('たねを もって くさを 押す → 合図 till（by: 2）。畑の lastHint は 書かない（1P の 物の まま）', () => {
    const r = scene();
    r.give(2, SEED_ITEM.onion, 2);
    r.aimCell(2, G + 0.5, S.y + 0.9, rowZ(2) + 0.5);
    r.clear();
    r.tap(2);
    const h = only<Extract<FarmEvent, { type: 'hint' }>>(r, 'hint');
    expect(h.hint).toBe('till');
    expect(byOf(h)).toBe(2);
    expect(r.farm.lastHint(), '2P の 合図で 1P の lastHint は 書かない').toBeNull();
  });

  for (const stage of [0, 1, 2] as const)
    it(`いしばい: みのる 前（段 ${stage}）の 作物が 段 3 になり 2P の いしばいが 1 へる・ripened は by: 2・1P は かわらない`, () => {
      const r = scene();
      r.plant(1, 'tomato', stage);
      r.give(2, 'ishibai', 3);
      r.aim(2, 'crop');
      r.clear();
      r.tap(2);
      expect(r.crop(1)?.stage).toBe(3);
      expect(r.inv2.count('ishibai' as ItemId)).toBe(2);
      expect(byOf(only(r, 'ripened'))).toBe(2);
      expect(r.total(1)).toBe(0);
    });
});

// ================================================================== AC120
describe('AC120: じょうろ（2P の じょうろ）', () => {
  const CAN = 'watering_can' as const;

  it('水を くむ → 2P の じょうろが 表の 量（farmCanCapacity）に なる・fill は by: 2・1P の じょうろは かわらない', () => {
    const r = scene({ wet: true });
    r.give(1, CAN, 1);
    r.give(2, CAN, 1);
    r.aim(2, 'water');
    r.clear();
    r.tap(2);
    expect(r.inv2.slots()[0]?.water).toBe(r.settings.farmCanCapacity[CAN]);
    expect(r.inv1.slots()[0]?.water ?? 0, '1P の じょうろは からっぽの まま').toBe(0);
    const f = only<Extract<FarmEvent, { type: 'fill' }>>(r, 'fill');
    expect(byOf(f)).toBe(2);
    expect(f.water).toBe(r.settings.farmCanCapacity[CAN]);
  });

  it('1P と 2P が それぞれ くんで それぞれ まく → 水の へりかたが 同じ・はたけは それぞれ ぬれる・出来事の `by` は 人ごと', () => {
    const r = scene();
    const cap = r.settings.farmCanCapacity[CAN];
    r.give(1, CAN, 1, { water: cap });
    r.give(2, CAN, 1, { water: cap });
    for (const who of WHOS) {
      expect(r.farm.soil(S.x, S.y, rowZ(rowOf(who)))?.wet, `${who}P の はたけは はじめ かわいている`).toBe(false);
      r.aim(who, 'top');
    }
    r.clear();
    r.tap(1);
    r.tap(2);
    for (const who of WHOS) {
      expect(r.farm.soil(S.x, S.y, rowZ(rowOf(who)))?.wet, `${who}P が まいた はたけ`).toBe(true);
      expect(r.invOf(who).slots()[0]?.water, `${who}P の 水は 1 へる`).toBe(cap - 1);
    }
    const pours = r.events('pour');
    expect(pours.length).toBe(2);
    expect(pours.filter((e) => byOf(e) === 2).length).toBe(1);
    expect(pours.filter(noBy).length).toBe(1);
  });

  it('押しつづけると farmPourRepeatTicks ごとに まく（1 回ごとに 水 1 へる）。1P も 2P も 同じ 回数', () => {
    const cap = createM7Settings().farmCanCapacity[CAN];
    const used: Record<Who, number> = { 1: 0, 2: 0 };
    for (const who of WHOS) {
      const r = scene();
      r.give(who, CAN, 1, { water: cap });
      r.aim(who, 'top');
      r.clear();
      r.hold(who, 'secondary', r.settings.farmPourRepeatTicks * 2 + 1);
      used[who] = cap - (r.invOf(who).slots()[0]?.water ?? 0);
      expect(used[who], `${who}P: 押しつづけで 2 回 以上`).toBeGreaterThanOrEqual(2);
      expect(r.events('pour').length, `${who}P: まいた 回数 = 水の へり`).toBe(used[who]);
    }
    expect(used[2]).toBe(used[1]);
  });

  it('からっぽで 押す → 合図 fill（by: 2）。1P の lastHint は 書かない', () => {
    const r = scene();
    r.give(2, CAN, 1);
    r.aim(2, 'top');
    r.clear();
    r.tap(2);
    const h = only<Extract<FarmEvent, { type: 'hint' }>>(r, 'hint');
    expect(h.hint).toBe('fill');
    expect(byOf(h)).toBe(2);
    expect(r.farm.lastHint()).toBeNull();
    // 1P が 同じ ことを すると 1P の 合図（by なし）で lastHint が 書かれる
    r.give(1, CAN, 1);
    r.aim(1, 'top');
    r.clear();
    r.tap(1);
    const h1 = only<Extract<FarmEvent, { type: 'hint' }>>(r, 'hint');
    expect(noBy(h1)).toBe(true);
    expect(r.farm.lastHint()).toBe('fill');
  });

  it('しぶきの マス: 2P の まいた マスは 2P の `lastPourCells()`、畑の `lastPourCells()` は 1P の 物の まま（同じ ステップに 2 人 → 2 人分）', () => {
    for (const order of [[1, 2], [2, 1]] as const) {
      const r = scene();
      const cap = r.settings.farmCanCapacity[CAN];
      r.give(1, CAN, 1, { water: cap });
      r.give(2, CAN, 1, { water: cap });
      r.aim(1, 'top');
      r.aim(2, 'top');
      for (const who of order) r.tap(who, 'secondary', 0);
      const cell = (who: Who) => ({ x: S.x, y: S.y, z: rowZ(rowOf(who)) });
      expect(r.farm.lastPourCells(), `${order.join('→')}: 畑の 物は 1P の まいた マス`).toEqual([cell(1)]);
      expect(r.p2farm.lastPourCells(), `${order.join('→')}: 2P の 物は 2P の まいた マス`).toEqual([cell(2)]);
      expect(r.farm.lastPourCells(2), `${order.join('→')}: 畑の lastPourCells(2) も 同じ`).toEqual([cell(2)]);
    }
  });
});

// ================================================================== AC121
describe('AC121: バケツ（2P の バケツが かわる）', () => {
  const LIQUIDS: ReadonlyArray<{ name: string; block: string }> = [
    { name: '水', block: 'water' },
    { name: 'わきどころ', block: 'wakimizu' },
    { name: 'マグマ', block: magmaId(8) },
  ];

  for (const L of LIQUIDS)
    it(`から の バケツで ${L.name} を くむ → 1P と 同じ バケツに かわる（2P の バケツ。bucketFill は by: 2）`, () => {
      const r = scene();
      for (const who of WHOS) {
        r.world.setBlock(SIDE.x, SIDE.y, rowZ(rowOf(who)), L.block as never);
        r.give(who, 'bucket', 1);
        r.aim(who, 'water');
      }
      r.clear();
      r.tap(1);
      r.tap(2);
      const held = (who: Who) => r.invOf(who).slots()[0];
      expect(held(1)?.item, '1P の バケツは かわる').not.toBe('bucket');
      expect(held(2)?.item, '2P も 同じ バケツ').toBe(held(1)?.item);
      expect(held(2)?.water).toBe(held(1)?.water);
      expect(r.world.getBlock(SIDE.x, SIDE.y, rowZ(1)), '世界の 液体も 同じ へりかた').toBe(r.world.getBlock(SIDE.x, SIDE.y, rowZ(0)));
      const fills = r.events('bucketFill');
      expect(fills.length).toBe(2);
      expect(fills.filter((e) => byOf(e) === 2).length).toBe(1);
      expect(fills.filter(noBy).length).toBe(1);
    });

  it('みずの バケツを おく → から に もどる・水が 世界に できる（bucketPlace は by: 2）。1P と 同じ', () => {
    const r = scene({ wet: true });
    for (const who of WHOS) {
      r.give(who, 'bucket', 1);
      r.aim(who, 'water');
    }
    r.tap(1);
    r.tap(2);
    expect(r.invOf(2).slots()[0]?.item).not.toBe('bucket');
    for (const who of WHOS) r.aim(who, 'top');
    r.clear();
    r.tap(1);
    r.tap(2);
    expect(r.invOf(1).slots()[0]?.item).toBe('bucket');
    expect(r.invOf(2).slots()[0]?.item).toBe('bucket');
    expect(r.world.getBlock(C.x, C.y, rowZ(1)), '2P が おいた').toBe(r.world.getBlock(C.x, C.y, rowZ(0)));
    expect(r.world.getBlock(C.x, C.y, rowZ(1))).not.toBe('air');
    const places = r.events('bucketPlace');
    expect(places.length).toBe(2);
    expect(places.filter((e) => byOf(e) === 2).length).toBe(1);
  });

  it('おけない（作物の 上など）→ コン（bucketNo は by: 2）・バケツは そのまま', () => {
    const r = scene({ wet: true });
    r.plant(1, 'onion', 0);
    r.give(2, 'water_bucket', 1, { water: 8 });
    r.aim(2, 'crop');
    r.clear();
    r.tap(2);
    const no = only(r, 'bucketNo');
    expect(byOf(no)).toBe(2);
    expect(r.invOf(2).slots()[0]?.item).toBe('water_bucket');
  });

  it('から の バケツを 水の ない 所で 押す → 合図 bucket（by: 2）・1P の lastHint は 書かない', () => {
    const r = scene();
    r.give(2, 'bucket', 1);
    r.aim(2, 'top');
    r.clear();
    r.tap(2);
    const h = only<Extract<FarmEvent, { type: 'hint' }>>(r, 'hint');
    expect(h.hint).toBe('bucket');
    expect(byOf(h)).toBe(2);
    expect(r.farm.lastHint()).toBeNull();
  });
});

// ================================================================== AC122
describe('AC122: なでる（ごきげんは 作物で 1 つ）', () => {
  it('2P が なでる → 1P と 同じ 結果 happy（pet は by: 2）。つづけて 1P が なでると again（ごきげんの あいだ）。逆も 同じ', () => {
    for (const [first, second] of [[2, 1], [1, 2]] as const) {
      const r = scene();
      r.plant(1, 'tomato', 1);
      r.aim(first, 'crop', 1);
      r.aim(second, 'crop', 1);
      r.clear();
      r.tap(first);
      const a = only<Extract<FarmEvent, { type: 'pet' }>>(r, 'pet');
      expect(a.result, `${first}P が 先`).toBe('happy');
      expect(first === 2 ? byOf(a) === 2 : noBy(a)).toBe(true);
      expect(r.crop(1)?.happy).toBe(true);
      r.clear();
      r.tap(second);
      const b = only<Extract<FarmEvent, { type: 'pet' }>>(r, 'pet');
      expect(b.result, `${second}P が あとから`).toBe('again');
      expect(second === 2 ? byOf(b) === 2 : noBy(b)).toBe(true);
    }
  });

  it('やせいの やさいを 2P が なでる → wild（1P と 同じ）', () => {
    const r = scene();
    r.world.setBlock(C.x, C.y, rowZ(1), 'wild_onion');
    r.aim(2, 'crop');
    r.clear();
    r.tap(2);
    const e = only<Extract<FarmEvent, { type: 'pet' }>>(r, 'pet');
    expect(e.result).toBe('wild');
    expect(byOf(e)).toBe(2);
  });
});

// ================================================================== AC123
describe('AC123: 食べる（食べた 人の ハート）', () => {
  const FOODS: ReadonlyArray<{ name: string; item: ItemId; heal: (r: Rig) => number }> = [
    ...CROP_KINDS.map((k) => ({ name: k, item: VEG_ITEM[k], heal: (r: Rig) => r.settings.eatHeal[k] })),
    { name: 'たまご', item: 'egg' as ItemId, heal: () => live.animalEggHeal },
    { name: 'やいた もも にく', item: 'momo_yaki' as ItemId, heal: () => live.meatHeal },
    { name: 'かびた パン', item: 'kabita_pan' as ItemId, heal: () => itemDef('kabita_pan')?.food?.heal ?? -1 },
  ];

  for (const f of FOODS)
    it(`${f.name}: 2P の ハートが へっている → 表の 数 もどる（1P と 同じ）・2P の 物が 1 へる・1P の ハートは かわらない・eat は by: 2`, () => {
      const r = scene();
      const want = f.heal(r);
      expect(want, 'もどる 数は 表から').toBeGreaterThan(0);
      // 同じ 食べ物を 1P も 食べて 同じ 数 もどる ことを 見る（式の コピーが あれば ずれる）
      r.hp[1].now = 10;
      r.give(1, f.item, 3);
      r.sky(1);
      r.tap(1);
      const gained1 = r.hp[1].now - 10;
      r.hp[2].now = 10;
      r.give(2, f.item, 3);
      r.sky(2);
      r.clear();
      r.tap(2);
      expect(r.hp[2].now - 10, '2P の ハート').toBe(gained1);
      expect(gained1).toBe(want);
      expect(r.inv2.count(f.item), '2P の 物が 1 へる').toBe(2);
      expect(r.hp[1].now - 10, '1P の ハートは 1P の 分だけ').toBe(gained1);
      const e = only<Extract<FarmEvent, { type: 'eat' }>>(r, 'eat');
      expect(byOf(e)).toBe(2);
      expect(e.item).toBe(f.item);
      expect(e.heal).toBe(want);
    });

  it('2P の ハートが いっぱい → 食べず 合図 full（by: 2）。1P の ハート・1P の lastHint は かわらない', () => {
    const r = scene();
    r.hp[2].now = r.hp[2].max;
    r.hp[1].now = 10;
    r.give(2, VEG_ITEM.tomato, 3);
    r.sky(2);
    r.clear();
    r.tap(2);
    expect(r.inv2.count(VEG_ITEM.tomato), '食べない').toBe(3);
    expect(r.events('eat')).toEqual([]);
    const h = only<Extract<FarmEvent, { type: 'hint' }>>(r, 'hint');
    expect(h.hint).toBe('full');
    expect(byOf(h)).toBe(2);
    expect(r.hp[1].now).toBe(10);
    expect(r.farm.lastHint(), '1P の チップは 出ない').toBeNull();
  });
});

// ================================================================== AC129（出来事の 人に よらず 同じ 実績）
describe('AC129: 実績は 共有（2P の 畑の 出来事も 1P と 同じ 記録に 数える）・けいけんちは 出ない', () => {
  /** step.ts と 同じ 道: 毎ステップ `farmFx.feed(farm.drainEvents())` → 実績 */
  function playAs(who: Who): { stats: Record<string, number>; xp: { level: number; xp: number }; picked: Rig['picked'] } {
    const r = scene();
    const ach = new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
    const fx = new FarmFx({ sound: { playTones: () => undefined }, achievements: ach });
    const feed = (): void => {
      fx.feed(r.all.splice(0, r.all.length));
    };
    const row = rowOf(who);
    // 1. たねを まく
    r.give(who, SEED_ITEM.tomato, 2);
    r.aim(who, 'top');
    r.tap(who);
    // 2. なでる
    r.aim(who, 'crop');
    r.give(who, 'tomato', 1);
    r.tap(who);
    // 3. いしばい
    r.give(who, 'ishibai', 1);
    r.tap(who);
    feed();
    // 4. 収穫（みのった）
    r.invOf(who).setSlot(0, null);
    r.tap(who, 'primary');
    r.tick(60); // ほる あいだの 間かく
    // 5. やせいの やさい
    r.world.setBlock(C.x, C.y, rowZ(row), 'wild_onion');
    r.aim(who, 'crop');
    r.tap(who, 'primary');
    // 6. 食べる
    r.hp[who].now = 10;
    r.give(who, VEG_ITEM.pumpkin, 1);
    r.sky(who);
    r.tap(who);
    // 7. 水を まく
    r.give(who, 'watering_can', 1, { water: r.settings.farmCanCapacity.watering_can });
    r.aim(who, 'top');
    r.tap(who);
    feed();
    return { stats: ach.stats(), xp: who === 2 ? r.p2.level : { level: 1, xp: 0 }, picked: r.picked };
  }

  it('同じ 一連の 作業を 1P が した ときと 2P が した ときで 実績の 記録が 同じ（数が 同じ だけ ふえる）', () => {
    const one = playAs(1);
    const two = playAs(2);
    const keys = Object.keys(one.stats).sort();
    expect(keys.length, '何か 数えられている').toBeGreaterThan(0);
    for (const k of ['plant:*', 'harvest:*', 'wild:*', 'pet:*', 'ishibai', 'eat:*', 'water:*']) expect(one.stats[k] ?? 0, `${k}（1P）`).toBeGreaterThan(0);
    expect(Object.keys(two.stats).sort()).toEqual(keys);
    expect(two.stats).toEqual(one.stats);
    expect(two.xp, '2P の けいけんちは 出ない').toEqual({ level: 1, xp: 0 });
  });

  it('とった やさいで 2P の onPickup（「はじめて てにいれた」の もと）が 呼ばれる。1P と 同じ 品・同じ 数で、1P の onPickup は 呼ばれない', () => {
    const one = playAs(1);
    const two = playAs(2);
    expect(one.picked.length, '1P の onPickup').toBeGreaterThan(0);
    expect(one.picked.some((p) => p.item === VEG_ITEM.tomato), 'とった やさい').toBe(true);
    expect(one.picked.every((p) => p.who === 1)).toBe(true);
    expect(two.picked.every((p) => p.who === 2), '呼ばれるのは 2P の onPickup だけ').toBe(true);
    expect(two.picked.map(({ item, count }) => ({ item, count }))).toEqual(one.picked.map(({ item, count }) => ({ item, count })));
  });
});

// ================================================================== AC130・AC146（1 人の ときは かわらない）
describe('AC130: 1 人の ときは かわらない（出来事に by は つかない・畑の 乱数の 順は かわらない）', () => {
  /** 1P だけで 畑を ひととおり。2P の 部品が あっても 1P の 出来事は 今と 同じ */
  function session1P(o: { p2: boolean }) {
    const r = scene({ p2: o.p2, wet: true });
    r.plant(0, 'tomato', 3);
    r.plant(2, 'onion', 1);
    r.aim(1, 'crop');
    r.tap(1, 'primary'); // 収穫
    r.aim(1, 'crop', 2);
    r.give(1, 'ishibai', 2);
    r.tap(1); // いしばい
    r.aim(1, 'crop', 2);
    r.tap(1, 'primary'); // 収穫
    r.give(1, SEED_ITEM.pumpkin, 2);
    r.aim(1, 'top', 0);
    r.tap(1); // たねまき
    r.give(1, 'watering_can', 1);
    r.aim(1, 'water', 0);
    r.tap(1); // くむ
    r.aim(1, 'top', 0);
    r.tap(1); // まく
    r.give(1, 'bucket', 1);
    r.aim(1, 'water', 0);
    r.tap(1); // バケツ
    r.hp[1].now = 10;
    r.give(1, VEG_ITEM.onion, 2);
    r.sky(1);
    r.tap(1); // 食べる
    r.hp[1].now = r.hp[1].max;
    r.tap(1); // いっぱい
    r.grow(5);
    return r;
  }

  it('1P の 出来事に `by` は 1 つも つかない（2P の 部品が あっても）', () => {
    const r = session1P({ p2: true });
    expect(r.all.length).toBeGreaterThan(5);
    expect(r.all.filter((e) => !noBy(e)), 'by の ついた 出来事').toEqual([]);
  });

  it('2P が 何も しない 間は、2P の 部品が ある 場合と ない 場合で 出来事・もちもの・畑の 乱数が まったく 同じ', () => {
    const a = session1P({ p2: false });
    const b = session1P({ p2: true });
    expect(b.all).toEqual(a.all);
    expect(b.inv1.serialize()).toEqual(a.inv1.serialize());
    expect((b.farm.serialize() as { rng: unknown }).rng, '乱数の 順').toEqual((a.farm.serialize() as { rng: unknown }).rng);
    expect(b.farm.lastHint()).toBe(a.farm.lastHint());
    expect(b.farm.lastPourCells()).toEqual(a.farm.lastPourCells());
  });

  it('2P の 部品を 作る だけでは 畑の 乱数を 進めない・出来事を 出さない', () => {
    const lone = scene({ p2: false });
    const rng0 = JSON.stringify((lone.farm.serialize() as { rng: unknown }).rng);
    const both = scene({ p2: true });
    expect(JSON.stringify((both.farm.serialize() as { rng: unknown }).rng)).toBe(rng0);
    expect(both.all).toEqual([]);
    expect(both.p2farm.aim(), 'ねらって いない').toBeNull();
    expect(both.p2farm.lastPourCells()).toEqual([]);
  });
});

// ================================================================== AC126 の 中身（しるしの 中身）
describe('AC126: 2P の 作物の しるしの 中身は 1P が 同じ マスを ねらった ときと 同じ', () => {
  it('作物・はたけ・ねらい なし', () => {
    const r = scene({ wet: true });
    r.plant(0, 'tomato', 2);
    r.plant(1, 'tomato', 2);
    r.aim(1, 'crop', 0);
    r.aim(2, 'crop', 1);
    const aimedAt = (who: Who) => r.digOf(who).target()!.block;
    const a1 = r.farm.aim(aimedAt(1).x, aimedAt(1).y, aimedAt(1).z);
    expect(a1, '1P の しるし').not.toBeNull();
    expect(r.p2farm.aim()).toEqual(a1);
    // はたけ だけ（作物が ない 列 = 3 つ目の 列）
    r.aim(1, 'top', 2);
    r.aim(2, 'top', 2);
    const s1 = r.farm.aim(aimedAt(1).x, aimedAt(1).y, aimedAt(1).z);
    expect(s1?.dots).toBe(0);
    expect(r.p2farm.aim()).toEqual(s1);
    // ねらいを 外す（そら）→ null
    r.sky(2);
    expect(r.p2farm.aim()).toBeNull();
  });

  it('畑でない マス（石・くうき）→ null', () => {
    const r = scene();
    r.world.setBlock(G, S.y + 1, rowZ(2), 'stone');
    r.aimCell(2, G + 0.02, S.y + 1.5, rowZ(2) + 0.5);
    expect(r.dig2.target()?.id).toBe('stone');
    expect(r.p2farm.aim()).toBeNull();
  });
});

// ================================================================== AC145（保存）
describe('AC145: 保存（2P の じょうろの 水・バケツ・とった やさいは 今の `p2` に 入り 読みなおしで もどる）', () => {
  it('p2 の キーは ふえない（新しい キーは 足さない）・水つきの じょうろ・水の バケツ・やさいが もどる', () => {
    const r = scene();
    const cap = r.settings.farmCanCapacity.watering_can;
    r.inv2.setSlot(0, { item: 'watering_can' as ItemId, count: 1, water: cap - 2 });
    r.inv2.setSlot(1, { item: 'water_bucket' as ItemId, count: 1, water: 8 });
    r.inv2.setSlot(2, { item: VEG_ITEM.pumpkin, count: 3 });
    const saved = JSON.parse(JSON.stringify(r.p2.serialize()));
    expect(Object.keys(saved).sort(), '5a では 新しい キーを 足さない').toEqual(['armor', 'inventory', 'level']);
    const back = new P2State();
    back.deserialize(saved);
    expect(back.inventory.slots()[0]).toMatchObject({ item: 'watering_can', water: cap - 2 });
    expect(back.inventory.slots()[1]).toMatchObject({ item: 'water_bucket', water: 8 });
    expect(back.inventory.count(VEG_ITEM.pumpkin)).toBe(3);
  });

  it('2P が まいた あとの 水は 2P の もちものに のこる（やめても 保存される）', () => {
    const r = scene();
    const cap = r.settings.farmCanCapacity.watering_can;
    r.give(2, 'watering_can', 1, { water: cap });
    r.aim(2, 'top');
    r.tap(2);
    const left = r.inv2.slots()[0]?.water;
    expect(left).toBe(cap - 1);
    const back = new P2State();
    back.deserialize(JSON.parse(JSON.stringify(r.p2.serialize())));
    expect(back.inventory.slots()[0]?.water).toBe(left);
  });
});

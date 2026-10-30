import { describe, expect, it } from 'vitest';
import { AchievementSystem } from '../achievements/AchievementSystem';
import { ACHIEVEMENT_DEFS } from '../achievements/defs';
import { CROP_KINDS, M6_SETTING_DEFAULTS, createM7Settings, type CropKind, type CropStage, type ItemId, type LockStatus, type PlayerState } from '../contracts';
import { createFarmSystem, type FarmSystemImpl } from '../farm/FarmSystem';
import { Pet } from '../farm/pet';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { actionHintLines } from '../ui/actionHintModel';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createRng } from '../world/gen/random';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/**
 * MINE-1B（docs/design/MINE-1.md §4.4「いしばい」・§5「例外の とき」・受け入れ基準 B14）: いしばいを まくと 作物が すぐ みのる。
 *
 *   いしばいを 持って、みのる 前の 作物〔段 0〜2〕か その 下の はたけを ねらって 右クリック → その 作物が すぐ 段 3〔みのった〕。いしばい 1 へる。
 *   ぬれた はたけでも かわいた はたけでも 同じ。
 *   みのった 作物・野生の やさい・作物の ない はたけ・ほかの ブロック〔いし など〕には 何も しない〔へらない〕。
 *   ねらうと ヒント「まく」〔みのった 作物・野生の やさいでは 出さない〕。
 *   実績「いしばい で はじめて やさい が みのった！」は 1 回〔自然に みのった とき・何も 起きなかった ときは 出ない〕。
 *   みのった 作物は ふつうに しゅうかく できる。
 *
 * 【つなぎ】 本番と 同じ 部品を つなぐ。developer の 形に あわせて 直す 所は 作らなかった〔どの 出来事・どの 口を 使っても 通る〕。
 *   ・農業は 本物の `createFarmSystem`〔ごきげんの `Pet` も 本物〕を そのまま `DigSystemImpl` の `farm`・`pet` の 口に わたす
 *     〔いしばいで みのらせる 口は FarmSystem に 足して よい。口の 名前は 決めない〕。
 *   ・実績は step.ts と 同じに「`achievements.feedDig(dig.drainEvents())` と `achievements.feedFarm(farm.drainEvents())`」の 2 本を 毎ステップ わたす
 *     〔いしばいの 出来事を DigEvent に 乗せても FarmEvent に 乗せても 通る〕。
 *   ・みのった 絵は 世界の `touch(x,y,z)`〔そのマスの 見た目だけ 作り直す〕で 知らせる〔今の 作物の 段の 変わり方と 同じ〕。
 */

const ISHIBAI = 'ishibai' as ItemId;
const EYE = 1.62;
/** 1 にち の ステップ数〔farm.test.ts と 同じ〕 */
const DAY = 91800;
const ACH_NAME = 'いしばい で はじめて やさい が みのった！';

/** はたけ の マス〔草の 高さ〕・作物 の マス〔その 1 つ 上〕・はたけの 西 となり〔ぬれた＝水／かわいた＝あな。ここ 越しに はたけの 横を ねらえる〕 */
const S = { x: 12, y: 7, z: 8 } as const;
const C = { x: 12, y: 8, z: 8 } as const;
const SIDE = { x: 11, y: 7, z: 8 } as const;

type Ground = 'farmland' | 'grass' | 'stone';
type CropSpec = { kind: CropKind; stage: CropStage } | { kind: CropKind; wild: true } | null;
interface SceneOpts {
  /** はたけの 西となりが 水〔ぬれた〕か あな〔かわいた〕か */
  wet: boolean;
  ground: Ground;
  crop: CropSpec;
  held?: ItemId | null;
  count?: number;
  /** 同じ 畑を z 方向に 2 マスずつ ならべた 列の 数〔1 なら C だけ〕 */
  rows?: number;
}

interface Rig {
  dig: DigSystemImpl;
  world: ArrayVoxelWorld;
  farm: FarmSystemImpl;
  inv: InventoryImpl;
  actions: ActionState;
  player: PlayerState;
  ach: AchievementSystem;
  /** いしばいの 実績が 出た 回数 */
  unlockedCount(): number;
  /** 世界の `touch(x,y,z)`〔そのマスの 見た目を 作り直させる〕が 呼ばれた マス */
  touched: string[];
  tick(n?: number): void;
  tap(btn?: 'primary' | 'secondary'): void;
  hold(n: number): void;
  /** 農業を 1 ステップずつ すすめる〔自然に そだつ〕 */
  grow(n: number): void;
}

const rowZ = (i: number): number => S.z + 2 * i;

function scene(o: SceneOpts): Rig {
  const rows = o.rows ?? 1;
  const world = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
  world.fill(0, 0, 0, 31, S.y - 1, 31, 'dirt');
  world.fill(0, S.y, 0, 31, S.y, 31, 'grass');
  const settings = createM7Settings();
  const state = { tick: 0 };
  const pet = new Pet({ settings, dayLength: () => DAY });
  const farm = createFarmSystem({
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
    world.setBlock(SIDE.x, SIDE.y, z, o.wet ? 'water' : 'air');
    if (o.ground === 'stone') world.setBlock(S.x, S.y, z, 'stone');
    if (o.ground === 'farmland') expect(farm.till(S.x, S.y, z), `たがやす ${i}`).toBe(true);
    const c = o.crop;
    if (c && 'wild' in c) world.setBlock(C.x, C.y, z, `wild_${c.kind}`);
    else if (c) {
      expect(farm.plant(S.x, S.y, z, c.kind), `まく ${i}`).toBe(true);
      expect(farm.setStage(C.x, C.y, z, c.stage), `だん ${i}`).toBe(true);
    }
  }
  settings.farmGrowDays.wet.tomato = 0.001;
  farm.drainEvents();

  const player: PlayerState = {
    position: { x: S.x - 3.5, y: S.y + 1, z: 8.5 + (rows - 1) },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false,
    facingDeg: 0,
    running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  const held = o.held === undefined ? ISHIBAI : o.held;
  if (held) inv.setSlot(0, { item: held, count: o.count ?? 5 });
  inv.select(0);

  const ach = new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
  const id = ACHIEVEMENT_DEFS.find((d) => d.name === ACH_NAME)?.id;
  let unlocked = 0;
  ach.onUnlock((d) => {
    if (d.id === id) unlocked++;
  });

  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => EYE, createDigConfig(), createRng(1), null, {
    farm,
    pet,
    emitFarm: (e) => farm.emit(e),
    nowTick: () => state.tick,
  });
  /** step.ts と 同じに 出来事を 2 本とも 実績へ わたす */
  const feed = (): void => {
    ach.feedDig(dig.drainEvents());
    ach.feedFarm(farm.drainEvents());
  };
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      dig.update();
      actions.endFrame();
      feed();
    }
  };
  const tap = (btn: 'primary' | 'secondary' = 'secondary'): void => {
    actions.press(btn);
    dig.update();
    actions.release(btn);
    actions.endFrame();
    feed();
  };
  const hold = (n: number): void => {
    actions.press('secondary');
    tick(n);
    actions.release('secondary');
    actions.endFrame();
  };
  const grow = (n: number): void => {
    for (let i = 0; i < n; i++) {
      state.tick++;
      farm.update({ playerPos: { x: player.position.x, y: player.position.y, z: player.position.z } });
      feed();
    }
  };
  const touched: string[] = [];
  const touch0 = world.touch.bind(world);
  world.touch = (x: number, y: number, z: number): void => {
    touched.push(`${x},${y},${z}`);
    touch0(x, y, z);
  };
  const r: Rig = { dig, world, farm, inv, actions, player, ach, unlockedCount: () => unlocked, touched, tick, tap, hold, grow };
  tick(2);
  touched.length = 0;
  return r;
}

/** 目から 点を 見る */
function look(r: Rig, px: number, py: number, pz: number): void {
  const p = r.player.position;
  const dx = px - p.x;
  const dy = py - (p.y + EYE);
  const dz = pz - p.z;
  r.player.yawDeg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  r.player.pitchDeg = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  r.tick(2);
}

type Aim = 'crop' | 'soil' | 'top';
/** 列 i の 作物〔crop〕・はたけの 横の 面〔soil。西となりの 水／あな ごし〕・はたけの 上の 面〔top。作物が ない とき〕を ねらう */
function aim(r: Rig, a: Aim, i = 0): void {
  const z = rowZ(i);
  if (a === 'crop') look(r, C.x + 0.5, C.y + 0.5, z + 0.5);
  else if (a === 'soil') look(r, S.x + 0.02, S.y + 0.5, z + 0.5);
  else look(r, S.x + 0.5, S.y + 0.9, z + 0.5);
}

const cropAt = (r: Rig, i = 0) => {
  const c = r.farm.crop(C.x, C.y, rowZ(i));
  return c ? { kind: c.kind, stage: c.stage, ripe: c.ripe } : null;
};
const bag = (r: Rig): number => r.inv.count(ISHIBAI);
const cells = (r: Rig): string => {
  const out: string[] = [];
  for (let y = S.y - 2; y <= C.y + 2; y++) for (let z = 4; z <= 13; z++) for (let x = 9; x <= 15; x++) out.push(r.world.getBlock(x, y, z));
  return out.join(',');
};
const total = (r: Rig): number => r.inv.slots().reduce((n, s) => n + (s ? s.count : 0), 0);
const hintWord = (r: Rig): string | undefined =>
  actionHintLines(r.dig.previewRightClick(), r.dig.previewLeftClick(), { held: r.inv.held()?.item ?? null, heldIsPickaxe: false, heldIsBlade: false }).right?.word;

const WET_JA = (wet: boolean): string => (wet ? 'ぬれた' : 'かわいた');
const STAGES: readonly CropStage[] = [0, 1, 2];
const WETS: readonly boolean[] = [true, false];

// ------------------------------------------------------------------ みのる 前の 作物 → すぐ 段 3

describe('B14: いしばいを 持って 右クリック → みのる 前の 作物が すぐ 段 3・いしばい 1 へる', () => {
  for (const wet of WETS)
    for (const kind of CROP_KINDS)
      for (const stage of STAGES)
        for (const a of ['crop', 'soil'] as const) {
          it(`${WET_JA(wet)} はたけの ${kind}〔段 ${stage}〕を ${a === 'crop' ? '作物' : '下の はたけ'}ごしに ねらう`, () => {
            const r = scene({ wet, ground: 'farmland', crop: { kind, stage }, count: 3 });
            // もとの ようす〔この 部屋の 確かめ〕: はたけの しめり・作物の 段・ねらいが 当たる ブロック
            expect(r.farm.soil(S.x, S.y, S.z)?.wet, 'はたけの しめり').toBe(wet);
            expect(cropAt(r)).toEqual({ kind, stage, ripe: false });
            aim(r, a);
            const t = r.dig.target();
            expect(t?.block, 'ねらい').toEqual(a === 'crop' ? { x: C.x, y: C.y, z: C.z } : { x: S.x, y: S.y, z: S.z });
            expect(hintWord(r), 'ヒント').toBe('まく');

            r.tap();

            expect(cropAt(r), 'すぐ みのった').toEqual({ kind, stage: 3, ripe: true });
            expect(r.world.getBlock(C.x, C.y, C.z), '作物は そのまま〔絵は 段で かわる〕').toBe(`crop_${kind}`);
            expect(r.farm.soil(S.x, S.y, S.z), 'はたけは のこる').not.toBeNull();
            expect(bag(r), 'いしばい 1 へる').toBe(2);
            expect(r.farm.crop(C.x, C.y, C.z)?.happy, 'いしばいで なでては いない').toBeFalsy();
          });
        }

  it('いしばいが 1 こだけの とき: 使うと 持ち物から なくなり、作物は みのる', () => {
    const r = scene({ wet: true, ground: 'farmland', crop: { kind: 'tomato', stage: 0 }, count: 1 });
    aim(r, 'crop');
    r.tap();
    expect(cropAt(r)?.stage).toBe(3);
    expect(bag(r)).toBe(0);
    expect(r.inv.held()).toBeNull();
  });

  it('見た目: みのった ことを 絵に 知らせる〔そのマスの 見た目を 作り直す〕', () => {
    for (const wet of WETS) {
      const r = scene({ wet, ground: 'farmland', crop: { kind: 'pumpkin', stage: 1 } });
      aim(r, 'crop');
      r.touched.length = 0;
      r.tap();
      expect(cropAt(r)?.stage).toBe(3);
      expect(r.touched, `${WET_JA(wet)}: ${C.x},${C.y},${C.z} の 見た目`).toContain(`${C.x},${C.y},${C.z}`);
    }
  });

  it('押しっぱなしでも 1 つの 作物には 1 こだけ〔2 つ目からは みのった 作物なので へらない〕', () => {
    for (const a of ['crop', 'soil'] as const) {
      const r = scene({ wet: true, ground: 'farmland', crop: { kind: 'onion', stage: 0 }, count: 5 });
      aim(r, a);
      r.hold(120);
      expect(cropAt(r)?.stage, a).toBe(3);
      expect(bag(r), `${a}: へったのは 1 こ`).toBe(4);
    }
  });

  it('つづけて 3 つの 作物に まくと 3 こ へる〔1 つに つき 1 こ〕', () => {
    const r = scene({ wet: false, ground: 'farmland', crop: { kind: 'eggplant', stage: 1 }, count: 5, rows: 3 });
    for (let i = 0; i < 3; i++) {
      expect(cropAt(r, i)?.stage, `まく 前 ${i}`).toBe(1);
      aim(r, 'crop', i);
      r.tick(15);
      r.tap();
      expect(cropAt(r, i)?.stage, `まいた あと ${i}`).toBe(3);
      expect(bag(r), `いしばい ${i}`).toBe(5 - (i + 1));
    }
  });

  it('となりの 作物は みのらない〔ねらった 1 つだけ〕', () => {
    const r = scene({ wet: true, ground: 'farmland', crop: { kind: 'tomato', stage: 0 }, rows: 3 });
    aim(r, 'crop', 1);
    r.tap();
    expect(cropAt(r, 0)?.stage).toBe(0);
    expect(cropAt(r, 1)?.stage).toBe(3);
    expect(cropAt(r, 2)?.stage).toBe(0);
  });

  it('みのった 作物は ふつうに しゅうかく できる〔ひだりクリック。作物は きえて はたけは のこる。持ち物に ふえる〕', () => {
    for (const wet of WETS) {
      const r = scene({ wet, ground: 'farmland', crop: { kind: 'tomato', stage: 0 }, count: 3 });
      aim(r, 'crop');
      r.tap();
      const before = total(r);
      r.tick(15);
      r.tap('primary');
      expect(r.world.getBlock(C.x, C.y, C.z), `${WET_JA(wet)}: 作物は きえる`).toBe('air');
      expect(r.farm.soil(S.x, S.y, S.z), 'はたけは のこる').not.toBeNull();
      expect(total(r), `${WET_JA(wet)}: 持ち物に ふえる`).toBeGreaterThan(before);
    }
  });
});

// ------------------------------------------------------------------ 何も しない〔へらない〕

describe('B14: 何も しない〔いしばいは へらない・何も かわらない〕', () => {
  const unchanged = (r: Rig, label: string): void => {
    const count = bag(r);
    expect(count, `${label}: 持っている いしばい`).toBeGreaterThan(0);
    const world = cells(r);
    const crop = cropAt(r);
    const before = r.touched.length;
    r.tap();
    r.tick(5);
    expect(bag(r), `${label}: へらない`).toBe(count);
    expect(cells(r), `${label}: ブロックが かわらない`).toBe(world);
    expect(cropAt(r), `${label}: 作物の 段が かわらない`).toEqual(crop);
    expect(r.touched.length, `${label}: 見た目を 作り直さない`).toBe(before);
    expect(r.unlockedCount(), `${label}: 実績は 出ない`).toBe(0);
  };

  for (const wet of WETS)
    for (const kind of CROP_KINDS)
      for (const a of ['crop', 'soil'] as const) {
        it(`${WET_JA(wet)} はたけの みのった ${kind} を ${a === 'crop' ? '作物' : '下の はたけ'}ごしに ねらう`, () => {
          const r = scene({ wet, ground: 'farmland', crop: { kind, stage: 3 } });
          expect(cropAt(r)).toEqual({ kind, stage: 3, ripe: true });
          aim(r, a);
          expect(hintWord(r), 'ヒントは「まく」では ない').not.toBe('まく');
          unchanged(r, `${WET_JA(wet)} ${kind}`);
        });
      }

  for (const kind of CROP_KINDS)
    it(`野生の やさい〔wild_${kind}〕`, () => {
      const r = scene({ wet: true, ground: 'grass', crop: { kind, wild: true } });
      expect(cropAt(r)).toEqual({ kind, stage: 3, ripe: true });
      aim(r, 'crop');
      expect(r.dig.target()?.id).toBe(`wild_${kind}`);
      expect(hintWord(r), 'ヒントは「まく」では ない').not.toBe('まく');
      unchanged(r, `wild_${kind}`);
    });

  for (const wet of WETS)
    for (const a of ['top', 'soil'] as const) {
      it(`作物の ない ${WET_JA(wet)} はたけ〔${a === 'top' ? '上の 面' : '横の 面'}〕`, () => {
        const r = scene({ wet, ground: 'farmland', crop: null });
        expect(r.farm.soil(S.x, S.y, S.z)?.wet).toBe(wet);
        aim(r, a);
        expect(r.dig.target()?.block).toEqual({ x: S.x, y: S.y, z: S.z });
        expect(hintWord(r), 'ヒントは「まく」では ない').not.toBe('まく');
        unchanged(r, `からの はたけ ${a}`);
        expect(r.world.getBlock(C.x, C.y, C.z), '作物が 生えて こない').toBe('air');
      });
    }

  for (const ground of ['stone', 'grass'] as const)
    it(`ほかの ブロック〔${ground}〕`, () => {
      const r = scene({ wet: true, ground, crop: null });
      aim(r, 'top');
      expect(r.dig.target()?.id).toBe(ground);
      expect(hintWord(r), 'ヒントは「まく」では ない').not.toBe('まく');
      unchanged(r, ground);
    });

  it('空を ねらって 右クリックしても 何も しない', () => {
    const r = scene({ wet: true, ground: 'farmland', crop: { kind: 'tomato', stage: 0 } });
    r.player.pitchDeg = 60;
    r.tick(2);
    expect(r.dig.target()).toBeNull();
    r.tap();
    expect(bag(r)).toBe(5);
    expect(cropAt(r)?.stage).toBe(0);
  });

  it('いしばいを 持たずに 右クリックしても みのらない〔素手・ほかの 物〕', () => {
    for (const held of [null, 'stone' as ItemId, 'seed_tomato' as ItemId]) {
      const r = scene({ wet: true, ground: 'farmland', crop: { kind: 'tomato', stage: 1 }, held });
      aim(r, 'crop');
      r.tap();
      expect(cropAt(r)?.stage, `${held}`).toBe(1);
    }
  });
});

// ------------------------------------------------------------------ ヒント「まく」

describe('B14: ねらうと ヒント「まく」', () => {
  it('みのる 前の 作物と その 下の はたけ〔ぬれた・かわいた〕で「まく」', () => {
    for (const wet of WETS)
      for (const stage of STAGES)
        for (const a of ['crop', 'soil'] as const) {
          const r = scene({ wet, ground: 'farmland', crop: { kind: 'tomato', stage } });
          aim(r, a);
          expect(hintWord(r), `${WET_JA(wet)} 段 ${stage} ${a}`).toBe('まく');
        }
  });

  it('まいて みのった あとは「まく」は 出ない〔同じ 作物を ねらい つづけて〕', () => {
    const r = scene({ wet: true, ground: 'farmland', crop: { kind: 'tomato', stage: 0 } });
    aim(r, 'crop');
    expect(hintWord(r)).toBe('まく');
    r.tap();
    r.tick(2);
    expect(hintWord(r)).not.toBe('まく');
  });

  it('いしばいを 持たない とき〔素手〕は「まく」では ない', () => {
    const r = scene({ wet: true, ground: 'farmland', crop: { kind: 'tomato', stage: 0 }, held: null });
    aim(r, 'crop');
    expect(hintWord(r)).not.toBe('まく');
  });
});

// ------------------------------------------------------------------ 実績

describe('B14: 実績「いしばい で はじめて やさい が みのった！」', () => {
  const achId = (): string => {
    const d = ACHIEVEMENT_DEFS.filter((x) => x.name === ACH_NAME);
    expect(d, '実績の 行').toHaveLength(1);
    return d[0]!.id;
  };

  it('いしばいで みのらせた とき 1 回 出る・2 つ目の 作物では 出ない', () => {
    const id = achId();
    const r = scene({ wet: true, ground: 'farmland', crop: { kind: 'tomato', stage: 0 }, rows: 2 });
    expect(r.ach.isUnlocked(id)).toBe(false);
    aim(r, 'crop', 0);
    r.tap();
    expect(r.ach.isUnlocked(id), '1 つ目で 出る').toBe(true);
    expect(r.unlockedCount()).toBe(1);
    aim(r, 'crop', 1);
    r.tick(15);
    r.tap();
    expect(cropAt(r, 1)?.stage, '2 つ目も みのる').toBe(3);
    expect(r.unlockedCount(), '2 回目からは 出ない').toBe(1);
  });

  it('はたけの 下を ねらっても 出る〔かわいた はたけ〕', () => {
    const r = scene({ wet: false, ground: 'farmland', crop: { kind: 'onion', stage: 2 } });
    aim(r, 'soil');
    r.tap();
    expect(r.ach.isUnlocked(achId())).toBe(true);
  });

  it('自然に みのっても 出ない〔そだてて みのる・しゅうかく しても〕', () => {
    const r = scene({ wet: true, ground: 'farmland', crop: { kind: 'tomato', stage: 0 } });
    for (let i = 0; i < 4000 && cropAt(r)!.stage < 3; i++) r.grow(1);
    expect(cropAt(r)?.stage, '自然に みのる').toBe(3);
    expect(bag(r)).toBe(5);
    aim(r, 'crop');
    r.tap('primary');
    expect(r.world.getBlock(C.x, C.y, C.z), 'しゅうかく').toBe('air');
    expect(r.ach.isUnlocked(achId())).toBe(false);
    expect(r.unlockedCount()).toBe(0);
  });

  it('何も 起きなかった 右クリックでは 出ない〔みのった 作物・野生・からの はたけ・いし〕', () => {
    const cases: Array<[string, SceneOpts, Aim]> = [
      ['みのった 作物', { wet: true, ground: 'farmland', crop: { kind: 'tomato', stage: 3 } }, 'crop'],
      ['野生の やさい', { wet: true, ground: 'grass', crop: { kind: 'pumpkin', wild: true } }, 'crop'],
      ['からの はたけ', { wet: false, ground: 'farmland', crop: null }, 'top'],
      ['いし', { wet: true, ground: 'stone', crop: null }, 'top'],
    ];
    for (const [name, o, a] of cases) {
      const r = scene(o);
      aim(r, a);
      r.tap();
      r.tick(5);
      expect(r.ach.isUnlocked(achId()), name).toBe(false);
    }
  });

  it('自然に みのった あとでも、いしばいで みのらせれば 出る', () => {
    const r = scene({ wet: true, ground: 'farmland', crop: { kind: 'tomato', stage: 0 }, rows: 2 });
    for (let i = 0; i < 4000 && cropAt(r, 0)!.stage < 3; i++) r.grow(1);
    expect(r.unlockedCount(), '自然に みのった だけでは 出ない').toBe(0);
    expect(r.farm.setStage(C.x, C.y, rowZ(1), 0), '2 つ目を 芽に もどす').toBe(true); // 2 つ目も 自然に そだって いる ので
    aim(r, 'crop', 1);
    r.tap();
    expect(r.ach.isUnlocked(achId())).toBe(true);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { DigEvent, DigState, DigSystem, Inventory, ItemId, LockStatus, PlayerState, TargetInfo, ToolInfo } from '../contracts';
import { FX_SETTINGS } from '../fx/config';
import { DigFx } from '../fx/DigFx';
import { SoundFx } from '../fx/sound';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { MemoryBackend, SAVE_ID } from '../save/backend';
import { exportSave, importSave } from '../save/portable';
import { restoreStoredWorld } from '../save/restore';
import { SaveManager, type KeyValueStore } from '../save/SaveManager';
import { createToolConfig } from '../tools/config';
import { actionHintLines } from '../ui/actionHintModel';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createMineHook } from '../world/gen/mineHook';
import { populateWorld } from '../world/gen/populate';
import { createRng } from '../world/gen/random';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import type { DigToolPort } from './digPorts';

/**
 * MINE-1B（docs/design/MINE-1.md §4.4「チョーク」・§6.1 `chalkAt`・受け入れ基準 B13）: チョークで かく。
 *
 *   ゆか〔固い ブロックの 上の 面〕を ねらって 右クリック → その 上の マスに しるし〔`chalkAt` の face 'up'〕・チョーク 1 へる。
 *   やじるしの 向き dir は「来た ほう」: 今の 足の 位置から 横に 3 マス 以上 はなれて いた、いちばん 新しい 足の 位置〔10 秒 以内〕への 向き。
 *     なければ 見て いる 向きの 反対。ゆか ＝ 北・東・南・西の いちばん 近い もの。かべ ＝ かべに そって 左か 右の、来た ほうに 近い ほう。
 *     どちらとも 言えない とき〔来た ほうが かべの 正面から ±30 度〕は 見て いる 向きが よって いる ほう〔まっすぐなら かべを 見て 右〕。
 *   かけない〔チョークは へらない・ヒントも 出ない〕: 天井・水・固く ない ブロック〔たいまつ など〕・右クリックで 使う ブロック〔かまど など。そちらの 働きが 先〕。
 *   しるしは 固く ない〔体が 通る〕・左クリックで すぐ 消えて 何も 出ない〔「いっぱい」の 合図も 出ない〕・しるしの ついた ブロックを こわすと 消える・
 *   しるしの マスに ブロックを 置ける〔しるしは 消える。草と 同じ〕・同じ マスに かくと 新しい やじるしに かわる・保存して 開いても のこる〔向きも〕。
 *   ねらうと ヒント「かく」。
 *
 * 見た目〔形・色〕は B2「てがき」に 決まった〔仕様 §3.2。絵 3 まいから しるしの マスの 場所で 1 まい〕が、形・色は テストで 決め打ちしない
 * 〔B11 は 検証の とき art-reviewer が ゲームの スクショと 見本 chalk-b2.png を 見くらべる。オーナーの スクショ確認は しない〕。
 * しるしの ブロックの id は `chalk_mark` か 向きごとの id〔先頭が chalk_mark〕。
 *
 * 【名前を 自分で 決めた 所】 developer が ちがう 形に した ときは、下の「つなぎ」の 2 か所だけ あわせる。
 *   ① `chalkAt` を よぶ 所: `createMineHook({ seed, world })` の 窓口〔仕様 §6.1 は window.__rikkun.mine.chalkAt。いきている 世界を 読む ので world を わたす 形に した〕
 *   ② 来た ほうの 足あと: `DigSystemImpl.update()` を 1 ステップずつ 呼びながら player() の 位置を うごかす〔足あとを 記録する 場所が DigSystem の 外なら walk() を あわせる〕
 */

const CHALK = 'chalk' as ItemId;
const I = (id: string): ItemId => id as ItemId;
const isMark = (id: string): boolean => id.startsWith('chalk_mark');

/** ゆかの 上の 面の 高さ〔ブロック y=0〜FLOOR-1 が 石〕 */
const FLOOR = 10;
/** 1 マス 歩く ステップ数〔60 ステップ ＝ 1 秒。ふつうの 歩き 5 マス/秒 くらい〕 */
const STEPS_PER_CELL = 12;
/** 足あとを おぼえて いる 長さ〔仕様: 10 秒〕。ステップ */
const TRAIL_STEPS = 10 * 60;
const EYE = 1.62;

type Dir = 'n' | 'e' | 's' | 'w';
type Mark = { face: 'up' | Dir; dir: Dir } | null;

// ------------------------------------------------------------------ つなぎ（ここだけ developer の 形に あわせる）

/** ① しるしの 向きを 世界から 読む〔窓口 mine.chalkAt〕 */
interface MineView {
  world: unknown;
  mine?: { chalkAt?: (x: number, y: number, z: number) => Mark };
}
function chalkAt(r: MineView, x: number, y: number, z: number): Mark {
  r.mine ??= createMineHook({ seed: 1, world: r.world } as never) as unknown as { chalkAt?: (x: number, y: number, z: number) => Mark };
  if (typeof r.mine.chalkAt !== 'function') throw new Error('mine.chalkAt が まだ ない（MINE-1 §6.1）');
  return r.mine.chalkAt(x, y, z);
}

// ------------------------------------------------------------------ 本番と 同じ つなぎで DigSystem を 動かす

interface Rig {
  dig: DigSystemImpl;
  world: ArrayVoxelWorld;
  inv: InventoryImpl;
  actions: ActionState;
  player: PlayerState;
  /** かまどが あいた 場所 */
  opened: string[];
  /** たんすが あいた 場所 */
  tansuOpened: string[];
  mine?: { chalkAt?: (x: number, y: number, z: number) => Mark };
  tick(n?: number): void;
  tap(): void;
  /** 右ボタンを n ステップ おしっぱなしに して はなす */
  hold(n: number): void;
}

function rig(o: { held?: ItemId | null; count?: number; at?: [number, number]; world?: ArrayVoxelWorld; floor?: number; extra?: Array<[ItemId, number]> } = {}): Rig {
  const floor = o.floor ?? FLOOR;
  const world = o.world ?? new ArrayVoxelWorld({ x: 48, y: 24, z: 48 });
  if (!o.world) world.fill(0, 0, 0, 47, floor - 1, 47, 'stone');
  const [x0, z0] = o.at ?? [24.5, 24.5];
  const player: PlayerState = {
    position: { x: x0, y: floor, z: z0 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0,
    onGround: true, inWater: false, moving: false, facingDeg: 0, running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  const held = o.held === undefined ? CHALK : o.held;
  if (held) inv.setSlot(0, { item: held, count: o.count ?? 5 });
  (o.extra ?? []).forEach(([item, count], k) => inv.setSlot(k + 1, { item, count }));
  inv.select(0);
  const TOOLS = createToolConfig();
  const DIG = createDigConfig();
  const tools: DigToolPort = {
    current: (): ToolInfo => {
      const item = inv.held()?.item ?? null;
      return {
        item, kind: item && item.endsWith('_pickaxe') ? 'pickaxe' : 'hand',
        power: (item && TOOLS.toolPower[item]) || DIG.handPower,
        level: item && TOOLS.toolLevel[item] !== undefined ? TOOLS.toolLevel[item]! : DIG.handLevel,
        damage: 1, reach: 3.5, ticks: 30,
      };
    },
    step: () => undefined,
    pushSwing: () => undefined,
    swingWhiff: () => undefined,
  };
  const opened: string[] = [];
  const craft = {
    isFurnace: (x: number, y: number, z: number) => world.getBlock(x, y, z) === 'furnace',
    openFurnace: (x: number, y: number, z: number) => void opened.push(`${x},${y},${z}`),
    furnaceBroken: () => undefined,
    fixedDrop: () => null,
  };
  // たんす〔右クリックで あく 入れ物。本番は StorageSystem〕の 窓口。あいた 場所だけ おぼえる
  const tansuOpened: string[] = [];
  const storage = {
    isTansu: (x: number, y: number, z: number) => world.getBlock(x, y, z) === 'tansu',
    open: (x: number, y: number, z: number) => (tansuOpened.push(`${x},${y},${z}`), true),
    placed: () => undefined,
    broken: () => 0,
  };
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => EYE, createDigConfig(), createRng(1), null, { tools, craft: craft as never, storage });
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      dig.update();
      actions.endFrame();
    }
  };
  const tap = (): void => {
    actions.press('secondary');
    dig.update();
    actions.release('secondary');
    actions.endFrame();
  };
  const hold = (n: number): void => {
    actions.press('secondary');
    tick(n);
    actions.release('secondary');
    actions.endFrame();
  };
  const r: Rig = { dig, world, inv, actions, player, opened, tansuOpened, tick, tap, hold };
  tick(2);
  return r;
}

/** 目から 点〔px, py, pz〕の ほうを 見る */
function look(r: Rig, px: number, py: number, pz: number): void {
  const p = r.player.position;
  const dx = px - p.x;
  const dy = py - (p.y + EYE);
  const dz = pz - p.z;
  r.player.yawDeg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  r.player.pitchDeg = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  r.tick(2);
}

/** 足の 位置を 1 ステップずつ うごかして 歩く〔向きは 歩く 向き〕 */
function walk(r: Rig, x: number, z: number): void {
  const p = r.player.position;
  const dx = x - p.x;
  const dz = z - p.z;
  const n = Math.max(1, Math.round(Math.hypot(dx, dz) * STEPS_PER_CELL));
  const x0 = p.x;
  const z0 = p.z;
  r.player.yawDeg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  r.player.moving = true;
  for (let i = 1; i <= n; i++) {
    p.x = x0 + (dx * i) / n;
    p.z = z0 + (dz * i) / n;
    r.tick();
  }
  r.player.moving = false;
  r.tick();
}

/** 点を ねらって 右クリックで かく */
function draw(r: Rig, px: number, py: number, pz: number): void {
  look(r, px, py, pz);
  r.tap();
}

/** ゆかの マス〔cx, cz〕を ねらって かく。しるしの マスは (cx, FLOOR, cz) */
const drawFloor = (r: Rig, cx: number, cz: number): void => draw(r, cx + 0.5, FLOOR, cz + 0.5);

/** 押して ひびを MAX に して、はなして 押しなおして こわす〔ほる〕 */
function digOut(r: Rig): void {
  r.actions.press('primary');
  for (let i = 0; i < 600 && !r.dig.state().ready; i++) r.tick();
  r.actions.release('primary');
  r.tick();
  r.actions.press('primary');
  r.tick(2);
  r.actions.release('primary');
  r.tick();
}

const hintWord = (r: Rig, held: ItemId | null = CHALK): string | undefined =>
  actionHintLines(r.dig.previewRightClick(), r.dig.previewLeftClick(), { held, heldIsPickaxe: false, heldIsBlade: false }).right?.word;

const bagOf = (r: Rig): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const s of r.inv.slots()) if (s) out[s.item] = (out[s.item] ?? 0) + s.count;
  return out;
};

// ------------------------------------------------------------------ ゆかに かく

describe('B13: ゆかを ねらって 右クリック → その 上の マスに しるし', () => {
  it('ねらいの 土台: ゆかの 石の 上の 面を ねらえる〔この 部屋の 確かめ〕', () => {
    const r = rig();
    look(r, 26.5, FLOOR, 24.5);
    expect(r.dig.target()).toMatchObject({ block: { x: 26, y: FLOOR - 1, z: 24 }, id: 'stone', face: { x: 0, y: 1, z: 0 }, place: { x: 26, y: FLOOR, z: 24 } });
  });

  it('ゆかに しるし〔face up〕・チョーク 1 へる・下の ブロックは そのまま・しるしは 体が 通る', () => {
    const r = rig({ count: 5 });
    expect(chalkAt(r, 26, FLOOR, 24), 'かく 前は しるしが ない').toBeNull();
    drawFloor(r, 26, 24);
    expect(isMark(r.world.getBlock(26, FLOOR, 24)), `しるし〔${r.world.getBlock(26, FLOOR, 24)}〕`).toBe(true);
    expect(chalkAt(r, 26, FLOOR, 24)?.face).toBe('up');
    expect(r.inv.count(CHALK)).toBe(4);
    expect(r.world.getBlock(26, FLOOR - 1, 24)).toBe('stone');
    expect(r.world.isSolid(26, FLOOR, 24), 'しるしは 通れる').toBe(false);
  });

  it('1 回で 1 こ へる〔3 回 かくと 3 こ〕。0 に なったら かけない', () => {
    const r = rig({ count: 3 });
    // 東・北・南の 2 マス 先〔ねらいの 線が 前の しるしの マスを とおらない ように 向きを かえる〕
    const spots: Array<[number, number]> = [[26, 24], [24, 22], [24, 26]];
    for (const [cx, cz] of spots) drawFloor(r, cx, cz);
    expect(r.inv.count(CHALK)).toBe(0);
    for (const [cx, cz] of spots) expect(isMark(r.world.getBlock(cx, FLOOR, cz)), `(${cx}, ${cz})`).toBe(true);
    // 手が からっぽ〔チョークが ない〕で 右クリック → 新しい しるしは つかない
    drawFloor(r, 22, 24);
    expect(r.world.getBlock(22, FLOOR, 24)).toBe('air');
  });

  it('ねらうと ヒント「かく」〔ゆかを ねらって チョークを 持って いる とき〕', () => {
    const r = rig();
    look(r, 26.5, FLOOR, 24.5);
    expect(hintWord(r)).toBe('かく');
  });
});

// ------------------------------------------------------------------ やじるしの 向き

const CAME: ReadonlyArray<{ from: Dir; v: readonly [number, number]; target: readonly [number, number] }> = [
  // 来た ほう = from。見る 向きは わざと 来た 向きと 直角〔見る 向きの 反対では 当たらない ように〕
  { from: 'e', v: [1, 0], target: [24, 22] }, // 東から 来て 北を 見る
  { from: 'w', v: [-1, 0], target: [24, 22] },
  { from: 'n', v: [0, -1], target: [26, 24] }, // 北から 来て 東を 見る
  { from: 's', v: [0, 1], target: [26, 24] },
];

describe('B13: やじるしは 来た ほうを さす〔ゆか。北・東・南・西の いちばん 近い もの〕', () => {
  for (const c of CAME) {
    it(`${c.from} から 5 マス 歩いて きて、歩いて きた 向きと 直角に 見て かく → dir '${c.from}'`, () => {
      const r = rig({ at: [24.5 + 5 * c.v[0], 24.5 + 5 * c.v[1]] });
      walk(r, 24.5, 24.5);
      drawFloor(r, c.target[0], c.target[1]);
      const m = chalkAt(r, c.target[0], FLOOR, c.target[1]);
      expect(m?.face).toBe('up');
      expect(m?.dir).toBe(c.from);
    });
  }

  it('東から 西へ 5 マス 歩いて 西を 見て かくと dir e〔来た ほう〕', () => {
    const r = rig({ at: [29.5, 24.5] });
    walk(r, 24.5, 24.5); // 西へ 5 マス
    drawFloor(r, 22, 24); // 西〔歩いて きた 向き〕を 見て かく
    expect(chalkAt(r, 22, FLOOR, 24)?.dir).toBe('e');
  });

  it('そのあと 見る 向きだけ かえて かいても dir は 来た ほう〔北を 見ても 南に ならない〕', () => {
    const r = rig({ at: [29.5, 24.5] });
    walk(r, 24.5, 24.5);
    drawFloor(r, 22, 24);
    drawFloor(r, 24, 22); // 北を 見て かく〔足は うごかして いない〕
    drawFloor(r, 24, 26); // 南を 見て かく
    for (const [cx, cz] of [[22, 24], [24, 22], [24, 26]]) expect(chalkAt(r, cx, FLOOR, cz)?.dir, `(${cx}, ${cz})`).toBe('e');
  });

  it('来た ほうが ないとき〔足あとが ない〕は 見て いる 向きの 反対', () => {
    const r = rig();
    drawFloor(r, 24, 22); // 北を 見る → 南
    expect(chalkAt(r, 24, FLOOR, 22)?.dir).toBe('s');
    drawFloor(r, 26, 24); // 東を 見る → 西
    expect(chalkAt(r, 26, FLOOR, 24)?.dir).toBe('w');
  });

  it('横に 3 マス 以上 はなれて いない 足あとは 数えない〔2 マスしか 歩いて いない → 見て いる 向きの 反対〕', () => {
    const r = rig({ at: [26.5, 24.5] });
    walk(r, 24.5, 24.5); // 西へ 2 マス
    drawFloor(r, 24, 22); // 北を 見る
    expect(chalkAt(r, 24, FLOOR, 22)?.dir).toBe('s');
  });

  it('足あとは 10 秒 いない〔10 秒 たって 立ちどまって いたら 見て いる 向きの 反対〕。5 秒 たった だけなら まだ 来た ほう', () => {
    const a = rig({ at: [29.5, 24.5] });
    walk(a, 24.5, 24.5);
    a.tick(TRAIL_STEPS / 2);
    drawFloor(a, 24, 22); // 北を 見る
    expect(chalkAt(a, 24, FLOOR, 22)?.dir, '5 秒').toBe('e');
    const b = rig({ at: [29.5, 24.5] });
    walk(b, 24.5, 24.5);
    b.tick(TRAIL_STEPS + 120);
    drawFloor(b, 24, 22);
    expect(chalkAt(b, 24, FLOOR, 22)?.dir, '12 秒').toBe('s');
  });

  it('「いちばん 新しい」足あと: 東へ 5 マス → 北へ 5 マス 歩くと、来た ほうは 南〔先に 歩いた 西では ない〕', () => {
    const r = rig({ at: [20.5, 29.5] });
    walk(r, 25.5, 29.5); // 東へ 5 マス
    walk(r, 25.5, 24.5); // 北へ 5 マス
    drawFloor(r, 27, 24); // 東を 見る
    expect(chalkAt(r, 27, FLOOR, 24)?.dir).toBe('s');
  });
});

// ------------------------------------------------------------------ かべに かく

/** 北を 向いた かべ〔z=30 の 面。x 10〜40・高さ 5 マス〕 */
function wallRig(at: [number, number]): Rig {
  const r = rig({ at });
  r.world.fill(10, FLOOR, 30, 40, FLOOR + 4, 30, 'stone');
  return r;
}

describe('B13: かべ〔北を 向いた 面〕に かくと、かべに そって 左か 右の 来た ほう', () => {
  it('かべを ねらう と 前の マスに しるし〔face n〕', () => {
    const r = wallRig([24.5, 26.5]);
    draw(r, 24.5, FLOOR + 1.5, 30);
    expect(isMark(r.world.getBlock(24, FLOOR + 1, 29))).toBe(true);
    expect(chalkAt(r, 24, FLOOR + 1, 29)?.face).toBe('n');
    expect(r.inv.count(CHALK)).toBe(4);
    expect(r.world.getBlock(24, FLOOR + 1, 30)).toBe('stone');
  });

  it('東から 来て かべを 見る → dir e／西から 来て かべを 見る → dir w', () => {
    for (const [from, x0] of [['e', 29.5], ['w', 19.5]] as const) {
      const r = wallRig([x0, 26.5]);
      walk(r, 24.5, 26.5);
      draw(r, 24.5, FLOOR + 1.5, 30);
      const m = chalkAt(r, 24, FLOOR + 1, 29);
      expect(m?.face, from).toBe('n');
      expect(m?.dir, `${from} から 来た`).toBe(from);
    }
  });

  it('来た ほうが かべの 正面〔どちらとも 言えない〕: まっすぐ 見ると かべを 見て 右〔w〕・東へ よって 見ると e・西へ よって 見ると w', () => {
    const cases: Array<[string, number, Dir]> = [['まっすぐ', 24.5, 'w'], ['東へ よって', 25.7, 'e'], ['西へ よって', 23.3, 'w']];
    for (const [name, lookX, want] of cases) {
      const r = wallRig([24.5, 21.5]);
      walk(r, 24.5, 26.5); // 北から 南へ 5 マス〔来た ほうは 北 ＝ かべの 正面〕
      look(r, lookX, FLOOR + 1.62, 30);
      const t = r.dig.target()!;
      expect(t.face, `${name}: かべの 面を ねらえた`).toMatchObject({ x: 0, y: 0, z: -1 });
      r.tap();
      const m = chalkAt(r, t.place.x, t.place.y, t.place.z);
      expect(m?.face, name).toBe('n');
      expect(m?.dir, name).toBe(want);
    }
  });
});

/** 東を 向いた かべ〔x=18 の 面。z 10〜40・高さ 5 マス〕。しるしは その 東がわ x=19 の マス */
function eastWallRig(at: [number, number]): Rig {
  const r = rig({ at });
  r.world.fill(18, FLOOR, 10, 18, FLOOR + 4, 40, 'stone');
  return r;
}

describe('B13: かべ〔東を 向いた 面〕に かくと、かべに そって 北か 南の 来た ほう', () => {
  it('かべ〔西〕を ねらうと 東がわの マスに しるし〔face e〕・チョーク 1 へる', () => {
    const r = eastWallRig([21.5, 24.5]);
    draw(r, 19, FLOOR + 1.5, 24.5);
    expect(isMark(r.world.getBlock(19, FLOOR + 1, 24))).toBe(true);
    expect(chalkAt(r, 19, FLOOR + 1, 24)?.face).toBe('e');
    expect(r.inv.count(CHALK)).toBe(4);
    expect(r.world.getBlock(18, FLOOR + 1, 24)).toBe('stone');
  });

  it('北から 来て かべを 見る → dir n／南から 来て かべを 見る → dir s〔東西の かべ ＝ かべに そう 向きは 北か 南〕', () => {
    for (const [from, z0] of [['n', 19.5], ['s', 29.5]] as const) {
      const r = eastWallRig([21.5, z0]);
      walk(r, 21.5, 24.5); // 北〔か 南〕から 5 マス 歩いて くる〔かべに そって〕
      draw(r, 19, FLOOR + 1.5, 24.5); // 西の かべの 面を ねらって かく
      const m = chalkAt(r, 19, FLOOR + 1, 24);
      expect(m?.face, from).toBe('e');
      expect(m?.dir, `${from} から 来た`).toBe(from);
    }
  });
});

// ------------------------------------------------------------------ かけない 所

describe('B13: かけない 所〔チョークは へらない・しるしは つかない・ヒントも 出ない〕', () => {
  it('天井〔下の 面〕', () => {
    const r = rig();
    r.world.fill(20, FLOOR + 4, 20, 30, FLOOR + 4, 30, 'stone');
    look(r, 24.5, FLOOR + 4, 26);
    expect(r.dig.target()).toMatchObject({ id: 'stone', face: { x: 0, y: -1, z: 0 } });
    expect(hintWord(r), 'ヒント').not.toBe('かく');
    r.tap();
    expect(r.world.getBlock(24, FLOOR + 3, 26)).toBe('air');
    expect(r.inv.count(CHALK)).toBe(5);
  });

  it('水の 中〔前の マスが 空気で ない〕', () => {
    const r = rig();
    r.world.fill(20, FLOOR, 20, 30, FLOOR, 30, 'water');
    look(r, 26.5, FLOOR, 24.5);
    expect(r.dig.target()).toMatchObject({ id: 'stone', place: { x: 26, y: FLOOR, z: 24 } }); // 水は ねらいの 線を とおす
    expect(hintWord(r), 'ヒント').not.toBe('かく');
    r.tap();
    expect(r.world.getBlock(26, FLOOR, 24)).toBe('water');
    expect(r.inv.count(CHALK)).toBe(5);
  });

  it('たいまつ〔固く ない ブロック〕', () => {
    const r = rig();
    r.world.setBlock(26, FLOOR, 24, 'torch');
    look(r, 26.5, FLOOR + 0.5, 24.5);
    expect(r.dig.target()).toMatchObject({ id: 'torch' });
    expect(hintWord(r), 'ヒント').not.toBe('かく');
    r.tap();
    expect(r.world.getBlock(26, FLOOR, 24)).toBe('torch');
    expect(r.world.getBlock(26, FLOOR + 1, 24)).toBe('air');
    expect(r.inv.count(CHALK)).toBe(5);
  });

  it('かまど〔右クリックで 使う ブロック〕は あく・しるしは つかない・チョークは へらない。ヒントは「ひらく」', () => {
    const r = rig();
    r.world.setBlock(26, FLOOR, 24, 'furnace');
    look(r, 26.5, FLOOR + 1, 24.5);
    expect(r.dig.target()).toMatchObject({ id: 'furnace', face: { x: 0, y: 1, z: 0 } });
    expect(hintWord(r)).toBe('ひらく');
    r.tap();
    expect(r.opened, 'かまどが あく').toEqual([`26,${FLOOR},24`]);
    expect(r.world.getBlock(26, FLOOR + 1, 24)).toBe('air');
    expect(r.inv.count(CHALK)).toBe(5);
  });

  it('たんす〔右クリックで 使う ブロック。仕様 §4.4〕は あく・しるしは つかない・チョークは へらない。ヒントは「ひらく」', () => {
    const r = rig();
    r.world.setBlock(26, FLOOR, 24, 'tansu');
    look(r, 26.5, FLOOR + 1, 24.5);
    expect(r.dig.target()).toMatchObject({ id: 'tansu', face: { x: 0, y: 1, z: 0 } });
    expect(hintWord(r)).toBe('ひらく');
    r.tap();
    expect(r.tansuOpened, 'たんすが あく').toEqual([`26,${FLOOR},24`]);
    expect(r.world.getBlock(26, FLOOR + 1, 24), 'しるしは つかない').toBe('air');
    expect(r.inv.count(CHALK)).toBe(5);
  });

  it('押しっぱなしでも 同じ マスには 1 回 だけ かく〔チョークは 1 こ だけ へる〕。かきなおしは 押しなおした とき', () => {
    const r = rig({ count: 5 });
    look(r, 26.5, FLOOR, 24.5);
    r.hold(180); // 3 秒 おしっぱなし
    expect(isMark(r.world.getBlock(26, FLOOR, 24)), 'しるし').toBe(true);
    expect(r.inv.count(CHALK), '1 こ だけ へる').toBe(4);
    expect(chalkAt(r, 26, FLOOR, 24)?.dir, '足あとが ない → 見て いる 向き〔東〕の 反対').toBe('w');
    // はなして、来た ほうを かえて 押しなおすと かきなおせる〔新しい やじるし〕。へるのは 1 こ まで
    walk(r, 24.5, 29.5); // 南へ 5 マス
    walk(r, 24.5, 24.5); // 北へ 5 マス もどる → 来た ほうは 南
    drawFloor(r, 26, 24);
    expect(chalkAt(r, 26, FLOOR, 24)?.dir, '押しなおしで かきなおし').toBe('s');
    expect([3, 4], 'へるのは 0〜1 こ').toContain(r.inv.count(CHALK));
  });

  it('チョークを 持たずに 右クリックしても しるしは つかない', () => {
    const r = rig({ held: null });
    drawFloor(r, 26, 24);
    expect(r.world.getBlock(26, FLOOR, 24)).toBe('air');
  });
});

// ------------------------------------------------------------------ しるしを 消す・置きかえる・かきなおす

describe('B13: しるしの あつかい', () => {
  it('左クリックで すぐ 消えて 何も 出ない〔持ち物は ふえない〕。「もちもの が いっぱい」の 合図も 出ない', () => {
    const r = rig();
    drawFloor(r, 26, 24);
    expect(chalkAt(r, 26, FLOOR, 24)).not.toBeNull();
    r.dig.drainEvents();
    look(r, 26.5, FLOOR + 0.5, 24.5);
    expect(isMark(r.dig.target()!.id), 'しるしを ねらえる').toBe(true);
    digOut(r);
    expect(r.world.getBlock(26, FLOOR, 24)).toBe('air');
    expect(chalkAt(r, 26, FLOOR, 24)).toBeNull();
    expect(bagOf(r), '何も 出ない').toEqual({ chalk: 4 });
    // 画面の 合図〔DigFx〕: ほった 出来事を そのまま わたす
    const events = r.dig.drainEvents();
    const signals: unknown[][] = [];
    const fake: DigSystem = {
      target: (): TargetInfo | null => null,
      state: (): DigState => ({ active: false, block: null, progress: 0, crackStage: 0, ready: false, blockedReason: null }),
      drainEvents: (): DigEvent[] => events,
      peekEvents: (): DigEvent[] => events,
    };
    const sound = new SoundFx(() => null, { ...FX_SETTINGS });
    sound.play = () => undefined;
    const fx = new DigFx({
      scene: new THREE.Scene(), dig: fake, sound,
      doll: { swing: () => undefined, setDigging: () => undefined },
      view: { setShake: () => undefined },
      notice: { showSignal: (...a: unknown[]) => void signals.push(a) },
      settings: { ...FX_SETTINGS },
    });
    fx.update(1 / 60);
    expect(signals, '合図').toEqual([]);
  });

  it('しるしの ついた ブロックを こわすと しるしも 消える', () => {
    const r = rig({ at: [24.5, 26.5], extra: [[I('iron_pickaxe'), 1]] });
    r.world.fill(24, FLOOR, 30, 24, FLOOR + 2, 30, 'stone'); // はしらを 1 本〔南がわの かべだけ ではなく 東西にも 面が ある〕
    draw(r, 24.5, FLOOR + 1.5, 30);
    expect(chalkAt(r, 24, FLOOR + 1, 29)?.face).toBe('n');
    // 東がわから はしらを ほる〔しるしの マスを 線が とおらない ように〕
    r.player.position.x = 27.5;
    r.player.position.z = 30.5;
    r.inv.select(1);
    look(r, 25, FLOOR + 1.5, 30.5);
    expect(r.dig.target()).toMatchObject({ block: { x: 24, y: FLOOR + 1, z: 30 }, id: 'stone' });
    digOut(r);
    expect(r.world.getBlock(24, FLOOR + 1, 30), 'はしらの ブロック').toBe('air');
    expect(r.world.getBlock(24, FLOOR + 1, 29), 'しるし').toBe('air');
    expect(chalkAt(r, 24, FLOOR + 1, 29)).toBeNull();
  });

  it('しるしの マスに ブロックを 置ける〔しるしは 消える。草と 同じ〕', () => {
    const r = rig({ extra: [[I('stone'), 3]] });
    drawFloor(r, 26, 24);
    expect(chalkAt(r, 26, FLOOR, 24)).not.toBeNull();
    r.inv.select(1);
    look(r, 26.5, FLOOR + 0.5, 24.5);
    expect(isMark(r.dig.target()!.id), 'しるしを ねらえる').toBe(true);
    r.tap();
    expect(r.world.getBlock(26, FLOOR, 24)).toBe('stone');
    expect(chalkAt(r, 26, FLOOR, 24)).toBeNull();
    expect(r.inv.count(I('stone'))).toBe(2);
  });

  it('同じ マスに かくと 新しい やじるしに かわる', () => {
    const r = rig();
    drawFloor(r, 26, 24); // 足あとが ない → 東を 見る → 西
    expect(chalkAt(r, 26, FLOOR, 24)?.dir).toBe('w');
    walk(r, 24.5, 29.5); // 南へ 5 マス〔いったん はなれる〕
    walk(r, 24.5, 24.5); // 北へ 5 マス もどる → 来た ほうは 南
    drawFloor(r, 26, 24); // 東を 見て、同じ マスに かく
    expect(isMark(r.world.getBlock(26, FLOOR, 24))).toBe(true);
    expect(chalkAt(r, 26, FLOOR, 24)?.dir).toBe('s');
  });
});

// ------------------------------------------------------------------ 保存

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const SAVE_SEED = 12345;

/** 1 回の ページ表示に 当たる もの〔世界・保存係〕。ふだんの 起動と 同じ 順 */
async function openSession(db: MemoryBackend, store: MemoryStore) {
  const world = new ArrayVoxelWorld({ x: 0, z: 0 });
  const island = populateWorld(world, SAVE_SEED);
  world.resetSaveTracking();
  const restored = await restoreStoredWorld({ world, db, store, seed: SAVE_SEED, saveId: SAVE_ID, reset: false });
  let slots: unknown = { slots: [], selected: 0 };
  const inventory = {
    serialize: () => slots,
    deserialize: (d: unknown) => {
      slots = d;
    },
    clear: () => {
      slots = { slots: [], selected: 0 };
    },
  } as unknown as Inventory;
  const spawn = island.spawn();
  const state: PlayerState = {
    position: { x: spawn.x, y: spawn.y, z: spawn.z }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: spawn.yawDeg, pitchDeg: spawn.pitchDeg,
    onGround: true, inWater: false, moving: false, facingDeg: 0, running: false,
  };
  const save = new SaveManager({
    world, seed: SAVE_SEED, db, restored, inventory,
    player: { get: () => state, set: () => undefined },
    spawn: () => island.spawn(), store, tick: () => 0, settings: { saveIntervalTicks: 600 },
  });
  save.load();
  return { world, island, save };
}

describe('B13: 保存して 開きなおしても しるしが のこる〔向きも〕', () => {
  it('ゆかの しるし・かべの しるしを 保存 → 開きなおしても 同じ 場所・同じ face・同じ dir。ファイルに 書き出して 読みこんでも 同じ', async () => {
    const db = new MemoryBackend();
    const a = await openSession(db, new MemoryStore());
    const sp = a.island.spawn();
    const X0 = Math.floor(sp.x) - 8;
    const Z0 = Math.floor(sp.z) - 8;
    const FY = 300; // ゆかの 上の 面〔高い 所に 石の 台を 作る。地形に かからない〕
    for (let x = X0; x < X0 + 14; x++) {
      for (let z = Z0; z < Z0 + 12; z++) for (let y = FY - 2; y < FY; y++) a.world.setBlock(x, y, z, 'stone');
    }
    for (let x = X0; x < X0 + 14; x++) for (let y = FY; y < FY + 4; y++) a.world.setBlock(x, y, Z0 + 8, 'stone'); // 北を 向いた かべ
    const r = rig({ world: a.world, floor: FY, at: [X0 + 10.5, Z0 + 4.5], extra: [] });
    walk(r, X0 + 5.5, Z0 + 4.5); // 西へ 5 マス → 来た ほうは 東
    draw(r, X0 + 3.5, FY, Z0 + 4.5); // 西を 見て、ゆかに かく
    draw(r, X0 + 5.5, FY + 1.5, Z0 + 8); // かべに かく
    const floorCell = [X0 + 3, FY, Z0 + 4] as const;
    const wallCell = [X0 + 5, FY + 1, Z0 + 7] as const;
    const f = chalkAt(r, ...floorCell);
    const w = chalkAt(r, ...wallCell);
    expect(f, 'ゆかの しるし').toEqual({ face: 'up', dir: 'e' });
    expect(w, 'かべの しるし').toEqual({ face: 'n', dir: 'e' });
    await a.save.now();

    const b = await openSession(db, new MemoryStore());
    expect(chalkAt({ world: b.world }, ...floorCell), '開きなおした ゆかの しるし').toEqual(f);
    expect(chalkAt({ world: b.world }, ...wallCell), '開きなおした かべの しるし').toEqual(w);

    const file = await exportSave(db, SAVE_ID);
    const db2 = new MemoryBackend();
    await importSave(db2, SAVE_ID, file, SAVE_SEED);
    const c = await openSession(db2, new MemoryStore());
    expect(chalkAt({ world: c.world }, ...floorCell), 'ファイルから ゆか').toEqual(f);
    expect(chalkAt({ world: c.world }, ...wallCell), 'ファイルから かべ').toEqual(w);
  });
});

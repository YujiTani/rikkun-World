import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, PlayerState, Vec3, VoxelWorld } from '../contracts';
import { DigSystemImpl } from '../dig/DigSystem';
import { ActionState, type Action } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { FakeYokaiWorld, P, at, settingsW3 } from '../combat/attackTestKit';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import { createDigConfig } from '../dig/config';
import { PlayerController } from '../player/PlayerController';
import { createBladeSystem } from '../tools/blade/BladeSystem';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { bindWho } from './credit';
import { createP2Dig } from './p2Dig';
import { P2State } from './p2State';

/**
 * COOP-1 作業 3a（#416）の 先行テスト（赤）。AC35（2P が ほる・おく）・AC36（同じ ブロックを 2 人で ほる）・AC38（仲間の 体の ある 所に 置けない）・AC15（2P の ZL は かまど／たんすで ブロックを 置かない）。
 * COOP-1 4c（#428 の つぎ）の テスト準備で、AC15 の「画面は 開かない」を AC95 の 形（かまど: ZL で「やく」、たんす: Y か ZL で「たんす」が 開く）に 直した。ブロックを 置かない 所は そのまま。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/p2Dig.ts  `createP2Dig(d: P2DigDeps): DigSystemImpl`  （Y〔`tryOpenAimedStorage()`〕の 4c の 形は 下の【4c】）
 *     2P 用の ほる・おく係。1P と 同じ `DigSystemImpl` を もう 1 つ 作って 返す（2P の ActionState・2P の 持ち物 `p2.inventory`・2P の 位置を 渡す）。
 *     P2DigDeps = { world: VoxelWorld; p2: P2State; actions: ActionState; position: () => PlayerState; lock: LockStatus;
 *                   eyeHeight: () => number; partner: () => Vec3 | null; gate?: PunchGate | null; m4?: DigM4Deps; config?: DigConfig; rng?: Rng }
 *     - gate = 2P 用の PlayerCombatImpl（2P の 体力の 持ち主でもある。作り方は p2Life.test.ts の 頭。1P の 物と 同じ 道）。PunchGate として 渡す。DigSystemImpl の 第 9 引数に 渡す。
 *     - 2P の「ふつうの こうげき」= 1P と 同じ: 手に もっている 物で パンチ・刀の ふり・弓。レジェンダリーの わざ・パリィは 段階 2（2P の m4 には 入れない）。
 *     - m4.yokai・gate の 妖怪の 世界は `bindWho(y, 2)`（src/duo/credit.ts。下の credit.test.ts）で 包んだ 物を 渡す。1P は `bindWho(y, 1)`。
 *     - 刀・弓の 2P 分: m4.blade・m4.tools を 2P の 持ち物で 作って 渡す（テストは パンチ 1 本。刀は 同じ 道なので 実装の 確認で 見る）
 *     - 2P の ZR（primary）＝ほる・ZL（secondary）＝おく。持ち物は p2.inventory だけを 使う（1P の 持ち物は 見ない）。
 *     - m4.partner = partner を そのまま 渡す。
 *     - 2P の 開く 口は m4 の 物を 使わない（m4.craft.openFurnace・m4.storage.open は 1P 用。2P からは 呼ばない）。
 *       かまど（craft.isFurnace が true）・たんす（block id が 'tansu'）を ねらった ZL は 1P と 同じに「何も 置かない」。
 *   【4c】P2DigDeps に 足す（AC95。見本: wip-4c-proto 7b5ce32 の p2Dig.ts）:
 *     onOpenFurnace?: (x: number, y: number, z: number) => void   … 2P が かまどを ねらって ZL。2P の 画面の「やく」の ページを 開く 合図（1 回）
 *     onOpenTansu?: (x: number, y: number, z: number) => void     … 2P が たんすを ねらって ZL か Y（tryOpenAimedStorage）。「たんす」の ページを 開く 合図（1 回）
 *     - 返った DigSystemImpl の `tryOpenAimedStorage()`: たんすを ねらっていて onOpenTansu が あれば onOpenTansu を 呼んで true。かまど・何も ねらって いない・onOpenTansu が ない ときは false（かまどを ねらった Y は「もちもの」の ページ）。
 *     - onOpenFurnace・onOpenTansu を 渡さない 2P は 3a の とおり 何も 開かない（口が ない）。
 *     - かまどを こわした とき 呼ぶ `m4.craft.furnaceBroken` は **2P の つくる**（配線が 渡す: src/game/wire/duoPlay.ts:165 の `m4.craft` の 1P の craft を 2P の craft〔`createDuoInventory` の p2Craft.craft〕に 替える。中身は こわした 人へ。furnaceWorld.test.ts）。
 *       openFurnace は 2P では `onOpenFurnace` に つなぐので m4.craft.openFurnace は 空のまま。
 *   src/dig/digPorts.ts  `DigM4Deps.partner?: () => Vec3 | null`  … 仲間（もう 1 人）の 足もとの 位置。なければ 仲間は いない。
 *     置く とき 自分の 体に 加えて 仲間の 体（`overlapsBody(partner, x, y, z)` と 同じ 決まり）とも 重なる マスには 置けない（AC38）。
 *   src/dig/DigSystem.ts  ほっている 途中の ブロックが（だれが こわしても）なくなったら、次の ステップで ひびは 0 に 戻る（`state().progress`＝0・`block`＝null）。
 *     いまは ねらいが 外れても ゆっくり へるだけ（decay）なので、AC36 の「もう 1 人の 途中までの 分は 0」が 赤になる。
 */

class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
  isLoaded(): boolean {
    return true;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: 64, z1: 64 };
  }
  blocks = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64) return 'outside';
    return this.blocks.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    if (id === 'air') this.blocks.delete(`${x},${y},${z}`);
    else this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'outside' && b !== 'air' && b !== 'water';
  }
}

const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
const EYE = 1.62;
const stateAt = (x: number, z: number): PlayerState => ({
  position: { x, y: 9, z },
  velocity: { x: 0, y: 0, z: 0 },
  yawDeg: 90, // 前が +x
  pitchDeg: 0,
  onGround: true,
  inWater: false,
  moving: false,
  facingDeg: 0,
  running: false,
});

/** 1P と 2P が 同じ 世界に 並ぶ。1P は 足もと (2.5, 9, 6.5)、2P は (3.5, 9, 6.5)。どちらも +x（yaw 90）を 向く */
function rig() {
  const world = new FakeWorld();
  const a1 = new ActionState();
  const a2 = new ActionState();
  const inv1 = new InventoryImpl();
  const p2 = new P2State();
  const s1 = stateAt(2.5, 6.5);
  const s2 = stateAt(3.5, 6.5);
  const dig1 = new DigSystemImpl(world, () => s1, a1, lock, inv1, () => EYE, undefined, undefined, null, { partner: () => ({ ...s2.position }) });
  const dig2 = createP2Dig({ world, p2, actions: a2, position: () => s2, lock, eyeHeight: () => EYE, partner: () => ({ ...s1.position }) });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      dig1.update();
      dig2.update();
      a1.endFrame();
      a2.endFrame();
    }
  };
  const press = (a: ActionState, act: string) => a.press(act as Action);
  const release = (a: ActionState, act: string) => a.release(act as Action);
  step(1);
  return { world, a1, a2, inv1, p2, s1, s2, dig1, dig2, step, press, release };
}
type Rig = ReturnType<typeof rig>;

/** ZR を 押しつづけて ひびが MAX（ready）に なるまで。なったら true */
function digUntilReady(r: Rig, a: ActionState, dig: DigSystemImpl, max = 3000): boolean {
  r.press(a, 'primary');
  for (let i = 0; i < max; i++) {
    r.step(1);
    if (dig.state().ready) return true;
  }
  return false;
}
/** MAX の あと 押し直して こわす */
function finishBreak(r: Rig, a: ActionState): void {
  r.release(a, 'primary');
  r.step(1);
  r.press(a, 'primary');
  r.step(1);
  r.release(a, 'primary');
}

describe('AC35: 2P は ZR で ほれて、ZL で 置ける（持ち物は 2P の物だけ）', () => {
  it('2P が ZR で ほる → ブロックが 消えて、ドロップは 2P の 持ち物に 入る。1P の 持ち物は 変わらない', () => {
    const r = rig();
    r.world.setBlock(5, 10, 6, 'dirt');
    r.step(1);
    expect(r.dig2.target()?.block).toEqual({ x: 5, y: 10, z: 6 });
    expect(digUntilReady(r, r.a2, r.dig2)).toBe(true);
    finishBreak(r, r.a2);
    expect(r.world.getBlock(5, 10, 6)).toBe('air');
    expect(r.p2.inventory.count('dirt')).toBeGreaterThanOrEqual(1);
    expect(r.inv1.count('dirt')).toBe(0);
  });

  it('2P が ZL で 置く → ねらった 面の となりに 置かれ、2P の 持ち物が 1 つ へる。1P の 持ち物は へらない', () => {
    const r = rig();
    r.world.setBlock(5, 10, 6, 'stone');
    r.p2.inventory.setSlot(0, { item: 'dirt', count: 5 });
    r.inv1.setSlot(0, { item: 'dirt', count: 5 });
    r.step(1);
    const t = r.dig2.target()!;
    expect(t.place).toEqual({ x: 4, y: 10, z: 6 });
    r.press(r.a2, 'secondary');
    r.step(1);
    r.release(r.a2, 'secondary');
    expect(r.world.getBlock(4, 10, 6)).toBe('dirt');
    expect(r.p2.inventory.count('dirt')).toBe(4);
    expect(r.inv1.count('dirt')).toBe(5);
  });

  it('1P の ZR は 2P の 持ち物に 入れない（ほった物は ほった人の 物）', () => {
    const r = rig();
    r.world.setBlock(5, 10, 6, 'dirt');
    r.step(1);
    expect(digUntilReady(r, r.a1, r.dig1)).toBe(true);
    finishBreak(r, r.a1);
    expect(r.inv1.count('dirt')).toBeGreaterThanOrEqual(1);
    expect(r.p2.inventory.count('dirt')).toBe(0);
  });
});

describe('AC36: 同じ ブロックを 2 人で ほる → 先に ほり終わった方が こわす。もう 1 人の 途中までの 分は 0。ドロップは 1 回だけ', () => {
  it('1P が 先に こわす → 2P の ひびは 次の ステップで 0（ゆっくり へるのでは ない）。ドロップは 1P にだけ', () => {
    const r = rig();
    r.world.setBlock(5, 10, 6, 'dirt');
    r.step(1);
    // 1P が 先に 押しはじめ、8 割 たまった ところで 2P も 押しはじめる（2P の ひびは 途中まで）
    r.press(r.a1, 'primary');
    for (let i = 0; i < 3000 && r.dig1.state().progress < 0.8; i++) r.step(1);
    r.press(r.a2, 'primary');
    for (let i = 0; i < 3000 && !r.dig1.state().ready; i++) r.step(1);
    expect(r.dig1.state().ready).toBe(true);
    expect(r.dig2.state().ready, '2P は まだ MAX では ない').toBe(false);
    expect(r.dig2.state().progress).toBeGreaterThan(0);
    r.release(r.a1, 'primary');
    r.step(1);
    r.press(r.a1, 'primary');
    r.step(1); // 1P が こわす
    r.release(r.a1, 'primary');
    expect(r.world.getBlock(5, 10, 6)).toBe('air');
    // 次の ステップで 2P の 途中までの 分は 0
    r.step(1);
    const s2 = r.dig2.state();
    expect(s2.progress).toBe(0);
    expect(s2.block).toBeNull();
    expect(s2.crackStage).toBe(0);
    r.release(r.a2, 'primary');
    // ドロップは 1 回だけ（ほった 1P の 持ち物だけ。2P には 入らない）
    expect(r.inv1.count('dirt')).toBeGreaterThanOrEqual(1);
    expect(r.p2.inventory.count('dirt')).toBe(0);
    const breaks = [...r.dig1.takeHookEvents(), ...r.dig2.takeHookEvents()].filter((e) => e.type === 'break');
    expect(breaks).toHaveLength(1);
  });

  it('2 人が 同じ ステップで 「こわす」を 押しても 1 回だけ（1P → 2P の 順で 動かす。2 人目は こわせない）', () => {
    const r = rig();
    r.world.setBlock(5, 10, 6, 'dirt');
    r.step(1);
    r.press(r.a1, 'primary');
    r.press(r.a2, 'primary');
    for (let i = 0; i < 3000 && !(r.dig1.state().ready && r.dig2.state().ready); i++) r.step(1);
    expect(r.dig1.state().ready && r.dig2.state().ready, '2 人とも MAX').toBe(true);
    r.release(r.a1, 'primary');
    r.release(r.a2, 'primary');
    r.step(1);
    r.press(r.a1, 'primary');
    r.press(r.a2, 'primary');
    r.step(1);
    const breaks = [...r.dig1.takeHookEvents(), ...r.dig2.takeHookEvents()].filter((e) => e.type === 'break');
    expect(breaks).toHaveLength(1);
    expect(r.inv1.count('dirt') > 0 !== r.p2.inventory.count('dirt') > 0, '持ち物に 入るのは どちらか 1 人').toBe(true);
    expect(r.world.getBlock(5, 10, 6)).toBe('air');
  });
});

describe('AC38: 仲間の 体の ある 所には ブロックを 置けない', () => {
  /** x=5 の 石の 壁に むかって 置く: 置き先は (4,10,6)。仲間を その マスの 中に 立たせる */
  function setup() {
    const r = rig();
    r.world.setBlock(5, 10, 6, 'stone');
    r.inv1.setSlot(0, { item: 'dirt', count: 5 });
    r.p2.inventory.setSlot(0, { item: 'dirt', count: 5 });
    r.step(1);
    return r;
  }
  it('1P が 置こうと した マスに 2P の 体が あれば 置けない（持ち物も へらない）', () => {
    const r = setup();
    // 2P の 足もとを 置き先 (4,10,6) の 中（足の 高さ 10）に する。1P は (2.5,9,6.5) から +x を 見る
    r.s2.position = { x: 4.5, y: 10, z: 6.5 };
    r.step(1);
    expect(r.dig1.target()?.place).toEqual({ x: 4, y: 10, z: 6 });
    r.press(r.a1, 'secondary');
    r.step(1);
    r.release(r.a1, 'secondary');
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    expect(r.inv1.count('dirt')).toBe(5);
  });
  it('2P が 置こうと した マスに 1P の 体が あれば 置けない', () => {
    const r = setup();
    r.s2.position = { x: 1.5, y: 9, z: 6.5 };
    r.s1.position = { x: 4.5, y: 10, z: 6.5 };
    r.step(1);
    expect(r.dig2.target()?.place).toEqual({ x: 4, y: 10, z: 6 });
    r.press(r.a2, 'secondary');
    r.step(1);
    r.release(r.a2, 'secondary');
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    expect(r.p2.inventory.count('dirt')).toBe(5);
  });
  it('仲間が はなれていれば ふつうに 置ける（対照）', () => {
    const r = setup();
    r.press(r.a1, 'secondary');
    r.step(1);
    r.release(r.a1, 'secondary');
    expect(r.world.getBlock(4, 10, 6)).toBe('dirt');
    expect(r.inv1.count('dirt')).toBe(4);
  });
});

describe('AC95（AC15 の 4c の 形）: 2P が かまどを ねらって ZL・たんすを ねらって Y か ZL で 2P の 画面が 開く。ブロックは 置かない', () => {
  type Pos = [number, number, number];
  function setup2(blockId: BlockId, o: { withOpeners?: boolean } = {}) {
    const withOpeners = o.withOpeners ?? true;
    const world = new FakeWorld();
    world.setBlock(5, 10, 6, blockId);
    const a2 = new ActionState();
    const p2 = new P2State();
    p2.inventory.setSlot(0, { item: 'dirt', count: 5 });
    const s2 = stateAt(3.5, 6.5);
    const calls = { m4Furnace: 0, m4Tansu: 0 };
    const opened = { furnace: [] as Pos[], tansu: [] as Pos[] };
    const dig = createP2Dig({
      world,
      p2,
      actions: a2,
      position: () => s2,
      lock,
      eyeHeight: () => EYE,
      partner: () => null,
      ...(withOpeners
        ? {
            onOpenFurnace: (x: number, y: number, z: number) => void opened.furnace.push([x, y, z]),
            onOpenTansu: (x: number, y: number, z: number) => void opened.tansu.push([x, y, z]),
          }
        : {}),
      m4: {
        craft: { isFurnace: (x: number, y: number, z: number) => world.getBlock(x, y, z) === 'furnace', openFurnace: () => void calls.m4Furnace++, furnaceBroken: () => {}, fixedDrop: () => null },
        storage: { isTansu: (x: number, y: number, z: number) => world.getBlock(x, y, z) === 'tansu', open: () => (calls.m4Tansu++, true), placed: () => {}, broken: () => 0 },
      },
    });
    const press = () => {
      dig.update();
      a2.endFrame();
      a2.press('secondary' as Action);
      for (let i = 0; i < 3; i++) {
        dig.update();
        a2.endFrame();
      }
      a2.release('secondary' as Action);
      dig.update();
      a2.endFrame();
    };
    const aim = () => {
      dig.update();
      a2.endFrame();
    };
    return { world, p2, calls, opened, press, aim, dig };
  }
  const noBlockPlaced = (r: ReturnType<typeof setup2>) => {
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    expect(r.world.getBlock(5, 11, 6)).toBe('air');
    expect(r.p2.inventory.count('dirt')).toBe(5);
  };

  it('かまど: ZL で onOpenFurnace が (5,10,6) で 1 回。ブロックは 置かない。たんすの 口は 呼ばない', () => {
    const r = setup2('furnace');
    r.press();
    expect(r.dig.target()?.block).toEqual({ x: 5, y: 10, z: 6 });
    expect(r.opened.furnace).toEqual([[5, 10, 6]]);
    expect(r.opened.tansu).toEqual([]);
    noBlockPlaced(r);
  });
  it('たんす: ZL で onOpenTansu が (5,10,6) で 1 回。ブロックは 置かない。かまどの 口は 呼ばない', () => {
    const r = setup2('tansu');
    r.press();
    expect(r.opened.tansu).toEqual([[5, 10, 6]]);
    expect(r.opened.furnace).toEqual([]);
    noBlockPlaced(r);
  });
  it('たんす: Y（toggleInventory = tryOpenAimedStorage）でも 開く。true を 返し onOpenTansu が 1 回。ブロックは 置かない', () => {
    const r = setup2('tansu');
    r.aim();
    expect(r.dig.tryOpenAimedStorage()).toBe(true);
    expect(r.opened.tansu).toEqual([[5, 10, 6]]);
    expect(r.opened.furnace).toEqual([]);
    noBlockPlaced(r);
  });
  it('かまどを ねらった Y は「やく」を 開かない（false・口は 呼ばない。「もちもの」の ページは 配線が 開く）', () => {
    const r = setup2('furnace');
    r.aim();
    expect(r.dig.tryOpenAimedStorage()).toBe(false);
    expect(r.opened).toEqual({ furnace: [], tansu: [] });
  });
  it('何も ねらって いない Y は false（口は 呼ばない）', () => {
    const r = setup2('dirt');
    r.aim();
    expect(r.dig.tryOpenAimedStorage()).toBe(false);
    expect(r.opened).toEqual({ furnace: [], tansu: [] });
  });
  it.each(['furnace', 'tansu'] as const)('%s: 1P 用の m4 の 開く 口（craft.openFurnace・storage.open）は 2P から 呼ばない', (id) => {
    const r = setup2(id);
    r.aim();
    r.dig.tryOpenAimedStorage();
    r.press();
    expect(r.calls).toEqual({ m4Furnace: 0, m4Tansu: 0 });
  });
  it.each(['furnace', 'tansu'] as const)('%s: onOpenFurnace・onOpenTansu を 渡さない 2P は 何も 開かず、ブロックも 置かない（3a の まま。Y も false）', (id) => {
    const r = setup2(id, { withOpeners: false });
    r.press();
    expect(r.dig.tryOpenAimedStorage()).toBe(false);
    expect(r.calls).toEqual({ m4Furnace: 0, m4Tansu: 0 });
    expect(r.dig.target()?.block).toEqual({ x: 5, y: 10, z: 6 });
    noBlockPlaced(r);
  });
  it('たんすは ports(m4.storage) を 渡さなくても 置かない（block id で 見る）', () => {
    const world = new FakeWorld();
    world.setBlock(5, 10, 6, 'tansu');
    const a2 = new ActionState();
    const p2 = new P2State();
    p2.inventory.setSlot(0, { item: 'dirt', count: 5 });
    const s2 = stateAt(3.5, 6.5);
    const dig = createP2Dig({ world, p2, actions: a2, position: () => s2, lock, eyeHeight: () => EYE, partner: () => null });
    dig.update();
    a2.endFrame();
    a2.press('secondary' as Action);
    for (let i = 0; i < 3; i++) {
      dig.update();
      a2.endFrame();
    }
    expect(world.getBlock(4, 10, 6)).toBe('air');
    expect(p2.inventory.count('dirt')).toBe(5);
  });
});

// ------------------------------------------------------------------ 2P の ふつうの こうげき

class WhoYokai extends FakeYokaiWorld {
  whos: Array<1 | 2 | undefined> = [];
  override damage(id: number, amount: number, from: Vec3, _knock?: unknown, _by?: unknown, who?: 1 | 2): void {
    super.damage(id, amount, from);
    this.whos.push(who);
  }
}

function punchRig(who: 1 | 2) {
  const world = new ArrayVoxelWorld({ x: 32, y: 24, z: 32 });
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) world.setBlock(x, 8, z, 'dirt');
  const actions = new ActionState();
  const p2 = new P2State();
  const inv = who === 2 ? p2.inventory : new InventoryImpl();
  inv.select(0);
  const controller = new PlayerController(world, actions, { consume: () => ({ dx: 0, dy: 0 }) }, lock, () => ({ x: P.x, y: P.y, z: P.z, yawDeg: 0, pitchDeg: -25 }));
  const raw = new WhoYokai();
  const yokai = bindWho(raw, who);
  const tools = { current: () => ({ item: null, kind: 'hand' as const, power: 1, level: 0, damage: 1, reach: 3.5, ticks: 30 }), step() {}, pushSwing() {}, swingWhiff() {}, onPunchStart() {}, punchParams: () => ({ damage: 1, reach: 3.5, ticks: 30 }) };
  const settings = settingsW3();
  const combat = new PlayerCombatImpl({
    world, player: { get: () => controller.state, set: (v) => controller.set(v) }, inventory: inv, yokai: () => yokai,
    spawn: () => ({ x: 1.5, y: 9, z: 1.5, yawDeg: 0, pitchDeg: 0 }), tool: tools, settings,
  });
  let tick = 0;
  const blade = createBladeSystem({ world, yokai: () => yokai, settings, weaponDamage: () => 4, onHit: () => {}, lunge: (dx, dz) => controller.lunge(dx, dz), tick: () => tick });
  const m4 = { tools, blade, w2: settings, yokai: () => yokai };
  const dig: DigSystemImpl =
    who === 2
      ? createP2Dig({ world, p2, actions, position: () => controller.state, lock, eyeHeight: () => EYE, partner: () => null, gate: combat, m4 })
      : new DigSystemImpl(world, () => controller.state, actions, lock, inv, () => EYE, createDigConfig(), undefined, combat, m4);
  controller.set({ pitchDeg: -25, yawDeg: 0, facingDeg: 90 });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      tick++;
      const bm = blade.motion();
      controller.motion.speedMul = bm.speedMul;
      controller.motion.jumpLocked = bm.jumpLocked;
      controller.motion.faceDeg = dig.attackFaceDeg();
      const use = dig.attackPreview().use;
      (controller.motion as { leftAims?: boolean }).leftAims = !(use === 'attack' || use === 'whiff');
      controller.update(1 / 60);
      dig.update();
      const f = dig.attackFaceDeg();
      if (f !== null) controller.set({ facingDeg: f });
      combat.update();
      actions.endFrame();
    }
  };
  step(2);
  return { raw, dig, actions, step, inv, world };
}

describe('2P の ふつうの こうげき: ZR で とどく 妖怪を たたくと damage が who=2 で 呼ばれ、うしろの ブロックは ほらない。1P は who=1', () => {
  for (const who of [2, 1] as const) {
    it(`${who}P: 東 2.0 の 妖怪を ZR/左クリックで たたく → damage の who = ${who}・ほった量 0・土は 持ち物に 入らない`, () => {
      const r = punchRig(who);
      const y = r.raw.add('karakasa', at(90, 2.0));
      r.actions.press('primary' as Action);
      let maxProgress = 0;
      for (let i = 0; i < 35; i++) {
        r.step();
        maxProgress = Math.max(maxProgress, r.dig.state().progress);
      }
      r.actions.release('primary' as Action);
      expect(r.raw.damaged.map((c) => c.id)).toEqual([y.id]);
      expect(r.raw.whos).toEqual([who]);
      expect(maxProgress).toBe(0);
      expect(r.inv.count('dirt')).toBe(0);
    });
  }
});

// 型の 使い道（未使用 import を 避ける）
export type _Vec3 = Vec3;

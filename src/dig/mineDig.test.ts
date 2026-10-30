import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BlockId, DigEvent, DigState, DigSystem, ItemId, LockStatus, PlayerState, TargetInfo, ToolInfo } from '../contracts';
import { createCraftConfig } from '../craft/config';
import { FX_SETTINGS } from '../fx/config';
import { DigFx } from '../fx/DigFx';
import { SoundFx } from '../fx/sound';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createToolConfig } from '../tools/config';
import { signalIconPixels } from '../ui/itemIcon';
import { m4ItemPixels } from '../ui/itemArtM4';
import { LogSystem } from '../ui/log/LogSystem';
import { createRng } from '../world/gen/random';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import type { DigToolPort } from './digPorts';
import { digTicksWith } from './toolFamily';

/**
 * MINE-1B（docs/design/MINE-1.md §4.4・§3.1・受け入れ基準 B1 の「掘ると 出る 物と 数」・B2・B3・B15 の ダイヤの 掘り方）。
 * 期待の 数は 仕様の 表を そのまま 書き写した もの。道具の 強さは 登録表〔木 2・石 4・てつ 6・きん 6・こんごう 8〕・すでは 1。
 *
 *   B2: 掘れる 道具。すで → ねんど ○・せっかいせき／ほたるいし／きんの いし／すいしょうの いし／ダイヤの いし ×。木の つるはし → ねんど ○・ほか ×。
 *       いしの つるはし → せっかいせき・ほたるいし ○・きん・すいしょう・ダイヤ ×。てつ・きんの つるはし → ぜんぶ ○。
 *       時間: せっかいせき〔いしの つるはし〕75・ほたるいし 90・きんの いし〔てつの つるはし〕150・すいしょうの いし 120・ダイヤの いし 180・こんごうの つるはしで ダイヤの いし 135
 *   B1: 掘ると 出る 物と 数。ねんど→ねんど `clay` 1〜3〔持てない ので アイテムは `clay`〕・せっかいせき 1〜3・しっくい いつも 1・ほたるいし 1〜2・
 *       きんの いし いつも 1・すいしょうの いし→すいしょう `crystal` 1・ダイヤの いし→ダイヤ `diamond` いつも 1
 *   B3: しらせ。きん・すいしょう・ダイヤの いしを てつより 弱い 道具で → 「てつの つるはし が いるよ」＋ てつの つるはしの 絵。
 *       せっかいせき・ほたるいしを 木の つるはし・すでで → 今の「つるはし が いるよ」〔いしの つるはしの 絵〕
 *
 * 道具・ログの つなぎは 本番と 同じ 部品〔DigSystemImpl・DigFx・LogSystem・signalIconPixels〕。合図の 種類の 名前は 決め打ちしない
 * （DigFx が notice に わたした 種類を そのまま LogSystem・signalIconPixels に わたして 確かめる）。
 */

const TOOLS = createToolConfig();
const DIG = createDigConfig();
const CRAFT = createCraftConfig();

/** 型には まだ ない id を 文字で 読む（赤の 間も 型が 通る ように） */
const B = (id: string): BlockId => id as BlockId;
const I = (id: string): ItemId => id as ItemId;

// ------------------------------------------------------------------ B2: 掘れる 道具・時間（式の 表）

describe('B2: 掘れる 道具と 時間（digTicksWith。ステップ。60 ＝ 1 秒。ほれない ＝ null）', () => {
  const COLS: ReadonlyArray<ItemId | null> = [null, 'wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'kin_pickaxe', I('kongo_pickaxe')];
  const X = null;
  // 行 = [ブロック, すで, きの つるはし, いしの つるはし, てつの つるはし, きんの つるはし, こんごうの つるはし]
  const ROWS: ReadonlyArray<[string, ReadonlyArray<number | null>]> = [
    ['nendo', [60, 60, 30, 20, 10, 8]], // つちの なかま。つるはし〔いし〕は 半分の 強さ。きん・こんごうの つるはしは なかまを 持たない ので そのままの 強さ
    ['sekkaiseki', [X, X, 75, 50, 50, 38]],
    ['shikkui', [240, 120, 60, 40, 40, 30]],
    ['hotaruishi', [X, X, 90, 60, 60, 45]],
    ['kin_ore', [X, X, X, 150, 150, 113]],
    ['suisho_ore', [X, X, X, 120, 120, 90]],
    ['diamond_ore', [X, X, X, 180, 180, 135]],
    ['chalk_mark', [1, 1, 1, 1, 1, 1]],
  ];

  it('8 ブロック × 6 道具が 仕様の 表と 同じ（仕様の 数: 75・90・150・120・180・135）', () => {
    const bad: string[] = [];
    for (const [block, nums] of ROWS) {
      expect(nums).toHaveLength(COLS.length);
      COLS.forEach((tool, c) => {
        const got = digTicksWith(DIG, TOOLS, B(block), tool);
        if (got !== nums[c]) bad.push(`${block} × ${tool ?? 'すで'}: ${got} ステップ（${nums[c]} の はず）`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('くわは ねんどに あう〔つちの なかま〕: 15 ステップ', () => {
    expect(digTicksWith(DIG, TOOLS, B('nendo'), 'kuwa')).toBe(15);
  });

  it('てつの つるはしで 掘れる いちばん 上の 段階は 今の まま 2（てつ・きん・こんごうの つるはし。こんごうの つるはしの レベルは 2 の まま）', () => {
    for (const item of ['iron_pickaxe', 'kin_pickaxe', 'kongo_pickaxe']) expect(TOOLS.toolLevel[I(item)], item).toBe(2);
    for (const id of ['kin_ore', 'suisho_ore', 'diamond_ore']) expect(DIG.harvestLevel[B(id)], id).toBe(2);
  });
});

// ------------------------------------------------------------------ DigSystemImpl を 本番と 同じ つなぎで 動かす

function rig(held: ItemId | null, block: BlockId | null, o: { seed?: number } = {}) {
  const blocks = new Map<string, BlockId>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const world = {
    size: { x: 64, y: 32, z: 64 },
    getBlock: (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64 ? 'outside' : (blocks.get(key(x, y, z)) ?? 'air')),
    setBlock: (x: number, y: number, z: number, id: BlockId) => (blocks.set(key(x, y, z), id), true),
    isSolid: (x: number, y: number, z: number) => {
      const b = blocks.get(key(x, y, z));
      return !!b && b !== 'air' && b !== 'water';
    },
  };
  if (block) blocks.set(key(5, 10, 6), block);
  const player: PlayerState = {
    position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: 0,
    onGround: true, inWater: false, moving: false, facingDeg: 0, running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  if (held) inv.setSlot(0, { item: held, count: 1 });
  inv.select(0);
  // 持ち物の 道具の 強さ・レベル（ToolSystem と 同じく 登録表から。道具でなければ すで）
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
  const craft = {
    isFurnace: () => false,
    openFurnace: () => undefined,
    furnaceBroken: () => undefined,
    fixedDrop: (id: BlockId) => CRAFT.fixedDrop[id] ?? null,
  };
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), createRng(o.seed ?? 1), null, { tools, craft: craft as never });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      dig.update();
      actions.endFrame();
    }
  };
  step(2); // ねらいを 決める
  return { dig, inv, world, actions, step, held, at: () => world.getBlock(5, 10, 6) };
}
type Rig = ReturnType<typeof rig>;

/** 押しつづけて ひびが MAX〔ready〕に なるまでの ステップ数（上限 max で -1）。ブロックは まだ こわれない */
function readyAt(r: Rig, max = 2000): number {
  r.actions.press('primary');
  for (let i = 1; i <= max; i++) {
    r.step();
    if (r.dig.state().ready) return i;
  }
  return -1;
}

/** ready の あと はなして 押しなおして こわす。こわれたか */
function finish(r: Rig): boolean {
  r.actions.release('primary');
  r.step();
  r.actions.press('primary');
  r.step(2);
  r.actions.release('primary');
  r.step();
  return r.at() === 'air';
}

/** 持ち物の 中身を { item: 数 } で（手に 道具を 持って いる ときは、その マス〔0 番〕は のぞく。すでの ときは 0 番も 数える） */
function bag(r: Rig): Record<string, number> {
  const out: Record<string, number> = {};
  r.inv.slots().forEach((s, i) => {
    if (s && !(i === 0 && r.held)) out[s.item] = (out[s.item] ?? 0) + s.count;
  });
  return out;
}

describe('B2・B15: DigSystem が 本番と 同じ 時間で 掘る（式の 表と 同じ ステップ数で ひびが MAX）', () => {
  const CASES: ReadonlyArray<[ItemId | null, string, number]> = [
    ['stone_pickaxe', 'sekkaiseki', 75],
    ['stone_pickaxe', 'hotaruishi', 90],
    ['iron_pickaxe', 'kin_ore', 150],
    ['iron_pickaxe', 'suisho_ore', 120],
    ['iron_pickaxe', 'diamond_ore', 180],
    [I('kongo_pickaxe'), 'diamond_ore', 135],
    ['kin_pickaxe', 'diamond_ore', 180],
    [null, 'nendo', 60],
  ];
  for (const [tool, block, steps] of CASES) {
    it(`${tool ?? 'すで'} で ${block}: ${steps} ステップ〔${steps - 1} は まだ〕`, () => {
      const r = rig(tool, B(block));
      expect(r.at(), `${block} が ある`).toBe(block);
      expect(readyAt(r)).toBe(steps);
      expect(r.dig.state().blockedReason).toBeNull();
    });
  }

  it('ダイヤの いしは てつの つるはしで 180 ステップで こわれ、持ち物に diamond 1 だけ（ダイヤの いし 自体は 入らない）', () => {
    const r = rig('iron_pickaxe', B('diamond_ore'));
    expect(readyAt(r)).toBe(180);
    expect(finish(r), 'こわれた').toBe(true);
    expect(bag(r)).toEqual({ diamond: 1 });
  });

  it('掘れない 道具: 木の つるはし・すでは せっかいせき・ほたるいしを 掘れない。いしの つるはしは きん・すいしょう・ダイヤを 掘れない（ひびが 進まず、こわれない）', () => {
    const NO: ReadonlyArray<[ItemId | null, string]> = [
      [null, 'sekkaiseki'], [null, 'hotaruishi'], [null, 'kin_ore'], [null, 'suisho_ore'], [null, 'diamond_ore'],
      ['wood_pickaxe', 'sekkaiseki'], ['wood_pickaxe', 'hotaruishi'], ['wood_pickaxe', 'kin_ore'], ['wood_pickaxe', 'suisho_ore'], ['wood_pickaxe', 'diamond_ore'],
      ['stone_pickaxe', 'kin_ore'], ['stone_pickaxe', 'suisho_ore'], ['stone_pickaxe', 'diamond_ore'],
    ];
    for (const [tool, block] of NO) {
      const r = rig(tool, B(block));
      expect(readyAt(r, 1200), `${tool ?? 'すで'} × ${block}`).toBe(-1);
      expect(r.dig.state().blockedReason, `${tool ?? 'すで'} × ${block}`).not.toBeNull();
      expect(r.dig.state().progress).toBe(0);
      expect(r.at()).toBe(block);
      expect(bag(r)[block] ?? 0).toBe(0);
    }
  });

  it('掘れる 道具: すでと 木の つるはしは ねんど・しっくい。てつ・きんの つるはしは ぜんぶ', () => {
    for (const [tool, block] of [[null, 'nendo'], ['wood_pickaxe', 'nendo'], [null, 'shikkui'], ['iron_pickaxe', 'sekkaiseki'], ['iron_pickaxe', 'hotaruishi'], ['kin_pickaxe', 'kin_ore'], ['kin_pickaxe', 'suisho_ore']] as const) {
      const r = rig(tool, B(block));
      expect(readyAt(r), `${tool ?? 'すで'} × ${block}`).toBeGreaterThan(0);
      expect(r.dig.state().blockedReason).toBeNull();
    }
  });
});

// ------------------------------------------------------------------ B1: 掘ると 出る 物と 数

describe('B1: 掘ると 手に 入る 物と 数（めずらしさの きまり。いつも 1 は 決まった 数）', () => {
  /** 同じ ブロックを シードを かえて N 回 掘って、持ち物の 中身を 集める */
  function harvest(block: string, tool: ItemId | null, trials = 80): Array<Record<string, number>> {
    const out: Array<Record<string, number>> = [];
    for (let seed = 1; seed <= trials; seed++) {
      const r = rig(tool, B(block), { seed });
      expect(readyAt(r), `${block} の ひびが MAX`).toBeGreaterThan(0);
      expect(finish(r), `${block} が こわれた`).toBe(true);
      out.push(bag(r));
    }
    return out;
  }
  const only = (bags: Array<Record<string, number>>, item: string): number[] => {
    for (const b of bags) expect(Object.keys(b), JSON.stringify(b)).toEqual([item]); // ほかの 物は 出ない
    return bags.map((b) => b[item]!);
  };
  const range = (n: number[]) => [...new Set(n)].sort((a, b) => a - b);

  it('ねんど → ねんど clay 1〜3（3 つとも 出る）。ブロックの ねんど 自体は 持てない', () => {
    expect(range(only(harvest('nendo', null), 'clay'))).toEqual([1, 2, 3]);
  });
  it('せっかいせき → じぶん 1〜3', () => {
    expect(range(only(harvest('sekkaiseki', 'stone_pickaxe'), 'sekkaiseki'))).toEqual([1, 2, 3]);
  });
  it('ほたるいし → じぶん 1〜2', () => {
    expect(range(only(harvest('hotaruishi', 'stone_pickaxe'), 'hotaruishi'))).toEqual([1, 2]);
  });
  it('しっくい → じぶん いつも 1（作った ブロック。かわら と 同じ）', () => {
    expect(range(only(harvest('shikkui', null), 'shikkui'))).toEqual([1]);
  });
  it('きんの いし → じぶん いつも 1', () => {
    expect(range(only(harvest('kin_ore', 'iron_pickaxe'), 'kin_ore'))).toEqual([1]);
  });
  it('すいしょうの いし → すいしょう crystal 1（すいしょうの いし 自体は 持てない）', () => {
    expect(range(only(harvest('suisho_ore', 'iron_pickaxe'), 'crystal'))).toEqual([1]);
  });
  it('ダイヤの いし → ダイヤ diamond いつも 1（ダイヤの いし 自体は 持てない）', () => {
    expect(range(only(harvest('diamond_ore', 'iron_pickaxe'), 'diamond'))).toEqual([1]);
  });
});

// ------------------------------------------------------------------ B3: しらせ

/** 合図の 呼び出し〔notice.showSignal に わたされた もの。合図の 種類が 先頭。あとに 何か 足されても そのまま 運ぶ〕 */
type Call = unknown[];

/** DigFx に 実際の 出来事を わたして、notice に 出た 合図の 呼び出しを 集める */
function signalsFor(held: ItemId | null, block: string): { kinds: Call[]; events: DigEvent[] } {
  const r = rig(held, B(block));
  r.actions.press('primary');
  r.step(3);
  const events = r.dig.drainEvents().filter((e) => e.type === 'blocked');
  const fake: DigSystem = {
    target: (): TargetInfo | null => null,
    state: (): DigState => ({ active: false, block: null, progress: 0, crackStage: 0, ready: false, blockedReason: null }),
    drainEvents: () => events,
    peekEvents: () => events,
  };
  const kinds: Call[] = [];
  const sound = new SoundFx(() => null, { ...FX_SETTINGS });
  sound.play = () => undefined;
  const fx = new DigFx({
    scene: new THREE.Scene(),
    dig: fake,
    sound,
    doll: { swing: () => undefined, setDigging: () => undefined },
    view: { setShake: () => undefined },
    notice: {
      showSignal: (...a: unknown[]) => {
        while (a.length > 1 && a[a.length - 1] === undefined) a.pop();
        kinds.push(a);
      },
    },
    settings: { ...FX_SETTINGS },
  });
  fx.update(1 / 60);
  return { kinds, events };
}

/** 本番と 同じ つなぎ: notice の 合図 → LogSystem.signal〔ログの 文と 絵〕 */
function logOf(call: Call) {
  const log = new LogSystem();
  (log as unknown as { signal: (...a: unknown[]) => void }).signal(...call);
  return log.history()[0]!;
}
/** 本番と 同じ つなぎ: notice の 合図 → 照準の 下の 絵 */
function iconOf(call: Call): ReadonlyArray<readonly number[]> {
  return (signalIconPixels as unknown as (...a: unknown[]) => ReadonlyArray<readonly number[]>)(...call);
}

/** 2 つの 絵が ちがう マスの うち、a に 近い 割合（✕ の しるしが のっても 大きく かわらない ように ちがう マスだけで くらべる） */
function closerTo(sig: ReadonlyArray<readonly number[]>, a: ReadonlyArray<readonly number[]>, b: ReadonlyArray<readonly number[]>): { a: number; b: number } {
  let diff = 0;
  let nearA = 0;
  let nearB = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.join() === b[i]!.join()) continue;
    diff++;
    if (sig[i]!.join() === a[i]!.join()) nearA++;
    if (sig[i]!.join() === b[i]!.join()) nearB++;
  }
  return { a: nearA / diff, b: nearB / diff };
}

describe('B3: しらせ（ログと 絵）', () => {
  it('きん・すいしょう・ダイヤの いしを てつより 弱い 道具で → 「てつの つるはし が いるよ」＋ てつの つるはしの 絵（ログの 絵も てつの つるはし）', () => {
    for (const block of ['kin_ore', 'suisho_ore', 'diamond_ore']) {
      for (const tool of ['stone_pickaxe', null, 'wood_pickaxe'] as const) {
        const { kinds } = signalsFor(tool, block);
        const where = `${tool ?? 'すで'} × ${block}`;
        expect(kinds, `${where}: 合図が 1 回`).toHaveLength(1);
        const call = kinds[0]!;
        expect(call, `${where}: 今の「つるはし が いるよ」とは ちがう 合図`).not.toEqual(['needTool']);
        // ログ（履歴）の 文と 絵
        const e = logOf(call);
        expect(e.kind).toBe('signal');
        expect(e.text, `${where}: ログの 文`).toBe('てつの つるはし が いるよ');
        expect(e.item, `${where}: ログの 絵`).toBe('iron_pickaxe');
        // 照準の 下の 合図の 絵は てつの つるはし（いしの つるはしの 絵より てつの つるはしの 絵に 近い）
        const near = closerTo(iconOf(call), m4ItemPixels('iron_pickaxe'), m4ItemPixels('stone_pickaxe'));
        expect(near.a, `${where}: てつの つるはしの 絵に 近い 割合`).toBeGreaterThan(0.6);
        expect(near.a).toBeGreaterThan(near.b);
      }
    }
  });

  it('せっかいせき・ほたるいしを 木の つるはし・すでで → 今の「つるはし が いるよ」（いしの つるはしの 絵）のまま', () => {
    for (const block of ['sekkaiseki', 'hotaruishi']) {
      for (const tool of ['wood_pickaxe', null] as const) {
        const { kinds } = signalsFor(tool, block);
        const where = `${tool ?? 'すで'} × ${block}`;
        expect(kinds, where).toEqual([['needTool']]);
        const e = logOf(['needTool']);
        expect(e.text).toBe('つるはし が いるよ');
        expect(e.item).toBe('stone_pickaxe');
        const near = closerTo(iconOf(['needTool']), m4ItemPixels('stone_pickaxe'), m4ItemPixels('iron_pickaxe'));
        expect(near.a, where).toBeGreaterThan(near.b);
      }
    }
  });

  it('てつの 鉱石を すで・木の つるはしで → 今のまま「つるはし が いるよ」（1B で かえない）', () => {
    for (const tool of ['wood_pickaxe', null] as const) expect(signalsFor(tool, 'iron_ore').kinds, tool ?? 'すで').toEqual([['needTool']]);
  });

  it('掘れる 道具なら 合図は 出ない（てつの つるはしで きんの いし・いしの つるはしで せっかいせき）', () => {
    expect(signalsFor('iron_pickaxe', 'kin_ore').kinds).toEqual([]);
    expect(signalsFor('stone_pickaxe', 'sekkaiseki').kinds).toEqual([]);
  });
});

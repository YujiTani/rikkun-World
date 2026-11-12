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
import { LogSystem } from '../ui/log/LogSystem';
import { YokaiStone } from '../yokai/ai/stone';
import { createRng } from '../world/gen/random';
import { SEEDS_20 } from '../world/gen/mineShaftKit';
import { hookF, needYakataHook, tableOf, LOOKS } from '../world/gen/mineYakataKit';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import type { DigToolPort } from './digPorts';

/**
 * MINE-1F F4〔こわせない〕（docs/design/MINE-1F.md §4.3・§4.6・§6.2 F4）。
 *   やかたの ブロックと ふさいだ かべは、まだ・挑戦の 間は すで・てつの つるはしで 600 ステップ ほっても こわれず ログ「いまは ほれない よ」。
 *   ぬりかべの たおれこみでも こわれない。自分で 置いた ブロックは ふつうに こわれる。かった あとは §4.6 の 固さ 3・いしの つるはしから・じぶん 1。
 * 【テスト側の 読み】つなぎ方は 仕様に ない ので kit の 冒頭の とおり:
 *   ・`DigSystemImpl` の m4 に `yakata: { locked(x, y, z): boolean }`〔= `hook.yakataLocked`〕。ロック中は ひびが 進まず `blockedReason` が 'yakata'・`blocked` の できごと〔reason 'yakata'〕。
 *   ・DigFx は reason 'yakata' で `notice.showSignal('yakataLocked')`・`LogSystem.signal('yakataLocked')` の 文は「いまは ほれない よ」。
 *   ・ぬりかべの たおれこみ: `YokaiStone` の opts に `protectAt(x, y, z): boolean`〔= `hook.yakataLocked`〕。 true の マスは こわさない。
 * 時間〔ms〕では 合否を きめない。
 */

const CRAFT = createCraftConfig();
const TOOLS = createToolConfig();
const DIG = createDigConfig();
const I = (id: string): ItemId => id as ItemId;
const norm = (s: string): string => s.replace(/\s+/g, '');
const SEED = SEEDS_20[0]!;

function rig(held: ItemId | null, block: BlockId | null, o: { seed?: number; yakata?: { locked: (x: number, y: number, z: number) => boolean } } = {}) {
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
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), createRng(o.seed ?? 1), null, { tools, craft: craft as never, yakata: o.yakata } as never);
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

/** 600 ステップ ほりつづける〔押しっぱなし → ひびが MAX → 押しなおし を くりかえす〕。こわれたか */
function dugThrough(r: Rig, steps = 600): boolean {
  r.actions.press('primary');
  for (let i = 0; i < steps; i++) {
    r.step();
    if (r.dig.state().ready) {
      // MAX で とまって いる: はなして 押しなおした 瞬間だけ こわれる
      r.actions.release('primary');
      r.step();
      r.actions.press('primary');
      r.step(2);
      if (r.at() === 'air') {
        r.actions.release('primary');
        return true;
      }
    }
    if (r.at() === 'air') return true;
  }
  r.actions.release('primary');
  return false;
}

const kabeIds = (): { A: string; B: string } => {
  const lb = tableOf(SEED).lookBlocks;
  return { A: lb.maou.kabe, B: lb.otera.kabe };
};
const partIds = (look: 'maou' | 'otera'): string[] => {
  const b = tableOf(SEED).lookBlocks[look];
  return [b.kabe, b.yuka, b.dan, b.taimatsu];
};

describe('F4: ロックの 間は こわれない', () => {
  for (const look of LOOKS) {
    for (const [pi, id] of partIds(look).entries()) {
      for (const tool of [null, 'iron_pickaxe'] as const) {
        it(`${look} の ${['かべ', 'ゆか', 'だん', 'たいまつ'][pi]}: ${tool ?? 'すで'} で 600 ステップ ほっても こわれない・blockedReason は yakata・blocked の できごと`, () => {
          const r = rig(tool ? I(tool) : null, id as BlockId, { yakata: { locked: () => true } });
          expect(r.at(), '置いた').toBe(id);
          expect(dugThrough(r), 'こわれた').toBe(false);
          expect(r.at()).toBe(id);
          expect(r.dig.state().blockedReason).toBe('yakata');
          const ev = r.dig.drainEvents().filter((e: DigEvent) => e.type === 'blocked');
          expect(ev.length).toBeGreaterThan(0);
          expect(ev.every((e) => (e as { reason?: string }).reason === 'yakata')).toBe(true);
        });
      }
    }
  }

  it('自分で 置いた ブロック〔ロックの 外〕は ふつうに こわれる', () => {
    const r = rig(I('iron_pickaxe'), 'dirt' as BlockId, { yakata: { locked: (x) => x !== 5 } });
    expect(dugThrough(r, 1200), 'こわれた').toBe(true);
  });

  it('かった あと〔ロックなし〕: 8 つ とも ほると じぶん 1〔かべ・ゆか・だんは 固さ 3・いしの つるはし・すでは ほれない／たいまつは すでで すぐ〕', () => {
    for (const look of LOOKS) {
      for (const [pi, id] of partIds(look).entries()) {
        const torch = pi === 3;
        if (!torch) {
          expect(DIG.hardness[id as BlockId], `${id} の 固さ`).toBe(3);
          const bare = rig(null, id as BlockId, { yakata: { locked: () => false } });
          expect(dugThrough(bare, 900), `${id}: すでは ほれない`).toBe(false);
        }
        const r = rig(torch ? null : I('stone_pickaxe'), id as BlockId, { yakata: { locked: () => false } });
        expect(dugThrough(r, 1200), `${id} が こわれた`).toBe(true);
        const got: Record<string, number> = {};
        r.inv.slots().forEach((s, i) => {
          if (s && (torch || i !== 0)) got[s.item] = (got[s.item] ?? 0) + s.count;
        });
        expect(got, `${id} は じぶん 1`).toEqual({ [id]: 1 });
      }
    }
  });
});

describe('F4: ログ「いまは ほれない よ」', () => {
  it('DigFx は reason yakata で showSignal・LogSystem.signal の 文が 「いまは ほれない よ」', () => {
    const calls: unknown[][] = [];
    const ev: DigEvent = { type: 'blocked', tick: 1, block: { x: 1, y: 1, z: 1 }, id: 'x' as BlockId, reason: 'yakata' } as never;
    const fake: DigSystem = {
      target: (): TargetInfo | null => null,
      state: (): DigState => ({ active: false, block: null, progress: 0, crackStage: 0, ready: false, blockedReason: null }),
      drainEvents: () => [ev],
      peekEvents: () => [ev],
    };
    const sound = new SoundFx(() => null, { ...FX_SETTINGS });
    sound.play = () => undefined;
    const fx = new DigFx({
      scene: new THREE.Scene(),
      dig: fake,
      sound,
      doll: { swing: () => undefined, setDigging: () => undefined },
      view: { setShake: () => undefined },
      notice: { showSignal: (...a: unknown[]) => void calls.push(a) },
      settings: { ...FX_SETTINGS },
    } as never);
    fx.update(1 / 60);
    expect(calls.length, 'showSignal が よばれた').toBeGreaterThan(0);
    const log = new LogSystem();
    (log as unknown as { signal: (...a: unknown[]) => void }).signal(...calls[0]!);
    expect(norm(log.history()[0]?.text ?? '')).toContain(norm('いまは ほれない よ'));
  });
});

describe('F4: ぬりかべの たおれこみでも こわれない', () => {
  const cells: [number, number, number][] = [];
  for (let x = 6; x <= 15; x++) for (let y = 8; y <= 11; y++) for (let z = 4; z <= 15; z++) cells.push([x, y, z]);
  const run = (id: string, protect: boolean): { left: number; total: number } => {
    const blocks = new Map<string, string>();
    for (const [x, y, z] of cells) blocks.set(`${x},${y},${z}`, id);
    const world = {
      getBlock: (x: number, y: number, z: number) => blocks.get(`${x},${y},${z}`) ?? 'air',
      setBlock: (x: number, y: number, z: number, b: string) => (b === 'air' ? blocks.delete(`${x},${y},${z}`) : blocks.set(`${x},${y},${z}`, b), true),
    };
    const stone = new YokaiStone({ world: world as never, reward: { defeat: () => undefined } as never, opts: { onBlocks: () => undefined, protectAt: protect ? () => true : undefined } as never });
    stone.crush({ x: 10.5, y: 10, z: 10.5, yaw: 0 } as never);
    return { left: blocks.size, total: cells.length };
  };
  it('たしかめ: 守りが ない ふつうの いしは こわれる〔この 配置で たおれこみが 効く〕', () => {
    const r = run('stone', false);
    expect(r.left).toBeLessThan(r.total);
  });
  for (const look of LOOKS) {
    it(`${look}: ロックの マスは こわれない〔protectAt〕`, () => {
      needYakataHook(hookF(SEED), ['yakataLocked']);
      const id = look === 'maou' ? kabeIds().A : kabeIds().B;
      const r = run(id, true);
      expect(r.left).toBe(r.total);
    });
  }
});
